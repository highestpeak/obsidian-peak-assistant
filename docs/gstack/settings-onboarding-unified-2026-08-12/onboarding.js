const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const providers = {
  OpenAI: { monogram: "OA", mode: "key", count: 8, media: true, description: "Cloud connection · verified just now" },
  Anthropic: { monogram: "AN", mode: "key", count: 6, media: false, description: "Cloud connection · verified just now" },
  OpenRouter: { monogram: "OR", mode: "key", count: 24, media: true, description: "Online catalog · verified just now" },
  Ollama: { monogram: "OL", mode: "local", count: 6, media: false, description: "Local service · 6 models detected" },
  Codex: { monogram: "CX", mode: "adapter", count: 3, media: false, description: "Local authenticated connection · verified" },
  "Claude Code": { monogram: "CC", mode: "adapter", count: 3, media: false, description: "Local authenticated connection · verified" },
};

const modelCatalog = {
  OpenAI: {
    chat: [
      { id: "GPT-5 mini", meta: "Recommended · fast · tools · 128K", recommended: true },
      { id: "GPT-5", meta: "Higher quality · tools · 256K" },
    ],
    knowledge: [
      { id: "GPT-5", meta: "Recommended · reasoning · long context", recommended: true },
      { id: "GPT-5 mini", meta: "Lower cost · tools · 128K" },
    ],
    agent: [
      { id: "GPT-5", meta: "Recommended · tools · structured output · 256K", recommended: true },
      { id: "o3", meta: "Tools · reasoning · structured output · 200K" },
    ],
  },
  Anthropic: {
    chat: [{ id: "Claude Sonnet 4.6", meta: "Recommended · tools · long context", recommended: true }, { id: "Claude Haiku 4.5", meta: "Fast · tools · long context" }],
    knowledge: [{ id: "Claude Opus 4.6", meta: "Recommended · deep synthesis · 200K", recommended: true }, { id: "Claude Sonnet 4.6", meta: "Balanced · tools · 200K" }],
    agent: [{ id: "Claude Sonnet 4.6", meta: "Recommended · tools · structured output · 200K", recommended: true }],
  },
  OpenRouter: {
    chat: [{ id: "openai/gpt-5-mini", meta: "Recommended · tools · 128K", recommended: true }, { id: "anthropic/claude-sonnet-4.6", meta: "Tools · long context" }],
    knowledge: [{ id: "deepseek/deepseek-r1", meta: "Recommended · reasoning · long context", recommended: true }, { id: "anthropic/claude-opus-4.6", meta: "Deep synthesis · 200K" }],
    agent: [{ id: "openai/gpt-5", meta: "Recommended · tools · structured output", recommended: true }, { id: "anthropic/claude-sonnet-4.6", meta: "Tools · structured output" }],
  },
  Ollama: {
    chat: [{ id: "Qwen 3 8B", meta: "Recommended · local · 32K", recommended: true }, { id: "Gemma 3 12B", meta: "Local · vision · 128K" }],
    knowledge: [{ id: "Qwen 3 14B", meta: "Recommended · local reasoning · 32K", recommended: true }],
    agent: [{ id: "Qwen 3 14B", meta: "Verified tools · structured output · local", recommended: true }],
  },
  Codex: {
    chat: [{ id: "Codex default", meta: "Recommended · authenticated local adapter", recommended: true }],
    knowledge: [{ id: "Codex reasoning", meta: "Recommended · long context", recommended: true }],
    agent: [{ id: "Codex tool route", meta: "Verified tools · structured output", recommended: true }],
  },
  "Claude Code": {
    chat: [{ id: "Claude Code default", meta: "Recommended · authenticated local adapter", recommended: true }],
    knowledge: [{ id: "Claude Code reasoning", meta: "Recommended · long context", recommended: true }],
    agent: [{ id: "Claude Code tool route", meta: "Verified tools · structured output", recommended: true }],
  },
};

const roleCopy = {
  chat: { title: "Choose Chat & writing model", requirement: "Conversation, drafting, vision when available and at least 32K context", chips: ["Conversation", "Long context"] },
  knowledge: { title: "Choose Search & analysis model", requirement: "Reasoning and long-context synthesis for Vault work", chips: ["Reasoning", "Long context"] },
  agent: { title: "Choose Agent & tools model", requirement: "Only models verified for tools, structured output and at least 64K context", chips: ["Tools required", "Structured output", "64K+ context"] },
};

const state = {
  preview: "fresh",
  step: 0,
  highestStep: 0,
  provider: null,
  connectionReady: false,
  connectionFormOpen: false,
  indexPhase: "empty",
  indexCount: 0,
  activeRole: null,
  roleModels: { chat: "GPT-5 mini", knowledge: "GPT-5", agent: "GPT-5" },
};

let toastTimer;
let indexTimer;

function showToast(message) {
  const toast = $("[data-action-toast]");
  $("[data-action-toast-text]").textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2400);
}

function roleModelsFor(provider, role) {
  return modelCatalog[provider]?.[role] ?? [];
}

function applyRecommendedModels() {
  if (!state.provider) return;
  Object.keys(roleCopy).forEach((role) => {
    const first = roleModelsFor(state.provider, role)[0];
    if (first) state.roleModels[role] = first.id;
    $(`[data-role-provider="${role}"]`).textContent = state.provider;
    $(`[data-role-model-value="${role}"]`).textContent = first?.id ?? "No compatible model";
  });
  const count = Object.values(modelCatalog[state.provider] ?? {}).flat().length;
  $("[data-model-filter-summary]").textContent = `${providers[state.provider].count} catalog models → ${count} suitable role choices. Agent models must support tools, structured output and at least 64K context.`;
}

function updateConnectionReadyState() {
  const empty = $("[data-connection-empty]");
  const form = $("[data-connection-form]");
  const ready = $("[data-connection-ready]");
  empty.hidden = state.connectionReady || state.connectionFormOpen;
  form.hidden = state.connectionReady || !state.connectionFormOpen;
  ready.hidden = !state.connectionReady;
  $("[data-next]").disabled = state.step === 0 && !state.connectionReady;
  if (!state.connectionReady || !state.provider) return;
  const provider = providers[state.provider];
  $("[data-connection-banner-title]").textContent = `${state.provider} is connected`;
  $("[data-connection-banner-copy]").textContent = "Peak passed authentication, loaded compatible models and completed a minimum request.";
  $("[data-ready-provider-name]").textContent = state.provider;
  $("[data-ready-provider-copy]").textContent = provider.description;
  $("[data-ready-monogram]").textContent = provider.monogram;
  $("[data-compatible-model-count]").textContent = `${provider.count} found`;
  $("[data-system-provider]").textContent = `${state.provider} · authentication, catalog and minimum request passed`;
  $("[data-media-check]").textContent = provider.media ? `${state.provider} exposes a compatible image route` : "No compatible media route · configure only when needed";
  $("[data-media-launch-copy]").textContent = provider.media ? "Generate an image with the compatible route found during setup" : "Connect a media-capable provider when you first use this feature";
  applyRecommendedModels();
}

function openConnectionForm(providerName) {
  state.provider = providerName;
  state.connectionFormOpen = true;
  const provider = providers[providerName];
  $("[data-form-monogram]").textContent = provider.monogram;
  $("[data-form-title]").textContent = `Connect ${providerName}`;
  const isKey = provider.mode === "key";
  $("[data-api-field]").hidden = !isKey;
  $("[data-local-note]").hidden = isKey;
  if (provider.mode === "local") {
    $("[data-form-description]").textContent = "Peak found Ollama on this computer. Confirm the local service and installed models.";
    $("[data-local-title]").textContent = "Ollama detected at localhost:11434";
    $("[data-local-copy]").textContent = "6 installed models found · no API key required";
  } else if (provider.mode === "adapter") {
    $("[data-form-description]").textContent = `Peak will verify the local ${providerName} authenticated adapter.`;
    $("[data-local-title]").textContent = `${providerName} sign-in detected`;
    $("[data-local-copy]").textContent = "The connection will still pass the same model and capability checks";
  } else {
    $("[data-form-description]").textContent = `Paste a ${providerName} API key. It stays in Obsidian's local secret storage.`;
  }
  updateConnectionReadyState();
}

function setPreview(preview) {
  state.preview = preview;
  state.step = 0;
  state.highestStep = 0;
  state.activeRole = null;
  state.connectionFormOpen = false;
  window.clearInterval(indexTimer);
  if (preview === "existing") {
    state.provider = "OpenAI";
    state.connectionReady = true;
    state.indexPhase = "ready";
    state.indexCount = 4860;
  } else {
    state.provider = null;
    state.connectionReady = false;
    state.indexPhase = "empty";
    state.indexCount = 0;
  }
  $$('[data-preview-state]').forEach((button) => button.classList.toggle("is-active", button.dataset.previewState === preview));
  updateConnectionReadyState();
  updateVaultState();
  showStep(0);
}

function showStep(step) {
  state.step = Math.max(0, Math.min(4, step));
  state.highestStep = Math.max(state.highestStep, state.step);
  $$('[data-wizard-panel]').forEach((panel) => {
    const active = Number(panel.dataset.wizardPanel) === state.step;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$('[data-step-nav]').forEach((button) => {
    const buttonStep = Number(button.dataset.stepNav);
    button.classList.toggle("is-current", buttonStep === state.step);
    button.classList.toggle("is-complete", buttonStep < state.step || buttonStep < state.highestStep);
    button.disabled = buttonStep > state.highestStep;
  });
  $("[data-role-picker]").hidden = true;
  $("[data-back]").disabled = state.step === 0;
  const next = $("[data-next]");
  next.hidden = state.step === 4;
  next.disabled = state.step === 0 && !state.connectionReady;
  const names = ["Connect AI", "Core models", "Prepare vault", "System check", "Try Peak"];
  $("[data-step-summary]").textContent = `Step ${state.step + 1} of 5 · ${names[state.step]}`;
  const notes = [
    state.connectionReady ? `Step 1 of 5 · ${state.provider} passed the minimum check.` : "Step 1 of 5 · Connect and verify one service.",
    "Step 2 of 5 · Only role-compatible models are available here.",
    state.indexPhase === "ready" ? "Step 3 of 5 · Fast local search is ready." : "Step 3 of 5 · Build the fast local index first.",
    "Step 4 of 5 · Required checks pass; optional capabilities can wait.",
    "Setup complete · Choose a real Peak workspace above.",
  ];
  $("[data-footer-note]").textContent = notes[state.step];
  next.textContent = state.step === 2 && state.indexPhase === "empty" ? "Build fast index" : "Continue";
  if (state.step === 3) runSystemCheck(false);
}

function renderRolePicker(role, query = "") {
  const copy = roleCopy[role];
  const entries = roleModelsFor(state.provider, role).filter((entry) => `${entry.id} ${entry.meta}`.toLowerCase().includes(query.toLowerCase()));
  $("[data-role-picker-title]").textContent = copy.title;
  $("[data-role-picker-requirement]").textContent = copy.requirement;
  $("[data-role-requirements]").innerHTML = copy.chips.map((chip) => `<span>${chip}</span>`).join("");
  $("[data-role-picker-results]").innerHTML = entries.map((entry) => `
    <button data-role-option="${entry.id}" class="${state.roleModels[role] === entry.id ? "is-selected" : ""}">
      <span class="provider-monogram">${providers[state.provider].monogram}</span>
      <span><strong>${entry.id}</strong><small>${entry.meta}</small></span>
      ${entry.recommended ? "<em>Recommended</em>" : ""}
      <i><svg><use href="#i-check" /></svg></i>
    </button>`).join("") || "<span class=\"empty-model-results\">No compatible models match this search.</span>";
  $$('[data-role-option]').forEach((button) => button.addEventListener("click", () => {
    state.roleModels[role] = button.dataset.roleOption;
    $(`[data-role-model-value="${role}"]`).textContent = button.dataset.roleOption;
    $("[data-role-picker]").hidden = true;
  }));
}

function openRolePicker(role) {
  state.activeRole = role;
  $("[data-role-picker-search]").value = "";
  renderRolePicker(role);
  $("[data-role-picker]").hidden = false;
  $("[data-role-picker-search]").focus();
}

function updateVaultState() {
  $("[data-vault-empty]").hidden = state.indexPhase !== "empty";
  $("[data-vault-progress]").hidden = state.indexPhase !== "running";
  $("[data-vault-ready]").hidden = state.indexPhase !== "ready";
  if (state.preview === "existing" && state.indexPhase === "ready") {
    $("[data-vault-title]").textContent = "Reuse the search work already done";
    $("[data-vault-description]").textContent = "Peak found a working local full-text index. It only needs to check changed files before you continue.";
    $("[data-index-ready-copy]").textContent = "Existing full-text index reused · 24 changed files checked · 4,860 documents ready.";
  } else {
    $("[data-vault-title]").textContent = "Make this vault searchable quickly";
    $("[data-vault-description]").textContent = "Peak recommends a fast local full-text index first. Semantic search and generated knowledge can be added later without blocking setup.";
    $("[data-index-ready-copy]").textContent = "4,860 documents can be searched now. Richer knowledge can continue later.";
  }
}

function startFastIndex() {
  state.indexPhase = "running";
  state.indexCount = 0;
  updateVaultState();
  const next = $("[data-next]");
  next.disabled = true;
  next.textContent = "Building…";
  window.clearInterval(indexTimer);
  indexTimer = window.setInterval(() => {
    state.indexCount = Math.min(4860, state.indexCount + 486);
    const percent = Math.round((state.indexCount / 4860) * 100);
    $("[data-onboarding-index-count]").textContent = state.indexCount.toLocaleString("en-US");
    $("[data-onboarding-index-percent]").textContent = `${percent}%`;
    $("[data-onboarding-index-bar]").style.width = `${percent}%`;
    $("[data-index-eta]").textContent = percent < 70 ? `About ${Math.max(4, Math.round((100 - percent) * .45))} sec` : "Almost done";
    if (state.indexCount < 4860) return;
    window.clearInterval(indexTimer);
    state.indexPhase = "ready";
    updateVaultState();
    next.disabled = false;
    next.textContent = "Continue";
    $("[data-footer-note]").textContent = "Step 3 of 5 · Fast local search is ready.";
  }, 140);
}

function runSystemCheck(showMessage = true) {
  $$('[data-system-row]').forEach((row) => {
    row.classList.add("is-checking");
    row.querySelector("em").textContent = "Checking";
  });
  $("[data-system-summary-title]").textContent = "Checking required dependencies…";
  $("[data-system-summary-copy]").textContent = "Connection, model roles, runtime, index, storage and safety are being verified.";
  window.setTimeout(() => {
    $$('[data-system-row]').forEach((row) => {
      row.classList.remove("is-checking");
      row.querySelector("em").textContent = "Ready";
    });
    $("[data-system-summary-title]").textContent = "6 required checks passed";
    $("[data-system-summary-copy]").textContent = "Peak is ready for Chat, Search, Composer and Agent work. Two optional capabilities are not configured.";
    if (showMessage) showToast("System check complete · no blocking issues");
  }, 620);
}

$$('[data-preview-state]').forEach((button) => button.addEventListener("click", () => setPreview(button.dataset.previewState)));
$$('[data-connect-provider]').forEach((button) => button.addEventListener("click", () => openConnectionForm(button.dataset.connectProvider)));
$("[data-cancel-connection]").addEventListener("click", () => { state.connectionFormOpen = false; updateConnectionReadyState(); });
$("[data-change-connection]").addEventListener("click", () => { state.connectionReady = false; state.connectionFormOpen = false; updateConnectionReadyState(); });
$("[data-test-connection]").addEventListener("click", () => {
  const button = $("[data-test-connection]");
  button.disabled = true;
  button.textContent = "Testing…";
  window.setTimeout(() => {
    state.connectionReady = true;
    state.connectionFormOpen = false;
    button.disabled = false;
    button.textContent = "Test and use";
    updateConnectionReadyState();
    showToast(`${state.provider} connected · minimum request passed`);
  }, 720);
});

$$('[data-role-model]').forEach((button) => button.addEventListener("click", () => openRolePicker(button.dataset.roleModel)));
$("[data-role-picker-close]").addEventListener("click", () => { $("[data-role-picker]").hidden = true; });
$("[data-role-picker-search]").addEventListener("input", (event) => renderRolePicker(state.activeRole, event.target.value));
$("[data-run-system-check]").addEventListener("click", () => runSystemCheck(true));

$("[data-next]").addEventListener("click", () => {
  if (state.step === 2 && state.indexPhase === "empty") { startFastIndex(); return; }
  showStep(state.step + 1);
});
$("[data-back]").addEventListener("click", () => showStep(state.step - 1));
$$('[data-step-nav]').forEach((button) => button.addEventListener("click", () => {
  const step = Number(button.dataset.stepNav);
  if (step <= state.highestStep) showStep(step);
}));
$$('[data-launch-target]').forEach((button) => button.addEventListener("click", () => {
  const target = button.dataset.launchTarget;
  const fallback = target === "Composer" ? " · current note unavailable, opening the most recently used note" : "";
  showToast(`Opening ${target}${fallback}`);
}));
$("[data-skip-setup]").addEventListener("click", () => showToast("Setup progress saved · continue later from Settings"));

setPreview("fresh");
