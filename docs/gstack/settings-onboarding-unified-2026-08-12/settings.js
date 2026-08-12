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
    $$('[data-segmented] button').forEach((candidate) => candidate.classList.remove("is-selected"));
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

$$('[data-switch]').forEach((input) => {
  input.addEventListener("change", () => showSaved());
});

$$('select').forEach((select) => {
  select.addEventListener("change", () => showSaved());
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("[data-connection-modal]").hidden = true;
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
    if (button.dataset.panelJump) return;
    showSaved("This row would open its focused detail view");
  });
});
