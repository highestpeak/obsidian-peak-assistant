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
  ["Representative scenes", "id=\"scenes\""],
  ["Semantic colors", "role-swatches"],
  ["Type ladder", "type-specimen"],
  ["Radius and elevation", "geometry-specimen"],
  ["Actions", "primitive-row"],
  ["Search result specimen", "result-row"],
  ["Composer specimen", "composer-block"],
  ["Chat specimen", "chat-message"],
  ["Graph specimen", "graph-node"],
  ["Overlay specimen", "overlay-panel"],
  ["AI bridge", "id=\"ai-bridge\""],
  ["Generated image import", "data-image-input"],
  ["Image prompt", "data-image-prompt"]
].forEach(([label, marker]) => assert(sources.labHtml.includes(marker), `Theme Lab: ${label}`));
assert(sources.labHtml.includes("不复刻完整 Search、Composer 或 Graph"), "Theme Lab: explicitly rejects product parity claim");
assert(sources.labRuntime.includes("FileReader") && sources.labRuntime.includes("readAsDataURL"), "Theme Lab: generated image stays local");
assert(!/(?:fetch\(|XMLHttpRequest|https?:\/\/)/.test(sources.labRuntime), "Theme Lab: reference image runtime performs no network upload");

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

assert(sources.rulesHtml.includes("Image-to-theme"), "Design System: documents image-to-theme boundary");
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
