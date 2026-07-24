(() => {
  "use strict";

  /**
   * Design-fixture adapter for the production Vault Search Result Browser.
   *
   * The sidecar keeps a small, read-only local relationship preview because it
   * is part of the Copilot brief. The expanded modal intentionally does not
   * reproduce List / Folder / Graph, graph layouts, inspector logic, or search
   * state: it only marks where the production Vault Search component mounts.
   */

  const VIEW_LABELS = Object.freeze({
    list: "列表",
    tree: "文件夹",
    graph: "图谱",
  });

  const INLINE_POSITIONS = Object.freeze([
    [18, 24],
    [80, 25],
    [80, 74],
    [19, 75],
  ]);

  function create(options = {}) {
    const escapeHtml = options.escapeHtml || ((value) => String(value ?? ""));
    const icon = options.icon || (() => "");
    const state = options.state || {};
    const snapshot = options.snapshot || options.getSnapshot?.() || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : options.getSources?.() || [];
    const root = snapshot.root || { label: "当前正文对象" };
    const previewItems = items.slice(0, INLINE_POSITIONS.length);

    state.resultView = VIEW_LABELS[state.resultView] ? state.resultView : "graph";
    state.selectedSourceId = items.some((item) => item.id === state.selectedSourceId)
      ? state.selectedSourceId
      : previewItems[0]?.id || "";

    function renderInlineScene() {
      const nodes = [
        { id: root.id || "current-block", label: root.label, kind: "current", x: 50, y: 49 },
        ...previewItems.map((item, index) => ({
          id: `source:${item.id}`,
          sourceId: item.id,
          label: item.title,
          kind: "source",
          x: INLINE_POSITIONS[index][0],
          y: INLINE_POSITIONS[index][1],
        })),
      ];
      const rootId = nodes[0].id;
      const edges = previewItems.map((item, index) => ({
        source: rootId,
        target: `source:${item.id}`,
        kind: item.relationKind || (index % 3 === 0 ? "reference" : "semantic"),
      }));
      const positionById = new Map(nodes.map((node) => [node.id, node]));
      const lines = edges.map((edge) => {
        const source = positionById.get(edge.source);
        const target = positionById.get(edge.target);
        return `<line class="graph-edge is-${edge.kind}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" marker-end="url(#graph-arrow-inline)" data-edge-kind="${edge.kind}"></line>`;
      }).join("");
      const nodeButtons = nodes.map((node) => {
        const source = node.sourceId ? items.find((item) => item.id === node.sourceId) : null;
        const selected = Boolean(node.sourceId && node.sourceId === state.selectedSourceId);
        return `
          <button class="material-node is-${node.kind}${selected ? " is-selected" : ""}" type="button" data-graph-node="${node.id}" data-source-id="${node.sourceId || ""}" aria-pressed="${selected}" style="--node-x:${node.x}%;--node-y:${node.y}%">
            <strong>${escapeHtml(node.label)}</strong><small>${node.kind === "current" ? "当前对象" : `${source?.score || "—"}%`}</small>
          </button>
        `;
      }).join("");
      return `
        <div class="graph-scene is-inline" data-graph-surface="compact" role="group" aria-label="当前块相关材料预览，${nodes.length} 个节点">
          <svg class="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="graph-arrow-inline" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z"></path></marker></defs>
            ${lines}
          </svg>
          ${nodeButtons}
        </div>
      `;
    }

    function renderInlineDetail() {
      const source = items.find((item) => item.id === state.selectedSourceId) || previewItems[0];
      if (!source) return "";
      return `
        <div class="graph-selection-detail is-inline" data-selected-source="${escapeHtml(source.id)}">
          <span class="graph-detail-kicker">已选材料 · ${escapeHtml(source.score || "—")}% 关联</span>
          <strong>${escapeHtml(source.title)}</strong>
          <small>${escapeHtml(source.path)}</small>
          <p>${escapeHtml(source.reason)}</p>
          <div class="graph-detail-actions">
            <button type="button" data-view-source="${escapeHtml(source.id)}">${icon("eye")}查看来源</button>
            <button class="is-primary" type="button" data-use-source="${escapeHtml(source.id)}">带入协作</button>
          </div>
        </div>
      `;
    }

    function renderInline() {
      return `
        <div class="material-graph" id="related-material-graph" data-related-material-preview>
          <div class="material-graph-bar">
            <span>${icon("network")}<strong>当前块周边</strong><small>引用与 Semantic 关系的局部预览</small></span>
            <button type="button" data-open-graph>${icon("expand")}打开完整视图</button>
          </div>
          <div class="graph-canvas is-inline">${renderInlineScene()}</div>
          ${renderInlineDetail()}
        </div>
      `;
    }

    function renderDialog() {
      const requestedView = VIEW_LABELS[state.resultView] || VIEW_LABELS.graph;
      return `
        <article class="vault-result-browser-reuse is-dialog" data-vault-result-browser-reuse data-reuse-surface="dialog" data-requested-view="${escapeHtml(state.resultView)}" data-result-count="${items.length}" tabindex="-1">
          <header class="graph-dialog-head">
            <span>
              <strong id="graph-dialog-title">相关材料</strong>
              <small>Composer 只负责传入本轮冻结的材料快照</small>
            </span>
            <button class="icon-button" type="button" data-close-graph aria-label="关闭">${icon("x")}</button>
          </header>
          <section class="vault-result-browser-mount" aria-label="完整资料浏览组件复用位置">
            <i>${icon("network")}</i>
            <span class="vault-result-browser-kicker">复用现有组件</span>
            <strong>完整资料浏览组件</strong>
            <p>列表、文件夹、图谱、工具栏、键盘导航和详情面板复用现有 Vault Search / Quick Search 组件；这里只浏览本轮已找到的资料，不跳转，也不重新搜索。</p>
            <dl>
              <div><dt>打开视图</dt><dd>${escapeHtml(requestedView)}</dd></div>
              <div><dt>输入</dt><dd>${items.length} 项冻结材料 · 当前对象「${escapeHtml(root.label)}」</dd></div>
              <div><dt>Composer 回调</dt><dd>查看来源 · 带入协作</dd></div>
            </dl>
          </section>
          <footer class="vault-result-browser-note">设计标记：生产界面不会显示这段说明。</footer>
        </article>
      `;
    }

    function handleButton(button) {
      const nodeButton = button.closest?.("[data-graph-node]");
      if (!nodeButton?.dataset.sourceId) return false;
      state.selectedSourceId = nodeButton.dataset.sourceId;
      options.onRender?.();
      return true;
    }

    const noOp = () => false;

    return {
      snapshot,
      renderInline,
      renderDialog,
      handleButton,
      handleChange: noOp,
      handlePointerOver: noOp,
      handlePointerOut: noOp,
      handleDoubleClick: noOp,
      handleWheel: noOp,
      handlePointerDown: noOp,
      handlePointerMove: noOp,
      handlePointerUp: noOp,
      fit: noOp,
      applyViewport: noOp,
    };
  }

  window.PeakVaultResultBrowser = Object.freeze({ create });
})();
