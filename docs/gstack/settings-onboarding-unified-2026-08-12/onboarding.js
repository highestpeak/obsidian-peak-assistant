const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const goalContent = {
  search: {
    title: "Ask your vault",
    subtitle: "This opens AI Search with an editable question.",
    launch: "Open AI Search",
    prompt: "What am I currently working on, and which notes support it?",
    icon: "#i-search",
  },
  composer: {
    title: "Work on a real note",
    subtitle: "This opens Composer with a safe Copilot prompt.",
    launch: "Open Composer",
    prompt: "Summarize the argument in this note and suggest the next section without changing the document.",
    icon: "#i-file",
  },
  chat: {
    title: "Start a conversation",
    subtitle: "This opens Chat Studio with an editable starter prompt.",
    launch: "Open Chat Studio",
    prompt: "Help me decide what to work on next based on the context I provide.",
    icon: "#i-chat",
  },
  atlas: {
    title: "Explore your note connections",
    subtitle: "This opens File Atlas on a real document context.",
    launch: "Open File Atlas",
    prompt: "Show the closest related notes and explain the strongest connection.",
    icon: "#i-graph",
  },
};

const state = {
  step: 0,
  highestStep: 0,
  goal: "search",
  provider: "OpenAI",
  providerReady: true,
  indexCount: 4102,
};

let toastTimer;
let indexTimer;

function showToast(message) {
  const toast = $("[data-action-toast]");
  $("[data-action-toast-text]").textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function showStep(step) {
  state.step = Math.max(0, Math.min(2, step));
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
  $("[data-back]").disabled = state.step === 0;
  const nextButton = $("[data-next]");
  nextButton.hidden = state.step === 2;
  nextButton.disabled = state.step === 0 && !state.providerReady;
  const stepNames = ["Connect AI", "Check your vault", "Try Peak"];
  $("[data-step-summary]").textContent = `Step ${state.step + 1} of 3 · ${stepNames[state.step]}`;
  const notes = [
    `Step 1 of 3 · ${state.provider} will be verified before continuing.`,
    "Step 2 of 3 · Search is ready while enrichment continues.",
    "Setup complete · First success happens in the real workspace.",
  ];
  $("[data-footer-note]").textContent = notes[state.step];
}

function selectGoal(goal) {
  state.goal = goal;
  $$('[data-goal]').forEach((button) => button.classList.toggle("is-selected", button.dataset.goal === goal));
  const content = goalContent[goal];
  $("[data-final-title]").textContent = content.title;
  $("[data-final-subtitle]").textContent = content.subtitle;
  $("[data-launch-label]").textContent = content.launch;
  $("[data-first-prompt]").value = content.prompt;
  $("[data-final-icon] use").setAttribute("href", content.icon);
}

$$('[data-goal]').forEach((button) => {
  button.addEventListener("click", () => selectGoal(button.dataset.goal));
});

function selectProvider(provider) {
  state.provider = provider;
  const unavailable = provider === "Codex" || provider === "Claude Code";
  state.providerReady = !unavailable;
  $$('[data-provider]').forEach((button) => button.classList.toggle("is-selected", button.dataset.provider === provider));
  $("[data-provider-state]").textContent = provider === "OpenAI" ? "Verified just now" : "Available";
  const banner = unavailable
    ? { title: `${provider} needs its adapter`, copy: "This connection cannot pass the minimum capability check in the current build." }
    : provider === "Ollama"
      ? { title: "Ollama is available on this computer", copy: "Peak found the local service and six installed models. No API key is needed." }
      : provider === "OpenAI"
        ? { title: "OpenAI is already connected", copy: "Peak found a working service and can use it for Chat, Copilot and AI Search." }
        : { title: `${provider} is ready`, copy: "Peak found a compatible model and passed the minimum connection check." };
  $("[data-connection-banner-title]").textContent = banner.title;
  $("[data-connection-banner-copy]").textContent = banner.copy;
  const checkValues = unavailable
    ? { auth: "Not checked", model: "Adapter required", probe: "Unavailable in this build" }
    : provider === "Ollama"
      ? { auth: "Local service", model: "6 models detected", probe: "Verified just now" }
      : { auth: "Ready", model: "Compatible model found", probe: "Verified just now" };
  Object.entries(checkValues).forEach(([key, value]) => {
    $(`[data-check-value="${key}"]`).textContent = value;
    $(`[data-check-dot="${key}"]`).classList.toggle("action", unavailable);
  });
  $("[data-check-receipt]").textContent = unavailable
    ? `${provider} remains visible as a launch connection, but its dedicated adapter cannot be verified in the current build.`
    : "No Vault content was sent during this check.";
  $("[data-ready-provider]").textContent = `${provider} · ${unavailable ? "action required" : "verified"}`;
  $("[data-automatic-default-copy]").textContent = unavailable
    ? `Peak cannot apply a working AI default until ${provider} is ready.`
    : `Peak will use the local index, a compatible ${provider} model and review-first actions. You can change any of these later in Settings.`;
  $("[data-next]").disabled = state.step === 0 && unavailable;
  $("[data-footer-note]").textContent = unavailable
    ? `Step 1 of 3 · ${provider} needs its dedicated adapter before this task can continue.`
    : `Step 1 of 3 · ${provider} passed the minimum capability check.`;
}

$$('[data-provider]').forEach((button) => {
  button.addEventListener("click", () => selectProvider(button.dataset.provider));
});

$("[data-other-providers]").addEventListener("click", () => {
  const panel = $("[data-provider-options]");
  panel.hidden = !panel.hidden;
  $("[data-other-providers]").classList.toggle("is-open", !panel.hidden);
});

function updateIndexDemo() {
  state.indexCount = Math.min(4860, state.indexCount + 37);
  const percent = ((state.indexCount / 4860) * 100).toFixed(1);
  $("[data-onboarding-index-count]").textContent = state.indexCount.toLocaleString("en-US");
  $("[data-onboarding-index-percent]").textContent = `${percent}%`;
  $("[data-onboarding-index-bar]").style.width = `${percent}%`;
  if (state.indexCount >= 4860) window.clearInterval(indexTimer);
}

$("[data-refresh-vault]").addEventListener("click", () => {
  window.clearInterval(indexTimer);
  showToast("Vault status checked · existing progress preserved");
  indexTimer = window.setInterval(updateIndexDemo, 180);
  window.setTimeout(() => window.clearInterval(indexTimer), 1600);
});

$("[data-next]").addEventListener("click", () => showStep(state.step + 1));
$("[data-back]").addEventListener("click", () => showStep(state.step - 1));

$$('[data-step-nav]').forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.stepNav);
    if (step <= state.highestStep) showStep(step);
  });
});

$("[data-launch-primary]").addEventListener("click", () => {
  showToast(`${goalContent[state.goal].launch} · starter task carried into the real workspace`);
});

$("[data-skip-setup]").addEventListener("click", () => showToast("Setup progress saved · you can continue from Settings"));

selectGoal(state.goal);
selectProvider(state.provider);
showStep(0);
