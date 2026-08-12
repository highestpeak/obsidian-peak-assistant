const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let saveToastTimer;

function showSaved(message = "Saved · applies immediately") {
  const toast = $("[data-save-toast]");
  toast.querySelector("span").textContent = message;
  toast.hidden = false;
  window.clearTimeout(saveToastTimer);
  saveToastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

function hideSettingHelp() {
  const tooltip = $("[data-settings-help-tooltip]");
  tooltip.hidden = true;
}

function showSettingHelp(row) {
  const tooltip = $("[data-settings-help-tooltip]");
  const message = row.dataset.settingHelp;
  if (!message) return;
  tooltip.textContent = message;
  tooltip.hidden = false;
  const bounds = row.getBoundingClientRect();
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - tooltip.offsetWidth - 12));
  let top = bounds.bottom + 7;
  if (top + tooltip.offsetHeight > window.innerHeight - 12) {
    top = bounds.top - tooltip.offsetHeight - 7;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
}

function installSettingHelp() {
  const rows = $$([
    ".setting-row-button",
    ".setting-row-control",
    ".knowledge-setting-detail > summary",
    ".knowledge-setting-detail > div > label",
    ".feature-settings-detail > summary",
    ".feature-settings-body > label",
  ].join(","));
  rows.forEach((row) => {
    const help = row.querySelector("small");
    const message = help?.textContent.trim();
    if (!message) return;
    row.dataset.settingHelp = message;
    row.addEventListener("mouseenter", () => showSettingHelp(row));
    row.addEventListener("mouseleave", hideSettingHelp);
    row.addEventListener("focusin", () => showSettingHelp(row));
    row.addEventListener("focusout", hideSettingHelp);
  });
  $(".settings-content").addEventListener("scroll", hideSettingHelp, { passive: true });
  window.addEventListener("resize", hideSettingHelp);
}

function showPanel(panelName) {
  $$('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === panelName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$('[data-panel-target]').forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panelTarget === panelName);
  });
  $(".settings-content").scrollTop = 0;
}

$$('[data-panel-target]').forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.panelTarget));
});

$$('[data-panel-jump]').forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.panelJump));
});

$$('[data-tree-toggle]').forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.treeToggle;
    const children = $(`[data-tree-children="${key}"]`);
    if (!children) return;
    const open = children.hidden;
    children.hidden = !open;
    children.classList.toggle("is-open", open);
    button.classList.toggle("is-open", open);
    button.closest(".feature-row-shell")?.classList.toggle("is-open", open);
  });
});

$$('[data-segmented] button').forEach((button) => {
  button.addEventListener("click", () => {
    $$('button', button.closest('[data-segmented]')).forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const explainer = $(".selection-explainer");
    const descriptions = {
      Fast: "Full-text lookup only. No embeddings or AI enrichment are required.",
      Semantic: "Full-text search plus embeddings for meaning-based discovery. Summaries and AI tags remain optional.",
      "Full knowledge": "Semantic search plus summaries, tags and additional knowledge signals where available.",
    };
    explainer.querySelector("strong").textContent = button.textContent;
    explainer.querySelector("span").textContent = descriptions[button.textContent];
    showSaved("Saved · new index work uses this depth");
  });
});

let selectedStrategy = "Recommended";
let selectedRoute = "cloud and local";

function updateStrategySummary() {
  $("[data-strategy-summary]").textContent = `${selectedStrategy} · ${selectedRoute}`;
}

$$('[data-strategy]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-strategy]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedStrategy = button.dataset.strategy;
    updateStrategySummary();
    showSaved("Automatic rule selected · manual model choices stay unchanged");
  });
});

$('[data-route-select]').addEventListener("change", (event) => {
  const labels = {
    "Cloud and this computer": "cloud and local",
    "Prefer this computer": "prefer this computer",
    "This computer only": "this computer only",
  };
  selectedRoute = labels[event.target.value];
  updateStrategySummary();
  showSaved("Processing location selected · manual model choices stay unchanged");
});

$('[data-preview-strategy]').addEventListener("click", () => {
  showSaved("Preview · 12 inherited actions change · 3 manual choices stay");
});

$('[data-apply-strategy]').addEventListener("click", () => {
  showSaved(`Applied · ${selectedStrategy} + ${selectedRoute} · manual choices preserved`);
});

$('[data-policy-reset]').addEventListener("click", () => {
  selectedStrategy = "Recommended";
  selectedRoute = "cloud and local";
  $$('[data-strategy]').forEach((candidate) => candidate.classList.toggle("is-selected", candidate.dataset.strategy === "Recommended"));
  $('[data-route-select]').selectedIndex = 0;
  updateStrategySummary();
  showSaved("Custom Automatic rule removed · product defaults restored");
});

const safetyDescriptions = {
  "Read only": "Peak may read, search and propose changes, but it cannot write or run commands.",
  "Ask every time": "Peak asks before every write, command, network or costly action.",
  "Accept reviewed edits": "Peak may apply scoped file edits after review; deletes and broader actions still ask.",
  "Bypass confirmations": "Peak runs allowed actions without asking. A persistent risk warning remains visible.",
};

$$('[data-safety]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-safety]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const mode = button.dataset.safety;
    $("[data-safety-summary]").textContent = mode;
    $("[data-safety-detail]").textContent = safetyDescriptions[mode];
    $("[data-safety-picker]").classList.toggle("is-danger", mode === "Bypass confirmations");
    $("[data-safety-picker]").open = false;
    showSaved(mode === "Bypass confirmations" ? "Saved · high-risk mode remains visibly active" : "Saved · new Agent tasks use this mode");
  });
});

$$('[data-switch]').forEach((input) => {
  input.addEventListener("change", () => showSaved());
});

$$('select').forEach((select) => {
  select.addEventListener("change", () => showSaved());
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeInlineModelMenu();
    $("[data-connection-modal]").hidden = true;
    $("[data-provider-detail-modal]").hidden = true;
    $("[data-file-types-modal]").hidden = true;
    $("[data-folder-rules-modal]").hidden = true;
    $("[data-external-tool-modal]").hidden = true;
    $("[data-model-picker-modal]").hidden = true;
  }
});

function toggleConnectionModal(open) {
  $("[data-connection-modal]").hidden = !open;
}

$$('[data-add-connection]').forEach((button) => {
  button.addEventListener("click", () => toggleConnectionModal(true));
});

$$('[data-close-modal]').forEach((button) => {
  button.addEventListener("click", () => toggleConnectionModal(false));
});

$("[data-connection-modal]").addEventListener("click", (event) => {
  if (event.target === $("[data-connection-modal]")) toggleConnectionModal(false);
});

function toggleFocusedModal(selector, open) {
  $(selector).hidden = !open;
}

$$('[data-connection-detail="OpenRouter"]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-provider-detail-modal]", true));
});

$$('[data-close-provider-detail]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-provider-detail-modal]", false));
});

$('[data-provider-detail-modal]').addEventListener("click", (event) => {
  if (event.target === $('[data-provider-detail-modal]')) toggleFocusedModal("[data-provider-detail-modal]", false);
});

$('[data-file-types]').addEventListener("click", () => toggleFocusedModal("[data-file-types-modal]", true));

$$('[data-close-file-types]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-file-types-modal]", false));
});

function updateFileTypeSummary() {
  const selectedTypes = $$('[data-file-types-modal] .file-type-list input:checked').map((input) => {
    return input.closest("label").querySelector("strong").textContent.trim();
  });
  const visibleTypes = selectedTypes.slice(0, 4);
  const moreCount = selectedTypes.length - visibleTypes.length;
  const visibleSummary = visibleTypes.length > 0 ? visibleTypes.join(", ") : "No document types";
  const suffix = moreCount > 0 ? ` and ${moreCount} more` : "";
  $('[data-file-type-summary]').textContent = `${visibleSummary}${suffix} included · Peak Sheet and AI Graph use their own policies`;
  $('[data-file-type-count]').textContent = `${selectedTypes.length} included`;
}

$('[data-save-file-types]').addEventListener("click", () => {
  updateFileTypeSummary();
  toggleFocusedModal("[data-file-types-modal]", false);
  showSaved("Saved · new and changed files use this scope");
});

$('[data-file-types-modal]').addEventListener("click", (event) => {
  if (event.target === $('[data-file-types-modal]')) toggleFocusedModal("[data-file-types-modal]", false);
});

$('[data-folder-rules]').addEventListener("click", () => toggleFocusedModal("[data-folder-rules-modal]", true));

$$('[data-close-folder-rules]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-folder-rules-modal]", false));
});

$('[data-save-folder-rules]').addEventListener("click", () => {
  toggleFocusedModal("[data-folder-rules-modal]", false);
  showSaved("Saved · folder scope will be applied to the next index run");
});

$('[data-folder-rules-modal]').addEventListener("click", (event) => {
  if (event.target === $('[data-folder-rules-modal]')) toggleFocusedModal("[data-folder-rules-modal]", false);
});

$$('[data-add-external-tool]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-external-tool-modal]", true));
});

$$('[data-close-external-tool]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-external-tool-modal]", false));
});

$('[data-test-external-tool]').addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.textContent = "Testing…";
  window.setTimeout(() => {
    button.textContent = "Test again";
    $('[data-save-external-tool]').disabled = false;
    showSaved("Connection ready · 6 tools discovered for review");
  }, 700);
});

$('[data-save-external-tool]').addEventListener("click", () => {
  toggleFocusedModal("[data-external-tool-modal]", false);
  showSaved("Connected · discovered tools remain disabled until reviewed");
});

$('[data-external-tool-modal]').addEventListener("click", (event) => {
  if (event.target === $('[data-external-tool-modal]')) toggleFocusedModal("[data-external-tool-modal]", false);
});

$('[data-open-command-gateway]').addEventListener("click", () => {
  showSaved("Command Gateway opens as a separate Obsidian workspace");
});

let activeCatalogFilter = "recommended";

function filterCatalog() {
  const query = $('[data-catalog-search]').value.trim().toLowerCase();
  let visible = 0;
  $$('[data-model-tags]').forEach((row) => {
    const searchable = `${row.textContent} ${row.dataset.modelTags}`.toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesFilter = row.dataset.modelTags.includes(activeCatalogFilter);
    row.hidden = !(matchesQuery && matchesFilter);
    if (!row.hidden) visible += 1;
  });
  $('[data-catalog-count]').textContent = `${visible} matching models shown`;
}

$$('.model-filter-chips button').forEach((button) => {
  button.addEventListener("click", () => {
    $$('.model-filter-chips button').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    activeCatalogFilter = button.textContent.trim().toLowerCase();
    filterCatalog();
    showSaved(`Catalog filter · ${button.textContent}`);
  });
});

$('[data-open-catalog]').addEventListener("click", () => {
  const browser = $('[data-catalog-browser]');
  browser.hidden = !browser.hidden;
  $('[data-open-catalog]').textContent = browser.hidden ? "Review 113 models" : "Hide model list";
  if (!browser.hidden) filterCatalog();
});

$('[data-catalog-search]').addEventListener("input", filterCatalog);

$('.catalog-footer-note .text-button').addEventListener("click", () => showSaved("Full catalog · 113 models grouped by capability and provider"));

$$('.modal-provider-list button').forEach((button) => {
  button.addEventListener("click", () => {
    const providerName = $('strong', button)?.textContent ?? button.textContent.trim();
    showSaved(`${providerName} · focused connection setup would open next`);
  });
});

$$('.execution-card').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.textContent.includes("Setup")) {
      showSaved("Execution route needs setup before use");
      return;
    }
    $$('.execution-card').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    showSaved("Saved · new Agent tasks use this route automatically");
  });
});

$('[data-review-safety]').addEventListener("click", () => showSaved("Effective rules · 6 remembered approvals · high-risk actions always ask"));

let selectedActionModel = "Automatic";
let currentModelTarget = null;

const modelCatalog = [
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "gpt-5", name: "GPT-5", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "128K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "gpt-5-mini", name: "GPT-5 mini", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "128K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "gpt-5-nano", name: "GPT-5 nano", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "128K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "o3", name: "o3", scopes: ["text"], capabilities: ["reasoning"], context: "200K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "o4-mini", name: "o4-mini", scopes: ["text"], capabilities: ["reasoning"], context: "200K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "gpt-4.1", name: "GPT-4.1", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "128K", state: "Connected" },

  { profile: "Anthropic Direct", provider: "Anthropic", monogram: "AN", id: "claude-opus-4-7", name: "Claude Opus 4.7", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "200K", state: "Connected" },
  { profile: "Anthropic Direct", provider: "Anthropic", monogram: "AN", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "200K", state: "Connected" },
  { profile: "Anthropic Direct", provider: "Anthropic", monogram: "AN", id: "claude-haiku-4-5", name: "Claude Haiku 4.5", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "200K", state: "Connected" },
  { profile: "Anthropic Direct", provider: "Anthropic", monogram: "AN", id: "claude-opus-4", name: "Claude Opus 4", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "200K", state: "Connected" },
  { profile: "Anthropic Direct", provider: "Anthropic", monogram: "AN", id: "claude-sonnet-4", name: "Claude Sonnet 4", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "200K", state: "Connected" },

  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "deepseek/deepseek-r1", name: "DeepSeek R1", scopes: ["text", "agent"], capabilities: ["reasoning", "tools"], context: "128K", state: "Catalog" },
  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "deepseek/deepseek-chat-v3", name: "DeepSeek V3", scopes: ["text", "agent"], capabilities: ["tools"], context: "128K", state: "Catalog" },
  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "qwen/qwen3-235b", name: "Qwen3 235B", scopes: ["text", "agent"], capabilities: ["reasoning", "tools"], context: "128K", state: "Catalog" },
  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", scopes: ["text", "agent", "vision"], capabilities: ["vision", "tools"], context: "2M", state: "Catalog" },
  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", scopes: ["text", "agent"], capabilities: ["tools"], context: "1M", state: "Catalog" },
  { profile: "OpenRouter", provider: "OpenRouter", monogram: "OR", id: "x-ai/grok-3", name: "Grok 3", scopes: ["text", "agent"], capabilities: ["reasoning", "tools"], context: "128K", state: "Catalog" },

  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "qwen3:14b", name: "Qwen3 14B", scopes: ["text", "agent"], capabilities: ["tools", "local"], context: "32K", state: "Local" },
  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "deepseek-r1:14b", name: "DeepSeek R1 14B", scopes: ["text", "agent"], capabilities: ["reasoning", "tools", "local"], context: "32K", state: "Local" },
  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "gemma3:12b", name: "Gemma 3 12B", scopes: ["text", "agent"], capabilities: ["tools", "local"], context: "128K", state: "Local" },
  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "llava:13b", name: "LLaVA 13B", scopes: ["text", "vision"], capabilities: ["vision", "local"], context: "4K", state: "Local" },
  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "llama3.3:70b", name: "Llama 3.3 70B", scopes: ["text", "agent"], capabilities: ["tools", "local"], context: "128K", state: "Local" },

  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "gpt-image-1", name: "GPT Image 1", scopes: ["image", "media"], capabilities: ["image"], state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "dall-e-3", name: "DALL·E 3", scopes: ["image", "media"], capabilities: ["image"], state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "text-embedding-3-large", name: "Text Embedding 3 Large", scopes: ["embedding"], capabilities: ["embedding"], context: "8K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "text-embedding-3-small", name: "Text Embedding 3 Small", scopes: ["embedding"], capabilities: ["embedding"], context: "8K", state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "tts-1-hd", name: "TTS 1 HD", scopes: ["speech", "media"], capabilities: ["speech"], state: "Connected" },
  { profile: "OpenAI Direct", provider: "OpenAI", monogram: "OA", id: "tts-1", name: "TTS 1", scopes: ["speech", "media"], capabilities: ["speech"], state: "Connected" },

  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "nomic-embed-text:latest", name: "nomic-embed-text", scopes: ["embedding"], capabilities: ["embedding", "local"], context: "8K", state: "Local" },
  { profile: "Ollama Local", provider: "Ollama", monogram: "OL", id: "mxbai-embed-large:latest", name: "mxbai-embed-large", scopes: ["embedding"], capabilities: ["embedding", "local"], context: "512", state: "Local" },

  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/flux-pro/v1.1-ultra", name: "FLUX 1.1 Pro Ultra", scopes: ["image", "media"], capabilities: ["image"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/flux/dev", name: "FLUX Dev", scopes: ["image", "media"], capabilities: ["image"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/recraft-v3", name: "Recraft V3", scopes: ["image", "media"], capabilities: ["image"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/kling-video/v2.1/pro", name: "Kling Video 2.1 Pro", scopes: ["video", "media"], capabilities: ["video"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/veo3", name: "Veo 3", scopes: ["video", "media"], capabilities: ["video"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/minimax/speech-02-hd", name: "MiniMax Speech 02 HD", scopes: ["speech", "media"], capabilities: ["speech"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/minimax-music/v2", name: "MiniMax Music V2", scopes: ["music", "media"], capabilities: ["music"], state: "Setup" },
  { profile: "fal.ai Media", provider: "fal.ai", monogram: "FA", id: "fal-ai/ace-step", name: "ACE-Step", scopes: ["music", "media"], capabilities: ["music"], state: "Setup" },
];

const capabilityLabels = {
  reasoning: "Reasoning",
  vision: "Vision",
  tools: "Tools",
  local: "Local",
  image: "Image",
  embedding: "Embedding",
  video: "Video",
  speech: "Speech",
  music: "Music",
};

const automaticDescriptions = {
  text: "Peak chooses a compatible conversation model from your ready connections.",
  agent: "Peak chooses a tool-capable model for this Agent task.",
  vision: "Peak chooses a model that can read the supplied images or documents.",
  image: "Peak chooses a ready image-generation model for this action.",
  embedding: "Peak prefers a ready local embedding model, then a connected cloud model.",
  media: "Peak chooses a compatible route for the requested media type.",
  video: "Peak chooses the first ready video-generation model.",
  speech: "Peak chooses a ready speech model with the selected voice preset.",
  music: "Peak chooses the first ready music-generation model.",
};

function modelsForScope(scope) {
  return modelCatalog.filter((model) => model.scopes.includes(scope ?? "text"));
}

function selectModelChoice(button) {
  $$('[data-model-choice]').forEach((candidate) => candidate.classList.remove("is-selected"));
  button.classList.add("is-selected");
  selectedActionModel = button.dataset.modelChoice;
}

function renderModelChoices(scope) {
  const group = $('[data-model-choice-group]');
  group.replaceChildren();
  const models = [
    { value: "Automatic", label: "Automatic", detail: automaticDescriptions[scope] ?? automaticDescriptions.text, state: "Recommended" },
    ...modelsForScope(scope).map((model) => ({
      value: `${model.provider} · ${model.name}`,
      label: `${model.profile} · ${model.name}`,
      detail: `${model.id} · ${model.capabilities.map((capability) => capabilityLabels[capability]).join(" · ")}${model.context ? ` · ${model.context}` : ""}`,
      state: model.state,
    })),
  ];
  for (const model of models) {
    const button = document.createElement("button");
    button.dataset.modelChoice = model.value;
    button.classList.toggle("is-selected", model.value === selectedActionModel);
    button.innerHTML = `<span><strong>${model.label}</strong><small>${model.detail}</small></span><em>${model.state}</em>`;
    button.addEventListener("click", () => selectModelChoice(button));
    group.append(button);
  }
}

function describeModelChoice(target) {
  if (target.dataset.modelValue !== "Automatic") return target.dataset.modelValue;
  return `Automatic · ${target.dataset.defaultModel}`;
}

function updateModelTarget(target, modelValue) {
  target.dataset.modelValue = modelValue;
  const parts = modelValue.split(" · ");
  $('.model-route-kind', target).textContent = modelValue === "Automatic" ? "Automatic" : parts.shift();
  $('.model-route-name', target).textContent = modelValue === "Automatic" ? target.dataset.defaultModel : parts.join(" · ");
}

let activeInlineModelFilter = "all";

function closeInlineModelMenu() {
  const menu = $('[data-inline-model-menu]');
  menu.hidden = true;
  menu.removeAttribute("data-scope");
  $$('[data-model-trigger]').forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function positionInlineModelMenu(target) {
  const menu = $('[data-inline-model-menu]');
  const anchor = $('.task-model-control', target) ?? target;
  const rect = anchor.getBoundingClientRect();
  const menuWidth = Math.min(480, window.innerWidth - 24);
  const pagePadding = 12;
  const navigationSafeTop = 82;
  const left = Math.min(window.innerWidth - menuWidth - pagePadding, Math.max(pagePadding, rect.right - menuWidth));
  menu.style.width = `${menuWidth}px`;
  menu.style.maxHeight = `${Math.min(600, Math.max(320, window.innerHeight - navigationSafeTop - pagePadding))}px`;
  menu.style.left = `${left}px`;
  menu.style.top = `${rect.bottom + 5}px`;
  menu.hidden = false;
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom <= window.innerHeight - pagePadding) return;
  menu.style.top = `${Math.max(navigationSafeTop, rect.top - menuRect.height - 5)}px`;
}

function modelValue(model) {
  return `${model.provider} · ${model.name}`;
}

function matchesInlineModel(model, query) {
  const searchable = [
    model.profile,
    model.provider,
    model.id,
    model.name,
    model.state,
    ...model.capabilities.map((capability) => capabilityLabels[capability] ?? capability),
  ].join(" ").toLowerCase();
  return !query || searchable.includes(query);
}

function wireInlineModelKeyboard(button) {
  button.addEventListener("keydown", (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const options = $$('[data-inline-model-option]', $('[data-inline-model-menu]'));
    const index = options.indexOf(button);
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(options.length - 1, index + 1)
      : Math.max(0, index - 1);
    options[nextIndex]?.focus();
  });
}

function createInlineAutomaticOption(target, query) {
  if (query && !`automatic ${target.dataset.defaultModel}`.toLowerCase().includes(query)) return null;
  const button = document.createElement("button");
  const selected = target.dataset.modelValue === "Automatic";
  button.className = "inline-model-auto";
  button.dataset.inlineModelOption = "automatic";
  button.classList.toggle("is-selected", selected);
  button.innerHTML = `<span class="inline-model-monogram"><svg><use href="#i-sparkles"></use></svg></span><span class="inline-model-copy"><strong>Automatic · ${target.dataset.defaultModel}</strong><small>${automaticDescriptions[target.dataset.modelScope] ?? automaticDescriptions.text}</small></span><em>Recommended</em>${selected ? '<svg><use href="#i-check"></use></svg>' : '<i></i>'}`;
  button.addEventListener("click", () => commitInlineModelChoice(target, "Automatic"));
  wireInlineModelKeyboard(button);
  return button;
}

function commitInlineModelChoice(target, value) {
  updateModelTarget(target, value);
  closeInlineModelMenu();
  target.focus();
  const scopeName = target.dataset.action === "Feature default" ? "feature" : "action";
  showSaved(value === "Automatic" ? `Saved · ${scopeName} uses automatic selection` : `Saved · ${scopeName} uses ${value}`);
}

function createInlineModelRow(target, model) {
  const button = document.createElement("button");
  const selected = modelValue(model) === target.dataset.modelValue;
  const capabilityTags = model.capabilities
    .slice(0, 3)
    .map((capability) => `<span>${capabilityLabels[capability] ?? capability}</span>`)
    .join("");
  button.dataset.inlineModelOption = model.id;
  button.dataset.modelId = model.id;
  button.classList.toggle("is-selected", selected);
  button.innerHTML = `<span class="inline-model-monogram">${model.monogram}</span><span class="inline-model-copy"><strong>${model.name}</strong><small>${model.id}</small><span class="inline-model-capabilities">${capabilityTags}${model.context ? `<span>${model.context}</span>` : ""}</span></span>${selected ? '<svg><use href="#i-check"></use></svg>' : '<i></i>'}`;
  button.addEventListener("click", () => commitInlineModelChoice(target, modelValue(model)));
  wireInlineModelKeyboard(button);
  return button;
}

function renderInlineModelOptions() {
  if (!currentModelTarget) return;
  const options = $('[data-inline-model-options]');
  options.replaceChildren();
  const query = $('[data-inline-model-search]').value.trim().toLowerCase();
  const automaticOption = createInlineAutomaticOption(currentModelTarget, query);
  if (automaticOption) options.append(automaticOption);

  const models = modelsForScope(currentModelTarget.dataset.modelScope)
    .filter((model) => activeInlineModelFilter === "all" || model.capabilities.includes(activeInlineModelFilter))
    .filter((model) => matchesInlineModel(model, query));
  const groups = new Map();
  for (const model of models) {
    const group = groups.get(model.profile) ?? [];
    group.push(model);
    groups.set(model.profile, group);
  }

  for (const [profile, groupModels] of groups) {
    const group = document.createElement("section");
    group.className = "inline-model-group";
    const heading = document.createElement("div");
    heading.className = "inline-model-group-heading";
    heading.innerHTML = `<span class="inline-model-monogram">${groupModels[0].monogram}</span><strong>${profile}</strong><small>${groupModels.length} model${groupModels.length === 1 ? "" : "s"}</small>`;
    group.append(heading);
    for (const model of groupModels) group.append(createInlineModelRow(currentModelTarget, model));
    options.append(group);
  }

  $('[data-inline-model-result-count]').textContent = `${models.length} compatible model${models.length === 1 ? "" : "s"}`;
  $('[data-inline-model-empty]').hidden = models.length > 0 || Boolean(automaticOption);
  $('[data-inline-model-search-clear]').hidden = query.length === 0;
}

function openInlineModelMenu(target) {
  currentModelTarget = target;
  activeInlineModelFilter = "all";
  $$('[data-inline-model-filter]').forEach((button) => button.classList.toggle("is-selected", button.dataset.inlineModelFilter === "all"));
  const search = $('[data-inline-model-search]');
  search.value = "";
  const menu = $('[data-inline-model-menu]');
  menu.dataset.scope = target.dataset.modelScope ?? "text";
  $$('[data-model-trigger]').forEach((button) => button.setAttribute("aria-expanded", "false"));
  target.setAttribute("aria-expanded", "true");
  renderInlineModelOptions();
  positionInlineModelMenu(target);
  window.requestAnimationFrame(() => search.focus());
}

function toggleInlineModelMenu(target) {
  const menu = $('[data-inline-model-menu]');
  const isCurrentMenuOpen = !menu.hidden && currentModelTarget === target;
  if (isCurrentMenuOpen) {
    closeInlineModelMenu();
    return;
  }
  openInlineModelMenu(target);
}

function openModelPicker(target) {
  currentModelTarget = target;
  selectedActionModel = target.dataset.modelValue ?? "Automatic";
  const isFeatureDefault = target.dataset.action === "Feature default";
  $('[data-model-breadcrumb]').textContent = isFeatureDefault ? `${target.dataset.feature.toUpperCase()} · FEATURE DEFAULT` : `${target.dataset.feature.toUpperCase()} · ACTION DEFAULT`;
  $('[data-model-action-title]').textContent = isFeatureDefault ? target.dataset.feature : target.dataset.action;
  $('[data-model-picker-description]').textContent = isFeatureDefault ? "Choose the default used by this feature. Individual actions can still override it." : "Choose a model for this action without changing the rest of the feature.";
  $('[data-current-model-path]').textContent = isFeatureDefault ? "Automatic rule → this feature" : "Automatic rule → feature default → this action";
  $('[data-current-model-value]').textContent = describeModelChoice(target);
  $('[data-picker-advanced]').hidden = !["text", "vision", "agent"].includes(target.dataset.modelScope);
  $('[data-model-detail-note]').textContent = isFeatureDefault ? "This changes the feature default only. Existing action overrides remain unchanged." : "This changes only this action. The feature default and Provider connection remain unchanged.";
  $('[data-save-model-choice]').textContent = isFeatureDefault ? "Save feature default" : "Save action default";
  renderModelChoices(target.dataset.modelScope);
  toggleFocusedModal("[data-model-picker-modal]", true);
}

$$('[data-model-trigger]').forEach((button) => {
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleInlineModelMenu(button);
  });
});

$('[data-inline-model-menu]').addEventListener("click", (event) => event.stopPropagation());

$('[data-inline-model-search]').addEventListener("input", renderInlineModelOptions);
$('[data-inline-model-search]').addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeInlineModelMenu();
    currentModelTarget?.focus();
    return;
  }
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  $('[data-inline-model-option]', $('[data-inline-model-menu]'))?.focus();
});

$('[data-inline-model-search-clear]').addEventListener("click", () => {
  const search = $('[data-inline-model-search]');
  search.value = "";
  renderInlineModelOptions();
  search.focus();
});

$$('[data-inline-model-filter]').forEach((button) => {
  button.addEventListener("click", () => {
    activeInlineModelFilter = button.dataset.inlineModelFilter;
    $$('[data-inline-model-filter]').forEach((candidate) => candidate.classList.toggle("is-selected", candidate === button));
    renderInlineModelOptions();
    $('[data-inline-model-search]').focus();
  });
});

$('[data-inline-model-advanced]').addEventListener("click", (event) => {
  event.stopPropagation();
  closeInlineModelMenu();
  if (currentModelTarget) openModelPicker(currentModelTarget);
});

document.addEventListener("click", closeInlineModelMenu);
$('.settings-content').addEventListener("scroll", closeInlineModelMenu);
window.addEventListener("resize", closeInlineModelMenu);

function restoreActionAutomatic() {
  selectedActionModel = "Automatic";
  $$('[data-model-choice]').forEach((candidate) => candidate.classList.toggle("is-selected", candidate.dataset.modelChoice === "Automatic"));
}

$('[data-restore-action-auto]').addEventListener("click", () => {
  restoreActionAutomatic();
  showSaved("Action override removed · automatic selection restored");
});

$$('[data-close-model-picker]').forEach((button) => {
  button.addEventListener("click", () => toggleFocusedModal("[data-model-picker-modal]", false));
});

$('[data-save-model-choice]').addEventListener("click", () => {
  if (currentModelTarget) {
    updateModelTarget(currentModelTarget, selectedActionModel);
  }
  toggleFocusedModal("[data-model-picker-modal]", false);
  const scopeName = currentModelTarget?.dataset.action === "Feature default" ? "feature" : "action";
  showSaved(selectedActionModel === "Automatic" ? `Saved · ${scopeName} inherits automatic selection` : `Saved · ${scopeName} uses ${selectedActionModel}`);
});

$('[data-model-picker-modal]').addEventListener("click", (event) => {
  if (event.target === $('[data-model-picker-modal]')) toggleFocusedModal("[data-model-picker-modal]", false);
});

$$('[data-run-check]').forEach((button) => {
  button.addEventListener("click", () => {
    const original = button.textContent;
    button.textContent = "Checking…";
    button.disabled = true;
    window.setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
      showSaved("System check complete · no new issues");
    }, 900);
  });
});

$("[data-reset-models]").addEventListener("click", () => {
  $$('[data-model-trigger]').forEach((target) => {
    updateModelTarget(target, "Automatic");
  });
  showSaved("All model choices now inherit Peak automatic selection");
});

$$('.setting-row-button, .connection-card').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.panelJump || button.dataset.connectionDetail || button.dataset.fileTypes !== undefined || button.dataset.folderRules !== undefined || button.dataset.addExternalTool !== undefined || button.dataset.openCommandGateway !== undefined) return;
    showSaved("This row would open its focused detail view");
  });
});

$$('[data-setting-input]').forEach((input) => {
  input.addEventListener("change", () => showSaved());
});

installSettingHelp();
