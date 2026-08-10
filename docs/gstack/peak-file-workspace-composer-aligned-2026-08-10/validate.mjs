import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const [html, css, js, research, readme] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "mock.css"), "utf8"),
  readFile(join(root, "mock.js"), "utf8"),
  readFile(join(root, "research.html"), "utf8"),
  readFile(join(root, "README.md"), "utf8"),
]);

const formats = ["image", "html", "pdf", "code", "canvas", "excalidraw"];
for (const format of formats) {
  assert.match(html, new RegExp(`data-surface="${format}"`), `${format} surface missing`);
  assert.match(html, new RegExp(`data-surface-tab="${format}"`), `${format} switcher missing`);
  assert.match(js, new RegExp(`\\b${format}: \\{`), `${format} AI configuration missing`);
}

assert.match(html, /class="intelligence-panel"/, "always-visible Intelligence panel missing");
assert.match(html, /id="candidateReview"/, "candidate review missing");
assert.match(html, /Accept/, "candidate Accept action missing");
assert.match(html, /Restore/, "candidate Restore action missing");
assert.match(js, /data-citation-page/, "PDF page citations missing");
assert.match(html, /data-image-tool="crop"/, "Image canvas tools missing");
assert.match(js, /remove-background/, "Image background removal action missing");
assert.match(html, /data-editable-source="code" contenteditable="plaintext-only"/, "Code must be directly editable");
assert.match(html, /data-html-action="source"/, "HTML local source action missing");
assert.match(html, /data-pdf-zoom="in"/, "PDF zoom action missing");
assert.match(html, /class="canvas-selection-tools"/, "native-like Canvas selection controls missing");
assert.match(html, /class="canvas-create-toolbar"/, "native-like Canvas create toolbar missing");
assert.match(html, /class="excalidraw-tools"/, "Excalidraw tool palette missing");
assert.match(html, /class="excalidraw-properties"/, "Excalidraw properties missing");
assert.doesNotMatch(html, />Symbols?</i, "Code UI must not expose Symbols navigation");
assert.doesNotMatch(html, /project explorer/i, "Code UI must not expose a project explorer");
assert.doesNotMatch(html, /data-view-mode|class="view-modes"|class="code-diff"/, "global file modes must not return");
assert.doesNotMatch(html, /class="intelligence-tabs"/, "Intelligence tab strip must not return");
assert.doesNotMatch(js, /\bmodes:|defaultMode|setMode\(/, "runtime mode system must not return");

assert.match(css, /grid-template-columns:\s*minmax\(700px,\s*1fr\) 390px/, "equal-height file/Intelligence split missing");
assert.match(css, /\.file-column[^}]+grid-template-rows:\s*58px minmax\(0,\s*1fr\)/, "file column layout missing");
assert.match(css, /\.intelligence-panel[^}]+height:\s*100%/, "Intelligence must span the whole workspace height");
assert.match(html, /current file connected/i, "context connection language missing from prototype");
assert.match(js, /source surface remains active/i, "source-active AI response missing");
assert.match(js, /handleImageTool|toggleHtmlSource|updatePdfZoom|codeEditor\.addEventListener\("input"\)|updateCanvasZoom|handleExcalStyle/, "direct interaction handlers missing");

const officialSources = [
  "helpx.adobe.com/photoshop",
  "helpx.adobe.com/acrobat",
  "canva.com/features/ai-photo-editing",
  "code.visualstudio.com/docs/languages/html",
  "obsidian.md/help/Plugins/Canvas",
  "github.com/excalidraw/excalidraw",
  "docs.excalidraw.com",
];
for (const source of officialSources) {
  assert.match(research, new RegExp(source.replaceAll(".", "\\.")), `research source missing: ${source}`);
}

assert.match(research, /production implementation pending/i, "design-only status missing");
assert.match(research, /Rejected V1/, "rejected predecessor not identified");
assert.match(readme, /Design-only successor/, "README status boundary missing");

console.log("Peak File Workspace Composer-aligned prototype: static contract OK");
