import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "..");
const root = path.resolve(docs, "..");
const files = {
  rulesHtml: path.join(docs, "design-system.html"),
  labHtml: path.join(docs, "design-system-playground.html"),
  inventoryHtml: path.join(docs, "ui-inventory.html"),
  themeCss: path.join(here, "theme.css"),
  hostCompatCss: path.join(here, "host-compat.css"),
  rulesCss: path.join(here, "design-system.css"),
  labCss: path.join(here, "theme-playground.css"),
  inventoryCss: path.join(here, "ui-catalog.css"),
  productionCss: path.join(root, "styles.css"),
  themePacks: path.join(here, "theme-packs.js"),
  themeRuntime: path.join(here, "theme-runtime.js"),
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

Object.entries(files).forEach(([label, file]) => assert(fs.existsSync(file), `${label}: ${path.relative(root, file)} exists`));
if (errors.length) finish();

const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

function loadGlobal(file, key) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(file), sandbox, { filename: file });
  return sandbox.window[key];
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
assert(sources.inventoryHtml.includes("ui-system/catalog-manifest.js") && sources.inventoryHtml.includes("ui-system/catalog-runtime.js") && sources.inventoryHtml.includes("ui-system/ui-catalog.css"), "UI Inventory: loads evidence manifest and renderer");

const axes = Object.keys(themeSystem.defaults);
axes.forEach((axis) => assert(documents[1].doc.themeControls.includes(axis), `Theme Lab: controls ${axis}`));
assert(new Set(documents[1].doc.themeControls).size === axes.length, "Theme Lab: control set matches Theme State axes");

[
  ["Foundations", "id=\"foundations\""],
  ["Primitives", "id=\"primitives\""],
  ["Visual coverage", "id=\"coverage\""],
  ["Representative scenes", "id=\"scenes\""],
  ["Semantic colors", "role-swatches"],
  ["Type ladder", "type-specimen"],
  ["Radius and elevation", "geometry-specimen"],
  ["Actions", "primitive-row"],
  ["Control strip coverage", "data-coverage-board=\"control-strips\""],
  ["Input and elevation coverage", "data-coverage-board=\"inputs-elevation\""],
  ["Report coverage", "data-coverage-board=\"report-mixed-content\""],
  ["Dashboard coverage", "data-coverage-board=\"dashboard\""],
  ["Composer Markdown coverage", "data-coverage-board=\"composer-markdown\""],
  ["File Atlas inspector coverage", "data-coverage-board=\"file-atlas-inspector\""],
  ["Graph system coverage", "data-coverage-board=\"graph-system\""],
  ["Long outline coverage", "data-coverage-board=\"long-outline\""],
  ["Search result specimen", "result-row"],
  ["Composer specimen", "composer-block"],
  ["Chat specimen", "chat-message"],
  ["Graph specimen", "graph-node"],
  ["Overlay specimen", "overlay-panel"],
  ["Codex image slots", "id=\"ai-bridge\""],
  ["Fixed image manifest", "data-theme-image-manifest=\"ui-system/theme-concepts/manifest.json\""],
  ["Current Theme JSON", "data-theme-json"]
].forEach(([label, marker]) => assert(sources.labHtml.includes(marker), `Theme Lab: ${label}`));
assert((sources.labHtml.match(/class="coverage-board"/g) || []).length === 8, "Theme Lab: renders exactly 8 visual coverage boards");
["rest", "hover", "focus", "selected", "disabled"].forEach((state) => assert(sources.labHtml.includes(`data-state="${state}"`), `Theme Lab: pins ${state} control state`));
["flat", "outlined", "raised", "error", "disabled", "focus"].forEach((state) => assert(sources.labHtml.includes(`data-input-state="${state}"`), `Theme Lab: covers ${state} input treatment`));
assert((sources.labHtml.match(/class="metric-card(?:\s|\")/g) || []).length >= 4, "Theme Lab: dashboard includes at least 4 metric cards");
assert((sources.labHtml.match(/class="report-section(?:\s|\")/g) || []).length >= 4, "Theme Lab: report includes long-form sections");
["markdown-lead", "markdown-selected-block", "block-action-bar", "markdown-callout", "markdown-editable", "markdown-code", "markdown-table"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: Composer covers ${marker}`));
["atlas-toolbar", "atlas-preview", "atlas-inspector", "quick-actions", "keyword-list", "stats-row"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: File Atlas covers ${marker}`));
["graph-control-row", "graph-layout-row", "graph-system__canvas", "graph-system-node--selected", "graph-system-node--hover", "graph-system-node--muted"].forEach((marker) => assert(sources.labHtml.includes(marker), `Theme Lab: Graph covers ${marker}`));
assert((sources.labHtml.match(/class="outline-row(?:\s|\")/g) || []).length >= 27, "Theme Lab: long outline includes at least 27 rows");
assert(sources.labRuntime.includes("selectRow") && sources.labRuntime.includes("data-lab-row"), "Theme Lab: long outline rows are interactive");
assert(sources.labCss.includes(".report-section:hover") && sources.labCss.includes(".outline-row:hover") && sources.labCss.includes(".quick-actions button:hover"), "Theme Lab: representative hover states are implemented");
assert(sources.labHtml.includes("class=\"pk-icon-sprite\" width=\"0\" height=\"0\""), "Theme Lab: icon sprite has zero intrinsic geometry");
assert(sources.labCss.includes(".pk-icon-sprite") && sources.labCss.includes("position: absolute;"), "Theme Lab: icon sprite cannot create top-of-page whitespace");
assert(sources.labHtml.includes("data-lab-console-pin") && sources.labHtml.includes("data-lab-console-collapse"), "Theme Lab: Theme State console exposes pin and collapse controls");
assert(sources.labCss.includes(".lab-console[data-pinned=\"false\"]") && sources.labCss.includes(".lab-console[data-collapsed=\"true\"]"), "Theme Lab: Theme State console styles pinned and collapsed states");
assert(sources.labRuntime.includes("peak-theme-lab-console-v1") && sources.labRuntime.includes("toggleConsolePin") && sources.labRuntime.includes("toggleConsoleCollapse"), "Theme Lab: console preferences persist independently from Theme JSON");
assert(sources.labRuntime.includes("body.inert = consoleState.collapsed"), "Theme Lab: collapsed console controls leave the focus order");
assert((sources.labHtml.match(/data-lab-theme-menu-trigger=/g) || []).length === 7, "Theme Lab: collapsed console keeps all 7 enumerable theme axes clickable");
assert(sources.labHtml.includes("lab-console__accent") && sources.labHtml.includes("data-theme-control=\"accent\""), "Theme Lab: collapsed console keeps Accent directly editable");
assert(sources.labHtml.includes("data-lab-theme-axis-menu") && sources.labCss.includes(".lab-console__axis-menu"), "Theme Lab: collapsed axes share a visible option popover");
assert(sources.labRuntime.includes("toggleThemeAxisMenu") && sources.labRuntime.includes("selectThemeAxis") && sources.labRuntime.includes("closeThemeAxisMenu"), "Theme Lab: compact popover opens, selects an explicit value, and closes");
assert(sources.labRuntime.includes("menuitemradio") && sources.labRuntime.includes("event.key !== \"Escape\""), "Theme Lab: compact popover exposes selection semantics and Escape dismissal");
assert(sources.labCss.includes(".lab-console[data-collapsed=\"true\"] .lab-console__head { flex-wrap: nowrap; }") && sources.labCss.includes("overflow-x: auto; scrollbar-width: none;"), "Theme Lab: collapsed controls remain on one row and scroll within their own strip");
assert(sources.labHtml.includes("不复刻完整 Search、Composer 或 Graph"), "Theme Lab: explicitly rejects product parity claim");
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
assert((sources.labHtml.match(/class=\"theme-image-domain\"/g) || []).length === 8, "Theme Lab: renders 8 vertical image groups");
assert((sources.labHtml.match(/class=\"theme-image-slot\"/g) || []).length === 19, "Theme Lab: renders 19 large image cards");
assert(sources.labCss.includes("grid-template-columns: minmax(0, 1fr)"), "Theme Lab: image gallery uses a single large column");

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
