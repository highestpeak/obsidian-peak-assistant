const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const goalContent = {
  search: {
    name: "Ask my vault",
    impact: "Peak will verify one AI connection and the existing local search index. It will not ask you to configure every model.",
    title: "Ask your vault",
    subtitle: "This opens AI Search with an editable question.",
    launch: "Open AI Search",
    prompt: "What am I currently working on, and which notes support it?",
  },
  composer: {
    name: "Work on this note",
    impact: "Peak will verify one conversation model, the current document and safe Copilot preview behavior.",
    title: "Work on a real note",
    subtitle: "This opens Composer with a safe Copilot prompt.",
    launch: "Open Composer",
    prompt: "Summarize the argument in this note and suggest the next section without changing the document.",
  },
  atlas: {
    name: "Explore connections",
    impact: "Peak will verify the local index and open File Atlas on a current or recently used document.",
    title: "Explore your note connections",
    subtitle: "This opens File Atlas on a real document context.",
    launch: "Open File Atlas",
    prompt: "Show the closest related notes and explain the strongest connection.",
  },
  chat: {
    name: "Start a conversation",
    impact: "Peak will verify one conversation model. Vault indexing is useful but does not block this task.",
    title: "Start a conversation",
    subtitle: "This opens Chat Studio with an editable starter prompt.",
    launch: "Open Chat Studio",
    prompt: "Help me decide what to work on next based on the context I provide.",
  },
  agent: {
    name: "Run an Agent task",
    impact: "Peak will verify Hermes, one compatible execution route, the working directory and safe default permissions.",
    title: "Run a safe Agent task",
    subtitle: "This opens Wizard with a review-first starter task.",
    launch: "Open Agent Wizard",
    prompt: "Review this project folder and propose a short plan. Do not edit anything yet.",
  },
  image: {
    name: "Create an image",
    impact: "Peak will verify one image generation route and a valid output folder. Vault indexing is not required.",
    title: "Create your first image",
    subtitle: "This opens Image Flow with an editable prompt.",
    launch: "Open Image Flow",
    prompt: "A quiet editorial illustration of connected ideas forming a knowledge map, restrained indigo and graphite palette.",
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
  state.step = Math.max(0, Math.min(3, step));
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
  $("[data-step-progress]").style.width = `${(state.step + 1) * 25}%`;
  $("[data-back]").disabled = state.step === 0;
  const nextButton = $("[data-next]");
  nextButton.hidden = state.step === 3;
  nextButton.disabled = state.step === 1 && !state.providerReady;
  const notes = [
    "Step 1 of 4 · Your choice only guides this setup.",
    `Step 2 of 4 · ${state.provider} will be verified before continuing.`,
    "Step 3 of 4 · Search is ready while enrichment continues.",
    "Setup complete · First success happens in the real workspace.",
  ];
  $("[data-footer-note]").textContent = notes[state.step];
}

function selectGoal(goal) {
  state.goal = goal;
  $$('[data-goal]').forEach((button) => button.classList.toggle("is-selected", button.dataset.goal === goal));
  const content = goalContent[goal];
  $("[data-goal-impact-title]").textContent = `For “${content.name}”`;
  $("[data-goal-impact-copy]").textContent = content.impact;
  $("[data-final-title]").textContent = content.title;
  $("[data-final-subtitle]").textContent = content.subtitle;
  $("[data-launch-label]").textContent = content.launch;
  $("[data-first-prompt]").value = content.prompt;
}

$$('[data-goal]').forEach((button) => {
  button.addEventListener("click", () => selectGoal(button.dataset.goal));
});

$("[data-more-goals]").addEventListener("click", () => {
  const panel = $("[data-more-goals-panel]");
  panel.hidden = !panel.hidden;
  $("[data-more-goals]").classList.toggle("is-open", !panel.hidden);
});

function selectProvider(provider) {
  state.provider = provider;
  const unavailable = provider === "Codex" || provider === "Claude Code";
  state.providerReady = !unavailable;
  $$('[data-provider]').forEach((button) => button.classList.toggle("is-selected", button.dataset.provider === provider));
  const stateLabel = $("[data-provider-state]");
  stateLabel.textContent = provider === "OpenAI" ? "Verified just now" : "Ready";
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
  $("[data-next]").disabled = state.step === 1 && unavailable;
  $("[data-footer-note]").textContent = unavailable
    ? `Step 2 of 4 · ${provider} needs its dedicated adapter before this task can continue.`
    : `Step 2 of 4 · ${provider} passed the minimum capability check.`;
}

$$('[data-provider]').forEach((button) => {
  button.addEventListener("click", () => selectProvider(button.dataset.provider));
});

$("[data-other-providers]").addEventListener("click", () => {
  const panel = $("[data-provider-options]");
  panel.hidden = !panel.hidden;
  $("[data-other-providers]").classList.toggle("is-open", !panel.hidden);
});

$$('.readiness-option').forEach((option) => {
  option.addEventListener("click", () => {
    $$('.readiness-option').forEach((candidate) => candidate.classList.remove("is-selected"));
    option.classList.add("is-selected");
    option.querySelector("input").checked = true;
  });
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

$$('[data-launch]').forEach((button) => {
  button.addEventListener("click", () => showToast(`Would open ${button.dataset.launch} · setup progress remains saved`));
});

$("[data-skip-setup]").addEventListener("click", () => showToast("Setup progress saved · you can continue from Settings"));

selectGoal(state.goal);
selectProvider(state.provider);
showStep(0);
