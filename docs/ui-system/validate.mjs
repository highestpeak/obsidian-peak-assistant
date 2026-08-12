import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import cytoscape from "cytoscape";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "..");
const root = path.resolve(docs, "..");
const files = {
  rulesHtml: path.join(docs, "design-system.html"),
  labHtml: path.join(docs, "design-system-playground.html"),
  inventoryHtml: path.join(docs, "ui-inventory.html"),
  composerThemeSpec: path.join(docs, "superpowers/specs/2026-08-12-composer-markdown-theme-customization.md"),
  themeCss: path.join(here, "theme.css"),
  hostCompatCss: path.join(here, "host-compat.css"),
  rulesCss: path.join(here, "design-system.css"),
  labCss: path.join(here, "theme-playground.css"),
  inventoryCss: path.join(here, "ui-catalog.css"),
  productionCss: path.join(root, "styles.css"),
  themePacks: path.join(here, "theme-packs.js"),
  themeRuntime: path.join(here, "theme-runtime.js"),
  graphRuntime: path.join(here, "theme-graph.js"),
  labRuntime: path.join(here, "theme-playground.js"),
  themeConceptManifest: path.join(here, "theme-concepts/manifest.json"),
  manifest: path.join(here, "catalog-manifest.js"),
  inventoryRuntime: path.join(here, "catalog-runtime.js"),
  evidenceManifest: path.join(here, "evidence/recording-2026-08-10/manifest.json")
};

const errors = [];
const checks = [];
const read = (file) => fs.readFileSync(file, "utf8");
const assert = (condition, message) => {
  if (condition) checks.push(message);
  else errors.push(message);
};

function relativeLuminance(hex) {
  const channels = String(hex).slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(a, b) {
  const aa = relativeLuminance(a);
  const bb = relativeLuminance(b);
  return (Math.max(aa, bb) + 0.05) / (Math.min(aa, bb) + 0.05);
}

function compositeRgbaOver(rgba, background) {
  const channels = String(rgba).match(/[\d.]+/g).map(Number);
  const base = String(background).slice(1).match(/../g).map((value) => parseInt(value, 16));
  const alpha = channels[3];
  const mixed = base.map((value, index) => Math.round(channels[index] * alpha + value * (1 - alpha)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

Object.entries(files).forEach(([label, file]) => assert(fs.existsSync(file), `${label}: ${path.relative(root, file)} exists`));
if (errors.length) finish();

const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

function loadGlobal(file, key) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(file), sandbox, { filename: file });
  return sandbox.window[key];
}

function loadThemeRuntime() {
  const style = { colorScheme: "", setProperty() {} };
  const document = {
    readyState: "loading",
    documentElement: { dataset: {}, style },
    body: { dataset: {}, classList: { toggle() {} } },
    addEventListener() {},
    dispatchEvent() {},
    querySelectorAll() { return []; }
  };
  const storage = new Map();
  const window = {
    PeakThemeSystem: themeSystem,
    location: { search: "" },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    addEventListener() {}
  };
  const sandbox = {
    window,
    document,
    URLSearchParams,
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options && options.detail; }
    }
  };
  vm.runInNewContext(read(files.themeRuntime), sandbox, { filename: files.themeRuntime });
  return window.PeakThemeRuntime;
}

const themeSystem = loadGlobal(files.themePacks, "PeakThemeSystem");
const catalog = loadGlobal(files.manifest, "PeakUICatalog");
const evidenceManifest = JSON.parse(sources.evidenceManifest);
const themeConceptManifest = JSON.parse(sources.themeConceptManifest);

function attributes(node) {
  return Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
}

function walk(node, visitor) {
  visitor(node, attributes(node));
  (node.childNodes || []).forEach((child) => walk(child, visitor));
  if (node.content) walk(node.content, visitor);
}

function inspectHtml(source, label) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const result = { ids: new Map(), hrefs: [], srcs: [], roots: 0, iframes: 0, themeControls: [] };
  walk(document, (node, attrs) => {
    const classes = (attrs.class || "").split(/\s+/);
    if (node.tagName === "iframe") result.iframes += 1;
    if (classes.includes("peak-design-root") && classes.includes("pktw-root")) result.roots += 1;
    if (attrs.id) result.ids.set(attrs.id, (result.ids.get(attrs.id) || 0) + 1);
    if (attrs.href) result.hrefs.push(attrs.href);
    if (attrs.src) result.srcs.push(attrs.src);
    if (attrs["data-theme-control"]) result.themeControls.push(attrs["data-theme-control"]);
  });
  result.ids.forEach((count, id) => assert(count === 1, `${label}: unique #${id}`));
  assert(result.iframes === 0, `${label}: no iframe`);
  assert(result.roots === 1, `${label}: exactly one autonomous root`);
  return result;
}

const documents = [
  { label: "Design System", file: files.rulesHtml, source: sources.rulesHtml, doc: inspectHtml(sources.rulesHtml, "Design System") },
  { label: "Theme Lab", file: files.labHtml, source: sources.labHtml, doc: inspectHtml(sources.labHtml, "Theme Lab") },
  { label: "UI Inventory", file: files.inventoryHtml, source: sources.inventoryHtml, doc: inspectHtml(sources.inventoryHtml, "UI Inventory") }
];

function validateLocalLinks(entry) {
  [...entry.doc.hrefs, ...entry.doc.srcs].forEach((reference) => {
    if (/^(?:https?:|data:|mailto:|javascript:)/.test(reference)) return;
    if (reference.startsWith("#")) {
      assert(entry.doc.ids.has(reference.slice(1)), `${entry.label}: anchor ${reference} exists`);
      return;
    }
    const [relative, fragment] = reference.split("#");
    const target = path.resolve(path.dirname(entry.file), relative);
    assert(fs.existsSync(target), `${entry.label}: local reference ${reference} exists`);
    if (!fragment || !fs.existsSync(target) || path.extname(target) !== ".html") return;
    const targetDoc = inspectHtml(read(target), `${entry.label} target ${relative}`);
    assert(targetDoc.ids.has(fragment), `${entry.label}: target anchor ${reference} exists`);
  });
}

documents.forEach(validateLocalLinks);

const sharedReferences = [
  "../src/styles/peak-tokens.css",
  "../src/styles/peak-components.css",
  "../styles.css",
  "ui-system/theme.css",
  "ui-system/host-compat.css",
  "ui-system/theme-packs.js",
  "ui-system/theme-runtime.js"
];
documents.forEach((entry) => sharedReferences.forEach((reference) => assert(entry.source.includes(reference), `${entry.label}: loads ${reference}`)));
assert(sources.rulesHtml.includes("ui-system/design-system.css"), "Design System: loads rules presentation CSS");
assert(sources.labHtml.includes("ui-system/theme-playground.css") && sources.labHtml.includes("ui-system/theme-playground.js"), "Theme Lab: loads specimen CSS and runtime");
assert(sources.labHtml.includes("../node_modules/cytoscape/dist/cytoscape.min.js") && sources.labHtml.includes("ui-system/theme-graph.js"), "Theme Lab: loads Cytoscape and the Graph component runtime");
assert(sources.inventoryHtml.includes("ui-system/catalog-manifest.js") && sources.inventoryHtml.includes("ui-system/catalog-runtime.js") && sources.inventoryHtml.includes("ui-system/ui-catalog.css"), "UI Inventory: loads evidence manifest and renderer");

const axes = Object.keys(themeSystem.defaults);
axes.forEach((axis) => assert(documents[1].doc.themeControls.includes(axis), `Theme Lab: controls ${axis}`));
assert(new Set(documents[1].doc.themeControls).size === axes.length, "Theme Lab: control set matches Theme State axes");
assert(themeSystem.version === 4, "Theme System: exports schema version 4");
assert(themeSystem.composerDefaults && themeSystem.composerDefaults.preset === "peak-default", "Theme System: declares Composer fallback");
assert(Object.keys(themeSystem.composerPresets || {}).length === 4, "Theme System: declares exactly 4 Composer presets");
assert(Object.keys(themeSystem.composerOverrideOptions || {}).length === 8, "Theme System: declares 8 Composer element override enums");
assert(Object.keys(themeSystem.composerOverrideRanges || {}).length === 6, "Theme System: declares 6 Composer numeric ranges");
assert(themeSystem.graphDefaults && themeSystem.graphDefaults.nodeShape === "round-rectangle", "Theme System: declares Graph component fallback");
assert(Object.keys(themeSystem.graphOptions || {}).length === 2, "Theme System: declares 2 Graph enum controls");
assert(Object.keys(themeSystem.graphRanges || {}).length === 4, "Theme System: declares 4 Graph numeric controls");
const themeRuntime = loadThemeRuntime();
themeRuntime.apply({
  ...themeSystem.defaults,
  composer: {
    preset: "missing-preset",
    overrides: { bodySizePx: 99, contentMeasurePx: 1, quoteStyle: "invalid", tableDensity: "compact" }
  },
  graph: {
    nodeShape: "invalid",
    nodeScale: 8,
    labelSizePx: 1,
    edgeWidthPx: 3,
    layoutSpacing: 1000,
    canvasPattern: "plain"
  }
});
const runtimeState = themeRuntime.getState();
assert(runtimeState.composer.preset === "peak-default", "Theme Runtime: invalid Composer preset falls back");
assert(runtimeState.composer.overrides.bodySizePx === 18 && runtimeState.composer.overrides.contentMeasurePx === 620, "Theme Runtime: Composer numeric overrides clamp to declared ranges");
assert(!("quoteStyle" in runtimeState.composer.overrides) && runtimeState.composer.overrides.tableDensity === "compact", "Theme Runtime: invalid enums drop while valid enums survive");
const resolvedComposer = themeRuntime.resolveComposer(runtimeState);
assert(resolvedComposer["--pk-doc-heading-6-size"] && resolvedComposer["--pk-doc-table-row-height"] === "32px", "Theme Runtime: resolves heading and compact table tokens");
assert(resolvedComposer["--pk-doc-media-radius"] && resolvedComposer["--pk-doc-math-size"], "Theme Runtime: resolves media and formula tokens");
assert(runtimeState.graph.nodeShape === "round-rectangle" && runtimeState.graph.canvasPattern === "plain", "Theme Runtime: invalid Graph enums fall back while valid enums survive");
assert(runtimeState.graph.nodeScale === 1.5 && runtimeState.graph.labelSizePx === 11 && runtimeState.graph.layoutSpacing === 220, "Theme Runtime: Graph numeric values clamp to declared ranges");
const resolvedGraph = themeRuntime.resolveGraph(runtimeState);
assert(resolvedGraph["--pk-graph-node-scale"] === "1.5" && resolvedGraph["--pk-graph-edge-width"] === "3px", "Theme Runtime: resolves Graph component tokens");

Object.keys(themeSystem.packs).forEach((pack) => {
  ["light", "dark"].forEach((appearance) => {
    themeRuntime.apply({ ...themeSystem.defaults, pack, appearance, accent: themeSystem.packs[pack].accent });
    const tokens = themeRuntime.resolve(themeRuntime.getState());
    [
      ["primary text", tokens["--pk-text-primary"], tokens["--pk-surface"]],
      ["secondary text", tokens["--pk-text-secondary"], tokens["--pk-surface"]],
      ["tertiary text", tokens["--pk-text-tertiary"], tokens["--pk-surface"]],
      ["accent text", tokens["--pk-accent-text"], tokens["--pk-surface"]],
      ["accent foreground", tokens["--pk-accent-fg"], tokens["--pk-accent"]],
      ["Graph normal node", tokens["--pk-graph-node-text"], tokens["--pk-graph-node-bg"]],
      ["Graph selected node", tokens["--pk-graph-node-selected-text"], tokens["--pk-graph-node-selected-bg"]],
      ["Graph AI node", tokens["--pk-graph-node-text"], tokens["--pk-graph-node-ai-bg"]]
    ].forEach(([role, foreground, background]) => {
      assert(contrastRatio(foreground, background) >= 4.5, `Theme ${pack}/${appearance}: ${role} contrast is at least 4.5:1`);
    });
    ["success", "warning", "error", "info"].forEach((tone) => {
      const foreground = tokens[`--pk-${tone}-text`];
      const tint = compositeRgbaOver(tokens[`--pk-${tone}-bg`], tokens["--pk-surface"]);
      assert(contrastRatio(foreground, tokens["--pk-surface"]) >= 4.5, `Theme ${pack}/${appearance}: ${tone} text contrast is at least 4.5:1`);
      assert(contrastRatio(foreground, tint) >= 4.5, `Theme ${pack}/${appearance}: ${tone} tinted surface contrast is at least 4.5:1`);
    });
    const accentTint = compositeRgbaOver(tokens["--pk-accent-tint"], tokens["--pk-surface"]);
    assert(contrastRatio(tokens["--pk-accent-text"], accentTint) >= 4.5, `Theme ${pack}/${appearance}: accent tint text contrast is at least 4.5:1`);
  });
});

["#000000", "#ffffff", "#777777", "#ffff00"].forEach((accent) => {
  themeRuntime.apply({ ...themeSystem.defaults, accent });
  const tokens = themeRuntime.resolve(themeRuntime.getState());
  const accentTint = compositeRgbaOver(tokens["--pk-accent-tint"], tokens["--pk-surface"]);
  assert(contrastRatio(tokens["--pk-accent-fg"], accent) >= 4.5, `Theme Runtime: custom accent ${accent} receives a readable foreground`);
  assert(contrastRatio(tokens["--pk-accent-text"], tokens["--pk-surface"]) >= 4.5, `Theme Runtime: custom accent ${accent} receives readable surface text`);
  assert(contrastRatio(tokens["--pk-accent-text"], accentTint) >= 4.5, `Theme Runtime: custom accent ${accent} receives readable tinted-surface text`);
});

const graphSmoke = cytoscape({
  headless: true,
  styleEnabled: true,
  elements: [
    { data: { id: "root" } },
    { data: { id: "left" } },
    { data: { id: "right" } },
    { data: { id: "root-left", source: "root", target: "left" } },
    { data: { id: "root-right", source: "root", target: "right" } }
  ],
  style: [{ selector: "node", style: { shape: themeSystem.graphDefaults.nodeShape } }]
});
assert(graphSmoke.nodes().length === 3 && graphSmoke.edges().length === 2, "Graph Runtime: Cytoscape accepts the fixed component fixture");
assert(graphSmoke.$id("root").style("shape") === "round-rectangle", "Graph Runtime: Cytoscape accepts the default node shape");
[
  { name: "cose", animate: false },
  { name: "circle", animate: false },
  { name: "concentric", animate: false },
  { name: "breadthfirst", animate: false, directed: true, roots: "#root" }
].forEach((options) => {
  let ran = true;
  try { graphSmoke.layout(options).run(); } catch (_) { ran = false; }
  assert(ran, `Graph Runtime: Cytoscape runs ${options.name} layout`);
});
graphSmoke.destroy();

[
  ["Foundations", "id=\"foundations\""],
  ["Composer theme workshop", "id=\"composer-theme\""],
  ["Component library", "id=\"primitives\""],
  ["Graph component workbench", "id=\"graph-component\""],
  ["Product pressure boards", "id=\"coverage\""],
  ["Semantic colors", "role-swatches"],
  ["Type ladder", "type-specimen"],
  ["Spacing and control scale", "scale-specimen"],
  ["Radius and elevation", "geometry-specimen"],
  ["Icon scale", "icon-scale"],
  ["Motion scale", "motion-scale"],
  ["Foundation research references", "foundation-reference-strip"],
  ["Component families", "component-family"],
  ["Control strip coverage", "data-coverage-board=\"control-strips\""],
  ["Input and elevation coverage", "data-coverage-board=\"inputs-elevation\""],
  ["Report coverage", "data-coverage-board=\"report-mixed-content\""],
  ["Dashboard coverage", "data-coverage-board=\"dashboard\""],
  ["File Atlas inspector coverage", "data-coverage-board=\"file-atlas-inspector\""],
  ["Graph system coverage", "data-coverage-board=\"graph-system\""],
  ["Long outline coverage", "data-coverage-board=\"long-outline\""],
  ["Search result specimen", "result-row"],
  ["Chat specimen", "chat-message"],
  ["Overlay specimen", "overlay-panel"],
  ["Codex image slots", "id=\"ai-bridge\""],
  ["Fixed image manifest", "data-theme-image-manifest=\"ui-system/theme-concepts/manifest.json\""],
  ["Current Theme JSON", "data-theme-json"]
].forEach(([label, marker]) => assert(sources.labHtml.includes(marker), `Theme Lab: ${label}`));
assert(sources.labHtml.includes("atlassian.design/foundations") && sources.labHtml.includes("radix-ui.com/themes") && sources.labHtml.includes("m3.material.io/foundations/interaction/states"), "Theme Lab: links the primary design-system coverage references used for the expanded inventory");
assert(sources.labHtml.includes("data-composer-theme-workshop") && sources.labHtml.includes("data-composer-document"), "Theme Lab: Composer theme workshop has one shared fixed document");
assert(sources.labHtml.includes("id=\"composer-theme-contract\"") && sources.labHtml.includes("当前完整 Theme JSON"), "Theme Lab: Composer rules and Theme JSON remain in the single workspace");
assert(sources.labHtml.includes("--pk-doc-*") && sources.labHtml.includes("--pk-editor-*"), "Theme Lab: Composer document and editor token boundaries are explained inline");
assert((sources.labHtml.match(/data-composer-preset=/g) || []).length === 4, "Theme Lab: Composer exposes exactly 4 complete presets");
assert((sources.labHtml.match(/data-composer-theme-control=/g) || []).length === 14, "Theme Lab: Composer exposes 6 quick and 8 advanced controls");
[
  "frontmatter", "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6",
  "paragraph", "lists", "ordered-list", "task-list", "quote", "callout", "divider",
  "focused-paragraph", "ai-diff", "code", "table", "math", "image", "embed", "dataview",
  "footnote", "raw-fallback"
].forEach((element) => assert(sources.labHtml.includes(`data-markdown-element=\"${element}\"`), `Theme Lab: Composer covers ${element}`));
assert(sources.labHtml.includes("data-composer-view-option=\"edit\"") && sources.labHtml.includes("data-composer-view-option=\"clean\""), "Theme Lab: Composer compares Edit and Clean on the same document");
assert(sources.labRuntime.includes("selectComposerView") && sources.labRuntime.includes("data-composer-view-option"), "Theme Lab: Composer Edit/Clean switch is interactive");
assert(sources.themeRuntime.includes("sanitizeComposer") && sources.themeRuntime.includes("resolveComposer") && sources.themeRuntime.includes("exportPayload"), "Theme Runtime: validates, resolves and exports Composer config");
assert(sources.themeRuntime.includes("sanitizeGraph") && sources.themeRuntime.includes("resolveGraph") && sources.themeRuntime.includes("graph: graph"), "Theme Runtime: validates, resolves and exports Graph config");
assert(sources.themeRuntime.includes("--pk-doc-heading-6-size") && sources.themeRuntime.includes("--pk-doc-table-row-height"), "Theme Runtime: resolves low heading and structured content roles");
assert(sources.labCss.includes("--pk-doc-body-font") && sources.labCss.includes("--pk-doc-heading-6-size") && sources.labCss.includes("data-composer-view=\"clean\""), "Theme Lab: Composer specimen consumes document tokens and separates clean view");
assert(sources.labCss.includes(".composer-theme-contract__rules") && sources.labCss.includes(".composer-theme-contract__json"), "Theme Lab: inline Composer contract and JSON are styled");
assert((sources.labHtml.match(/class="coverage-board"/g) || []).length === 7, "Theme Lab: renders exactly 7 product pressure boards");
["rest", "hover", "focus", "selected", "disabled"].forEach((state) => assert(sources.labHtml.includes(`data-state="${state}"`), `Theme Lab: pins ${state} control state`));
["flat", "outlined", "raised", "error", "disabled", "focus"].forEach((state) => assert(sources.labHtml.includes(`data-input-state="${state}"`), `Theme Lab: covers ${state} input treatment`));
assert((sources.labHtml.match(/class="metric-card(?:\s|\")/g) || []).length >= 4, "Theme Lab: dashboard includes at least 4 metric cards");
assert((sources.labHtml.match(/class="report-section(?:\s|\")/g) || []).length >= 4, "Theme Lab: report includes long-form sections");
["doc-frontmatter__grid", "doc-block--selected", "doc-block-action-bar", "doc-callout", "doc-block--focus", "doc-code-block", "doc-markdown-table"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: Composer workshop covers ${marker}`));
["atlas-workspace", "atlas-file-rail", "atlas-search-band", "atlas-toolbar", "atlas-tree", "atlas-inspector", "atlas-tray"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: File Atlas covers ${marker}`));
["data-graph-workbench", "graph-control-row", "graph-layout-row", "graph-stage", "graph-system__canvas", "data-graph-scope", "data-graph-layout", "data-graph-semantic", "data-graph-nodes", "data-graph-node-list", "data-graph-copy", "data-graph-copy-image", "data-graph-fullscreen"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: Graph covers ${marker}`));
assert((sources.labHtml.match(/data-graph-theme-control=/g) || []).length === 6, "Theme Lab: Graph exposes exactly 6 theme controls");
assert(!sources.labHtml.includes("<svg class=\"graph-system__canvas\"") && !sources.labHtml.includes("graph-system-node--selected"), "Theme Lab: Graph no longer uses a hand-drawn SVG substitute");
assert(sources.graphRuntime.includes("window.cytoscape") && sources.graphRuntime.includes("runLayout") && sources.graphRuntime.includes("applyVisibility"), "Theme Lab: Graph is rendered and relaid out by Cytoscape");
assert(sources.graphRuntime.includes("mouseover") && sources.graphRuntime.includes("selectNode") && sources.graphRuntime.includes("toggleNodeList") && sources.graphRuntime.includes("copyMermaid") && sources.graphRuntime.includes("copyImage") && sources.graphRuntime.includes("toggleFullscreen") && sources.graphRuntime.includes("downloadPng"), "Theme Lab: Graph implements hover, selection, node list, Mermaid copy, image copy with download fallback, and fullscreen");
assert(sources.graphRuntime.includes("--pk-graph-node-selected-bg") && sources.graphRuntime.includes("--pk-graph-node-selected-text") && !sources.graphRuntime.includes('color: token("--pk-accent-text")'), "Theme Lab: Graph consumes opaque, contrast-safe node color roles");
assert(!/(?:ReactFlow|@xyflow\/react)/.test(sources.graphRuntime + sources.labHtml), "Theme Lab: Graph contains no React Flow runtime or import");
assert((sources.labHtml.match(/class="outline-row(?:\s|\")/g) || []).length >= 27, "Theme Lab: long outline includes at least 27 rows");
assert(sources.labRuntime.includes("selectRow") && sources.labRuntime.includes("data-lab-row"), "Theme Lab: long outline rows are interactive");
assert(sources.labCss.includes(".report-section:hover") && sources.labCss.includes(".outline-row:hover") && sources.labCss.includes(".quick-actions button:hover"), "Theme Lab: representative hover states are implemented");
assert(sources.labHtml.includes("class=\"pk-icon-sprite\" width=\"0\" height=\"0\""), "Theme Lab: icon sprite has zero intrinsic geometry");
assert(sources.labCss.includes(".pk-icon-sprite") && sources.labCss.includes("position: absolute;"), "Theme Lab: icon sprite cannot create top-of-page whitespace");
assert(!sources.labHtml.includes("pk-icon-button") && !sources.labCss.includes(".pk-icon-button"), "Theme Lab: all icon-only actions use the canonical pk-icon-btn primitive");
assert(!/<button class="pk-icon-btn"[^>]*>\s*[^<\s]/.test(sources.labHtml), "Theme Lab: icon-only buttons never use typographic glyphs as icons");
assert(!/\p{Extended_Pictographic}/u.test(sources.labHtml), "Theme Lab: controls and specimens contain no emoji icons");
assert(!sources.labHtml.includes("class=\"lab-header\"") && !sources.labHtml.includes("data-lab-console-pin"), "Theme Lab: has no separate sticky header or lock control");
assert(sources.labHtml.includes("class=\"lab-console__nav\"") && (sources.labHtml.match(/class="lab-console__nav"[^>]*>[\s\S]*?<\/nav>/g) || []).length === 1, "Theme Lab: page navigation is fused into Theme State");
assert((sources.labCss.match(/position: sticky;/g) || []).length === 1 && sources.labCss.includes(".lab-console { position: sticky; z-index: 20; top: 12px;"), "Theme Lab: Theme State is the only sticky document surface");
assert(sources.labRuntime.includes("peak-theme-lab-console-v1") && sources.labRuntime.includes("toggleConsoleCollapse") && !sources.labRuntime.includes("toggleConsolePin"), "Theme Lab: only collapse preference persists independently from Theme JSON");
assert(sources.labRuntime.includes("body.inert = consoleState.collapsed"), "Theme Lab: collapsed console controls leave the focus order");
assert((sources.labHtml.match(/data-lab-theme-menu-trigger=/g) || []).length === 7, "Theme Lab: collapsed console keeps all 7 enumerable theme axes clickable");
assert(sources.labHtml.includes("lab-console__accent") && sources.labHtml.includes("data-theme-control=\"accent\""), "Theme Lab: collapsed console keeps Accent directly editable");
assert(sources.labHtml.includes("data-lab-theme-axis-menu") && sources.labCss.includes(".lab-console__axis-menu"), "Theme Lab: collapsed axes share a visible option popover");
assert(sources.labRuntime.includes("toggleThemeAxisMenu") && sources.labRuntime.includes("selectThemeAxis") && sources.labRuntime.includes("closeThemeAxisMenu"), "Theme Lab: compact popover opens, selects an explicit value, and closes");
assert(sources.labRuntime.includes("menuitemradio") && sources.labRuntime.includes("event.key !== \"Escape\""), "Theme Lab: compact popover exposes selection semantics and Escape dismissal");
assert(sources.labCss.includes(".lab-console[data-collapsed=\"true\"] .lab-console__head { flex-wrap: nowrap; }") && sources.labCss.includes("overflow-x: auto; scrollbar-width: none;"), "Theme Lab: collapsed controls remain on one row and scroll within their own strip");
assert(sources.labHtml.includes("组件试件用于校准公共语言") && sources.labHtml.includes("产品覆盖板用于验证组合压力"), "Theme Lab: explains its three-layer review model");
assert(!sources.labHtml.includes("type=\"file\"") && !sources.labHtml.includes("data-copy-image-prompt"), "Theme Lab: has no upload or Prompt-transfer UI");
assert(!/(?:FileReader|readAsDataURL|fetch\(|XMLHttpRequest|https?:\/\/)/.test(sources.labRuntime), "Theme Lab: runtime has no image transfer or network path");

assert(themeConceptManifest.slots.length === 19, "Theme Lab: declares all 19 fixed Codex image slots");
assert(new Set(themeConceptManifest.slots.map((slot) => slot.group)).size === 8, "Theme Lab: fixed slots cover 8 product domains");
assert(themeConceptManifest.policy.includes("Never overwrite source evidence"), "Theme Lab: manifest protects source evidence");
const conceptIds = new Set();
const conceptDirectory = path.join(path.dirname(files.themeConceptManifest), "current");
const conceptFiles = fs.readdirSync(conceptDirectory).filter((file) => file.endsWith(".jpg"));
assert(conceptFiles.length === 19, "Theme Lab: fixed output directory contains exactly 19 JPG slots");
themeConceptManifest.slots.forEach((slot) => {
  assert(!conceptIds.has(slot.id), `Theme Lab ${slot.id}: unique image slot`);
  conceptIds.add(slot.id);
  const output = path.resolve(path.dirname(files.themeConceptManifest), slot.output);
  const sourceEvidence = path.resolve(path.dirname(files.themeConceptManifest), slot.sourceEvidence);
  assert(fs.existsSync(output), `Theme Lab ${slot.id}: fixed output exists`);
  assert(fs.existsSync(sourceEvidence), `Theme Lab ${slot.id}: source evidence exists`);
  assert(evidenceManifest.frames.some((frame) => frame.file === path.basename(slot.sourceEvidence) && frame.second === slot.second), `Theme Lab ${slot.id}: source evidence timecode is locked`);
  assert(sources.labHtml.includes(`data-theme-image-slot=\"${slot.id}\"`), `Theme Lab ${slot.id}: slot is displayed`);
  assert(sources.labHtml.includes(`ui-system/theme-concepts/${slot.output}`), `Theme Lab ${slot.id}: HTML uses fixed output path`);
  assert(sources.labHtml.includes(`href=\"ui-system/theme-concepts/${slot.output}\"`), `Theme Lab ${slot.id}: image opens at original size`);
});
assert((sources.labHtml.match(/class=\"theme-image-domain\"/g) || []).length === 8, "Theme Lab: renders 8 compact image groups");
assert((sources.labHtml.match(/class=\"theme-image-slot\"/g) || []).length === 19, "Theme Lab: renders 19 thumbnail cards");
assert(sources.labHtml.includes("class=\"theme-image-index\"") && sources.labHtml.includes("data-theme-image-lightbox"), "Theme Lab: image gallery has dense domain navigation and an in-page lightbox");
assert(sources.labCss.includes(".theme-image-gallery { display: grid; grid-template-columns: repeat(2") && sources.labCss.includes(".theme-image-slot__preview") && sources.labCss.includes("aspect-ratio"), "Theme Lab: image gallery uses compact responsive thumbnails");
assert(sources.labRuntime.includes("openThemeImageLightbox") && sources.labRuntime.includes("stepThemeImageLightbox") && sources.labRuntime.includes("showModal"), "Theme Lab: image lightbox opens, steps and closes interactively");

assert(catalog.scenes.length === 8, "UI Inventory: declares 8 product domains");
catalog.scenes.forEach((scene) => {
  assert(scene.states.length > 0, `UI Inventory ${scene.id}: states declared`);
  assert(scene.references.length > 0, `UI Inventory ${scene.id}: real reference declared`);
  [...scene.production, ...scene.designs, ...scene.references.map((reference) => reference.image)].forEach((reference) => {
    assert(fs.existsSync(path.resolve(docs, reference)), `UI Inventory ${scene.id}: ${reference} exists`);
  });
  assert(scene.references.every((reference) => Number.isFinite(reference.second)), `UI Inventory ${scene.id}: recording timecodes declared`);
});
assert(sources.inventoryRuntime.includes("catalog.scenes.forEach"), "UI Inventory: renders from the shared manifest");
assert(sources.inventoryRuntime.includes("reference.image"), "UI Inventory: renders real reference images first");
assert(!sources.inventoryHtml.includes("data-scene-panel") && !sources.inventoryHtml.includes("data-scene-state"), "UI Inventory: contains no hand-made product state mirror");

const forbiddenProductAnatomy = [
  "pk-search-workspace",
  "pk-result-browser-toolbar__option",
  "peak-file-atlas-modal",
  "peak-composer-root",
  "pk-composer-workspace",
  "pk-sidecar-shell",
  "pkchat-shell",
  "pkchat-composer",
  "pkset-panel"
];
forbiddenProductAnatomy.forEach((marker) => assert(!sources.inventoryHtml.includes(marker), `UI Inventory: no hand-made ${marker}`));

assert(evidenceManifest.sha256 === catalog.recording.sha256, "UI Inventory: recording SHA matches evidence manifest");
catalog.scenes.flatMap((scene) => scene.references).forEach((reference) => {
  const basename = path.basename(reference.image);
  assert(evidenceManifest.frames.some((frame) => frame.file === basename && frame.second === reference.second), `UI Inventory: evidence manifest includes ${basename} at ${reference.second}s`);
});
evidenceManifest.frames.forEach((frame) => {
  const file = path.join(here, "evidence/recording-2026-08-10", frame.file);
  const digest = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert(digest === frame.sha256, `UI Inventory: evidence hash matches ${frame.file}`);
});

const presentationCss = [sources.themeCss, sources.rulesCss, sources.labCss, sources.inventoryCss].join("\n");
const forbiddenHostVars = /var\(\s*--(?:background-(?:primary|secondary|modifier)|text-(?:normal|muted|accent)|interactive-(?:normal|hover|accent)|input-|font-interface)/;
assert(!forbiddenHostVars.test(presentationCss), "UI System presentation CSS contains no Obsidian theme variables");
assert(!/#[0-9a-f]{3,8}\b/i.test(sources.labCss), "Theme Lab CSS contains no theme hex");
assert(!/#[0-9a-f]{3,8}\b/i.test(sources.inventoryCss), "UI Inventory CSS contains no theme hex");
assert(!/#[0-9a-f]{3,8}\b/i.test(sources.rulesCss), "Design System CSS contains no theme hex");
[
  "--background-primary: var(--pk-bg)",
  "--background-secondary: var(--pk-bg-secondary)",
  "--text-normal: var(--pk-text-primary)",
  "--text-muted: var(--pk-text-secondary)",
  "--interactive-accent: var(--pk-accent)",
  "--font-interface: var(--pk-font-sans)"
].forEach((binding) => assert(sources.hostCompatCss.includes(binding), `Host Boundary: owns ${binding}`));

assert(sources.rulesHtml.includes("Codex image replacement"), "Design System: documents fixed Codex image replacement boundary");
assert(sources.rulesHtml.includes("Theme Lab") && sources.rulesHtml.includes("UI Inventory"), "Design System: links both supporting surfaces");
assert(sources.rulesHtml.includes("design-system-playground.html#composer-theme") && sources.rulesHtml.includes("2026-08-12-composer-markdown-theme-customization.md"), "Design System: links Composer workshop and durable spec");
assert(sources.composerThemeSpec.includes("--pk-doc-*") && sources.composerThemeSpec.includes("--pk-editor-*"), "Composer Theme spec: separates document style from editor state");
assert(!documents.some((entry) => entry.source.includes("design-system-preview-bridge")), "UI System: no legacy preview bridge");

function finish() {
  if (errors.length) {
    console.error(`Peak UI System validation failed (${errors.length})`);
    errors.forEach((message) => console.error(`  ✗ ${message}`));
    process.exit(1);
  }
  const states = catalog.scenes.reduce((total, scene) => total + scene.states.length, 0);
  const frames = catalog.scenes.reduce((total, scene) => total + scene.references.length, 0);
  console.log(`Peak UI System validation passed (${checks.length} checks)`);
  console.log(`  3 surfaces · ${catalog.scenes.length} product domains · ${states} documented states · ${frames} real frames`);
}

finish();
