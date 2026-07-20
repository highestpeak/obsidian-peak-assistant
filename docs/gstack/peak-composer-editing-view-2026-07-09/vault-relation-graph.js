(() => {
  "use strict";

  const PRESETS = [
    { id: "constellation", label: "星群", title: "Constellation" },
    { id: "flow-tb", label: "流 ↓", title: "Flow top to bottom" },
    { id: "flow-lr", label: "流 →", title: "Flow left to right" },
    { id: "folder", label: "文件夹", title: "Folder tree" },
    { id: "orbit", label: "环绕", title: "Orbit" },
  ];

  const RESULT_VIEWS = [
    { id: "list", label: "列表", icon: "list", title: "List" },
    { id: "tree", label: "文件夹", icon: "folder", title: "Folder tree" },
    { id: "graph", label: "图谱", icon: "network", title: "Graph" },
  ];

  const DENSITIES = [
    { id: "compact", label: "紧凑" },
    { id: "detailed", label: "详细" },
  ];

  const MODEL = {
    revision: "fixture-2026-07-20-v1",
    nodes: [
      { id: "current-block", kind: "current", label: "AI 旁路段落" },
      { id: "source:knowledge-base", sourceId: "knowledge-base", label: "知识库.md" },
      { id: "source:base-judgement", sourceId: "base-judgement", label: "Base 使用判断" },
      { id: "source:knowledge-review", sourceId: "knowledge-review", label: "知识回顾" },
      { id: "source:composer-architecture", sourceId: "composer-architecture", label: "Composer 架构" },
      { id: "source:evidence-matrix", sourceId: "evidence-matrix", label: "证据矩阵", weak: true },
    ],
    edges: [
      { source: "current-block", target: "source:knowledge-base", kind: "reference", strength: 0.91 },
      { source: "current-block", target: "source:base-judgement", kind: "semantic", strength: 0.84 },
      { source: "current-block", target: "source:knowledge-review", kind: "semantic", strength: 0.78 },
      { source: "current-block", target: "source:composer-architecture", kind: "reference", strength: 0.75 },
      { source: "source:knowledge-base", target: "source:knowledge-review", kind: "reference", strength: 0.82 },
      { source: "source:base-judgement", target: "source:composer-architecture", kind: "semantic", strength: 0.76 },
      { source: "current-block", target: "source:evidence-matrix", kind: "semantic", strength: 0.72 },
    ],
    overflowCount: 0,
  };

  const LAYOUTS = {
    constellation: {
      positions: {
        "current-block": [50, 48],
        "source:knowledge-base": [19, 22],
        "source:base-judgement": [79, 23],
        "source:knowledge-review": [82, 70],
        "source:composer-architecture": [20, 74],
        "source:evidence-matrix": [53, 87],
      },
    },
    "flow-tb": {
      positions: {
        "current-block": [50, 13],
        "source:knowledge-base": [16, 42],
        "source:base-judgement": [39, 42],
        "source:knowledge-review": [62, 42],
        "source:composer-architecture": [84, 42],
        "source:evidence-matrix": [50, 78],
      },
    },
    "flow-lr": {
      positions: {
        "current-block": [13, 49],
        "source:knowledge-base": [39, 20],
        "source:base-judgement": [39, 48],
        "source:knowledge-review": [68, 19],
        "source:composer-architecture": [68, 55],
        "source:evidence-matrix": [89, 78],
      },
    },
    folder: {
      positions: {
        "current-block": [50, 12],
        "source:knowledge-base": [18, 45],
        "source:base-judgement": [43, 45],
        "source:knowledge-review": [30, 69],
        "source:composer-architecture": [73, 48],
        "source:evidence-matrix": [73, 72],
      },
      groups: [
        { label: "B-2 / 信息聚合-PKM", x: 7, y: 28, width: 48, height: 57 },
        { label: "Projects / Peak", x: 59, y: 31, width: 34, height: 54 },
      ],
    },
    orbit: {
      positions: {
        "current-block": [50, 50],
        "source:knowledge-base": [50, 13],
        "source:base-judgement": [82, 31],
        "source:knowledge-review": [80, 72],
        "source:composer-architecture": [20, 72],
        "source:evidence-matrix": [18, 30],
      },
    },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function create(options = {}) {
    const escapeHtml = options.escapeHtml || ((value) => String(value));
    const icon = options.icon || (() => "");
    const state = options.state || {};
    state.selectedNodeId ||= "source:knowledge-base";
    state.preset ||= "constellation";
    state.showSemantic = Boolean(state.showSemantic);
    state.zoom = Number.isFinite(state.zoom) ? state.zoom : 1;
    state.panX = Number.isFinite(state.panX) ? state.panX : 0;
    state.panY = Number.isFinite(state.panY) ? state.panY : 0;
    state.resultView = RESULT_VIEWS.some((view) => view.id === state.resultView) ? state.resultView : "graph";
    state.density = DENSITIES.some((density) => density.id === state.density) ? state.density : "detailed";
    state.collapsedFolders = Array.isArray(state.collapsedFolders) ? state.collapsedFolders : [];

    let drag = null;
    let hoverTimer = 0;

    const sourceForNode = (node) => node?.sourceId ? options.getSourceById?.(node.sourceId) || null : null;
    const nodeById = (id) => MODEL.nodes.find((node) => node.id === id) || null;
    const layout = () => LAYOUTS[state.preset] || LAYOUTS.constellation;
    const position = (nodeId) => layout().positions[nodeId] || [50, 50];
    const sources = () => (options.getSources?.() || MODEL.nodes.map(sourceForNode).filter(Boolean));

    function sourceNodeId(sourceId) {
      return `source:${sourceId}`;
    }

    function selectedSourceId() {
      return nodeById(state.selectedNodeId)?.sourceId || "";
    }

    function visibleNodes(mode) {
      return MODEL.nodes.filter((node) => mode === "dialog" || !node.weak);
    }

    function visibleEdges(mode, visibleIds) {
      return MODEL.edges.filter((edge) => {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return false;
        if (edge.kind === "semantic" && !state.showSemantic) return false;
        if (mode !== "dialog" && (nodeById(edge.source)?.weak || nodeById(edge.target)?.weak)) return false;
        return true;
      });
    }

    function graphData(mode) {
      const nodes = visibleNodes(mode);
      const ids = new Set(nodes.map((node) => node.id));
      return { nodes, edges: visibleEdges(mode, ids) };
    }

    function renderFolderGroups(mode) {
      if (state.preset !== "folder") return "";
      return (layout().groups || []).map((group) => `
        <div class="graph-folder-group is-${mode}" style="--group-x:${group.x}%;--group-y:${group.y}%;--group-width:${group.width}%;--group-height:${group.height}%">
          <span>${escapeHtml(group.label)}</span>
        </div>
      `).join("");
    }

    function renderScene(mode) {
      const { nodes, edges } = graphData(mode);
      const markerId = `graph-arrow-${mode}`;
      const lines = edges.map((edge) => {
        const [x1, y1] = position(edge.source);
        const [x2, y2] = position(edge.target);
        const edgeKey = `${edge.kind}|${edge.source}|${edge.target}`;
        return `<line class="graph-edge is-${edge.kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${markerId})" data-edge-key="${edgeKey}" data-edge-kind="${edge.kind}" data-relation-strength="${edge.strength}" data-edge-source="${edge.source}" data-edge-target="${edge.target}"></line>`;
      }).join("");
      const buttons = nodes.map((node) => {
        const [x, y] = position(node.id);
        const source = sourceForNode(node);
        const selected = node.id === state.selectedNodeId;
        const meta = node.kind === "current" ? "当前对象" : `${source?.score || "—"}%`;
        return `
          <button class="material-node is-${node.kind || "source"}${selected ? " is-selected" : ""}${node.weak ? " is-weak" : ""}" type="button" data-graph-node="${node.id}" data-source-id="${node.sourceId || ""}" aria-pressed="${selected}" style="--node-x:${x}%;--node-y:${y}%">
            <strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(meta)}</small>
          </button>
        `;
      }).join("");
      const viewportStyle = mode === "dialog"
        ? ` style="--graph-zoom:${state.zoom};--graph-pan-x:${state.panX}px;--graph-pan-y:${state.panY}px"`
        : "";
      return `
        <div class="graph-scene is-${mode}" data-graph-scene data-graph-surface="${mode === "dialog" ? "explorer" : "compact"}" data-graph-revision="${MODEL.revision}"${viewportStyle} role="group" aria-label="相关材料关系图，${nodes.length} 个节点，${edges.length} 条连接">
          ${renderFolderGroups(mode)}
          <svg class="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="${markerId}" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z"></path></marker></defs>
            ${lines}
          </svg>
          ${buttons}
        </div>
      `;
    }

    function renderDetail(mode) {
      const node = nodeById(state.selectedNodeId) || nodeById("current-block");
      const source = sourceForNode(node);
      if (!source) {
        return `
          <div class="graph-selection-detail is-${mode}">
            <span class="graph-detail-kicker">当前对象</span>
            <strong>AI 旁路段落</strong>
            <p>选择材料即可查看路径、命中原因，并把它作为可见 context chip 带入协作。</p>
            <small>正文当前块 · 引用关系 · Semantic 可选</small>
          </div>
        `;
      }
      return `
        <div class="graph-selection-detail is-${mode}" data-selected-source="${source.id}">
          <span class="graph-detail-kicker">已选材料 · ${source.score}% 关联</span>
          <strong>${escapeHtml(source.title)}</strong>
          <small>${escapeHtml(source.path)}</small>
          <p>${escapeHtml(source.reason)}</p>
          <div class="graph-detail-actions">
            <button type="button" data-view-source="${source.id}">${icon("eye")}查看来源</button>
            <button class="is-primary" type="button" data-use-source="${source.id}">带入协作</button>
          </div>
        </div>
      `;
    }

    function renderInline() {
      return `
        <div class="material-graph" id="related-material-graph">
          <div class="material-graph-bar">
            <span>${icon("network")}<strong>当前块周边</strong><small>引用与 Semantic 关系的局部投影</small></span>
            <button type="button" data-open-graph>${icon("expand")}打开完整图</button>
          </div>
          <div class="graph-canvas is-inline">${renderScene("inline")}</div>
          ${renderDetail("inline")}
        </div>
      `;
    }

    function renderResultViewTabs() {
      return `
        <div class="result-view-tabs" role="tablist" aria-label="相关材料视图">
          ${RESULT_VIEWS.map((view) => `
            <button type="button" role="tab" title="${view.title}" data-result-view="${view.id}" aria-selected="${state.resultView === view.id}" tabindex="${state.resultView === view.id ? "0" : "-1"}">
              ${icon(view.icon)}<span>${escapeHtml(view.label)}</span>
            </button>
          `).join("")}
        </div>
      `;
    }

    function renderDensityTabs() {
      return `
        <div class="result-density-tabs" role="group" aria-label="结果密度">
          ${DENSITIES.map((density) => `<button type="button" data-result-density="${density.id}" aria-pressed="${state.density === density.id}">${escapeHtml(density.label)}</button>`).join("")}
        </div>
      `;
    }

    function renderGraphControls(nodes, edges) {
      return `
        <span class="graph-summary">${nodes.length} 节点 · ${edges.length} 条连接</span>
        <div class="graph-secondary-controls">
          <div class="graph-layout-tabs" role="tablist" aria-label="图谱布局">
            ${PRESETS.map((preset) => `<button type="button" role="tab" title="${preset.title}" data-graph-preset="${preset.id}" aria-selected="${state.preset === preset.id}" tabindex="${state.preset === preset.id ? "0" : "-1"}">${escapeHtml(preset.label)}</button>`).join("")}
          </div>
          <div class="graph-tools">
            <label class="graph-semantic-toggle" title="使用已索引的语义关系；即时、不会消耗 AI credit">
              <input type="checkbox" data-graph-semantic ${state.showSemantic ? "checked" : ""}>
              <span aria-hidden="true"><i></i></span><b>Semantic</b>
            </label>
            <button class="icon-button" type="button" data-graph-zoom="out" aria-label="缩小">${icon("zoom-out")}</button>
            <button type="button" data-graph-fit>适应</button>
            <button class="icon-button" type="button" data-graph-zoom="in" aria-label="放大">${icon("zoom-in")}</button>
          </div>
        </div>
      `;
    }

    function renderSourceRow(source, options = {}) {
      const selected = selectedSourceId() === source.id;
      const compact = state.density === "compact";
      const depth = Number(options.depth || 0);
      return `
        <article class="result-source-row${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}" data-result-row data-source-id="${source.id}" data-result-path="${escapeHtml(source.path)}" style="--result-depth:${depth}" aria-current="${selected ? "true" : "false"}">
          <button class="result-source-main" type="button" data-result-source="${source.id}">
            <span class="result-source-title"><strong>${escapeHtml(source.title)}</strong><b>${source.score}%</b></span>
            <small>${escapeHtml(source.path)}</small>
            ${compact ? "" : `<p>${escapeHtml(source.reason)}</p>`}
          </button>
          <div class="result-source-actions">
            <button type="button" data-view-source="${source.id}">${icon("eye")}查看来源</button>
            <button class="is-primary" type="button" data-use-source="${source.id}">带入协作</button>
          </div>
        </article>
      `;
    }

    function renderListView() {
      const items = sources();
      return `
        <section class="result-list-view is-${state.density}" data-result-surface="list" data-graph-revision="${MODEL.revision}" aria-label="相关材料列表，共 ${items.length} 项">
          <header class="result-view-head"><span><strong>全部相关材料</strong><small>按当前关联度排序</small></span><b>${items.length} 项</b></header>
          <div class="result-source-list">${items.map((source) => renderSourceRow(source)).join("")}</div>
        </section>
      `;
    }

    function buildFolderTree(items) {
      const root = { name: "root", key: "", folders: new Map(), sources: [] };
      items.forEach((source) => {
        const parts = source.path.split("/").filter(Boolean);
        parts.pop();
        let cursor = root;
        parts.forEach((part) => {
          const key = cursor.key ? `${cursor.key}/${part}` : part;
          if (!cursor.folders.has(part)) cursor.folders.set(part, { name: part, key, folders: new Map(), sources: [] });
          cursor = cursor.folders.get(part);
        });
        cursor.sources.push(source);
      });
      return root;
    }

    function renderFolderNode(folder, depth = 0) {
      const collapsed = state.collapsedFolders.includes(folder.key);
      const childCount = folder.sources.length + [...folder.folders.values()].reduce((sum, child) => sum + child.sources.length, 0);
      return `
        <section class="result-folder" data-folder-key="${escapeHtml(folder.key)}" style="--folder-depth:${depth}">
          <button class="result-folder-toggle" type="button" data-folder-toggle="${escapeHtml(folder.key)}" aria-expanded="${!collapsed}">
            ${icon("chevron-down")} ${icon("folder")}<strong>${escapeHtml(folder.name)}</strong><small>${childCount}</small>
          </button>
          <div class="result-folder-children" ${collapsed ? "hidden" : ""}>
            ${[...folder.folders.values()].map((child) => renderFolderNode(child, depth + 1)).join("")}
            ${folder.sources.map((source) => renderSourceRow(source, { depth: depth + 1 })).join("")}
          </div>
        </section>
      `;
    }

    function renderTreeView() {
      const items = sources();
      const tree = buildFolderTree(items);
      return `
        <section class="result-tree-view is-${state.density}" data-result-surface="tree" data-graph-revision="${MODEL.revision}" aria-label="相关材料文件夹视图，共 ${items.length} 项">
          <header class="result-view-head"><span><strong>按 Vault 路径查看</strong><small>文件夹只改变组织方式，不改变结果集</small></span><b>${items.length} 项</b></header>
          <div class="result-folder-tree">${[...tree.folders.values()].map((folder) => renderFolderNode(folder)).join("")}</div>
        </section>
      `;
    }

    function renderDialogMain() {
      if (state.resultView === "list") return renderListView();
      if (state.resultView === "tree") return renderTreeView();
      return `
        <div class="graph-canvas is-dialog" data-graph-canvas tabindex="0" aria-label="关系图画布，可滚轮缩放并拖动">
          ${renderScene("dialog")}
          <div class="graph-export-actions" aria-label="导出图谱">
            <button class="icon-button" type="button" data-copy-graph="relations" aria-label="复制关系为 Mermaid" title="复制关系（Mermaid）">${icon("copy")}</button>
            <button class="icon-button" type="button" data-copy-graph="image" aria-label="复制当前图像" title="复制当前图像">${icon("image")}</button>
          </div>
          <div class="graph-legend"><span><i></i>引用</span><span><i class="is-semantic"></i>Semantic</span></div>
          <output class="graph-hover-preview" data-graph-hover-preview>悬停节点查看路径 · 双击打开来源</output>
          <span class="graph-zoom-value" data-graph-zoom-value>${Math.round(state.zoom * 100)}%</span>
        </div>
      `;
    }

    function renderDialog() {
      const { nodes, edges } = graphData("dialog");
      return `
        <header class="graph-dialog-head">
          <span><strong id="graph-dialog-title">相关材料</strong><small>与 Vault Search 共用列表、文件夹和图谱三种结果投影；切换不会重新检索</small></span>
          <button class="icon-button" type="button" data-close-graph aria-label="关闭相关材料">${icon("x")}</button>
        </header>
        <div class="graph-dialog-toolbar">
          ${renderResultViewTabs()}
          ${state.resultView === "graph" ? renderGraphControls(nodes, edges) : `<span class="graph-summary">${sources().length} 项 · 同一结果快照</span>${renderDensityTabs()}`}
        </div>
        <div class="graph-dialog-body is-${state.resultView}" data-active-result-view="${state.resultView}">
          <main class="result-explorer-main">${renderDialogMain()}</main>
          <aside class="graph-inspector" aria-label="已选材料详情">${renderDetail("dialog")}</aside>
        </div>
      `;
    }

    function requestRender(config = {}) {
      options.onRender?.();
      if (!config.fit) return;
      window.requestAnimationFrame(() => fit(options.getDialogRoot?.() || document));
    }

    function applyViewport(root = document) {
      const scene = root.querySelector?.("[data-graph-scene].is-dialog");
      if (scene) {
        scene.style.setProperty("--graph-zoom", state.zoom);
        scene.style.setProperty("--graph-pan-x", `${state.panX}px`);
        scene.style.setProperty("--graph-pan-y", `${state.panY}px`);
      }
      const label = root.querySelector?.("[data-graph-zoom-value]");
      if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
    }

    function fit(root = document) {
      const canvas = root.querySelector?.("[data-graph-canvas]");
      if (!canvas) return;
      const { nodes } = graphData("dialog");
      const points = nodes.map((node) => position(node.id));
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const rect = canvas.getBoundingClientRect();
      const paddingX = Math.max(8, (48 / Math.max(rect.width, 1)) * 100);
      const paddingY = Math.max(10, (48 / Math.max(rect.height, 1)) * 100);
      const spanX = Math.max(24, maxX - minX + 18);
      const spanY = Math.max(24, maxY - minY + 16);
      state.zoom = clamp(Math.min((100 - paddingX * 2) / spanX, (100 - paddingY * 2) / spanY), 0.15, 3);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      state.panX = ((50 - centerX) / 100) * rect.width * state.zoom;
      state.panY = ((50 - centerY) / 100) * rect.height * state.zoom;
      applyViewport(root);
    }

    function setPreset(preset) {
      if (!PRESETS.some((item) => item.id === preset)) return;
      state.preset = preset;
      state.showSemantic = preset === "orbit";
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      requestRender({ fit: true });
    }

    function setSemantic(value) {
      state.showSemantic = Boolean(value);
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      requestRender({ fit: true });
    }

    function setResultView(view) {
      if (!RESULT_VIEWS.some((item) => item.id === view)) return;
      state.resultView = view;
      requestRender({ fit: view === "graph" });
    }

    function setDensity(density) {
      if (!DENSITIES.some((item) => item.id === density)) return;
      state.density = density;
      requestRender();
    }

    function toggleFolder(key) {
      state.collapsedFolders = state.collapsedFolders.includes(key)
        ? state.collapsedFolders.filter((item) => item !== key)
        : [...state.collapsedFolders, key];
      requestRender();
    }

    function selectNode(id) {
      if (!nodeById(id)) return;
      state.selectedNodeId = id;
      requestRender();
    }

    function adjustZoom(direction, root) {
      const factor = direction === "in" ? 1.18 : 1 / 1.18;
      state.zoom = clamp(state.zoom * factor, 0.15, 3);
      applyViewport(root);
    }

    function currentMermaid() {
      const { nodes, edges } = graphData("dialog");
      const ids = new Map(nodes.map((node, index) => [node.id, `n${index + 1}`]));
      const declarations = nodes.map((node) => `  ${ids.get(node.id)}["${node.label.replaceAll('"', "'")}"]`);
      const relations = edges.map((edge) => {
        const arrow = edge.kind === "semantic" ? "-.->|sem|" : "-->|ref|";
        return `  ${ids.get(edge.source)} ${arrow} ${ids.get(edge.target)}`;
      });
      return ["flowchart TD", ...declarations, ...relations].join("\n");
    }

    async function writeClipboardText(value) {
      try {
        await navigator.clipboard?.writeText?.(value);
        return true;
      } catch (_error) {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand?.("copy") || false;
        textarea.remove();
        return copied;
      }
    }

    async function copyRelations() {
      const mermaid = currentMermaid();
      window.__peakGraphMermaid = mermaid;
      await writeClipboardText(mermaid);
      options.onToast?.("已复制当前可见关系 · Mermaid");
    }

    function roundedRect(context, x, y, width, height, radius) {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
      context.fill();
      context.stroke();
    }

    async function copyImage() {
      const width = 1400;
      const height = 900;
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      const { nodes, edges } = graphData("dialog");
      context.lineWidth = 1.4;
      for (const edge of edges) {
        const [x1, y1] = position(edge.source);
        const [x2, y2] = position(edge.target);
        context.strokeStyle = edge.kind === "semantic" ? "#a78bfa" : "#7b8493";
        context.setLineDash(edge.kind === "semantic" ? [7, 6] : []);
        context.beginPath();
        context.moveTo((x1 / 100) * width, (y1 / 100) * height);
        context.lineTo((x2 / 100) * width, (y2 / 100) * height);
        context.stroke();
      }
      context.setLineDash([]);
      context.font = "600 18px system-ui, sans-serif";
      context.textBaseline = "middle";
      for (const node of nodes) {
        const [x, y] = position(node.id);
        const px = (x / 100) * width;
        const py = (y / 100) * height;
        const nodeWidth = node.kind === "current" ? 184 : 166;
        context.fillStyle = node.kind === "current" ? "#f3e8ff" : "#faf9ff";
        context.strokeStyle = node.kind === "current" ? "#7c3aed" : "#b8a8df";
        roundedRect(context, px - nodeWidth / 2, py - 27, nodeWidth, 54, 12);
        context.fillStyle = "#2e3338";
        context.fillText(node.label, px - nodeWidth / 2 + 14, py);
      }
      const dataUrl = canvas.toDataURL("image/png");
      window.__peakGraphImage = dataUrl;
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob && window.ClipboardItem && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
      } catch (_error) {
        // The file:// prototype still keeps the rendered PNG in __peakGraphImage.
      }
      options.onToast?.("已复制当前布局的完整图像");
    }

    function handleButton(button, root = document) {
      if (button.dataset.resultView) {
        setResultView(button.dataset.resultView);
        return true;
      }
      if (button.dataset.resultDensity) {
        setDensity(button.dataset.resultDensity);
        return true;
      }
      if (button.dataset.folderToggle) {
        toggleFolder(button.dataset.folderToggle);
        return true;
      }
      if (button.dataset.resultSource) {
        selectNode(sourceNodeId(button.dataset.resultSource));
        return true;
      }
      if (button.dataset.graphNode) {
        selectNode(button.dataset.graphNode);
        return true;
      }
      if (button.dataset.graphPreset) {
        setPreset(button.dataset.graphPreset);
        return true;
      }
      if (button.dataset.graphZoom) {
        adjustZoom(button.dataset.graphZoom, root);
        return true;
      }
      if (button.dataset.graphFit !== undefined) {
        fit(root);
        return true;
      }
      if (button.dataset.copyGraph === "relations") {
        void copyRelations();
        return true;
      }
      if (button.dataset.copyGraph === "image") {
        void copyImage();
        return true;
      }
      return false;
    }

    function handleChange(target) {
      if (!target.matches?.("[data-graph-semantic]")) return false;
      setSemantic(target.checked);
      return true;
    }

    function connectedIds(id) {
      const ids = new Set([id]);
      const { edges } = graphData("dialog");
      edges.forEach((edge) => {
        if (edge.source === id) ids.add(edge.target);
        if (edge.target === id) ids.add(edge.source);
      });
      return ids;
    }

    function updateHover(root, id) {
      window.clearTimeout(hoverTimer);
      const preview = root.querySelector?.("[data-graph-hover-preview]");
      const node = nodeById(id);
      const source = sourceForNode(node);
      if (preview) preview.textContent = source ? `${source.title} · ${source.path}` : "当前正文块 · AI 旁路段落";
      hoverTimer = window.setTimeout(() => {
        const neighborhood = connectedIds(id);
        root.querySelectorAll?.("[data-graph-node]").forEach((element) => {
          element.classList.toggle("is-dimmed", !neighborhood.has(element.dataset.graphNode));
          element.classList.toggle("is-neighbour", neighborhood.has(element.dataset.graphNode));
        });
        root.querySelectorAll?.("[data-edge-source]").forEach((element) => {
          const active = element.dataset.edgeSource === id || element.dataset.edgeTarget === id;
          element.classList.toggle("is-dimmed", !active);
          element.classList.toggle("is-highlighted", active);
        });
      }, 80);
    }

    function clearHover(root) {
      window.clearTimeout(hoverTimer);
      root.querySelectorAll?.(".is-dimmed, .is-neighbour, .is-highlighted").forEach((element) => {
        element.classList.remove("is-dimmed", "is-neighbour", "is-highlighted");
      });
      const preview = root.querySelector?.("[data-graph-hover-preview]");
      if (preview) preview.textContent = "悬停节点查看路径 · 双击打开来源";
    }

    function handlePointerOver(event, root) {
      const node = event.target.closest?.("[data-graph-node]");
      if (!node || node.contains(event.relatedTarget)) return;
      updateHover(root, node.dataset.graphNode);
    }

    function handlePointerOut(event, root) {
      const node = event.target.closest?.("[data-graph-node]");
      if (!node || node.contains(event.relatedTarget)) return;
      window.setTimeout(() => clearHover(root), 120);
    }

    function handleDoubleClick(event) {
      const node = event.target.closest?.("[data-graph-node]");
      const source = sourceForNode(nodeById(node?.dataset.graphNode));
      if (!source) return;
      options.onOpenSource?.(source.id);
    }

    function handleWheel(event, root) {
      if (!event.target.closest?.("[data-graph-canvas]")) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      state.zoom = clamp(state.zoom * factor, 0.15, 3);
      applyViewport(root);
    }

    function handlePointerDown(event) {
      const canvas = event.target.closest?.("[data-graph-canvas]");
      if (!canvas || event.target.closest("button")) return;
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
      canvas.classList.add("is-panning");
      canvas.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event, root) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      state.panX = drag.panX + event.clientX - drag.x;
      state.panY = drag.panY + event.clientY - drag.y;
      applyViewport(root);
    }

    function handlePointerUp(event, root) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      root.querySelector?.("[data-graph-canvas]")?.classList.remove("is-panning");
    }

    return {
      presets: PRESETS,
      resultViews: RESULT_VIEWS,
      state,
      renderInline,
      renderDialog,
      handleButton,
      handleChange,
      handlePointerOver,
      handlePointerOut,
      handleDoubleClick,
      handleWheel,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      fit,
      applyViewport,
    };
  }

  window.PeakVaultRelationGraph = {
    create,
    presets: PRESETS.map((preset) => ({ ...preset })),
    resultViews: RESULT_VIEWS.map((view) => ({ ...view })),
  };
})();
