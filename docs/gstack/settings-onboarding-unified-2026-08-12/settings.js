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

let selectedStrategy = "Balanced";
let selectedRoute = "Cloud allowed";

function updateStrategySummary() {
  $("[data-strategy-summary]").textContent = `${selectedStrategy} · ${selectedRoute}`;
}

$$('[data-strategy]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-strategy]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedStrategy = button.dataset.strategy;
    updateStrategySummary();
    showSaved("Strategy selected · preview before applying");
  });
});

$$('[data-route]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-route]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedRoute = button.dataset.route;
    updateStrategySummary();
    showSaved("Data route selected · preview before applying");
  });
});

$('[data-preview-strategy]').addEventListener("click", () => {
  showSaved("Preview · 12 inherited actions change · 3 manual choices stay");
});

$('[data-apply-strategy]').addEventListener("click", () => {
  showSaved(`Applied · ${selectedStrategy} + ${selectedRoute} · manual choices preserved`);
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
    $(".safety-explainer").classList.toggle("is-danger", mode === "Bypass confirmations");
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

$$('.modal-provider-list button, .modal-more-connections button').forEach((button) => {
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

$$('.feature-children > button:not([data-tree-toggle]), .action-groups button').forEach((button) => {
  button.addEventListener("click", () => {
    const featureChildren = button.closest('.feature-children');
    const featureRow = featureChildren?.previousElementSibling;
    const featureName = $('.feature-copy strong', featureRow)?.textContent ?? "Product feature";
    const actionName = $('strong', button)?.textContent ?? $('span', button)?.textContent ?? "Action";
    $('[data-model-breadcrumb]').textContent = `${featureName.toUpperCase()} · ACTION DEFAULT`;
    $('[data-model-action-title]').textContent = actionName.trim();
    restoreActionAutomatic();
    toggleFocusedModal("[data-model-picker-modal]", true);
  });
});

$$('[data-model-choice]').forEach((button) => {
  button.addEventListener("click", () => {
    $$('[data-model-choice]').forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    selectedActionModel = button.dataset.modelChoice;
  });
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
  toggleFocusedModal("[data-model-picker-modal]", false);
  showSaved(selectedActionModel === "Automatic" ? "Saved · action inherits automatic selection" : `Saved · action uses ${selectedActionModel}`);
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
  showSaved("All model choices now inherit Peak automatic selection");
});

$$('.setting-row-button, .connection-card').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.panelJump || button.dataset.connectionDetail || button.dataset.fileTypes !== undefined) return;
    showSaved("This row would open its focused detail view");
  });
});
