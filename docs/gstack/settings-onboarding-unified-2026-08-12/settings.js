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

$('[data-save-file-types]').addEventListener("click", () => {
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

const textModels = [
  { value: "Automatic", label: "Automatic", detail: "Peak selects a compatible model using your strategy and data route.", state: "Recommended" },
  { value: "OpenAI · GPT-5", label: "OpenAI · GPT-5", detail: "Reasoning, tools and structured output.", state: "Connected" },
  { value: "Anthropic · Claude Sonnet 4.6", label: "Anthropic · Claude Sonnet 4.6", detail: "Long context, tools and strong writing.", state: "Connected" },
  { value: "OpenRouter · DeepSeek R1", label: "OpenRouter · DeepSeek R1", detail: "Reasoning model from the online catalog.", state: "Connected" },
  { value: "Ollama · Qwen 3", label: "Ollama · Qwen 3", detail: "Local model detected on this computer.", state: "Local" },
];

const modelCatalogs = {
  text: textModels,
  agent: textModels.map((model) => model.value === "Automatic" ? { ...model, detail: "Peak selects a tool-capable model for this task." } : model),
  vision: [
    { value: "Automatic", label: "Automatic", detail: "Peak selects a model that can read the supplied images or documents.", state: "Recommended" },
    { value: "OpenAI · GPT-5", label: "OpenAI · GPT-5", detail: "Vision, document understanding and tool use.", state: "Connected" },
    { value: "Anthropic · Claude Sonnet 4.6", label: "Anthropic · Claude Sonnet 4.6", detail: "Vision and long-document understanding.", state: "Connected" },
  ],
  image: [
    { value: "Automatic", label: "Automatic", detail: "Peak selects an image-generation model that supports this action.", state: "Recommended" },
    { value: "OpenAI · GPT Image", label: "OpenAI · GPT Image", detail: "Generate and edit images from prompts and references.", state: "Connected" },
    { value: "fal.ai · FLUX Pro", label: "fal.ai · FLUX Pro", detail: "High-quality image generation through the media connection.", state: "Setup" },
    { value: "Custom · Local image route", label: "Custom · Local image route", detail: "Use a configured compatible local image endpoint.", state: "Optional" },
  ],
  embedding: [
    { value: "Automatic", label: "Automatic", detail: "Prefer a ready local embedding model, then a connected cloud model.", state: "Recommended" },
    { value: "Ollama · nomic-embed-text", label: "Ollama · nomic-embed-text", detail: "Local embedding model detected on this computer.", state: "Local" },
    { value: "OpenAI · text-embedding", label: "OpenAI · text-embedding", detail: "Cloud embedding route from the OpenAI connection.", state: "Connected" },
  ],
  media: [
    { value: "Automatic", label: "Automatic by media type", detail: "Use separate compatible routes for images, video, speech and music.", state: "Recommended" },
    { value: "OpenAI · Media routes", label: "OpenAI · Media routes", detail: "Use connected OpenAI image and audio capabilities where supported.", state: "Connected" },
    { value: "fal.ai · Media routes", label: "fal.ai · Media routes", detail: "Use configured fal.ai image, video, speech and music routes.", state: "Setup" },
  ],
  video: [
    { value: "Automatic", label: "Automatic", detail: "Use the first ready video-generation route.", state: "Recommended" },
    { value: "fal.ai · Video route", label: "fal.ai · Video route", detail: "Generate video through a configured fal.ai model.", state: "Setup" },
    { value: "Custom · Video route", label: "Custom · Video route", detail: "Use another compatible media endpoint.", state: "Optional" },
  ],
  speech: [
    { value: "Automatic", label: "Automatic", detail: "Use a ready speech model with the selected voice preset.", state: "Recommended" },
    { value: "OpenAI · Speech", label: "OpenAI · Speech", detail: "Speech generation from the OpenAI connection.", state: "Connected" },
    { value: "fal.ai · Speech route", label: "fal.ai · Speech route", detail: "Speech generation through a configured media route.", state: "Setup" },
  ],
  music: [
    { value: "Automatic", label: "Automatic", detail: "Use the first ready music-generation route.", state: "Recommended" },
    { value: "fal.ai · Music route", label: "fal.ai · Music route", detail: "Music generation through a configured media connection.", state: "Setup" },
    { value: "Custom · Music route", label: "Custom · Music route", detail: "Use another compatible music endpoint.", state: "Optional" },
  ],
};

function selectModelChoice(button) {
  $$('[data-model-choice]').forEach((candidate) => candidate.classList.remove("is-selected"));
  button.classList.add("is-selected");
  selectedActionModel = button.dataset.modelChoice;
}

function renderModelChoices(scope) {
  const group = $('[data-model-choice-group]');
  group.replaceChildren();
  const models = modelCatalogs[scope] ?? textModels;
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
  button.addEventListener("click", () => openModelPicker(button));
});

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
    currentModelTarget.dataset.modelValue = selectedActionModel;
    const parts = selectedActionModel.split(" · ");
    $('.model-route-kind', currentModelTarget).textContent = selectedActionModel === "Automatic" ? "Automatic" : parts.shift();
    $('.model-route-name', currentModelTarget).textContent = selectedActionModel === "Automatic" ? currentModelTarget.dataset.defaultModel : parts.join(" · ");
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
    target.dataset.modelValue = "Automatic";
    $('.model-route-kind', target).textContent = "Automatic";
    $('.model-route-name', target).textContent = target.dataset.defaultModel;
  });
  showSaved("All model choices now inherit Peak automatic selection");
});

$$('.setting-row-button, .connection-card').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.panelJump || button.dataset.connectionDetail || button.dataset.fileTypes !== undefined || button.dataset.folderRules !== undefined || button.dataset.addExternalTool !== undefined || button.dataset.openCommandGateway !== undefined) return;
    showSaved("This row would open its focused detail view");
  });
});
