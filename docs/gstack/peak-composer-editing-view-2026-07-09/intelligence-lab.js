(function () {
  "use strict";

  const CAPABILITY_GROUPS = {
    review: "编辑与审校",
    writing: "写作与生成",
    knowledge: "知识连接",
    document: "文档整理",
  };

  const CAPABILITIES = [
    { id: "correct-content", label: "修正内容", alias: "Correct Content", group: "review", mark: "修", description: "检查事实、逻辑与表述，把具体修正锚回正文。", scope: "当前块 / 全文", preview: "inline-diff", prompt: "检查当前块的事实、逻辑与表述，并把修正放回原位" },
    { id: "review-article", label: "审阅文章", alias: "Review Article", group: "review", mark: "审", description: "生成有锚点的结构、证据与清晰度 findings。", scope: "全文", preview: "finding", prompt: "审阅全文，标出结构、证据与清晰度问题" },
    { id: "polish-document", label: "润色文档", alias: "Polish Document", group: "review", mark: "润", description: "统一语气与表达，保留 Markdown 和内部链接。", scope: "选区 / 当前块 / 全文", preview: "inline-diff", prompt: "润色当前内容，保留原意、Markdown 与内部链接" },
    { id: "format-polish", label: "格式整理", alias: "Format Polish", group: "review", mark: "格", description: "规范标题、列表、空行与 Markdown 结构。", scope: "当前块 / 全文", preview: "inline-diff", prompt: "整理 Markdown 格式与层级，不改变内容含义" },
    { id: "rewrite-selection", label: "改写选区", alias: "Rewrite Selection", group: "review", mark: "改", description: "只改写显式选中的文字，并保留所在块结构。", scope: "选区", preview: "inline-diff", prompt: "保持原意，改写选中的文字，使它更清楚、更紧凑" },
    { id: "translate", label: "翻译", alias: "Translate", group: "writing", mark: "译", description: "翻译选区或当前内容，保留链接与 Markdown。", scope: "选区 / 当前块", preview: "inline-diff", prompt: "翻译当前内容，并完整保留 Markdown 与内部链接" },
    { id: "continue-writing", label: "继续写", alias: "Continue Writing", group: "writing", mark: "续", description: "沿当前落点与邻近语气续写真实段落草稿。", scope: "当前落点", preview: "insert-object", prompt: "沿着当前脉络继续写一段，并补足过渡与下一步" },
    { id: "writing-plan", label: "写作计划", alias: "Writing Plan", group: "writing", mark: "纲", description: "从当前主题和 Vault 材料生成可执行提纲。", scope: "全文 + Vault", preview: "insert-object", prompt: "基于当前主题与 Vault 材料生成可执行写作计划" },
    { id: "write-article", label: "从资料写文章", alias: "Write Article", group: "writing", mark: "写", description: "综合显式来源，生成带 [[引用]] 的文章草稿。", scope: "全文 + 显式来源", preview: "insert-object", prompt: "读取显式来源，生成一篇带可追溯 [[引用]] 的文章" },
    { id: "suggest-tags", label: "建议标签", alias: "Suggest Tags", group: "knowledge", mark: "标", description: "综合正文、图谱邻居与目录历史补全标签。", scope: "Frontmatter", preview: "metadata-diff", prompt: "综合正文、图谱邻居与目录历史，建议可解释的标签" },
    { id: "suggest-links", label: "建议链接", alias: "Suggest Links", group: "knowledge", mark: "链", description: "根据当前内容与既有链接找直接相关笔记。", scope: "当前内容 + Vault", preview: "insert-object", prompt: "找出与当前判断直接相关、值得补入正文的笔记链接" },
    { id: "suggest-links-graph", label: "图谱建议链接", alias: "Suggest Links Graph", group: "knowledge", mark: "图", description: "沿链接图谱寻找二跳关系，并解释推荐路径。", scope: "当前内容 + Link Graph", preview: "insert-object", prompt: "沿当前链接图谱寻找二跳关系，并解释每条推荐路径" },
    { id: "extract-concepts", label: "提取概念", alias: "Extract Concepts", group: "knowledge", mark: "概", description: "识别定义、关键概念与可拆分的独立笔记。", scope: "选区 / 全文", preview: "insert-object", prompt: "提取关键概念、定义与可拆成独立笔记的候选" },
    { id: "add-evidence", label: "补上依据", alias: "Add Evidence", group: "knowledge", mark: "据", description: "从 Vault 找到可追溯证据，并生成引用草稿。", scope: "当前判断 + Vault", preview: "insert-object", prompt: "为当前判断寻找可追溯的 Vault 证据，并补成引用" },
    { id: "suggest-split", label: "建议拆分", alias: "Suggest Split", group: "document", mark: "拆", description: "为长文提出边界、标题与多文件迁移计划。", scope: "全文", preview: "vertical-transform", prompt: "分析全文结构，提出拆分边界、标题与迁移计划" },
    { id: "summarize", label: "总结", alias: "Summarize", group: "document", mark: "摘", description: "生成可插回文首或当前位置的真实摘要草稿。", scope: "选区 / 全文", preview: "insert-object", prompt: "总结当前内容，生成可插回正文的执行摘要" },
    { id: "check-task-list", label: "检查任务列表", alias: "Check Task List", group: "document", mark: "任", description: "检查任务优先级、阻塞、时效和缺失动作。", scope: "任务项 / 全文", preview: "finding", prompt: "检查任务优先级、阻塞、过期状态与缺失动作" },
  ];

  const CONTEXT_COMMANDS = [
    { id: "select-text", label: "使用选中文本", alias: "Select text", mark: "选", description: "把正文里当前选区作为显式上下文。", scope: "Selection" },
    { id: "select-link", label: "选择当前链接", alias: "Select link", mark: "链", description: "把当前块中的一个 [[链接]] 作为来源。", scope: "Link" },
    { id: "select-links-graph", label: "选择链接图谱", alias: "Select links graph", mark: "图", description: "加入当前链接的一跳与二跳图谱上下文。", scope: "Link Graph" },
    { id: "concurrent-content", label: "并行内容", alias: "Concurrent content", mark: "并", description: "并行读取最近打开的三篇相关内容。", scope: "Open notes" },
  ];

  const INITIAL_HISTORY = [
    {
      id: "tx-correct-sidecar",
      actionId: "correct-content",
      label: "修正内容",
      targetId: "ai-sidecar",
      targetTitle: "AI 旁路段落",
      targetKind: "paragraph",
      time: "15:04",
      scope: "Paragraph · 2 行",
      delta: "+18 −8",
      before: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。",
      after: "AI 应该贴在当前块旁边：知道当前块的源范围与 Markdown 语法，自动参考 [[知识库]]，把候选修改放回正文原位，并在接受前保持可回滚。",
      status: "applied",
    },
    {
      id: "tx-evidence-structure",
      actionId: "add-evidence",
      label: "补上依据",
      targetId: "structure",
      targetTitle: "知识库结构段落",
      targetKind: "paragraph",
      time: "14:47",
      scope: "Paragraph · 1 行",
      delta: "+1 −0",
      before: "知识库的结构应由要存储、重组和输出的知识决定。",
      after: "知识库的结构应由要存储、重组和输出的知识决定。依据：[[知识库]] 将其定义为收集、组织与输出的连续闭环。",
      status: "applied",
    },
    {
      id: "tx-tags-metadata",
      actionId: "suggest-tags",
      label: "建议标签",
      targetId: "metadata",
      targetTitle: "Frontmatter metadata",
      targetKind: "metadata",
      time: "14:31",
      scope: "Frontmatter · 1 字段",
      delta: "+2 −0",
      before: "tags: [pkm]",
      after: "tags: [pkm, composer, ai-assisted]",
      status: "applied",
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const paper = $("#paper");
  const app = $("#composer-app");
  const panel = $("#intelligence-panel");
  const sidecarBody = $("#sidecar-body");
  const copilotDock = $("#copilot-dock");
  const capabilityPicker = $("#capability-picker");
  const liveRegion = $("#sidecar-live");
  const toast = $("#toast");

  const params = new URLSearchParams(window.location.search);
  const initialMode = ["copilot", "ambient", "history"].includes(params.get("mode")) ? params.get("mode") : "copilot";
  const initialBlock = $(".doc-block.is-active") || $(".doc-block", paper);

  const state = {
    mode: initialMode,
    panelOpen: params.get("drawer") !== "closed",
    activeBlock: initialBlock,
    selection: "",
    action: null,
    contexts: [
      { id: "focus", label: `当前块 · ${initialBlock?.dataset.blockTitle || "正文"}`, locked: true },
      { id: "nearby", label: "邻近 2 段", locked: false },
      { id: "ambient-knowledge", label: "Ambient · 知识库", locked: false },
    ],
    draftText: "",
    pickerOpen: false,
    pickerMode: "all",
    pickerQuery: "",
    thread: [],
    run: { status: "idle", stage: 0, targetId: null, capabilityId: null },
    draftPatch: null,
    ambient: {
      locked: true,
      refreshing: false,
      previewOpen: false,
      dismissed: false,
    },
    history: INITIAL_HISTORY.map((entry) => ({ ...entry })),
    activeHistoryId: INITIAL_HISTORY[0].id,
    rollbackConfirmId: null,
  };

  let runTimers = [];
  let toastTimer = null;
  let liveTimer = null;
  let selectionTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function truncate(value, max = 88) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function blockText(block = state.activeBlock) {
    if (!block) return "";
    return block.innerText?.trim() || block.textContent?.trim() || block.dataset.source || "";
  }

  function activeCapability() {
    if (state.action) return state.action;
    if (!state.draftText.trim()) return null;
    return {
      id: "freeform",
      label: "自定义指令",
      alias: "Custom instruction",
      mark: "AI",
      preview: "inline-diff",
      prompt: state.draftText.trim(),
      description: "按当前指令生成正文候选。",
      scope: "当前块",
    };
  }

  function capabilityById(id) {
    return CAPABILITIES.find((capability) => capability.id === id) || null;
  }

  function contextById(id) {
    return CONTEXT_COMMANDS.find((context) => context.id === id) || null;
  }

  function documentLength() {
    return (paper?.innerText || "").trim().length;
  }

  function capabilityGuard(capability) {
    const text = blockText();
    if (!capability) return "能力不可用。";
    if (capability.id === "rewrite-selection" && !state.selection) return "先在正文中选择一段文字；选区会自动变成 context chip。";
    if (capability.id === "check-task-list" && !/-\s*\[[ x]\]/i.test(paper?.innerText || "")) return "当前文档没有 Markdown task item（- [ ] / - [x]）。";
    if (capability.id === "suggest-split" && documentLength() < 500) return "当前文档不足 500 字；暂不建议消耗一次长文拆分。";
    if (["correct-content", "add-evidence"].includes(capability.id) && text.length < 36) return "当前对象太短，至少需要一条完整判断。";
    if (["summarize", "extract-concepts"].includes(capability.id) && documentLength() < 100) return "内容不足 100 字，暂时没有稳定的概念或摘要边界。";
    if (capability.id === "translate" && !text) return "当前对象没有可翻译内容。";
    return "";
  }

  function contextGuard(context) {
    const text = blockText();
    if (context.id === "select-text" && !state.selection) return "正文中还没有选区。";
    if (context.id === "select-link" && !/\[\[[^\]]+\]\]/.test(text)) return "当前块没有可选择的 [[链接]]。";
    if (context.id === "select-links-graph" && !/\[\[[^\]]+\]\]/.test(text)) return "先聚焦一个包含 [[链接]] 的块，才能展开链接图谱。";
    return "";
  }

  function recommendedCapabilityIds() {
    if (state.selection) return ["rewrite-selection", "polish-document", "translate"];
    const kind = state.activeBlock?.dataset.blockKind || "paragraph";
    if (kind === "metadata") return ["suggest-tags", "correct-content", "format-polish"];
    if (kind.startsWith("heading")) return ["writing-plan", "continue-writing", "suggest-split"];
    if (kind === "list") return ["format-polish", "summarize", "suggest-links-graph"];
    return ["correct-content", "add-evidence", "suggest-links-graph"];
  }

  function syncHeader() {
    const title = state.activeBlock?.dataset.blockTitle || "当前文档";
    const kind = state.activeBlock?.dataset.blockKind || "markdown";
    $("#focus-title").textContent = title;
    $("#focus-kind").textContent = kind;
    $("#sourcebar-context").textContent = `当前块 · ${title}`;
    $("#bottom-source").textContent = state.activeBlock?.dataset.source || truncate(blockText(), 120);
    const focusContext = state.contexts.find((context) => context.id === "focus");
    if (focusContext) focusContext.label = `当前块 · ${title}`;
    $$("[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $("#history-count").textContent = String(state.history.length);
    app.classList.toggle("is-panel-open", state.panelOpen);
    $$("[data-panel-toggle]").forEach((button) => button.setAttribute("aria-expanded", String(state.panelOpen)));
  }

  function renderCopilot() {
    const messages = state.thread.map((message) => `
      <article class="thread-message ${message.role === "user" ? "is-user" : "is-assistant"}">
        <span>${message.role === "user" ? "你" : "AI"}</span>
        <div>
          <div class="message-meta"><strong>${escapeHtml(message.label || (message.role === "user" ? "你的指令" : "Copilot"))}</strong><time>${escapeHtml(message.time || "刚刚")}</time></div>
          <p>${escapeHtml(message.text)}</p>
        </div>
      </article>`).join("");

    const observation = !state.thread.length && state.run.status === "idle" ? `
      <article class="thread-message is-assistant">
        <span>AI</span>
        <div>
          <div class="message-meta"><strong>我注意到一个可追溯判断</strong><time>现在</time></div>
          <p>当前块引用了 [[知识库]]，但还没说明这条来源如何支撑“结果回到正文原位”。可以先修正表述、补依据，或沿链接图谱找相关材料。</p>
        </div>
      </article>` : "";

    const run = renderRunState();
    sidecarBody.innerHTML = `
      <div class="mode-view copilot-view">
        <div class="copilot-intro">
          <span><svg><use href="#lab-spark"></use></svg></span>
          <div><strong>我跟着当前对象工作</strong><p>上下文已自动带入。运行后，候选会直接出现在正文目标位置。</p></div>
        </div>
        <div class="copilot-thread">${observation}${messages}${run}</div>
      </div>`;
    requestAnimationFrame(() => { sidecarBody.scrollTop = sidecarBody.scrollHeight; });
  }

  function renderRunState() {
    if (state.run.status === "idle") return "";
    const capability = capabilityById(state.run.capabilityId) || activeCapability();
    const label = capability?.label || "自定义指令";
    const stages = ["冻结当前对象与上下文", "读取 Vault / 图谱来源", "把候选流回正文原位"];
    const stageMarkup = stages.map((stage, index) => {
      const className = index < state.run.stage ? "is-done" : index === state.run.stage ? "is-current" : "";
      return `<span class="${className}">${escapeHtml(stage)}</span>`;
    }).join("");

    if (["assembling", "streaming"].includes(state.run.status)) {
      return `
        <article class="thread-message is-assistant">
          <span>AI</span>
          <div>
            <div class="message-meta"><strong>${escapeHtml(label)} · 处理中</strong><time>现在</time></div>
            <p>侧栏只报告进度；正文目标已进入生成状态。</p>
            <div class="run-trace">${stageMarkup}</div>
          </div>
        </article>`;
    }

    const statusCopy = {
      "preview-ready": ["候选已回到正文", "接受或丢弃都在正文原位完成；未接受内容不会进入 History。"],
      accepted: ["正文已接受写入", "真实变动已记入 History，可定位并回滚。"],
      rejected: ["候选已丢弃", "正文与 History 都没有写入这次候选。"],
      cancelled: ["运行已停止", "正文中的生成状态已清理。"],
      stale: ["正文已在运行中变化", "候选已标记 stale。重新运行后才能接受。"],
    }[state.run.status] || ["运行状态", "等待下一步。"];

    return `
      <article class="thread-message is-assistant">
        <span>AI</span>
        <div>
          <div class="message-meta"><strong>${escapeHtml(statusCopy[0])}</strong><time>现在</time></div>
          <p>${escapeHtml(statusCopy[1])}</p>
          ${state.run.status === "preview-ready" ? `<div class="transaction-receipt"><span><small>Editor preview</small><strong>${escapeHtml(label)} · ${escapeHtml(state.activeBlock?.dataset.blockTitle || "当前块")}</strong></span><button type="button" data-locate-run>定位正文</button></div>` : ""}
        </div>
      </article>`;
  }

  function renderDock() {
    const isCopilot = state.mode === "copilot";
    copilotDock.hidden = !isCopilot;
    if (!isCopilot) {
      capabilityPicker.hidden = true;
      return;
    }

    const recommendations = recommendedCapabilityIds().map(capabilityById).filter(Boolean);
    const quickActions = recommendations.map((capability) => `<button type="button" data-starter="${capability.id}" title="${escapeHtml(capability.alias)}">${escapeHtml(capability.label)}</button>`).join("");
    const actionChip = state.action ? `
      <span class="composer-chip is-action"><svg><use href="#lab-spark"></use></svg>${escapeHtml(state.action.label)}<button type="button" data-remove-action aria-label="移除 ${escapeHtml(state.action.label)}"><svg><use href="#lab-x"></use></svg></button></span>` : "";
    const contextChips = state.contexts.map((context) => `
      <span class="composer-chip"><svg><use href="#lab-link"></use></svg>${escapeHtml(context.label)}${context.locked ? "" : `<button type="button" data-remove-context="${escapeHtml(context.id)}" aria-label="移除 ${escapeHtml(context.label)}"><svg><use href="#lab-x"></use></svg></button>`}</span>`).join("");
    const running = ["assembling", "streaming"].includes(state.run.status);
    const canSend = Boolean(activeCapability()) && !running;
    const placeholder = state.action ? `补充“${state.action.label}”的要求；也可以留空直接运行…` : "描述要改什么，或从全部能力开始…";

    copilotDock.innerHTML = `
      <div class="quick-actions" aria-label="推荐能力">${quickActions}</div>
      <div class="composer-box">
        <div class="composer-chip-row">${actionChip}${contextChips}</div>
        <textarea id="composer-input" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(state.draftText)}</textarea>
        <div class="composer-foot">
          <span>
            <button type="button" data-open-context aria-label="添加上下文"><svg><use href="#lab-plus"></use></svg></button>
            <button type="button" data-open-capabilities aria-expanded="${state.pickerOpen && state.pickerMode === "all"}"><svg><use href="#lab-command"></use></svg><span>全部能力</span></button>
          </span>
          <span>
            <button type="button" title="自动选择模型与工具">自动</button>
            ${running
              ? `<button class="send-button" type="button" data-stop-run aria-label="停止运行"><svg><use href="#lab-x"></use></svg></button>`
              : `<button class="send-button" type="button" data-send ${canSend ? "" : "disabled"} aria-label="运行"><svg><use href="#lab-arrow-up"></use></svg></button>`}
          </span>
        </div>
      </div>`;
    updateDockHeight();
  }

  function renderPicker() {
    if (!state.pickerOpen || state.mode !== "copilot") {
      capabilityPicker.hidden = true;
      return;
    }
    const query = state.pickerQuery.trim().toLowerCase();
    const recommendedIds = recommendedCapabilityIds();
    const capabilityRows = CAPABILITIES.filter((capability) => {
      const haystack = [capability.label, capability.alias, capability.description, capability.id, CAPABILITY_GROUPS[capability.group]].join(" ").toLowerCase();
      return state.pickerMode === "all" && (!query || haystack.includes(query));
    });
    const contextRows = CONTEXT_COMMANDS.filter((context) => {
      const haystack = [context.label, context.alias, context.description, context.id].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

    const groups = [];
    if (state.pickerMode === "all" && !query) {
      const recommended = recommendedIds.map(capabilityById).filter(Boolean);
      groups.push({ label: `推荐给${state.selection ? "当前选区" : "当前对象"}`, hint: "动态排序", type: "capability", rows: recommended, recommended: true });
    }
    if (state.pickerMode === "all") {
      Object.entries(CAPABILITY_GROUPS).forEach(([group, label]) => {
        const rows = capabilityRows.filter((capability) => capability.group === group && (query || !recommendedIds.includes(capability.id)));
        if (rows.length) groups.push({ label, hint: `${rows.length} 项`, type: "capability", rows, recommended: false });
      });
    }
    if (contextRows.length) groups.push({ label: "上下文", hint: "加入输入框", type: "context", rows: contextRows, recommended: false });

    const groupMarkup = groups.map((group) => `
      <section class="capability-group">
        <header><span>${escapeHtml(group.label)}</span><small>${escapeHtml(group.hint)}</small></header>
        ${group.rows.map((item) => pickerRow(item, group.type, group.recommended)).join("")}
      </section>`).join("");

    capabilityPicker.innerHTML = `
      <div class="palette-head">
        <div class="palette-title"><span><strong>${state.pickerMode === "context" ? "添加上下文" : "全部能力"}</strong><small>${state.pickerMode === "context" ? "显式来源会变成 context chip" : "选择后变成 action chip，不离开输入框"}</small></span><button class="icon-button" type="button" data-close-picker aria-label="关闭能力面板"><svg><use href="#lab-x"></use></svg></button></div>
        <label class="palette-search"><svg><use href="#lab-search"></use></svg><input id="capability-search" type="search" value="${escapeHtml(state.pickerQuery)}" placeholder="搜索能力、结果或英文名称" autocomplete="off" /></label>
      </div>
      <div class="palette-scroll">${groupMarkup || `<div class="palette-empty">没有匹配项。可以搜索英文能力名、动作或上下文来源。</div>`}</div>`;
    capabilityPicker.hidden = false;
  }

  function pickerRow(item, type, recommended) {
    const guard = type === "context" ? contextGuard(item) : capabilityGuard(item);
    const selected = type === "context" && state.contexts.some((context) => context.id === item.id);
    return `
      <button class="capability-row${recommended ? " is-recommended" : ""}${guard ? " is-disabled" : ""}" type="button" data-picker-type="${type}" data-picker-id="${item.id}" aria-disabled="${guard ? "true" : "false"}">
        <span class="capability-mark">${escapeHtml(item.mark)}</span>
        <span class="capability-copy"><strong>${escapeHtml(item.label)} · ${escapeHtml(item.alias)}</strong><small>${escapeHtml(guard || item.description)}</small></span>
        <span class="capability-meta"><em>${escapeHtml(selected ? "已加入" : recommended ? "推荐" : item.scope)}</em></span>
      </button>`;
  }

  function renderAmbient() {
    const focusTitle = state.activeBlock?.dataset.blockTitle || "当前文档";
    const primary = state.ambient.dismissed ? `
      <div class="ambient-empty"><strong>这一轮没有待处理的强关联</strong><br />被忽略的候选不会再次打断阅读；手动刷新可以重新计算。</div>` : state.ambient.refreshing ? `
      <div class="ambient-empty"><strong>正在重新感知当前工作</strong><br />比较当前块、最近编辑与链接图谱，不会写入正文。</div>` : `
      <article class="primary-push">
        <div class="primary-push-main">
          <div class="push-title"><span><strong>知识库.md</strong><code>B-2/信息聚合-PKM/知识库.md</code></span><span class="confidence-label">强关联 · 91%</span></div>
          <p>它定义了“收集 → 组织 → 输出”的闭环，正好能支撑当前段落关于 AI 结果必须回到编辑现场的判断。</p>
          <div class="push-signals"><span>共享标签</span><span>当前 [[链接]]</span><span>最近打开</span></div>
        </div>
        ${state.ambient.previewOpen ? `<div class="push-preview"><small>来源预览</small><p>知识不是收集完成就结束；只有被重新组织并进入输出，笔记系统才形成可验证的闭环。</p></div>` : ""}
        <div class="push-actions"><button type="button" data-ambient-action="preview"><svg><use href="#lab-eye"></use></svg>${state.ambient.previewOpen ? "收起预览" : "预览"}</button><button class="is-primary" type="button" data-ambient-action="use">加入正文</button><button type="button" data-ambient-action="dismiss">忽略</button></div>
      </article>`;

    sidecarBody.innerHTML = `
      <div class="mode-view ambient-view">
        <section class="work-state">
          <header><span>Current Work State</span><button class="icon-button" type="button" data-ambient-action="lock" title="${state.ambient.locked ? "解锁工作主题" : "锁定工作主题"}"><svg><use href="#lab-lock"></use></svg></button></header>
          <h2 contenteditable="${state.ambient.locked ? "false" : "true"}">把分散的知识管理判断整理成可验证的编辑工作流</h2>
          <p>从「${escapeHtml(focusTitle)}」、最近编辑与打开文件中推断 · 置信度 82%</p>
          <div class="work-thread"><span>正在跟随</span><i>›</i><span>编辑现场</span><i>›</i><span>可追溯依据</span><i>›</i><span>可回滚写入</span></div>
        </section>
        <section class="ambient-primary">
          <header class="ambient-section-head"><span>此刻值得看</span><button class="icon-button" type="button" data-ambient-action="refresh" title="重新感知"><svg><use href="#lab-refresh"></use></svg></button></header>
          ${primary}
        </section>
        <details class="ambient-disclosure">
          <summary><span>为什么是现在</span><small>3 个信号</small></summary>
          <div class="trace-list"><div class="trace-row"><time>14:24</time><span>打开「Base 使用判断」寻找结构化输出依据</span></div><div class="trace-row"><time>14:29</time><span>把分类列表转成工作流表格</span></div><div class="trace-row"><time>14:32</time><span>聚焦当前段落中的 [[知识库]] 链接</span></div></div>
        </details>
        <details class="ambient-disclosure">
          <summary><span>弱关联材料</span><small>2 条折叠</small></summary>
          <div class="weak-list"><div class="weak-row"><span><strong>Base 使用判断.md</strong><small>相邻链接 · 结构化输出</small></span><button class="inline-action" type="button" data-ambient-context="base">带到 Copilot</button></div><div class="weak-row"><span><strong>知识回顾.md</strong><small>Canvas 邻居 · 复盘路径</small></span><button class="inline-action" type="button" data-ambient-context="review">带到 Copilot</button></div></div>
        </details>
        <details class="ambient-disclosure">
          <summary><span>Session Thought Trace</span><small>2 个未落位</small></summary>
          <div class="thought-list"><div class="thought-row"><span><strong>原生对象也应保留增量过程</strong><small>尚未安放进正文</small></span><button class="inline-action" type="button" data-ambient-context="native">带到 Copilot</button></div><div class="thought-row"><span><strong>表格与公式 review 都用上下对比</strong><small>设计判断 · 尚未确认</small></span><button class="inline-action" type="button" data-ambient-context="vertical">带到 Copilot</button></div></div>
        </details>
      </div>`;
  }

  function renderHistory() {
    const active = state.history.find((entry) => entry.id === state.activeHistoryId) || state.history[0] || null;
    const rows = state.history.map((entry) => `
      <button class="history-row${entry.id === active?.id ? " is-active" : ""}${entry.status === "rolled-back" ? " is-rolled-back" : ""}" type="button" data-history-select="${entry.id}">
        <span class="history-node"></span>
        <span class="history-copy"><span><strong>${escapeHtml(entry.label)}</strong><time>${escapeHtml(entry.time)}</time></span><small>${escapeHtml(entry.targetTitle)}</small></span>
        <span class="history-scope"><span>${escapeHtml(entry.scope)}</span>${entry.status === "rolled-back" ? "<em>已回滚</em>" : `<b>${escapeHtml(entry.delta)}</b>`}</span>
      </button>`).join("");

    sidecarBody.innerHTML = `
      <div class="mode-view history-view">
        <header class="history-heading"><span>已接受写入</span><small>本次协作 · ${state.history.length} 笔事务</small></header>
        ${rows ? `<div class="history-timeline">${rows}</div>${renderHistoryDiff(active)}` : `<div class="history-empty">还没有已接受写入。生成中、已丢弃和只读 findings 都不会出现在这里。</div>`}
        <div class="history-footnote"><svg><use href="#lab-check"></use></svg>Vault 会话已保存 · Git 是可选长期适配器</div>
      </div>`;
  }

  function renderHistoryDiff(entry) {
    if (!entry) return "";
    const confirming = state.rollbackConfirmId === entry.id;
    return `
      <section class="history-diff" aria-label="${escapeHtml(entry.label)} before after diff">
        <header class="history-diff-head">
          <span><strong>${escapeHtml(entry.label)} · ${escapeHtml(entry.targetTitle)}</strong><small>${escapeHtml(entry.targetKind)} · ${escapeHtml(entry.scope)}</small></span>
          <span class="history-diff-actions">
            <button type="button" data-history-locate="${entry.id}"><svg><use href="#lab-locate"></use></svg>定位</button>
            ${entry.status === "rolled-back" ? "" : `<button class="${confirming ? "is-confirm" : ""}" type="button" data-history-rollback="${entry.id}"><svg><use href="#lab-undo"></use></svg>${confirming ? "再次点击确认" : "回滚"}</button>`}
          </span>
        </header>
        <div class="diff-block is-before"><span>Before</span><code>${escapeHtml(entry.before)}</code></div>
        <div class="diff-block is-after"><span>After</span><code>${escapeHtml(entry.after)}</code></div>
      </section>`;
  }

  function renderBody() {
    if (state.mode === "ambient") renderAmbient();
    else if (state.mode === "history") renderHistory();
    else renderCopilot();
  }

  function renderAll() {
    syncHeader();
    renderBody();
    renderDock();
    renderPicker();
  }

  function updateDockHeight() {
    requestAnimationFrame(() => {
      const height = copilotDock.hidden ? 0 : copilotDock.getBoundingClientRect().height;
      panel.style.setProperty("--dock-height", `${Math.ceil(height)}px`);
    });
  }

  function setLive(message, done = false) {
    clearTimeout(liveTimer);
    liveRegion.textContent = message;
    liveRegion.classList.add("is-visible");
    liveRegion.classList.toggle("is-done", done);
    if (done) {
      liveTimer = window.setTimeout(() => liveRegion.classList.remove("is-visible", "is-done"), 1800);
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 1900);
  }

  function setMode(mode, updateUrl = true) {
    if (!["copilot", "ambient", "history"].includes(mode)) return;
    state.mode = mode;
    state.pickerOpen = false;
    state.rollbackConfirmId = null;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", mode);
      window.history.replaceState({}, "", url);
    }
    renderAll();
  }

  function setPanelOpen(open, restoreFocus = false) {
    state.panelOpen = open;
    syncHeader();
    if (!open) state.pickerOpen = false;
    renderPicker();
    if (restoreFocus) $("[data-panel-toggle]")?.focus();
  }

  function setActiveBlock(block) {
    if (!block || !paper.contains(block)) return;
    $$(".doc-block.is-active", paper).forEach((candidate) => candidate.classList.remove("is-active"));
    block.classList.add("is-active");
    state.activeBlock = block;
    state.contexts = state.contexts.filter((context) => context.id !== "selected-text");
    state.selection = "";
    syncHeader();
    renderBody();
    renderDock();
    renderPicker();
  }

  function openPicker(mode) {
    state.pickerOpen = true;
    state.pickerMode = mode;
    state.pickerQuery = "";
    renderDock();
    renderPicker();
    requestAnimationFrame(() => $("#capability-search")?.focus());
  }

  function closePicker(returnFocus = false) {
    state.pickerOpen = false;
    renderDock();
    renderPicker();
    if (returnFocus) $("[data-open-capabilities]")?.focus();
  }

  function bindCapability(capability) {
    const guard = capabilityGuard(capability);
    if (guard) return showToast(guard);
    state.action = capability;
    state.run = { status: "idle", stage: 0, targetId: null, capabilityId: capability.id };
    state.pickerOpen = false;
    if (capability.id === "rewrite-selection" && state.selection) addContext({ id: "selected-text", label: `选区 · ${state.selection.length} 字`, locked: false });
    if (["suggest-links", "suggest-links-graph", "add-evidence"].includes(capability.id)) addContext({ id: "ambient-knowledge", label: "Ambient · 知识库", locked: false });
    renderAll();
    requestAnimationFrame(() => $("#composer-input")?.focus());
  }

  function addContext(context) {
    const existing = state.contexts.find((item) => item.id === context.id);
    if (existing) {
      existing.label = context.label;
      return;
    }
    state.contexts.push(context);
  }

  function bindContext(context) {
    const guard = contextGuard(context);
    if (guard) return showToast(guard);
    const labelMap = {
      "select-text": `选区 · ${state.selection.length} 字`,
      "select-link": "链接 · [[知识库]]",
      "select-links-graph": "链接图谱 · 6 个节点",
      "concurrent-content": "并行内容 · 3 篇",
    };
    addContext({ id: context.id, label: labelMap[context.id], locked: false });
    renderDock();
    renderPicker();
    showToast(`已加入上下文：${labelMap[context.id]}`);
  }

  function clearRunTimers() {
    runTimers.forEach((timer) => clearTimeout(timer));
    runTimers = [];
  }

  function startRun(options = {}) {
    const capability = activeCapability();
    if (!capability) return showToast("先选择一个能力，或输入你想完成的目标");
    const guard = capability.id === "freeform" ? "" : capabilityGuard(capability);
    if (guard) return showToast(guard);

    clearRunTimers();
    $("[data-document-draft]")?.remove();
    state.draftPatch = null;
    const target = resolveTargetBlock(capability);
    state.run = { status: "assembling", stage: 0, targetId: target.dataset.blockId, capabilityId: capability.id };
    state.thread.push({ role: "user", label: capability.label, text: state.draftText.trim() || capability.prompt, time: "刚刚" });
    mountRunningDraft(capability, target, 0);
    setLive(`正在为“${target.dataset.blockTitle}”组装上下文`);
    renderBody();
    renderDock();

    if (options.instant) {
      completeRun(capability, target);
      return;
    }
    if (options.freezeStreaming) {
      state.run.status = "streaming";
      state.run.stage = 1;
      mountRunningDraft(capability, target, 1);
      renderBody();
      return;
    }
    runTimers.push(window.setTimeout(() => advanceRun(capability, target, 1), 460));
    runTimers.push(window.setTimeout(() => advanceRun(capability, target, 2), 980));
    runTimers.push(window.setTimeout(() => completeRun(capability, target), 1540));
  }

  function advanceRun(capability, target, stage) {
    state.run.status = "streaming";
    state.run.stage = stage;
    mountRunningDraft(capability, target, stage);
    setLive(stage === 1 ? "正在读取 Vault 与链接图谱" : "候选正在流回正文原位");
    renderBody();
    renderDock();
  }

  function resolveTargetBlock(capability) {
    if (capability.id === "suggest-tags") return $("[data-block-id='metadata']", paper) || state.activeBlock;
    if (capability.id === "check-task-list") return $("[data-block-kind='list']", paper) || state.activeBlock;
    return state.activeBlock || $(".doc-block", paper);
  }

  function mountRunningDraft(capability, target, stage) {
    $("[data-document-draft]")?.remove();
    const statuses = ["正在冻结当前源范围…", "正在读取自动上下文…", "正在流式生成正文候选…"];
    const section = document.createElement("section");
    section.className = "document-draft";
    section.dataset.documentDraft = "running";
    section.contentEditable = "false";
    section.innerHTML = `
      <div class="draft-head"><span><svg><use href="#lab-spark"></use></svg>${escapeHtml(capability.label)}</span><small>${escapeHtml(statuses[stage] || statuses[0])}</small></div>
      <div class="run-trace"><span class="${stage === 0 ? "is-current" : "is-done"}">锁定 ${escapeHtml(target.dataset.blockTitle || "当前块")}</span><span class="${stage === 1 ? "is-current" : stage > 1 ? "is-done" : ""}">读取 ${state.contexts.length} 个上下文来源</span><span class="${stage === 2 ? "is-current" : ""}">生成可回滚 patch</span></div>`;
    target.insertAdjacentElement("afterend", section);
  }

  function candidateFor(capability, target) {
    const before = blockText(target);
    const rewriteCandidates = {
      "correct-content": "AI 侧栏应贴着当前块工作：它读取稳定的 Markdown 源范围，自动携带相关上下文，把候选修改流回正文原位，并只在用户接受后形成可回滚事务。",
      "polish-document": "AI sidecar 贴着当前块协作：理解源范围与 Markdown 结构，自动带入相关上下文，把候选修改送回正文原位，并在接受前保持可撤销。",
      "format-polish": before.replace(/；/g, "；\n").replace(/，/g, "，"),
      translate: "The AI sidecar stays beside the active block, understands its Markdown source range, carries relevant context automatically, and returns every candidate edit to the document for review before it is committed.",
      "rewrite-selection": state.selection ? before.replace(state.selection, `更清晰地说，${state.selection}`) : before,
      freeform: "AI 侧栏围绕当前对象协作：自动理解上下文，在正文原位生成候选，并把接受后的真实写入交给 History 记录与回滚。",
    };
    if (Object.hasOwn(rewriteCandidates, capability.id)) {
      return { mode: "rewrite", before, after: rewriteCandidates[capability.id], candidate: rewriteCandidates[capability.id] };
    }

    const insertCandidates = {
      "add-evidence": "依据：[[知识库]] 将知识工作定义为“收集 → 组织 → 输出”的连续闭环；这说明 AI 候选只有回到正文并完成显式接受，才算一次可验证的编辑结果。",
      "suggest-links": "相关材料：[[知识库]] · [[Base 使用判断]] · [[知识回顾]]",
      "suggest-links-graph": "图谱路径：[[知识库]] → [[结构化输出]] → [[Composer 事务模型]]；二跳关系来自共享标签与最近工作脉络。",
      "continue-writing": "因此，侧栏不应成为第二个内容仓库。它只负责理解目标、组织执行和报告状态，真正的候选与接受动作始终留在文档对象上。",
      "writing-plan": "写作计划\n1. 定义编辑现场与当前对象\n2. 说明自动上下文与能力选择\n3. 展示正文原位 review\n4. 用 History 解释定位与回滚",
      "write-article": "## Intelligence sidecar 的协作边界\n\n侧栏围绕当前对象组织 AI 工作，而 Markdown 与原生文件继续作为内容真相源。参考 [[知识库]]。",
      "suggest-tags": "tags: [pkm, composer, ai-sidecar, reviewable-editing]",
      "extract-concepts": "候选概念：Current Work State、Context Chip、Composer Capability、Reviewable Patch、Accepted Transaction。",
      "suggest-split": "拆分建议：将“编辑体验”“AI 上下文”“事务与回滚”拆成三篇相互链接的原子笔记。",
      summarize: "摘要：Intelligence 通过当前对象、自动上下文和正文原位候选，把 AI 从独立聊天工具变成可审阅、可回滚的编辑 sidecar。",
      "review-article": "Review finding：当前段落已经说明结果回到正文，但还需要补充“接受后才进入 History”这一事务边界。",
      "check-task-list": "Task finding：当前文档没有 Markdown task item，因此没有生成可写入的任务修正。",
    };
    const candidate = insertCandidates[capability.id] || "已生成一个与当前对象兼容的正文候选。";
    const mode = ["review-article", "check-task-list"].includes(capability.id) ? "finding" : capability.preview === "metadata-diff" ? "rewrite" : "insert";
    return { mode, before, after: mode === "rewrite" ? candidate : `${before}\n\n${candidate}`, candidate };
  }

  function completeRun(capability, target) {
    clearRunTimers();
    state.run.status = "preview-ready";
    state.run.stage = 3;
    state.draftPatch = {
      id: `draft-${Date.now()}`,
      actionId: capability.id,
      label: capability.label,
      targetId: target.dataset.blockId,
      targetTitle: target.dataset.blockTitle || "当前块",
      targetKind: target.dataset.blockKind || "markdown",
      ...candidateFor(capability, target),
    };
    renderDocumentPatch(state.draftPatch, target);
    setLive("候选已放回正文原位，等待接受", true);
    renderBody();
    renderDock();
  }

  function renderDocumentPatch(patch, target) {
    $("[data-document-draft]")?.remove();
    const content = patch.mode === "rewrite"
      ? `<div class="draft-content"><p><del>${escapeHtml(patch.before)}</del></p><p><ins>${escapeHtml(patch.after)}</ins></p></div>`
      : `<div class="draft-content"><p>${escapeHtml(patch.candidate).replaceAll("\n", "<br />")}</p></div>`;
    const section = document.createElement("section");
    section.className = "document-draft";
    section.dataset.documentDraft = patch.id;
    section.contentEditable = "false";
    section.innerHTML = `
      <div class="draft-head"><span><svg><use href="#lab-spark"></use></svg>${escapeHtml(patch.label)} · ${patch.mode === "rewrite" ? "原位改写" : patch.mode === "finding" ? "锚定 finding" : "插入草稿"}</span><small>尚未写入 Markdown</small></div>
      ${content}
      <div class="draft-actions"><button type="button" data-draft-action="discard">丢弃</button><button type="button" data-draft-action="retry">重试</button>${patch.mode === "finding" ? "" : `<button class="is-accept" type="button" data-draft-action="accept">接受写入</button>`}</div>`;
    target.insertAdjacentElement("afterend", section);
  }

  function acceptDraft() {
    const patch = state.draftPatch;
    if (!patch) return;
    const target = $(`[data-block-id="${patch.targetId}"]`, paper);
    if (!target) return showToast("目标块已移动；请重新运行");
    if (patch.mode === "rewrite") {
      const editable = target.querySelector("p, h1, h2, li, .metadata-grid") || target;
      if (patch.actionId === "suggest-tags" && editable.classList.contains("metadata-grid")) {
        const tagRow = editable.querySelector(".tag-row");
        if (tagRow) tagRow.innerHTML = '<span class="tag-chip">pkm</span><span class="tag-chip">composer</span><span class="tag-chip">ai-sidecar</span><span class="tag-chip">reviewable-editing</span>';
      } else {
        editable.textContent = patch.after;
      }
      target.dataset.source = patch.after;
    } else {
      const inserted = document.createElement("section");
      inserted.className = "doc-block paragraph-block accepted-insert";
      inserted.dataset.blockId = `accepted-${Date.now()}`;
      inserted.dataset.blockKind = "paragraph";
      inserted.dataset.blockTitle = `${patch.label}写入`;
      inserted.dataset.source = patch.candidate;
      inserted.innerHTML = `<p>${escapeHtml(patch.candidate)}</p>`;
      target.insertAdjacentElement("afterend", inserted);
    }
    $("[data-document-draft]")?.remove();
    const entry = {
      id: `tx-${Date.now()}`,
      actionId: patch.actionId,
      label: patch.label,
      targetId: patch.targetId,
      targetTitle: patch.targetTitle,
      targetKind: patch.targetKind,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      scope: `${patch.targetKind} · ${patch.mode === "rewrite" ? "原位改写" : "新增 1 块"}`,
      delta: patch.mode === "rewrite" ? "+1 −1" : "+1 −0",
      before: patch.before,
      after: patch.after,
      status: "applied",
    };
    state.history.unshift(entry);
    state.activeHistoryId = entry.id;
    state.run.status = "accepted";
    state.draftPatch = null;
    syncHeader();
    renderBody();
    renderDock();
    setLive("正文已接受写入，并记入 History", true);
    showToast("已写入正文 · 可在 History 定位与回滚");
  }

  function discardDraft() {
    $("[data-document-draft]")?.remove();
    state.draftPatch = null;
    state.run.status = "rejected";
    renderBody();
    renderDock();
    setLive("候选已丢弃；History 未新增记录", true);
  }

  function retryDraft() {
    $("[data-document-draft]")?.remove();
    state.draftPatch = null;
    state.run.status = "idle";
    startRun();
  }

  function stopRun() {
    clearRunTimers();
    $("[data-document-draft]")?.remove();
    state.run.status = "cancelled";
    state.draftPatch = null;
    setLive("运行已停止，正文没有写入", true);
    renderBody();
    renderDock();
  }

  function markRunStale() {
    if (!["assembling", "streaming", "preview-ready"].includes(state.run.status)) return;
    clearRunTimers();
    state.run.status = "stale";
    state.draftPatch = null;
    const draft = $("[data-document-draft]");
    if (draft) {
      draft.innerHTML = `<div class="draft-head"><span><svg><use href="#lab-spark"></use></svg>正文已变化</span><small>stale</small></div><div class="draft-content"><p>运行期间目标源范围发生变化。旧候选不能接受，请重新运行。</p></div><div class="draft-actions"><button class="is-accept" type="button" data-draft-action="retry">重新运行</button></div>`;
    }
    setLive("正文已变化，旧候选已停止", true);
    renderBody();
    renderDock();
  }

  function useAmbientPush(label = "知识库.md") {
    addContext({ id: `ambient-${label}`, label: `Ambient · ${label.replace(/\.md$/i, "")}`, locked: false });
    state.action = capabilityById("add-evidence");
    state.draftText = "把这条关联作为可追溯依据，生成正文引用草稿";
    setMode("copilot");
    requestAnimationFrame(() => $("#composer-input")?.focus());
    showToast("关联材料已变成 context chip；接受前不会写入正文");
  }

  function selectHistoryEntry(id) {
    if (!state.history.some((entry) => entry.id === id)) return;
    state.activeHistoryId = id;
    state.rollbackConfirmId = null;
    renderHistory();
  }

  function locateHistoryEntry(id) {
    const entry = state.history.find((candidate) => candidate.id === id);
    const block = entry ? $(`[data-block-id="${entry.targetId}"]`, paper) : null;
    if (!block) return showToast("这次写入的原始块已移动；生产版会用 source range adapter 重定位");
    setActiveBlock(block);
    block.scrollIntoView({ behavior: "smooth", block: "center" });
    block.classList.add("is-located");
    window.setTimeout(() => block.classList.remove("is-located"), 850);
    setLive(`已定位：${entry.targetTitle}`, true);
  }

  function rollbackHistoryEntry(id) {
    const entry = state.history.find((candidate) => candidate.id === id);
    if (!entry || entry.status === "rolled-back") return;
    if (state.rollbackConfirmId !== id) {
      state.rollbackConfirmId = id;
      renderHistory();
      return;
    }
    const block = $(`[data-block-id="${entry.targetId}"]`, paper);
    if (block) {
      const editable = block.querySelector("p, h1, h2, li") || block;
      editable.textContent = entry.before;
      block.dataset.source = entry.before;
    }
    entry.status = "rolled-back";
    const inverse = {
      id: `tx-rollback-${Date.now()}`,
      actionId: "rollback",
      label: `回滚 · ${entry.label}`,
      targetId: entry.targetId,
      targetTitle: entry.targetTitle,
      targetKind: entry.targetKind,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      scope: entry.scope,
      delta: `inverse of ${entry.id}`,
      before: entry.after,
      after: entry.before,
      status: "applied",
      inverseOf: entry.id,
    };
    state.history.unshift(inverse);
    state.activeHistoryId = inverse.id;
    state.rollbackConfirmId = null;
    syncHeader();
    renderHistory();
    setLive("已追加回滚事务；原记录仍保留", true);
    showToast("已回滚，并保留完整审计记录");
  }

  function updateSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (!state.selection) return;
      state.selection = "";
      state.contexts = state.contexts.filter((context) => context.id !== "selected-text");
      renderDock();
      renderPicker();
      return;
    }
    const range = selection.getRangeAt(0);
    const owner = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!owner || !paper.contains(owner)) return;
    const text = selection.toString().trim();
    if (!text || text === state.selection) return;
    state.selection = text;
    const block = owner.closest?.(".doc-block");
    if (block && block !== state.activeBlock) setActiveBlock(block);
    addContext({ id: "selected-text", label: `选区 · ${text.length} 字`, locked: false });
    renderDock();
    renderPicker();
  }

  document.addEventListener("click", (event) => {
    const panelToggle = event.target.closest("[data-panel-toggle]");
    if (panelToggle) return setPanelOpen(!state.panelOpen);
    if (event.target.closest("[data-panel-close]")) return setPanelOpen(false, true);

    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) return setMode(modeButton.dataset.mode);

    const starter = event.target.closest("[data-starter]");
    if (starter) return bindCapability(capabilityById(starter.dataset.starter));
    if (event.target.closest("[data-open-capabilities]")) return state.pickerOpen && state.pickerMode === "all" ? closePicker() : openPicker("all");
    if (event.target.closest("[data-open-context]")) return state.pickerOpen && state.pickerMode === "context" ? closePicker() : openPicker("context");
    if (event.target.closest("[data-close-picker]")) return closePicker(true);

    const pickerChoice = event.target.closest("[data-picker-id]");
    if (pickerChoice) {
      const type = pickerChoice.dataset.pickerType;
      return type === "context" ? bindContext(contextById(pickerChoice.dataset.pickerId)) : bindCapability(capabilityById(pickerChoice.dataset.pickerId));
    }

    if (event.target.closest("[data-remove-action]")) {
      state.action = null;
      state.run = { status: "idle", stage: 0, targetId: null, capabilityId: null };
      return renderAll();
    }
    const removeContext = event.target.closest("[data-remove-context]");
    if (removeContext) {
      state.contexts = state.contexts.filter((context) => context.id !== removeContext.dataset.removeContext);
      renderDock();
      renderPicker();
      return;
    }
    if (event.target.closest("[data-send]")) return startRun();
    if (event.target.closest("[data-stop-run]")) return stopRun();
    if (event.target.closest("[data-locate-run]")) {
      const target = $(`[data-block-id="${state.run.targetId}"]`, paper);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("is-located");
      window.setTimeout(() => target?.classList.remove("is-located"), 850);
      return;
    }

    const draftAction = event.target.closest("[data-draft-action]");
    if (draftAction) {
      if (draftAction.dataset.draftAction === "accept") return acceptDraft();
      if (draftAction.dataset.draftAction === "retry") return retryDraft();
      return discardDraft();
    }

    const ambientAction = event.target.closest("[data-ambient-action]");
    if (ambientAction) {
      const action = ambientAction.dataset.ambientAction;
      if (action === "preview") state.ambient.previewOpen = !state.ambient.previewOpen;
      if (action === "dismiss") state.ambient.dismissed = true;
      if (action === "lock") state.ambient.locked = !state.ambient.locked;
      if (action === "use") return useAmbientPush();
      if (action === "refresh") {
        if (state.ambient.refreshing) return;
        state.ambient.refreshing = true;
        state.ambient.dismissed = false;
        renderAmbient();
        setLive("Ambient 正在比较当前块与最近工作");
        window.setTimeout(() => {
          state.ambient.refreshing = false;
          renderAmbient();
          setLive("Ambient 已保留一条最高置信关联", true);
        }, 720);
        return;
      }
      renderAmbient();
      return;
    }

    const ambientContext = event.target.closest("[data-ambient-context]");
    if (ambientContext) {
      const labels = { base: "Base 使用判断.md", review: "知识回顾.md", native: "原生对象增量过程", vertical: "上下对比判断" };
      return useAmbientPush(labels[ambientContext.dataset.ambientContext]);
    }

    const historySelect = event.target.closest("[data-history-select]");
    if (historySelect) return selectHistoryEntry(historySelect.dataset.historySelect);
    const historyLocate = event.target.closest("[data-history-locate]");
    if (historyLocate) return locateHistoryEntry(historyLocate.dataset.historyLocate);
    const historyRollback = event.target.closest("[data-history-rollback]");
    if (historyRollback) return rollbackHistoryEntry(historyRollback.dataset.historyRollback);

    const block = event.target.closest(".doc-block");
    if (block && paper.contains(block)) setActiveBlock(block);

    if (state.pickerOpen && !event.target.closest("#intelligence-panel")) closePicker();
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "composer-input") {
      state.draftText = event.target.value;
      return;
    }
    if (event.target.id === "capability-search") {
      state.pickerQuery = event.target.value;
      renderPicker();
      requestAnimationFrame(() => {
        const input = $("#capability-search");
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
      return;
    }
    if (paper.contains(event.target)) {
      const block = event.target.closest(".doc-block");
      if (block) block.dataset.source = blockText(block);
      if (block?.dataset.blockId === state.run.targetId) markRunStale();
      syncHeader();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.pickerOpen) {
        event.preventDefault();
        closePicker(true);
        return;
      }
      if (window.matchMedia("(max-width: 1180px)").matches && state.panelOpen) {
        event.preventDefault();
        setPanelOpen(false, true);
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setPanelOpen(true);
      setMode("copilot");
      openPicker("all");
      return;
    }
    if (event.target.id === "composer-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (["assembling", "streaming"].includes(state.run.status)) stopRun();
      else startRun();
      return;
    }
    const tab = event.target.closest("[data-mode]");
    if (tab && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const modes = ["copilot", "ambient", "history"];
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const index = (modes.indexOf(state.mode) + offset + modes.length) % modes.length;
      setMode(modes[index]);
      $(`[data-mode="${modes[index]}"]`)?.focus();
    }
  });

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(updateSelection, 90);
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(updateDockHeight).observe(copilotDock);
  }

  function initializeDemoState() {
    const demo = params.get("demo");
    if (!demo) return;
    state.action = capabilityById("add-evidence");
    state.draftText = "用当前关联笔记补清这段判断的依据";
    renderAll();
    if (demo === "result") startRun({ instant: true });
    if (demo === "streaming") startRun({ freezeStreaming: true });
  }

  renderAll();
  initializeDemoState();
})();
