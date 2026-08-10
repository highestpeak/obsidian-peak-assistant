(function (global) {
  "use strict";

  var catalog = global.PeakUICatalog;
  if (!catalog) throw new Error("PeakUICatalog must load before catalog-runtime.js");

  function scene(id) {
    return catalog.scenes.find(function (item) { return item.id === id; });
  }

  function activateScene(sceneRoot, state) {
    if (!sceneRoot || !state) return;
    sceneRoot.dataset.activeState = state;
    sceneRoot.querySelectorAll("[data-scene-state]").forEach(function (button) {
      var active = button.dataset.sceneState === state;
      if (button.classList.contains("pkfa-atlas-tab") && button.dataset.sceneState === "graph") {
        active = state === "graph" || state === "ai-graph";
      }
      button.dataset.selected = String(active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-selected", String(active));
      if (button.classList.contains("pkfa-atlas-tab") || button.classList.contains("pkfa-graph-scope-tab")) {
        button.classList.toggle("is-active", active);
      }
      if (button.classList.contains("pk-sidecar-tab")) {
        button.classList.toggle("pk-sidecar-tab--active", active);
      }
    });
    sceneRoot.querySelectorAll("[data-scene-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.scenePanel !== state;
    });
    var atlasRoot = sceneRoot.querySelector(".pkfa-root");
    if (atlasRoot) {
      atlasRoot.dataset.subview = state === "tree" ? "tree" : "graph";
      var atlasHint = atlasRoot.querySelector(".pkfa-tab-hint");
      if (atlasHint) {
        atlasHint.textContent = state === "tree"
          ? "Outline of every block, resource & heading in this note"
          : "Read-only neighborhood of the current note";
      }
    }
    var title = sceneRoot.querySelector("[data-active-state-label]");
    var meta = scene(sceneRoot.dataset.sceneId);
    if (title && meta) {
      var stateMeta = meta.states.find(function (item) { return item.id === state; });
      title.textContent = stateMeta ? stateMeta.label : state;
    }
  }

  function activateGroup(group, value) {
    if (!group) return;
    group.querySelectorAll("[data-group-option]").forEach(function (button) {
      var active = button.dataset.groupOption === value;
      button.dataset.selected = String(active);
      button.setAttribute("aria-pressed", String(active));
      if (button.classList.contains("pkfa-preset-tab")) button.classList.toggle("is-active", active);
    });
    if (group.classList.contains("pk-segmented")) {
      var selectedOption = group.querySelector('[data-group-option="' + value + '"]');
      var thumb = group.querySelector(".pk-segmented__thumb");
      if (selectedOption && thumb && thumb.parentElement !== selectedOption) selectedOption.prepend(thumb);
    }
    var attribute = group.dataset.groupAttribute;
    if (attribute) {
      var scope = group.closest("[data-group-scope]");
      if (scope) {
        scope.dataset[attribute] = value;
        if (attribute === "displayState") {
          var paper = scope.querySelector(".pk-composer-shell");
          if (paper) paper.dataset.displayState = value === "markdown" ? "clean" : value;
        }
      }
    }
    var target = group.dataset.groupTarget;
    if (!target) return;
    document.querySelectorAll('[data-group-panel="' + target + '"]').forEach(function (panel) {
      panel.hidden = panel.dataset.groupValue !== value;
    });
  }

  function renderEvidence() {
    document.querySelectorAll("[data-scene-evidence]").forEach(function (root) {
      var meta = scene(root.closest("[data-scene-id]").dataset.sceneId);
      if (!meta) return;
      root.replaceChildren();
      var kinds = [
        ["Production", meta.production],
        ["Design", meta.designs]
      ];
      kinds.forEach(function (entry) {
        var group = document.createElement("div");
        group.className = "catalog-source-group";
        var label = document.createElement("span");
        label.className = "catalog-source-group__label";
        label.textContent = entry[0];
        group.appendChild(label);
        entry[1].forEach(function (path) {
          var link = document.createElement("a");
          link.className = "pk-chip catalog-source-link";
          link.href = path;
          link.textContent = path.split("/").pop();
          link.title = path;
          group.appendChild(link);
        });
        root.appendChild(group);
      });
      var reference = document.createElement("button");
      reference.className = "pk-btn pk-btn--sm";
      reference.dataset.referenceOpen = meta.id;
      reference.textContent = "录屏证据 · " + meta.references.length;
      root.appendChild(reference);
    });
  }

  function openReferences(sceneId) {
    var meta = scene(sceneId);
    var modal = document.querySelector("[data-reference-modal]");
    var body = modal && modal.querySelector("[data-reference-body]");
    if (!meta || !modal || !body) return;
    modal.querySelector("[data-reference-title]").textContent = meta.title + " · 真实录屏";
    body.replaceChildren();
    meta.references.forEach(function (item) {
      var figure = document.createElement("figure");
      figure.className = "pk-reference-card";
      var image = document.createElement("img");
      image.src = item.image;
      image.alt = item.label;
      var caption = document.createElement("figcaption");
      caption.textContent = item.second + "s · " + item.label;
      figure.append(image, caption);
      body.appendChild(figure);
    });
    modal.hidden = false;
    modal.querySelector("button").focus();
  }

  function closeReferences() {
    var modal = document.querySelector("[data-reference-modal]");
    if (modal) modal.hidden = true;
  }

  function selectRow(row) {
    var list = row.closest("[data-selectable-list]");
    if (!list) return;
    list.querySelectorAll("[data-selectable-row]").forEach(function (candidate) {
      var selected = candidate === row;
      candidate.dataset.selected = String(selected);
      candidate.setAttribute("aria-selected", String(selected));
    });
    var target = list.dataset.inspectorTarget;
    if (!target) return;
    var inspector = document.querySelector('[data-inspector="' + target + '"]');
    if (!inspector) return;
    inspector.querySelectorAll("[data-inspector-title]").forEach(function (node) {
      node.textContent = row.dataset.rowTitle || "Selected item";
    });
    inspector.querySelectorAll("[data-inspector-path]").forEach(function (node) {
      node.textContent = row.dataset.rowPath || "Vault / Notes";
    });
    inspector.dataset.empty = "false";
  }

  function applyGraphPreset(button) {
    var canvas = button.closest("[data-graph-shell]");
    if (!canvas) return;
    canvas.dataset.graphLayout = button.dataset.graphPreset;
    canvas.querySelectorAll("[data-graph-preset]").forEach(function (option) {
      var active = option === button;
      option.dataset.selected = String(active);
      option.setAttribute("aria-pressed", String(active));
    });
  }

  function toggleControl(button) {
    var on = button.dataset.on !== "true";
    button.dataset.on = String(on);
    button.setAttribute("aria-pressed", String(on));
    var attribute = button.dataset.toggleAttribute;
    if (attribute) {
      var scope = button.closest("[data-toggle-scope]");
      if (scope) scope.dataset[attribute] = String(on);
    }
    var label = button.querySelector("[data-toggle-label]");
    if (label) label.textContent = on ? "On" : "Off";
  }

  function feedback(button) {
    var root = button.closest("[data-action-scope]") || document;
    var statuses = root.querySelectorAll("[data-action-status]");
    statuses.forEach(function (status) {
      var original = status.dataset.defaultText || status.textContent;
      status.dataset.defaultText = original;
      status.textContent = button.dataset.actionFeedback;
      global.setTimeout(function () { status.textContent = original; }, 1600);
    });
  }

  function bind() {
    document.addEventListener("click", function (event) {
      var stateButton = event.target.closest("[data-scene-state]");
      if (stateButton) {
        activateScene(stateButton.closest("[data-scene-id]"), stateButton.dataset.sceneState);
        return;
      }
      var groupButton = event.target.closest("[data-group-option]");
      if (groupButton) {
        activateGroup(groupButton.closest("[data-state-group]"), groupButton.dataset.groupOption);
        return;
      }
      var row = event.target.closest("[data-selectable-row]");
      if (row) { selectRow(row); return; }
      var graph = event.target.closest("[data-graph-preset]");
      if (graph) { applyGraphPreset(graph); return; }
      var toggle = event.target.closest("[data-toggle]");
      if (toggle) { toggleControl(toggle); return; }
      var reference = event.target.closest("[data-reference-open]");
      if (reference) { openReferences(reference.dataset.referenceOpen); return; }
      if (event.target.closest("[data-reference-close]")) { closeReferences(); return; }
      var action = event.target.closest("[data-action-feedback]");
      if (action) feedback(action);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeReferences();
    });
    document.querySelectorAll("[data-scene-id]").forEach(function (root) {
      var first = root.querySelector("[data-scene-state]");
      activateScene(root, root.dataset.activeState || (first && first.dataset.sceneState));
    });
    document.querySelectorAll("[data-state-group]").forEach(function (group) {
      var first = group.querySelector('[data-group-option][data-selected="true"]') || group.querySelector("[data-group-option]");
      if (first) activateGroup(group, first.dataset.groupOption);
    });
  }

  function boot() {
    renderEvidence();
    bind();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}(window));
