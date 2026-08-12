(function () {
  "use strict";

  var previewStateKey = "peak-theme-lab-graph-preview-v1";
  var preview = readPreviewState();
  var cy = null;
  var workbench = null;
  var canvas = null;
  var lastGraphGeometry = "";

  var elements = [
    { data: { id: "peak", label: "2-Story Cards · OT Performance Optimisation", level: 0, kind: "hub", detail: "当前文档 · 结构与性能优化" }, classes: "root" },
    { data: { id: "search", label: "docs · 关于表格的数据结构", level: 1, kind: "note", detail: "直接 Vault link" } },
    { data: { id: "ai-search", label: "docs · 表格代码中的数据结构与性能考量", level: 1, kind: "note", detail: "语义相关文档" } },
    { data: { id: "composer", label: "表格的性能分析", level: 1, kind: "hub", detail: "高连接度文档" } },
    { data: { id: "atlas", label: "docs · 电子表格中的数组公式", level: 1, kind: "note", detail: "直接 Vault link" } },
    { data: { id: "theme", label: "A-0 · Spreadsheet OT 算法优化", level: 1, kind: "note", detail: "结构优化记录" } },
    { data: { id: "boundary", label: "docs · 表格中的 Deltas 和 Mask 插槽机制", level: 1, kind: "note", detail: "实现机制" } },
    { data: { id: "graph", label: "docs · 区域 Mutation 数据结构优化", level: 1, kind: "hub", detail: "高连接度文档" } },
    { data: { id: "tokens", label: "OT 事件序列与冲突合并", level: 2, kind: "note", detail: "二跳结构" } },
    { data: { id: "layouts", label: "公式依赖关系图", level: 2, kind: "note", detail: "二跳结构" } },
    { data: { id: "keyboard", label: "表格键盘导航", level: 2, kind: "note", detail: "二跳结构" } },
    { data: { id: "export", label: "性能基准记录", level: 2, kind: "note", detail: "二跳结构" } },
    { data: { id: "folders", label: "Story Cards", level: 2, kind: "hub", detail: "Folder community" } },
    { data: { id: "evidence", label: "源代码证据", level: 2, kind: "note", detail: "Traceable source" } },
    { data: { id: "ai-graph", label: "AI Graph · 性能改进候选", level: 3, kind: "ai", detail: "AI 提议关系" }, classes: "ai-node" },
    { data: { id: "suggestions", label: "建议链接 · 数据结构", level: 3, kind: "ai", detail: "待确认语义边" }, classes: "ai-node" },
    { data: { id: "communities", label: "Community · Spreadsheet", level: 3, kind: "ai", detail: "AI community summary" }, classes: "ai-node" },

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
    var fallback = { scope: "one", layout: "constellation", semantic: true, nodeList: false };
    try {
      var stored = JSON.parse(window.localStorage.getItem(previewStateKey) || "{}");
      return {
        scope: ["one", "two", "ai"].indexOf(stored.scope) >= 0 ? stored.scope : fallback.scope,
        layout: ["constellation", "community", "right", "down", "folder", "orbit"].indexOf(stored.layout) >= 0 ? stored.layout : fallback.layout,
        semantic: typeof stored.semantic === "boolean" ? stored.semantic : fallback.semantic,
        nodeList: typeof stored.nodeList === "boolean" ? stored.nodeList : fallback.nodeList
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
          label: "data(label)",
          "font-family": token("--pk-font-sans"),
          "font-size": labelSize,
          "font-weight": 620,
          color: token("--pk-graph-node-text"),
          "text-wrap": "wrap",
          "text-max-width": 235,
          "text-valign": "center",
          "text-halign": "center",
          "background-color": token("--pk-graph-node-bg"),
          "border-color": token("--pk-border-strong"),
          "border-width": 1,
          "overlay-opacity": 0,
          "transition-property": "background-color, border-color, border-width, opacity",
          "transition-duration": state && state.motion === "reduced" ? 0 : 120
        }
      },
      { selector: "node[kind = 'hub']", style: { "font-weight": 700, "border-width": 1.5 } },
      { selector: "node.root", style: { "background-color": token("--pk-graph-node-related-bg"), "border-color": token("--pk-accent"), color: token("--pk-graph-node-text"), "border-width": 2.5 } },
      { selector: "node.ai-node", style: { "background-color": token("--pk-graph-node-ai-bg"), "border-color": token("--pk-info"), color: token("--pk-graph-node-text") } },
      { selector: "node.hovered", style: { "background-color": token("--pk-surface-raised"), "border-color": token("--pk-accent"), "border-width": 2, "z-index": 20 } },
      { selector: "node.related", style: { "background-color": token("--pk-graph-node-related-bg"), "border-color": token("--pk-accent"), color: token("--pk-graph-node-text"), opacity: 1 } },
      { selector: "node.dimmed", style: { opacity: 0.32 } },
      { selector: "node:selected", style: { "background-color": token("--pk-graph-node-selected-bg"), "border-color": token("--pk-accent"), color: token("--pk-graph-node-selected-text"), "border-width": 3, "font-weight": 760, "z-index": 30 } },
      {
        selector: "edge",
        style: {
          width: edgeWidth,
          "line-color": token("--pk-graph-edge"),
          "target-arrow-color": token("--pk-graph-edge"),
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
    renderNodeList();
    updateSelection();
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
    syncNodeListSelection();
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

  function renderNodeList() {
    if (!cy || !workbench) return;
    var container = workbench.querySelector("[data-graph-node-list-items]");
    if (!container) return;
    container.innerHTML = "";
    cy.nodes(":visible").toArray().sort(function (a, b) {
      return String(a.data("label")).localeCompare(String(b.data("label")), "zh-CN");
    }).forEach(function (node) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "graph-node-list__item";
      button.dataset.graphNodeId = node.id();
      button.innerHTML = "<svg class='pk-ui-icon'><use href='#pk-icon-file'></use></svg><span><b></b><small></small></span>";
      button.querySelector("b").textContent = node.data("label");
      button.querySelector("small").textContent = node.data("kind") === "hub" ? "Hub · high connectivity" : node.data("detail");
      button.addEventListener("click", function () {
        cy.nodes().unselect();
        node.select();
        cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.85) }, { duration: 160 });
        updateSelection();
      });
      container.appendChild(button);
    });
    syncNodeListSelection();
  }

  function syncNodeListSelection() {
    if (!cy || !workbench) return;
    workbench.querySelectorAll("[data-graph-node-id]").forEach(function (button) {
      var selected = cy.$id(button.dataset.graphNodeId).selected();
      button.dataset.selected = String(selected);
      button.setAttribute("aria-selected", String(selected));
    });
  }

  function toggleNodeList(force) {
    if (!workbench) return;
    preview.nodeList = typeof force === "boolean" ? force : !preview.nodeList;
    persistPreviewState();
    var panel = workbench.querySelector("[data-graph-node-list]");
    var trigger = workbench.querySelector("[data-graph-nodes]");
    if (panel) panel.hidden = !preview.nodeList;
    if (trigger) {
      trigger.dataset.selected = String(preview.nodeList);
      trigger.setAttribute("aria-expanded", String(preview.nodeList));
    }
    if (preview.nodeList) renderNodeList();
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
    toggleNodeList(preview.nodeList);
  }

  function selectNode(event) {
    var node = event.target;
    var original = event.originalEvent;
    var additive = Boolean(original && original.shiftKey);
    if (!additive) cy.nodes().unselect();
    node.select();
    updateSelection();
  }

  function downloadPng(dataUri) {
    var source = dataUri || (cy && cy.png({ output: "base64uri", full: true, scale: 2, bg: token("--pk-surface") }));
    if (!source) return;
    var link = document.createElement("a");
    link.href = source;
    link.download = "peak-graph-theme.png";
    link.click();
  }

  function mermaidSource() {
    var nodes = cy.nodes(":visible").toArray();
    var nodeIds = new Map();
    var lines = ["flowchart LR"];
    nodes.forEach(function (node, index) {
      var mermaidId = "n" + index;
      nodeIds.set(node.id(), mermaidId);
      lines.push("  " + mermaidId + "[" + JSON.stringify(String(node.data("label"))) + "]");
    });
    cy.edges(":visible").forEach(function (edge) {
      var source = nodeIds.get(edge.source().id());
      var target = nodeIds.get(edge.target().id());
      if (source && target) lines.push("  " + source + " --> " + target);
    });
    return lines.join("\n");
  }

  function flashButtonIcon(button, icon, label) {
    if (!button) return;
    var use = button.querySelector("use");
    var originalIcon = use && use.getAttribute("href");
    var originalLabel = button.getAttribute("aria-label");
    if (use) use.setAttribute("href", icon);
    button.dataset.active = "true";
    button.setAttribute("aria-label", label);
    window.setTimeout(function () {
      if (use && originalIcon) use.setAttribute("href", originalIcon);
      delete button.dataset.active;
      button.setAttribute("aria-label", originalLabel || "");
    }, 1200);
  }

  function copyMermaid(button) {
    if (!cy) return;
    var source = mermaidSource();
    var copy = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(source)
      : Promise.reject(new Error("Clipboard unavailable"));
    copy.then(function () {
      flashButtonIcon(button, "#pk-icon-check", "Copied graph as Mermaid");
    }).catch(function () {
      var area = document.createElement("textarea");
      area.value = source;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var copied = document.execCommand("copy");
      area.remove();
      if (copied) flashButtonIcon(button, "#pk-icon-check", "Copied graph as Mermaid");
    });
  }

  function copyImage(button) {
    if (!cy) return;
    var dataUri = cy.png({ output: "base64uri", full: true, scale: 2, bg: token("--pk-surface") });
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
      downloadPng(dataUri);
      return;
    }
    fetch(dataUri).then(function (response) { return response.blob(); }).then(function (blob) {
      return navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    }).then(function () {
      flashButtonIcon(button, "#pk-icon-check", "Copied graph as image");
    }).catch(function () { downloadPng(dataUri); });
  }

  function toggleFullscreen(button) {
    if (!cy || !workbench) return;
    var graphSystem = workbench.querySelector(".graph-system");
    if (!graphSystem) return;
    var expanded = graphSystem.dataset.expanded !== "true";
    graphSystem.dataset.expanded = String(expanded);
    button.setAttribute("aria-pressed", String(expanded));
    button.setAttribute("aria-label", expanded ? "Collapse graph" : "Expand graph");
    var icon = button.querySelector("use");
    if (icon) icon.setAttribute("href", expanded ? "#pk-icon-minimize" : "#pk-icon-maximize");
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
      var nodes = event.target.closest && event.target.closest("[data-graph-nodes]");
      if (nodes) {
        toggleNodeList();
        return;
      }
      if (event.target.closest && event.target.closest("[data-graph-node-list-close]")) { toggleNodeList(false); return; }
      var copy = event.target.closest && event.target.closest("[data-graph-copy]");
      if (copy) { copyMermaid(copy); return; }
      var copyImageButton = event.target.closest && event.target.closest("[data-graph-copy-image]");
      if (copyImageButton) { copyImage(copyImageButton); return; }
      var fullscreen = event.target.closest && event.target.closest("[data-graph-fullscreen]");
      if (fullscreen) toggleFullscreen(fullscreen);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (preview.nodeList) {
        toggleNodeList(false);
        return;
      }
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
