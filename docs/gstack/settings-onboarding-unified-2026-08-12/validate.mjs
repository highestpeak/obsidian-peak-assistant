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
  "Settings",
  "Onboarding",
  "Knowledge Index 运行进度",
  "历史探索",
  "Superseded",
]);

requireValues("Settings HTML", settingsHtml, [
  "AI &amp; Models",
  "Connections",
  "Available models",
  "Task defaults",
  "Knowledge & Search",
  "Tools &amp; Safety",
  "Available tools",
  "Permissions &amp; confirmations",
  "Agent execution",
  "Feature settings",
  "Advanced & diagnostics",
  "Composer & Copilot",
  "Vault Search & AI Search",
  "File Atlas & AI Graph",
  "Peak Hermes",
  "data-settings-search",
  "data-tree-toggle=\"composer\"",
  "data-add-connection",
  "data-settings-panel=\"ai\"",
  "data-settings-panel=\"tools\"",
  "obsidian-settings-sidebar",
  "peak-settings-tabs",
  "aria-current=\"page\"",
]);

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
  ".wizard-shell",
  ".wizard-footer",
  "@media (max-width: 760px)",
  "@media (prefers-reduced-motion: reduce)",
]);

requireValues("README", readme, [
  "do not require a temporary localhost server",
  "Source-of-truth order",
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

for (const value of ['data-settings-panel="agent"', 'data-panel-target="agent"']) {
  if (settingsHtml.includes(value)) missing.push(`Split tools and safety destination returned: ${value}`);
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
