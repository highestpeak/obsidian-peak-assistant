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

  const AMBIENT_SOURCES = [
    {
      id: "knowledge-loop",
      title: "知识库.md",
      path: "B-2/信息聚合-PKM/知识库.md",
      confidence: 91,
      strength: "强关联",
      freshness: "14:29 最近编辑",
      foundBy: "当前 [[知识库]] 链接命中",
      reason: "它定义了“收集 → 组织 → 输出”的闭环，能支撑 AI 结果必须回到编辑现场的判断。",
      why: "补足当前判断的知识工作闭环",
      preview: "知识不是收集完成就结束；只有被重新组织并进入输出，笔记系统才形成可验证的闭环。",
    },
    {
      id: "base-output",
      title: "Base 使用判断.md",
      path: "B-2/信息聚合-PKM/Base 使用判断.md",
      confidence: 84,
      strength: "相关",
      freshness: "14:24 刚刚打开",
      foundBy: "共享 2 个链接邻居",
      reason: "它把结构化字段与最终输出场景连在一起，可补清“为什么结果要回到原对象”。",
      why: "补充结构化输出的判断依据",
      preview: "Base 的价值不在于多一个数据库界面，而在于让同一份知识保持可编辑、可查询、可重新输出。",
    },
    {
      id: "review-path",
      title: "知识回顾.md",
      path: "B-2/信息聚合-PKM/知识回顾.md",
      confidence: 78,
      strength: "可参考",
      freshness: "昨天 18:06 查看",
      foundBy: "最近工作脉络命中",
      reason: "它记录了从阅读、修改到复盘的路径，可补充接受与回滚为何都必须有审计记录。",
      why: "补充 review 与回滚的过程依据",
      preview: "有效的回顾不是重读结果，而是能看见哪一步改变了判断，并在必要时回到改变之前。",
    },
    {
      id: "output-loop",
      title: "PKM 输出工作流.md",
      path: "B-2/信息聚合-PKM/PKM 输出工作流.md",
      confidence: 76,
      strength: "可补充",
      freshness: "今天 11:18 修改",
      foundBy: "与当前段落共享 3 个概念",
      reason: "它把临时判断、正文编辑和最终交付串成同一条输出路径，可补足这里的流程解释。",
      why: "补充从判断到正文输出的路径",
      preview: "真正可复用的知识工作不是把答案留在工具里，而是把判断归位到可继续编辑、引用和修订的文档对象中。",
    },
    {
      id: "edit-receipt",
      title: "AI 编辑回执.md",
      path: "B-2/信息聚合-PKM/AI 编辑回执.md",
      confidence: 72,
      strength: "过程相关",
      freshness: "周三 16:42 修改",
      foundBy: "最近接受写入的事务命中",
      reason: "它说明候选、接受和回滚是三种不同状态，可作为 History 事务边界的补充来源。",
      why: "补充接受写入与回滚的边界",
      preview: "AI 生成的内容首先是候选；只有用户接受并写回源对象后，才形成可以定位、比较和回滚的事务。",
    },
    {
      id: "native-object",
      title: "Markdown 原生对象.md",
      path: "B-3/编辑系统/Markdown 原生对象.md",
      confidence: 69,
      strength: "结构相关",
      freshness: "周二 09:05 打开",
      foundBy: "共享标签 composer / markdown",
      reason: "它解释段落、列表和 Frontmatter 为什么需要不同的原位 review 方式。",
      why: "补充不同正文对象的 review 方式",
      preview: "编辑动作必须尊重对象边界：段落按文本 diff，列表按条目，Frontmatter 按字段，不能全部退化成一段聊天答案。",
    },
    {
      id: "graph-path",
      title: "链接图谱判断.md",
      path: "B-2/信息聚合-PKM/链接图谱判断.md",
      confidence: 66,
      strength: "弱关联",
      freshness: "6 天前查看",
      foundBy: "二跳图谱路径命中",
      reason: "它能解释为什么知识库、Base 与当前段落同时出现，但目前只适合作为补充线索。",
      why: "解释多个材料同时被推荐的图谱路径",
      preview: "二跳关系只说明存在结构邻近，不等于内容可直接引用；仍需回到正文语义判断是否真正相关。",
    },
  ];

  const WORKSPACE_MOVES = [
    { id: "clarify-return", mark: "01", label: "补清结果为什么必须回到正文", detail: "把生成、审阅、接受三个状态连成完整判断链。", action: "改写" },
    { id: "counterargument", mark: "02", label: "补一个反方比较", detail: "当前只有正向论证，补清哪些场景不该直接回写。", action: "预览" },
    { id: "evidence", mark: "03", label: "给核心判断找支撑材料", detail: "沿当前链接和最近笔记寻找可追溯依据。", action: "找依据" },
    { id: "place-outline", mark: "04", label: "安放两条散落想法", detail: "先建议提纲落点，不直接改正文。", action: "整理" },
    { id: "graph-bridge", mark: "05", label: "补一条图谱路径", detail: "解释 [[知识库]] 与当前编辑事务之间的二跳关系。", action: "连线" },
    { id: "tighten-section", mark: "06", label: "收紧这一节的结论", detail: "保留论证，只把结论压成可扫描的一段。", action: "总结" },
    { id: "format-structure", mark: "07", label: "整理段落与列表层级", detail: "把对象边界写清楚，不改变内容含义。", action: "整理" },
    { id: "split-notes", mark: "08", label: "判断是否应该拆成两篇笔记", detail: "给出拆分边界和链接关系，不立即移动内容。", action: "分析" },
  ];

  const WORKSPACE_THOUGHTS = [
    { id: "place-native-object", label: "原生对象也应保留增量过程", detail: "建议放到 Composer architecture 的对象边界段。", action: "找落点" },
    { id: "bridge", label: "表格与公式 review 可以共用一套回执", detail: "可以先起草对象 review 之间的桥接段。", action: "起草" },
    { id: "trace-acceptance", label: "自动感知不等于自动写入", detail: "适合放在接受事务之前，作为边界提醒。", action: "安放" },
    { id: "selection-contract", label: "选区引用需要保留原文锚点", detail: "与对话里的引用块和正文定位属于同一合同。", action: "审阅" },
    { id: "voice-draft", label: "语音只是草稿来源，不应直接运行", detail: "可以并入输入一致性说明，避免形成第二套 composer。", action: "归档" },
    { id: "ambient-ranking", label: "推荐排序要尊重用户正在看的行", detail: "刷新时先保留当前位置，再提示有新排序可应用。", action: "记录" },
  ];

  const INITIAL_THREAD = [
    {
      id: "context-ready",
      kind: "tool",
      label: "自动上下文已就绪",
      text: "已读取当前块、邻近 2 段与 [[知识库]]；正文位置变化时，这条状态会原位更新。",
      meta: "3 个来源 · 随正文更新",
      time: "14:19",
      status: "ready",
    },
    {
      id: "sample-user",
      kind: "user",
      label: "你的指令",
      text: "这段判断有点跳，补清为什么 AI 结果必须回到正文。",
      time: "14:20",
      quote: {
        targetId: "ai-sidecar",
        targetTitle: "AI 旁路段落",
        targetKind: "paragraph",
        text: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。",
        isSelection: false,
      },
    },
    {
      id: "sample-assistant",
      kind: "assistant",
      label: "Copilot",
      text: "关键不是 AI 能不能生成，而是候选是否回到原对象接受审阅。只有用户接受后，改变才成为可定位、可回滚的正文事务。",
      time: "14:20",
      sources: ["当前块", "[[知识库]]"],
      actions: ["correct-content"],
    },
    {
      id: "sample-recommendation",
      kind: "recommendation",
      label: "已带入建议 · 上一轮",
      text: "你把“补清来源关系”带入了对话。它只装配了能力和材料，直到发送前都没有改动正文。",
      time: "14:20",
      actions: ["add-evidence", "suggest-links-graph"],
    },
  ];

  const INITIAL_HISTORY = [
    {
      id: "tx-correct-sidecar",
      actionId: "correct-content",
      label: "修正内容",
      targetId: "ai-sidecar",
      targetTitle: "AI 旁路段落",
      targetKind: "paragraph",
      occurredAt: "2026-07-17T15:04:00+12:00",
      scope: "Paragraph · 2 行",
      delta: "+18 −8",
      before: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。",
      after: "AI 应该贴在当前块旁边：知道当前块的源范围与 Markdown 语法，自动参考 [[知识库]]，把候选修改放回正文原位，并在接受前保持可回滚。",
      status: "applied",
      operation: "rewrite",
      source: { kind: "ai", surface: "copilot", capabilityId: "correct-content" },
      committedBy: "user",
    },
    {
      id: "tx-evidence-structure",
      actionId: "add-evidence",
      label: "补上依据",
      targetId: "structure",
      targetTitle: "知识库结构段落",
      targetKind: "paragraph",
      occurredAt: "2026-07-17T14:47:00+12:00",
      scope: "Paragraph · 1 行",
      delta: "+1 −0",
      before: "知识库的结构应由要存储、重组和输出的知识决定。",
      after: "知识库的结构应由要存储、重组和输出的知识决定。依据：[[知识库]] 将其定义为收集、组织与输出的连续闭环。",
      status: "applied",
      operation: "insert",
      source: { kind: "ai", surface: "copilot", capabilityId: "add-evidence" },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-tags-metadata",
      actionId: "suggest-tags",
      label: "建议标签",
      targetId: "metadata",
      targetTitle: "Frontmatter metadata",
      targetKind: "metadata",
      occurredAt: "2026-07-17T14:31:00+12:00",
      scope: "Frontmatter · 1 字段",
      delta: "+2 −0",
      before: "tags: [pkm]",
      after: "tags: [pkm, composer, ai-assisted]",
      status: "applied",
      operation: "metadata",
      source: { kind: "ai", surface: "copilot", capabilityId: "suggest-tags" },
      committedBy: "user",
    },
    {
      id: "tx-user-tone",
      actionId: "direct-edit",
      label: "调整段落语气",
      targetId: "positioning",
      targetTitle: "Composer 定位段落",
      targetKind: "paragraph",
      occurredAt: "2026-07-17T13:58:00+12:00",
      scope: "Paragraph · 1 行",
      delta: "+6 −4",
      before: "这个 Composer 视图把 Markdown 变成工作台。",
      after: "这个 Composer 视图把 Markdown 变成更顺手的工作台。",
      status: "applied",
      operation: "rewrite",
      source: { kind: "user", surface: "editor" },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-continue-boundary",
      actionId: "continue-writing",
      label: "接受继续写",
      targetId: "ai-sidecar",
      targetTitle: "AI 旁路段落",
      targetKind: "paragraph",
      occurredAt: "2026-07-16T17:42:00+12:00",
      scope: "Paragraph · 新增 1 块",
      delta: "+42 −0",
      before: "",
      after: "侧栏只负责理解目标、组织执行和报告状态，真正的候选始终留在文档对象上。",
      status: "applied",
      operation: "insert",
      source: { kind: "ai", surface: "copilot", capabilityId: "continue-writing" },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-user-list",
      actionId: "direct-edit",
      label: "重排知识结构列表",
      targetId: "structure-list",
      targetTitle: "知识结构列表",
      targetKind: "list",
      occurredAt: "2026-07-16T16:08:00+12:00",
      scope: "List · 3 项",
      delta: "+2 −2",
      before: "网络结构 / 树形结构 / 跨库链接",
      after: "网络结构 → 树形结构 → 跨库链接",
      status: "applied",
      operation: "rewrite",
      source: { kind: "user", surface: "editor" },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-review-adjusted",
      actionId: "review-article",
      label: "审阅后补充边界",
      targetId: "structure",
      targetTitle: "知识库结构段落",
      targetKind: "paragraph",
      occurredAt: "2026-07-15T11:36:00+12:00",
      scope: "Paragraph · 2 行",
      delta: "+12 −3",
      before: "真正重要的是内容之后还能被找到。",
      after: "真正重要的是内容之后还能被找到、组合并重新输出。",
      status: "applied",
      operation: "rewrite",
      source: { kind: "ai", surface: "copilot", capabilityId: "review-article", adjustedByUser: true },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-format-title",
      actionId: "format-polish",
      label: "整理章节层级",
      targetId: "structure-heading",
      targetTitle: "章节标题",
      targetKind: "heading-2",
      occurredAt: "2026-07-12T09:18:00+12:00",
      scope: "Heading · 1 行",
      delta: "+1 −1",
      before: "知识库结构",
      after: "1. 知识库不是单一目录，而是多种结构叠加",
      status: "applied",
      operation: "rewrite",
      source: { kind: "ai", surface: "copilot", capabilityId: "format-polish" },
      committedBy: "user",
      archived: true,
    },
    {
      id: "tx-user-title",
      actionId: "direct-edit",
      label: "修改文档标题",
      targetId: "title",
      targetTitle: "文档标题",
      targetKind: "heading-1",
      occurredAt: "2026-07-08T20:14:00+12:00",
      scope: "Heading · 1 行",
      delta: "+5 −2",
      before: "PKM 产品分析",
      after: "PKM 产品类别分析：从信息获取到输出",
      status: "applied",
      operation: "rewrite",
      source: { kind: "user", surface: "editor" },
      committedBy: "user",
      archived: true,
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const paper = $("#paper");
  const app = $("#composer-app");
  const panel = $("#intelligence-panel");
  const copilotViewSwitcher = $("#copilot-view-switcher");
  const copilotWorkbench = $("#copilot-workbench");
  const sidecarBody = $("#sidecar-body");
  const copilotActions = $("#copilot-actions");
  const copilotDock = $("#copilot-dock");
  const capabilityPicker = $("#capability-picker");
  const liveRegion = $("#sidecar-live");
  const historyReviewModal = $("#history-review-modal");
  const historyModalContent = $("#history-modal-content");
  const toast = $("#toast");

  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode");
  const initialMode = requestedMode === "history" ? "history" : "copilot";
  const initialCopilotView = params.get("view") === "conversation" ? "conversation" : "workbench";
  const initialBlock = $(".doc-block.is-active") || $(".doc-block", paper);

  const state = {
    mode: initialMode,
    copilotView: initialCopilotView,
    panelOpen: params.get("drawer") !== "closed",
    activeBlock: initialBlock,
    selection: "",
    action: null,
    contexts: [
      { id: "focus", label: `当前块 · ${initialBlock?.dataset.blockTitle || "正文"}`, locked: true },
      { id: "nearby", label: "邻近 2 段", locked: false },
      { id: "ambient-knowledge", label: "知识库 · 自动关联", locked: false },
    ],
    draftText: "",
    pickerOpen: false,
    pickerMode: "all",
    pickerQuery: "",
    thread: INITIAL_THREAD.map((message) => ({
      ...message,
      actions: message.actions ? [...message.actions] : undefined,
      sources: message.sources ? [...message.sources] : undefined,
      quote: message.quote ? { ...message.quote } : undefined,
    })),
    contextRevision: 1,
    contextReason: "开始跟随当前对象",
    contextUpdatedAt: "刚刚",
    run: { status: "idle", stage: 0, targetId: null, capabilityId: null },
    draftPatch: null,
    ambient: {
      refreshing: false,
      expandedSections: { moves: false, sources: false, thoughts: false },
      reasonOpen: false,
      previewSourceId: null,
      dismissedSourceIds: [],
      refreshRevision: 0,
      updatedAt: "14:32",
      refreshSummary: "刚刚重排 · +7 新线索 · 3 条已归档",
      queue: { total: 94, moves: 38, sources: 37, thoughts: 19, added: 7, removed: 3 },
    },
    scroll: { workbench: 0, conversation: 0 },
    voice: {
      status: "idle",
      interim: "",
      error: "",
      draftBefore: "",
    },
    history: INITIAL_HISTORY.map((entry) => ({ ...entry })),
    activeHistoryId: INITIAL_HISTORY[0].id,
    historyDetailId: null,
    historyDiffMode: "inline",
    rollbackConfirmId: null,
  };

  let runTimers = [];
  let toastTimer = null;
  let liveTimer = null;
  let selectionTimer = null;
  let historyReturnFocusId = null;
  let voiceRecognition = null;
  let voiceTimers = [];

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

  function formatAucklandTime(date = new Date()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Pacific/Auckland",
    });
  }

  function formatAucklandDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-NZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Pacific/Auckland",
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function historyDateKey(entry) {
    return entry.occurredAt ? formatAucklandDateKey(new Date(entry.occurredAt)) : formatAucklandDateKey();
  }

  function historyTime(entry) {
    if (!entry.occurredAt) return entry.time || "--:--";
    return new Date(entry.occurredAt).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Pacific/Auckland",
    });
  }

  function historyDateLabel(dateKey) {
    const today = formatAucklandDateKey();
    const yesterday = formatAucklandDateKey(new Date(Date.now() - 86400000));
    const formatted = new Date(`${dateKey}T12:00:00+12:00`).toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      timeZone: "Pacific/Auckland",
    });
    if (dateKey === today) return { title: "今天", detail: formatted };
    if (dateKey === yesterday) return { title: "昨天", detail: formatted };
    return { title: dateKey.slice(0, 4) === today.slice(0, 4) ? formatted : `${dateKey.slice(0, 4)} 年 ${formatted}`, detail: "" };
  }

  function historyOrigin(entry) {
    if (entry.inverseOf || entry.source?.kind === "system") return { key: "system", label: "系统回滚", detail: "由你触发" };
    if (entry.source?.kind === "user") return { key: "user", label: "你直接编辑", detail: "由你提交" };
    if (entry.source?.adjustedByUser) return { key: "mixed", label: "AI 后调整", detail: "你调整后接受" };
    return { key: "ai", label: "AI 辅助", detail: "你已接受" };
  }

  function ambientRecommendations() {
    const offset = state.ambient.refreshRevision % AMBIENT_SOURCES.length;
    const rotated = [...AMBIENT_SOURCES.slice(offset), ...AMBIENT_SOURCES.slice(0, offset)];
    return rotated.filter((source) => !state.ambient.dismissedSourceIds.includes(source.id));
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
    $("#sourcebar-context").textContent = `当前块 · ${title}`;
    $("#bottom-source").textContent = state.activeBlock?.dataset.source || truncate(blockText(), 120);
    $$("[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $("#history-count").textContent = String(state.history.length);
    app.classList.toggle("is-panel-open", state.panelOpen);
    $$("[data-panel-toggle]").forEach((button) => button.setAttribute("aria-expanded", String(state.panelOpen)));
  }

  function renderContextSystemEvent() {
    const title = state.activeBlock?.dataset.blockTitle || "当前文档";
    const contexts = state.contexts.map((context) => `<span>${escapeHtml(context.label)}</span>`).join("");
    return `
      <section class="context-system-event" data-context-revision="${state.contextRevision}" aria-label="当前 AI 上下文">
        <span class="context-event-rail" aria-hidden="true"><i></i></span>
        <div>
          <header><strong>正在跟随「${escapeHtml(title)}」</strong><time>${escapeHtml(state.contextUpdatedAt)} · v${state.contextRevision}</time></header>
          <p>${escapeHtml(state.contextReason)}。后续回复按这组上下文生成；开始运行时冻结本轮快照。</p>
          <div class="context-event-chips">${contexts}</div>
        </div>
      </section>`;
  }

  function renderThreadActions(actions = []) {
    return actions.map(capabilityById).filter(Boolean).map((capability) => `
      <button type="button" data-thread-capability="${capability.id}">${escapeHtml(capability.label)}</button>`).join("");
  }

  function createMessageQuote(target = state.activeBlock) {
    if (!target) return null;
    const selection = state.selection.trim();
    const sourceBlock = selection ? state.activeBlock || target : target;
    const text = selection || blockText(sourceBlock);
    if (!text) return null;
    return {
      targetId: sourceBlock.dataset.blockId,
      targetTitle: sourceBlock.dataset.blockTitle || "当前块",
      targetKind: sourceBlock.dataset.blockKind || "block",
      text: truncate(text, 180),
      isSelection: Boolean(selection),
    };
  }

  function renderMessageQuote(quote) {
    if (!quote?.text || !quote.targetId) return "";
    const scope = quote.isSelection ? "选中文本" : "完整块";
    return `
      <button class="message-quote" type="button" data-message-target="${escapeHtml(quote.targetId)}" aria-label="定位引用：${escapeHtml(quote.targetTitle || "当前块")}">
        <span class="message-quote-head"><strong>引用 · ${escapeHtml(quote.targetTitle || "当前块")}</strong><em>${escapeHtml(scope)}</em><svg><use href="#lab-locate"></use></svg></span>
        <span class="message-quote-text">${escapeHtml(quote.text)}</span>
      </button>`;
  }

  function renderThreadEvent(message) {
    const kind = message.kind || (message.role === "user" ? "user" : "assistant");
    const actions = renderThreadActions(message.actions);
    if (kind === "tool") {
      return `
        <article class="thread-event is-tool" data-message-kind="tool">
          <span class="event-marker"><svg><use href="#lab-check"></use></svg></span>
          <div class="event-content">
            <div class="message-meta"><strong>${escapeHtml(message.label)}</strong><time>${escapeHtml(message.time || "刚刚")}</time></div>
            <p>${escapeHtml(message.text)}</p>
            <small class="event-footnote">${escapeHtml(message.meta || "已完成")}</small>
          </div>
        </article>`;
    }
    if (kind === "recommendation") {
      return `
        <article class="thread-event is-recommendation" data-message-kind="recommendation">
          <span class="event-marker"><svg><use href="#lab-spark"></use></svg></span>
          <div class="event-content">
            <div class="message-meta"><strong>${escapeHtml(message.label)}</strong><time>${escapeHtml(message.time || "现在")}</time></div>
            <p>${escapeHtml(message.text)}</p>
            ${actions ? `<div class="event-actions">${actions}</div>` : ""}
          </div>
        </article>`;
    }
    const sources = (message.sources || []).map((source) => `<span>${escapeHtml(source)}</span>`).join("");
    const quote = renderMessageQuote(message.quote);
    return `
      <article class="thread-event thread-message ${kind === "user" ? "is-user" : "is-assistant"}" data-message-kind="${kind}">
        <span class="event-marker">${kind === "user" ? "你" : "AI"}</span>
        <div class="event-content">
          <div class="message-meta"><strong>${escapeHtml(message.label || (kind === "user" ? "你的指令" : "Copilot"))}</strong><time>${escapeHtml(message.time || "刚刚")}</time></div>
          ${quote}
          <p>${escapeHtml(message.text)}</p>
          ${sources ? `<div class="message-sources">${sources}</div>` : ""}
          ${actions ? `<div class="event-actions">${actions}</div>` : ""}
        </div>
      </article>`;
  }

  function renderCopilotConversation() {
    const wasNearBottom = sidecarBody.scrollHeight <= sidecarBody.clientHeight + 80
      || sidecarBody.scrollHeight - sidecarBody.scrollTop - sidecarBody.clientHeight < 80;
    const messages = state.thread.map(renderThreadEvent).join("");
    const run = renderRunState();
    sidecarBody.innerHTML = `
      <div class="mode-view copilot-view">
        <header class="copilot-conversation-head">
          <span><strong>对话记录</strong><small>围绕当前对象继续讨论与执行</small></span>
          <em>${state.thread.length} 条${state.ambient.refreshRevision ? ` · 工作台 +${state.ambient.queue.added}` : ""}</em>
        </header>
        <div class="copilot-thread">${renderContextSystemEvent()}${messages}${run}</div>
      </div>`;
    requestAnimationFrame(() => {
      if (state.scroll.conversation > 0 && !wasNearBottom) sidecarBody.scrollTop = state.scroll.conversation;
      else sidecarBody.scrollTop = sidecarBody.scrollHeight;
    });
  }

  function renderCopilotWorkspace() {
    const focusTitle = state.activeBlock?.dataset.blockTitle || "当前文档";
    const queue = state.ambient.queue;
    const savedScroll = state.scroll.workbench;
    copilotWorkbench.innerHTML = `
      <div class="workbench-shell">
        <header class="workbench-head">
          <div class="workbench-kicker"><span><i></i>持续整理</span><small>${state.ambient.refreshing ? "正在比较新的正文与材料…" : escapeHtml(state.ambient.updatedAt)}</small></div>
          <div class="workbench-title-row">
            <span><strong>正在整理「${escapeHtml(focusTitle)}」</strong><small>${queue.total} 条线索按当前正文、最近修改和链接变化持续重排</small></span>
            <div>
              <button class="workbench-refresh${state.ambient.refreshing ? " is-refreshing" : ""}" type="button" data-ambient-action="refresh" ${state.ambient.refreshing ? "disabled" : ""} aria-label="重新比较当前正文与相关材料" title="更新排序"><svg><use href="#lab-refresh"></use></svg></button>
            </div>
          </div>
          <div class="workbench-update"><span>${escapeHtml(state.ambient.refreshSummary)}</span><em>只更新工作台，不追加对话</em></div>
        </header>

        ${renderWorkbenchSection("moves", "接下来可能要做", "按编辑收益排序", queue.moves, renderSuggestionMoves())}
        ${renderWorkbenchSection("sources", "相关材料", "带入后成为本轮依据，不直接写正文", queue.sources, renderSuggestionSources())}
        ${renderWorkbenchSection("thoughts", "还没安放的想法", "先找落点，再决定是否写入", queue.thoughts, renderSuggestionThoughts())}

        <footer class="workbench-footer">
          <button type="button" data-toggle-suggestion-reason aria-expanded="${state.ambient.reasonOpen}">为什么这些排在前面？</button>
          ${state.ambient.reasonOpen ? `<div class="workbench-reason"><span>正在编辑「${escapeHtml(focusTitle)}」</span><span>正文命中 [[知识库]]</span><span>最近材料在 14:29 更新</span></div>` : ""}
        </footer>
      </div>`;
    requestAnimationFrame(() => { copilotWorkbench.scrollTop = savedScroll; });
  }

  function renderCopilot() {
    const showWorkbench = state.copilotView === "workbench";
    copilotWorkbench.hidden = !showWorkbench;
    sidecarBody.hidden = showWorkbench;
    if (showWorkbench) renderCopilotWorkspace();
    else renderCopilotConversation();
  }

  function renderCopilotViewSwitcher() {
    const visible = state.mode === "copilot";
    copilotViewSwitcher.hidden = !visible;
    if (!visible) return;
    const updated = state.ambient.refreshRevision ? `<i>+${state.ambient.queue.added}</i>` : "";
    copilotViewSwitcher.innerHTML = `
      <button type="button" role="tab" data-copilot-view="workbench" aria-controls="copilot-workbench" aria-selected="${state.copilotView === "workbench"}" tabindex="${state.copilotView === "workbench" ? "0" : "-1"}">
        <span>工作台</span><b>${state.ambient.queue.total}</b>${updated}
      </button>
      <button type="button" role="tab" data-copilot-view="conversation" aria-controls="sidecar-body" aria-selected="${state.copilotView === "conversation"}" tabindex="${state.copilotView === "conversation" ? "0" : "-1"}">
        <span>对话</span><b>${state.thread.length}</b>
      </button>`;
  }

  function renderRunState() {
    if (state.run.status === "idle") return "";
    const capability = capabilityById(state.run.capabilityId) || activeCapability();
    const label = capability?.label || "自定义指令";
    const snapshot = Array.isArray(state.run.contextSnapshot) ? state.run.contextSnapshot : [];
    const snapshotMarkup = snapshot.length ? `
      <div class="run-context-snapshot">
        <small>本次运行上下文 · v${state.run.contextRevision || 1}</small>
        <span>${snapshot.map((context) => escapeHtml(context.label || context)).join(" · ")}</span>
        ${state.run.targetId && state.activeBlock?.dataset.blockId !== state.run.targetId ? `<em>你已移动到别处，本次运行仍基于「${escapeHtml(state.run.targetTitle || "原目标")}」</em>` : ""}
      </div>` : "";
    const stages = ["冻结当前对象与上下文", "读取 Vault / 图谱来源", "把候选流回正文原位"];
    const stageMarkup = stages.map((stage, index) => {
      const className = index < state.run.stage ? "is-done" : index === state.run.stage ? "is-current" : "";
      return `<span class="${className}">${escapeHtml(stage)}</span>`;
    }).join("");

    if (["assembling", "streaming"].includes(state.run.status)) {
      return `
        <article class="thread-event is-tool is-running" data-message-kind="tool">
          <span class="event-marker"><i></i></span>
          <div class="event-content">
            <div class="message-meta"><strong>${escapeHtml(label)} · 处理中</strong><time>现在</time></div>
            <p>侧栏只报告进度；正文目标已进入生成状态。</p>
            ${snapshotMarkup}
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
      <article class="thread-event is-receipt is-${escapeHtml(state.run.status)}" data-message-kind="receipt">
        <span class="event-marker"><svg><use href="#lab-check"></use></svg></span>
        <div class="event-content">
          <div class="message-meta"><strong>${escapeHtml(statusCopy[0])}</strong><time>现在</time></div>
          <p>${escapeHtml(statusCopy[1])}</p>
          ${snapshotMarkup}
          ${state.run.status === "preview-ready" ? `<div class="transaction-receipt"><span><small>正文原位预览</small><strong>${escapeHtml(label)} · ${escapeHtml(state.run.targetTitle || "当前块")}</strong></span><button type="button" data-locate-run>定位正文</button></div>` : ""}
        </div>
      </article>`;
  }

  function resizeComposerInput(input = $("#composer-input")) {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(128, input.scrollHeight)}px`;
  }

  function renderCopilotActions() {
    const visible = state.mode === "copilot" && state.copilotView === "conversation" && !state.pickerOpen;
    copilotActions.hidden = !visible;
    if (!visible) return;

    const recommendations = recommendedCapabilityIds().map(capabilityById).filter((capability) => capability && !capabilityGuard(capability)).slice(0, 3);
    const quickActions = recommendations.map((capability) => `<button type="button" data-starter="${capability.id}" aria-pressed="${state.action?.id === capability.id}" title="${escapeHtml(capability.alias)}">${escapeHtml(capability.label)}</button>`).join("");
    copilotActions.innerHTML = `
      <div class="quick-actions" aria-label="当前对象推荐能力">
        <div class="quick-action-list">${quickActions}</div>
        <button class="all-capabilities-trigger" type="button" data-open-capabilities aria-expanded="false" title="Command K"><svg><use href="#lab-command"></use></svg><span>全部能力</span></button>
      </div>`;
  }

  function renderDock(options = {}) {
    const previousInput = $("#composer-input");
    const restoreInput = options.focusInput || document.activeElement === previousInput;
    const selectionStart = previousInput?.selectionStart ?? state.draftText.length;
    const selectionEnd = previousInput?.selectionEnd ?? selectionStart;
    const showComposer = state.mode === "copilot" && state.copilotView === "conversation";
    renderCopilotActions();
    copilotDock.hidden = !showComposer;
    if (!showComposer) {
      capabilityPicker.hidden = true;
      updateDockHeight();
      return;
    }

    const actionChip = state.action ? `
      <span class="composer-chip is-action"><svg><use href="#lab-spark"></use></svg>${escapeHtml(state.action.label)}<button type="button" data-remove-action aria-label="移除 ${escapeHtml(state.action.label)}"><svg><use href="#lab-x"></use></svg></button></span>` : "";
    const contextChips = state.contexts.map((context) => `
      <span class="composer-chip"><svg><use href="#lab-link"></use></svg>${escapeHtml(context.label)}${context.locked ? "" : `<button type="button" data-remove-context="${escapeHtml(context.id)}" aria-label="移除 ${escapeHtml(context.label)}"><svg><use href="#lab-x"></use></svg></button>`}</span>`).join("");
    const running = ["assembling", "streaming"].includes(state.run.status);
    const voiceActive = ["requesting", "listening", "transcribing"].includes(state.voice.status);
    const canSend = Boolean(activeCapability()) && !running && !voiceActive && state.run.status !== "preview-ready";
    const placeholder = state.action ? `补充“${state.action.label}”的要求；也可以留空直接运行…` : "描述要改什么，或从全部能力开始…";
    const voiceStatus = {
      requesting: "正在请求麦克风…",
      listening: "正在听 · 再点结束",
      transcribing: "正在转成文字…",
      done: "语音已转成草稿",
      error: state.voice.error || "语音输入不可用",
    }[state.voice.status] || "";

    copilotDock.innerHTML = `
      <div class="composer-box">
        <div class="composer-chip-row">${actionChip}${contextChips}</div>
        <textarea id="composer-input" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(state.draftText)}</textarea>
        <div class="composer-foot">
          <span class="composer-input-tools">
            <button type="button" data-open-context aria-label="添加上下文"><svg><use href="#lab-plus"></use></svg></button>
            <button class="voice-input-button${voiceActive ? " is-active" : ""}" type="button" data-voice-input aria-label="${voiceActive ? "结束语音输入" : "开始语音输入"}" aria-pressed="${voiceActive}" title="语音输入"><svg><use href="#lab-mic"></use></svg></button>
          </span>
          <span class="composer-run-tools">
            ${voiceStatus ? `<small class="voice-input-status is-${escapeHtml(state.voice.status)}" role="status">${state.voice.status === "listening" ? "<i></i>" : ""}${escapeHtml(voiceStatus)}</small>` : `<button class="composer-model-button" type="button" title="自动选择模型与工具"><span>自动模型</span><svg><use href="#lab-chevron"></use></svg></button>`}
            ${running
              ? `<button class="send-button" type="button" data-stop-run aria-label="停止运行"><svg><use href="#lab-x"></use></svg></button>`
              : `<button class="send-button" type="button" data-send ${canSend ? "" : "disabled"} aria-label="运行"><svg><use href="#lab-arrow-up"></use></svg></button>`}
          </span>
        </div>
      </div>`;
    updateDockHeight();
    requestAnimationFrame(() => {
      const input = $("#composer-input");
      resizeComposerInput(input);
      updateDockHeight();
      if (restoreInput && input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(Math.min(selectionStart, end), Math.min(selectionEnd, end));
      }
    });
  }

  function renderPicker() {
    if (!state.pickerOpen || state.mode !== "copilot" || state.copilotView !== "conversation") {
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

  function rankedWorkspaceItems(items) {
    if (!state.ambient.refreshRevision || items.length < 3) return items;
    return [items[2], items[0], items[1], ...items.slice(3)];
  }

  function renderWorkbenchSection(key, title, subtitle, count, content) {
    const expanded = Boolean(state.ambient.expandedSections[key]);
    return `
      <section class="workbench-section" data-workbench-section="${key}">
        <header class="workbench-section-head">
          <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
          <output>${count}</output>
        </header>
        ${content}
        <button class="workbench-more" type="button" data-toggle-workbench-section="${key}" aria-expanded="${expanded}">
          <span>${expanded ? "收起" : `查看全部 ${count}`}</span><svg><use href="#lab-chevron"></use></svg>
        </button>
      </section>`;
  }

  function renderSuggestionMoves() {
    const expanded = state.ambient.expandedSections.moves;
    const moves = rankedWorkspaceItems(WORKSPACE_MOVES).slice(0, expanded ? WORKSPACE_MOVES.length : 2);
    return `<div class="suggestion-list">${moves.map((move, index) => `
      <button class="suggestion-item" type="button" data-ambient-move="${move.id}">
        <span class="suggestion-item-mark">${escapeHtml(move.mark)}</span>
        <span class="suggestion-item-copy"><strong>${escapeHtml(move.label)}</strong><small>${escapeHtml(move.detail)}</small></span>
        <span class="suggestion-item-end">${state.ambient.refreshRevision && index === 0 ? "<b>↑2</b>" : ""}<em>${escapeHtml(move.action)}</em></span>
      </button>`).join("")}</div>`;
  }

  function renderSuggestionSources() {
    const expanded = state.ambient.expandedSections.sources;
    const available = rankedWorkspaceItems(ambientRecommendations());
    const sources = available.slice(0, expanded ? available.length : 3);
    if (!sources.length) return `<div class="suggestion-empty"><strong>这一轮没有待处理的材料</strong><span>更新排序后会再次比较当前块、最近编辑和链接。</span></div>`;
    return `<div class="suggestion-source-list">${sources.map((source, index) => {
      const previewOpen = state.ambient.previewSourceId === source.id;
      return `
        <article class="suggestion-source${previewOpen ? " is-previewing" : ""}">
          <div class="suggestion-source-main">
            <span><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.reason)}</small><i>${escapeHtml(source.freshness)} · ${escapeHtml(source.foundBy)}</i></span>
            <em>${state.ambient.refreshRevision && index === 0 ? "↑ " : ""}${source.confidence}%</em>
          </div>
          ${previewOpen ? `<div class="suggestion-source-preview"><small>${escapeHtml(source.path)}</small><p>${escapeHtml(source.preview)}</p></div>` : ""}
          <div class="suggestion-source-actions">
            <button type="button" data-ambient-source-preview="${source.id}"><svg><use href="#lab-eye"></use></svg><span>${previewOpen ? "收起来源" : "查看来源"}</span></button>
            <button class="is-primary" type="button" data-ambient-source-use="${source.id}">带入对话</button>
            <button class="is-quiet" type="button" data-ambient-source-dismiss="${source.id}" aria-label="本轮忽略 ${escapeHtml(source.title)}"><svg><use href="#lab-x"></use></svg></button>
          </div>
        </article>`;
    }).join("")}</div>`;
  }

  function renderSuggestionThoughts() {
    const expanded = state.ambient.expandedSections.thoughts;
    const thoughts = rankedWorkspaceItems(WORKSPACE_THOUGHTS).slice(0, expanded ? WORKSPACE_THOUGHTS.length : 1);
    return `<div class="suggestion-list is-thoughts">${thoughts.map((thought) => `
      <button class="suggestion-item" type="button" data-ambient-move="${thought.id}">
        <span class="suggestion-item-mark"><svg><use href="#lab-spark"></use></svg></span>
        <span class="suggestion-item-copy"><strong>${escapeHtml(thought.label)}</strong><small>${escapeHtml(thought.detail)}</small></span>
        <span class="suggestion-item-end"><em>${escapeHtml(thought.action)}</em></span>
      </button>`).join("")}</div>`;
  }

  function renderHistory() {
    const active = state.history.find((entry) => entry.id === state.activeHistoryId) || state.history[0] || null;
    const sorted = [...state.history].sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")));
    const grouped = sorted.reduce((groups, entry) => {
      const key = historyDateKey(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
      return groups;
    }, new Map());
    const days = Array.from(grouped.entries()).map(([dateKey, entries]) => {
      const date = historyDateLabel(dateKey);
      const rows = entries.map((entry) => {
        const origin = historyOrigin(entry);
        return `
          <div class="history-entry${entry.id === active?.id ? " is-active" : ""}${entry.status === "rolled-back" ? " is-rolled-back" : ""}">
            <button class="history-row" type="button" data-history-select="${entry.id}" aria-haspopup="dialog" aria-controls="history-review-modal">
              <span class="history-node"></span>
              <span class="history-copy"><span class="history-title-line"><em class="history-origin is-${origin.key}">${escapeHtml(origin.label)}</em><strong>${escapeHtml(entry.label)}</strong></span><small>${escapeHtml(entry.targetTitle)} · ${escapeHtml(entry.scope)}</small></span>
              <span class="history-stamp"><time>${escapeHtml(historyTime(entry))}</time>${entry.status === "rolled-back" ? "<em>已回滚</em>" : `<b>${escapeHtml(entry.delta)}</b>`}</span>
            </button>
          </div>`;
      }).join("");
      return `<section class="history-day"><header><span><strong>${escapeHtml(date.title)}</strong>${date.detail ? `<small>${escapeHtml(date.detail)}</small>` : ""}</span><em>${entries.length} 笔</em></header><div class="history-timeline">${rows}</div></section>`;
    }).join("");

    sidecarBody.innerHTML = `
      <div class="mode-view history-view">
        <header class="history-heading"><span><strong>已接受写入</strong><small>一眼区分你直接编辑、AI 辅助和系统回滚</small></span><em>${state.history.length} 笔事务</em></header>
        ${days || `<div class="history-empty">还没有已接受写入。生成中、已丢弃和只读 findings 都不会出现在这里。</div>`}
        <div class="history-footnote"><svg><use href="#lab-check"></use></svg>Vault 会话已保存 · Git 是可选长期适配器</div>
      </div>`;
  }

  function diffTokens(value) {
    return String(value || "").match(/[\u3400-\u9fff]|[A-Za-z0-9_]+|\s+|[^\s]/gu) || [];
  }

  function mergeDiffSegments(segments) {
    return segments.reduce((merged, segment) => {
      const previous = merged[merged.length - 1];
      if (previous?.type === segment.type) previous.value += segment.value;
      else merged.push({ ...segment });
      return merged;
    }, []);
  }

  function fallbackDiff(before, after) {
    const left = Array.from(before || "");
    const right = Array.from(after || "");
    let start = 0;
    while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
    let leftEnd = left.length - 1;
    let rightEnd = right.length - 1;
    while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) {
      leftEnd -= 1;
      rightEnd -= 1;
    }
    return [
      { type: "equal", value: left.slice(0, start).join("") },
      { type: "delete", value: left.slice(start, leftEnd + 1).join("") },
      { type: "insert", value: right.slice(start, rightEnd + 1).join("") },
      { type: "equal", value: left.slice(leftEnd + 1).join("") },
    ].filter((segment) => segment.value);
  }

  function inlineDiff(before, after) {
    const left = diffTokens(before);
    const right = diffTokens(after);
    if (left.length * right.length > 120000) return fallbackDiff(before, after);
    const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const segments = [];
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        segments.push({ type: "equal", value: left[i] });
        i += 1;
        j += 1;
      } else if (i < left.length && (j >= right.length || table[i + 1][j] >= table[i][j + 1])) {
        segments.push({ type: "delete", value: left[i] });
        i += 1;
      } else {
        segments.push({ type: "insert", value: right[j] });
        j += 1;
      }
    }
    return mergeDiffSegments(segments);
  }

  function renderInlineHistoryDiff(entry) {
    return inlineDiff(entry.before, entry.after).map((segment) => {
      const content = escapeHtml(segment.value);
      if (segment.type === "delete") return `<del>${content}</del>`;
      if (segment.type === "insert") return `<ins>${content}</ins>`;
      return `<span>${content}</span>`;
    }).join("");
  }

  function rollbackAvailability(entry) {
    if (entry.status === "rolled-back") return { allowed: false, reason: "原事务已回滚；反向事务仍保留在时间线。" };
    if (entry.inverseOf) return { allowed: false, reason: "回滚事务不会再次生成回滚，避免形成循环。" };
    if (entry.archived) return { allowed: false, reason: "这是较早的历史快照；目标之后已有新变化，请定位后审阅。" };
    if (entry.insertedBlockId) {
      const inserted = $(`[data-block-id="${entry.insertedBlockId}"]`, paper);
      if (!inserted) return { allowed: false, reason: "插入块已经移动或删除，不能安全直接回滚。" };
      if (blockText(inserted) !== entry.after) return { allowed: false, reason: "插入块在这笔事务后继续变化，不能覆盖后续编辑。" };
      return { allowed: true, reason: "Vault 会话已保存；回滚会追加一笔反向事务。" };
    }
    const block = $(`[data-block-id="${entry.targetId}"]`, paper);
    if (!block) return { allowed: false, reason: "原始目标已经移动，不能安全直接回滚。" };
    if (entry.actionId === "suggest-tags") {
      const tags = $$(".tag-row .tag-chip", block).map((tag) => tag.textContent.trim()).join(", ");
      if (`tags: [${tags}]` !== entry.after) return { allowed: false, reason: "标签在这笔事务后继续变化，不能覆盖后续编辑。" };
      return { allowed: true, reason: "Vault 会话已保存；回滚会追加一笔反向事务。" };
    }
    if (blockText(block) !== entry.after) return { allowed: false, reason: "目标在这笔事务后继续变化，不能覆盖后续编辑。" };
    return { allowed: true, reason: "Vault 会话已保存；回滚会追加一笔反向事务。" };
  }

  function renderHistoryDetail() {
    const entry = state.history.find((candidate) => candidate.id === state.historyDetailId);
    if (!entry || !historyModalContent) return;
    const confirming = state.rollbackConfirmId === entry.id;
    const availability = rollbackAvailability(entry);
    const origin = historyOrigin(entry);
    const date = historyDateLabel(historyDateKey(entry));
    const diff = state.historyDiffMode === "inline"
      ? `<div class="history-inline-diff" aria-label="原地增删对比"><p>${renderInlineHistoryDiff(entry)}</p></div>`
      : `<div class="history-before-after"><section><header><i></i><strong>Before</strong><small>写入前</small></header><pre><code>${escapeHtml(entry.before)}</code></pre></section><section><header><i></i><strong>After</strong><small>接受后</small></header><pre><code>${escapeHtml(entry.after)}</code></pre></section></div>`;
    historyModalContent.innerHTML = `
      <header class="history-modal-header">
        <span><span class="history-modal-kicker"><em class="history-origin is-${origin.key}">${escapeHtml(origin.label)}</em><small>${escapeHtml(origin.detail)}</small></span><strong id="history-modal-title">${escapeHtml(entry.label)} · ${escapeHtml(entry.targetTitle)}</strong><em>${escapeHtml(date.title)}${date.detail ? ` · ${escapeHtml(date.detail)}` : ""} · ${escapeHtml(historyTime(entry))} · ${escapeHtml(entry.targetKind)} · ${escapeHtml(entry.scope)} · ${escapeHtml(entry.delta)}</em></span>
        <button class="history-modal-close" type="button" data-history-close aria-label="关闭变动详情"><svg><use href="#lab-x"></use></svg></button>
      </header>
      <div class="history-modal-toolbar">
        <div class="history-diff-modes" aria-label="变动查看方式">
          <button type="button" data-history-diff-mode="inline" aria-pressed="${state.historyDiffMode === "inline"}">原地增删</button>
          <button type="button" data-history-diff-mode="before-after" aria-pressed="${state.historyDiffMode === "before-after"}">Before / After</button>
        </div>
        <button type="button" data-history-locate="${entry.id}"><svg><use href="#lab-locate"></use></svg>定位正文</button>
      </div>
      <div class="history-modal-body">
        <div class="history-range"><span>变动范围</span><strong>${escapeHtml(entry.targetTitle)}</strong><small>${escapeHtml(entry.scope)}</small></div>
        ${diff}
      </div>
      <footer class="history-modal-footer">
        <span><svg><use href="#lab-check"></use></svg>${escapeHtml(availability.reason)}</span>
        <div><button type="button" data-history-close>关闭</button>${availability.allowed ? `<button class="history-rollback-button${confirming ? " is-confirm" : ""}" type="button" data-history-rollback="${entry.id}"><svg><use href="#lab-undo"></use></svg>${confirming ? "确认回滚" : "回滚这次写入"}</button>` : ""}</div>
      </footer>`;
  }

  function openHistoryDetail(id, trigger) {
    if (!state.history.some((entry) => entry.id === id) || !historyReviewModal) return;
    state.activeHistoryId = id;
    state.historyDetailId = id;
    state.historyDiffMode = "inline";
    state.rollbackConfirmId = null;
    historyReturnFocusId = id;
    renderHistory();
    renderHistoryDetail();
    if (!historyReviewModal.open) historyReviewModal.showModal();
    requestAnimationFrame(() => $("[data-history-close]", historyReviewModal)?.focus());
  }

  function closeHistoryDetail() {
    if (!historyReviewModal?.open) return;
    historyReviewModal.close();
  }

  function setHistoryDiffMode(mode) {
    if (!["inline", "before-after"].includes(mode)) return;
    state.historyDiffMode = mode;
    renderHistoryDetail();
    requestAnimationFrame(() => $(`[data-history-diff-mode="${mode}"]`, historyReviewModal)?.focus());
  }

  function resetHistoryDetail() {
    state.historyDetailId = null;
    state.rollbackConfirmId = null;
    const id = historyReturnFocusId;
    historyReturnFocusId = null;
    if (id) $(`[data-history-select="${id}"]`)?.focus();
  }

  function renderBody() {
    renderCopilotViewSwitcher();
    if (state.mode === "history") {
      copilotWorkbench.hidden = true;
      sidecarBody.hidden = false;
      renderHistory();
      return;
    }
    renderCopilot();
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

  function setCopilotView(view, options = {}) {
    if (!["workbench", "conversation"].includes(view)) return;
    if (state.copilotView === view) {
      if (options.focusControl) requestAnimationFrame(() => $(`[data-copilot-view="${view}"]`, copilotViewSwitcher)?.focus());
      return;
    }
    if (view === "workbench" && voiceIsActive()) cancelVoiceInput(false);
    if (state.copilotView === "workbench") state.scroll.workbench = copilotWorkbench.scrollTop;
    if (state.copilotView === "conversation") state.scroll.conversation = sidecarBody.scrollTop;
    state.copilotView = view;
    if (view === "workbench") state.pickerOpen = false;
    if (options.updateUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", "copilot");
      url.searchParams.set("view", view);
      window.history.replaceState({}, "", url);
    }
    if (options.render !== false) {
      renderCopilotViewSwitcher();
      renderCopilot();
      renderDock();
      renderPicker();
    }
    if (options.focusControl) requestAnimationFrame(() => $(`[data-copilot-view="${view}"]`, copilotViewSwitcher)?.focus());
  }

  function setMode(mode, updateUrl = true) {
    if (mode === "ambient") mode = "copilot";
    if (!["copilot", "history"].includes(mode)) return;
    if (mode !== "copilot") cancelVoiceInput(false);
    state.mode = mode;
    state.pickerOpen = false;
    state.rollbackConfirmId = null;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", mode);
      if (mode === "copilot") url.searchParams.set("view", state.copilotView);
      window.history.replaceState({}, "", url);
    }
    renderAll();
  }

  function setPanelOpen(open, restoreFocus = false) {
    if (!open) cancelVoiceInput(false);
    state.panelOpen = open;
    syncHeader();
    if (!open) state.pickerOpen = false;
    renderPicker();
    if (restoreFocus) $("[data-panel-toggle]")?.focus();
  }

  function setActiveBlock(block, options = {}) {
    if (!block || !paper.contains(block)) return;
    if (block === state.activeBlock) return;
    $$(".doc-block.is-active", paper).forEach((candidate) => candidate.classList.remove("is-active"));
    block.classList.add("is-active");
    state.activeBlock = block;
    if (!options.preserveSelection) {
      removeContextById("select-text", { announce: false });
      state.selection = "";
    }
    upsertContext({ id: "focus", label: `当前块 · ${block.dataset.blockTitle || "正文"}`, locked: true }, { announce: false });
    touchContext(`当前对象切换为「${block.dataset.blockTitle || "正文"}」`);
    syncHeader();
    renderBody();
    renderDock();
    renderPicker();
  }

  function openPicker(mode) {
    if (state.copilotView !== "conversation") setCopilotView("conversation");
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
    setCopilotView("conversation", { render: false });
    state.run = { status: "idle", stage: 0, targetId: null, capabilityId: capability.id };
    state.pickerOpen = false;
    if (capability.id === "rewrite-selection" && state.selection) upsertContext({ id: "select-text", label: `选区 · ${state.selection.length} 字`, locked: false });
    if (["suggest-links", "suggest-links-graph", "add-evidence"].includes(capability.id)) upsertContext({ id: "ambient-knowledge", label: "知识库 · 自动关联", locked: false });
    renderAll();
    requestAnimationFrame(() => $("#composer-input")?.focus());
  }

  function touchContext(reason) {
    state.contextRevision += 1;
    state.contextReason = reason;
    state.contextUpdatedAt = formatAucklandTime();
  }

  function upsertContext(context, options = {}) {
    const existing = state.contexts.find((item) => item.id === context.id);
    if (!existing) {
      state.contexts.push(context);
      if (options.announce !== false) touchContext(`已加入上下文「${context.label}」`);
      return "added";
    }
    if (existing.label === context.label && existing.locked === context.locked) return "unchanged";
    Object.assign(existing, context);
    if (options.announce !== false) touchContext(`上下文已更新为「${context.label}」`);
    return "updated";
  }

  function removeContextById(id, options = {}) {
    const context = state.contexts.find((item) => item.id === id);
    if (!context || context.locked) return false;
    state.contexts = state.contexts.filter((item) => item.id !== id);
    if (options.announce !== false) touchContext(`已移除上下文「${context.label}」`);
    return true;
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
    upsertContext({ id: context.id, label: labelMap[context.id], locked: false });
    if (state.mode === "copilot") renderCopilot();
    renderDock();
    renderPicker();
    showToast(`已加入上下文：${labelMap[context.id]}`);
  }

  function clearRunTimers() {
    runTimers.forEach((timer) => clearTimeout(timer));
    runTimers = [];
  }

  function clearVoiceTimers() {
    voiceTimers.forEach((timer) => clearTimeout(timer));
    voiceTimers = [];
  }

  function voiceIsActive() {
    return ["requesting", "listening", "transcribing"].includes(state.voice.status);
  }

  function finishVoiceInput(transcript) {
    clearVoiceTimers();
    const text = String(transcript || state.voice.interim || "").trim();
    if (text) state.draftText = [state.voice.draftBefore.trim(), text].filter(Boolean).join(state.voice.draftBefore.trim() ? "，" : "");
    state.voice.status = text ? "done" : "idle";
    state.voice.interim = "";
    state.voice.error = "";
    voiceRecognition = null;
    renderDock({ focusInput: true });
    if (!text) return;
    setLive("语音已转成输入草稿；确认后再运行", true);
    voiceTimers.push(window.setTimeout(() => {
      if (state.voice.status !== "done") return;
      state.voice.status = "idle";
      renderDock();
    }, 1800));
  }

  function cancelVoiceInput(announce = false) {
    if (!voiceIsActive() && state.voice.status !== "error") return false;
    clearVoiceTimers();
    const recognition = voiceRecognition;
    voiceRecognition = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.abort(); } catch (_error) { /* Browser may already have stopped. */ }
    }
    state.voice.status = "idle";
    state.voice.interim = "";
    state.voice.error = "";
    if (state.mode === "copilot") renderDock({ focusInput: true });
    if (announce) setLive("已取消本次语音输入", true);
    return true;
  }

  function startVoiceInput() {
    if (["assembling", "streaming"].includes(state.run.status)) return showToast("运行中暂不开始语音输入");
    if (state.copilotView !== "conversation") setCopilotView("conversation");
    if (voiceIsActive()) {
      if (voiceRecognition) {
        state.voice.status = "transcribing";
        renderDock({ focusInput: true });
        try { voiceRecognition.stop(); } catch (_error) { finishVoiceInput(state.voice.interim); }
      } else {
        finishVoiceInput(state.voice.interim || "把这一段改得更清楚，并保留来源链接");
      }
      return;
    }

    state.voice = {
      status: "requesting",
      interim: "",
      error: "",
      draftBefore: state.draftText,
    };
    renderDock({ focusInput: true });
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const useLabFallback = params.get("voice") !== "native" || !Recognition;
    if (useLabFallback) {
      voiceTimers.push(window.setTimeout(() => {
        if (state.voice.status !== "requesting") return;
        state.voice.status = "listening";
        state.voice.interim = "把这一段改得更清楚";
        renderDock({ focusInput: true });
      }, 220));
      voiceTimers.push(window.setTimeout(() => {
        if (!voiceIsActive()) return;
        finishVoiceInput("把这一段改得更清楚，并保留来源链接");
      }, 1450));
      return;
    }

    let transcript = "";
    try {
      voiceRecognition = new Recognition();
      voiceRecognition.lang = "zh-CN";
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = true;
      voiceRecognition.onstart = () => {
        state.voice.status = "listening";
        renderDock({ focusInput: true });
      };
      voiceRecognition.onresult = (event) => {
        transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join("").trim();
        state.voice.interim = transcript;
      };
      voiceRecognition.onerror = (event) => {
        voiceRecognition = null;
        state.voice.status = "error";
        state.voice.error = event.error === "not-allowed" ? "未获得麦克风权限" : "语音输入暂时不可用";
        renderDock({ focusInput: true });
      };
      voiceRecognition.onend = () => {
        if (state.voice.status === "error") return;
        finishVoiceInput(transcript);
      };
      voiceRecognition.start();
    } catch (_error) {
      voiceRecognition = null;
      state.voice.status = "error";
      state.voice.error = "当前环境无法启动语音输入";
      renderDock({ focusInput: true });
    }
  }

  function startRun(options = {}) {
    if (voiceIsActive()) return showToast("先结束语音输入，再运行能力");
    const capability = activeCapability();
    if (!capability) return showToast("先选择一个能力，或输入你想完成的目标");
    if (state.draftPatch || state.run.status === "preview-ready") return showToast("先接受或丢弃正文里的候选，再开始下一次运行");
    const guard = capability.id === "freeform" ? "" : capabilityGuard(capability);
    if (guard) return showToast(guard);

    setCopilotView("conversation", { render: false });

    clearRunTimers();
    $("[data-document-draft]")?.remove();
    state.draftPatch = null;
    const target = resolveTargetBlock(capability);
    state.run = {
      status: "assembling",
      stage: 0,
      targetId: target.dataset.blockId,
      targetTitle: target.dataset.blockTitle || "当前块",
      capabilityId: capability.id,
      contextRevision: state.contextRevision,
      contextSnapshot: state.contexts.map((context) => ({ id: context.id, label: context.label })),
      selectionSnapshot: state.selection,
    };
    state.thread.push({
      id: `message-${Date.now()}`,
      kind: "user",
      label: capability.label,
      text: state.draftText.trim() || capability.prompt,
      time: "刚刚",
      quote: createMessageQuote(target),
    });
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
      <div class="run-trace"><span class="${stage === 0 ? "is-current" : "is-done"}">锁定 ${escapeHtml(target.dataset.blockTitle || "当前块")}</span><span class="${stage === 1 ? "is-current" : stage > 1 ? "is-done" : ""}">读取 ${(state.run.contextSnapshot || []).length} 个上下文来源</span><span class="${stage === 2 ? "is-current" : ""}">生成可回滚 patch</span></div>`;
    target.insertAdjacentElement("afterend", section);
  }

  function candidateFor(capability, target) {
    const before = blockText(target);
    const rewriteCandidates = {
      "correct-content": "AI 侧栏应贴着当前块工作：它读取稳定的 Markdown 源范围，自动携带相关上下文，把候选修改流回正文原位，并只在用户接受后形成可回滚事务。",
      "polish-document": "AI sidecar 贴着当前块协作：理解源范围与 Markdown 结构，自动带入相关上下文，把候选修改送回正文原位，并在接受前保持可撤销。",
      "format-polish": before.replace(/；/g, "；\n").replace(/，/g, "，"),
      translate: "The AI sidecar stays beside the active block, understands its Markdown source range, carries relevant context automatically, and returns every candidate edit to the document for review before it is committed.",
      "rewrite-selection": state.run.selectionSnapshot ? before.replace(state.run.selectionSnapshot, `更清晰地说，${state.run.selectionSnapshot}`) : before,
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
      "extract-concepts": "候选概念：当前工作推断、上下文引用、能力动作、可审阅候选、已接受事务。",
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
    let insertedBlockId = null;
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
      insertedBlockId = `accepted-${Date.now()}`;
      inserted.dataset.blockId = insertedBlockId;
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
      occurredAt: new Date().toISOString(),
      scope: `${patch.targetKind} · ${patch.mode === "rewrite" ? "原位改写" : "新增 1 块"}`,
      delta: patch.mode === "rewrite" ? "+1 −1" : "+1 −0",
      before: patch.before,
      after: patch.after,
      status: "applied",
      insertedBlockId,
      operation: patch.mode === "rewrite" ? "rewrite" : "insert",
      source: { kind: "ai", surface: "copilot", capabilityId: patch.actionId },
      committedBy: "user",
    };
    state.history.unshift(entry);
    state.activeHistoryId = entry.id;
    state.run.status = "accepted";
    state.draftPatch = null;
    state.action = null;
    state.draftText = "";
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

  function useAmbientPush(source) {
    if (!source) return;
    upsertContext({ id: `ambient-source-${source.id}`, label: `相关材料 · ${source.title.replace(/\.md$/i, "")}`, locked: false });
    state.action = capabilityById("add-evidence");
    state.draftText = "把这条关联作为可追溯依据，生成正文引用草稿";
    state.run = { status: "idle", stage: 0, targetId: null, capabilityId: "add-evidence" };
    setCopilotView("conversation", { render: false });
    setMode("copilot");
    requestAnimationFrame(() => $("#composer-input")?.focus());
    showToast("关联材料已变成 context chip；接受前不会写入正文");
  }

  function useAmbientMove(id) {
    const moves = {
      "clarify-return": {
        capabilityId: "correct-content",
        context: "编辑建议 · 回到正文的判断链",
        prompt: "把生成、审阅、接受三个状态连起来，补清为什么 AI 结果必须回到正文原位",
      },
      counterargument: {
        capabilityId: "continue-writing",
        context: "编辑建议 · 反方比较",
        prompt: "为当前判断补一个真实的反方比较，说明适用边界，再生成可插回原位的段落草稿",
      },
      evidence: {
        capabilityId: "add-evidence",
        context: "相关材料 · 支撑依据",
        prompt: "沿当前链接、最近材料和邻近来源，为核心判断找到可追溯依据",
      },
      "place-outline": {
        capabilityId: "writing-plan",
        context: "未落位想法 · 2 条",
        prompt: "把未落位想法安放进现有提纲，先给出落点预览，不直接改正文",
      },
      bridge: {
        capabilityId: "continue-writing",
        context: "未落位想法 · 桥接判断",
        prompt: "为表格 review 与公式 review 起草一个自然的桥接段，并放回当前落点",
      },
      "graph-bridge": {
        capabilityId: "suggest-links-graph",
        context: "链接图谱 · 当前判断路径",
        prompt: "解释 [[知识库]] 与当前编辑事务之间的二跳图谱路径，并生成可审阅的链接候选",
      },
      "tighten-section": {
        capabilityId: "summarize",
        context: "当前章节 · 收紧结论",
        prompt: "保留现有论证，把这一节的结论压成更清楚、可扫描且能回到原位的一段",
      },
      "format-structure": {
        capabilityId: "format-polish",
        context: "当前章节 · 对象层级",
        prompt: "整理当前段落与列表层级，把对象边界写清楚，不改变内容含义",
      },
      "split-notes": {
        capabilityId: "suggest-split",
        context: "全文 · 拆分判断",
        prompt: "判断这部分是否应该拆成两篇笔记，给出拆分边界与互链方式，不立即移动正文",
      },
      "place-native-object": {
        capabilityId: "writing-plan",
        context: "未落位想法 · 原生对象",
        prompt: "为“原生对象也应保留增量过程”寻找最合适的提纲落点，并预览前后关系",
      },
      "trace-acceptance": {
        capabilityId: "continue-writing",
        context: "未落位想法 · 自动感知边界",
        prompt: "把“自动感知不等于自动写入”安放到接受事务之前，起草一段边界说明",
      },
      "selection-contract": {
        capabilityId: "review-article",
        context: "未落位想法 · 选区锚点",
        prompt: "审阅选区引用、正文定位和对话引用块是否使用同一套锚点合同",
      },
      "voice-draft": {
        capabilityId: "writing-plan",
        context: "未落位想法 · 语音草稿",
        prompt: "把语音只是草稿来源、不直接运行的约束安放进输入一致性说明",
      },
      "ambient-ranking": {
        capabilityId: "continue-writing",
        context: "未落位想法 · 推荐重排",
        prompt: "补一段推荐持续重排时如何保护用户当前位置、预览行和键盘焦点的说明",
      },
      unresolved: {
        capabilityId: "suggest-links-graph",
        context: "知识库动态 · 待补连接",
        prompt: "检查两篇近期笔记缺失的 outgoing links，解释图谱路径并生成链接候选",
      },
      "changed-hub": {
        capabilityId: "summarize",
        context: "知识库动态 · 变化枢纽",
        prompt: "总结知识枢纽自上次会话以来的变化，并生成可审阅的更新摘要",
      },
      decaying: {
        capabilityId: "add-evidence",
        context: "知识库动态 · 久未打开重点",
        prompt: "从三条久未打开的高重要度材料中，找出与当前判断真正相关的依据",
      },
      "deep-check": {
        capabilityId: "review-article",
        context: "当前章节 · 深查",
        prompt: "只检查当前 section、recent notes 与 nearby sources，给出有正文锚点的结构、证据和清晰度 findings",
      },
    };
    const move = moves[id];
    if (!move) return;
    const capability = capabilityById(move.capabilityId);
    if (!capability) return;
    upsertContext({ id: `ambient-move-${id}`, label: move.context, locked: false });
    state.action = capability;
    state.draftText = move.prompt;
    state.run = { status: "idle", stage: 0, targetId: null, capabilityId: capability.id };
    state.pickerOpen = false;
    setCopilotView("conversation", { render: false });
    setMode("copilot");
    requestAnimationFrame(() => $("#composer-input")?.focus());
    showToast(`${move.context} 已带入 Copilot；结果会先在正文原位预览`);
  }

  function selectHistoryEntry(id, trigger) {
    openHistoryDetail(id, trigger);
  }

  function locateHistoryEntry(id) {
    const entry = state.history.find((candidate) => candidate.id === id);
    const locatorId = entry?.insertedBlockId || entry?.targetId;
    const block = locatorId ? $(`[data-block-id="${locatorId}"]`, paper) : null;
    if (!block) return showToast("这次写入的原始块已移动；生产版会用 source range adapter 重定位");
    if (historyReviewModal?.open) {
      historyReturnFocusId = null;
      closeHistoryDetail();
    }
    setActiveBlock(block);
    block.scrollIntoView({ behavior: "smooth", block: "center" });
    block.classList.add("is-located");
    window.setTimeout(() => block.classList.remove("is-located"), 850);
    setLive(`已定位：${entry.targetTitle}`, true);
  }

  function rollbackHistoryEntry(id) {
    const entry = state.history.find((candidate) => candidate.id === id);
    if (!entry || entry.status === "rolled-back" || entry.inverseOf) return;
    const availability = rollbackAvailability(entry);
    if (!availability.allowed) return showToast(availability.reason);
    if (state.rollbackConfirmId !== id) {
      state.rollbackConfirmId = id;
      renderHistoryDetail();
      requestAnimationFrame(() => $(`[data-history-rollback="${id}"]`, historyReviewModal)?.focus());
      return;
    }
    const insertedBlock = entry.insertedBlockId ? $(`[data-block-id="${entry.insertedBlockId}"]`, paper) : null;
    const block = $(`[data-block-id="${entry.targetId}"]`, paper);
    if ((entry.insertedBlockId && !insertedBlock) || (!entry.insertedBlockId && !block)) {
      state.rollbackConfirmId = null;
      renderHistoryDetail();
      showToast("原始写入位置已移动；未追加回滚事务");
      return;
    }
    if (insertedBlock) {
      insertedBlock.remove();
    } else if (block) {
      const tagRow = entry.actionId === "suggest-tags" ? block.querySelector(".tag-row") : null;
      if (tagRow) {
        const tags = entry.before.match(/\[([^\]]*)\]/)?.[1].split(",").map((tag) => tag.trim()).filter(Boolean) || [];
        tagRow.innerHTML = tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
      } else {
        const editable = block.querySelector("p, h1, h2, ul") || block;
        editable.textContent = entry.before;
      }
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
      occurredAt: new Date().toISOString(),
      scope: entry.scope,
      delta: `↩ ${entry.delta}`,
      before: entry.after,
      after: entry.before,
      status: "applied",
      inverseOf: entry.id,
      operation: "rollback",
      source: { kind: "system", surface: "history" },
      committedBy: "user",
    };
    state.history.unshift(inverse);
    state.activeHistoryId = entry.id;
    state.rollbackConfirmId = null;
    syncHeader();
    renderHistory();
    renderHistoryDetail();
    setLive("已追加回滚事务；原记录仍保留", true);
    showToast("已回滚，并保留完整审计记录");
  }

  function updateSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (!state.selection) return;
      state.selection = "";
      removeContextById("select-text");
      if (state.mode === "copilot") renderCopilot();
      renderDock();
      renderPicker();
      return;
    }
    const range = selection.getRangeAt(0);
    const owner = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!owner || !paper.contains(owner)) return;
    const text = selection.toString().trim();
    if (!text || text === state.selection) return;
    const block = owner.closest?.(".doc-block");
    if (block && block !== state.activeBlock) setActiveBlock(block, { preserveSelection: true });
    state.selection = text;
    upsertContext({ id: "select-text", label: `选区 · ${text.length} 字`, locked: false });
    if (state.mode === "copilot") renderCopilot();
    renderDock();
    renderPicker();
  }

  document.addEventListener("click", (event) => {
    const panelToggle = event.target.closest("[data-panel-toggle]");
    if (panelToggle) return setPanelOpen(!state.panelOpen);
    if (event.target.closest("[data-panel-close]")) return setPanelOpen(false, true);

    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) return setMode(modeButton.dataset.mode);

    const copilotViewButton = event.target.closest("[data-copilot-view]");
    if (copilotViewButton) return setCopilotView(copilotViewButton.dataset.copilotView, { focusControl: true });

    const starter = event.target.closest("[data-starter]");
    if (starter) return bindCapability(capabilityById(starter.dataset.starter));
    const messageTarget = event.target.closest("[data-message-target]");
    if (messageTarget) {
      const block = $(`[data-block-id="${messageTarget.dataset.messageTarget}"]`, paper);
      if (!block) return showToast("引用的正文位置已不存在");
      block.scrollIntoView({ behavior: "smooth", block: "center" });
      block.classList.add("is-located");
      window.setTimeout(() => block.classList.remove("is-located"), 850);
      return showToast(`已定位「${block.dataset.blockTitle || "引用正文"}」`);
    }
    const threadCapability = event.target.closest("[data-thread-capability]");
    if (threadCapability) return bindCapability(capabilityById(threadCapability.dataset.threadCapability));
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
    const removeContextButton = event.target.closest("[data-remove-context]");
    if (removeContextButton) {
      removeContextById(removeContextButton.dataset.removeContext);
      if (state.mode === "copilot") renderCopilot();
      renderDock();
      renderPicker();
      return;
    }
    if (event.target.closest("[data-voice-input]")) return startVoiceInput();
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

    const workbenchSectionToggle = event.target.closest("[data-toggle-workbench-section]");
    if (workbenchSectionToggle) {
      const key = workbenchSectionToggle.dataset.toggleWorkbenchSection;
      if (!Object.hasOwn(state.ambient.expandedSections, key)) return;
      state.scroll.workbench = copilotWorkbench.scrollTop;
      state.ambient.expandedSections[key] = !state.ambient.expandedSections[key];
      renderCopilotWorkspace();
      requestAnimationFrame(() => $(`[data-toggle-workbench-section="${key}"]`, copilotWorkbench)?.focus());
      return;
    }
    if (event.target.closest("[data-toggle-suggestion-reason]")) {
      state.scroll.workbench = copilotWorkbench.scrollTop;
      state.ambient.reasonOpen = !state.ambient.reasonOpen;
      renderCopilotWorkspace();
      return;
    }

    const ambientSourcePreview = event.target.closest("[data-ambient-source-preview]");
    if (ambientSourcePreview) {
      const id = ambientSourcePreview.dataset.ambientSourcePreview;
      state.scroll.workbench = copilotWorkbench.scrollTop;
      state.ambient.previewSourceId = state.ambient.previewSourceId === id ? null : id;
      renderCopilotWorkspace();
      return;
    }
    const ambientSourceUse = event.target.closest("[data-ambient-source-use]");
    if (ambientSourceUse) {
      const source = AMBIENT_SOURCES.find((candidate) => candidate.id === ambientSourceUse.dataset.ambientSourceUse);
      return useAmbientPush(source);
    }
    const ambientSourceDismiss = event.target.closest("[data-ambient-source-dismiss]");
    if (ambientSourceDismiss) {
      const id = ambientSourceDismiss.dataset.ambientSourceDismiss;
      if (!state.ambient.dismissedSourceIds.includes(id)) state.ambient.dismissedSourceIds.push(id);
      if (state.ambient.previewSourceId === id) state.ambient.previewSourceId = null;
      state.ambient.refreshSummary = "已忽略 1 条材料；其余推荐仍保留";
      state.scroll.workbench = copilotWorkbench.scrollTop;
      renderCopilotWorkspace();
      return;
    }

    const ambientAction = event.target.closest("[data-ambient-action]");
    if (ambientAction) {
      const action = ambientAction.dataset.ambientAction;
      if (action === "refresh") {
        if (state.ambient.refreshing) return;
        state.ambient.refreshing = true;
        state.ambient.dismissedSourceIds = [];
        state.scroll.workbench = copilotWorkbench.scrollTop;
        renderCopilotWorkspace();
        setLive("正在更新工作台排序；旧内容继续可用");
        window.setTimeout(() => {
          state.ambient.refreshing = false;
          state.ambient.refreshRevision += 1;
          state.ambient.updatedAt = formatAucklandTime();
          state.ambient.queue = {
            total: state.ambient.queue.total + 4,
            moves: state.ambient.queue.moves + 2,
            sources: state.ambient.queue.sources + 1,
            thoughts: state.ambient.queue.thoughts + 1,
            added: 7,
            removed: 3,
          };
          state.ambient.refreshSummary = "刚刚重排 · +7 新线索 · 3 条已归档";
          state.ambient.previewSourceId = null;
          renderCopilotViewSwitcher();
          renderCopilot();
          setLive("工作台已更新 · 新增 7 条，归档 3 条", true);
        }, 720);
        return;
      }
      return;
    }

    const ambientMove = event.target.closest("[data-ambient-move]");
    if (ambientMove) return useAmbientMove(ambientMove.dataset.ambientMove);

    if (event.target.closest("[data-history-close]")) return closeHistoryDetail();
    const historyDiffMode = event.target.closest("[data-history-diff-mode]");
    if (historyDiffMode) return setHistoryDiffMode(historyDiffMode.dataset.historyDiffMode);
    const historySelect = event.target.closest("[data-history-select]");
    if (historySelect) return selectHistoryEntry(historySelect.dataset.historySelect, historySelect);
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
      resizeComposerInput(event.target);
      if (state.draftText.trim() && state.copilotView !== "conversation") setCopilotView("conversation");
      updateDockHeight();
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
      if (voiceIsActive()) {
        event.preventDefault();
        cancelVoiceInput(true);
        return;
      }
      if (historyReviewModal?.open) {
        event.preventDefault();
        closeHistoryDetail();
        return;
      }
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
    if (event.target.id === "composer-input" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (["assembling", "streaming"].includes(state.run.status)) stopRun();
      else startRun();
      return;
    }
    const tab = event.target.closest("[data-mode]");
    if (tab && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const modes = ["copilot", "history"];
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const index = (modes.indexOf(state.mode) + offset + modes.length) % modes.length;
      setMode(modes[index]);
      $(`[data-mode="${modes[index]}"]`)?.focus();
      return;
    }
    const viewTab = event.target.closest("[data-copilot-view]");
    if (viewTab && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const views = ["workbench", "conversation"];
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const index = (views.indexOf(state.copilotView) + offset + views.length) % views.length;
      setCopilotView(views[index], { focusControl: true });
    }
  });

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(updateSelection, 90);
  });

  historyReviewModal?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHistoryDetail();
  });

  historyReviewModal?.addEventListener("close", resetHistoryDetail);

  historyReviewModal?.addEventListener("click", (event) => {
    if (event.target === historyReviewModal) closeHistoryDetail();
  });

  window.addEventListener("pagehide", () => cancelVoiceInput(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelVoiceInput(false);
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(updateDockHeight).observe(copilotDock);
  }

  function initializeDemoState() {
    const demo = params.get("demo");
    if (!demo) return;
    setCopilotView("conversation", { render: false });
    state.action = capabilityById("add-evidence");
    state.draftText = "用当前关联笔记补清这段判断的依据";
    renderAll();
    if (demo === "result") startRun({ instant: true });
    if (demo === "streaming") startRun({ freezeStreaming: true });
  }

  if (requestedMode === "ambient") {
    state.copilotView = "workbench";
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "copilot");
    url.searchParams.set("view", "workbench");
    window.history.replaceState({}, "", url);
  }

  copilotWorkbench.addEventListener("scroll", () => {
    if (state.copilotView === "workbench") state.scroll.workbench = copilotWorkbench.scrollTop;
  }, { passive: true });

  sidecarBody.addEventListener("scroll", () => {
    if (state.mode === "copilot" && state.copilotView === "conversation") state.scroll.conversation = sidecarBody.scrollTop;
  }, { passive: true });

  renderAll();
  initializeDemoState();
})();
