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
  themeHtml: path.join(docs, "design-system.html"),
  catalogHtml: path.join(docs, "design-system-playground.html"),
  themeCss: path.join(here, "theme.css"),
  hostCompatCss: path.join(here, "host-compat.css"),
  designCss: path.join(here, "design-system.css"),
  catalogCss: path.join(here, "ui-catalog.css"),
  productionCss: path.join(root, "styles.css"),
  themePacks: path.join(here, "theme-packs.js"),
  manifest: path.join(here, "catalog-manifest.js"),
  runtime: path.join(here, "theme-runtime.js"),
  catalogRuntime: path.join(here, "catalog-runtime.js"),
  evidenceManifest: path.join(here, "evidence/recording-2026-08-10/manifest.json")
};

const errors = [];
const checks = [];
const read = (file) => fs.readFileSync(file, "utf8");
const exists = (file, label) => {
  if (!fs.existsSync(file)) errors.push(`${label}: missing ${path.relative(root, file)}`);
};
const assert = (condition, message) => {
  if (condition) checks.push(message);
  else errors.push(message);
};

Object.entries(files).forEach(([label, file]) => exists(file, label));
if (errors.length) finish();

const themeHtml = read(files.themeHtml);
const catalogHtml = read(files.catalogHtml);
const sharedCss = [read(files.themeCss), read(files.designCss), read(files.catalogCss)].join("\n");
const hostCompatCss = read(files.hostCompatCss);
const productionCss = read(files.productionCss);
const catalogCss = read(files.catalogCss);
const designCss = read(files.designCss);
const catalogRuntime = read(files.catalogRuntime);

function loadGlobal(file, key) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(file), sandbox, { filename: file });
  return sandbox.window[key];
}

const themeSystem = loadGlobal(files.themePacks, "PeakThemeSystem");
const catalog = loadGlobal(files.manifest, "PeakUICatalog");
const evidenceManifest = JSON.parse(read(files.evidenceManifest));

function attributes(node) {
  return Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]));
}

function walk(node, visitor) {
  visitor(node, attributes(node));
  (node.childNodes || []).forEach((child) => walk(child, visitor));
  if (node.content) walk(node.content, visitor);
}

function inspectHtml(source, label) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const result = { ids: new Map(), hrefs: [], srcs: [], iframes: 0, roots: 0, sceneIds: [], sceneStates: [], scenePanels: [], themeControls: [] };
  walk(document, (node, attrs) => {
    if (node.tagName === "iframe") result.iframes += 1;
    if ((attrs.class || "").split(/\s+/).includes("peak-design-root") && (attrs.class || "").split(/\s+/).includes("pktw-root")) result.roots += 1;
    if (attrs.id) result.ids.set(attrs.id, (result.ids.get(attrs.id) || 0) + 1);
    if (attrs.href) result.hrefs.push(attrs.href);
    if (attrs.src) result.srcs.push(attrs.src);
    if (attrs["data-scene-id"]) result.sceneIds.push(attrs["data-scene-id"]);
    if (attrs["data-scene-state"]) result.sceneStates.push(attrs["data-scene-state"]);
    if (attrs["data-scene-panel"]) result.scenePanels.push(attrs["data-scene-panel"]);
    if (attrs["data-theme-control"]) result.themeControls.push(attrs["data-theme-control"]);
  });
  result.ids.forEach((count, id) => assert(count === 1, `${label}: duplicate id #${id}`));
  assert(result.iframes === 0, `${label}: no iframe`);
  assert(result.roots === 1, `${label}: exactly one autonomous root`);
  return result;
}

const themeDoc = inspectHtml(themeHtml, "Theme Lab");
const catalogDoc = inspectHtml(catalogHtml, "UI Catalog");

function validateLocalLinks(result, file, label) {
  [...result.hrefs, ...result.srcs].forEach((reference) => {
    if (/^(?:https?:|data:|mailto:|javascript:)/.test(reference)) return;
    if (reference.startsWith("#")) {
      assert(result.ids.has(reference.slice(1)), `${label}: anchor ${reference} exists`);
      return;
    }
    const [relative, fragment] = reference.split("#");
    const target = path.resolve(path.dirname(file), relative);
    assert(fs.existsSync(target), `${label}: local reference ${reference} exists`);
    if (fragment && fs.existsSync(target) && path.extname(target) === ".html") {
      const targetDoc = inspectHtml(read(target), `${label} target ${relative}`);
      assert(targetDoc.ids.has(fragment), `${label}: target anchor ${reference} exists`);
    }
  });
}

validateLocalLinks(themeDoc, files.themeHtml, "Theme Lab");
validateLocalLinks(catalogDoc, files.catalogHtml, "UI Catalog");

const requiredShared = ["../src/styles/peak-tokens.css", "../src/styles/peak-components.css", "../styles.css", "ui-system/theme.css", "ui-system/host-compat.css", "ui-system/theme-packs.js", "ui-system/theme-runtime.js"];
requiredShared.forEach((reference) => {
  assert(themeHtml.includes(reference), `Theme Lab loads ${reference}`);
  assert(catalogHtml.includes(reference), `UI Catalog loads ${reference}`);
});
assert(!themeHtml.includes("design-system-preview-bridge"), "Theme Lab does not load legacy preview bridge");
assert(!catalogHtml.includes("design-system-preview-bridge"), "UI Catalog does not load legacy preview bridge");

assert(catalog.scenes.length === 8, "Catalog declares 8 product domains");
function sceneMarkupFor(id) {
  const start = catalogHtml.indexOf(`data-scene-id="${id}"`);
  const laterStarts = catalog.scenes
    .map((candidate) => catalogHtml.indexOf(`data-scene-id="${candidate.id}"`, start + 1))
    .filter((index) => index > start);
  const end = laterStarts.length ? Math.min(...laterStarts) : catalogHtml.length;
  return catalogHtml.slice(start, end);
}

catalog.scenes.forEach((item) => {
  assert(catalogDoc.sceneIds.filter((id) => id === item.id).length === 1, `Scene ${item.id}: one HTML root`);
  const sceneMarkup = sceneMarkupFor(item.id);
  item.states.forEach((state) => {
    assert(sceneMarkup.includes(`data-scene-state="${state.id}"`) && sceneMarkup.includes(`data-scene-panel="${state.id}"`), `Scene ${item.id}: state ${state.id} has control and panel`);
  });
  [...item.production, ...item.designs, ...item.references.map((reference) => reference.image)].forEach((reference) => {
    const target = path.resolve(docs, reference);
    assert(fs.existsSync(target), `Scene ${item.id}: source ${reference} exists`);
  });
  assert(item.references.every((reference) => Number.isFinite(reference.second)), `Scene ${item.id}: recording timecodes declared`);
});

const vaultSearchMarkup = sceneMarkupFor("vault-search");
const vaultResultCount = (vaultSearchMarkup.match(/data-result-browser-row/g) || []).length;
const vaultGraphNodeCount = (vaultSearchMarkup.match(/class="pk-cy-node/g) || []).length;
const vaultFileIconCount = (vaultSearchMarkup.match(/href="#pk-icon-file"/g) || []).length;
assert(vaultResultCount >= 7, "Vault Search carries a realistic result dataset");
assert(vaultGraphNodeCount >= 8, "Vault Search Graph carries a meaningful node set");
assert(vaultFileIconCount >= 7, "Vault Search results use real SVG file icons");

const fileAtlasMarkup = sceneMarkupFor("file-atlas");
const atlasGridOrder = ["pkfa-search-band", "pkfa-atlas-bar", "pkfa-main", "pkfa-tray"]
  .map((className) => fileAtlasMarkup.indexOf(`class="${className}`));
assert(atlasGridOrder.every((index) => index >= 0), "File Atlas declares every production grid row");
assert(atlasGridOrder.every((index, position) => position === 0 || index > atlasGridOrder[position - 1]), "File Atlas production grid rows stay in source order");
assert(fileAtlasMarkup.includes('class="pkfa-tree-scene"'), "File Atlas tree scene preserves direct grid participation");
assert(fileAtlasMarkup.includes('data-subview="tree"'), "File Atlas declares its production subview contract");

const composerMarkup = sceneMarkupFor("composer");
const composerWorkspaceCount = (composerMarkup.match(/class="pk-composer-workspace"/g) || []).length;
const composerPaperCount = (composerMarkup.match(/class="pk-composer-shell"/g) || []).length;
assert(composerWorkspaceCount === 1, "Composer owns exactly one workspace");
assert(composerPaperCount === 1, "Composer owns exactly one paper");
assert(composerMarkup.includes('class="pk-composer-controlbar"'), "Composer uses the production control bar");
assert(composerMarkup.includes('data-group-attribute="displayState"'), "Composer display switch is interactive");
assert(!composerMarkup.includes("pk-composer-demo-toolbar"), "Composer removes the catalog-only toolbar");
assert(vaultSearchMarkup.includes('data-group-attribute="resultDensity"'), "Vault Search density is interactive");
assert(fileAtlasMarkup.includes('data-group-attribute="atlasPreset"'), "File Atlas presets are interactive");
assert(catalogCss.includes('.pkfa-tree-scene:not([hidden]) { display: contents; }'), "File Atlas tree wrapper does not alter production grid geometry");

const axes = Object.keys(themeSystem.defaults);
axes.forEach((axis) => {
  const control = `data-theme-control="${axis}"`;
  const option = `data-theme-option="${axis}"`;
  assert(themeHtml.includes(control) || themeHtml.includes(option), `Theme Lab controls ${axis}`);
});
["pack", "appearance", "density", "radius"].forEach((axis) => assert(catalogDoc.themeControls.includes(axis), `UI Catalog quick-controls ${axis}`));

const forbiddenHostVars = /var\(\s*--(?:background-(?:primary|secondary|modifier)|text-(?:normal|muted|accent)|interactive-(?:normal|hover|accent)|input-|font-interface)/;
assert(!forbiddenHostVars.test(sharedCss), "Shared UI System CSS contains no Obsidian theme variables");
[
  "--background-primary: var(--pk-bg)",
  "--background-secondary: var(--pk-bg-secondary)",
  "--text-normal: var(--pk-text-primary)",
  "--text-muted: var(--pk-text-secondary)",
  "--interactive-accent: var(--pk-accent)",
  "--font-interface: var(--pk-font-sans)"
].forEach((binding) => assert(hostCompatCss.includes(binding), `Host compatibility boundary owns ${binding}`));
assert(!/#[0-9a-f]{3,8}\b/i.test(catalogCss), "UI Catalog scene CSS contains no theme hex");
assert(!/#[0-9a-f]{3,8}\b/i.test(designCss), "Theme Lab presentation CSS contains no theme hex");
assert(!/<iframe\b/i.test(themeHtml + catalogHtml), "Entry pages contain no iframe markup");

const productionAnatomy = [
  ["Vault Search", "pk-result-browser-toolbar__option"],
  ["Result row", "data-result-browser-row"],
  ["AI Sources", "pk-ai-sources-toolbar"],
  ["AI workspace selector", "pk-ai-workspace-selector"],
  ["Vault Intelligence", "pk-vault-intelligence-workspace"],
  ["Vault Intelligence metric", "pk-vault-metric-card"],
  ["File Atlas", "peak-file-atlas-modal pkfa-root"],
  ["Composer root", "peak-composer-root"],
  ["Composer control bar", "pk-composer-controlbar"],
  ["Composer paper", "pk-composer-workspace"],
  ["Composer block", "pk-composer-block"],
  ["Composer sidecar", "pk-sidecar-shell"],
  ["Composer brief", "pk-brief"],
  ["Composer history", "pk-history"],
  ["Composer related materials", "pk-material-list-shell"],
  ["Chat Studio left", "pkchat-studio__left"],
  ["Chat Studio navigation", "pkstudio-nav-row"],
  ["Chat Studio command", "pkstudio-sidebar-command"],
  ["Chat shell", "pkchat-shell"],
  ["Chat message", "pkchat-msg"],
  ["Chat assistant identity", "pkchat-msg__identity"],
  ["Chat composer", "pkchat-composer"],
  ["Chat index", "pkchat-idx"],
  ["Settings panel", "pkset-panel"],
  ["Settings row", "pk-row"]
];
productionAnatomy.forEach(([label, contract]) => assert(catalogHtml.includes(contract), `${label}: production anatomy ${contract}`));
[
  ".pk-result-browser-toolbar__option",
  ".pk-ai-sources-toolbar",
  ".pk-ai-workspace-selector",
  ".pk-vault-intelligence-workspace",
  ".pk-vault-metric-card",
  ".peak-file-atlas-modal.pkfa-root",
  ".peak-composer-root .pk-composer-workspace",
  ".peak-composer-root .pk-composer-controlbar",
  ".pk-sidecar-shell",
  ".pk-brief",
  ".pk-history",
  ".pk-material-list-shell",
  ".pkstudio-nav-row",
  ".pkstudio-sidebar-command",
  ".pkchat-shell",
  ".pkchat-msg",
  ".pkchat-msg__identity",
  ".pkchat-composer",
  ".pkchat-idx",
  ".pk-row"
].forEach((selector) => assert(productionCss.includes(selector), `Production bundle owns ${selector}`));
[
  ["search-shell", /class="[^"]*\bsearch-shell\b/],
  ["composer-page", /class="[^"]*\bcomposer-page\b/],
  ["chat-shell", /class="[^"]*(?:^|\s)chat-shell(?:\s|$)/],
  ["chat-message__bubble", /\bchat-message__bubble\b/],
  ["graph-node", /class="[^"]*\bgraph-node\b/],
  ["pkset-row", /class="[^"]*(?:^|\s)pkset-row(?:\s|$)/],
  ["pk-search-top-tab", /class="[^"]*\bpk-search-top-tab\b/],
  ["pk-vault-intelligence", /class="[^"]*(?:^|\s)pk-vault-intelligence(?:\s|$)/],
  ["pk-vault-statline", /class="[^"]*\bpk-vault-statline\b/],
  ["pk-vault-finding", /class="[^"]*\bpk-vault-finding\b/],
  ["pkchat-project-list", /class="[^"]*\bpkchat-project-list\b/],
  ["pkchat-outline-group", /class="[^"]*\bpkchat-outline-group\b/],
  ["pk-intel-feed", /class="[^"]*\bpk-intel-feed\b/],
  ["pk-intel-task", /class="[^"]*\bpk-intel-task\b/],
  ["pk-intel-source", /class="[^"]*\bpk-intel-source\b/],
  ["stale pkchat-msg__head", /class="[^"]*\bpkchat-msg__head\b/],
  ["stale pkchat-msg__avatar", /class="[^"]*\bpkchat-msg__avatar\b/]
].forEach(([legacy, pattern]) => assert(!pattern.test(catalogHtml), `Catalog removes invented ${legacy}`));
assert(catalogHtml.includes("data-production-style-source=\"AtlasGraphCanvasImpl.tsx:430\""), "Canvas graph adapter declares its production style source");
assert(catalogRuntime.includes('classList.toggle("pk-sidecar-tab--active", active)'), "Catalog runtime mirrors production sidecar active class");
assert(catalogRuntime.includes('classList.toggle("is-active", active)'), "Catalog runtime mirrors production File Atlas active class");
assert(catalogRuntime.includes('atlasRoot.dataset.subview = state === "tree" ? "tree" : "graph"'), "Catalog runtime mirrors File Atlas subview geometry");
assert(catalogRuntime.includes('attribute === "displayState"'), "Catalog runtime updates Composer display state");

assert(evidenceManifest.sha256 === catalog.recording.sha256, "Recording SHA matches evidence manifest");
catalog.scenes.flatMap((item) => item.references).forEach((reference) => {
  const basename = path.basename(reference.image);
  assert(evidenceManifest.frames.some((frame) => frame.file === basename && frame.second === reference.second), `Evidence manifest includes ${basename} at ${reference.second}s`);
});
evidenceManifest.frames.forEach((frame) => {
  const file = path.join(here, "evidence/recording-2026-08-10", frame.file);
  const digest = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert(digest === frame.sha256, `Evidence hash matches ${frame.file}`);
});

function finish() {
  if (errors.length) {
    console.error(`Peak UI System validation failed (${errors.length})`);
    errors.forEach((message) => console.error(`  ✗ ${message}`));
    process.exit(1);
  }
  console.log(`Peak UI System validation passed (${checks.length} checks)`);
  console.log(`  ${catalog.scenes.length} scenes · ${catalog.scenes.reduce((sum, item) => sum + item.states.length, 0)} states · ${catalog.scenes.reduce((sum, item) => sum + item.references.length, 0)} recording frames`);
}

finish();
