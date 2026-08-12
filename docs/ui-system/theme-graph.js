(function () {
  "use strict";

  var previewStateKey = "peak-theme-lab-graph-preview-v1";
  var preview = readPreviewState();
  var cy = null;
  var workbench = null;
  var canvas = null;
  var lastGraphGeometry = "";

  var elements = [
    { data: { id: "peak", label: "Peak Design System", level: 0, kind: "hub", detail: "Shared graph renderer and semantic roles" }, classes: "root" },
    { data: { id: "search", label: "Vault Search", level: 1, kind: "note", detail: "List, Tree and Graph projection" } },
    { data: { id: "ai-search", label: "AI Search", level: 1, kind: "note", detail: "Evidence-backed analysis workspace" } },
    { data: { id: "composer", label: "Composer", level: 1, kind: "note", detail: "Markdown document surface" } },
    { data: { id: "atlas", label: "File Atlas", level: 1, kind: "hub", detail: "File navigation and inspection" } },
    { data: { id: "theme", label: "Theme Pack", level: 1, kind: "note", detail: "Semantic color and geometry map" } },
    { data: { id: "boundary", label: "Host boundary", level: 1, kind: "note", detail: "Obsidian inheritance isolation" } },
    { data: { id: "graph", label: "AtlasGraphCanvas", level: 1, kind: "hub", detail: "Shared Cytoscape canvas" } },
    { data: { id: "tokens", label: "Semantic tokens", level: 2, kind: "note", detail: "Stable visual roles" } },
    { data: { id: "layouts", label: "Layout presets", level: 2, kind: "note", detail: "Constellation, flow and orbit" } },
    { data: { id: "keyboard", label: "Keyboard + focus", level: 2, kind: "note", detail: "Shared navigation contract" } },
    { data: { id: "export", label: "Graph export", level: 2, kind: "note", detail: "PNG and viewport state" } },
    { data: { id: "folders", label: "Folder communities", level: 2, kind: "hub", detail: "Structural grouping" } },
    { data: { id: "evidence", label: "Source evidence", level: 2, kind: "note", detail: "Traceable relationship data" } },
    { data: { id: "ai-graph", label: "AI Graph artifact", level: 3, kind: "ai", detail: "Persisted graph proposal" }, classes: "ai-node" },
    { data: { id: "suggestions", label: "Suggested links", level: 3, kind: "ai", detail: "AI-derived semantic edges" }, classes: "ai-node" },
    { data: { id: "communities", label: "Community summary", level: 3, kind: "ai", detail: "Generated structural explanation" }, classes: "ai-node" },

    { data: { id: "e-peak-search", source: "peak", target: "search", level: 1, kind: "structural" } },
    { data: { id: "e-peak-ai-search", source: "peak", target: "ai-search", level: 1, kind: "semantic" }, classes: "semantic" },
    { data: { id: "e-peak-composer", source: "peak", target: "composer", level: 1, kind: "structural" } },
    { data: { id: "e-peak-atlas", source: "peak", target: "atlas", level: 1, kind: "structural" } },
    { data: { id: "e-peak-theme", source: "peak", target: "theme", level: 1, kind: "semantic" }, classes: "semantic" },
    { data: { id: "e-peak-boundary", source: "peak", target: "boundary", level: 1, kind: "structural" } },
    { data: { id: "e-peak-graph", source: "peak", target: "graph", level: 1, kind: "structural" } },
    { data: { id: "e-theme-tokens", source: "theme", target: "tokens", level: 2, kind: "structural" } },
    { data: { id: "e-graph-layouts", source: "graph", target: "layouts", level: 2, kind: "structural" } },
    { data: { id: "e-graph-keyboard", source: "graph", target: "keyboard", level: 2, kind: "structural" } },
    { data: { id: "e-graph-export", source: "graph", target: "export", level: 2, kind: "structural" } },
    { data: { id: "e-atlas-folders", source: "atlas", target: "folders", level: 2, kind: "structural" } },
    { data: { id: "e-search-evidence", source: "search", target: "evidence", level: 2, kind: "structural" } },
    { data: { id: "e-composer-tokens", source: "composer", target: "tokens", level: 2, kind: "semantic" }, classes: "semantic" },
    { data: { id: "e-ai-artifact", source: "ai-search", target: "ai-graph", level: 3, kind: "ai" }, classes: "semantic ai-edge" },
    { data: { id: "e-ai-suggestions", source: "ai-graph", target: "suggestions", level: 3, kind: "ai" }, classes: "semantic ai-edge" },
    { data: { id: "e-ai-communities", source: "ai-graph", target: "communities", level: 3, kind: "ai" }, classes: "semantic ai-edge" },
    { data: { id: "e-suggestions-evidence", source: "suggestions", target: "evidence", level: 3, kind: "ai" }, classes: "semantic ai-edge" }
  ];

  function readPreviewState() {
    var fallback = { scope: "one", layout: "constellation", semantic: true, labels: true };
    try {
      var stored = JSON.parse(window.localStorage.getItem(previewStateKey) || "{}");
      return {
        scope: ["one", "two", "ai"].indexOf(stored.scope) >= 0 ? stored.scope : fallback.scope,
        layout: ["constellation", "community", "right", "down", "folder", "orbit"].indexOf(stored.layout) >= 0 ? stored.layout : fallback.layout,
        semantic: typeof stored.semantic === "boolean" ? stored.semantic : fallback.semantic,
        labels: typeof stored.labels === "boolean" ? stored.labels : fallback.labels
      };
    } catch (_) { return fallback; }
  }

  function persistPreviewState() {
    try { window.localStorage.setItem(previewStateKey, JSON.stringify(preview)); } catch (_) { /* file origin may reject storage */ }
  }

  function themeState() {
    return window.PeakThemeRuntime ? window.PeakThemeRuntime.getState() : null;
  }

  function token(name) {
    var root = document.querySelector(".pktw-root");
    if (!root) return "";
    return window.getComputedStyle(root).getPropertyValue(name).trim();
  }

  function graphGeometrySignature() {
    var state = themeState();
    if (!state || !state.graph) return "";
    return [state.graph.nodeShape, state.graph.nodeScale, state.graph.labelSizePx, state.graph.layoutSpacing].join(":");
  }

  function graphStyle() {
    var state = themeState();
    var graph = state && state.graph ? state.graph : window.PeakThemeSystem.graphDefaults;
    var labelSize = Number(graph.labelSizePx);
    var nodeScale = Number(graph.nodeScale);
    var edgeWidth = Number(graph.edgeWidthPx);

    return [
      {
        selector: "node",
        style: {
          shape: graph.nodeShape,
          width: function (node) { return Math.max(86, Math.min(260, node.data("label").length * labelSize * 0.63 + 26 * nodeScale)); },
          height: function (node) { return (node.hasClass("root") ? 48 : 38) * nodeScale; },
          label: preview.labels ? "data(label)" : "",
          "font-family": token("--pk-font-sans"),
          "font-size": labelSize,
          "font-weight": 620,
          color: token("--pk-text-primary"),
          "text-wrap": "wrap",
          "text-max-width": 235,
          "text-valign": "center",
          "text-halign": "center",
          "background-color": token("--pk-surface"),
          "border-color": token("--pk-border-strong"),
          "border-width": 1.5,
          "overlay-opacity": 0,
          "transition-property": "background-color, border-color, border-width, opacity",
          "transition-duration": state && state.motion === "reduced" ? 0 : 120
        }
      },
      { selector: "node[kind = 'hub']", style: { "font-weight": 700, "border-width": 2 } },
      { selector: "node.root", style: { "background-color": token("--pk-accent-tint"), "border-color": token("--pk-accent"), color: token("--pk-accent-text"), "border-width": 3 } },
      { selector: "node.ai-node", style: { "background-color": token("--pk-info-bg"), "border-color": token("--pk-info-border") } },
      { selector: "node.hovered", style: { "background-color": token("--pk-surface-raised"), "border-color": token("--pk-accent"), "border-width": 2.5, "z-index": 20 } },
      { selector: "node.related", style: { "background-color": token("--pk-accent-tint"), "border-color": token("--pk-border-accent"), color: token("--pk-accent-text"), opacity: 1 } },
      { selector: "node.dimmed", style: { opacity: 0.32 } },
      { selector: "node:selected", style: { "background-color": token("--pk-state-selected"), "border-color": token("--pk-accent"), color: token("--pk-accent-text"), "border-width": 4, "font-weight": 760, "z-index": 30 } },
      {
        selector: "edge",
        style: {
          width: edgeWidth,
          "line-color": token("--pk-border-strong"),
          "target-arrow-color": token("--pk-border-strong"),
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.82,
          "curve-style": "bezier",
          opacity: 0.82,
          "overlay-opacity": 0,
          "transition-property": "line-color, target-arrow-color, width, opacity",
          "transition-duration": state && state.motion === "reduced" ? 0 : 120
        }
      },
      { selector: "edge.semantic", style: { "line-color": token("--pk-accent"), "target-arrow-color": token("--pk-accent"), "line-style": "dashed", opacity: 0.58 } },
      { selector: "edge.ai-edge", style: { "line-color": token("--pk-info"), "target-arrow-color": token("--pk-info"), opacity: 0.72 } },
      { selector: "edge.related-edge", style: { "line-color": token("--pk-accent"), "target-arrow-color": token("--pk-accent"), width: edgeWidth + 1.25, opacity: 1, "z-index": 15 } },
      { selector: "edge.dimmed", style: { opacity: 0.12 } }
    ];
  }

  function setSelected(group, attribute, value) {
    if (!group) return;
    group.querySelectorAll("[" + attribute + "]").forEach(function (button) {
      var selected = button.getAttribute(attribute) === value;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function scopeAllows(element) {
    var data = element.data();
    if (preview.scope === "one") return Number(data.level) <= 1;
    if (preview.scope === "two") return Number(data.level) <= 2 && data.kind !== "ai";
    return true;
  }

  function applyVisibility() {
    if (!cy) return;
    cy.batch(function () {
      cy.elements().forEach(function (element) {
        var visible = scopeAllows(element);
        if (element.isEdge() && element.hasClass("semantic") && !preview.semantic) visible = false;
        if (visible) element.show();
        else element.hide();
      });
    });
    updateCounts();
  }

  function layoutOptions() {
    var state = themeState();
    var spacing = state && state.graph ? Number(state.graph.layoutSpacing) : 120;
    var animate = Boolean(state && state.motion !== "reduced");
    var shared = { fit: true, padding: 54, animate: animate, animationDuration: 320 };

    if (preview.layout === "constellation") return Object.assign({}, shared, {
      name: "cose", randomize: true, idealEdgeLength: spacing, nodeRepulsion: 680000,
      componentSpacing: spacing * 0.85, gravity: 0.85, numIter: 900
    });
    if (preview.layout === "community") return Object.assign({}, shared, {
      name: "circle", spacingFactor: Math.max(0.75, spacing / 105), avoidOverlap: true, startAngle: -Math.PI / 2
    });
    if (preview.layout === "orbit") return Object.assign({}, shared, {
      name: "concentric", minNodeSpacing: spacing * 0.55, avoidOverlap: true,
      concentric: function (node) { return 4 - Number(node.data("level")); }, levelWidth: function () { return 1; }
    });

    var breadth = Object.assign({}, shared, {
      name: "breadthfirst", directed: true, roots: "#peak", spacingFactor: Math.max(0.8, spacing / 110), avoidOverlap: true, circle: false
    });
    if (preview.layout === "right") {
      breadth.transform = function (_, position) { return { x: position.y, y: position.x }; };
    }
    if (preview.layout === "folder") breadth.grid = true;
    return breadth;
  }

  function runLayout() {
    if (!cy) return;
    var visible = cy.elements(":visible");
    if (!visible.length) return;
    visible.layout(layoutOptions()).run();
  }

  function updateSelection() {
    if (!cy || !workbench) return;
    var selected = cy.nodes(":selected:visible");
    cy.elements().removeClass("related related-edge dimmed");
    if (selected.length) {
      var neighborhood = selected.closedNeighborhood().filter(":visible");
      cy.elements(":visible").not(neighborhood).addClass("dimmed");
      neighborhood.nodes().not(selected).addClass("related");
      neighborhood.edges().addClass("related-edge");
    }

    var status = workbench.querySelector("[data-graph-selection]");
    if (!status) return;
    if (!selected.length) {
      status.innerHTML = "<b>未选择节点</b><small>点击任一节点检查选中与邻接状态</small>";
      return;
    }
    var primary = selected[0];
    var relations = primary.connectedEdges(":visible").length;
    status.innerHTML = "<b></b><small></small>";
    status.querySelector("b").textContent = selected.length > 1 ? selected.length + " nodes selected" : primary.data("label");
    status.querySelector("small").textContent = selected.length > 1 ? "Shift + click multi-selection" : primary.data("detail") + " · " + relations + " visible relationships";
  }

  function updateCounts() {
    if (!cy || !workbench) return;
    var visibleNodes = cy.nodes(":visible");
    var visibleEdges = cy.edges(":visible");
    var hubs = visibleNodes.filter("[kind = 'hub']").length;
    var count = workbench.querySelector("[data-graph-count]");
    if (count) count.textContent = visibleNodes.length + " notes · " + hubs + " hubs · " + visibleEdges.length + " links";
  }

  function updateStyle(reflow) {
    if (!cy) return;
    cy.style(graphStyle());
    updateSelection();
    var nextSignature = graphGeometrySignature();
    if (reflow || nextSignature !== lastGraphGeometry) runLayout();
    lastGraphGeometry = nextSignature;
  }

  function syncPreviewControls() {
    if (!workbench) return;
    setSelected(workbench.querySelector("[data-graph-scope-group]"), "data-graph-scope", preview.scope);
    setSelected(workbench.querySelector("[data-graph-layout-group]"), "data-graph-layout", preview.layout);
    var semantic = workbench.querySelector("[data-graph-semantic]");
    if (semantic) {
      semantic.dataset.on = String(preview.semantic);
      semantic.setAttribute("aria-pressed", String(preview.semantic));
    }
    var labels = workbench.querySelector("[data-graph-labels]");
    if (labels) {
      labels.dataset.selected = String(preview.labels);
      labels.setAttribute("aria-pressed", String(preview.labels));
    }
  }

  function selectNode(event) {
    var node = event.target;
    var original = event.originalEvent;
    var additive = Boolean(original && original.shiftKey);
    if (!additive) cy.nodes().unselect();
    node.select();
    updateSelection();
  }

  function exportPng() {
    if (!cy) return;
    var link = document.createElement("a");
    link.href = cy.png({ output: "base64uri", full: true, scale: 2, bg: token("--pk-surface") });
    link.download = "peak-graph-theme.png";
    link.click();
  }

  function toggleFullscreen(button) {
    if (!cy || !workbench) return;
    var graphSystem = workbench.querySelector(".graph-system");
    if (!graphSystem) return;
    var expanded = graphSystem.dataset.expanded !== "true";
    graphSystem.dataset.expanded = String(expanded);
    button.setAttribute("aria-pressed", String(expanded));
    button.setAttribute("aria-label", expanded ? "Collapse graph" : "Expand graph");
    document.body.style.overflow = expanded ? "hidden" : "";
    window.requestAnimationFrame(function () { cy.resize(); cy.fit(cy.elements(":visible"), 54); });
  }

  function bindWorkbench() {
    workbench.addEventListener("click", function (event) {
      var scope = event.target.closest && event.target.closest("[data-graph-scope]");
      if (scope) {
        preview.scope = scope.dataset.graphScope;
        persistPreviewState();
        syncPreviewControls();
        applyVisibility();
        runLayout();
        return;
      }
      var layout = event.target.closest && event.target.closest("[data-graph-layout]");
      if (layout) {
        preview.layout = layout.dataset.graphLayout;
        persistPreviewState();
        syncPreviewControls();
        runLayout();
        return;
      }
      var semantic = event.target.closest && event.target.closest("[data-graph-semantic]");
      if (semantic) {
        preview.semantic = !preview.semantic;
        persistPreviewState();
        syncPreviewControls();
        applyVisibility();
        runLayout();
        return;
      }
      var labels = event.target.closest && event.target.closest("[data-graph-labels]");
      if (labels) {
        preview.labels = !preview.labels;
        persistPreviewState();
        syncPreviewControls();
        updateStyle(false);
        return;
      }
      if (event.target.closest && event.target.closest("[data-graph-fit]")) { cy.fit(cy.elements(":visible"), 54); return; }
      if (event.target.closest && event.target.closest("[data-graph-export]")) { exportPng(); return; }
      var fullscreen = event.target.closest && event.target.closest("[data-graph-fullscreen]");
      if (fullscreen) toggleFullscreen(fullscreen);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var graphSystem = workbench.querySelector(".graph-system[data-expanded='true']");
      if (!graphSystem) return;
      var button = workbench.querySelector("[data-graph-fullscreen]");
      if (button) toggleFullscreen(button);
    });
  }

  function boot() {
    workbench = document.querySelector("[data-graph-workbench]");
    canvas = workbench && workbench.querySelector("[data-graph-canvas]");
    if (!workbench || !canvas) return;
    if (!window.cytoscape) {
      canvas.innerHTML = "<p class='graph-runtime-error'>Cytoscape runtime unavailable. Run npm install and reload this document.</p>";
      return;
    }

    cy = window.cytoscape({
      container: canvas,
      elements: elements,
      style: graphStyle(),
      minZoom: 0.28,
      maxZoom: 2.4,
      wheelSensitivity: 0.22,
      selectionType: "additive",
      boxSelectionEnabled: false,
      autoungrabify: false
    });

    cy.on("tap", "node", selectNode);
    cy.on("mouseover", "node", function (event) { event.target.addClass("hovered"); });
    cy.on("mouseout", "node", function (event) { event.target.removeClass("hovered"); });
    cy.on("tap", function (event) {
      if (event.target !== cy) return;
      cy.nodes().unselect();
      updateSelection();
    });
    cy.on("drag", "node", function (event) { event.target.addClass("hovered"); });
    cy.on("free", "node", function (event) { event.target.removeClass("hovered"); });

    bindWorkbench();
    syncPreviewControls();
    applyVisibility();
    cy.$id("peak").select();
    updateSelection();
    lastGraphGeometry = graphGeometrySignature();
    runLayout();
  }

  document.addEventListener("peak-theme-change", function () { updateStyle(false); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}());
