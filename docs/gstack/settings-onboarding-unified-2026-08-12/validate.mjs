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
  "View live progress",
  "Configure next run",
  "Keep the index current",
  "Processing &amp; recovery",
  "Models &amp; generated knowledge",
  "Summary lengths",
  "Advanced chunking",
  "knowledge-setting-detail",
  "Tools &amp; external capabilities",
  "Permissions &amp; confirmations",
  "Agent execution",
  "Execution model",
  "Advanced settings",
  "Files &amp; data",
  "Privacy, usage &amp; retention",
  "Appearance",
  "Diagnostics &amp; maintenance",
  "How Automatic chooses a model",
  "policy-choice-heading",
  "data-strategy=\"Recommended\"",
  "data-route-select",
  "data-model-trigger",
  "data-inline-model-menu",
  "data-inline-model-search",
  "data-inline-model-filter=\"reasoning\"",
  "data-inline-model-filter=\"web\"",
  "data-inline-model-result-count",
  "Grouped by Provider connection",
  "Advanced model settings…",
  "data-model-scope=\"image\"",
  "data-model-scope=\"web\"",
  "data-model-binding=\"hermes-execution\"",
  "Generate images &amp; covers",
  "Understand images &amp; documents",
  "connection-picker-modal",
  "Advanced model controls",
  "Default safety mode",
  "Ask every time",
  "Accept reviewed edits",
  "Bypass confirmations",
  "Google, Perplexity, gateways and media",
  "Manage model catalog",
  "Remote updates not connected",
  "data-model-catalog-modal",
  "Search model, provider, alias or capability",
  "data-model-alias",
  "Hermes eligibility is stricter than visibility",
  "data-provider-detail-modal",
  "data-model-picker-modal",
  "data-file-types-modal",
  "file-type-icon markdown",
  "file-type-icon pdf",
  "file-type-icon drawing",
  "file-type-icon text",
  "file-type-icon csv",
  "file-type-icon code",
  "file-type-icon canvas",
  "Plain text",
  "CSV",
  "JSON",
  "HTML",
  "Canvas",
  "Handled separately",
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
  "Data root",
  "Media root",
  "Auto-save AI analysis",
  "Inspector links",
  "Default attachment handling",
  "Agent Skills",
  "Remote URL (Streamable HTTP)",
  "data-settings-help-tooltip",
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
if (settingsHtml.includes("connection-summary")) {
  missing.push("Settings HTML: redundant connection summary must stay removed");
}
if (settingsHtml.includes("Saved analysis history")) {
  missing.push("Settings HTML: analysis history is a workspace destination, not a setting");
}
if (settingsHtml.includes("Generated media location")) {
  missing.push("Settings HTML: storage must use Data root and Media root rather than per-output folders");
}
if (settingsHtml.includes("<fieldset class=\"policy-choice-list\"")) {
  missing.push("Settings HTML: Automatic choices must not use a fieldset legend that breaks the panel border");
}
if (settingsHtml.includes("modal-more-connections")) {
  missing.push("Settings HTML: Add connection must use one unified provider list");
}
if (settingsHtml.includes("Refresh, processing and rebuild") || settingsHtml.includes("index-workspace-row")) {
  missing.push("Settings HTML: index workspace entry belongs in the top progress card, not Content included");
}
if (settingsJs.includes("openModelPicker(button)")) {
  missing.push("Settings JS: routine feature and action model selection must stay in the inline dropdown");
}
if (settingsHtml.includes("file-type-badge")) {
  missing.push("Settings HTML: file-type abbreviation badges must stay replaced by semantic icons");
}
if (/\b(?:DOCX|PPTX|XLSX)\b/.test(settingsHtml)) {
  missing.push("Settings HTML: Office formats must not appear as supported Knowledge Index file types");
}
if (settingsJs.includes("const textModels =")) {
  missing.push("Settings JS: one-representative-model-per-provider list must stay removed");
}
if (settingsHtml.includes("data-execution-provider")) {
  missing.push("Settings HTML: Agent execution must reuse the shared Provider-to-model picker rather than a hard-coded select");
}
if (settingsHtml.includes("Connected web search provider")) {
  missing.push("Settings HTML: Web access must expose the shared capability-aware Provider-to-model picker");
}

const hermesBindingCount = settingsHtml.match(/data-model-binding="hermes-execution"/g)?.length ?? 0;
if (hermesBindingCount !== 2) {
  missing.push("Settings HTML: AI & Models and Agents must mirror the same Hermes execution binding");
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

const initiallyOpenFeatureRows = settingsHtml.match(/(?:feature-row-shell|feature-row|action-group-toggle|action-groups) is-open/g) ?? [];
if (initiallyOpenFeatureRows.length > 0) {
  missing.push("Settings HTML: model feature tree must start fully collapsed");
}

const featureChildrenTags = settingsHtml.match(/<(?:div|section)[^>]*data-tree-children="[^"]+"[^>]*>/g) ?? [];
if (featureChildrenTags.length === 0 || featureChildrenTags.some((tag) => !/\shidden(?:\s|>)/.test(tag))) {
  missing.push("Settings HTML: every model feature child group must be hidden initially");
}

requireValues("Onboarding HTML", onboardingHtml, [
  "Connect AI",
  "Core models",
  "Prepare vault",
  "System check",
  "Try Peak",
  "Not configured",
  "Existing setup",
  "SQLite repair",
  "No AI connection yet",
  "Connect AI to Peak",
  "Use safe models for the core jobs",
  "Agent models must support tools, structured output and at least 64K context",
  "Make this vault searchable quickly",
  "Better SQLite is required",
  "data-sqlite-gate",
  "data-sqlite-retry",
  "Fast local index",
  "Semantic search and generated knowledge can be added later",
  "Check the parts Peak depends on",
  "7 required checks passed",
  "data-system-sqlite",
  "Peak Hermes",
  "Where do you want to start?",
  "wizard-progress-header",
  "feature-launch-grid",
  "data-preview-state=\"fresh\"",
  "data-preview-state=\"existing\"",
  "data-connection-empty",
  "data-connection-ready",
  "data-role-picker",
  "data-connection-banner-title",
  "data-vault-empty",
  "data-vault-progress",
  "data-vault-ready",
  "data-run-system-check",
  "Ask my vault",
  "Work on a note",
  "Chat Studio",
  "Vault Search",
  "AI Search",
  "Open File Atlas",
  "Open AI Graph",
  "Start Agent &amp; Wizard",
  "Create media",
  "SETUP COMPLETE",
  "workspace owns the first useful result",
  "data-wizard-panel=\"0\"",
  "data-wizard-panel=\"4\"",
]);

if (onboardingHtml.includes('<aside class="wizard-steps">')) {
  missing.push("Onboarding HTML: the setup steps must remain in the horizontal header rather than a sidebar");
}
const onboardingStepCount = onboardingHtml.match(/data-step-nav="[0-9]+"/g)?.length ?? 0;
if (onboardingStepCount !== 5) {
  missing.push("Onboarding HTML: exactly five necessary primary steps are required");
}
const requiredSystemCheckCount = onboardingHtml.match(/data-system-row(?:\s|>)/g)?.length ?? 0;
if (requiredSystemCheckCount !== 7) {
  missing.push("Onboarding HTML: System Check must include seven required checks, including Better SQLite and Vault search separately");
}
if (onboardingHtml.includes("data-first-prompt") || onboardingHtml.includes("data-launch-primary")) {
  missing.push("Onboarding HTML: the final launchpad must open features directly without another prompt form");
}
if (onboardingHtml.includes("SQLite backend") || onboardingHtml.includes("data-sqlite-backend")) {
  missing.push("Onboarding HTML: Better SQLite is mandatory and must not be presented as a backend choice");
}
if (onboardingHtml.includes("6 required checks passed")) {
  missing.push("Onboarding HTML: Better SQLite must remain a separate required System Check");
}
if (/\.wizard-steps\s+(?:strong|small)\s*\{[^}]*text-overflow:\s*ellipsis/s.test(css)) {
  missing.push("Onboarding CSS: desktop step labels must remain readable instead of truncating with ellipses");
}
if (!/\.wizard-steps\s*>\s*button\s*\{[^}]*flex:\s*1\s+1\s+0/s.test(css)) {
  missing.push("Onboarding CSS: desktop steps must share the available width equally");
}
if (!/\.wizard-step-line\s*\{[^}]*flex:\s*0\s+0\s+26px/s.test(css)) {
  missing.push("Onboarding CSS: connector lines must use a fixed width instead of squeezing step labels");
}

requireValues("Settings JS", settingsJs, [
  "function showPanel",
  "function showSaved",
  "function updateStrategySummary",
  "function filterManagedCatalog",
  "function openModelCatalog",
  "function restoreActionAutomatic",
  "function openInlineModelMenu",
  "function toggleInlineModelMenu",
  "function renderInlineModelOptions",
  "function modelsForScope",
  "function modelEligibility",
  "function automaticDescriptionFor",
  "function matchesInlineModel",
  "function updateModelTarget",
  "function toggleFocusedModal",
  "function updateFileTypeSummary",
  "function installSettingHelp",
  "function showSettingHelp",
  "const modelCatalog =",
  "gpt-5-mini",
  "claude-opus-4-7",
  "deepseek/deepseek-chat-v3",
  "qwen3:14b",
  "data-panel-target",
  "data-tree-toggle",
  "data-connection-modal",
  "aria-expanded",
]);

requireValues("Onboarding JS", onboardingJs, [
  "sqlitePhase: \"required\"",
  "preview === \"repair\"",
  "function showStep",
  "function setPreview",
  "function openConnectionForm",
  "function updateConnectionReadyState",
  "function applyRecommendedModels",
  "function renderRolePicker",
  "function openRolePicker",
  "function updateSqliteGate",
  "function prepareBetterSqlite",
  "if (state.sqlitePhase !== \"ready\") return;",
  "function startFastIndex",
  "function runSystemCheck",
  "data-launch-target",
]);

requireValues("CSS", css, [
  ".package-frame",
  ".package-document-grid",
  ".settings-frame",
  ".obsidian-settings-shell",
  ".peak-settings-tabs",
  ".model-tree",
  ".automatic-policy",
  ".policy-choice-heading",
  ".model-route-button",
  ".action-model-row",
  ".task-model-control",
  ".inline-model-menu",
  ".inline-model-search",
  ".inline-model-filters",
  "flex: 0 0 auto",
  "flex: 1 1 auto",
  ".inline-model-group-heading",
  ".inline-model-capabilities",
  ".inline-model-group > button.is-unavailable",
  ".execution-model-row",
  ".file-type-icon",
  ".file-type-icon.pdf",
  ".file-type-policy-note",
  ".safety-picker",
  ".command-gateway-card",
  ".feature-settings-detail",
  ".settings-help-tooltip",
  ".root-path-input",
  ".model-picker-modal",
  ".model-catalog-entry",
  ".model-catalog-modal",
  ".managed-model-row",
  ".action-setting-row",
  ".wizard-shell",
  ".wizard-progress-header",
  ".wizard-step-meta",
  ".readiness-strip",
  ".artifact-preview-switch",
  ".onboarding-provider-grid",
  ".core-role-list",
  ".onboarding-model-picker",
  ".sqlite-gate-card",
  ".sqlite-gate-meter",
  ".index-path-list",
  ".system-check-groups",
  ".feature-launch-grid",
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

for (const value of ['Personalized PageRank', 'data-tree-toggle="ambient-models"', '<strong>Ambient suggestions</strong>', '<strong>Vault Intelligence</strong>']) {
  if (settingsHtml.includes(value)) missing.push(`Deferred or internal Knowledge control returned: ${value}`);
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
