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
  designCss: path.join(here, "design-system.css"),
  catalogCss: path.join(here, "ui-catalog.css"),
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
const catalogCss = read(files.catalogCss);
const designCss = read(files.designCss);

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

const requiredShared = ["../src/styles/peak-tokens.css", "../src/styles/peak-components.css", "ui-system/theme.css", "ui-system/theme-packs.js", "ui-system/theme-runtime.js"];
requiredShared.forEach((reference) => {
  assert(themeHtml.includes(reference), `Theme Lab loads ${reference}`);
  assert(catalogHtml.includes(reference), `UI Catalog loads ${reference}`);
});
assert(!themeHtml.includes("design-system-preview-bridge"), "Theme Lab does not load legacy preview bridge");
assert(!catalogHtml.includes("design-system-preview-bridge"), "UI Catalog does not load legacy preview bridge");

assert(catalog.scenes.length === 8, "Catalog declares 8 product domains");
catalog.scenes.forEach((item) => {
  assert(catalogDoc.sceneIds.filter((id) => id === item.id).length === 1, `Scene ${item.id}: one HTML root`);
  item.states.forEach((state) => {
    assert(catalogHtml.includes(`data-scene-id="${item.id}"`), `Scene ${item.id}: registered`);
    const scenePattern = new RegExp(`data-scene-id="${item.id}"[\\s\\S]*?data-scene-state="${state.id}"[\\s\\S]*?data-scene-panel="${state.id}"`);
    assert(scenePattern.test(catalogHtml), `Scene ${item.id}: state ${state.id} has control and panel`);
  });
  [...item.production, ...item.designs, ...item.references.map((reference) => reference.image)].forEach((reference) => {
    const target = path.resolve(docs, reference);
    assert(fs.existsSync(target), `Scene ${item.id}: source ${reference} exists`);
  });
  assert(item.references.every((reference) => Number.isFinite(reference.second)), `Scene ${item.id}: recording timecodes declared`);
});

const axes = Object.keys(themeSystem.defaults);
axes.forEach((axis) => {
  const control = `data-theme-control="${axis}"`;
  const option = `data-theme-option="${axis}"`;
  assert(themeHtml.includes(control) || themeHtml.includes(option), `Theme Lab controls ${axis}`);
});
["pack", "appearance", "density", "radius"].forEach((axis) => assert(catalogDoc.themeControls.includes(axis), `UI Catalog quick-controls ${axis}`));

const forbiddenHostVars = /var\(\s*--(?:background-(?:primary|secondary|modifier)|text-(?:normal|muted|accent)|interactive-(?:normal|hover|accent)|input-|font-interface)/;
assert(!forbiddenHostVars.test(sharedCss), "Shared UI System CSS contains no Obsidian theme variables");
assert(!/#[0-9a-f]{3,8}\b/i.test(catalogCss), "UI Catalog scene CSS contains no theme hex");
assert(!/#[0-9a-f]{3,8}\b/i.test(designCss), "Theme Lab presentation CSS contains no theme hex");
assert(!/<iframe\b/i.test(themeHtml + catalogHtml), "Entry pages contain no iframe markup");

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
