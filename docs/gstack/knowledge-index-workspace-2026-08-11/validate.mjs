import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(directory, file), "utf8");
const html = read("index.html");
const css = read("mock.css");
const js = read("mock.js");
const readme = read("README.md");

const requiredHtml = [
  "data-overall-progress",
  "data-processed-count",
  "data-speed",
  "data-eta",
  "data-elapsed",
  "data-document-queue",
  "data-current-document",
  "data-current-step",
  "data-order-select",
  "data-pause",
  "data-file-types-trigger",
  "data-file-types-panel",
  "Files in this run",
  "Not included in this run",
  "file-types-donut",
  "data-type-segment=\"markdown\"",
  "data-type-row=\"markdown\"",
  "data-open-index-setup",
  "data-index-setup",
  "data-index-setup-content",
  "data-preview-state=\"setup\"",
  "data-preview-state=\"complete\"",
  "data-completion-panel",
  "Start indexing",
  "Run depth",
  "Run exclusions",
  "Plain text",
  "Canvas",
  "data-index-depth=\"Full knowledge\"",
  "Settings &amp; Onboarding package",
];

const requiredJs = [
  "function startSimulation",
  "function advanceSimulation",
  "function renderQueue",
  "function renderCurrentDocument",
  "function renderMetrics",
  "function toggleFileTypes",
  "function setActiveFileType",
  "function toggleIndexSetup",
  "function setIndexMode",
  "state.mode",
  "dataset.previewState",
  "Your knowledge index is ready",
  "selectedIndexDepth",
];

const requiredCss = [
  ".progress-hero",
  ".workspace-grid",
  ".queue-row.is-current",
  ".substep.is-active",
  ".file-types-popover",
  ".file-type-row",
  ".donut-segment",
  ".file-types-overview",
  ".package-link",
  ".inline-index-setup",
  ".inline-setup-clip",
  ".completion-panel",
  "body[data-index-state=\"complete\"]",
  ".run-depth-list",
  "@media (max-width: 760px)",
  "@media (prefers-reduced-motion: reduce)",
];

const missing = [];
for (const value of requiredHtml) {
  if (!html.includes(value)) missing.push(`HTML: ${value}`);
}
for (const value of requiredJs) {
  if (!js.includes(value)) missing.push(`JS: ${value}`);
}
for (const value of requiredCss) {
  if (!css.includes(value)) missing.push(`CSS: ${value}`);
}

const forbidden = ["data-view-target", "data-view=\"problems\"", "data-view=\"history\""];
for (const value of forbidden) {
  if (html.includes(value)) missing.push(`forbidden multi-page control: ${value}`);
}
for (const value of ["DOCX", "PPTX", "XLSX"]) {
  if (html.includes(value)) missing.push(`unsupported Office format in Index workspace: ${value}`);
}
for (const value of ["setup-drawer", "setup-backdrop", "Keep the index current", "Models &amp; generated knowledge", "Advanced chunking"]) {
  if (html.includes(value)) missing.push(`Index workspace must not own long-term setting: ${value}`);
}
if (html.indexOf("data-index-setup") > html.indexOf("progress-hero")) {
  missing.push("HTML: inline setup must appear above the progress hero");
}
if (readme.includes("http://127.0.0.1") || readme.includes("localhost:")) {
  missing.push("README: temporary localhost instructions are not allowed");
}

if (missing.length > 0) {
  console.error("Knowledge Index progress mock validation failed:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Knowledge Index progress mock validation passed.");
