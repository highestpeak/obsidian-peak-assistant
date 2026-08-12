import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(directory, name), "utf8");

const packageHtml = read("index.html");
const settingsHtml = read("settings.html");
const onboardingHtml = read("onboarding.html");
const css = read("mock.css");
const settingsJs = read("settings.js");
const onboardingJs = read("onboarding.js");
const readme = read("README.md");

const missing = [];

function requireValues(label, source, values) {
  for (const value of values) {
    if (!source.includes(value)) missing.push(`${label}: ${value}`);
  }
}

requireValues("Package HTML", packageHtml, [
  "当前文档",
  "能力、内容和流程 Brief",
  "Settings 可配置能力总表",
  "Settings",
  "Onboarding",
  "Knowledge Index 运行进度",
  "历史探索",
  "Superseded",
]);

requireValues("Settings HTML", settingsHtml, [
  "AI &amp; Models",
  "AI Control Center",
  "../ai-control-center-2026-07-30/index.html",
  "connection-section-heading",
  "ai-control-center-entry",
  "Connections",
  "Available models",
  "Task defaults",
  "Agents",
  "Knowledge & Search",
  "Tools &amp; external capabilities",
  "Permissions &amp; confirmations",
  "Agent execution",
  "Advanced settings",
  "Files &amp; data",
  "Privacy, usage &amp; retention",
  "Appearance",
  "Diagnostics &amp; maintenance",
  "How Automatic chooses a model",
  "data-strategy=\"Recommended\"",
  "data-route-select",
  "data-inline-model=\"Chat Studio\"",
  "Advanced model controls",
  "Default safety mode",
  "Ask every time",
  "Accept reviewed edits",
  "Bypass confirmations",
  "Google, Perplexity, gateways and media",
  "online JSON",
  "Review 113 models",
  "data-provider-detail-modal",
  "data-model-picker-modal",
  "data-file-types-modal",
  "data-folder-rules-modal",
  "data-external-tool-modal",
  "Peak Sheet",
  "Peak AI Graph",
  "Usage tracking",
  "Composer content width",
  "Composer & Copilot",
  "Vault Search & AI Search",
  "File Atlas & AI Graph",
  "Peak Hermes",
  "single Agent runtime",
  "Open Command Gateway",
  "External tool servers",
  "Generated media location",
  "Advanced controls for this action",
  "Total request timeout",
  "data-tree-toggle=\"composer\"",
  "data-add-connection",
  "data-settings-panel=\"ai\"",
  "data-settings-panel=\"agents\"",
  "obsidian-settings-sidebar",
  "peak-settings-tabs",
  "aria-current=\"page\"",
]);

if (settingsHtml.includes("content-header-actions")) {
  missing.push("Settings HTML: AI actions must not be placed in the page header");
}

const connectionsHeadingPosition = settingsHtml.indexOf("connection-section-heading");
const addConnectionPosition = settingsHtml.indexOf("data-add-connection");
const modelControlsPosition = settingsHtml.indexOf("model-controls-disclosure");
const controlCenterPosition = settingsHtml.indexOf("ai-control-center-entry");
if (addConnectionPosition < connectionsHeadingPosition) {
  missing.push("Settings HTML: Add connection must live in the Connections section");
}
if (controlCenterPosition < modelControlsPosition) {
  missing.push("Settings HTML: AI Control Center must follow the ordinary model controls");
}

requireValues("Onboarding HTML", onboardingHtml, [
  "Choose a first task",
  "Connect AI",
  "Check your vault",
  "Start a real task",
  "Ask my vault",
  "Work on this note",
  "Explore connections",
  "Run an Agent task",
  "Create an image",
  "SETUP COMPLETE",
  "First success happens",
  "data-wizard-panel=\"0\"",
  "data-wizard-panel=\"3\"",
]);

requireValues("Settings JS", settingsJs, [
  "function showPanel",
  "function showSaved",
  "function updateStrategySummary",
  "function filterCatalog",
  "function restoreActionAutomatic",
  "function toggleFocusedModal",
  "data-panel-target",
  "data-tree-toggle",
  "data-connection-modal",
]);

requireValues("Onboarding JS", onboardingJs, [
  "function showStep",
  "function selectGoal",
  "function selectProvider",
  "function updateIndexDemo",
  "data-launch-primary",
]);

requireValues("CSS", css, [
  ".package-frame",
  ".package-document-grid",
  ".settings-frame",
  ".obsidian-settings-shell",
  ".peak-settings-tabs",
  ".model-tree",
  ".automatic-policy",
  ".inline-model-select",
  ".safety-picker",
  ".command-gateway-card",
  ".feature-settings-detail",
  ".model-picker-modal",
  ".catalog-browser",
  ".wizard-shell",
  ".wizard-footer",
  "@media (max-width: 760px)",
  "@media (prefers-reduced-motion: reduce)",
]);

requireValues("README", readme, [
  "do not require a temporary localhost server",
  "Source-of-truth order",
  "Settings configurable capability inventory",
  "Historical evidence",
  "product feature → action group → concrete action",
  "Setup complete",
  "First success",
]);

const forbidden = ["http://127.0.0.1", "localhost:", "Standard / Advanced mode", "AI behavior"];
for (const value of forbidden) {
  if (settingsHtml.includes(value) || onboardingHtml.includes(value)) {
    missing.push(`Forbidden UI concept or server dependency: ${value}`);
  }
}

for (const value of ['<aside class="settings-sidebar">', '<nav class="settings-nav">']) {
  if (settingsHtml.includes(value)) missing.push(`Removed Peak sidebar returned: ${value}`);
}

for (const value of ['data-settings-panel="connections"', 'data-settings-panel="models"', 'data-panel-target="connections"', 'data-panel-target="models"']) {
  if (settingsHtml.includes(value)) missing.push(`Split AI configuration destination returned: ${value}`);
}

for (const value of ['data-settings-panel="tools"', 'data-panel-target="tools"', 'data-settings-panel="safety"', 'data-panel-target="safety"']) {
  if (settingsHtml.includes(value)) missing.push(`Split Agent configuration destination returned: ${value}`);
}

for (const value of ['data-settings-panel="overview"', 'data-panel-target="overview"', '>Tools &amp; Safety<']) {
  if (settingsHtml.includes(value)) missing.push(`Retired Settings destination returned: ${value}`);
}

const navOrder = [
  'data-panel-target="ai"',
  'data-panel-target="agents"',
  'data-panel-target="knowledge"',
  'data-panel-target="advanced"',
];
for (let index = 1; index < navOrder.length; index += 1) {
  if (settingsHtml.indexOf(navOrder[index - 1]) >= settingsHtml.indexOf(navOrder[index])) {
    missing.push(`Settings navigation order is incorrect: ${navOrder.join(' -> ')}`);
    break;
  }
}

for (const value of ['data-settings-panel="features"', 'data-panel-target="features"', 'data-panel-jump="features"']) {
  if (settingsHtml.includes(value)) missing.push(`Generic Features destination returned: ${value}`);
}

for (const value of ['data-settings-panel="data"', 'data-panel-target="data"', 'data-panel-jump="data"', 'data-settings-panel="appearance"', 'data-panel-target="appearance"', 'data-panel-jump="appearance"']) {
  if (settingsHtml.includes(value)) missing.push(`Low-frequency top-level destination returned: ${value}`);
}

for (const value of ['peak-settings-header', 'peak-heading', 'peak-header-actions', 'setup-header-button']) {
  if (settingsHtml.includes(value)) missing.push(`Redundant Settings toolbar returned: ${value}`);
}

for (const value of ['AI result reranking', '<h2>Index depth</h2>', 'class="execution-grid"', '<strong>AI Analysis reports</strong>', '<strong>Skills, Inbox &amp; custom prompts</strong>', '<strong>DataStore location</strong>', '<strong>Derived folders</strong>']) {
  if (settingsHtml.includes(value)) missing.push(`Retired or relocated Settings control returned: ${value}`);
}

for (const value of ['data-settings-search', 'data-search-trigger', 'data-search-popover', 'data-search-result']) {
  if (settingsHtml.includes(value)) missing.push(`Unnecessary Settings search returned: ${value}`);
}

function checkSymbols(label, html) {
  const symbols = new Set(Array.from(html.matchAll(/<symbol id="([^"]+)"/g), (match) => match[1]));
  const uses = new Set(Array.from(html.matchAll(/<use href="#([^"]+)"/g), (match) => match[1]));
  for (const use of uses) {
    if (!symbols.has(use)) missing.push(`${label}: missing SVG symbol #${use}`);
  }
}

function checkLocalAssets(label, html, htmlName) {
  const targets = Array.from(html.matchAll(/(?:href|src)="([^"#]+)"/g), (match) => match[1]);
  for (const target of targets) {
    if (/^(?:https?:|data:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(directory, path.dirname(htmlName), target);
    if (!fs.existsSync(resolved)) missing.push(`${label}: missing local target ${target}`);
  }
}

function checkDuplicateIds(label, html) {
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) missing.push(`${label}: duplicate id ${id}`);
    seen.add(id);
  }
}

checkSymbols("Settings HTML", settingsHtml);
checkSymbols("Onboarding HTML", onboardingHtml);
checkLocalAssets("Package HTML", packageHtml, "index.html");
checkLocalAssets("Settings HTML", settingsHtml, "settings.html");
checkLocalAssets("Onboarding HTML", onboardingHtml, "onboarding.html");
checkDuplicateIds("Settings HTML", settingsHtml);
checkDuplicateIds("Onboarding HTML", onboardingHtml);
checkDuplicateIds("Package HTML", packageHtml);

if (missing.length > 0) {
  console.error("Unified Settings / Onboarding mock validation failed:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Unified Settings / Onboarding mock validation passed.");
