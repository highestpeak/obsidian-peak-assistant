const paper = document.getElementById("paper");
const toast = document.getElementById("toast");
const ambientKind = document.getElementById("ambient-kind");
const ambientTitle = document.getElementById("ambient-title");
const ambientSource = document.getElementById("ambient-source");
const bottomSource = document.getElementById("bottom-source");
const sourcebar = document.getElementById("sourcebar");
const sourcebarDetail = document.getElementById("sourcebar-detail");
const sourcebarContext = document.getElementById("sourcebar-context");
const ambientLive = document.getElementById("ambient-live");
const historySourceDiff = document.getElementById("history-source-diff");
const historyDetail = document.getElementById("history-diff-detail");
const ambientPushList = document.getElementById("ambient-push-list");
const ambientTheme = document.getElementById("ambient-theme");
const copilotContext = document.getElementById("copilot-context");
const ambientTabs = Array.from(document.querySelectorAll("[data-intelligence-mode]"));
const ambientViews = Array.from(document.querySelectorAll("[data-ambient-panel]"));
const historyCount = document.getElementById("history-count");
const rollbackCard = document.getElementById("ambient-rollback");
const rollbackList = rollbackCard;
const table = document.getElementById("composer-table");
let imageGallery = null;
let blockDragState = null;
let suppressNextMoveClick = false;
let focusedBlock = null;
let currentCell = null;
let tableSelectionAnchor = null;
let selectedTableCells = [];
let selectedTableRange = null;
let selectedTableMode = null;
let tablePointerSelection = null;
let suppressNextTableCellClick = false;
let tableMergeFirstCell = null;
let tableMergeMode = false;
const rollbackTrail = [];
const composerUndoStack = [];
const composerRedoStack = [];
let composerTransactionSequence = 0;
let composerAiRunSequence = 0;
const aiSuggestionHistory = [];
let activeHistoryIndex = null;
let ambientPushLoading = false;
let ambientThemeLocked = true;
let activeCapabilityId = null;
let capabilityRunTimer = null;
let directEditBatch = null;

const copilotCapabilities = [
  { id: "connect-notes", label: "连接相关笔记", description: "合并 Graph、Wiki Link 与 backlink 信号", group: "knowledge", icon: "i-share", scope: "知识库", recommended: true, strategies: ["语义图谱", "Wiki links", "Backlinks"] },
  { id: "improve-note", label: "改善当前笔记", description: "事实、结构、语言与格式统一审校", group: "review", icon: "i-shield", scope: "全文", recommended: true, strategies: ["事实", "结构", "语言", "格式"] },
  { id: "add-evidence", label: "补上依据", description: "从 Vault 找到可追溯证据并回填引用", group: "knowledge", icon: "i-book", scope: "当前判断", recommended: true, strategies: ["Vault", "相邻笔记", "已链接来源"] },
  { id: "rewrite-selection", label: "改写选区", description: "保持含义，调整清晰度、长度或语气", group: "writing", icon: "i-pen", scope: "选区", strategies: ["更清晰", "更精简", "扩写"] },
  { id: "translate", label: "翻译", description: "翻译选区或当前内容并保留 Markdown", group: "writing", icon: "i-language", scope: "选区 / 当前块", strategies: ["English", "中文", "日本語"] },
  { id: "continue-writing", label: "继续写", description: "从当前落点续写，并沿用上下文语气", group: "writing", icon: "i-file-text", scope: "当前落点", strategies: ["续写一段", "补过渡", "补结论"] },
  { id: "writing-plan", label: "写作计划", description: "基于 Vault 资料生成可执行提纲", group: "writing", icon: "i-list", scope: "全文", strategies: ["文章提纲", "研究计划", "发布计划"] },
  { id: "write-article", label: "从资料写文章", description: "检索 Vault 笔记并带 [[引用]] 综合成文", group: "writing", icon: "i-file-text", scope: "全文", strategies: ["当前主题", "已链接资料", "整个 Vault"] },
  { id: "generate-illustration", label: "生成配图", description: "从当前内容生成结构图、概念图或说明图", group: "writing", icon: "i-image", scope: "当前块", strategies: ["结构图", "概念图", "说明配图"] },
  { id: "summarize", label: "总结", description: "生成摘要，并可插回文首或当前节", group: "document", icon: "i-file-text", scope: "全文", strategies: ["一句话", "执行摘要", "要点"] },
  { id: "extract-concepts", label: "提取概念", description: "识别关键概念、定义与可拆分笔记", group: "document", icon: "i-lightbulb", scope: "全文", strategies: ["概念", "定义", "候选笔记"] },
  { id: "suggest-tags", label: "建议标签", description: "综合正文、图谱邻居与文件夹历史", group: "document", icon: "i-tag", scope: "Frontmatter", strategies: ["正文信号", "图谱邻居", "目录历史"] },
  { id: "suggest-split", label: "建议拆分", description: "为长文提出边界、标题与迁移计划", group: "document", icon: "i-share", scope: "全文", strategies: ["按主题", "按任务", "按生命周期"] },
  { id: "check-task-list", label: "检查任务列表", description: "识别优先级、阻塞、过期与缺失动作", group: "document", icon: "i-check-list", scope: "任务项", strategies: ["优先级", "阻塞项", "时效"] },
];

const capabilityGroupLabels = {
  review: "编辑与审校",
  writing: "写作与生成",
  knowledge: "知识连接",
  document: "文档整理",
};

const capabilityAliases = {
  "connect-notes": "Suggest Links · Suggest Links (Graph)",
  "improve-note": "Review Article · Correct Content · Polish Document · Format Polish",
  "add-evidence": "Add Evidence",
  "rewrite-selection": "Rewrite Selection",
  translate: "Translate",
  "continue-writing": "Continue Writing",
  "writing-plan": "Writing Plan",
  "write-article": "Write Article",
  "generate-illustration": "Generate Illustration",
  summarize: "Summarize",
  "extract-concepts": "Extract Concepts",
  "suggest-tags": "Suggest Tags",
  "suggest-split": "Suggest Split",
  "check-task-list": "Check Task List",
};

const ambientPushItems = [
  {
    id: "knowledge-base",
    title: "知识库.md",
    path: "B-2-创意和想法管理/C-大类-信息聚合-PKM/知识库.md",
    confidence: "强关联",
    signals: ["共享标签", "同一主题"],
    detail: "定义了从收集、组织到输出的闭环，能为当前段落的“可验证输出”补一个原始依据。",
    status: "active",
  },
  {
    id: "base-usage",
    title: "Base 使用判断.md",
    path: "B-2-创意和想法管理/C-大类-信息聚合-PKM/Base 使用判断.md",
    confidence: "强关联",
    signals: ["相邻链接", "最近打开"],
    detail: "与表格、筛选和结构化输出相关；适合在写到工作流表格时补成上下文链接。",
    status: "active",
  },
  {
    id: "review-loop",
    title: "知识回顾.md",
    path: "Z-10-PKM产品类别分析/知识回顾.md",
    confidence: "相关",
    signals: ["Canvas 节点", "回顾路径"],
    detail: "Canvas 中已有“复盘更新”边，能把当前的输出讨论接回下一轮行动。",
    status: "active",
  },
];

const canvasData = {
  nodes: [
    { id: "group-pkm", type: "group", x: -300, y: -180, width: 950, height: 510, label: "PKM 产品类别分析 · JSON Canvas sample" },
    { id: "capture", type: "text", x: -260, y: -110, width: 220, height: 120, color: "5", text: "## 信息获取\nRSS、网页剪藏、PDF Reader、播客、视频、系统共享" },
    { id: "inbox", type: "file", x: 30, y: -140, width: 240, height: 92, color: "6", file: "Z-10-PKM产品类别分析/inbox.md" },
    { id: "manage", type: "text", x: 20, y: 40, width: 250, height: 130, color: "4", text: "## 信息管理\n区分资料库、笔记和大脑；用树组织承接线性知识，用图组织承接碎片想法。" },
    { id: "output", type: "text", x: 360, y: 10, width: 240, height: 118, color: "2", text: "## 信息输出\n草稿笔记、正文输出、系列文章、协作输出、数据可视化。" },
    { id: "review", type: "file", x: 350, y: 190, width: 250, height: 92, color: "3", file: "Z-10-PKM产品类别分析/知识回顾.md" },
  ],
  edges: [
    { fromNode: "capture", toNode: "inbox", label: "暂存", color: "5" },
    { fromNode: "inbox", toNode: "manage", label: "筛选", color: "6" },
    { fromNode: "manage", toNode: "output", label: "组织后输出", color: "4" },
    { fromNode: "output", toNode: "review", label: "沉淀", color: "2" },
    { fromNode: "review", toNode: "manage", label: "复盘更新", color: "3" },
  ],
};

const canvasColors = {
  "2": "#b7791f",
  "3": "#b7791f",
  "4": "#0f8a72",
  "5": "#2563eb",
  "6": "#6554d9",
};

const excalidrawNodes = [
  { x: 380, y: 24, w: 160, h: 54, text: "信息获取", color: "#2563eb" },
  { x: 90, y: 118, w: 150, h: 44, text: "RSS Reader", color: "#0f8a72" },
  { x: 90, y: 184, w: 168, h: 44, text: "网页剪藏-批注", color: "#0f8a72" },
  { x: 72, y: 250, w: 150, h: 44, text: "PDF Reader", color: "#0f8a72" },
  { x: 270, y: 122, w: 150, h: 44, text: "播客", color: "#0f8a72" },
  { x: 278, y: 190, w: 150, h: 44, text: "视频信息", color: "#0f8a72" },
  { x: 390, y: 296, w: 170, h: 54, text: "信息管理", color: "#6554d9" },
  { x: 604, y: 112, w: 150, h: 44, text: "知识库", color: "#b7791f" },
  { x: 644, y: 178, w: 150, h: 44, text: "图谱工具", color: "#b7791f" },
  { x: 648, y: 244, w: 150, h: 44, text: "表格工具", color: "#b7791f" },
  { x: 726, y: 322, w: 150, h: 44, text: "信息输出", color: "#b42318" },
  { x: 562, y: 352, w: 150, h: 44, text: "知识回顾", color: "#b42318" },
];

const excalidrawEdges = [
  ["信息获取", "RSS Reader"], ["信息获取", "网页剪藏-批注"], ["信息获取", "PDF Reader"], ["信息获取", "播客"], ["信息获取", "视频信息"],
  ["RSS Reader", "信息管理"], ["网页剪藏-批注", "信息管理"], ["知识库", "信息输出"], ["图谱工具", "信息输出"], ["表格工具", "信息输出"], ["信息输出", "知识回顾"],
];
let mermaidRenderSerial = 0;

const aiPatternRules = {
  table: /阶段|路径|四条|多种|结构|分类|维度|对比|列表|步骤|输出|输入|来源|当前动作|row|column|table/i,
  visual: /图|路径|路线|流程|闭环|结构|图谱|迁移|Canvas|Excalidraw|地图|节点|边|示意/i,
  formula: /公式|变量|复杂度|系数|阈值|PageRank|TextRank|Louvain|\$|O\(|\\tau|\\frac|\\sum/i,
  question: /应该|不是|真正|为什么|危险|目标|原则|需要|不能|要让|如何/i,
  action: /行动|下一步|待办|复盘|执行|检查|迁移|写回|接受|拒绝/i,
};

function matchSignal(text, signal) {
  const found = text.match(aiPatternRules[signal]);
  return found ? found[0] : "";
}

function copilotScopeText(title, kind) {
  return `已加入「${title}」、相邻 ${kind} 内容与高置信关联`;
}

function selectedEditorText() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return "";
  const range = selection.getRangeAt(0);
  const owner = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!owner || !paper?.contains(owner)) return "";
  return selection.toString().trim();
}

function capabilityGuard(capability) {
  if (capability.id === "rewrite-selection" && !selectedEditorText()) return "先在正文里选择一段文字，再运行改写选区。";
  if (capability.id === "check-task-list" && !/- \[[ x]\]/i.test(paper?.textContent || "")) return "当前文档里没有 Markdown task item。";
  if (capability.id === "suggest-split" && (paper?.textContent || "").trim().length < 500) return "当前文档较短；能力仍可查看，但暂不建议消耗一次生成。";
  return "";
}

function capabilityScope(capability) {
  const selection = selectedEditorText();
  if (capability.id === "rewrite-selection" && selection) return `已选择 ${selection.length} 个字符`;
  return focusedBlock?.dataset.blockTitle || "当前文档";
}

function capabilityPrompt(capability) {
  const prompts = {
    "connect-notes": "比较当前内容、知识图谱和反向链接，找出最值得补入正文的关联笔记",
    "improve-note": "审校当前笔记的事实、结构、语言和格式，并把修改放回正文原位",
    "add-evidence": "为当前判断寻找可追溯的 Vault 证据，并补充引用",
    "rewrite-selection": "保持原意，改写当前选区，使它更清楚、更紧凑",
    translate: "翻译当前内容并完整保留 Markdown 结构与内部链接",
    "continue-writing": "沿着当前脉络继续写，并补足过渡和下一步",
    "writing-plan": "基于当前文档和 Vault 资料生成可执行写作计划",
    "write-article": "读取相关笔记，综合成一篇带 [[引用]] 的文章",
    "generate-illustration": "为当前内容生成一张可编辑、可回写的说明图",
    summarize: "总结当前文档，并生成适合插回文首的执行摘要",
    "extract-concepts": "提取关键概念、定义和可拆成独立笔记的候选",
    "suggest-tags": "综合正文、图谱邻居与目录历史，补全 Frontmatter 标签",
    "suggest-split": "分析长文结构，提出拆分边界、标题和迁移计划",
    "check-task-list": "检查任务优先级、阻塞、过期状态和缺失动作",
  };
  return prompts[capability.id] || capability.description;
}

function capabilityRow(capability, recommended = false) {
  const guard = capabilityGuard(capability);
  return `
    <button class="ai-capability-row${recommended ? " is-recommended" : ""}${guard ? " is-disabled" : ""}" type="button" data-copilot-capability="${capability.id}" aria-disabled="${guard ? "true" : "false"}" title="${escapeHtml(guard || capabilityAliases[capability.id] || capability.description)}">
      <span class="ai-capability-icon"><svg><use href="#${capability.icon}"></use></svg></span>
      <span class="ai-capability-copy"><strong>${escapeHtml(capability.label)}</strong><small>${escapeHtml(guard || capability.description)}</small></span>
      <span class="ai-capability-meta"><span>${escapeHtml(recommended ? "推荐" : capability.scope)}</span><svg><use href="#i-arrow-left"></use></svg></span>
    </button>`;
}

function renderCapabilityBrowser(query = "") {
  const list = document.getElementById("copilot-capability-list");
  if (!list) return;
  const normalized = query.trim().toLowerCase();
  const filtered = copilotCapabilities.filter((capability) => {
    const haystack = [capability.label, capability.description, capability.id, capabilityAliases[capability.id], capability.group].join(" ").toLowerCase();
    return !normalized || haystack.includes(normalized);
  });
  if (!filtered.length) {
    list.innerHTML = `<div class="ai-capability-empty">没有匹配的能力。可以搜索动作、结果或英文旧名称。</div>`;
    return;
  }

  const groups = [];
  if (!normalized) {
    const recommended = filtered.filter((capability) => capability.recommended);
    if (recommended.length) groups.push({ label: "推荐给当前内容", hint: "按上下文动态排序", items: recommended, recommended: true });
  }
  Object.keys(capabilityGroupLabels).forEach((group) => {
    const items = filtered.filter((capability) => capability.group === group && (normalized || !capability.recommended));
    if (items.length) groups.push({ label: capabilityGroupLabels[group], hint: `${items.length} 项`, items, recommended: false });
  });
  list.innerHTML = groups.map((group) => `
    <section class="ai-capability-group">
      <header><span>${escapeHtml(group.label)}</span><small>${escapeHtml(group.hint)}</small></header>
      ${group.items.map((capability) => capabilityRow(capability, group.recommended)).join("")}
    </section>`).join("");
}

function capabilityResultMarkup(capability) {
  if (capability.id === "connect-notes") {
    return `<div class="ai-capability-result-list"><label><input type="checkbox" checked />知识库.md · 语义 0.91</label><label><input type="checkbox" checked />Base 使用判断.md · 反向链接</label><label><input type="checkbox" />知识回顾.md · Canvas 邻居</label></div>`;
  }
  if (capability.id === "suggest-tags") {
    return `<div class="ai-capability-result-list"><span>knowledge-management · 92%</span><span>markdown-editing · 87%</span><span>ai-assisted · 81%</span></div>`;
  }
  if (capability.id === "improve-note") {
    return `<div class="ai-capability-result-list"><span>结构 · 两段判断可以合并</span><span>证据 · 1 个结论缺少来源</span><span>格式 · 2 个列表项层级不一致</span></div>`;
  }
  if (capability.id === "translate") {
    return `<div class="ai-capability-result-list"><span>Markdown 链接与块引用已保留</span><span>术语 PKM / Canvas / Base 保持原文</span></div>`;
  }
  if (capability.id === "generate-illustration") {
    return `<div class="ai-capability-result-list"><span>方向 A · 来源 → 判断 → 行动</span><span>方向 B · 知识循环关系图</span><span>方向 C · 编辑工作流说明图</span></div>`;
  }
  return `<div class="ai-capability-result-list"><span>已生成正文候选</span><span>保留 Markdown、链接与原生对象</span></div>`;
}

function renderCapabilityRunner(capability, phase = "setup") {
  const runner = document.getElementById("copilot-capability-runner");
  if (!runner || !capability) return;
  const guard = capabilityGuard(capability);
  const options = capability.strategies.map((strategy, index) => `<button type="button" class="${index === 0 ? "is-active" : ""}" data-copilot-option>${escapeHtml(strategy)}</button>`).join("");
  const progress = phase === "loading" ? `
    <div class="ai-capability-progress" role="status"><span></span><ol><li>读取当前范围与 Markdown 结构</li><li class="is-current">调用所需来源与模型</li><li>准备可回滚的正文 patch</li></ol></div>` : "";
  const result = phase === "result" ? `
    <div class="ai-capability-result"><span>运行结果</span><strong>${escapeHtml(capability.label)}已准备好</strong><p>结果仍未写入；你可以先检查候选，再把它送回正文原位。</p>${capabilityResultMarkup(capability)}<div class="ai-capability-result-actions"><button type="button" data-copilot-capability-draft="${capability.id}">放入输入框</button><button type="button" data-copilot-capability-apply="${capability.id}">送回正文</button></div></div>` : "";
  runner.innerHTML = `
    <header class="ai-subview-head"><button type="button" data-copilot-view="capabilities" title="返回全部能力"><svg><use href="#i-arrow-left"></use></svg></button><div><strong>${escapeHtml(capability.label)}</strong><span>${escapeHtml(capabilityAliases[capability.id] || capability.id)}</span></div></header>
    <div class="ai-capability-runner-body">
      <div class="ai-capability-identity"><span class="ai-capability-icon"><svg><use href="#${capability.icon}"></use></svg></span><div><strong>${escapeHtml(capability.label)}</strong><p>${escapeHtml(capability.description)}</p></div></div>
      <div class="ai-capability-scope"><span>作用范围</span><strong>${escapeHtml(capabilityScope(capability))}</strong><small>${escapeHtml(capability.scope)} · 接受前不会改写 Markdown</small></div>
      <div class="ai-capability-options"><span>本次侧重</span><div class="ai-option-grid">${options}</div></div>
      ${guard ? `<div class="ai-capability-guard"><strong>暂时不能运行</strong><span>${escapeHtml(guard)}</span></div>` : ""}
      ${phase === "setup" ? `<button class="ai-capability-run" type="button" data-copilot-capability-run="${capability.id}" ${guard ? "disabled" : ""}>运行 ${escapeHtml(capability.label)}</button>` : ""}
      ${progress}${result}
    </div>`;
}

function openCopilotSubview(view) {
  const thread = document.getElementById("copilot-thread");
  const browser = document.getElementById("copilot-capability-browser");
  const runner = document.getElementById("copilot-capability-runner");
  const trigger = document.querySelector("[data-copilot-capabilities]");
  if (!thread || !browser || !runner) return;
  thread.hidden = view !== "thread";
  browser.hidden = view !== "capabilities";
  runner.hidden = view !== "runner";
  trigger?.setAttribute("aria-expanded", String(view !== "thread"));
  if (view === "capabilities") {
    renderCapabilityBrowser(document.getElementById("copilot-capability-search")?.value || "");
    requestAnimationFrame(() => document.getElementById("copilot-capability-search")?.focus());
  }
}

function openCapabilityRunner(capabilityId) {
  const capability = copilotCapabilities.find((item) => item.id === capabilityId);
  if (!capability) return;
  activeCapabilityId = capability.id;
  const active = document.getElementById("copilot-active-capability");
  if (active) {
    active.hidden = false;
    active.textContent = capability.label;
  }
  renderCapabilityRunner(capability);
  openCopilotSubview("runner");
}

function runCapability(capabilityId) {
  const capability = copilotCapabilities.find((item) => item.id === capabilityId);
  if (!capability || capabilityGuard(capability)) return;
  clearTimeout(capabilityRunTimer);
  renderCapabilityRunner(capability, "loading");
  setLive(`${capability.label}正在运行`, "结果会留在侧栏内检查，接受后才送回正文。 ");
  capabilityRunTimer = setTimeout(() => {
    renderCapabilityRunner(capability, "result");
    setLive(`${capability.label}已生成`, "候选已准备好；可以放入输入框继续追问，也可以送回正文原位预览。 ");
  }, 850);
}

function applyCapability(capabilityId) {
  const capability = copilotCapabilities.find((item) => item.id === capabilityId);
  if (!capability || !focusedBlock) return showToast("先选择正文中的一个块");
  const labels = {
    "connect-notes": "补链接",
    "improve-note": "文档审校",
    "add-evidence": "补充证据",
    "rewrite-selection": "改写选区",
    translate: "翻译",
    "generate-illustration": "生成配图",
    "suggest-tags": "补标签",
  };
  showAiSuggestionCard(focusedBlock, {
    label: labels[capability.id] || capability.label,
    reason: "Copilot 侧栏能力",
    customText: capabilityPrompt(capability),
    trigger: "copilot",
  });
  openCopilotSubview("thread");
  setLive(`${capability.label}已送回正文`, "正文原位会展示候选；接受后才写入 Markdown，并自动进入 History。 ");
  showToast(`${capability.label}已放回正文原位`);
}

function setFocusedBlock(block) {
  if (!block) return;

  focusedBlock = block;
  const kind = block.dataset.blockKind || "markdown";
  const title = block.dataset.blockTitle || "Untitled block";
  const source = block.dataset.source || "";

  if (ambientKind) ambientKind.textContent = kind;
  if (ambientTitle) ambientTitle.textContent = title;
  if (ambientSource) ambientSource.textContent = source;
  if (bottomSource) bottomSource.textContent = source;
  if (sourcebarContext) sourcebarContext.textContent = `当前块 · ${title}`;
  if (copilotContext) copilotContext.textContent = copilotScopeText(title, kind);
  window.PeakIntelligencePanel?.updateContext({ title, kind, source }, "#ambient-panel");
  renderFocusedHistory(block);
  if (historySourceDiff) {
    const initial = block.dataset.initialSource || source;
    historySourceDiff.innerHTML = initial === source
      ? `<span class="history-eq">  ${escapeHtml(source || "（空块）")}</span>`
      : `<del>- ${escapeHtml(initial)}</del>\n<ins>+ ${escapeHtml(source)}</ins>`;
  }
}

function showToast(message) {
  toast.classList.remove("is-transaction");
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function setLive(title, body) {
  const sharedController = window.PeakIntelligencePanel?.controller("#ambient-panel");
  if (sharedController) {
    sharedController.notify(title, body);
    return;
  }
  if (!ambientLive) return;
  const detail = String(body).replace(/<[^>]+>/g, "").trim();
  ambientLive.innerHTML = `<svg><use href="#i-check"></use></svg><span>${escapeHtml(title)}</span>`;
  ambientLive.title = detail;
  ambientLive.classList.remove("is-updated");
  requestAnimationFrame(() => ambientLive.classList.add("is-updated"));
  clearTimeout(setLive.timer);
  setLive.timer = setTimeout(() => ambientLive.classList.remove("is-updated"), 1200);
}

function switchAmbientView(view) {
  const sharedController = window.PeakIntelligencePanel?.controller("#ambient-panel");
  if (sharedController?.mode !== view) sharedController?.setMode(view, { emit: false });
  ambientTabs.forEach((tab) => {
    const selected = tab.dataset.intelligenceMode === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.classList.toggle("is-active", selected);
  });
  ambientViews.forEach((panel) => {
    panel.hidden = panel.dataset.ambientPanel !== view;
  });
  document.getElementById("ambient-panel")?.classList.toggle("is-history", view === "history");
  if (view === "ambient") renderAmbientPushCards();
  if (view === "history") renderRollbackTrail();
}

function initHistorySnapshots() {
  paper.querySelectorAll(".doc-block").forEach((block) => {
    block.dataset.initialSource = block.dataset.source || "";
    block.dataset.lastCommittedSource = block.dataset.source || "";
  });
}

function seedHistoryTransactions() {
  const metadata = paper.querySelector('[data-block-title="Frontmatter metadata"]');
  const list = paper.querySelector('[data-block-title="知识结构列表"]');
  const math = paper.querySelector('[data-block-title="图算法公式组"]');
  const now = Date.now();
  const entries = [
    metadata && {
      block: metadata,
      label: "规范属性",
      title: "Frontmatter metadata",
      before: "---\ncreated: 2023-10-15 21:45\nupdated: 2023/10/18 21:17\ntags: [#pkm, #information-management, #canvas]\n---",
      after: metadata.dataset.source || "",
      at: now - 92_000,
      restore: () => metadata.querySelectorAll(".tag-chip").forEach((tag) => { tag.textContent = `#${tag.textContent.replace(/^#/, "")}`; }),
    },
    list && {
      block: list,
      label: "重排列表",
      title: "知识结构列表",
      before: "- **树形结构**：承接系统学习、技术专题、书籍章节和项目文档。\n- **网络结构**：承接滑箱笔记、论文旁批、公众号想法和临时判断。\n- **跨库链接**：保留来源、引用和迁移差异。",
      after: list.dataset.source || "",
      at: now - 171_000,
      restore: () => {
        const root = list.querySelector(":scope > ul, :scope > ol");
        if (!root || root.children.length < 2) return;
        root.insertBefore(root.children[1], root.children[0]);
      },
    },
    math && {
      block: math,
      label: "拆分公式",
      title: "图算法公式组",
      before: "$$PR(A)=...; WS(V_i)=...; \\Delta Q=...$$",
      after: math.dataset.source || "",
      at: now - 248_000,
      restore: () => math.querySelector(".math-stack")?.classList.add("is-history-collapsed"),
    },
  ].filter(Boolean);
  rollbackTrail.push(...entries);
  activeHistoryIndex = entries.length ? 0 : null;
}

function runCopilotCommand() {
  const input = document.getElementById("copilot-input");
  const thread = document.getElementById("copilot-thread");
  const command = input?.value.trim();
  if (!command || !thread || !focusedBlock) return showToast("先选择一个块，再输入 Copilot 指令");
  const targetBlock = focusedBlock;
  const userMessage = document.createElement("div");
  userMessage.className = "copilot-message user";
  userMessage.innerHTML = `<span class="copilot-message-label">你</span><p>${escapeHtml(command)}</p>`;
  const assistantMessage = document.createElement("div");
  assistantMessage.className = "copilot-message assistant is-thinking";
  assistantMessage.innerHTML = `<span class="copilot-message-label">Composer</span><p>正在阅读当前块、相邻段落与关联笔记，准备可回滚 patch…</p>`;
  thread.append(userMessage, assistantMessage);
  thread.scrollTop = thread.scrollHeight;
  input.value = "";
  setTimeout(() => {
    assistantMessage.classList.remove("is-thinking");
    assistantMessage._copilotBlock = targetBlock;
    assistantMessage._copilotCommand = command;
    const wantsVisual = /图|示意|visual|diagram|canvas/i.test(command);
    assistantMessage.innerHTML = `
      <span class="copilot-message-label">Copilot · 已准备事务</span>
      <p>结果不会停在对话里。先定位目标，再把候选放回“${escapeHtml(targetBlock.dataset.blockTitle || "当前块")}”原位检查。</p>
      <div class="copilot-change-list">
        <div class="copilot-change-row"><span><small>正文</small><strong>保留原意，补清判断依据与行动落点</strong></span><div><button type="button" data-copilot-artifact="focus"><svg><use href="#i-locate"></use></svg></button><button type="button" data-copilot-apply="rewrite">正文预览</button></div></div>
        ${wantsVisual ? '<div class="copilot-change-row"><span><small>新对象</small><strong>生成可继续编辑的说明图块</strong></span><div><button type="button" data-copilot-apply="visual">生成到正文</button></div></div>' : ""}
      </div>
    `;
    showAiSuggestionCard(targetBlock, {
      label: wantsVisual ? "Copilot 图解" : "Copilot 改写",
      reason: "Copilot 对话运行",
      customText: command,
      trigger: "copilot",
    });
    thread.scrollTop = thread.scrollHeight;
    setLive("Copilot 已生成候选", "结果已回到正文原位流式预览；接受前不会写入 Markdown。 ");
  }, 420);
}

function ambientLinkName(item) {
  return item.title.replace(/\.md$/i, "");
}

function renderAmbientPushCards() {
  if (!ambientPushList || !ambientTheme) return;
  const focusTitle = focusedBlock?.dataset.blockTitle || "当前文档";
  ambientTheme.innerHTML = `
    <div><span><i></i>正在整理</span><button type="button" data-ambient-action="theme-lock" class="${ambientThemeLocked ? "is-locked" : ""}" title="${ambientThemeLocked ? "解锁工作主题" : "锁定工作主题"}"><svg><use href="#i-lock"></use></svg></button></div>
    <strong contenteditable="${ambientThemeLocked ? "false" : "true"}">把分散的知识管理判断整理成可验证的编辑工作流</strong>
    <p>从「${escapeHtml(focusTitle)}」、最近编辑与打开文件中推断 · 置信度 82%</p>
  `;
  const items = ambientPushItems.filter((item) => item.status !== "dismissed");
  if (!items.length) {
    ambientPushList.innerHTML = `<div class="ambient-empty"><strong>这一轮没有待处理的关联</strong><span>被忽略的候选不会再次打断阅读；手动刷新可以重新计算。</span></div>`;
    return;
  }
  const pushMarkup = (item, primary = false) => `
    <article class="ambient-push ambient-push-row${primary ? " is-primary" : ""}${item.status === "linked" ? " is-linked" : ""}${item.status === "opened" ? " is-opened" : ""}">
      <div class="ambient-push-main">
        <div class="ambient-push-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.confidence)}</span></div>
        <p>${escapeHtml(item.detail)}</p>
        <div class="ambient-push-detail"><code>${escapeHtml(item.path)}</code><div class="ambient-signals">${item.signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div></div>
      </div>
      <div class="ambient-push-actions">
        <button type="button" data-ambient-action="open" data-ambient-id="${item.id}"><svg><use href="#i-file"></use></svg>${item.status === "opened" ? "已查看" : "预览"}</button>
        <button type="button" data-ambient-action="link" data-ambient-id="${item.id}"><svg><use href="#i-link"></use></svg>${item.status === "linked" ? "已加入" : "加入正文"}</button>
        <button type="button" data-ambient-action="dismiss" data-ambient-id="${item.id}" title="不再推送"><svg><use href="#i-x"></use></svg></button>
      </div>
    </article>
  `;
  const [primary, ...rest] = items;
  ambientPushList.innerHTML = `${pushMarkup(primary, true)}${rest.length ? `<details class="ambient-push-more"><summary>另外 ${rest.length} 条关联</summary><div>${rest.map((item) => pushMarkup(item)).join("")}</div></details>` : ""}`;
}

function linkAmbientNote(item) {
  const block = focusedBlock;
  if (!block) return showToast("先选择正文中的一个块，再链接关联笔记");
  const target = rewriteTargetFor(block) || block.querySelector(":scope > p, :scope > h1, :scope > h2");
  if (!target) return showToast("这个块没有可写入的正文范围");
  const linkName = ambientLinkName(item);
  if (target.textContent.includes(linkName)) {
    item.status = "linked";
    renderAmbientPushCards();
    return showToast("这条关联已经在当前块里");
  }
  const original = target.innerHTML;
  const chip = document.createElement("span");
  chip.className = "vault-chip";
  chip.textContent = linkName;
  target.append("；参考 ", chip);
  refreshProseSource(block);
  markAccepted(block, `Link ${linkName}`, () => {
    target.innerHTML = original;
    refreshProseSource(block);
  });
  item.status = "linked";
  renderAmbientPushCards();
  setLive("Ambient 已链接", `已把 [[${escapeHtml(linkName)}]] 写入当前正文；这是 Ambient 唯一的显式写入动作，并已进入回滚历史。`);
  showToast(`已链接 [[${linkName}]] · 可回滚`);
}

function handleAmbientAction(action, itemId) {
  if (action === "theme-lock") {
    ambientThemeLocked = !ambientThemeLocked;
    renderAmbientPushCards();
    setLive(ambientThemeLocked ? "工作主题已锁定" : "工作主题可编辑", ambientThemeLocked ? "Ambient 将沿用当前主题。" : "可直接修改主题文本，再手动刷新关联。 ");
    return;
  }
  if (action === "refresh") {
    if (ambientPushLoading) return;
    ambientPushLoading = true;
    setLive("Ambient 正在刷新", "按当前工作主题重新读取 Related Notes；它不会在阅读过程中自动弹出。 ");
    if (ambientPushList) ambientPushList.innerHTML = `<div class="ambient-loading"><span></span><strong>正在比较当前段落、链接与最近上下文…</strong></div>`;
    setTimeout(() => {
      ambientPushLoading = false;
      const first = ambientPushItems.find((item) => item.status !== "dismissed");
      if (first) {
        first.confidence = "强关联";
        first.signals = ["当前主题", "共享标签", "最近上下文"];
      }
      renderAmbientPushCards();
      setLive("Ambient 已刷新", "保留高置信的关联笔记，低置信候选继续收在折叠区，避免打断阅读。 ");
    }, 620);
    return;
  }
  const item = ambientPushItems.find((candidate) => candidate.id === itemId);
  if (!item) return;
  if (action === "open") {
    item.status = "opened";
    renderAmbientPushCards();
    setLive("已打开关联笔记", `“${escapeHtml(item.title)}”会在生产版中交给 Obsidian 的文件打开能力；这里保留它与当前主题的关系。`);
    showToast(`已定位关联笔记：${item.title}`);
    return;
  }
  if (action === "link") return linkAmbientNote(item);
  if (action === "dismiss") {
    item.status = "dismissed";
    renderAmbientPushCards();
    setLive("已忽略 Ambient 候选", `“${escapeHtml(item.title)}”不再出现在本次工作主题的推送中。`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncOpenEditorState(block) {
  if (!block) return;
  const open = block.querySelector(
    ":scope > .insert-strip:not([hidden]), :scope > .comment-editor:not([hidden]), :scope > .insight-panel:not([hidden]), :scope > .block-copy-menu:not([hidden]), :scope > .image-tool-panel:not([hidden]), :scope > .metadata-ai-suggestions:not([hidden]), :scope > .metadata-property-draft, :scope > .vault-property-overlay:not([hidden]), .micro-block > .block-copy-menu:not([hidden]), .ai-menu:not(.block-action-bar):not([hidden])"
  );
  block.classList.toggle("has-open-editor", Boolean(open));
}

function pulseButton(button, block, action) {
  button.classList.add("is-active");
  clearTimeout(button.pulseTimer);
  button.pulseTimer = setTimeout(() => button.classList.remove("is-active"), 520);

  if (action === "insert") {
    block.classList.add("is-inserting");
    clearTimeout(block.insertTimer);
    block.insertTimer = setTimeout(() => block.classList.remove("is-inserting"), 1100);
  }

  if (action === "ai" || action === "ai-table" || action === "ai-image" || action === "ai-native") {
    block.classList.add("is-ai-running");
    clearTimeout(block.aiTimer);
    block.aiTimer = setTimeout(() => block.classList.remove("is-ai-running"), 1200);
  }
}

function blockText(block) {
  const liveText = block?.innerText?.replace(/\s+/g, " ").trim() || "";
  return `${block?.dataset.blockTitle || ""} ${liveText || block?.dataset.source || ""}`.trim();
}

function sourceLines(block) {
  return (block?.dataset.source || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function firstSourceLine(block) {
  return sourceLines(block)[0] || block?.dataset.blockTitle || "";
}

function suggestion(label, reason, detail) {
  return { label, reason, detail };
}

function paragraphSuggestions(block) {
  const text = blockText(block);
  const items = [
    suggestion("润色改写", "普通论述段", "优化这一段的表达顺序、语气和连接词，保持原意和 Markdown 段落形态。"),
  ];

  const judged = matchSignal(text, "question");
  if (judged) {
    items.push(suggestion("提出追问", `已有判断：命中“${judged}”`, "把这一段转成 2-3 个追问，帮助作者判断哪里需要证据、例子或反例。"));
  } else {
    items.push(suggestion("补一个例子", "抽象概念偏多", "补一个贴近 Obsidian/知识库写作的例子，让这段不只停留在原则。"));
  }

  const parallel = matchSignal(text, "table");
  if (parallel) {
    items.push(suggestion("转成表格", `并列信号：命中“${parallel}”`, "把并列概念、阶段或路径整理成 Markdown 表格，便于比较和后续编辑。"));
  }

  const math = matchSignal(text, "formula");
  if (math && items.length < 4) {
    items.push(suggestion("提取公式", `变量/算法：命中“${math}”`, "从段落中提炼公式、变量表或 LaTeX 草稿，先作为候选 patch。"));
  }

  const structural = matchSignal(text, "visual");
  if (structural && items.length < 4) {
    items.push(suggestion("生成示意图", `结构信号：命中“${structural}”`, "直接生成可插入文档的视觉解释图，用来表达路径、流程、闭环或节点关系。"));
  }

  return items.slice(0, 3);
}

function getAiActions(block) {
  const kind = block?.dataset.blockKind || "paragraph";
  const text = blockText(block);

  if (kind === "metadata") {
    return [
      suggestion("补标签", "Frontmatter 可检索", "根据标题和正文补全 tag，但保留原始 YAML 格式。"),
      suggestion("规范属性", "属性字段可结构化", "检查 created/updated/tags 的格式一致性。"),
    ];
  }

  if (kind === "heading-1" || kind === "heading-2") {
    const headingText = block.querySelector(":scope > h1, :scope > h2")?.textContent?.trim()
      || (block.dataset.source || "").replace(/^#+\s*/, "");
    const items = [];
    if (headingText.length > 14) {
      items.push(suggestion("改短标题", `标题偏长（${headingText.length} 字）`, "给出更短、更像目录项的标题候选，并保留 heading 层级。"));
    }
    items.push(suggestion("补提纲", "标题下需要结构", "根据当前标题生成下一层写作提纲或读者会问的问题。"));
    items.push(suggestion("生成导读问题", "适合阅读入口", "把标题转成 2-3 个问题，作为这一节的写作目标。"));
    return items.slice(0, 3);
  }

  if (kind === "paragraph") return paragraphSuggestions(block);

  if (kind === "list") {
    const items = [
      suggestion("补缺项", "列表天然可扩展", "检查列表是否遗漏重要类别，并给出可插入的新 bullet。"),
      suggestion("重排列表", "顺序影响理解", "按信息获取、管理、输出、复盘等逻辑重排当前列表。"),
    ];
    const parallel = matchSignal(text, "table");
    if (parallel) items.push(suggestion("转成表格", `并列字段：命中“${parallel}”`, "把列表转成对比表，适合后续按列补充。"));
    items.push(suggestion("提出问题", "列表缺少判断", "为每个 bullet 生成一个需要继续追问的问题。"));
    return items.slice(0, 3);
  }

  if (kind === "checklist") {
    return [
      suggestion("找阻塞", "待办需要下一步", "把 checklist 里不清晰的项标成阻塞/可执行/待确认。"),
      suggestion("补下一步", "行动项不完整", "为每个待办补一个最小下一步。"),
      suggestion("按优先级重排", "checkbox 可排序", "按影响和紧急度重排 checklist，仍写回 Markdown task list。"),
    ];
  }

  if (kind === "quote") {
    return [
      suggestion("解释引用", "引用需要语境", "解释这句引用在当前文档里的作用。"),
      suggestion("找反例", "观点需要校验", "生成可能反驳这句引用的反例或边界。"),
      suggestion("转 Callout", "可作为提示块", "把引用转成 Obsidian callout，并保留原句。"),
    ];
  }

  if (kind === "callout") {
    return [
      suggestion("改 Callout 类型", "Obsidian 类型可编辑", "把 note/tip/warning 等类型改成更贴合语气的 callout。"),
      suggestion("扩写原则", "提示块较短", "把原则扩成一步可执行的写作规则。"),
      suggestion("生成检查项", "原则可操作化", "把 callout 转成 checklist，便于后续验证。"),
    ];
  }

  if (kind === "math") {
    return [
      suggestion("解释公式", "检测到 LaTeX", "解释变量含义、用途、适用条件，并保留原 LaTeX。"),
      suggestion("拆分公式", "公式较复杂", "拆成变量定义、主公式和文字解释三段。"),
      suggestion("变量表", "符号需要对照", "生成变量含义表，帮助读者从正文理解公式。"),
    ];
  }

  if (kind === "image") {
    return [
      suggestion("生成图注", "图片有上下文", "结合图像、图注和周边段落生成更自然的图注。"),
      suggestion("局部标注", "可在图上解释", "建议标注关键区域，生成非破坏性 annotation patch。"),
      suggestion("生成配图", "图片可再生成", "根据当前图片与相邻文字生成一张真正的可选配图，而不是只输出 prompt。"),
    ];
  }

  if (kind === "image-layout") {
    return [
      suggestion("智能排版", "检测到多图 HTML Block", "根据图片比例和阅读顺序，在网格、主图、横排与叙事布局中给出可审阅建议。"),
      suggestion("统一图注", "多图图注可对齐", "统一四张图片的图注语气，仍分别写回各自 figcaption。"),
      suggestion("调整叙事顺序", "多图存在顺序语义", "只重排 figure，不复制附件，也不把组合展平成一张图片。"),
    ];
  }

  if (kind === "table") {
    return [
      suggestion("总结表格", "结构化数据", "总结表格结论并指出缺失字段。"),
      suggestion("补一列", "表格适合扩展", "推断一个有价值的新列，先展示 Markdown table diff。"),
      suggestion("检查口径", "列名可能混杂", "检查列名、空值和单元格措辞是否一致。"),
    ];
  }

  if (kind === "code") {
    return [
      suggestion("解释源格式", "代码块需要语义", "解释 YAML/Base 查询每一段含义。"),
      suggestion("检查语法", "缩进敏感", "检查缩进、字符串和括号是否容易破坏源格式。"),
      suggestion("生成预览", "代码可渲染", "把源格式转成用户能读懂的预览说明。"),
    ];
  }

  if (kind === "base") {
    return [
      suggestion("生成周报", "Base 是表格视图", "按当前 Base 行总结状态和下一步。"),
      suggestion("补筛选", "Base 有 query", "根据当前文档目标建议一个更窄的筛选条件。"),
      suggestion("生成视图", "适合派生视图", "生成一个新的 Base view 草案。"),
    ];
  }

  if (kind === "canvas") {
    return [
      suggestion("总结节点", "Canvas 有节点和边", "读取节点/边关系，生成正文摘要。"),
      suggestion("补一个节点", "图结构可增量编辑", "先增加一个可预览的 Canvas node，再逐步生成关联 edge。"),
      suggestion("找孤岛", "图结构可检查", "找出未连接或语义跳跃的节点。"),
    ];
  }

  if (kind === "excalidraw") {
    return [
      suggestion("提取流程", "画布像流程图", "从绘图节点提取流程步骤。"),
      suggestion("补一个流程节点", "画布可增量编辑", "先增加一个手绘节点，再逐步生成它的连接线。"),
      suggestion("重排画布", "视觉层级可优化", "建议更清晰的节点分组和箭头方向。"),
    ];
  }

  if (kind === "vault-links") {
    return [
      suggestion("补双链", "段落引用多篇笔记", "根据上下文补充还应链接的笔记，并给出插入位置。"),
      suggestion("检查断链", "检测到失效链接", "列出指向不存在笔记的链接，给出改链或移除建议。"),
      suggestion("生成 MOC 行", "引用可归入索引", "把本段引用整理成一行 MOC 索引条目。"),
    ];
  }

  if (kind === "external-links") {
    return [
      suggestion("转 link card", "外链缺少上下文", "把裸链接转成带标题、域名和摘要的 link card，原 URL 保留在源。"),
      suggestion("抓取摘要", "外部来源未读", "为每个外链生成一句话摘要，并标注抓取时间。"),
      suggestion("核对来源", "引用可信度", "检查域名类型和文档时效，标记需要二次验证的来源。"),
    ];
  }

  if (kind === "footnote") {
    return [
      suggestion("核对出处", "脚注待核对", "根据正文类比定位原始出处，补全引用信息。"),
      suggestion("转尾注段", "脚注可归拢", "把散落脚注合并成文末引用一节，保留 [^n] 语法。"),
      suggestion("升为正文", "脚注信息重要", "把脚注内容改写进正文相关段落。"),
    ];
  }

  if (kind === "embed") {
    return [
      suggestion("展开要点", "嵌入片段可总结", "读取目标笔记片段，生成一句话要点放在嵌入下方。"),
      suggestion("修复锚点", "锚点可能失效", "在目标笔记中重新定位 ^block 锚点并更新引用。"),
      suggestion("改为链接", "嵌入可降级", "把嵌入改成普通 [[链接]]，减少渲染成本。"),
    ];
  }

  if (kind === "attachment") {
    return [
      suggestion("提取要点", "PDF 可解析", "按章节提取 PDF 要点，生成一篇伴随笔记，原文件不动。"),
      suggestion("生成引用", "附件可被引用", "生成规范引用条目（标题、年份、页码占位）。"),
      suggestion("拆章节笔记", "长文档可拆分", "按 PDF 目录拆成多篇章节笔记并互链。"),
    ];
  }

  if (kind === "mermaid") {
    return [
      suggestion("解释流程图", "检测到 Mermaid", "把 flowchart 的节点和边翻译成正文步骤说明。"),
      suggestion("补缺失分支", "图可检查", "对照正文找出流程图缺失的分支或回路。"),
      suggestion("转 Canvas", "图可升级", "把 Mermaid 流程转成 JSON Canvas 草图。"),
    ];
  }


  const actionable = matchSignal(text, "action");
  if (actionable) {
    return [suggestion("提炼行动项", `行动信号：命中“${actionable}”`, "把当前块转成可执行 checklist。")];
  }

  return [suggestion("润色改写", "默认文本操作", "保持 Markdown 源语法，改写表达。")];
}

function findSuggestion(block, label) {
  return getAiActions(block).find((item) => item.label === label) || suggestion(label, "用户主动选择", `针对当前块执行「${label}」。`);
}

const candidateLibrary = {
  "文档标题::改短标题": "PKM 工具链分析：获取 → 管理 → 输出",
  "导语段落::润色改写": "知识库是大脑的延伸：大脑负责思考，知识库负责存储、记忆、检索和组织。真正有效的工具，要让资料、笔记、图谱、表格和输出在同一个工作流里形成闭环。",
  "导语段落::转成表格": "| 角色 | 职责 |\n| --- | --- |\n| 大脑 | 思考、判断 |\n| 知识库 | 存储、记忆、检索、组织 |\n| 工作流 | 让资料到输出形成闭环 |",
  "AI 旁路段落::润色改写": "这里的 AI 不该是一个远处的聊天窗口，而更像贴在当前块旁边的编辑伙伴：它清楚当前块的源范围、也明白它会写成什么语法，这次建议只是一个待确认的 patch，用户接受之前不会真的写回文件。",
  "AI 旁路段落::补充说明段": "为什么多个知识库之间需要 diff 与自动关联？当一个库裂解成多个时，同一主题会分头生长；没有 diff，你看不出它们何时开始分歧；没有自动关联，就会重复记录、彼此失联。",
  "编辑器职责段落::转成表格": "| 场景 | 编辑动作 | 写回目标 |\n| --- | --- | --- |\n| 补一段解释 | 插入段落 | Markdown range |\n| 拆项目成表 | 列表转表格 | pipe table |\n| 段落改行动计划 | AI patch | 审阅后写回 |",
  "PageRank::解释公式": "PR(A)：页面 A 的分数来自所有指向它的页面 i，按各自出链数 L(i) 平摊其 PR 值；d=0.85 是阻尼系数，(1-d)/N 保证没有入链的节点也有基础分。",
  "TextRank::解释公式": "WS(V_i)：节点权重由入边邻居加权投票得出，w_ji 是句子/词的相似度权重，分母对 V_j 的出边权重做归一化——相当于带边权的 PageRank。",
  "Louvain ΔQ::解释公式": "ΔQ：把节点 i 从社区 D 移入社区 C 的模块度增益；k 项衡量 i 与社区内部的连边强度，Σ_tot 是社区总度数，2m 用全图边权归一化。",
  "路线图::生成图注": "从 Auckland 出发、经 Beijing 中转到 Chengdu 与 Qinghe County 的迁移路线：紫色为跨国段，绿色为国内段。",
  "PKM pipeline table::总结表格": "四个阶段构成闭环：获取进 inbox、管理建链接、输出成文章、回顾产出行动项。缺一列“回流动作”说明回顾结果如何回到获取阶段。",
  "PKM Base preview::生成周报": "本周推进：知识库.md、信息管理.md 进入 Manage 阶段并建立主题链接；图谱工具.md、表格工具.md 保持 Reference。下一步：为两个 Reference 项补使用场景。",
  "JSON Canvas preview::总结节点": "画布共 6 节点、5 条边：获取 → inbox → 管理 → 输出 → 回顾构成主链，“复盘更新”边把回顾结果送回管理，形成闭环。",
  "Excalidraw preview::提取流程": "流程：信息获取（RSS / 网页剪藏 / PDF / 播客 / 视频）→ 信息管理（知识库 / 图谱 / 表格工具）→ 信息输出 → 知识回顾。",
  "相关笔记双链段::修复失效链接": "把 [[Z-旧版-PKM分类草稿]] 改链到合并后的 [[Z-10-PKM产品类别分析]]，或移除链接并在脚注说明合并历史。",
  "相关笔记双链段::补双链": "建议补两条：把“表格工具”一句链接到 [[Base 使用判断]]；在“信息管理”后补 [[反向链接实践]]。",
  "外部参考链接段::转 link card": "infranodus.com → “InfraNodus - Text Network Analysis”；heptabase.com → “Heptabase - Visual note-taking”；arxiv 链接生成标题与作者占位。原 URL 全部保留在 Markdown 源。",
  "脚注定义 [^1]::核对出处": "类比出自 2023-10-15《知识库.md》“区分资料库、笔记和大脑”一节；建议脚注补书名与日期，正文保持不动。",
  "脚注 [^1]::核对出处": "类比出自 2023-10-15《知识库.md》“区分资料库、笔记和大脑”一节；建议脚注补书名与日期，正文保持不动。",
  "[[Z-旧版-PKM分类草稿]]::修复失效链接": "把该链接改到合并后的 [[Z-10-PKM产品类别分析]]，或移除链接并在脚注说明合并历史。",
  "[[知识库]]::同步目标要点": "目标笔记要点：知识库是大脑的外部延伸，承担存储 / 记忆 / 检索 / 组织四个职能——可作为本段引用的悬浮摘要。",
  "[[信息管理]]::解释引用关系": "本段引用它是因为“四条找回路径”的分类最早在《信息管理》里提出；建议在链接后加半句说明，避免读者跳转。",
  "infranodus.com::转 link card": "InfraNodus — Text Network Analysis：把文本转成共现网络的分析工具。生成 card 后原 URL 保留在 Markdown 源。",
  "arxiv.org/abs/2104.05006::抓取摘要": "摘要（占位）：一篇关于图结构文本表示的论文；建议保存为文献笔记，并链接到本文“图算法”一节。",
  "嵌入笔记片段::重定位锚点": "在 信息管理.md 中找到原句“区分资料库、笔记和大脑…”，重建 ^pkm-cache 锚点并刷新本处嵌入引用。",
  "嵌入笔记片段::展开要点": "要点：资料库管量、笔记管结构、大脑管判断——三层各自有独立的存取节奏，混在一起会互相拖慢。",
  "PDF 附件::提取要点": "生成伴随笔记 PKM-工具对比调研-2023.md：按章节提取 18 页要点，每条标注页码；原 PDF 不动、不转格式。",
  "PKM 流程 Mermaid::解释流程图": "流程共 5 个节点一条回路：获取 → inbox → 管理 → 输出 → 回顾；回顾经“复盘更新”回到管理。正文第 2 节可直接引用这段解释。",
  "Claim::复核 insight": "该 claim 与 §1 callout“先决定输出，再反推资料组织方式”一致；建议引用 2023-10-15 原始笔记作为来源后标记已确认。",
  "Claim::补来源": "从 2023-10-15 的原始笔记引用“先决定输出，再反推资料组织方式”一句作为来源，写入该 insight 的 provenance.source 字段。",
  "Frontmatter metadata::规范属性": "updated: 2023-10-18 早于正文最后一次编辑；建议更新为当前时间，并把 tags 统一为 kebab-case。",
};

const regeneratedCandidateLibrary = {
  "路线图::生成图注": [
    "迁移路线由 Auckland 启程，经 Beijing 转至 Chengdu 与 Qinghe County；紫色表示跨国航段，绿色表示国内衔接。",
    "路线说明：Auckland → Beijing → Chengdu → Qinghe County。跨国段使用紫色，进入国内后的行程使用绿色。",
  ],
  "PKM pipeline table::总结表格": [
    "这张表描述了一个四阶段循环：资料进入 inbox，随后被组织、输出，并在回顾后形成下一轮行动。当前仍缺少回顾结果如何重新进入获取阶段的说明。",
    "从获取到回顾，四列已经覆盖知识工作的主链；建议补充“回流触发条件”，让闭环不只停留在概念层。",
  ],
};

function listToTable(block) {
  const rows = sourceLines(block)
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const parsed = line.match(/^- \*\*(.+?)\*\*[：:](.*)$/);
      return parsed ? `| ${parsed[1]} | ${parsed[2].trim()} |` : `| ${line.slice(2)} |  |`;
    });
  if (!rows.length) return "";
  return ["| 项目 | 说明 |", "| --- | --- |", ...rows].join("\n");
}

function paragraphToTable(block) {
  const clauses = firstSourceLine(block)
    .split(/[；;。]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .slice(0, 3);
  return ["| 要点 | 内容 |", "| --- | --- |", ...clauses.map((clause, index) => `| 要点 ${index + 1} | ${clause} |`)].join("\n");
}

function buildCandidate(block, item, microTitle, customText, variantIndex = 0) {
  const key = `${microTitle || block.dataset.blockTitle || ""}::${item.label}`;
  const regenerated = variantIndex > 0 && regeneratedCandidateLibrary[key]?.length
    ? regeneratedCandidateLibrary[key][(variantIndex - 1) % regeneratedCandidateLibrary[key].length]
    : "";
  let candidate = regenerated || candidateLibrary[key] || "";
  if (!candidate && customText) candidate = `按指令「${customText}」生成的候选（mock 占位）：${firstSourceLine(block).slice(0, 40)}……`;
  if (item.label === "转成表格") {
    candidate = (block.dataset.blockKind === "list" ? listToTable(block) : "") || paragraphToTable(block);
  }
  if (item.label === "提出追问") {
    candidate = `1. 这一段的结论依赖什么前提？\n2. 有没有反例能推翻“${firstSourceLine(block).slice(0, 24)}…”？`;
  }
  if (item.label === "补一个例子") {
    candidate = "例子：一条播客灵感先进 inbox，再拆进“信息聚合-PKM”主题笔记，最后在周复盘里被引用——原则由此落地。";
  }
  if (item.label === "提取公式") {
    candidate = "候选公式：$score = w_1 \\cdot relevance + w_2 \\cdot recency$\n（变量含义需确认后再写入）";
  }
  if (item.label === "变量表") {
    candidate = "| 符号 | 含义 |\n| --- | --- |\n| d | 阻尼系数 0.85 |\n| N | 节点总数 |\n| L(i) | 页面 i 的出链数 |";
  }
  if (!candidate) candidate = item.detail;
  const isDeterministicShape = ["转成表格", "提取公式", "变量表"].includes(item.label);
  if (customText && !isDeterministicShape && !candidate.startsWith("按指令「")) {
    candidate = `按要求「${customText}」调整：${candidate}`;
  }
  if (variantIndex === 0 || customText) return candidate;
  const angle = variantIndex % 2 === 1 ? "换一种更精简的表达：" : "换一种更强调下一步行动的表达：";
  return `${angle}${candidate}`;
}

/* ---------- word / char-level diff (folded from block-AI mock) ---------- */
function tokenize(text) {
  return text.match(/[一-龥]|[A-Za-z0-9]+|[^\s]|\s+/g) || [];
}

function diffTokens(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: "eq", v: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "del", v: a[i] });
      i++;
    } else {
      out.push({ t: "ins", v: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ t: "del", v: a[i++] });
  while (j < m) out.push({ t: "ins", v: b[j++] });
  const merged = [];
  out.forEach((seg) => {
    const last = merged[merged.length - 1];
    if (last && last.t === seg.t) last.v += seg.v;
    else merged.push({ ...seg });
  });
  return merged;
}

function renderDiff(segs) {
  return segs
    .map((seg) => (seg.t === "eq" ? escapeHtml(seg.v) : seg.t === "del" ? `<del>${escapeHtml(seg.v)}</del>` : `<ins>${escapeHtml(seg.v)}</ins>`))
    .join("");
}

function diffCounts(segs) {
  const del = segs.filter((seg) => seg.t === "del").reduce((sum, seg) => sum + seg.v.length, 0);
  const ins = segs.filter((seg) => seg.t === "ins").reduce((sum, seg) => sum + seg.v.length, 0);
  return { del, ins };
}

/* ---------- rewrite vs insert classification ---------- */
const REWRITE_LABELS = new Set(["润色改写", "改短标题", "扩写原则", "改 Callout 类型"]);

function rewriteTargetFor(block) {
  const kind = block.dataset.blockKind;
  let target = null;
  if (kind === "paragraph") target = block.querySelector(":scope > p");
  else if (kind === "heading-1") target = block.querySelector(":scope > h1");
  else if (kind === "heading-2") target = block.querySelector(":scope > h2");
  else if (kind === "quote") target = block.querySelector(":scope > blockquote");
  else if (kind === "callout") target = block.querySelector(".callout-body");
  if (!target) return null;
  if (target.querySelector(".math-inline, .vault-chip, .ext-chip, .footnote-ref, sup")) return null;
  return target;
}

/* ---------- dismiss any open AI surface (in-place review bar or insert card) ---------- */
function closeAiCards(except) {
  paper.querySelectorAll(".rw-review, .ins-card, .generated-draft, .image-tool-panel[data-image-panel-mode='ai'], .metadata-review, .list-review, .list-to-table-review, .checklist-review, .vault-link-review, .formula-review, .formula-explainer, .formula-extract-review, .native-inline-review").forEach((surface) => {
    if (surface === except) return;
    if (typeof surface._dismiss === "function") surface._dismiss();
  });
}

function updateComposerTransactionControls() {
  const undoEntry = composerUndoStack.at(-1);
  const redoEntry = composerRedoStack.at(-1);
  document.querySelectorAll("[data-transaction-action='undo']").forEach((button) => {
    button.disabled = !undoEntry;
    button.title = undoEntry ? `撤销：${undoEntry.label}（⌘Z / Ctrl+Z）` : "没有可撤销的文档改动";
    button.setAttribute("aria-label", undoEntry ? `撤销 ${undoEntry.label}` : "撤销");
  });
  document.querySelectorAll("[data-transaction-action='redo']").forEach((button) => {
    button.disabled = !redoEntry;
    button.title = redoEntry ? `重做：${redoEntry.label}（⇧⌘Z / Ctrl+Y）` : "没有可重做的文档改动";
    button.setAttribute("aria-label", redoEntry ? `重做 ${redoEntry.label}` : "重做");
  });
}

function showComposerTransactionNotice(state, entry) {
  toast.classList.add("is-transaction");
  toast.innerHTML = `
    <span class="transaction-notice-mark"><svg><use href="#i-check"></use></svg></span>
    <span class="transaction-notice-copy"><strong>${escapeHtml(state)}</strong><small>${escapeHtml(entry?.label || "文档事务")}</small></span>
    <span class="transaction-notice-actions" role="group" aria-label="撤销与重做">
      <button type="button" data-transaction-action="undo">撤销</button>
      <button type="button" data-transaction-action="redo">重做</button>
    </span>`;
  toast.hidden = false;
  updateComposerTransactionControls();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 4600);
}

function recordComposerTransaction(entry) {
  composerUndoStack.push(entry);
  composerRedoStack.length = 0;
  queueMicrotask(() => showComposerTransactionNotice("改动已写入", entry));
}

function removeRollbackTransaction(entry) {
  const index = rollbackTrail.indexOf(entry);
  if (index >= 0) rollbackTrail.splice(index, 1);
  activeHistoryIndex = rollbackTrail.length ? Math.max(0, Math.min(index, rollbackTrail.length - 1)) : null;
}

function focusComposerTransaction(entry) {
  if (!entry?.block || !paper.contains(entry.block)) return;
  setFocusedBlock(entry.block);
  entry.block.classList.add("is-history-located");
  setTimeout(() => entry.block.classList.remove("is-history-located"), 700);
}

function undoComposerTransaction() {
  const entry = composerUndoStack.pop();
  if (!entry) return;
  entry.restore?.();
  entry.block.dataset.source = entry.before;
  entry.block.dataset.lastCommittedSource = entry.before;
  removeRollbackTransaction(entry);
  if (!rollbackTrail.some((other) => other.block === entry.block)) {
    entry.block.classList.remove("has-ai-accepted");
  }
  composerRedoStack.push(entry);
  renderRollbackTrail();
  focusComposerTransaction(entry);
  showComposerTransactionNotice("已撤销", entry);
}

function redoComposerTransaction() {
  const entry = composerRedoStack.pop();
  if (!entry) return;
  entry.reapply?.();
  entry.block.dataset.source = entry.after;
  entry.block.dataset.lastCommittedSource = entry.after;
  entry.block.classList.toggle("has-ai-accepted", entry.provenance !== "user");
  entry.at = Date.now();
  rollbackTrail.unshift(entry);
  activeHistoryIndex = 0;
  composerUndoStack.push(entry);
  renderRollbackTrail();
  focusComposerTransaction(entry);
  showComposerTransactionNotice("已重做", entry);
}

function isNativeUndoTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.matches("input, textarea")) return true;
  if (target.closest("input, textarea, [data-candidate-instruction]")) return true;
  return target.isContentEditable && !target.closest("button, [contenteditable='false']");
}

function initComposerTransactionControls() {
  [toast, sourcebar].forEach((surface) => {
    surface.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-transaction-action]")) return;
      commitDirectEditBatch();
    });
    surface.addEventListener("click", (event) => {
      const action = event.target.closest("[data-transaction-action]")?.dataset.transactionAction;
      if (action === "undo") undoComposerTransaction();
      if (action === "redo") redoComposerTransaction();
    });
  });
  updateComposerTransactionControls();
}

function markAccepted(block, label, restore = null, reapply = null, provenance = "accepted") {
  const aiRunId = block.dataset.aiRunId || null;
  const isAiAccepted = provenance === "ai"
    || (provenance !== "user" && (block.classList.contains("has-ai-card") || block.classList.contains("generated-draft")));
  block.classList.remove("has-ai-card");
  block.classList.toggle("has-ai-accepted", provenance !== "user");
  const before = block.dataset.lastCommittedSource ?? block.dataset.initialSource ?? "";
  const after = block.dataset.source || "";
  const parent = block.parentNode;
  const nextSibling = block.nextSibling;
  const entry = {
    id: `composer-tx-${++composerTransactionSequence}`,
    block,
    label: label || "AI patch",
    title: block.dataset.blockTitle || "当前块",
    restore,
    reapply: reapply || (() => {
      if (paper.contains(block) || !parent) return;
      parent.insertBefore(block, nextSibling?.parentNode === parent ? nextSibling : null);
    }),
    before,
    after,
    provenance,
    at: Date.now(),
  };
  rollbackTrail.unshift(entry);
  recordComposerTransaction(entry);
  block.dataset.lastCommittedSource = after;
  delete block.dataset.aiRunId;
  activeHistoryIndex = 0;
  renderRollbackTrail();
  if (provenance === "user" || isAiAccepted) {
    const stats = historyChangeStats(entry);
    const historyOrigin = isAiAccepted ? "ai" : "user";
    window.PeakIntelligencePanel?.controller("#ambient-panel")?.recordDocumentTransaction({
      id: entry.id,
      title: entry.label,
      target: `${entry.title} · ${stats.scope} · ${stats.changedLines} 行`,
      delta: `+${stats.added} −${stats.removed}`,
      origin: historyOrigin,
      originLabel: isAiAccepted ? "AI 辅助 · 已接受" : "你直接编辑",
      groupId: isAiAccepted ? aiRunId : "composer-session-user-burst",
      groupLabel: isAiAccepted ? "本次块内 AI 写入" : "连续直接编辑",
      before: entry.before,
      after: entry.after,
    });
  }
}

function markAiAccepted(block, item, label, restore = null, reapply = null) {
  if (item?.runId) block.dataset.aiRunId = item.runId;
  markAccepted(block, label || item?.label, restore, reapply, "ai");
}

function refreshDirectEditSource(block) {
  const kind = block?.dataset.blockKind;
  if (kind === "metadata") return refreshMetadataSource(block);
  if (kind === "list") return refreshListSource(block);
  if (kind === "checklist") return refreshChecklistSource(block);
  if (kind === "links") return refreshVaultLinksSource(block);
  if (kind === "math") return refreshMathSource(block);
  if (kind === "table") return refreshTableSource(block, block.querySelector("table"));
  refreshProseSource(block);
}

function directEditUnit(target) {
  if (!(target instanceof Element)) return null;
  if (target.matches("input, textarea") || target.closest("input, textarea")) return null;
  if (target.closest(".rw-review, .generated-draft, .comment-editor, .selection-toolbar, .selection-review, .metadata-property-draft, .image-tool-panel, .table-tool-prompt, .table-formula-editor")) return null;
  const anchorNode = window.getSelection()?.anchorNode;
  const anchorElement = anchorNode?.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode?.parentElement;
  const scope = target === paper && anchorElement ? anchorElement : target;
  const block = scope.closest(".doc-block");
  if (!block || !paper.contains(block)) return null;
  const unit = scope.closest("p, h1, h2, blockquote, li, td, th, .callout-body, .metadata-value");
  if (!unit || !block.contains(unit)) return null;
  return { block, unit };
}

function commitDirectEditBatch() {
  const batch = directEditBatch;
  directEditBatch = null;
  if (!batch) return;
  clearTimeout(batch.timer);
  const afterHTML = batch.unit.innerHTML;
  if (afterHTML === batch.beforeHTML) return;
  refreshDirectEditSource(batch.block);
  const restoreUnit = () => {
    batch.unit.innerHTML = batch.beforeHTML;
    refreshDirectEditSource(batch.block);
  };
  const reapplyUnit = () => {
    batch.unit.innerHTML = afterHTML;
    refreshDirectEditSource(batch.block);
  };
  markAccepted(batch.block, `直接编辑 · ${batch.block.dataset.blockTitle || "当前块"}`, restoreUnit, reapplyUnit, "user");
}

function initDirectEditTransactions() {
  paper.addEventListener("beforeinput", (event) => {
    const target = directEditUnit(event.target);
    if (!target || event.inputType?.startsWith("history")) return;
    if (directEditBatch && directEditBatch.unit !== target.unit) commitDirectEditBatch();
    if (directEditBatch) return;
    directEditBatch = {
      ...target,
      beforeHTML: target.unit.innerHTML,
      timer: 0,
    };
  });
  paper.addEventListener("input", (event) => {
    if (!directEditBatch || event.inputType?.startsWith("history")) return;
    refreshDirectEditSource(directEditBatch.block);
    clearTimeout(directEditBatch.timer);
    directEditBatch.timer = setTimeout(commitDirectEditBatch, 480);
  });
  paper.addEventListener("focusout", (event) => {
    if (!directEditBatch || directEditBatch.unit.contains(event.relatedTarget)) return;
    commitDirectEditBatch();
  });
}

function renderKatexIn(root) {
  if (!window.katex) return;
  root.querySelectorAll("[data-tex]").forEach((node) => {
    katex.render(node.dataset.tex, node, {
      displayMode: node.classList.contains("math-render"),
      throwOnError: false,
      strict: false,
    });
  });
}

function createObjectReview(className, title, detail) {
  const review = document.createElement("div");
  review.className = `${className} is-busy`;
  review.innerHTML = `
    <div class="object-review-head"><span class="rw-dot"></span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>
    <div class="object-review-actions">
      <button type="button" data-object-review="accept"><svg><use href="#i-check"></use></svg>接受</button>
      <button type="button" data-object-review="restore"><svg><use href="#i-undo"></use></svg>还原</button>
    </div>
  `;
  setTimeout(() => review.classList.remove("is-busy"), 260);
  return review;
}

function refreshMetadataSource(block) {
  const grid = block.querySelector(".metadata-grid");
  if (!grid) return;
  const lines = [];
  for (let index = 0; index < grid.children.length; index += 2) {
    const label = grid.children[index];
    const valueNode = grid.children[index + 1];
    const key = label?.childNodes[0]?.textContent?.trim();
    if (!key || !valueNode) continue;
    if (key === "tags") {
      const tags = Array.from(valueNode.querySelectorAll(".tag-chip")).map((tag) => tag.textContent.trim());
      lines.push(`tags: [${tags.join(", ")}]`);
      continue;
    }
    lines.push(`${key}: ${valueNode.textContent.trim()}`);
  }
  block.dataset.source = `---\n${lines.join("\n")}\n---`;
  if (focusedBlock === block) setFocusedBlock(block);
}

function refreshProseSource(block) {
  const target = rewriteTargetFor(block) || block.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > blockquote");
  if (!target) return;
  const clone = target.cloneNode(true);
  clone.querySelectorAll(".vault-chip").forEach((chip) => chip.replaceWith(`[[${chip.textContent.trim().replace(/^\[\[|\]\]$/g, "")}]]`));
  clone.querySelectorAll(".rw-review, .ai-caret").forEach((node) => node.remove());
  block.dataset.source = clone.textContent.replace(/\s+/g, " ").trim();
  if (focusedBlock === block) setFocusedBlock(block);
}

function refreshListSource(block) {
  const list = block.querySelector(":scope > ul, :scope > ol");
  if (!list) return;
  const lines = Array.from(list.children).map((item) => {
    const clone = item.cloneNode(true);
    clone.querySelector(".list-order-shift")?.remove();
    return `- ${clone.textContent.trim()}`;
  });
  block.dataset.source = lines.join("\n");
  if (focusedBlock === block) setFocusedBlock(block);
}

function refreshMathSource(block) {
  const tex = Array.from(block.querySelectorAll(".math-card > .math-render"))
    .map((node) => node.dataset.tex)
    .filter(Boolean);
  if (!tex.length) return;
  block.dataset.source = tex.map((value) => `$$${value}$$`).join("\n\n");
  if (focusedBlock === block) setFocusedBlock(block);
}

function runMetadataPatch(block, item) {
  closeAiCards();
  const grid = block.querySelector(".metadata-grid");
  if (!grid) return runInsert(block, block, item);
  block.classList.add("has-ai-card", "is-ai-running");
  const review = createObjectReview("metadata-review", item.label, "候选直接标在对应 Frontmatter 字段中");
  grid.after(review);

  if (item.label === "补标签") {
    const tagRow = grid.querySelector(".tag-row");
    const proposed = ["markdown-editing", "ai-assisted"].map((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip is-proposed";
      chip.textContent = tag;
      tagRow.appendChild(chip);
      return chip;
    });
    review._dismiss = () => {
      proposed.forEach((chip) => chip.remove());
      review.remove();
      block.classList.remove("has-ai-card", "is-ai-running");
    };
    review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
    review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
      proposed.forEach((chip) => chip.classList.remove("is-proposed"));
      review.remove();
      block.classList.remove("is-ai-running");
      refreshMetadataSource(block);
      markAiAccepted(block, item, item.label, () => {
        proposed.forEach((chip) => chip.remove());
        refreshMetadataSource(block);
      });
      setLive("标签已补全", "候选标签已写入 tags 行；接受前后都保持 Frontmatter YAML 的原始结构。 ");
    });
    setLive("补标签", "候选标签直接出现在 tags 行中：虚线绿色表示尚未写入，接受后成为普通标签。 ");
    return;
  }

  const cells = Array.from(grid.children);
  const updatedLabel = cells.find((cell) => cell.textContent.trim() === "updated");
  const updatedValue = updatedLabel?.nextElementSibling;
  if (!updatedValue) return review.remove();
  const original = updatedValue.textContent.trim();
  const candidate = "2026-07-11 09:40";
  const issue = block.querySelector('.issue-pill[data-ai-label="规范属性"]');
  const issueParent = issue?.parentNode || null;
  const issueNext = issue?.nextSibling || null;
  updatedValue.innerHTML = `<del>${escapeHtml(original)}</del><ins>${candidate}</ins>`;
  review._dismiss = () => {
    updatedValue.textContent = original;
    review.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    updatedValue.textContent = candidate;
    issue?.remove();
    review.remove();
    block.classList.remove("is-ai-running");
    refreshMetadataSource(block);
    markAiAccepted(block, item, item.label, () => {
      updatedValue.textContent = original;
      if (issue && issueParent && !issue.isConnected) issueParent.insertBefore(issue, issueNext);
      refreshMetadataSource(block);
    });
    setLive("属性已规范", "updated 已原地更新，属性告警随写入消失；原 YAML 可从 Ambient 回滚。 ");
  });
  setLive("规范属性", "updated 字段原地展示红删绿增；接受后才更新 Frontmatter 并清除这条告警。 ");
}

function runListPatch(block, item) {
  closeAiCards();
  const list = block.querySelector(":scope > ul, :scope > ol");
  if (!list) return runInsert(block, block, item);
  block.classList.add("has-ai-card", "is-ai-running");
  const review = createObjectReview("list-review", item.label, "候选直接作用于当前列表，不额外生成一段说明文字");
  list.after(review);

  if (item.label === "补缺项") {
    const candidate = document.createElement("li");
    candidate.className = "ai-proposed-item";
    candidate.innerHTML = "<strong>主题索引</strong>：把跨库链接汇总到一个可回访的 MOC，记录来源、迁移和后续动作。";
    list.appendChild(candidate);
    review._dismiss = () => {
      candidate.remove();
      review.remove();
      block.classList.remove("has-ai-card", "is-ai-running");
    };
    review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
    review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
      candidate.classList.remove("ai-proposed-item");
      review.remove();
      block.classList.remove("is-ai-running");
      refreshListSource(block);
      markAiAccepted(block, item, item.label, () => {
        candidate.remove();
        refreshListSource(block);
      });
      setLive("列表已补项", "新 bullet 已写进当前 Markdown 列表的末尾，可通过 Ambient 回滚。 ");
    });
    setLive("补缺项", "候选已经以一个真实 bullet 出现在列表末尾；绿色虚线表示尚未写入。 ");
    return;
  }

  const originalList = list.cloneNode(true);
  const ordered = Array.from(list.children);
  if (ordered.length > 2) [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
  else ordered.reverse();
  const candidateList = list.cloneNode(false);
  ordered.forEach((node) => candidateList.appendChild(node.cloneNode(true)));
  candidateList.classList.add("suggested-list");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`
    <section class="list-transform-candidate"><span>建议顺序</span></section>
  `));
  review.querySelector(".list-transform-candidate").appendChild(candidateList);
  review._dismiss = () => {
    review.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    candidateList.classList.remove("suggested-list");
    list.replaceWith(candidateList);
    review.remove();
    block.classList.remove("is-ai-running");
    refreshListSource(block);
    markAiAccepted(block, item, item.label, () => {
      candidateList.replaceWith(originalList);
      refreshListSource(block);
    });
    setLive("列表已重排", "建议顺序已经原地替换旧列表，仍然只写回一条 Markdown list。 ");
  });
  setLive("重排列表", "真实列表保持原位且只出现一次；下方只展示建议顺序，接受后才原地替换。 ");
}

function listRowsForTable(list) {
  return Array.from(list.children).map((item) => {
    const text = item.textContent.replace(/\s+/g, " ").trim();
    const match = text.match(/^(.+?)[：:](.+)$/);
    const label = match ? match[1].trim() : text;
    const detail = match ? match[2].trim() : "待补充";
    const action = /网络/.test(label) ? "用双链回访相关判断" : /树形/.test(label) ? "按课程或项目沉淀" : "保留来源、引用和迁移记录";
    return [label, detail, action];
  });
}

function tableFromRows(rows) {
  const table = document.createElement("table");
  table.className = "composer-table suggested-table";
  table.innerHTML = `<thead><tr><th>结构</th><th>适用内容</th><th>后续动作</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td contenteditable="true">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return table;
}

function refreshTableSource(block, tableNode) {
  const formulaSource = block.dataset.tableFormula ? `\n<!-- TBLFM: ${block.dataset.tableFormula} -->` : "";
  const complex = Array.from(tableNode.querySelectorAll("th, td"))
    .some((cell) => cell.colSpan > 1 || cell.rowSpan > 1);
  if (complex) {
    const serializeSection = (name, section) => {
      if (!section) return "";
      const rows = Array.from(section.rows).map((row) => {
        const cells = Array.from(row.cells).map((cell) => {
          const tag = cell.tagName.toLowerCase();
          const span = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""}`;
          const alignment = cell.style.textAlign ? ` style="text-align: ${cell.style.textAlign}"` : "";
          return `    <${tag}${span}${alignment}>${escapeHtml(cell.textContent.trim())}</${tag}>`;
        }).join("\n");
        return `  <tr>\n${cells}\n  </tr>`;
      }).join("\n");
      return `<${name}>\n${rows}\n</${name}>`;
    };
    block.dataset.source = `<table>\n${serializeSection("thead", tableNode.tHead)}\n${serializeSection("tbody", tableNode.tBodies[0])}\n</table>${formulaSource}`;
    block.dataset.tableSourceMode = "html";
    if (focusedBlock === block) setFocusedBlock(block);
    return;
  }
  const rows = Array.from(tableNode.querySelectorAll("tr")).map((row) => Array.from(row.cells).map((cell) => cell.textContent.trim()));
  if (!rows.length) return;
  const separators = rows[0].map((_, index) => {
    const alignment = tableNode.dataset[`align${index}`] || "left";
    if (alignment === "center") return ":---:";
    if (alignment === "right") return "---:";
    return "---";
  });
  block.dataset.source = [
    `| ${rows[0].join(" | ")} |`,
    `| ${separators.join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n") + formulaSource;
  block.dataset.tableSourceMode = "markdown";
  if (focusedBlock === block) setFocusedBlock(block);
}

function runListToTable(block, item) {
  closeAiCards();
  const list = block.querySelector(":scope > ul, :scope > ol");
  if (!list) return runInsert(block, block, item);
  const originalListSnapshot = list.cloneNode(true);
  const candidateTable = tableFromRows(listRowsForTable(list));
  const review = createObjectReview("list-to-table-review", item.label, "原列表保留在原位；这里只审阅准备替换它的 Markdown 表格");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`
    <section class="table-transform-candidate"><span>建议表格</span></section>
  `));
  review.querySelector(".table-transform-candidate").appendChild(candidateTable);
  list.after(review);
  block.classList.add("has-ai-card", "is-ai-running");
  review._dismiss = () => {
    review.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  review.querySelector('[data-object-review="restore"]').textContent = "保留原列表";
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').textContent = "替换为表格";
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    list.replaceWith(candidateTable);
    review.remove();
    block.classList.remove("is-ai-running");
    refreshTableSource(block, candidateTable);
    markAiAccepted(block, item, item.label, () => {
      candidateTable.replaceWith(originalListSnapshot);
      refreshListSource(block);
    });
    setLive("列表已转为表格", "候选表格已原地替换原列表，三列按结构、适用内容和下一步动作组织，仍可编辑并写回 pipe table。 ");
  });
  setLive("转成表格", "真实列表只保留一份；下方只展示候选表格，接受时才原地替换并写回 Markdown table。 ");
}

function refreshChecklistSource(block) {
  const taskList = block.querySelector(":scope > .task-list");
  if (!taskList) return;
  block.dataset.source = Array.from(taskList.querySelectorAll(":scope > label")).map((label) => `- [${label.querySelector("input")?.checked ? "x" : " "}] ${label.querySelector("span")?.textContent.trim() || ""}`).join("\n");
  if (focusedBlock === block) setFocusedBlock(block);
}

function runChecklistReorder(block, item) {
  closeAiCards();
  const taskList = block.querySelector(":scope > .task-list");
  if (!taskList) return runInsert(block, block, item);
  const original = taskList.cloneNode(true);
  const candidate = taskList.cloneNode(false);
  const labels = Array.from(taskList.children).map((node) => node.cloneNode(true));
  labels.sort((a, b) => Number(a.querySelector("input")?.checked) - Number(b.querySelector("input")?.checked));
  labels.forEach((label) => candidate.appendChild(label));
  candidate.classList.add("suggested-checklist");
  taskList.classList.add("is-review-original");
  const review = createObjectReview("checklist-review", item.label, "把行动项按未完成优先、可执行性与依赖关系重排");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`<div class="list-compare"><section class="list-compare-original"><span>原 checklist</span></section><span class="list-compare-arrow">→</span><section class="list-compare-suggested"><span>建议优先级</span></section></div>`));
  review.querySelector(".list-compare-original").appendChild(original);
  review.querySelector(".list-compare-suggested").appendChild(candidate);
  taskList.after(review);
  block.classList.add("has-ai-card", "is-ai-running");
  review._dismiss = () => { taskList.classList.remove("is-review-original"); review.remove(); block.classList.remove("has-ai-card", "is-ai-running"); };
  review.querySelector('[data-object-review="restore"]').textContent = "保留原顺序";
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').textContent = "应用顺序";
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    taskList.replaceWith(candidate);
    review.remove();
    block.classList.remove("is-ai-running");
    refreshChecklistSource(block);
    markAiAccepted(block, item, item.label, () => { candidate.replaceWith(original); refreshChecklistSource(block); });
    setLive("Checklist 已重排", "建议顺序已经原地替换；仍然保持原生 Markdown task list，并可逐项勾选。 ");
  });
  setLive("按优先级重排", "原 checklist 在上、建议顺序在下，接受后只保留重排后的 task list。 ");
}

function refreshVaultLinksSource(block) {
  const paragraph = block.querySelector(":scope > p");
  if (!paragraph) return;
  const clone = paragraph.cloneNode(true);
  clone.querySelectorAll(".vault-chip").forEach((chip) => chip.replaceWith(chip.textContent));
  block.dataset.source = clone.textContent.replace(/\s+/g, " ").trim();
  if (focusedBlock === block) setFocusedBlock(block);
}

function runVaultLinkPatch(block, item) {
  closeAiCards();
  const paragraph = block.querySelector(":scope > p");
  if (!paragraph) return runInsert(block, block, item);
  const original = paragraph.innerHTML;
  const stale = paragraph.querySelector(".vault-chip.is-stale");
  const review = createObjectReview("vault-link-review", item.label, "候选直接改在链接出现的位置，接受前以红删绿增显示");
  paragraph.after(review);
  block.classList.add("has-ai-card", "is-ai-running");
  if (item.label === "补双链") {
    const proposed = document.createElement("span");
    proposed.className = "vault-chip is-proposed";
    proposed.textContent = "[[Base 使用判断]]";
    paragraph.append("；另见 ", proposed, "，用于判断何时由普通表格升级到 Base。");
  } else if (stale) {
    stale.outerHTML = `<del class="vault-chip is-stale">[[Z-旧版-PKM分类草稿]]</del><ins class="vault-chip is-fixed">[[Z-10-PKM产品类别分析]]</ins>`;
  }
  review._dismiss = () => { paragraph.innerHTML = original; review.remove(); block.classList.remove("has-ai-card", "is-ai-running"); };
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    paragraph.querySelectorAll(".vault-chip.is-proposed").forEach((chip) => chip.classList.remove("is-proposed"));
    paragraph.querySelectorAll("ins.vault-chip").forEach((chip) => chip.replaceWith(Object.assign(document.createElement("span"), { className: "vault-chip", textContent: chip.textContent })));
    paragraph.querySelectorAll("del.vault-chip").forEach((chip) => chip.remove());
    block.querySelector('.issue-pill[data-ai-label="修复失效链接"]')?.remove();
    review.remove();
    block.classList.remove("is-ai-running");
    refreshVaultLinksSource(block);
    markAiAccepted(block, item, item.label, () => { paragraph.innerHTML = original; refreshVaultLinksSource(block); });
    setLive("双链已原地更新", "链接文本、状态与 Markdown 源已经同步改变；不再在块下方单独写一段“建议补链”。 ");
  });
  setLive(item.label, "链接候选已经在原段落中显示：接受后直接改变 [[wikilink]] 源，拒绝后恢复原句。 ");
}

function formulaProfile(micro) {
  const title = micro.dataset.microTitle || "公式";
  if (title === "TextRank") {
    return {
      primary: "WS(V_i)=(1-d)+d\\sum_{V_j\\in In(V_i)}C(V_j,V_i)",
      steps: [
        { label: "邻居贡献", tex: "C(V_j,V_i)=\\frac{w_{ji}}{Z_j}WS(V_j)" },
        { label: "归一化分母", tex: "Z_j=\\sum_{V_k\\in Out(V_j)}w_{jk}" },
      ],
      terms: [
        ["WS(V_i)", "节点 i 的最终权重", "textrank-score", "输出"],
        ["d", "阻尼系数；1-d 是随机跳转留下的基础权重", "damping", "共享参数"],
        ["w_{ji}", "j 指向 i 的相似度权重", "similarity-weight", "边权"],
        ["Z_j", "节点 j 的全部出边权重之和", "textrank-normalizer", "归一化"],
      ],
    };
  }
  if (title === "Louvain ΔQ") {
    return {
      primary: "\\Delta Q=\\frac{k_{i,inC}-k_{i,inD}}{2m}-\\frac{k_i(\\Sigma_{totC}-\\Sigma_{totD})}{(2m)^2}",
      steps: [
        { label: "局部连边增益", tex: "\\frac{k_{i,inC}-k_{i,inD}}{2m}" },
        { label: "全局度数校正", tex: "\\frac{k_i(\\Sigma_{totC}-\\Sigma_{totD})}{(2m)^2}" },
      ],
      terms: [
        ["\\Delta Q", "节点 i 移动带来的模块度变化", "louvain-gain", "输出"],
        ["k_{i,inC}", "i 与目标社区 C 的内部连边", "louvain-inner-edge", "局部量"],
        ["\\Sigma_{totC}", "社区 C 的总度数", "louvain-community-degree", "社区量"],
        ["2m", "全图总边权，用于归一化", "louvain-total-weight", "全局量"],
      ],
    };
  }
  return {
    primary: "PR(A)=B+V(A)",
    steps: [
      { label: "基础概率 B", tex: "B=\\frac{1-d}{N}" },
      { label: "入链投票 V(A)", tex: "V(A)=d\\sum_{i\\in In(A)}\\frac{PR(i)}{L(i)}" },
    ],
    terms: [
      ["PR(A)", "页面 A 的重要性", "pagerank-score", "输出"],
      ["d", "阻尼系数，通常取 0.85", "damping", "共享参数"],
      ["In(A)", "所有指向 A 的节点", "pagerank-incoming", "结构"],
      ["L(i)", "节点 i 的出链数量", "pagerank-outdegree", "归一化"],
    ],
  };
}

function formulaDetailKey(label) {
  if (label === "解释公式") return "explain";
  if (label === "拆分公式") return "split";
  if (label === "变量表") return "variables";
  return label;
}

function syncFormulaMicroActive(micro) {
  micro.classList.toggle("is-micro-active", Boolean(micro.querySelector(":scope > [data-formula-detail]")));
}

function focusExistingFormulaDetail(micro, key) {
  const existing = micro.querySelector(`:scope > [data-formula-detail="${key}"]`);
  if (!existing) return null;
  existing.scrollIntoView({ block: "nearest", behavior: "smooth" });
  existing.classList.remove("is-located");
  requestAnimationFrame(() => existing.classList.add("is-located"));
  setTimeout(() => existing.classList.remove("is-located"), 700);
  existing.querySelector("[data-candidate-instruction]")?.focus();
  setLive("公式详细视图", `${micro.dataset.microTitle} 的「${existing.dataset.formulaDetailLabel}」已经展开；同公式与其他公式的详细视图都保持不变。`);
  return existing;
}

function formulaDetailGuidance(instruction) {
  if (!instruction) return "";
  return `<div class="formula-detail-guidance"><svg><use href="#i-spark"></use></svg><span>按「${escapeHtml(instruction)}」调整此版本</span></div>`;
}

function createFormulaDetailReview(block, micro, item, {
  className,
  detail,
  acceptLabel,
  updateLabel = acceptLabel,
  buildVariant,
  onAccept,
}) {
  const key = formulaDetailKey(item.label);
  const existing = focusExistingFormulaDetail(micro, key);
  if (existing) return existing;

  const review = createObjectReview(className, `${micro.dataset.microTitle} · ${item.label}`, detail);
  review.classList.add("formula-detail-review");
  review.dataset.formulaDetail = key;
  review.dataset.formulaDetailLabel = item.label;

  const body = document.createElement("div");
  body.className = "formula-detail-body";
  review.querySelector(".object-review-head").after(body);

  const actions = review.querySelector(".object-review-actions");
  actions.classList.add("formula-detail-controls");
  actions.innerHTML = `
    ${candidateInstructionHTML("formula-detail-instruction")}
    <button type="button" data-formula-review="history" aria-label="查看 AI 版本历史" title="查看 AI 版本历史"><svg><use href="#i-history"></use></svg></button>
    <div class="formula-detail-version-nav" aria-label="公式详细视图版本" hidden>
      <button type="button" data-formula-review="previous" aria-label="上一版" title="上一版" disabled><svg><use href="#i-chevron-left"></use></svg></button>
      <span data-formula-version>1 / 1</span>
      <button type="button" data-formula-review="next" aria-label="下一版" title="下一版" disabled><svg><use href="#i-chevron-right"></use></svg></button>
    </div>
    <button type="button" data-formula-review="accept"><svg><use href="#i-check"></use></svg><span>${escapeHtml(acceptLabel)}</span></button>
    <button type="button" data-formula-review="regenerate"><svg><use href="#i-refresh"></use></svg><span>重新生成</span></button>
    <button type="button" data-formula-review="close">关闭</button>`;
  const history = document.createElement("div");
  history.className = "formula-detail-history";
  history.hidden = true;
  actions.after(history);

  const variants = [buildVariant(0, "")];
  let activeVariant = 0;
  let acceptedVariant = -1;
  const headerDetail = review.querySelector(".object-review-head small");
  const versionNavigation = review.querySelector(".formula-detail-version-nav");
  const versionLabel = review.querySelector("[data-formula-version]");
  const previousButton = review.querySelector('[data-formula-review="previous"]');
  const nextButton = review.querySelector('[data-formula-review="next"]');
  const acceptButton = review.querySelector('[data-formula-review="accept"]');
  const regenerateButton = review.querySelector('[data-formula-review="regenerate"]');

  const setAcceptState = () => {
    const accepted = activeVariant === acceptedVariant;
    const label = accepted ? "已保留" : acceptedVariant >= 0 ? updateLabel : acceptLabel;
    acceptButton.disabled = accepted;
    acceptButton.innerHTML = `<svg><use href="#i-check"></use></svg><span>${escapeHtml(label)}</span>`;
  };

  const renderHistory = () => {
    history.innerHTML = `
      <div class="formula-detail-history-head"><strong>AI 版本</strong><small>${variants.length} 个候选</small></div>
      <div class="formula-detail-history-list">
        ${variants.map((variant, index) => `
          <button type="button" data-formula-version-index="${index}" class="${index === activeVariant ? "is-active" : ""}">
            <span>V${index + 1}</span>
            <small>${escapeHtml(variant.instruction || (index === 0 ? "首次生成" : "重新生成"))}</small>
            ${index === acceptedVariant ? '<svg aria-label="已保留"><use href="#i-check"></use></svg>' : ""}
          </button>`).join("")}
      </div>`;
  };

  const updateControls = () => {
    versionLabel.textContent = `${activeVariant + 1} / ${variants.length}`;
    versionNavigation.hidden = variants.length <= 1;
    previousButton.disabled = activeVariant <= 0;
    nextButton.disabled = activeVariant >= variants.length - 1;
    setAcceptState();
    renderHistory();
  };

  const showVariant = (index) => {
    const variant = variants[index];
    if (!variant) return;
    activeVariant = index;
    body.innerHTML = variant.bodyHTML;
    headerDetail.textContent = variant.instruction
      ? `${detail} · 版本 ${index + 1}/${variants.length} · 按「${variant.instruction}」调整`
      : `${detail} · 版本 ${index + 1}/${variants.length}`;
    review.classList.remove("is-busy", "is-regenerating");
    renderKatexIn(body);
    updateControls();
  };

  const setBusy = (instruction) => {
    review.classList.add("is-busy", "is-regenerating");
    body.innerHTML = `<div class="formula-detail-regenerating"><span></span><span></span><small>${instruction ? `正在按「${escapeHtml(instruction)}」调整…` : "正在重新生成…"}</small></div>`;
    acceptButton.disabled = true;
    regenerateButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
  };

  const regenerate = () => {
    if (review.classList.contains("is-regenerating")) return;
    const instruction = review.querySelector("[data-candidate-instruction]")?.value.trim() || "";
    const variant = buildVariant(variants.length, instruction);
    setBusy(instruction);
    clearTimeout(review._formulaTimer);
    review._formulaTimer = setTimeout(() => {
      if (!review.isConnected) return;
      variants.push(variant);
      activeVariant = variants.length - 1;
      regenerateButton.disabled = false;
      showVariant(activeVariant);
      setLive(`${micro.dataset.microTitle} · ${item.label}`, instruction
        ? `已按「${escapeHtml(instruction)}」生成版本 ${variants.length}；其他公式详细视图没有关闭。`
        : `已生成版本 ${variants.length}；可继续输入要求或切换历史版本。`);
    }, 560);
  };

  review._dismiss = () => {
    clearTimeout(review._formulaTimer);
    review.remove();
    syncFormulaMicroActive(micro);
  };
  review._formulaVariants = variants;
  review._showFormulaVariant = showVariant;

  actions.addEventListener("click", (event) => {
    const action = event.target.closest("[data-formula-review]")?.dataset.formulaReview;
    if (!action) return;
    if (action === "close") {
      review._dismiss();
      return;
    }
    if (action === "regenerate") {
      regenerate();
      return;
    }
    if (action === "previous") {
      showVariant(activeVariant - 1);
      return;
    }
    if (action === "next") {
      showVariant(activeVariant + 1);
      return;
    }
    if (action === "history") {
      history.hidden = !history.hidden;
      return;
    }
    if (action !== "accept" || acceptButton.disabled) return;
    const shouldRemove = onAccept?.({ review, variant: variants[activeVariant], variantIndex: activeVariant }) === true;
    if (shouldRemove || !review.isConnected) return;
    acceptedVariant = activeVariant;
    review.classList.add("is-pinned");
    updateControls();
  });
  review.querySelector("[data-candidate-instruction]").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    regenerate();
  });
  history.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-formula-version-index]");
    if (!choice) return;
    showVariant(Number(choice.dataset.formulaVersionIndex));
    history.hidden = true;
  });

  micro.appendChild(review);
  syncFormulaMicroActive(micro);
  markEditorChrome(review);
  showVariant(0);
  setLive(item.label, `${micro.dataset.microTitle} 的${item.label}已在当前公式内展开；解释、拆分和变量表可同时保留。`);
  return review;
}

function runFormulaSplit(block, micro, item) {
  const render = micro.querySelector(".math-render");
  if (!render) return;
  const originalTex = render.dataset.tex;
  const profile = formulaProfile(micro);
  return createFormulaDetailReview(block, micro, item, {
    className: "formula-review",
    detail: "原式在上，拆分后的可渲染公式在下",
    acceptLabel: "应用拆分",
    updateLabel: "应用此版本",
    buildVariant: (variantIndex, instruction) => ({
      instruction,
      primary: profile.primary,
      steps: profile.steps,
      bodyHTML: `
        ${formulaDetailGuidance(instruction)}
        <div class="formula-compare">
          <section><span>原公式</span><div class="math-render formula-old" data-tex="${escapeHtml(originalTex)}"></div></section>
          <div class="formula-arrow">→</div>
          <section><span>拆分后</span><div class="math-render" data-tex="${escapeHtml(profile.primary)}"></div>${profile.steps.map((step, index) => `<div class="formula-step"><small>${escapeHtml(step.label)}${instruction && index === 0 ? " · AI 调整" : ""}</small><div class="math-render" data-tex="${escapeHtml(step.tex)}"></div></div>`).join("")}</section>
        </div>`,
    }),
    onAccept: ({ review, variant, variantIndex }) => {
      render.dataset.tex = variant.primary;
      renderKatexIn(micro);
      const breakdown = document.createElement("div");
      breakdown.className = "formula-breakdown";
      breakdown.innerHTML = variant.steps.map((step) => `<div><small>${escapeHtml(step.label)}</small><div class="math-render" data-tex="${escapeHtml(step.tex)}"></div></div>`).join("");
      render.after(breakdown);
      renderKatexIn(breakdown);
      review._dismiss();
      refreshMathSource(block);
      markAiAccepted(block, item, `${micro.dataset.microTitle} · ${item.label} · v${variantIndex + 1}`, () => {
        render.dataset.tex = originalTex;
        renderKatexIn(micro);
        breakdown.remove();
        refreshMathSource(block);
      });
      setLive("公式已拆分", "当前候选已在原公式位置写回；其他已展开的公式解释和变量表继续保留。");
      return true;
    },
  });
}

function runFormulaExplain(block, micro, item) {
  const profile = formulaProfile(micro);
  return createFormulaDetailReview(block, micro, item, {
    className: "formula-explainer",
    detail: "符号沿箭头展开，保留公式上下文",
    acceptLabel: "保留注释",
    updateLabel: "更新注释",
    buildVariant: (variantIndex, instruction) => ({
      instruction,
      bodyHTML: `
        ${formulaDetailGuidance(instruction)}
        <div class="formula-term-map">
          ${profile.terms.map(([symbol, description], index) => `
            <div class="formula-term">
              <span class="formula-term-index">${index + 1}</span>
              <div class="math-inline" data-tex="${escapeHtml(symbol)}"></div>
              <span class="formula-term-arrow">→</span>
              <p>${escapeHtml(description)}${instruction ? `；按「${escapeHtml(instruction)}」重新表述。` : ""}</p>
            </div>`).join("")}
        </div>`,
    }),
    onAccept: ({ review, variantIndex }) => {
      markAiAccepted(block, item, `${micro.dataset.microTitle} · ${item.label} · v${variantIndex + 1}`, review._dismiss);
      setLive("公式注释已保留", "当前解释版本已保留；仍可继续输入要求生成新版本，且不会关闭其他公式详细视图。");
      return false;
    },
  });
}

function formulaVariableRecord(micro) {
  const profile = formulaProfile(micro);
  return {
    name: micro.dataset.microTitle || "公式",
    tex: micro.querySelector(":scope > .math-render")?.dataset.tex || profile.primary,
    terms: profile.terms.map(([symbol, description, key, role]) => ({
      symbol,
      description,
      key: key || `${micro.dataset.microTitle}-${symbol}`,
      role: role || "变量",
    })),
  };
}

function runFormulaVariableTable(block, micro, item) {
  const record = formulaVariableRecord(micro);
  return createFormulaDetailReview(block, micro, item, {
    className: "formula-explainer formula-variable-table",
    detail: `当前公式 · ${record.terms.length} 个变量 · 未写入 Markdown`,
    acceptLabel: "保留注释",
    updateLabel: "更新注释",
    buildVariant: (variantIndex, instruction) => ({
      instruction,
      bodyHTML: `
        ${formulaDetailGuidance(instruction)}
        <section class="formula-variable-group" data-formula-name="${escapeHtml(record.name)}">
          <header>
            <div><span class="formula-group-dot"></span><strong>${escapeHtml(record.name)}</strong><small>${record.terms.length} 个变量</small></div>
            <div class="math-inline formula-group-preview" data-tex="${escapeHtml(record.tex)}"></div>
          </header>
          <div class="formula-variable-rows">
            ${record.terms.map((term) => `
              <div class="formula-variable-row">
                <div class="formula-variable-symbol"><div class="math-inline" data-tex="${escapeHtml(term.symbol)}"></div><span>${escapeHtml(term.role)}</span></div>
                <p>${escapeHtml(term.description)}${instruction ? `；补充要求：${escapeHtml(instruction)}。` : ""}</p>
              </div>`).join("")}
          </div>
        </section>`,
    }),
    onAccept: ({ review, variantIndex }) => {
      markAiAccepted(block, item, `${record.name} · 变量表 · v${variantIndex + 1}`, review._dismiss);
      setLive("变量表已保留", `${record.name} 的当前变量说明版本已保留；仍可继续生成新版本。`);
      return false;
    },
  });
}

function runExtractedFormula(block, item) {
  closeAiCards();
  const target = block.querySelector(":scope > p");
  if (!target) return runInsert(block, block, item);
  const tex = "score=w_1\\cdot relevance+w_2\\cdot recency";
  const review = createObjectReview("formula-extract-review", item.label, "从当前段落提炼的候选公式");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`<div class="math-render" data-tex="${tex}"></div><p>变量含义：relevance 表示主题相关度，recency 表示时效权重。</p>`));
  target.after(review);
  renderKatexIn(review);
  review._dismiss = () => {
    review.remove();
    block.classList.remove("has-ai-card");
  };
  review.querySelector('[data-object-review="restore"]').textContent = "丢弃";
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').textContent = "插入公式块";
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    const formula = document.createElement("div");
    formula.className = "generated-formula-block";
    formula.innerHTML = `<span>提取出的公式</span><div class="math-render" data-tex="${tex}"></div>`;
    review.replaceWith(formula);
    renderKatexIn(formula);
    markAiAccepted(block, item, item.label, () => formula.remove());
    setLive("公式块已插入", "候选已经以渲染后的公式块写入当前段落之后，不再显示原始 LaTeX 字符串。 ");
  });
  block.classList.add("has-ai-card");
  setLive("提取公式", "公式候选直接渲染为 KaTeX；接受后才成为正文里的独立公式块。 ");
}

/* ---------- dispatcher: kept name so every caller keeps working ---------- */
function showAiSuggestionCard(block, opts = {}) {
  const { label, reason = "", host = block, microTitle = "", customText = "" } = opts;
  const found = findSuggestion(block, label);
  const item = suggestion(label, reason || (customText ? "自定义指令" : found.reason), customText || found.detail);
  item.runId = `composer-ai-run-${++composerAiRunSequence}`;
  block.dataset.aiRunId = item.runId;
  aiSuggestionHistory.unshift({ block, item, microTitle, customText, at: Date.now() });
  aiSuggestionHistory.splice(18);
  const micro = host.closest?.(".math-card")
    || (block.dataset.blockKind === "math" ? block.querySelector(".math-card.is-micro-active, .math-card") : null);
  if (block.dataset.blockKind === "metadata") return runMetadataPatch(block, item);
  if (block.dataset.blockKind === "list" && ["补缺项", "重排列表"].includes(item.label)) return runListPatch(block, item);
  if (block.dataset.blockKind === "list" && item.label === "转成表格") return runListToTable(block, item);
  if (block.dataset.blockKind === "checklist" && item.label === "按优先级重排") return runChecklistReorder(block, item);
  if (block.dataset.blockKind === "vault-links" && ["补双链", "修复失效链接", "检查断链"].includes(item.label)) return runVaultLinkPatch(block, item);
  if (["mermaid", "canvas", "excalidraw"].includes(block.dataset.blockKind) && ["补缺失分支", "补一个节点", "补一个流程节点"].includes(item.label)) return runNativeIncrement(block, item);
  if (item.label === "提取公式") return runExtractedFormula(block, item);
  if (micro && item.label === "拆分公式") return runFormulaSplit(block, micro, item);
  if (micro && item.label === "解释公式") return runFormulaExplain(block, micro, item);
  if (micro && item.label === "变量表") return runFormulaVariableTable(block, micro, item);
  if (block.dataset.blockKind === "image" && item.label === "生成图注") return runImageCaption(block, item);
  const target = microTitle ? null : rewriteTargetFor(block);
  const wantsRewrite = customText ? Boolean(target) : REWRITE_LABELS.has(label) && Boolean(target);
  if (wantsRewrite) return runRewrite(block, target, item, { customText });
  return runInsert(host, block, item, { microTitle, customText });
}

function candidateInstructionHTML(className = "", value = "") {
  return `<label class="candidate-instruction ${className}">
    <svg aria-hidden="true"><use href="#i-wand"></use></svg>
    <input type="text" data-candidate-instruction value="${escapeHtml(value)}" placeholder="告诉 AI 这版怎么改…" aria-label="告诉 AI 这版怎么改" autocomplete="off" />
  </label>`;
}

/* ---------- in-place rewrite → streaming → word-level diff ---------- */
function runRewrite(block, target, item, {
  customText = "",
  reviewHost = block,
  refreshSource = refreshProseSource,
  reviewClass = "",
  onDismiss = null,
} = {}) {
  closeAiCards();
  block.classList.add("has-ai-card", "is-ai-running");
  if (block._rewriteOriginal == null) block._rewriteOriginal = target.textContent.trim();
  const original = block._rewriteOriginal;
  const buildVariant = (variantIndex, instruction = "") => ({
    instruction: instruction.trim(),
    candidate: String(buildCandidate(block, item, "", instruction.trim(), variantIndex)).replace(/\s*\n+\s*/g, " ").trim(),
  });
  const variants = [buildVariant(0, customText)];
  let activeVariant = 0;

  const review = document.createElement("div");
  review.className = `rw-review is-busy${reviewClass ? ` ${reviewClass}` : ""}`;
  review.innerHTML = `
    <div class="rw-status"><span class="rw-dot"></span><span class="rw-label">原地改写生成中…</span> <span class="rw-count"></span></div>
    ${candidateInstructionHTML("rw-instruction", customText)}
    <span class="rw-spacer"></span>
    <button class="rw-btn ghost" data-rw="stop">停止</button>
    <div class="rw-btns">
      <button class="rw-btn rw-history-toggle" data-rw="history" aria-label="查看版本历史" title="查看版本历史"><svg><use href="#i-history"></use></svg></button>
      <div class="rw-variant-nav" aria-label="AI 改写版本">
        <button type="button" data-rw="previous" aria-label="上一版" title="上一版" disabled><svg><use href="#i-chevron-left"></use></svg></button>
        <span data-rw-version>1 / 1</span>
        <button type="button" data-rw="next" aria-label="下一版" title="下一版" disabled><svg><use href="#i-chevron-right"></use></svg></button>
      </div>
      <button class="rw-btn primary" data-rw="accept"><svg><use href="#i-check"></use></svg>接受</button>
      <button class="rw-btn" data-rw="restore"><svg><use href="#i-undo"></use></svg>还原</button>
      <button class="rw-btn ghost" data-rw="retry">重新生成</button>
    </div>
    <div class="rw-version-history" hidden aria-label="AI 改写历史"></div>`;
  reviewHost.appendChild(review);

  const editableFlag = target.getAttribute("contenteditable");
  target.classList.add("is-diffing");
  target.setAttribute("contenteditable", "false");
  const statusEl = review.querySelector(".rw-label");
  const countEl = review.querySelector(".rw-count");
  const versionEl = review.querySelector("[data-rw-version]");
  const variantNav = review.querySelector(".rw-variant-nav");
  const previousButton = review.querySelector('[data-rw="previous"]');
  const nextButton = review.querySelector('[data-rw="next"]');
  const historyPanel = review.querySelector(".rw-version-history");

  const renderVersionHistory = () => {
    historyPanel.innerHTML = `
      <div class="rw-version-history-head">
        <span>版本历史</span>
        <small>${variants.length} 个候选</small>
      </div>
      <div class="rw-version-history-list">
        ${variants.map((variant, index) => {
          const title = index === 0 ? "初始候选" : variant.instruction ? "按要求调整" : "重新生成";
          const detail = variant.instruction || (index === 0 ? item.label : "基于上一版本生成");
          return `
            <button type="button" data-rw-version-index="${index}" class="${index === activeVariant ? "is-active" : ""}">
              <span class="rw-version-badge">V${index + 1}</span>
              <span class="rw-version-copy">
                <strong>${title}</strong>
                <small>${escapeHtml(detail)}</small>
              </span>
              <svg class="rw-version-check" aria-hidden="true"><use href="#i-check"></use></svg>
            </button>`;
        }).join("")}
      </div>`;
  };

  const updateVersionControls = () => {
    if (versionEl) versionEl.textContent = `${activeVariant + 1} / ${variants.length}`;
    if (variantNav) variantNav.hidden = variants.length <= 1;
    if (previousButton) previousButton.disabled = activeVariant <= 0;
    if (nextButton) nextButton.disabled = activeVariant >= variants.length - 1;
    renderVersionHistory();
  };

  const renderDiffFor = (variant) => {
    const segs = diffTokens(tokenize(original), tokenize(variant.candidate));
    target.innerHTML = renderDiff(segs);
    const { del, ins } = diffCounts(segs);
    review.classList.remove("is-busy");
    statusEl.textContent = "生成完成 · 未写入";
    countEl.innerHTML = `<del>−${del}</del> <ins>+${ins}</ins>`;
    updateVersionControls();
  };

  const cleanup = () => {
    clearInterval(review._timer);
    target.classList.remove("is-diffing");
    if (editableFlag == null) target.removeAttribute("contenteditable");
    else target.setAttribute("contenteditable", editableFlag);
    review.remove();
  };

  review._dismiss = () => {
    target.textContent = original;
    cleanup();
    onDismiss?.(target);
    block.classList.remove("has-ai-card", "is-ai-running");
  };

  const streamVariant = (variant, isRegeneration = false) => {
    clearInterval(review._timer);
    review.classList.add("is-busy");
    statusEl.textContent = isRegeneration ? "重新生成中…" : "原地改写生成中…";
    countEl.textContent = "";
    let i = 0;
    review._timer = setInterval(() => {
      i += 1;
      target.innerHTML = escapeHtml(variant.candidate.slice(0, i)) + '<span class="ai-caret"></span>';
      if (i < variant.candidate.length) return;
      clearInterval(review._timer);
      renderDiffFor(variant);
      block.classList.remove("is-ai-running");
    }, 18);
  };

  const showVariant = (index) => {
    if (review.classList.contains("is-busy")) return;
    const variant = variants[index];
    if (!variant) return;
    activeVariant = index;
    renderDiffFor(variant);
  };

  review.querySelector('[data-rw="stop"]').addEventListener("click", () => {
    clearInterval(review._timer);
    renderDiffFor(variants[activeVariant]);
    statusEl.textContent = "已停止 · 未写入";
  });
  review.querySelector('[data-rw="restore"]').addEventListener("click", () => {
    review._dismiss();
    setLive("已还原", "块回到原始 Markdown，未写入任何内容。");
    showToast("已还原 · 未写入");
  });
  const retryRewrite = () => {
    if (review.classList.contains("is-busy")) {
      showToast("当前改写完成后再重新生成");
      return;
    }
    const instruction = review.querySelector("[data-candidate-instruction]")?.value.trim() || customText;
    const variant = buildVariant(variants.length, instruction);
    variants.push(variant);
    activeVariant = variants.length - 1;
    block.classList.add("is-ai-running");
    updateVersionControls();
    streamVariant(variant, true);
    setLive("按要求重新改写", instruction ? `正在按「${escapeHtml(instruction)}」生成版本 ${variants.length}；旧版本仍可切回。` : `正在生成版本 ${variants.length}；旧版本仍可切回。`);
  };
  review.querySelector('[data-rw="retry"]').addEventListener("click", retryRewrite);
  review.querySelector("[data-candidate-instruction]").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    retryRewrite();
  });
  review.querySelector('[data-rw="previous"]').addEventListener("click", () => showVariant(activeVariant - 1));
  review.querySelector('[data-rw="next"]').addEventListener("click", () => showVariant(activeVariant + 1));
  review.querySelector('[data-rw="history"]').addEventListener("click", () => {
    historyPanel.hidden = !historyPanel.hidden;
  });
  historyPanel.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-rw-version-index]");
    if (!choice) return;
    showVariant(Number(choice.dataset.rwVersionIndex));
    historyPanel.hidden = true;
  });
  review.querySelector('[data-rw="accept"]').addEventListener("click", () => {
    const candidate = variants[activeVariant].candidate;
    target.textContent = candidate;
    block._rewriteOriginal = candidate;
    cleanup();
    block.classList.remove("is-ai-running");
    refreshSource(block);
    markAiAccepted(block, item, item.label, () => {
      target.textContent = original;
      block._rewriteOriginal = original;
      refreshSource(block);
    }, () => {
      target.textContent = candidate;
      block._rewriteOriginal = candidate;
      refreshSource(block);
    });
    setLive("AI 改写已接受", "候选写回当前块的 Markdown range，进入 Obsidian undo stack，可从 Ambient 回滚。");
    showToast("已接受改写 · 可在 Ambient 回滚");
  });

  clearTimeout(block.aiTimer);
  block.aiTimer = setTimeout(() => block.classList.remove("is-ai-running"), 1300);
  setLive(item.label, `原地改写：${escapeHtml(item.reason)}。流式生成后在原文上按词展示 diff（红删绿增），接受前不写回文件。`);
  showToast(`${item.label}：原地改写生成中`);
  updateVersionControls();
  streamVariant(variants[0]);
}

function refreshImageCaptionSource(block) {
  const caption = block.querySelector(":scope > .real-image-frame > figcaption")?.textContent.replace(/\s+/g, " ").trim() || "";
  if (!block.dataset.imageEmbedSource) {
    block.dataset.imageEmbedSource = (block.dataset.source || "").split(/\n\s*\n/, 1)[0].trim();
  }
  const embedSource = block.dataset.imageEmbedSource || block.dataset.source || "";
  block.dataset.source = caption ? `${embedSource}\n\n${caption}` : embedSource;
  if (focusedBlock === block) setFocusedBlock(block);
}

function runImageCaption(block, item) {
  const frame = block.querySelector(":scope > .real-image-frame");
  if (!frame) return runInsert(block, block, item);
  let caption = frame.querySelector(":scope > figcaption");
  const createdCaptionSlot = !caption;
  if (!caption) {
    caption = document.createElement("figcaption");
    caption.className = "is-caption-slot";
    frame.appendChild(caption);
  }
  runRewrite(block, caption, item, {
    reviewHost: frame,
    refreshSource: refreshImageCaptionSource,
    reviewClass: "image-caption-review",
    onDismiss: (target) => {
      if (createdCaptionSlot && !target.textContent.trim()) target.remove();
    },
  });
  setLive("生成图注", "候选直接在图片原有图注行内流式生成并显示 diff；没有图注时才创建图注槽位，不新增正文段落。");
}

/* ---------- additive creation: render a real draft block at the insertion point ---------- */
function draftShape(block, item, candidate, variantIndex = 0, instruction = "") {
  if (block.dataset.blockKind === "base" && item.label === "生成视图") {
    const viewName = instruction || (variantIndex % 2 === 0 ? "待推进条目" : "本周回顾");
    const source = `views:
  - type: table
    name: ${viewName}
    filters:
      and:
        - stage != "Reference"
    order:
      - file
      - stage
      - next`;
    return {
      kind: "base-view",
      source,
      html: `<section class="generated-base-view">
        <header><span>Base view</span><strong>${escapeHtml(viewName)}</strong></header>
        <div class="base-row head"><span>file</span><span>stage</span><span>next</span></div>
        <div class="base-row"><span>知识库.md</span><span class="pill blue">Manage</span><span>建立链接和主题</span></div>
        <div class="base-row"><span>信息管理.md</span><span class="pill green">Manage</span><span>补充回流条件</span></div>
      </section>`,
    };
  }
  if (item.label === "补提纲") {
    if (instruction) {
      return { kind: "heading-2", source: `## 按要求重组本节\n\n围绕「${instruction}」重新组织判断、证据与下一步行动。`, html: `<h2>按要求重组本节</h2><p>围绕「${escapeHtml(instruction)}」重新组织判断、证据与下一步行动。</p>` };
    }
    return variantIndex % 2 === 0
      ? { kind: "heading-2", source: "## 从输出目标反推知识结构", html: "<h2>从输出目标反推知识结构</h2><p>先定义读者要完成的判断，再决定这一节需要哪些来源、结构和可验证的结论。</p>" }
      : { kind: "heading-2", source: "## 先明确读者任务，再组织材料", html: "<h2>先明确读者任务，再组织材料</h2><p>用读者要完成的任务约束资料选择、论证顺序与下一步行动。</p>" };
  }
  if (item.label === "生成导读问题" || item.label === "提出追问") {
    if (instruction) {
      const source = `- 围绕「${instruction}」，本节最需要回答哪个问题？\n- 哪一处证据最需要按这个要求补强？\n- 读者完成这项判断后应该采取什么行动？`;
      return { kind: "list", source, html: `<ul class="markdown-list"><li>围绕「${escapeHtml(instruction)}」，本节最需要回答哪个问题？</li><li>哪一处证据最需要按这个要求补强？</li><li>读者完成这项判断后应该采取什么行动？</li></ul>` };
    }
    return variantIndex % 2 === 0
      ? { kind: "list", source: "- 这节最希望读者带走的判断是什么？\n- 哪个例子能证明这个判断？\n- 读者下一步应该去哪一篇笔记继续？", html: "<ul class=\"markdown-list\"><li>这节最希望读者带走的判断是什么？</li><li>哪个例子能证明这个判断？</li><li>读者下一步应该去哪一篇笔记继续？</li></ul>" }
      : { kind: "list", source: "- 这项判断解决了读者的哪个问题？\n- 现有材料中最薄弱的证据是什么？\n- 哪个反例值得在下一段主动回应？", html: "<ul class=\"markdown-list\"><li>这项判断解决了读者的哪个问题？</li><li>现有材料中最薄弱的证据是什么？</li><li>哪个反例值得在下一段主动回应？</li></ul>" };
  }
  if (item.label === "生成示意图" || item.label === "生成配图") {
    const caption = instruction
      ? `按「${instruction}」生成的新版本：继续保留材料、关系、成文与回看的完整路径。`
      : variantIndex % 2 === 0
      ? "从材料、关系到成文与回看：生成图作为当前段落的视觉解释，可继续改图、评论或替换。"
      : "知识从获取进入组织，再经写作与回顾形成闭环；这版用更简洁的路径强调每一步的交接。";
    return { kind: "image", source: `![[assets/ai-knowledge-workflow-illustration.png|${caption}]]`, html: `<figure class="generated-figure"><a class="lightgallery" href="assets/ai-knowledge-workflow-illustration.png" data-thumbnail="assets/ai-knowledge-workflow-illustration.png"><img src="assets/ai-knowledge-workflow-illustration.png" alt="知识工作流生成示意图" /></a><figcaption>${escapeHtml(caption)}</figcaption></figure>` };
  }
  if (item.label === "转成表格") {
    const source = candidate;
    const rows = source.split("\n").filter((line) => /^\|/.test(line) && !/---/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    const [header = ["要点", "内容"], ...body] = rows;
    return { kind: "table", source, html: `<table class="composer-table"><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td contenteditable="true">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>` };
  }
  if (item.label === "提取公式") {
    const tex = "score=w_1\\cdot relevance+w_2\\cdot recency";
    return { kind: "math", source: `$$${tex}$$`, html: `<div class="generated-formula-block"><span>相关度与时效的评分函数</span><div class="math-render" data-tex="${tex}"></div></div>` };
  }
  return { kind: "paragraph", source: candidate, html: `<p>${escapeHtml(candidate)}</p>` };
}

function imageGenerationStageHTML() {
  return `<div class="image-generation-stage" role="status" aria-live="polite">
    <div class="image-generation-preview"><span></span><span></span><span></span></div>
    <div class="image-generation-copy"><strong data-image-generation-status>正在理解这一段需要什么图…</strong><small>分析正文关系、选择画面结构并生成附件</small><ol><li class="is-active">理解内容</li><li>构建画面</li><li>生成附件</li></ol></div>
  </div>`;
}

function draftStreamingBodyHTML() {
  return `<p class="generated-draft-stream" role="status" aria-live="polite"><span data-draft-stream-text></span><span class="ai-caret" aria-hidden="true"></span></p>`;
}

function structuredDraftSkeletonHTML(kind) {
  return `<section class="generated-object-skeleton" data-generated-object-kind="${escapeHtml(kind)}" role="status" aria-live="polite">
    <header><span></span><span></span></header>
    <div class="generated-object-skeleton-row"><i></i><i></i><i></i></div>
    <div class="generated-object-skeleton-row"><i></i><i></i><i></i></div>
    <div class="generated-object-skeleton-row"><i></i><i></i><i></i></div>
  </section>`;
}

function captureGeneratedDraftBody(draft) {
  const controls = draft.querySelector(":scope > .block-controls");
  const review = draft.querySelector(":scope > .generated-draft-review");
  const nodes = [];
  let cursor = controls?.nextSibling;
  while (cursor && cursor !== review) {
    nodes.push(cursor);
    cursor = cursor.nextSibling;
  }
  draft._bodyNodes = nodes;
}

function replaceGeneratedDraftBody(draft, html) {
  const review = draft.querySelector(":scope > .generated-draft-review");
  if (!review) return;
  draft._bodyNodes?.forEach((node) => node.remove());
  const fragment = document.createRange().createContextualFragment(html);
  const nodes = Array.from(fragment.childNodes);
  review.before(fragment);
  draft._bodyNodes = nodes;
}

function runInsert(host, block, item, { microTitle = "", customText = "" } = {}) {
  closeAiCards();
  const buildVariant = (variantIndex, instruction = "") => {
    const effectiveInstruction = instruction.trim() || (variantIndex === 0 ? customText.trim() : "");
    const candidate = String(buildCandidate(block, item, microTitle, effectiveInstruction, variantIndex));
    return {
      candidate,
      instruction: effectiveInstruction,
      shape: draftShape(block, item, candidate, variantIndex, effectiveInstruction),
    };
  };
  const firstVariant = buildVariant(0);
  const isImageGeneration = firstVariant.shape.kind === "image";
  const isStructuredGeneration = ["base-view", "table", "math", "chart"].includes(firstVariant.shape.kind);
  const draft = document.createElement("section");
  draft.className = `doc-block generated-draft ${firstVariant.shape.kind}-block`;
  draft.dataset.blockKind = firstVariant.shape.kind;
  draft.dataset.blockTitle = microTitle ? `${microTitle} · ${item.label}` : item.label;
  draft.dataset.source = firstVariant.shape.source;
  draft.dataset.aiRunId = item.runId;
  const generationBody = isImageGeneration
    ? imageGenerationStageHTML()
    : isStructuredGeneration
    ? structuredDraftSkeletonHTML(firstVariant.shape.kind)
    : draftStreamingBodyHTML();
  draft.innerHTML = `${blockControlsHTML()}${generationBody}<div class="generated-draft-review">
    <span class="draft-status-dot"><svg><use href="#i-spark"></use></svg></span>
    <span class="draft-status-copy"><strong data-draft-status>${isImageGeneration ? "生成中" : "AI 生成中…"}</strong><small data-draft-status-detail>${escapeHtml(item.label)} · 正在流式生成版本 1 · 未写入 Markdown</small></span>
    ${candidateInstructionHTML("draft-instruction")}
    <div class="draft-review-actions">
      <div class="draft-variant-nav" aria-label="AI 草稿版本" hidden>
        <button type="button" data-draft-result="previous" aria-label="上一版" title="上一版" disabled><svg><use href="#i-chevron-left"></use></svg></button>
        <span data-draft-version>1 / 1</span>
        <button type="button" data-draft-result="next" aria-label="下一版" title="下一版" disabled><svg><use href="#i-chevron-right"></use></svg></button>
      </div>
      <button type="button" data-draft-result="accept" disabled><svg><use href="#i-check"></use></svg>接受</button>
      <button type="button" data-draft-result="regenerate" disabled><svg><use href="#i-refresh"></use></svg>重新生成</button>
      <button type="button" data-draft-result="discard">丢弃</button>
    </div>
  </div>`;

  if (host.classList?.contains("micro-block")) host.appendChild(draft);
  else block.after(draft);
  captureGeneratedDraftBody(draft);
  decorateBlock(draft);
  markEditorChrome(draft);
  renderKatexIn(draft);
  imageGallery?.refresh?.();
  block.classList.add("has-ai-card", "is-ai-running");
  draft.classList.add("is-generating");
  draft._generationTimers = [];
  draft._generationInterval = null;
  draft._variants = [firstVariant];
  draft._variantIndex = 0;

  const scheduleGeneration = (delay, callback) => {
    draft._generationTimers.push(setTimeout(() => {
      if (draft.isConnected) callback();
    }, delay));
  };

  const clearGenerationTimers = () => {
    draft._generationTimers.forEach((timer) => clearTimeout(timer));
    draft._generationTimers = [];
    clearInterval(draft._generationInterval);
    draft._generationInterval = null;
  };

  const setDraftBusy = (busy) => {
    const accept = draft.querySelector('[data-draft-result="accept"]');
    const regenerate = draft.querySelector('[data-draft-result="regenerate"]');
    const previous = draft.querySelector('[data-draft-result="previous"]');
    const next = draft.querySelector('[data-draft-result="next"]');
    if (accept) accept.disabled = busy;
    if (regenerate) regenerate.disabled = busy;
    if (previous) previous.disabled = busy || draft._variantIndex <= 0;
    if (next) next.disabled = busy || draft._variantIndex >= draft._variants.length - 1;
  };

  const showVariant = (variantIndex) => {
    const variant = draft._variants[variantIndex];
    if (!variant) return;
    draft._variantIndex = variantIndex;
    replaceGeneratedDraftBody(draft, variant.shape.html);
    draft.dataset.source = variant.shape.source;
    draft.classList.remove("is-generating", "is-regenerating");
    const status = draft.querySelector("[data-draft-status]");
    const detail = draft.querySelector("[data-draft-status-detail]");
    const version = draft.querySelector("[data-draft-version]");
    const versionNavigation = draft.querySelector(".draft-variant-nav");
    if (status) status.textContent = variant.shape.kind === "image" ? "生成完成" : "AI 草稿";
    if (detail) {
      detail.textContent = variant.instruction
        ? `${item.label} · 版本 ${variantIndex + 1}/${draft._variants.length} · 按「${variant.instruction}」生成 · 未写入`
        : `${item.label} · 版本 ${variantIndex + 1}/${draft._variants.length} · 未写入 Markdown`;
    }
    if (version) version.textContent = `${variantIndex + 1} / ${draft._variants.length}`;
    if (versionNavigation) versionNavigation.hidden = draft._variants.length <= 1;
    renderKatexIn(draft);
    imageGallery?.refresh?.();
    setDraftBusy(false);
  };

  const prepareRegeneration = (nextVersion, instruction = "") => {
    clearGenerationTimers();
    draft.classList.add("is-generating", "is-regenerating");
    const status = draft.querySelector("[data-draft-status]");
    const detail = draft.querySelector("[data-draft-status-detail]");
    if (status) status.textContent = "重新生成中…";
    if (detail) {
      detail.textContent = instruction
        ? `${item.label} · 正在按「${instruction}」生成版本 ${nextVersion}`
        : `${item.label} · 正在生成版本 ${nextVersion} · 当前版本仍未写入`;
    }
    setDraftBusy(true);
    block.classList.add("is-ai-running");
  };

  const finishRegeneration = (variant) => {
    draft._variants.push(variant);
    showVariant(draft._variants.length - 1);
    block.classList.remove("is-ai-running");
    setLive("已重新生成", `新候选已成为版本 ${draft._variants.length}；上一版仍可在当前草稿内切回。`);
    showToast(`已生成版本 ${draft._variants.length} · 尚未写入`);
  };

  const streamTextVariant = (variant, isRegeneration) => {
    replaceGeneratedDraftBody(draft, draftStreamingBodyHTML());
    const streamText = draft.querySelector("[data-draft-stream-text]");
    const status = draft.querySelector("[data-draft-status]");
    const detail = draft.querySelector("[data-draft-status-detail]");
    const text = Array.from(variant.shape.kind === "paragraph" ? variant.candidate : variant.shape.source);
    const targetVersion = isRegeneration ? draft._variants.length + 1 : 1;
    const chunkSize = Math.max(1, Math.ceil(text.length / 52));
    let cursor = 0;
    if (status) status.textContent = isRegeneration ? "重新生成中…" : "AI 生成中…";
    setDraftBusy(true);
    clearInterval(draft._generationInterval);
    draft._generationInterval = setInterval(() => {
      cursor = Math.min(text.length, cursor + chunkSize);
      if (streamText) streamText.textContent = text.slice(0, cursor).join("");
      if (detail) {
        const instructionStatus = variant.instruction ? ` · 按「${variant.instruction}」` : "";
        detail.textContent = `${item.label} · 流式生成版本 ${targetVersion}${instructionStatus} · ${cursor}/${text.length} 字`;
      }
      if (cursor < text.length) return;
      clearInterval(draft._generationInterval);
      draft._generationInterval = null;
      if (isRegeneration) finishRegeneration(variant);
      else {
        showVariant(0);
        block.classList.remove("is-ai-running");
      }
    }, 24);
  };

  const runStructuredGeneration = (variant, isRegeneration) => {
    replaceGeneratedDraftBody(draft, structuredDraftSkeletonHTML(variant.shape.kind));
    const status = draft.querySelector("[data-draft-status]");
    const detail = draft.querySelector("[data-draft-status-detail]");
    const targetVersion = isRegeneration ? draft._variants.length + 1 : 1;
    if (status) status.textContent = isRegeneration ? "重新生成中…" : "正在生成候选…";
    if (detail) {
      const instructionStatus = variant.instruction ? ` · 按「${variant.instruction}」` : "";
      detail.textContent = `${item.label} · 正在构建版本 ${targetVersion}${instructionStatus}`;
    }
    setDraftBusy(true);
    scheduleGeneration(1050, () => {
      if (isRegeneration) finishRegeneration(variant);
      else {
        showVariant(0);
        block.classList.remove("is-ai-running");
      }
    });
  };

  const runImageGeneration = (variant, isRegeneration) => {
    if (isRegeneration) replaceGeneratedDraftBody(draft, imageGenerationStageHTML());
    const stageStatus = draft.querySelector("[data-image-generation-status]");
    const steps = Array.from(draft.querySelectorAll(".image-generation-copy li"));
    scheduleGeneration(620, () => {
      if (stageStatus) stageStatus.textContent = "正在把来源、判断和行动组织成画面…";
      steps[0]?.classList.replace("is-active", "is-done");
      steps[1]?.classList.add("is-active");
    });
    scheduleGeneration(1320, () => {
      if (stageStatus) stageStatus.textContent = "正在生成图像附件并准备可编辑引用…";
      steps[1]?.classList.replace("is-active", "is-done");
      steps[2]?.classList.add("is-active");
    });
    scheduleGeneration(2050, () => {
      steps[2]?.classList.replace("is-active", "is-done");
      if (isRegeneration) finishRegeneration(variant);
      else showVariant(0);
      setLive("示意图已生成", "真实图像块已在插入位置渲染；接受前附件引用仍处于草稿事务。");
    });
  };

  draft._dismiss = () => {
    clearGenerationTimers();
    draft.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  draft.querySelector('[data-draft-result="discard"]').addEventListener("click", () => {
    draft._dismiss();
    setLive("已丢弃新块", "这个生成块没有写入 Markdown 或附件引用。 ");
  });
  draft.querySelector('[data-draft-result="previous"]').addEventListener("click", () => {
    if (draft.classList.contains("is-generating")) return;
    showVariant(draft._variantIndex - 1);
  });
  draft.querySelector('[data-draft-result="next"]').addEventListener("click", () => {
    if (draft.classList.contains("is-generating")) return;
    showVariant(draft._variantIndex + 1);
  });
  const regenerateDraft = () => {
    if (draft.classList.contains("is-generating")) {
      showToast("当前版本生成完成后再重新生成");
      return;
    }
    const instruction = draft.querySelector("[data-candidate-instruction]")?.value.trim() || "";
    const nextVariantIndex = draft._variants.length;
    const variant = buildVariant(nextVariantIndex, instruction);
    prepareRegeneration(nextVariantIndex + 1, instruction);
    if (variant.shape.kind === "image") {
      runImageGeneration(variant, true);
      return;
    }
    if (["base-view", "table", "math", "chart"].includes(variant.shape.kind)) {
      runStructuredGeneration(variant, true);
      return;
    }
    streamTextVariant(variant, true);
    setLive("重新生成中", instruction
      ? `正在按「${escapeHtml(instruction)}」生成版本 ${nextVariantIndex + 1}；现有版本不会被覆盖。`
      : `正在基于当前上下文生成版本 ${nextVariantIndex + 1}；现有版本不会被覆盖。`);
  };
  draft.querySelector('[data-draft-result="regenerate"]').addEventListener("click", regenerateDraft);
  draft.querySelector("[data-candidate-instruction]").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    regenerateDraft();
  });
  draft.querySelector('[data-draft-result="accept"]').addEventListener("click", () => {
    if (draft.querySelector('[data-draft-result="accept"]')?.disabled) return;
    clearGenerationTimers();
    draft.classList.remove("generated-draft", "is-generating");
    draft.querySelector(".generated-draft-review")?.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
    markAiAccepted(draft, item, `${item.label} · v${draft._variantIndex + 1}`, () => draft.remove());
    setLive("新块已写入", `当前可见的版本 ${draft._variantIndex + 1} 已作为实际可编辑块留在文档里；其他未接受版本没有写入。`);
    showToast("已接受新块 · 可在 Ambient 回滚");
  });

  if (isImageGeneration) {
    runImageGeneration(firstVariant, false);
  } else if (isStructuredGeneration) {
    runStructuredGeneration(firstVariant, false);
  } else {
    streamTextVariant(firstVariant, false);
  }
  clearTimeout(block.aiTimer);
  block.aiTimer = setTimeout(() => block.classList.remove("is-ai-running"), isImageGeneration ? 2200 : 1300);
  setLive(item.label, `${microTitle ? escapeHtml(microTitle) + " · " : ""}${isImageGeneration ? "正在生成图像候选。" : isStructuredGeneration ? "正在按目标对象结构生成候选；不会先显示 prompt 或原始源码。" : "候选正在实际插入位置流式写出；完成前不可接受。"}`);
  showToast(`${item.label}：生成中`);
}

function historyChangeStats(entry) {
  const beforeLines = String(entry.before || "").split("\n");
  const afterLines = String(entry.after || "").split("\n");
  const countLines = (lines) => lines.reduce((counts, line) => counts.set(line, (counts.get(line) || 0) + 1), new Map());
  const beforeCounts = countLines(beforeLines);
  const afterCounts = countLines(afterLines);
  let added = 0;
  let removed = 0;
  afterCounts.forEach((count, line) => { added += Math.max(0, count - (beforeCounts.get(line) || 0)); });
  beforeCounts.forEach((count, line) => { removed += Math.max(0, count - (afterCounts.get(line) || 0)); });
  const changedLines = Math.max(1, added, removed);
  const kind = entry.block?.dataset.blockKind || "markdown";
  const scopeLabels = { metadata: "Frontmatter", list: "List block", math: "Formula block", table: "Table block", paragraph: "Paragraph" };
  return { added, removed, changedLines, scope: scopeLabels[kind] || kind };
}

function renderRollbackTrail() {
  if (!rollbackCard || !rollbackList) return;
  rollbackList.innerHTML = "";
  if (historyCount) historyCount.textContent = String(rollbackTrail.length);
  if (!rollbackTrail.length) {
    rollbackList.innerHTML = `<div class="history-empty"><strong>还没有已接受的改动</strong><span>在正文里接受一个 AI patch 后，会在这里留下实际的 Markdown 前后版本。</span></div>`;
    renderFocusedHistory(focusedBlock);
    return;
  }
  const session = document.createElement("div");
  session.className = "history-session-label";
  session.innerHTML = `<span>今天</span><small>${rollbackTrail.length} 次写入</small>`;
  rollbackList.appendChild(session);
  rollbackTrail.slice(0, 8).forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = `rollback-item${index === activeHistoryIndex ? " is-active" : ""}`;
    const time = new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const stats = historyChangeStats(entry);
    row.innerHTML = `
      <button class="history-entry" data-history-preview="${index}" type="button">
        <span class="history-entry-mark"></span>
        <span class="history-entry-copy">
          <span class="history-entry-head"><strong>${escapeHtml(entry.label)}</strong><time>${time}</time></span>
          <span class="history-entry-meta"><span>${escapeHtml(stats.scope)}</span><span>${stats.changedLines} 行</span><b>+${stats.added} −${stats.removed}</b></span>
        </span>
      </button>
      <span class="history-row-actions"><button data-history-locate="${index}" type="button" title="定位正文"><svg><use href="#i-locate"></use></svg></button><button class="history-rollback" data-rollback-index="${index}" type="button" title="回滚这次写入"><svg><use href="#i-undo"></use></svg></button></span>
    `;
    rollbackList.appendChild(row);
  });
  previewHistoryEntry(Math.min(activeHistoryIndex ?? 0, rollbackTrail.length - 1), false);
}

function sourcePanel(value) {
  return `<code>${escapeHtml(value || "（空）")}</code>`;
}

function renderHistoryDiff(entry, heading = "Markdown diff") {
  if (!historyDetail) return;
  if (!entry) {
    historyDetail.innerHTML = `<span class="panel-label">${heading}</span><p>选择一条写入记录，查看它实际替换了什么，并可直接回滚。</p>`;
    return;
  }
  const changed = entry.before !== entry.after;
  historyDetail.innerHTML = `
    <div class="history-diff-head"><div><span class="panel-label">${heading}</span><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.title)}</small></div><div><button type="button" data-history-locate="${rollbackTrail.indexOf(entry)}" title="定位正文"><svg><use href="#i-locate"></use></svg></button><button type="button" data-rollback-index="${rollbackTrail.indexOf(entry)}"><svg><use href="#i-undo"></use></svg> 回滚</button></div></div>
    <div class="history-diff-columns${changed ? " is-changed" : ""}">
      <section><span>写入前</span>${sourcePanel(entry.before)}</section>
      <section><span>写入后</span>${sourcePanel(entry.after)}</section>
    </div>
  `;
}

function renderFocusedHistory(block) {
  if (!historyDetail || activeHistoryIndex != null || !block) return;
  const source = block.dataset.source || "";
  const before = block.dataset.lastCommittedSource || block.dataset.initialSource || source;
  renderHistoryDiff({ before, after: source, label: "当前块", title: block.dataset.blockTitle || "当前块" }, "当前块源格式");
}

function previewHistoryEntry(index, rerender = true) {
  const entry = rollbackTrail[index];
  if (!entry) return;
  activeHistoryIndex = index;
  renderHistoryDiff(entry);
  if (rerender) renderRollbackTrail();
}

function locateHistoryEntry(index) {
  const entry = rollbackTrail[index];
  if (!entry?.block) return;
  setFocusedBlock(entry.block);
  entry.block.scrollIntoView({ behavior: "smooth", block: "center" });
  entry.block.classList.add("is-history-located");
  setTimeout(() => entry.block.classList.remove("is-history-located"), 900);
  setLive("已定位正文", entry.title);
}

function rollbackEntry(index) {
  const entry = rollbackTrail.splice(index, 1)[0];
  if (!entry) return;
  const undoIndex = composerUndoStack.lastIndexOf(entry);
  if (undoIndex >= 0) composerUndoStack.splice(undoIndex, 1);
  composerRedoStack.length = 0;
  entry.restore?.();
  entry.block.dataset.source = entry.before;
  entry.block.dataset.lastCommittedSource = entry.before;
  if (!rollbackTrail.some((other) => other.block === entry.block)) {
    entry.block.classList.remove("has-ai-accepted");
  }
  activeHistoryIndex = rollbackTrail.length ? Math.max(0, Math.min(index, rollbackTrail.length - 1)) : null;
  renderRollbackTrail();
  updateComposerTransactionControls();
  setFocusedBlock(entry.block);
  setLive("已回滚 AI 写入", `“${escapeHtml(entry.title)}”的「${escapeHtml(entry.label)}」已从草稿事务撤销，块回到原始 Markdown。`);
  showToast("已回滚该 AI 写入");
}

/* Proactive Copilot long suggestions — only these blocks upgrade to the combined panel. */
const COPILOT_SUGGESTIONS = {
  "导语段落": {
    label: "润色改写",
    txt: "这段导语可以更收敛：把「大脑的延伸」的比喻和存储 / 记忆 / 检索 / 组织四个职责压进一句，让「形成闭环」那句更突出。",
    meta: "Copilot 生成 · 润色建议",
  },
  "AI 旁路段落": {
    label: "补充说明段",
    txt: "建议在这里补一段「为什么多个知识库之间需要 diff 和自动关联」，承接上一句的 patch 语义，并给出一个具体场景。",
    meta: "Copilot 生成 · 基于当前块 + 上下文",
  },
};

function aiPillsHTML(block) {
  return getAiActions(block)
    .map(
      (item) =>
        `<button class="pill" data-ai-quick="${escapeHtml(item.label)}" data-reason="${escapeHtml(item.reason)}" title="${escapeHtml(item.label)}：${escapeHtml(item.reason)}">${escapeHtml(item.label)}</button>`
    )
    .join("");
}

function getOrCreateAiMenuFor(host, block) {
  let menu = host.querySelector(":scope > .ai-menu");
  if (menu) return menu;

  const isMicroActionBar = host.classList.contains("micro-block");
  const isBlockActionBar = host === block || isMicroActionBar;
  menu = document.createElement("div");
  menu.className = `ai-menu${isBlockActionBar ? " block-action-bar" : ""}${isMicroActionBar ? " micro-action-bar" : ""}`;
  menu.contentEditable = "false";
  menu.hidden = !isBlockActionBar;
  const sugg = COPILOT_SUGGESTIONS[block.dataset.blockTitle];
  const suggRow = sugg && !isBlockActionBar
    ? `<button class="ai-sugg" data-ai-sugg data-label="${escapeHtml(sugg.label)}">
         <span class="ai-sugg-lead"><svg><use href="#i-spark"></use></svg></span>
         <span class="ai-sugg-body"><span class="ai-sugg-txt">${escapeHtml(sugg.txt)}</span><span class="ai-sugg-meta">${escapeHtml(sugg.meta)}</span></span>
         <span class="ai-sugg-go">生成</span>
       </button>`
    : "";
  const metadataLibraryAction = host === block && block.dataset.blockKind === "metadata"
    ? `<button type="button" id="vault-property-trigger" data-vault-property-action="open" aria-expanded="false" aria-controls="vault-property-library" title="查看全 Vault 字段与标签统计"><svg><use href="#i-table"></use></svg><span>Vault 属性库</span></button>`
    : "";
  const blockActions = isBlockActionBar
    ? `<div class="block-action-core" aria-label="Block 常用操作">
         <button type="button" data-action="insert" title="在下方插入"><svg><use href="#i-plus"></use></svg><span>在下方插入</span></button>
         <button type="button" data-action="easy-copy" title="Easy Copy · 复制为文本、图片、Markdown 或 HTML"><svg><use href="#i-copy"></use></svg><span>复制</span></button>
         <button type="button" data-action="comment" title="添加块评论"><svg><use href="#i-comment"></use></svg><span>评论</span></button>
         ${metadataLibraryAction}
       </div><span class="block-action-divider" aria-hidden="true"></span>`
    : "";
  menu.innerHTML = `
    <div class="aimc${sugg && !isBlockActionBar ? "" : " is-bare"}">
      ${suggRow}
      <div class="aim">
        <div class="aim-top">
          ${blockActions}
          <span class="aim-lead"><svg><use href="#i-spark"></use></svg></span>
          <span class="aim-quick-label">AI</span>
          <div class="aim-pills">${aiPillsHTML(block)}<span class="sep"></span></div>
          <button class="aim-history-toggle" data-action="toggle-ai-history" title="查看本块生成历史" aria-label="查看本块生成历史"><svg><use href="#i-history"></use></svg></button>
          <button class="aim-trigger" data-action="open-ai-input"><svg><use href="#i-wand"></use></svg>指令</button>
          <div class="aim-field">
            <input type="text" placeholder="让 AI 对这个块做什么？" autocomplete="off" />
            <span class="ret" title="回车执行"><svg><use href="#i-enter"></use></svg></span>
            <button class="aim-close" data-action="close-ai-input" title="返回"><svg><use href="#i-x"></use></svg></button>
          </div>
        </div>
      </div>
      <div class="ai-history" hidden></div>
    </div>
  `;
  menu.querySelector("input").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runCustomAi(block, event.target);
  });
  const suggButton = menu.querySelector("[data-ai-sugg]");
  if (suggButton && sugg) {
    suggButton.addEventListener("click", () => {
      menu.hidden = true;
      syncOpenEditorState(block);
      showAiSuggestionCard(block, { label: sugg.label, reason: "Copilot 主动建议", trigger: "copilot" });
    });
  }
  host.appendChild(menu);
  return menu;
}

function toggleAiHistory(button, block, host = block) {
  const menu = button.closest(".ai-menu") || getOrCreateAiMenuFor(host, block);
  const panel = menu.querySelector(".ai-history");
  if (!panel) return;
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  if (!willOpen) return;
  const entries = aiSuggestionHistory.filter((entry) => entry.block === block).slice(0, 5);
  panel.innerHTML = entries.length
    ? entries.map((entry) => `<button data-ai-history-replay="${aiSuggestionHistory.indexOf(entry)}"><strong>${escapeHtml(entry.item.label)}</strong><span>${escapeHtml(entry.item.reason)}</span><em>再次生成</em></button>`).join("")
    : "<span class=\"ai-history-empty\">当前块还没有生成记录</span>";
  setLive("本块生成历史", entries.length ? "这里保留本次审阅会话的候选；点任一项会复用原来的指令和上下文再次生成。" : "还没有可复用的候选；生成历史会在本次审阅结束后一起归档或丢弃。 ");
}

function toggleAiMenu(block, host = block) {
  const menu = getOrCreateAiMenuFor(host, block);
  if (menu.classList.contains("block-action-bar")) return;
  const willOpen = menu.hidden;
  paper.querySelectorAll(".ai-menu:not(.block-action-bar):not([hidden])").forEach((other) => {
    if (other === menu) return;
    other.hidden = true;
    other.querySelector(".aim")?.classList.remove("open");
    syncOpenEditorState(other.closest(".doc-block"));
  });
  menu.querySelector(".aim")?.classList.remove("open");
  const input = menu.querySelector("input");
  if (input) input.value = "";
  menu.hidden = !willOpen;
  syncOpenEditorState(block);
  if (!willOpen) return;
  setLive("块级 AI", "短动作直接点胶囊；点「指令」胶囊形变成输入框写长指令。有 Copilot 主动建议的块，顶部会多一条可直接「生成」的建议。");
}

function openAiInput(button) {
  const aim = button.closest(".aim");
  if (!aim) return;
  aim.classList.add("open");
  setTimeout(() => aim.querySelector("input")?.focus(), 300);
  setLive("自定义指令", "胶囊已形变成输入框：写清目标、语气、约束，回车执行；再点返回或 Esc 收回短动作。");
}

function closeAiInput(button) {
  const aim = button.closest(".aim");
  if (!aim) return;
  aim.classList.remove("open");
  const input = aim.querySelector("input");
  if (input) {
    input.value = "";
    input.blur();
  }
}

function runCustomAi(block, input) {
  const menu = input.closest(".ai-menu");
  const micro = menu.closest(".micro-block");
  const value = input.value.trim();
  if (!value) {
    showToast("先输入自定义指令");
    input.focus();
    return;
  }
  if (menu.classList.contains("block-action-bar")) {
    menu.querySelector(".aim")?.classList.remove("open");
    input.value = "";
  } else {
    menu.hidden = true;
  }
  syncOpenEditorState(block);
  showAiSuggestionCard(block, {
    label: value.length > 16 ? `${value.slice(0, 16)}…` : value,
    reason: "自定义指令",
    trigger: "custom",
    customText: value,
    host: micro || block,
    microTitle: micro?.dataset.microTitle || "",
  });
}

function blockHeadingLevel(block) {
  if (block.dataset.blockKind === "heading-1") return 1;
  if (block.dataset.blockKind === "heading-2") return 2;
  return 0;
}

function sectionBlocksForHeading(block) {
  const level = blockHeadingLevel(block);
  if (!level) return [];
  const blocks = [];
  let cursor = block.nextElementSibling;
  while (cursor?.classList.contains("doc-block")) {
    const cursorLevel = blockHeadingLevel(cursor);
    if (cursorLevel && cursorLevel <= level) break;
    blocks.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  return blocks;
}

function ensureBlockCollapseControl(block) {
  const controls = block.querySelector(":scope > .block-controls");
  if (!controls || controls.querySelector('[data-action="collapse"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "collapse";
  button.innerHTML = '<svg><use href="#i-chevron-up"></use></svg>';
  syncBlockCollapseControl(block, button, false);
  controls.prepend(button);

  const preview = document.createElement("span");
  preview.className = "block-collapse-preview";
  preview.contentEditable = "false";
  const text = (block.textContent || block.dataset.blockTitle || "当前块").replace(/\s+/g, " ").trim();
  preview.textContent = text.length > 82 ? `${text.slice(0, 82)}…` : text;
  block.append(preview);
}

function syncBlockCollapseControl(block, button, collapsed) {
  const isSection = Boolean(blockHeadingLevel(block));
  const label = collapsed
    ? isSection ? "向下展开本节" : "向下展开当前块"
    : isSection ? "向上收起本节" : "向上收起当前块";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.querySelector("use")?.setAttribute("href", collapsed ? "#i-chevron-down" : "#i-chevron-up");
}

function toggleBlockCollapse(block, button) {
  const sectionBlocks = sectionBlocksForHeading(block);
  if (sectionBlocks.length) {
    const collapsed = block.classList.toggle("is-section-collapsed");
    sectionBlocks.forEach((item) => item.classList.toggle("is-section-hidden", collapsed));
    const preview = block.querySelector(":scope > .block-collapse-preview");
    if (preview) preview.textContent = collapsed ? `已折叠 ${sectionBlocks.length} 个内容块` : "";
    syncBlockCollapseControl(block, button, collapsed);
    showToast(collapsed ? `已折叠本节 · ${sectionBlocks.length} 个块` : "本节已展开");
    return;
  }

  const collapsed = block.classList.toggle("is-collapsed");
  syncBlockCollapseControl(block, button, collapsed);
  showToast(collapsed ? "当前块已折叠为一行" : "当前块已展开");
}

function initBlockCollapseControls() {
  paper.querySelectorAll(":scope > .doc-block").forEach(ensureBlockCollapseControl);
  paper.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="collapse"]');
    if (!button) return;
    const block = button.closest(".doc-block");
    if (!block) return;
    event.preventDefault();
    event.stopPropagation();
    toggleBlockCollapse(block, button);
  });
}

function decorateBlock(block) {
  ensureBlockCollapseControl(block);
  if (block.querySelector(":scope > .block-badges")) return;

  const badges = document.createElement("div");
  badges.className = "block-badges";
  const stateRow = document.createElement("div");
  stateRow.className = "block-state-row";
  badges.appendChild(stateRow);
  block.prepend(badges);
  block.querySelectorAll(":scope > .issue-pill").forEach((pill) => stateRow.appendChild(pill));
  if (block.dataset.blockKind === "metadata") {
    const suggestion = document.createElement("button");
    suggestion.type = "button";
    suggestion.className = "metadata-suggestion-trigger";
    suggestion.dataset.metadataAction = "suggest";
    suggestion.innerHTML = '<svg><use href="#i-spark"></use></svg>AI 属性建议 · 2';
    stateRow.appendChild(suggestion);
  }

  const actionBar = getOrCreateAiMenuFor(block, block);
  actionBar.title = "常用 Block 操作与当前 AI 建议";
}

function initBlockBadges() {
  paper.querySelectorAll(".doc-block").forEach(decorateBlock);
}

function blockControlsHTML() {
  return `
    <div class="block-controls" aria-label="Block controls">
      <button data-action="collapse" title="向上收起当前块" aria-label="向上收起当前块" aria-expanded="true"><svg><use href="#i-chevron-up"></use></svg></button>
      <button data-action="move" title="按住拖动"><svg><use href="#i-grip"></use></svg></button>
      <button data-action="insert" title="在下方插入"><svg><use href="#i-plus"></use></svg></button>
    </div>
  `;
}

function initMicroHints() {
  paper.querySelectorAll(".math-card.micro-block").forEach((micro) => {
    const block = micro.closest(".doc-block");
    if (!block) return;
    const actionBar = getOrCreateAiMenuFor(micro, block);
    actionBar.title = `${micro.dataset.microTitle || "公式"} · 常用操作与当前 AI 建议`;
  });
}

const INSIGHTS = [
  { kind: "Claim", anchor: "知识库结构段落", status: "未确认", anchorLabel: "锚定 §1", text: "知识库结构应由输出目标反推，而不是由收藏习惯决定。", issue: { label: "补来源", reason: "Issue：missing source，claim 缺少引用来源", text: "缺少来源" } },
  { kind: "Evidence", anchor: "找回路径解释段落", status: "已确认", anchorLabel: "锚定 §2", text: "“四条找回路径对应搜索 / 浏览 / 联想 / 索引四种心智”在 2023-10 的原始笔记里有原文支撑。" },
  { kind: "Example", anchor: "PKM pipeline table", status: "未确认", anchorLabel: "锚定 §表格", text: "PKM pipeline 表格把获取 → 管理 → 输出 → 回顾落成了可执行的阶段划分。" },
  { kind: "Action", anchor: "写回事务列表", status: "未确认", anchorLabel: "锚定 §4", text: "为 [[表格工具]] 补一节“何时升级为 Base”的判断标准。" },
  { kind: "Decision", anchor: "Composer 定位段落", status: "已确认", anchorLabel: "锚定 §导语", text: "Composer 视图不复制 Atlas 的 outline / search / 评论导航。" },
  { kind: "Question", anchor: "AI 块旁动作 checklist", status: "未确认", anchorLabel: "锚定 §5", text: "多个知识库之间的 diff 和自动关联，最小可用版本长什么样？" },
];

function initInsights() {
  INSIGHTS.forEach((insight, index) => {
    const block = paper.querySelector(`.doc-block[data-block-title="${insight.anchor}"]`);
    if (!block) return;
    const badges = block.querySelector(":scope > .block-badges");
    if (!badges) return;
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `insight-badge kind-${insight.kind.toLowerCase()}`;
    badge.dataset.insightIndex = String(index);
    badge.textContent = `${insight.kind} · ${insight.status}`;
    badge.title = insight.text;
    (badges.querySelector(".block-state-row") || badges).appendChild(badge);
  });
}

function insightHeadMeta(insight) {
  return `${insight.anchorLabel} · ${insight.status} · Document Copilot run dc-0709-18 · 2026-07-09`;
}

function toggleInsightPanel(block, insight, badge) {
  let panel = block.querySelector(":scope > .insight-panel");
  if (panel && panel.dataset.insightIndex === badge.dataset.insightIndex && !panel.hidden) {
    panel.hidden = true;
    syncOpenEditorState(block);
    return;
  }
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "insight-card insight-panel";
    block.appendChild(panel);
  }
  panel.dataset.insightIndex = badge.dataset.insightIndex;
  panel.hidden = false;
  const issue = insight.issue
    ? `<button class="issue-pill is-inline" data-ai-label="${escapeHtml(insight.issue.label)}" data-reason="${escapeHtml(insight.issue.reason)}">${escapeHtml(insight.issue.text)}</button>`
    : "";
  panel.innerHTML = `
    <div class="insight-head">
      <span class="insight-kind kind-${insight.kind.toLowerCase()}">${escapeHtml(insight.kind)}</span>
      <small>${escapeHtml(insightHeadMeta(insight))}</small>
    </div>
    <p>${escapeHtml(insight.text)}</p>
    ${issue}
    <div class="ai-card-actions">
      <button data-action="review-insight">复核 insight</button>
      <button data-action="confirm-insight">${insight.status === "已确认" ? "取消确认" : "标记已确认"}</button>
      <button data-action="close-insight">关闭</button>
    </div>
  `;
  syncOpenEditorState(block);
  setLive(`${insight.kind} insight`, "insight 是 Copilot 生成的旁注，锚定在这个正文块上；未确认的 insight 不写回 Markdown，导航入口在 Atlas 面板。");
}

function initControlLabels() {
  paper.querySelectorAll('[data-action="move"]').forEach((button) => {
    button.title = button.closest(".micro-block") ? "移动公式" : "按住拖动";
  });
  paper.querySelectorAll('[data-action="insert"]').forEach((button) => {
    button.title = "在下方插入";
  });
  paper.querySelectorAll('.block-controls [data-action="ai"], .micro-controls [data-action="ai"]').forEach((button) => {
    button.title = "AI 动作菜单 / 自定义指令";
  });
}

function handleMicroAction(action, micro, button, block) {
  pulseButton(button, block, action);
  micro.classList.add("is-micro-active");
  clearTimeout(micro.microTimer);
  micro.microTimer = setTimeout(() => micro.classList.remove("is-micro-active"), 900);

  const title = micro.dataset.microTitle || "子块";
  if (action === "insert") return showInsertMenu(button, block, micro);
  if (action === "comment") {
    micro.classList.add("has-comment");
    block.dataset.commentScope = `公式「${title}」`;
    handleComment(block);
    const editor = block.querySelector(":scope > .comment-editor");
    const label = editor?.querySelector("label");
    if (label) label.textContent = `公式评论 · ${title}`;
    return;
  }
  if (action === "ai") return toggleAiMenu(block, micro);
  if (action === "move") {
    setLive("移动子块", `正在移动“${escapeHtml(title)}”。子块移动时仍保持它的 Markdown 源不变。`);
    return showToast("子块移动预览");
  }
}

function showInsertMenu(button, block, micro = null) {
  const strip = getOrCreateInsertStrip(block);
  if (!strip.hidden) {
    closeInsertStrip(block);
    return;
  }

  paper.querySelectorAll(".insert-strip:not([hidden])").forEach((other) => {
    other.hidden = true;
    syncOpenEditorState(other.closest(".doc-block"));
  });
  if (micro) {
    strip.dataset.afterMicro = micro.dataset.microTitle || "公式";
    strip.querySelector("span").textContent = `在 ${micro.dataset.microTitle || "该公式"} 后插入`;
  } else {
    delete strip.dataset.afterMicro;
    strip.querySelector("span").textContent = "在下方插入";
  }
  strip.hidden = false;
  syncOpenEditorState(block);
  setLive("在当前块下方插入", micro ? `菜单贴在 ${escapeHtml(micro.dataset.microTitle || "该公式")} 的尾部，表示新对象会插入到这个子块之后。` : "菜单贴在正文块尾部，表示新内容会插入到这个 block 后面。");
}

function getOrCreateInsertStrip(block) {
  let strip = block.querySelector(":scope > .insert-strip");
  if (strip) return strip;

  strip = document.createElement("div");
  strip.className = "insert-strip";
  strip.hidden = true;
  strip.innerHTML = `
    <span>在下方插入</span>
    <button data-insert-kind="paragraph">段落</button>
    <button data-insert-kind="heading">标题</button>
    <button data-insert-kind="list">列表</button>
    <button data-insert-kind="quote">引用</button>
    <button data-insert-kind="callout">Callout</button>
    <button data-insert-kind="formula">公式</button>
    <button data-insert-kind="image">图片</button>
    <button data-insert-kind="table">表格</button>
    <button data-insert-kind="base">Base</button>
    <button data-insert-kind="canvas">Canvas</button>
    <button data-insert-kind="excalidraw">Excalidraw</button>
    <button data-insert-kind="ai">AI 续写</button>
  `;
  block.appendChild(strip);
  return strip;
}

function closeInsertStrip(block) {
  const strip = block.querySelector(":scope > .insert-strip");
  if (strip) strip.hidden = true;
  syncOpenEditorState(block);
  setLive("插入菜单已关闭", "正文回到干净阅读状态。");
}

function handleRemove(block, button) {
  block.classList.toggle("is-dimmed");
  const removed = block.classList.contains("is-dimmed");
  button.title = removed ? "恢复此块（删除预览未写入）" : "删除";
  setLive(removed ? "删除预览" : "删除已撤销", removed ? "块被置灰但还没有写入源文件；再点一次减号即可恢复。真实实现里需要确认或支持 Undo。" : "块恢复显示。");
  showToast(removed ? "删除预览：未写入 Markdown，再点一次恢复" : "已撤销删除预览");
}

function getOrCreateCommentEditor(block) {
  let editor = block.querySelector(":scope > .comment-editor");
  if (editor) return editor;

  editor = document.createElement("div");
  editor.className = "comment-editor";
  editor.hidden = true;
  editor.innerHTML = `
    <label>块评论 · 可作为 Copilot 上下文</label>
    <textarea placeholder="写下评论、修改意见，或给 AI 的局部指令..."></textarea>
    <div class="comment-actions">
      <button data-action="save-comment">保存评论</button>
      <button data-action="cancel-comment">取消</button>
    </div>
  `;
  block.appendChild(editor);
  return editor;
}

function handleComment(block) {
  const editor = getOrCreateCommentEditor(block);
  if (!editor.hidden) {
    editor.hidden = true;
    syncOpenEditorState(block);
    setLive("评论已收起", "评论草稿仍保留；再次点击评论按钮可以继续编辑。 ");
    showToast("评论已收起");
    return;
  }
  editor.hidden = false;
  syncOpenEditorState(block);
  const textarea = editor.querySelector("textarea");
  if (!textarea.value && block.dataset.commentDraft) textarea.value = block.dataset.commentDraft;
  textarea.focus();
  setLive("评论输入", `正在给“${escapeHtml(block.dataset.blockTitle || "当前块")}”写评论。评论会绑定当前 block source range，并可作为 Copilot 的局部上下文。`);
  showToast("评论输入框已打开");
}

function saveComment(block) {
  const editor = block.querySelector(":scope > .comment-editor");
  const textarea = editor?.querySelector("textarea");
  if (!editor || !textarea) return;

  const value = textarea.value.trim();
  block.dataset.commentDraft = value;
  block.classList.toggle("has-comment", Boolean(value));
  editor.hidden = true;
  syncOpenEditorState(block);
  const scope = block.dataset.commentScope ? `${block.dataset.commentScope}的选区` : "当前块";
  setLive(value ? "评论已保存" : "空评论已关闭", value ? `评论绑定到${scope}。内容：${escapeHtml(value)}` : "没有写入评论。");
  showToast(value ? `评论已保存到${scope}` : "评论为空，未保存");
}

function cancelComment(block) {
  const editor = block.querySelector(":scope > .comment-editor");
  if (editor) editor.hidden = true;
  syncOpenEditorState(block);
  setLive("评论已取消", "评论草稿关闭，正文内容不受影响。");
  showToast("已取消评论");
}

function initBlockDragHandles() {
  document.addEventListener("pointerdown", (event) => {
    const button = event.target.closest('[data-action="move"]');
    if (!button) return;

    const micro = button.closest(".micro-block");
    if (micro) {
      const parentBlock = micro.closest(".doc-block");
      blockDragState = {
        block: micro,
        parentBlock,
        button,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        isMicro: true,
      };
      button.setPointerCapture?.(event.pointerId);
      return;
    }

    const block = button.closest(".doc-block");
    if (!block) return;
    if (block.dataset.blockKind === "metadata") {
      showToast("Frontmatter 固定在文档头部，不能拖动");
      return;
    }

    blockDragState = {
      block,
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    button.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;

    const distance = Math.hypot(event.clientX - blockDragState.startX, event.clientY - blockDragState.startY);
    if (!blockDragState.dragging && distance < 7) return;

    event.preventDefault();
    const { block, isMicro, parentBlock } = blockDragState;
    if (!blockDragState.dragging) {
      blockDragState.dragging = true;
      suppressNextMoveClick = true;
      block.classList.add("is-dragging");
      document.body.classList.add("is-block-dragging");
      setLive(isMicro ? "正在拖动公式" : "正在拖动块", isMicro ? "公式子块会在当前公式组内原地重排，松开后保留新顺序。" : "松开后保留当前顺序；接近视口上下边缘会自动滚动。真实实现里会生成 source range reorder transaction。");
    }

    const stage = document.querySelector(".document-stage");
    if (stage) {
      const stageRect = stage.getBoundingClientRect();
      if (event.clientY < stageRect.top + 80) stage.scrollTop -= 16;
      else if (event.clientY > stageRect.bottom - 80) stage.scrollTop += 16;
    }

    const container = isMicro ? block.parentElement : paper;
    const selector = isMicro ? ":scope > .micro-block:not(.is-dragging)" : ":scope > .doc-block:not(.is-dragging)";
    const siblings = Array.from(container.querySelectorAll(selector));
    const before = siblings.find((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });

    if (before) {
      container.insertBefore(block, before);
    } else {
      container.appendChild(block);
    }
    setFocusedBlock(parentBlock || block);
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;

    const { block, parentBlock, button, dragging, isMicro } = blockDragState;
    button.releasePointerCapture?.(event.pointerId);
    block.classList.remove("is-dragging");
    document.body.classList.remove("is-block-dragging");
    blockDragState = null;

    if (dragging) {
      const title = isMicro ? block.dataset.microTitle || "公式" : block.dataset.blockTitle || "当前块";
      setLive(isMicro ? "公式重排完成" : "拖动完成", `“${escapeHtml(title)}”已经在 mock 中完成重排。真实写入时要保持 Markdown range mapping。`);
      showToast(isMicro ? "公式顺序已更新" : "拖动完成：块顺序已更新");
      if (parentBlock) setFocusedBlock(parentBlock);
      setTimeout(() => {
        suppressNextMoveClick = false;
      }, 80);
      return;
    }

    suppressNextMoveClick = false;
  });

  document.addEventListener("pointercancel", (event) => {
    if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;
    const { block, button } = blockDragState;
    button.releasePointerCapture?.(event.pointerId);
    block.classList.remove("is-dragging");
    document.body.classList.remove("is-block-dragging");
    blockDragState = null;
    suppressNextMoveClick = false;
    setLive("拖动已取消", "顺序保持不变，可以重新按住拖动柄操作。");
  });
}

function handleMove(block) {
  block.classList.add("is-drag-preview");
  setLive("按住拖动", "按住左侧 grip 并上下拖动来移动 block；单击只显示提示，不再弹出上移/置顶菜单。");
  showToast("按住拖动这个 block");
  setTimeout(() => block.classList.remove("is-drag-preview"), 520);
}

function columnName(cell) {
  const header = table?.tHead?.rows[0]?.cells[cell.cellIndex];
  return header ? header.textContent.trim() : `第 ${cell.cellIndex + 1} 列`;
}

function setCurrentTableCell(cell, preserveAnchor = false) {
  if (!cell) return null;
  currentCell?.classList.remove("is-current-cell");
  currentCell = cell;
  if (!preserveAnchor) tableSelectionAnchor = cell;
  cell.classList.add("is-current-cell");
  return cell;
}

function ensureCurrentTableCell(preferredColumn = 1) {
  if (currentCell?.isConnected && currentCell.closest("table") === table) return currentCell;
  const firstRow = table?.tBodies[0]?.rows[0];
  if (!firstRow) return null;
  return setCurrentTableCell(firstRow.cells[preferredColumn] || firstRow.cells[0]);
}

function setTableToolPressed(action, pressed, label = "") {
  const button = table?.closest(".table-surface")?.querySelector(`[data-action="${action}"]`);
  if (!button) return;
  button.classList.toggle("is-active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
  if (label) button.title = label;
}

function addTableRow() {
  const body = table.querySelector("tbody");
  const row = document.createElement("tr");
  const columns = table.tHead.rows[0].cells.length;
  row.innerHTML = Array.from({ length: columns }, (_, index) => `<td>${index === 0 ? "新增阶段" : "待填写"}</td>`).join("");
  body.appendChild(row);
  setLive("表格新增行", "新增行已直接进入表格。普通表格仍可回写 Markdown table。");
  showToast("已新增一行");
}

function addTableColumn() {
  const colgroup = table.querySelector("colgroup");
  if (colgroup) {
    colgroup.querySelectorAll("col").forEach((col) => {
      col.style.width = "";
    });
    colgroup.appendChild(document.createElement("col"));
  }
  table.querySelectorAll("tr").forEach((row, index) => {
    const cell = document.createElement(index === 0 ? "th" : "td");
    cell.textContent = index === 0 ? "备注" : "新列";
    if (index !== 0) cell.contentEditable = "true";
    row.appendChild(cell);
  });
  setLive("表格新增列", "新增列会影响 Markdown 表格源；真实实现需要同步更新分隔行和列宽。");
  showToast("已新增一列");
}

function removeTableRow() {
  const body = table.querySelector("tbody");
  const rows = body.querySelectorAll("tr");
  if (rows.length <= 1) return showToast("至少保留一行");

  const selectedRow = currentCell?.closest("tbody tr");
  const target = selectedRow || rows[rows.length - 1];
  const label = target.cells[0]?.textContent?.trim() || "最后一行";
  if (target.contains(currentCell)) currentCell = null;
  target.remove();
  setLive("表格删除行", `已删除“${escapeHtml(label)}”所在行（优先当前选中行，未选中时删除最后一行）。真实实现里应进入 Obsidian undo stack。`);
  showToast(`已删除行：${label}`);
}

const alignSteps = ["left", "center", "right"];

function alignTableColumn() {
  const targetCell = ensureCurrentTableCell();
  if (!targetCell) return showToast("表格里没有可对齐的列");
  const block = table.closest(".doc-block");
  const oldMarkup = table.innerHTML;
  const index = targetCell.cellIndex;
  const current = table.dataset[`align${index}`] || "left";
  const next = alignSteps[(alignSteps.indexOf(current) + 1) % alignSteps.length];
  table.dataset[`align${index}`] = next;
  table.querySelectorAll("tr").forEach((row) => {
    const cell = row.cells[index];
    if (cell) cell.style.textAlign = next;
  });
  refreshComposerTableSource();
  markAccepted(block, `表格列对齐 · ${next}`, () => {
    table.innerHTML = oldMarkup;
    if (current === "left") delete table.dataset[`align${index}`];
    else table.dataset[`align${index}`] = current;
    currentCell = null;
    refreshComposerTableSource();
  });
  setTableToolPressed("align-table", true, `${columnName(targetCell)} · ${next}`);
  setLive("列对齐已写入", `“${escapeHtml(columnName(targetCell))}”列已切换为 ${next}；Markdown 分隔行同步变为 ${next === "center" ? ":---:" : next === "right" ? "---:" : "---"}，并可从 History 回滚。`);
  showToast(`“${columnName(targetCell)}”已${next === "center" ? "居中" : next === "right" ? "右对齐" : "左对齐"} · 可回滚`);
}

function sortTableByCurrentColumn() {
  const targetCell = ensureCurrentTableCell();
  if (!targetCell) return showToast("表格里没有可排序的列");
  const block = table.closest(".doc-block");
  const oldMarkup = table.innerHTML;
  const oldSortColumn = table.dataset.sortColumn || "";
  const oldSortDirection = table.dataset.sortDirection || "";
  const index = targetCell.cellIndex;
  const body = table.querySelector("tbody");
  const rows = Array.from(body.rows).filter((row) => !row.classList.contains("table-formula-row"));
  const formulaRow = body.querySelector(".table-formula-row");
  const nextDirection = table.dataset.sortColumn === String(index) && table.dataset.sortDirection === "asc" ? "desc" : "asc";
  rows.sort((a, b) => (a.cells[index]?.textContent || "").localeCompare(b.cells[index]?.textContent || "", "zh", { numeric: true }) * (nextDirection === "asc" ? 1 : -1));
  rows.forEach((row) => body.appendChild(row));
  if (formulaRow) body.appendChild(formulaRow);
  table.querySelectorAll("th[aria-sort]").forEach((header) => {
    header.removeAttribute("aria-sort");
    delete header.dataset.sortIndicator;
  });
  const header = table.tHead.rows[0].cells[index];
  header.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");
  header.dataset.sortIndicator = nextDirection === "asc" ? "↑" : "↓";
  table.dataset.sortColumn = String(index);
  table.dataset.sortDirection = nextDirection;
  refreshComposerTableSource();
  markAccepted(block, `表格排序 · ${nextDirection}`, () => {
    table.innerHTML = oldMarkup;
    if (oldSortColumn) table.dataset.sortColumn = oldSortColumn;
    else delete table.dataset.sortColumn;
    if (oldSortDirection) table.dataset.sortDirection = oldSortDirection;
    else delete table.dataset.sortDirection;
    currentCell = null;
    refreshComposerTableSource();
  });
  setTableToolPressed("sort-table", true, `${columnName(targetCell)} · ${nextDirection}`);
  setLive("按列排序已写入", `已按“${escapeHtml(columnName(targetCell))}”列${nextDirection === "asc" ? "升序" : "降序"}重排行；表头箭头显示当前方向，公式汇总行保持在末尾，并可从 History 回滚。`);
  showToast(`“${columnName(targetCell)}”${nextDirection === "asc" ? "升序 ↑" : "降序 ↓"} · 可回滚`);
}

function refreshComposerTableSource() {
  const block = table?.closest(".doc-block");
  if (!block || !table) return;
  refreshTableSource(block, table);
}

function transposeComposerTable() {
  if (!table) return;
  const oldMarkup = table.innerHTML;
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => Array.from(row.cells).map((cell) => cell.textContent.trim()));
  if (rows.length < 2) return showToast("至少需要表头和一行数据才能转置");
  const width = Math.max(...rows.map((row) => row.length));
  const transposed = Array.from({ length: width }, (_, column) => rows.map((row) => row[column] || ""));
  const [header, ...body] = transposed;
  table.innerHTML = `
    <colgroup>${header.map(() => "<col>").join("")}</colgroup>
    <thead><tr>${header.map((cell) => `<th scope="col" contenteditable="true">${escapeHtml(cell)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td contenteditable="true">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  `;
  currentCell = null;
  refreshComposerTableSource();
  const block = table.closest(".doc-block");
  markAccepted(block, "转置表格", () => {
    table.innerHTML = oldMarkup;
    currentCell = null;
    refreshComposerTableSource();
  });
  setLive("表格已转置", "行与列已经原地互换，当前表头和单元格仍可编辑；这次转换已进入 Ambient 回滚记录。 ");
  showToast("表格已原地转置 · 可回滚");
}

function clearTableCellSelection() {
  const rangeClasses = ["is-range-cell", "is-range-top", "is-range-right", "is-range-bottom", "is-range-left", "is-discrete-cell"];
  table?.querySelectorAll(".is-range-cell, .is-discrete-cell").forEach((cell) => {
    cell.classList.remove(...rangeClasses);
    cell.removeAttribute("aria-selected");
  });
  selectedTableCells = [];
  selectedTableRange = null;
  selectedTableMode = null;
  delete table?.dataset.cellRange;
  delete table?.dataset.cellSelectionMode;
}

function tableCellCoordinates(cell) {
  const rows = Array.from(table.rows);
  return {
    row: rows.indexOf(cell.parentElement),
    column: cell.cellIndex,
  };
}

function selectedTableBounds(cells = selectedTableCells) {
  if (!cells.length) return null;
  const positions = cells.map(tableCellCoordinates).filter(({ row, column }) => row >= 0 && column >= 0);
  if (!positions.length) return null;
  return {
    rowMin: Math.min(...positions.map(({ row }) => row)),
    rowMax: Math.max(...positions.map(({ row }) => row)),
    colMin: Math.min(...positions.map(({ column }) => column)),
    colMax: Math.max(...positions.map(({ column }) => column)),
  };
}

function paintSelectedTableCells(mode = selectedTableMode || "range") {
  const rangeClasses = ["is-range-cell", "is-range-top", "is-range-right", "is-range-bottom", "is-range-left", "is-discrete-cell"];
  table.querySelectorAll(".is-range-cell, .is-discrete-cell").forEach((cell) => {
    cell.classList.remove(...rangeClasses);
    cell.removeAttribute("aria-selected");
  });
  if (!selectedTableCells.length) {
    selectedTableRange = null;
    selectedTableMode = null;
    delete table.dataset.cellRange;
    delete table.dataset.cellSelectionMode;
    return;
  }
  selectedTableMode = mode;
  selectedTableRange = selectedTableBounds();
  selectedTableCells.forEach((cell) => {
    const { row, column } = tableCellCoordinates(cell);
    cell.classList.add("is-range-cell");
    if (mode === "discrete") {
      cell.classList.add("is-discrete-cell", "is-range-top", "is-range-right", "is-range-bottom", "is-range-left");
    } else {
      if (row === selectedTableRange.rowMin) cell.classList.add("is-range-top");
      if (row === selectedTableRange.rowMax) cell.classList.add("is-range-bottom");
      if (column === selectedTableRange.colMin) cell.classList.add("is-range-left");
      if (column === selectedTableRange.colMax) cell.classList.add("is-range-right");
    }
    cell.setAttribute("aria-selected", "true");
  });
  const rowCount = selectedTableRange.rowMax - selectedTableRange.rowMin + 1;
  const columnCount = selectedTableRange.colMax - selectedTableRange.colMin + 1;
  table.dataset.cellRange = mode === "discrete" ? `discrete:${selectedTableCells.length}` : `${rowCount}x${columnCount}`;
  table.dataset.cellSelectionMode = mode;
}

function toggleTableCellSelection(cell) {
  const index = selectedTableCells.indexOf(cell);
  if (index >= 0) selectedTableCells.splice(index, 1);
  else selectedTableCells.push(cell);
  tableSelectionAnchor = cell;
  setCurrentTableCell(cell, true);
  paintSelectedTableCells("discrete");
  if (!selectedTableCells.length) return closeSelectionSurface();
  setLive("不连续单元格选择", `已选择 ${selectedTableCells.length} 个单元格；继续按住 ⌘ / Ctrl 点击可追加或取消。形成完整矩形后可以合并。`);
  scheduleSelectionToolbar();
}

function mergeableTableSelection(cells = selectedTableCells) {
  if (cells.length < 2) return { valid: false, reason: "至少选择两个单元格" };
  const sections = new Set(cells.map((cell) => cell.parentElement.parentElement));
  if (sections.size !== 1) return { valid: false, reason: "表头与正文不能跨区合并" };
  const section = cells[0].parentElement.parentElement;
  const rows = Array.from(section.rows);
  const rowIndexes = cells.map((cell) => rows.indexOf(cell.parentElement));
  const columnIndexes = cells.map((cell) => cell.cellIndex);
  const rowMin = Math.min(...rowIndexes);
  const rowMax = Math.max(...rowIndexes);
  const colMin = Math.min(...columnIndexes);
  const colMax = Math.max(...columnIndexes);
  const expected = (rowMax - rowMin + 1) * (colMax - colMin + 1);
  if (cells.length !== expected) return { valid: false, reason: "当前是不连续选区；补齐矩形中的空缺单元格后即可合并" };
  return { valid: true, section, rows, rowMin, rowMax, colMin, colMax };
}

function closeMergeSelectionMode(message = "") {
  tableMergeMode = false;
  tableMergeFirstCell = null;
  delete table.dataset.mergeMode;
  table.closest(".table-surface")?.querySelector("[data-table-merge-prompt]")?.remove();
  setTableToolPressed("merge-cells", false, "合并选中的矩形单元格");
  if (message) showToast(message);
}

function updateMergePrompt(detail) {
  const surface = table.closest(".table-surface");
  let prompt = surface.querySelector("[data-table-merge-prompt]");
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.className = "table-tool-prompt";
    prompt.dataset.tableMergePrompt = "";
    prompt.innerHTML = `<span><b>合并模式</b><small data-merge-detail></small></span><button type="button" data-action="cancel-merge-mode">取消</button>`;
    table.before(prompt);
  }
  prompt.querySelector("[data-merge-detail]").textContent = detail;
}

function beginMergeSelectionMode() {
  if (selectedTableCells.length > 1) return mergeSelectedCells();
  tableMergeMode = true;
  table.dataset.mergeMode = "true";
  setTableToolPressed("merge-cells", true, "正在选择要合并的矩形区域");
  clearTableCellSelection();
  tableMergeFirstCell = currentCell?.isConnected ? currentCell : null;
  if (tableMergeFirstCell) {
    selectTableCellRange(tableMergeFirstCell, tableMergeFirstCell, false);
    updateMergePrompt(`已以“${tableMergeFirstCell.textContent.trim()}”为起点；再点同一表头或正文区域中的另一个格。`);
  } else {
    updateMergePrompt("依次点击矩形区域的两个对角格；第二次点击后直接合并并写入 History。");
  }
  setLive("选择合并区域", "合并不能猜测目标。依次点两个对角格来确定矩形范围；普通 Markdown table 不支持 span，完成后该块会保真升级为原生 HTML table。");
  showToast(tableMergeFirstCell ? "再点另一个格完成合并" : "依次点两个对角格");
}

function selectTableCellRange(anchor, target, announce = true) {
  clearTableCellSelection();
  if (!anchor || !target || anchor.closest("table") !== table || target.closest("table") !== table) return;
  const rows = Array.from(table.rows);
  const startRow = rows.indexOf(anchor.parentElement);
  const endRow = rows.indexOf(target.parentElement);
  if (startRow < 0 || endRow < 0) return;
  const rowMin = Math.min(startRow, endRow);
  const rowMax = Math.max(startRow, endRow);
  const colMin = Math.min(anchor.cellIndex, target.cellIndex);
  const colMax = Math.max(anchor.cellIndex, target.cellIndex);
  for (let rowIndex = rowMin; rowIndex <= rowMax; rowIndex += 1) {
    for (let column = colMin; column <= colMax; column += 1) {
      const cell = rows[rowIndex]?.cells[column];
      if (!cell) continue;
      selectedTableCells.push(cell);
    }
  }
  paintSelectedTableCells("range");
  const rowCount = rowMax - rowMin + 1;
  const columnCount = colMax - colMin + 1;
  table.dataset.cellRange = `${rowCount}x${columnCount}`;
  if (announce) {
    setLive("表格区域已选择", `已按单元格选中 ${rowCount} 行 × ${columnCount} 列；可以继续横向、纵向或跨行列扩展。`);
  }
}

function mergeSelectedCells() {
  if (selectedTableCells.length < 2) return beginMergeSelectionMode();
  const merge = mergeableTableSelection();
  if (!merge.valid) {
    closeMergeSelectionMode();
    return showToast(merge.reason);
  }
  const { rows, rowMin, rowMax, colMin, colMax } = merge;
  const block = table.closest(".doc-block");
  const oldMarkup = table.innerHTML;
  const anchor = rows[rowMin].cells[colMin];
  const values = selectedTableCells.map((cell) => cell.textContent.trim()).filter(Boolean);
  selectedTableCells.filter((cell) => cell !== anchor).forEach((cell) => cell.remove());
  anchor.colSpan = colMax - colMin + 1;
  anchor.rowSpan = rowMax - rowMin + 1;
  anchor.textContent = values.join(" · ");
  clearTableCellSelection();
  closeMergeSelectionMode();
  currentCell = anchor;
  anchor.classList.add("is-current-cell");
  refreshComposerTableSource();
  markAccepted(block, "合并表格单元格", () => {
    table.innerHTML = oldMarkup;
    currentCell = null;
    clearTableCellSelection();
    refreshComposerTableSource();
  });
  setLive("复杂表格已保真写回", "普通 Markdown table 不支持 rowspan / colspan，因此这次变更把源升级为 Markdown 文件中的原生 HTML <table>；Composer 仍渲染同一张真实表格。 ");
  showToast("已合并单元格 · 源格式升级为 HTML table");
}

function chartDataFromTable() {
  const labels = [];
  const values = [];
  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    labels.push(row.cells[0]?.textContent.trim() || `第 ${labels.length + 1} 行`);
    const count = Array.from(row.cells).slice(1).reduce((sum, cell) => {
      const parts = cell.textContent.split(/[、，,;/]+/).map((item) => item.trim()).filter(Boolean);
      return sum + Math.max(1, parts.length);
    }, 0);
    values.push(count);
  });
  return { labels, values };
}

function chartBlockSource(type, data) {
  return [
    "```chart",
    `type: ${type}`,
    "metric: item-count",
    `labels: [${data.labels.join(", ")}]`,
    `values: [${data.values.join(", ")}]`,
    "```",
  ].join("\n");
}

function chartSvgMarkup(type, data) {
  const colors = ["#7057d6", "#2f7dd1", "#20a275", "#e39b32", "#d66570"];
  const width = 680;
  const height = 286;
  const max = Math.max(...data.values, 1);
  if (type === "pie") {
    const total = data.values.reduce((sum, value) => sum + value, 0) || 1;
    let offset = 0;
    const slices = data.values.map((value, index) => {
      const portion = (value / total) * 100;
      const circle = `<circle cx="176" cy="138" r="82" pathLength="100" fill="none" stroke="${colors[index % colors.length]}" stroke-width="56" stroke-dasharray="${portion} ${100 - portion}" stroke-dashoffset="${-offset}" />`;
      offset += portion;
      return circle;
    }).join("");
    const legend = data.labels.map((label, index) => `<g transform="translate(330 ${76 + index * 42})"><rect width="12" height="12" rx="3" fill="${colors[index % colors.length]}"/><text x="22" y="11">${escapeHtml(label)} · ${data.values[index]}</text></g>`).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="表格条目数量饼图"><g transform="rotate(-90 176 138)">${slices}</g><circle cx="176" cy="138" r="50" fill="#fff"/><text x="176" y="134" text-anchor="middle" class="chart-total">${total}</text><text x="176" y="154" text-anchor="middle" class="chart-sub">条目</text>${legend}</svg>`;
  }
  const plotLeft = 62;
  const plotTop = 28;
  const plotHeight = 190;
  const step = (width - plotLeft - 30) / Math.max(1, data.labels.length);
  const points = data.values.map((value, index) => {
    const x = plotLeft + step * index + step / 2;
    const y = plotTop + plotHeight - (value / max) * plotHeight;
    return { x, y, value, label: data.labels[index] };
  });
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = plotTop + plotHeight * ratio;
    const value = Math.round(max * (1 - ratio));
    return `<path d="M${plotLeft} ${y}H${width - 24}"/><text x="50" y="${y + 4}" text-anchor="end">${value}</text>`;
  }).join("");
  const labels = points.map((point) => `<text x="${point.x}" y="252" text-anchor="middle">${escapeHtml(point.label)}</text>`).join("");
  if (type === "line") {
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const dots = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5"/><text x="${point.x}" y="${point.y - 11}" text-anchor="middle" class="chart-value">${point.value}</text>`).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="表格条目数量折线图"><g class="chart-grid">${grid}</g><polyline class="chart-line" points="${line}"/><g class="chart-dots">${dots}</g><g class="chart-axis-labels">${labels}</g></svg>`;
  }
  const bars = points.map((point) => {
    const barWidth = Math.min(72, step * .56);
    const barHeight = plotTop + plotHeight - point.y;
    return `<rect x="${point.x - barWidth / 2}" y="${point.y}" width="${barWidth}" height="${barHeight}" rx="7" fill="${colors[points.indexOf(point) % colors.length]}"/><text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="chart-value">${point.value}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="表格条目数量柱状图"><g class="chart-grid">${grid}</g>${bars}<g class="chart-axis-labels">${labels}</g></svg>`;
}

function renderChartDraft(block, type) {
  const data = block._chartData;
  block.dataset.chartType = type;
  block.dataset.source = chartBlockSource(type, data);
  block.querySelectorAll("[data-chart-type]").forEach((button) => {
    const active = button.dataset.chartType === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.setAttribute("aria-pressed", String(active));
  });
  block.querySelector("[data-chart-canvas]").innerHTML = chartSvgMarkup(type, data);
  const source = block.querySelector("[data-chart-source]");
  if (source) source.textContent = block.dataset.source;
}

function openTableChartDraft() {
  const tableBlock = table.closest(".doc-block");
  tableBlock.parentElement.querySelector(":scope > .chart-draft-block")?.remove();
  const data = chartDataFromTable();
  const draft = document.createElement("section");
  draft.className = "doc-block chart-block chart-draft-block has-open-editor";
  draft.dataset.blockKind = "chart";
  draft.dataset.blockTitle = "PKM pipeline chart";
  draft.contentEditable = "false";
  draft._chartData = data;
  draft.innerHTML = `
    <div class="chart-draft-status"><span>新 Chart Block · 尚未写入</span><small>从表格可见内容程序统计：每阶段条目数</small></div>
    <div class="chart-shell">
      <div class="object-toolbar chart-mode-strip" role="tablist" aria-label="图表类型"><button type="button" role="tab" data-action="switch-chart" data-chart-type="bar">柱状图</button><button type="button" role="tab" data-action="switch-chart" data-chart-type="line">折线图</button><button type="button" role="tab" data-action="switch-chart" data-chart-type="pie">饼图</button></div>
      <div class="chart-render" data-chart-canvas></div>
      <div class="chart-source-contract"><span><svg><use href="#i-code"></use></svg>Markdown source</span><code data-chart-source></code><small>文件保存为 fenced chart code block；Composer renderer 显示真实图表。</small></div>
    </div>
    <div class="chart-draft-actions"><button type="button" data-chart-draft="cancel">取消</button><button type="button" class="is-primary" data-chart-draft="accept"><svg><use href="#i-check"></use></svg>接受为新块</button></div>
  `;
  tableBlock.after(draft);
  renderChartDraft(draft, "bar");
  draft.addEventListener("click", (event) => {
    const action = event.target.closest("[data-chart-draft]")?.dataset.chartDraft;
    if (action === "cancel") {
      draft.remove();
      return showToast("图表候选已取消");
    }
    if (action !== "accept") return;
    draft.classList.remove("chart-draft-block", "has-open-editor");
    draft.querySelector(".chart-draft-status")?.remove();
    draft.querySelector(".chart-draft-actions")?.remove();
    draft.dataset.initialSource = draft.dataset.source;
    decorateBlock(draft);
    markAccepted(draft, "表格生成图表", () => draft.remove());
    setFocusedBlock(draft);
    setLive("Chart Block 已写入", "Markdown 保存 fenced chart code block；Composer 通过 renderer 显示柱状图、折线图或饼图，源数据仍可检查。 ");
    showToast("已接受 Chart Block");
  });
  draft.scrollIntoView({ behavior: "smooth", block: "center" });
  setLive("表格生成图表", "先创建独立 Chart Block 候选；切换图形只改 code block 配置，接受后才写入 Markdown。 ");
}

function handleTableTool(action) {
  if (action === "transpose-table") return transposeComposerTable();
  if (action === "merge-cells") return beginMergeSelectionMode();
  if (action === "chart-table") return openTableChartDraft();
}

function tableColumnLetter(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function tableFormulaValues(index) {
  return Array.from(table.tBodies[0]?.rows || [])
    .filter((row) => !row.classList.contains("table-formula-row"))
    .map((row) => row.cells[index]?.textContent.trim() || "");
}

function evaluateTableFormula(expression, index) {
  const values = tableFormulaValues(index);
  if (/^=COUNT\(/i.test(expression)) return values.filter((value) => Number.isFinite(Number(value)) && value !== "").length;
  if (/^=COUNTUNIQUE\(/i.test(expression)) return new Set(values.filter(Boolean)).size;
  return values.filter(Boolean).length;
}

function closeTableFormulaEditor() {
  const editor = table.closest(".table-surface")?.querySelector("[data-table-formula-editor]");
  editor?.remove();
  setTableToolPressed("formula-table", false, "为当前列创建可保存的公式汇总");
  syncOpenEditorState(table.closest(".doc-block"));
}

function openTableFormulaEditor() {
  const targetCell = ensureCurrentTableCell();
  if (!targetCell) return showToast("表格里没有可计算的列");
  closeTableFormulaEditor();
  const block = table.closest(".doc-block");
  const surface = table.closest(".table-surface");
  const column = targetCell.cellIndex;
  const letter = tableColumnLetter(column);
  const endRow = tableFormulaValues(column).length + 1;
  const editor = document.createElement("section");
  editor.className = "table-formula-editor";
  editor.dataset.tableFormulaEditor = "";
  editor.dataset.formulaColumn = String(column);
  editor.innerHTML = `
    <header>
      <span><b><i>fx</i> ${escapeHtml(columnName(targetCell))}</b><small>计算结果先在此预览；应用后写入表格汇总行与 TBLFM 源注释</small></span>
      <button type="button" data-action="close-table-formula" aria-label="关闭公式编辑器"><svg><use href="#i-x"></use></svg></button>
    </header>
    <div class="table-formula-body">
      <label><span>公式</span><input data-table-formula-input value="=COUNTA(${letter}2:${letter}${endRow})" spellcheck="false" /></label>
      <div class="table-formula-presets" aria-label="公式函数">
        <button type="button" data-table-formula-preset="COUNTA">COUNTA</button>
        <button type="button" data-table-formula-preset="COUNT">COUNT</button>
        <button type="button" data-table-formula-preset="COUNTUNIQUE">COUNTUNIQUE</button>
      </div>
      <div class="table-formula-preview"><span>预览结果</span><strong data-table-formula-preview>${evaluateTableFormula(`=COUNTA(${letter}2:${letter}${endRow})`, column)}</strong></div>
    </div>
    <footer><small>作用列：${escapeHtml(columnName(targetCell))} · ${tableFormulaValues(column).length} 个正文单元格</small><button type="button" class="is-primary" data-action="apply-table-formula">应用到汇总行</button></footer>
  `;
  surface.appendChild(editor);
  const input = editor.querySelector("[data-table-formula-input]");
  const updatePreview = () => {
    editor.querySelector("[data-table-formula-preview]").textContent = String(evaluateTableFormula(input.value.trim(), column));
  };
  input.addEventListener("input", updatePreview);
  editor.querySelectorAll("[data-table-formula-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = `=${button.dataset.tableFormulaPreset}(${letter}2:${letter}${endRow})`;
      updatePreview();
      input.focus();
    });
  });
  block.classList.add("has-open-editor");
  setTableToolPressed("formula-table", true, `${columnName(targetCell)} · 公式编辑中`);
  setLive("表格公式编辑器", `当前目标是“${escapeHtml(columnName(targetCell))}”列。COUNTA / COUNT / COUNTUNIQUE 会读取真实单元格；应用后新增汇总行，并在 Markdown 后保存可检查的 TBLFM 注释。`);
  editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
  input.focus();
}

function applyTableFormula() {
  const editor = table.closest(".table-surface")?.querySelector("[data-table-formula-editor]");
  if (!editor) return;
  const block = table.closest(".doc-block");
  const oldMarkup = table.innerHTML;
  const oldFormula = block.dataset.tableFormula || "";
  const column = Number(editor.dataset.formulaColumn);
  const input = editor.querySelector("[data-table-formula-input]");
  const expression = input.value.trim();
  if (!/^=(COUNTA|COUNT|COUNTUNIQUE)\([A-Z]+\d+:[A-Z]+\d+\)$/i.test(expression)) {
    input.setAttribute("aria-invalid", "true");
    showToast("当前演示支持 COUNTA / COUNT / COUNTUNIQUE(range)");
    return;
  }
  const result = evaluateTableFormula(expression, column);
  let formulaRow = table.tBodies[0].querySelector(".table-formula-row");
  if (!formulaRow) {
    formulaRow = document.createElement("tr");
    formulaRow.className = "table-formula-row";
    formulaRow.innerHTML = Array.from({ length: table.tHead.rows[0].cells.length }, (_, index) => `<td>${index === 0 ? "公式汇总" : "—"}</td>`).join("");
    table.tBodies[0].appendChild(formulaRow);
  }
  const resultCell = formulaRow.cells[column];
  resultCell.textContent = String(result);
  resultCell.classList.add("is-formula-cell");
  resultCell.dataset.formula = expression;
  resultCell.title = `${expression} = ${result}`;
  block.dataset.tableFormula = `@>$${column + 1}=${expression.slice(1)}`;
  refreshComposerTableSource();
  closeTableFormulaEditor();
  markAccepted(block, `表格公式 · ${expression}`, () => {
    table.innerHTML = oldMarkup;
    if (oldFormula) block.dataset.tableFormula = oldFormula;
    else delete block.dataset.tableFormula;
    currentCell = null;
    refreshComposerTableSource();
  });
  setLive("表格公式已写入", `${escapeHtml(expression)} 的结果 ${result} 已进入表格汇总行；Markdown source 同步保存 TBLFM 注释，History 可恢复应用前表格。`);
  showToast(`公式结果 ${result} 已写入 · 可回滚`);
}

function moveCellFocus(cell, dx, dy) {
  const body = table.querySelector("tbody");
  const rows = Array.from(body.rows);
  const row = cell.parentElement;
  let rowIndex = rows.indexOf(row);
  let colIndex = cell.cellIndex;

  if (dx) {
    colIndex += dx;
    const columns = row.cells.length;
    if (colIndex < 0) {
      colIndex = columns - 1;
      rowIndex -= 1;
    }
    if (colIndex >= columns) {
      colIndex = 0;
      rowIndex += 1;
    }
  }
  if (dy) rowIndex += dy;

  const target = rows[rowIndex]?.cells[colIndex];
  if (!target) {
    showToast(dy ? "已到表格底部" : "已到表格边界");
    return;
  }
  target.focus();
}

function tableCellAtPoint(x, y) {
  const cell = document.elementFromPoint(x, y)?.closest?.("td, th");
  return cell?.closest("table") === table ? cell : null;
}

function pointHitsTableCellText(cell, x, y) {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const hit = Array.from(range.getClientRects()).some((rect) =>
      x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2
    );
    if (hit) return true;
    node = walker.nextNode();
  }
  return false;
}

function nativeSelectionInsideTableCell(cell) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return cell.contains(range.startContainer) || cell.contains(range.endContainer);
}

function beginTablePointerSelection(event, cell) {
  const extending = event.shiftKey && tableSelectionAnchor?.isConnected;
  const anchor = extending ? tableSelectionAnchor : cell;
  setCurrentTableCell(cell, extending);
  selectTableCellRange(anchor, cell, false);
  tablePointerSelection = {
    pointerId: event.pointerId,
    anchor,
    target: cell,
    moved: false,
  };
  suppressNextTableCellClick = true;
  table.classList.add("is-cell-selecting");
  table.setPointerCapture?.(event.pointerId);
  window.getSelection()?.removeAllRanges();
}

function updateTablePointerSelection(event) {
  if (!tablePointerSelection || event.pointerId !== tablePointerSelection.pointerId) return;
  const cell = tableCellAtPoint(event.clientX, event.clientY);
  if (!cell || cell === tablePointerSelection.target) return;
  tablePointerSelection.target = cell;
  tablePointerSelection.moved = true;
  setCurrentTableCell(cell, true);
  selectTableCellRange(tablePointerSelection.anchor, cell, false);
}

function finishTablePointerSelection(event) {
  if (!tablePointerSelection || event.pointerId !== tablePointerSelection.pointerId) return;
  const { pointerId } = tablePointerSelection;
  tablePointerSelection = null;
  table.classList.remove("is-cell-selecting");
  if (table.hasPointerCapture?.(pointerId)) table.releasePointerCapture(pointerId);
  window.getSelection()?.removeAllRanges();
  const rowCount = selectedTableRange ? selectedTableRange.rowMax - selectedTableRange.rowMin + 1 : 0;
  const columnCount = selectedTableRange ? selectedTableRange.colMax - selectedTableRange.colMin + 1 : 0;
  setLive("表格区域已选择", `已按单元格选中 ${rowCount} 行 × ${columnCount} 列；拖动任意两个对角格即可重新圈选。`);
  scheduleSelectionToolbar();
  window.setTimeout(() => {
    suppressNextTableCellClick = false;
  }, 0);
}

function dismissTableCellSelection() {
  if (!selectedTableCells.length) return;
  clearTableCellSelection();
  if (selectionState?.kind === "table-cells") closeSelectionSurface();
}

function initTableInteractions() {
  if (!table) return;

  table.addEventListener("focusin", (event) => {
    const cell = event.target.closest("td, th");
    if (!cell || tablePointerSelection) return;
    setCurrentTableCell(cell);
  });

  table.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("td, th");
    if (!cell || event.button !== 0 || tableMergeMode) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      suppressNextTableCellClick = true;
      toggleTableCellSelection(cell);
      window.setTimeout(() => {
        suppressNextTableCellClick = false;
      }, 0);
      return;
    }
    if (event.detail > 1) {
      dismissTableCellSelection();
      return;
    }
    if (!event.shiftKey && pointHitsTableCellText(cell, event.clientX, event.clientY)) {
      dismissTableCellSelection();
      setCurrentTableCell(cell);
      return;
    }
    event.preventDefault();
    beginTablePointerSelection(event, cell);
  });

  table.addEventListener("pointermove", (event) => {
    if (!tablePointerSelection) return;
    event.preventDefault();
    updateTablePointerSelection(event);
  });

  table.addEventListener("pointerup", finishTablePointerSelection);
  table.addEventListener("pointercancel", finishTablePointerSelection);

  table.addEventListener("dblclick", (event) => {
    const cell = event.target.closest("td, th");
    if (!cell) return;
    dismissTableCellSelection();
    setCurrentTableCell(cell);
    scheduleSelectionToolbar();
  });

  table.addEventListener("click", (event) => {
    const cell = event.target.closest("td, th");
    if (!cell) return;
    if (suppressNextTableCellClick) {
      suppressNextTableCellClick = false;
      return;
    }
    if (nativeSelectionInsideTableCell(cell)) {
      dismissTableCellSelection();
      scheduleSelectionToolbar();
      return;
    }
    const priorAnchor = tableSelectionAnchor;
    setCurrentTableCell(cell);
    if (tableMergeMode) {
      if (!tableMergeFirstCell) {
        tableMergeFirstCell = cell;
        selectTableCellRange(cell, cell, false);
        updateMergePrompt(`已以“${cell.textContent.trim()}”为起点；再点同一区域中的另一个格。`);
        return;
      }
      selectTableCellRange(tableMergeFirstCell, cell);
      if (selectedTableCells.length < 2) {
        updateMergePrompt("起点和终点不能是同一个格；请再点另一个格。");
        return;
      }
      return mergeSelectedCells();
    }
    if (event.shiftKey && priorAnchor) {
      selectTableCellRange(priorAnchor, cell);
      scheduleSelectionToolbar();
      return;
    }
    selectTableCellRange(cell, cell, false);
    scheduleSelectionToolbar();
  });

  table.addEventListener("keydown", (event) => {
    const cell = event.target.closest("td");
    if (!cell) return;
    if (event.key === "Tab") {
      event.preventDefault();
      moveCellFocus(cell, event.shiftKey ? -1 : 1, 0);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveCellFocus(cell, 0, 1);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!selectedTableCells.length) return;
    if (table.contains(event.target)) return;
    if (event.target.closest?.("#selection-toolbar, #selection-review, [data-table-merge-prompt]")) return;
    dismissTableCellSelection();
  });
}

function imageLayoutSource(layout) {
  const figures = [
    ["assets/real-map-auckland-route.png", "迁移路线总览"],
    ["assets/ai-knowledge-workflow-illustration.png", "知识工作流"],
    ["assets/real-map-auckland-route.png", "路线细节"],
    ["assets/ai-knowledge-workflow-illustration.png", "整理结果"],
  ];
  return [
    `<div class="peak-image-layout" data-layout="${layout}">`,
    ...figures.map(([src, caption]) => `  <figure><img src="${src}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`),
    "</div>",
  ].join("\n");
}

function applyImageLayout(block, layout) {
  const gallery = block.querySelector(".peak-image-layout");
  if (!gallery) return;
  gallery.dataset.layout = layout;
  block.querySelectorAll("[data-image-layout]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.imageLayout === layout));
  });
  const sourceLabel = block.querySelector(".image-layout-source code");
  if (sourceLabel) sourceLabel.textContent = `data-layout="${layout}"`;
  block.dataset.source = imageLayoutSource(layout);
}

function switchImageLayout(block, layout) {
  const gallery = block.querySelector(".peak-image-layout");
  const previousLayout = gallery?.dataset.layout || "hero";
  if (!gallery || previousLayout === layout) return;
  const previousSource = block.dataset.source;
  applyImageLayout(block, layout);
  markAccepted(
    block,
    `图片组合切换为${({ grid: "网格", hero: "主图", strip: "横排", story: "叙事" })[layout] || layout}`,
    () => {
      applyImageLayout(block, previousLayout);
      block.dataset.source = previousSource;
    },
    () => applyImageLayout(block, layout),
    "user"
  );
  setLive("图片组合布局已更新", `四张图片仍是一个 HTML Block；Markdown Preview 直接渲染 data-layout="${layout}"，不是拆成四个游离图片块。`);
  showToast("图片组合布局已更新 · 可撤销");
}

function selectImageMode(block, mode) {
  if (mode === "zoom") {
    openImageGallery(block);
    return;
  }

  block.classList.toggle("is-cropping");
  setLive("图片裁剪", "裁剪框覆盖在真实附件上。真实实现里裁剪应产生可预览的新附件或非破坏性参数。");
  showToast("裁剪框已显示");
}

function toggleImageAnnotation(block) {
  const on = block.classList.toggle("is-annotating");
  setLive(on ? "图片标注" : "标注已收起", on ? "标注是非破坏 patch：原图不被覆盖，锚点和文字随块保存，可再交给 AI 生成说明。块评论请用左侧评论按钮。" : "标注隐藏，原图保持不变。");
  showToast(on ? "已添加示例标注" : "已收起标注");
}

function imageAssetName(block) {
  const source = block?.dataset.source || "";
  const wiki = source.match(/!\[\[([^|\]]+)/)?.[1];
  const markdown = source.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
  const path = wiki || markdown || "pasted-image.png";
  return path.split("/").pop() || "pasted-image.png";
}

function imageDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function imageExtension(name, fallback = "png") {
  return name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || fallback;
}

function semanticImageName(block, extension = imageExtension(imageAssetName(block))) {
  const context = `${block?.dataset.blockTitle || ""} ${block?.dataset.imageContext || ""} ${focusedBlock?.dataset.blockTitle || ""}`;
  let stem = "composer-image";
  if (/路线|地图|route/i.test(context)) stem = "pkm-route-map";
  else if (/知识|工作流|AI|Composer/i.test(context)) stem = "pkm-knowledge-workflow";
  return `${stem}-${imageDateStamp()}.${extension}`;
}

function semanticImageNameVariant(block, variantIndex = 0, instruction = "") {
  const extension = imageExtension(imageAssetName(block));
  const context = `${block?.dataset.blockTitle || ""} ${block?.dataset.imageContext || ""}`;
  const routeStems = ["pkm-route-map", "auckland-beijing-route", "migration-route-overview", "pkm-travel-path"];
  const defaultStems = ["composer-image", "knowledge-workflow", "visual-note", "document-illustration"];
  const stems = /路线|地图|route/i.test(context) ? routeStems : defaultStems;
  const customStem = instruction
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const stem = customStem || stems[variantIndex % stems.length];
  return `${stem}-${imageDateStamp()}.${extension}`;
}

function replaceImageSourceName(source, nextName) {
  if (/!\[\[/.test(source)) return source.replace(/(!\[\[(?:[^|\]]*\/)?)[^|\]]+/, `$1${nextName}`);
  if (/!\[[^\]]*\]\(/.test(source)) return source.replace(/(!\[[^\]]*\]\((?:[^)]*\/)?)[^)]+/, `$1${nextName}`);
  return `![[attachments/${nextName}]]`;
}

function imageToolbarMarkup() {
  return `
    <div class="object-toolbar image-toolbar">
      <button data-action="zoom-image"><svg><use href="#i-zoom"></use></svg> 全屏</button>
      <button data-action="edit-image"><svg><use href="#i-edit-image"></use></svg> 编辑图片</button>
      <button data-action="rename-image"><svg><use href="#i-rename"></use></svg> 重命名</button>
      <button data-action="easy-copy"><svg><use href="#i-copy"></use></svg> 复制</button>
      <button data-action="ai-caption"><svg><use href="#i-spark"></use></svg> 图注</button>
      <button data-action="ai-image"><svg><use href="#i-spark"></use></svg> AI 改图</button>
    </div>
  `;
}

const COPY_CHROME_SELECTOR = ".block-controls,.block-badges,.block-tail-actions,.micro-controls,.micro-tail-actions,.object-toolbar,.mermaid-head,.native-inline-tools,.native-source-pane,.ai-menu,.comment-editor,.ins-card,.rw-review,.block-copy-menu,.image-tool-panel,.block-collapse-preview,.composer-change-pins";

function cleanRenderedCopyClone(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(COPY_CHROME_SELECTOR).forEach((node) => node.remove());
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.removeAttribute("id");
  clone.removeAttribute("contenteditable");
  clone.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
  clone.classList.add("easy-copy-snapshot-root");
  return clone;
}

function renderedCopyTarget(target, ownerBlock) {
  if (target.classList.contains("micro-block")) return target;
  const selectorByKind = {
    metadata: ":scope > .metadata-grid",
    paragraph: ":scope > p",
    "heading-1": ":scope > h1",
    "heading-2": ":scope > h2",
    list: ":scope > .markdown-list",
    checklist: ":scope > .task-list",
    quote: ":scope > blockquote",
    callout: ":scope > .callout-shell",
    "vault-links": ":scope > p",
    "external-links": ":scope > p",
    math: ":scope > .math-stack",
    image: ":scope > .real-image-frame",
    "image-layout": ":scope > .image-layout-shell > .peak-image-layout",
    table: ":scope > .table-surface > .composer-table",
    chart: ":scope > .chart-shell > .chart-render",
    code: ":scope > pre",
    mermaid: ":scope > .mermaid-shell > .mermaid-render",
    base: ":scope > .base-render",
    canvas: ":scope > .json-canvas-render",
    excalidraw: ":scope > .excalidraw-render",
  };
  const selector = selectorByKind[ownerBlock.dataset.blockKind];
  return selector ? ownerBlock.querySelector(selector) || target : target;
}

function copyPayloadForBlock(target, ownerBlock = target.closest?.(".doc-block") || target) {
  const visualTarget = renderedCopyTarget(target, ownerBlock);
  const clone = cleanRenderedCopyClone(visualTarget);
  const isMicro = target.classList.contains("micro-block");
  const formula = visualTarget.querySelector("[data-tex]")?.dataset.tex;
  const kind = ownerBlock.dataset.blockKind;
  const normalizedLine = (value) => String(value || "").replace(/[ \t]+/g, " ").trim();
  let text = "";
  if (kind === "code") {
    text = (clone.querySelector("code")?.textContent || clone.textContent || "").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  } else if (["list", "checklist"].includes(kind)) {
    text = Array.from(clone.querySelectorAll("li"))
      .map((item) => normalizedLine(item.textContent))
      .filter(Boolean)
      .join("\n");
  } else if (kind === "table") {
    text = Array.from(clone.querySelectorAll("tr"))
      .map((row) => Array.from(row.cells).map((cell) => normalizedLine(cell.textContent)).join("\t"))
      .join("\n");
  } else if (kind === "mermaid") {
    text = Array.from(clone.querySelectorAll("svg text"))
      .map((node) => normalizedLine(node.textContent))
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join("\n");
  } else {
    text = normalizedLine(clone.textContent);
  }
  return {
    title: isMicro ? target.dataset.microTitle || "公式" : ownerBlock.dataset.blockTitle || "Composer block",
    text,
    markdown: isMicro && formula ? `$$${formula}$$` : ownerBlock.dataset.source || text,
    html: clone.innerHTML.trim(),
    target: visualTarget,
  };
}

function copyPayloadForSelection(state) {
  if (state.kind === "table-cells") {
    const selectedTable = document.createElement("table");
    selectedTable.className = "composer-table easy-copy-selected-cells";
    const body = document.createElement("tbody");
    state.matrix.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    selectedTable.appendChild(body);
    const shell = document.createElement("div");
    shell.appendChild(selectedTable.cloneNode(true));
    const markdownRows = state.matrix.map((row) => `| ${row.join(" | ")} |`);
    if (markdownRows.length) {
      markdownRows.splice(1, 0, `| ${state.matrix[0].map(() => "---").join(" | ")} |`);
    }
    return {
      title: `${state.rowCount} 行 × ${state.columnCount} 列的单元格选区`,
      text: state.text,
      markdown: markdownRows.join("\n"),
      html: shell.innerHTML,
      range: state.range.cloneRange(),
      sourceElement: table,
      selectionFragment: selectedTable,
      selectionRect: state.rect,
    };
  }
  const shell = document.createElement("div");
  shell.append(state.range.cloneContents());
  const common = state.range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? state.range.commonAncestorContainer
    : state.range.commonAncestorContainer.parentElement;
  return {
    title: state.blocks.length > 1 ? `跨 ${state.blocks.length} 个块的选区` : "Composer 选区",
    text: state.text,
    markdown: state.text,
    html: shell.innerHTML || escapeHtml(state.text),
    range: state.range.cloneRange(),
    sourceElement: common,
  };
}

async function writeClipboardText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function createRenderedSnapshot(payload) {
  const snapshot = document.createElement("div");
  snapshot.className = "easy-copy-selection-snapshot easy-copy-snapshot-root";
  if (payload.selectionFragment) snapshot.append(payload.selectionFragment.cloneNode(true));
  else snapshot.append(payload.range.cloneContents());
  const style = getComputedStyle(payload.sourceElement);
  ["font", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "color", "text-align", "text-decoration"].forEach((property) => {
    snapshot.style.setProperty(property, style.getPropertyValue(property));
  });
  return snapshot;
}

function selectionRasterSource(payload) {
  const snapshot = createRenderedSnapshot(payload);
  const host = document.createElement("div");
  const rangeWidth = payload.selectionRect?.width || payload.range?.getBoundingClientRect().width || payload.sourceElement?.getBoundingClientRect().width || 1;
  host.className = "easy-copy-raster-host";
  host.style.width = `${Math.max(1, Math.ceil(rangeWidth))}px`;
  host.append(snapshot);
  document.body.append(host);
  return { source: snapshot, release: () => host.remove() };
}

async function copyVisualElement(payload, panel) {
  const fallback = payload.target ? null : selectionRasterSource(payload);
  const source = payload.target || fallback.source;
  try {
    const canvas = await rasterizeRenderedElement(source);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG render failed");
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true, label: "复制成功", mode: "clipboard", canvas };
    }
    const link = document.createElement("a");
    link.download = "peak-composer-rendered-element.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    return { ok: true, label: "已下载 PNG", mode: "download", canvas };
  } catch (_error) {
    return { ok: false, label: "复制失败", mode: "error" };
  } finally {
    fallback?.release();
  }
}

function inlineRenderedStyles(source, target) {
  const computed = getComputedStyle(source);
  for (const property of computed) {
    target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  }
  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children[index];
    if (targetChild) inlineRenderedStyles(child, targetChild);
  });
}

function imageDataUrl(image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (_error) {
    return image.currentSrc || image.src;
  }
}

async function rasterizeRenderedElement(source) {
  await document.fonts.ready;
  const rect = source.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const styledClone = source.cloneNode(true);
  inlineRenderedStyles(source, styledClone);
  const clone = cleanRenderedCopyClone(styledClone);
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxHeight = `${height}px`;
  const sourceImages = Array.from(source.querySelectorAll("img"));
  const cloneImages = Array.from(clone.querySelectorAll("img"));
  sourceImages.forEach((image, index) => {
    if (cloneImages[index]) cloneImages[index].src = imageDataUrl(image);
  });
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">${serialized}</div></foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function closeCopyPanelAfterFeedback(panel) {
  window.setTimeout(() => {
    if (panel === selectionToolbarPopover) {
      closeSelectionSurface();
      return;
    }
    panel.hidden = true;
    panel.closest(".micro-block")?.classList.remove("is-micro-active");
    const block = panel.closest(".doc-block");
    if (block) syncOpenEditorState(block);
  }, 2200);
}

function setCopyChoiceState(choice, state, label) {
  if (!choice) return;
  choice.dataset.copyState = state;
  choice.innerHTML = state === "working"
    ? `<b>正在处理…</b><small>直接使用当前内容</small>`
    : `<b><svg><use href="#${state === "success" ? "i-check" : "i-x"}"></use></svg>${escapeHtml(label)}</b><small>${state === "success" ? "稍后自动收起" : "请重试"}</small>`;
}

async function performCopyChoice(kind, payload, panel, choice) {
  if (!payload || !choice || panel.dataset.copyBusy === "true") return;
  panel.dataset.copyBusy = "true";
  panel.querySelectorAll("[data-copy-kind]").forEach((button) => { button.disabled = true; });
  setCopyChoiceState(choice, "working", "正在处理");
  const result = kind === "image"
    ? await copyVisualElement(payload, panel)
    : { ok: await writeClipboardText(kind === "markdown" ? payload.markdown : kind === "html" ? payload.html : payload.text), label: "复制成功", mode: "clipboard" };
  panel.querySelectorAll("[data-copy-kind]").forEach((button) => { button.disabled = false; });
  panel.dataset.copyBusy = "false";
  setCopyChoiceState(choice, result.ok ? "success" : "error", result.ok ? result.label : "复制失败");
  const format = kind === "plain" ? "纯文本" : kind === "image" ? "原元素图片" : kind.toUpperCase();
  setLive("Easy Copy", result.ok ? `${payload.title} 已按${format}立即输出；没有打开第二个预览或重新排版。` : `${payload.title} 的${format}输出被当前浏览器阻止。`);
  showToast(result.ok ? result.label : "复制失败，请重试");
  if (result.ok) closeCopyPanelAfterFeedback(panel);
}

function copyMenuMarkup(scopeLabel) {
  return `
    <header><span><b>Easy Copy</b><small>${escapeHtml(scopeLabel)} · 选择输出格式</small></span><button type="button" data-copy-close aria-label="关闭"><svg><use href="#i-x"></use></svg></button></header>
    <div class="easy-copy-options">
      <button type="button" data-copy-kind="plain"><b>纯文本</b><small>无样式</small></button>
      <button type="button" data-copy-kind="image"><b>图片</b><small>原元素 1:1 快照</small></button>
      <button type="button" data-copy-kind="markdown"><b>Markdown</b><small>保留源语法</small></button>
      <button type="button" data-copy-kind="html"><b>HTML</b><small>保留可粘贴样式</small></button>
    </div>
  `;
}

function ensureElementCopyMenu(host, ownerBlock) {
  let panel = host.querySelector(":scope > .block-copy-menu");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "block-copy-menu";
  panel.classList.toggle("micro-copy-menu", host.classList.contains("micro-block"));
  panel.contentEditable = "false";
  panel.hidden = true;
  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-copy-close]")) {
      panel.hidden = true;
      host.classList.remove("is-micro-active");
      syncOpenEditorState(ownerBlock);
      return;
    }
    const choice = event.target.closest("[data-copy-kind]");
    if (!choice) return;
    performCopyChoice(choice.dataset.copyKind, panel._copyPayload, panel, choice);
  });
  host.append(panel);
  return panel;
}

function openBlockCopyMenu(block, target = block) {
  const isMicro = target.classList.contains("micro-block");
  const host = isMicro ? target : block;
  const panel = ensureElementCopyMenu(host, block);
  panel._copyPayload = copyPayloadForBlock(target, block);
  panel.innerHTML = copyMenuMarkup(isMicro ? `公式 · ${target.dataset.microTitle || "当前公式"}` : "当前 Block");
  panel.hidden = false;
  block.querySelector(":scope > .image-tool-panel")?.setAttribute("hidden", "");
  if (isMicro) target.classList.add("is-micro-active");
  syncOpenEditorState(block);
  setLive("Easy Copy", `${isMicro ? "当前公式" : "当前块"}可以立即复制为纯文本、原样图片、Markdown 或 HTML；点击后原地显示成功状态并自动收起。`);
}

function imagePanelMarkup(block, mode) {
  const image = block.querySelector(".real-image-frame img");
  const src = image?.currentSrc || image?.src || "";
  const currentName = imageAssetName(block);
  if (mode === "ai") {
    return `
      <header><span><b>AI 改图</b><small>${escapeHtml(currentName)}</small></span><div class="image-panel-header-actions"><button type="button" data-image-panel-action="ai-image-history" aria-label="改图历史" title="改图历史" hidden><svg><use href="#i-history"></use></svg></button><button type="button" data-image-panel-action="close" aria-label="关闭"><svg><use href="#i-x"></use></svg></button></div></header>
      <div class="image-ai-editor">
        <div class="image-ai-prompt" data-image-ai-prompt>
          <label><span>你想怎么改这张图？</span><textarea rows="3" data-image-ai-instruction placeholder="例如：突出紫色跨国路线，弱化底图，并保留地点标签"></textarea></label>
          <div class="image-ai-presets" aria-label="常用改图方式">
            <button type="button" data-image-ai-preset="突出路线，弱化底图">突出路线</button>
            <button type="button" data-image-ai-preset="简化背景，只保留关键地点">简化背景</button>
            <button type="button" data-image-ai-preset="增强地点标注和路线说明">增强标注</button>
            <button type="button" data-image-ai-preset="统一配色，提高正文阅读对比度">统一配色</button>
          </div>
          <button type="button" class="is-primary image-ai-generate" data-image-panel-action="generate-ai-image"><svg><use href="#i-spark"></use></svg>生成候选</button>
        </div>
        <div class="image-ai-generation" data-image-ai-generation hidden>${imageGenerationStageHTML()}</div>
        <div class="image-ai-result" data-image-ai-result hidden>
          <figure class="image-ai-preview">
            <div class="image-ai-preview-canvas">
              <img src="${src}" alt="AI 改图候选" data-image-ai-preview />
              <span class="image-ai-preview-badge" data-image-ai-preview-badge></span>
            </div>
            <figcaption data-image-ai-summary></figcaption>
          </figure>
          <div class="image-ai-result-controls">
            <div class="image-ai-variant-nav" aria-label="AI 改图版本">
              <button type="button" data-image-panel-action="ai-image-previous" aria-label="上一版" disabled><svg><use href="#i-chevron-left"></use></svg></button>
              <span data-image-ai-version>1 / 1</span>
              <button type="button" data-image-panel-action="ai-image-next" aria-label="下一版" disabled><svg><use href="#i-chevron-right"></use></svg></button>
            </div>
            ${candidateInstructionHTML("image-ai-followup")}
            <button type="button" data-image-panel-action="generate-ai-image"><svg><use href="#i-refresh"></use></svg>继续改</button>
            <button type="button" class="is-primary" data-image-panel-action="accept-ai-image"><svg><use href="#i-check"></use></svg>接受</button>
            <button type="button" data-image-panel-action="discard-ai-image">丢弃</button>
          </div>
          <div class="image-ai-history" hidden aria-label="AI 改图历史"></div>
        </div>
      </div>
    `;
  }
  if (mode === "rename") {
    return `
      <header><span><b>重命名图片</b><small>${escapeHtml(currentName)}</small></span><div class="image-panel-header-actions"><button type="button" data-image-panel-action="rename-history" aria-label="命名历史" title="命名历史"><svg><use href="#i-history"></use></svg></button><button type="button" data-image-panel-action="close" aria-label="关闭"><svg><use href="#i-x"></use></svg></button></div></header>
      <div class="image-rename-editor">
        <div class="image-rename-version">
          <button type="button" data-image-panel-action="rename-previous" aria-label="上一版" disabled><svg><use href="#i-chevron-left"></use></svg></button>
          <span data-image-rename-version>1 / 1</span>
          <button type="button" data-image-panel-action="rename-next" aria-label="下一版" disabled><svg><use href="#i-chevron-right"></use></svg></button>
        </div>
        <label class="image-rename-field"><span>新文件名</span><input type="text" data-image-rename-input /></label>
        ${candidateInstructionHTML("image-rename-instruction")}
        <button type="button" data-image-panel-action="regenerate-rename"><svg><use href="#i-refresh"></use></svg>重新建议</button>
      </div>
      <div class="image-rename-history" hidden aria-label="命名历史"></div>
      <footer><span></span><button type="button" class="is-primary" data-image-panel-action="apply-rename">使用名称</button></footer>
    `;
  }
  return `
    <header><span><b>编辑图片</b><small>先调整预览，再保存新版本</small></span><button type="button" data-image-panel-action="close" aria-label="关闭"><svg><use href="#i-x"></use></svg></button></header>
    <div class="image-converter-layout">
      <figure class="image-converter-preview">
        <div class="image-editor-canvas" data-image-crop-surface>
          <img src="${src}" alt="图片编辑预览" data-image-converter-preview />
          <div class="image-crop-overlay is-rectangle" data-image-crop-overlay>
            <div class="image-crop-box" data-image-crop-box style="left:14%;top:10%;width:72%;height:72%">
              <i data-crop-handle="nw"></i><i data-crop-handle="n"></i><i data-crop-handle="ne"></i>
              <i data-crop-handle="e"></i><i data-crop-handle="se"></i><i data-crop-handle="s"></i>
              <i data-crop-handle="sw"></i><i data-crop-handle="w"></i>
            </div>
            <svg class="image-crop-lasso" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path data-crop-lasso-path></path></svg>
          </div>
        </div>
        <figcaption data-image-crop-help>拖动矩形或控制点调整裁剪范围</figcaption>
      </figure>
      <div class="image-converter-controls">
        <span class="image-tool-label">裁剪</span>
        <div class="image-tool-row">
          <button type="button" data-image-crop-mode="rectangle" aria-pressed="true"><svg><use href="#i-crop"></use></svg>矩形裁剪</button>
          <button type="button" data-image-crop-mode="free" aria-pressed="false">自由圈选</button>
        </div>
        <span class="image-tool-label">旋转与校正</span>
        <div class="image-tool-row">
          <button type="button" data-image-tool="rotate-left" data-image-panel-action="rotate-left" aria-label="向左旋转 90 度"><svg><use href="#i-rotate"></use></svg>向左 90°</button>
          <button type="button" data-image-tool="rotate-right" data-image-panel-action="rotate-right" aria-label="向右旋转 90 度"><svg><use href="#i-rotate"></use></svg>向右 90°</button>
          <button type="button" data-image-tool="flip" data-image-panel-action="flip-image">水平翻转</button>
        </div>
        <label class="image-quality-row"><span>校正倾斜 <b data-image-straighten-value>0°</b></span><input type="range" min="-12" max="12" value="0" step="1" data-image-straighten /></label>
        <div class="image-tool-row"><button type="button" data-image-tool="strip" data-image-panel-action="strip-image-metadata">移除元数据</button></div>
        <span class="image-tool-label">输出格式</span>
        <div class="image-tool-row image-format-row">
          <button type="button" data-image-format="webp" aria-pressed="true">WebP</button>
          <button type="button" data-image-format="png" aria-pressed="false">PNG</button>
          <button type="button" data-image-format="jpg" aria-pressed="false">JPEG</button>
        </div>
        <label class="image-quality-row"><span>压缩质量 <b data-image-quality-value>82</b></span><input type="range" min="45" max="100" value="82" data-image-quality /></label>
        <div class="image-output-summary"><span>2472 × 1440</span><span><del>612 KB</del> <ins data-image-size>218 KB</ins></span><strong data-image-output-name>${escapeHtml(semanticImageName(block, "webp"))}</strong></div>
      </div>
    </div>
    <footer><span></span><button type="button" class="is-primary" data-image-panel-action="review-convert">预览新版本</button></footer>
  `;
}

function imageAiVariant(block, instruction, variantIndex) {
  const filters = [
    "contrast(1.08) saturate(1.28) brightness(1.02)",
    "contrast(1.12) saturate(.9) brightness(1.08)",
    "contrast(1.04) saturate(1.12) brightness(1.04) hue-rotate(-5deg)",
    "contrast(1.14) saturate(1.05) brightness(1.02)",
  ];
  const summaries = [
    "路线层级更清楚，底图信息被适度弱化。",
    "背景更安静，地点与行程方向成为视觉重点。",
    "地点标签和路线说明被增强，适合正文阅读。",
    "整体配色和对比度更统一，保留原始地理信息。",
  ];
  const effectiveInstruction = instruction.trim();
  return {
    instruction: effectiveInstruction,
    filter: filters[variantIndex % filters.length],
    summary: effectiveInstruction || summaries[variantIndex % summaries.length],
    name: semanticImageNameVariant(block, variantIndex + 1, effectiveInstruction || `ai-edit-${variantIndex + 1}`),
  };
}

function renderImageAiCandidate(panel) {
  const variants = panel._aiImageVariants || [];
  const index = Math.max(0, Math.min(panel._aiImageIndex || 0, variants.length - 1));
  const variant = variants[index];
  if (!variant) return;
  panel._aiImageIndex = index;
  const preview = panel.querySelector("[data-image-ai-preview]");
  const summary = panel.querySelector("[data-image-ai-summary]");
  const badge = panel.querySelector("[data-image-ai-preview-badge]");
  const version = panel.querySelector("[data-image-ai-version]");
  const previous = panel.querySelector('[data-image-panel-action="ai-image-previous"]');
  const next = panel.querySelector('[data-image-panel-action="ai-image-next"]');
  const historyButton = panel.querySelector('[data-image-panel-action="ai-image-history"]');
  const history = panel.querySelector(".image-ai-history");
  if (preview) preview.style.filter = variant.filter;
  if (summary) summary.textContent = variant.summary;
  if (badge) badge.textContent = `候选 ${index + 1}`;
  if (version) version.textContent = `${index + 1} / ${variants.length}`;
  if (previous) previous.disabled = index <= 0;
  if (next) next.disabled = index >= variants.length - 1;
  if (historyButton) historyButton.hidden = false;
  if (history) {
    history.innerHTML = variants.map((item, variantIndex) => `
      <button type="button" data-image-ai-history-index="${variantIndex}" class="${variantIndex === index ? "is-active" : ""}">
        <span>版本 ${variantIndex + 1}</span>
        <small>${escapeHtml(item.instruction || item.summary)}</small>
      </button>
    `).join("");
  }
}

function finishImageAiGeneration(block, panel, instruction) {
  const nextVariant = imageAiVariant(block, instruction, panel._aiImageVariants.length);
  panel._aiImageVariants.push(nextVariant);
  panel._aiImageIndex = panel._aiImageVariants.length - 1;
  block._aiImageIndex = panel._aiImageIndex;
  panel.querySelector("[data-image-ai-generation]").hidden = true;
  panel.querySelector("[data-image-ai-result]").hidden = false;
  panel.querySelector("[data-image-ai-prompt]").hidden = true;
  panel.classList.remove("is-ai-generating");
  const followup = panel.querySelector(".image-ai-followup [data-candidate-instruction]");
  if (followup) followup.value = "";
  renderImageAiCandidate(panel);
  setLive("AI 改图候选已生成", `版本 ${panel._aiImageVariants.length} 仍是候选；可以继续说明怎么改、切回旧版本，或接受当前版本。`);
  showToast(`改图版本 ${panel._aiImageVariants.length} 已生成`);
}

function generateImageAiCandidate(block, panel) {
  if (panel.classList.contains("is-ai-generating")) return;
  const initialInput = panel.querySelector("[data-image-ai-instruction]");
  const followupInput = panel.querySelector(".image-ai-followup [data-candidate-instruction]");
  const instruction = (panel._aiImageVariants.length ? followupInput?.value : initialInput?.value)?.trim() || "";
  if (!instruction) {
    (panel._aiImageVariants.length ? followupInput : initialInput)?.focus();
    showToast("先写下怎么改，或选择一个预设");
    return;
  }
  panel.classList.add("is-ai-generating");
  panel.querySelector("[data-image-ai-prompt]").hidden = true;
  panel.querySelector("[data-image-ai-result]").hidden = true;
  panel.querySelector("[data-image-ai-generation]").hidden = false;
  const status = panel.querySelector("[data-image-generation-status]");
  if (status) status.textContent = panel._aiImageVariants.length ? "正在按新要求继续改图…" : "正在理解改图要求…";
  clearTimeout(panel._aiImageTimer);
  panel._aiImageTimer = setTimeout(() => {
    if (panel.isConnected && !panel.hidden) finishImageAiGeneration(block, panel, instruction);
  }, 900);
  setLive("AI 改图生成中", `正在按「${escapeHtml(instruction)}」生成新版本；现有图片与旧候选都不会被覆盖。`);
}

function acceptImageAiCandidate(block, panel) {
  const variant = panel._aiImageVariants?.[panel._aiImageIndex];
  const image = block.querySelector(":scope > .real-image-frame img");
  if (!variant || !image) return;
  const oldSource = block.dataset.source || "";
  const oldFilter = image.style.filter;
  const nextSource = replaceImageSourceName(oldSource, variant.name);
  const apply = () => {
    block.dataset.source = nextSource;
    image.style.filter = variant.filter;
    image.dataset.aiEdited = "true";
  };
  const restore = () => {
    block.dataset.source = oldSource;
    image.style.filter = oldFilter;
    delete image.dataset.aiEdited;
  };
  apply();
  const item = suggestion("AI 改图", "用户确认图片候选", variant.instruction || variant.summary);
  item.runId = panel._aiImageRunId;
  block._aiImageIndex = panel._aiImageIndex;
  panel.hidden = true;
  block.classList.remove("has-ai-card", "is-ai-running");
  syncOpenEditorState(block);
  markAiAccepted(block, item, `AI 改图 · v${panel._aiImageIndex + 1}`, restore, apply);
  setLive("AI 改图已接受", `当前版本已作为新附件 ${escapeHtml(variant.name)} 写入引用；原图仍可通过撤销恢复。`);
  showToast("AI 改图已接受 · 可撤销");
}

function renderImageRenameCandidate(panel) {
  const variants = panel._renameVariants || [];
  const index = Math.max(0, Math.min(panel._renameIndex || 0, variants.length - 1));
  panel._renameIndex = index;
  const input = panel.querySelector("[data-image-rename-input]");
  const version = panel.querySelector("[data-image-rename-version]");
  const previous = panel.querySelector('[data-image-panel-action="rename-previous"]');
  const next = panel.querySelector('[data-image-panel-action="rename-next"]');
  const history = panel.querySelector(".image-rename-history");
  if (input) input.value = variants[index] || "";
  if (version) version.textContent = `${index + 1} / ${variants.length}`;
  if (previous) previous.disabled = index <= 0;
  if (next) next.disabled = index >= variants.length - 1;
  if (history) {
    history.innerHTML = variants.map((name, variantIndex) => `
      <button type="button" data-image-rename-history-index="${variantIndex}" class="${variantIndex === index ? "is-active" : ""}">
        <span>版本 ${variantIndex + 1}</span><code>${escapeHtml(name)}</code>
      </button>
    `).join("");
  }
}

function applyImagePreviewTransform(panel) {
  const preview = panel.querySelector("[data-image-converter-preview]");
  if (!preview) return;
  const quarterTurn = Number(panel.dataset.imageQuarterTurn || 0);
  const straighten = Number(panel.querySelector("[data-image-straighten]")?.value || 0);
  const flipped = panel.dataset.imageFlipped === "true";
  preview.style.transform = `rotate(${quarterTurn + straighten}deg) scaleX(${flipped ? -1 : 1})`;
  const label = panel.querySelector("[data-image-straighten-value]");
  if (label) label.textContent = `${straighten > 0 ? "+" : ""}${straighten}°`;
}

function setImageCropMode(panel, mode) {
  panel.dataset.imageCropMode = mode;
  panel.querySelectorAll("[data-image-crop-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.imageCropMode === mode)));
  const overlay = panel.querySelector("[data-image-crop-overlay]");
  overlay?.classList.toggle("is-rectangle", mode === "rectangle");
  overlay?.classList.toggle("is-free", mode === "free");
  const help = panel.querySelector("[data-image-crop-help]");
  if (help) help.textContent = mode === "free" ? "在图片上拖动，圈出要保留的区域" : "拖动矩形或控制点调整裁剪范围";
}

function imageEditSummary(panel) {
  const transforms = [];
  transforms.push(panel.dataset.imageCropMode === "free" ? "自由圈选" : "矩形裁剪");
  const quarterTurn = Number(panel.dataset.imageQuarterTurn || 0);
  if (quarterTurn) transforms.push(`${quarterTurn > 0 ? "右转" : "左转"} ${Math.abs(quarterTurn)}°`);
  const straighten = Number(panel.querySelector("[data-image-straighten]")?.value || 0);
  if (straighten) transforms.push(`校正 ${straighten > 0 ? "+" : ""}${straighten}°`);
  if (panel.dataset.imageFlipped === "true") transforms.push("水平翻转");
  if (panel.querySelector('[data-image-tool="strip"]')?.classList.contains("is-active")) transforms.push("移除元数据");
  return transforms.join(" / ");
}

function readImageEditState(panel) {
  const cropBox = panel.querySelector("[data-image-crop-box]");
  return {
    cropMode: panel.dataset.imageCropMode || "rectangle",
    cropRect: cropBox
      ? {
        left: parseFloat(cropBox.style.left) || 14,
        top: parseFloat(cropBox.style.top) || 10,
        width: parseFloat(cropBox.style.width) || 72,
        height: parseFloat(cropBox.style.height) || 72,
      }
      : { left: 14, top: 10, width: 72, height: 72 },
    lassoPath: panel.querySelector("[data-crop-lasso-path]")?.getAttribute("d") || "",
    quarterTurn: Number(panel.dataset.imageQuarterTurn || 0),
    straighten: Number(panel.querySelector("[data-image-straighten]")?.value || 0),
    flipped: panel.dataset.imageFlipped === "true",
    stripMetadata: panel.querySelector('[data-image-tool="strip"]')?.classList.contains("is-active") || false,
    format: panel.querySelector("[data-image-format][aria-pressed='true']")?.dataset.imageFormat || "webp",
    quality: Number(panel.querySelector("[data-image-quality]")?.value || 82),
  };
}

function imageLassoPolygon(path) {
  const points = Array.from(path.matchAll(/(?:M|L)\s*([\d.]+)\s+([\d.]+)/g))
    .map((match) => `${match[1]}% ${match[2]}%`);
  return points.length >= 3 ? `polygon(${points.join(",")})` : "";
}

function imageEditClipPath(state) {
  if (state.cropMode === "free") return imageLassoPolygon(state.lassoPath);
  const { left, top, width, height } = state.cropRect;
  return `inset(${top}% ${Math.max(0, 100 - left - width)}% ${Math.max(0, 100 - top - height)}% ${left}%)`;
}

function applyImageEditStateToElement(image, state) {
  if (!image || !state) return;
  image.style.transform = `rotate(${state.quarterTurn + state.straighten}deg) scaleX(${state.flipped ? -1 : 1})`;
  image.style.clipPath = imageEditClipPath(state);
  image.style.filter = state.stripMetadata ? "contrast(1.02)" : "";
}

function hydrateImageEditPanel(panel, state) {
  if (!state) return;
  panel.dataset.imageQuarterTurn = String(state.quarterTurn || 0);
  panel.dataset.imageFlipped = String(Boolean(state.flipped));
  setImageCropMode(panel, state.cropMode || "rectangle");
  const cropBox = panel.querySelector("[data-image-crop-box]");
  if (cropBox && state.cropRect) {
    cropBox.style.left = `${state.cropRect.left}%`;
    cropBox.style.top = `${state.cropRect.top}%`;
    cropBox.style.width = `${state.cropRect.width}%`;
    cropBox.style.height = `${state.cropRect.height}%`;
  }
  panel.querySelector("[data-crop-lasso-path]")?.setAttribute("d", state.lassoPath || "");
  const straighten = panel.querySelector("[data-image-straighten]");
  if (straighten) straighten.value = String(state.straighten || 0);
  const quality = panel.querySelector("[data-image-quality]");
  if (quality) quality.value = String(state.quality || 82);
  panel.querySelectorAll("[data-image-format]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.imageFormat === (state.format || "webp")));
  });
  panel.querySelector('[data-image-tool="flip"]')?.classList.toggle("is-active", Boolean(state.flipped));
  panel.querySelector('[data-image-tool="strip"]')?.classList.toggle("is-active", Boolean(state.stripMetadata));
  applyImagePreviewTransform(panel);
  updateImageConversionSummary(panel);
}

function updateImageConversionSummary(panel) {
  const quality = Number(panel.querySelector("[data-image-quality]")?.value || 82);
  const format = panel.querySelector("[data-image-format][aria-pressed='true']")?.dataset.imageFormat || "webp";
  const size = Math.round(612 * (quality / 100) * (format === "png" ? 0.86 : format === "jpg" ? 0.55 : 0.43));
  const sizeLabel = panel.querySelector("[data-image-size]");
  const nameLabel = panel.querySelector("[data-image-output-name]");
  const qualityLabel = panel.querySelector("[data-image-quality-value]");
  if (sizeLabel) sizeLabel.textContent = `${size} KB`;
  if (nameLabel) nameLabel.textContent = semanticImageName(panel.closest(".doc-block"), format);
  if (qualityLabel) qualityLabel.textContent = String(quality);
}

function renderImageConversionReview(block, panel) {
  const editState = readImageEditState(panel);
  const format = editState.format;
  const nextName = semanticImageName(block, format);
  const edits = imageEditSummary(panel);
  const sourceImage = block.querySelector(":scope > .real-image-frame img");
  panel.dataset.pendingImageName = nextName;
  panel._pendingImageEditState = editState;
  panel.innerHTML = `
    <header><span><b>新图片候选</b><small>待确认</small></span><button type="button" data-image-panel-action="close" aria-label="关闭"><svg><use href="#i-x"></use></svg></button></header>
    <figure class="image-conversion-candidate">
      <div class="image-conversion-candidate-canvas"><img src="${sourceImage?.currentSrc || sourceImage?.src || ""}" alt="图片编辑候选" data-image-conversion-candidate /></div>
      <figcaption>${escapeHtml(edits)}</figcaption>
    </figure>
    <div class="image-conversion-receipt"><span>原附件</span><del>${escapeHtml(imageAssetName(block))}</del><span>候选附件</span><ins>${escapeHtml(nextName)}</ins><span>调整</span><b>${escapeHtml(edits)}</b></div>
    <footer><button type="button" data-image-panel-action="restore-convert">返回调整</button><button type="button" class="is-primary" data-image-panel-action="accept-convert">接受并替换引用</button></footer>
  `;
  applyImageEditStateToElement(panel.querySelector("[data-image-conversion-candidate]"), editState);
}

function acceptImageAssetChange(block, nextName, label, editState = null) {
  const oldSource = block.dataset.source || "";
  const oldEmbedSource = block.dataset.imageEmbedSource || "";
  const oldAcceptedEditState = block.dataset.imageEditState || "";
  const image = block.querySelector(":scope > .real-image-frame img");
  const oldVisualState = image
    ? { transform: image.style.transform, clipPath: image.style.clipPath, filter: image.style.filter }
    : null;
  const nextSource = replaceImageSourceName(oldSource, nextName);
  const nextEmbedSource = oldEmbedSource ? replaceImageSourceName(oldEmbedSource, nextName) : "";
  const apply = () => {
    block.dataset.source = nextSource;
    if (nextEmbedSource) block.dataset.imageEmbedSource = nextEmbedSource;
    if (editState) {
      block.dataset.imageEditState = JSON.stringify(editState);
      applyImageEditStateToElement(image, editState);
    }
  };
  const restore = () => {
    block.dataset.source = oldSource;
    if (oldEmbedSource) block.dataset.imageEmbedSource = oldEmbedSource;
    else delete block.dataset.imageEmbedSource;
    if (oldAcceptedEditState) block.dataset.imageEditState = oldAcceptedEditState;
    else delete block.dataset.imageEditState;
    if (image && oldVisualState) {
      image.style.transform = oldVisualState.transform;
      image.style.clipPath = oldVisualState.clipPath;
      image.style.filter = oldVisualState.filter;
    }
  };
  apply();
  markAccepted(block, label, restore, apply);
  block.querySelector(":scope > .image-tool-panel")?.setAttribute("hidden", "");
  syncOpenEditorState(block);
  setLive(label, `已生成新附件 ${escapeHtml(nextName)} 并替换当前引用。原附件没有被覆盖，撤销会恢复原引用。`);
  showToast(`${label} · 可回滚`);
}

function beginImageCropInteraction(panel, event) {
  const surface = event.target.closest("[data-image-crop-surface]");
  if (!surface || !panel.contains(surface)) return;
  const bounds = surface.getBoundingClientRect();
  const point = (pointerEvent) => ({
    x: Math.max(0, Math.min(100, ((pointerEvent.clientX - bounds.left) / bounds.width) * 100)),
    y: Math.max(0, Math.min(100, ((pointerEvent.clientY - bounds.top) / bounds.height) * 100)),
  });
  if (panel.dataset.imageCropMode === "free") {
    const path = panel.querySelector("[data-crop-lasso-path]");
    if (!path) return;
    event.preventDefault();
    const points = [point(event)];
    const move = (moveEvent) => {
      points.push(point(moveEvent));
      path.setAttribute("d", points.map((item, index) => `${index ? "L" : "M"} ${item.x.toFixed(1)} ${item.y.toFixed(1)}`).join(" "));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (points.length > 2) path.setAttribute("d", `${path.getAttribute("d")} Z`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return;
  }

  const box = event.target.closest("[data-image-crop-box]");
  if (!box) return;
  event.preventDefault();
  const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || "move";
  const start = point(event);
  const initial = {
    left: parseFloat(box.style.left) || 14,
    top: parseFloat(box.style.top) || 10,
    width: parseFloat(box.style.width) || 72,
    height: parseFloat(box.style.height) || 72,
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const move = (moveEvent) => {
    const current = point(moveEvent);
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    let { left, top, width, height } = initial;
    if (handle === "move") {
      left = clamp(initial.left + dx, 0, 100 - initial.width);
      top = clamp(initial.top + dy, 0, 100 - initial.height);
    } else {
      if (handle.includes("e")) width = clamp(initial.width + dx, 12, 100 - initial.left);
      if (handle.includes("s")) height = clamp(initial.height + dy, 12, 100 - initial.top);
      if (handle.includes("w")) {
        left = clamp(initial.left + dx, 0, initial.left + initial.width - 12);
        width = initial.width + initial.left - left;
      }
      if (handle.includes("n")) {
        top = clamp(initial.top + dy, 0, initial.top + initial.height - 12);
        height = initial.height + initial.top - top;
      }
    }
    box.style.left = `${left}%`;
    box.style.top = `${top}%`;
    box.style.width = `${width}%`;
    box.style.height = `${height}%`;
  };
  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
}

function ensureImageToolPanel(block) {
  let panel = block.querySelector(":scope > .image-tool-panel");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "image-tool-panel";
  panel.contentEditable = "false";
  panel.hidden = true;
  panel._dismiss = () => {
    clearTimeout(panel._aiImageTimer);
    panel.hidden = true;
    panel.classList.remove("is-ai-generating");
    block.classList.remove("has-ai-card", "is-ai-running");
    syncOpenEditorState(block);
  };
  panel.addEventListener("input", (event) => {
    if (event.target.matches("[data-image-quality]")) updateImageConversionSummary(panel);
    if (event.target.matches("[data-image-straighten]")) applyImagePreviewTransform(panel);
  });
  panel.addEventListener("pointerdown", (event) => beginImageCropInteraction(panel, event));
  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-image-panel-action]")?.dataset.imagePanelAction;
    if (action === "close") {
      panel._dismiss();
      return;
    }
    const aiPreset = event.target.closest("[data-image-ai-preset]");
    if (aiPreset) {
      const input = panel.querySelector("[data-image-ai-instruction]");
      if (input) input.value = aiPreset.dataset.imageAiPreset;
      panel.querySelectorAll("[data-image-ai-preset]").forEach((button) => button.classList.toggle("is-active", button === aiPreset));
      return;
    }
    if (action === "generate-ai-image") return generateImageAiCandidate(block, panel);
    if (action === "ai-image-previous") {
      panel._aiImageIndex -= 1;
      block._aiImageIndex = panel._aiImageIndex;
      renderImageAiCandidate(panel);
      return;
    }
    if (action === "ai-image-next") {
      panel._aiImageIndex += 1;
      block._aiImageIndex = panel._aiImageIndex;
      renderImageAiCandidate(panel);
      return;
    }
    if (action === "ai-image-history") {
      const history = panel.querySelector(".image-ai-history");
      if (history) history.hidden = !history.hidden;
      return;
    }
    const aiHistoryChoice = event.target.closest("[data-image-ai-history-index]");
    if (aiHistoryChoice) {
      panel._aiImageIndex = Number(aiHistoryChoice.dataset.imageAiHistoryIndex);
      block._aiImageIndex = panel._aiImageIndex;
      renderImageAiCandidate(panel);
      const history = panel.querySelector(".image-ai-history");
      if (history) history.hidden = true;
      return;
    }
    if (action === "accept-ai-image") return acceptImageAiCandidate(block, panel);
    if (action === "discard-ai-image") {
      panel._dismiss();
      setLive("AI 改图已丢弃", "原图和附件引用都没有变化。");
      return;
    }
    if (action === "rotate-left" || action === "rotate-right") {
      const direction = action === "rotate-left" ? -90 : 90;
      panel.dataset.imageQuarterTurn = String(Number(panel.dataset.imageQuarterTurn || 0) + direction);
      applyImagePreviewTransform(panel);
      return;
    }
    if (action === "flip-image") {
      panel.dataset.imageFlipped = String(panel.dataset.imageFlipped !== "true");
      event.target.closest("[data-image-tool]")?.classList.toggle("is-active", panel.dataset.imageFlipped === "true");
      applyImagePreviewTransform(panel);
      return;
    }
    if (action === "strip-image-metadata") {
      event.target.closest("[data-image-tool]")?.classList.toggle("is-active");
      return;
    }
    if (action === "rename-previous") {
      panel._renameIndex -= 1;
      block._renameIndex = panel._renameIndex;
      renderImageRenameCandidate(panel);
      return;
    }
    if (action === "rename-next") {
      panel._renameIndex += 1;
      block._renameIndex = panel._renameIndex;
      renderImageRenameCandidate(panel);
      return;
    }
    if (action === "rename-history") {
      const history = panel.querySelector(".image-rename-history");
      if (history) history.hidden = !history.hidden;
      return;
    }
    if (action === "regenerate-rename") {
      const instruction = panel.querySelector("[data-candidate-instruction]")?.value.trim() || "";
      panel._renameVariants.push(semanticImageNameVariant(block, panel._renameVariants.length, instruction));
      panel._renameIndex = panel._renameVariants.length - 1;
      block._renameIndex = panel._renameIndex;
      renderImageRenameCandidate(panel);
      showToast(`已生成命名版本 ${panel._renameVariants.length}`);
      return;
    }
    if (action === "review-convert") return renderImageConversionReview(block, panel);
    if (action === "restore-convert") return openImageToolPanel(block, "convert", panel._pendingImageEditState);
    if (action === "accept-convert") return acceptImageAssetChange(block, panel.dataset.pendingImageName, "图片新版本已写入", panel._pendingImageEditState);
    if (action === "apply-rename") {
      const value = panel.querySelector("[data-image-rename-input]")?.value.trim();
      if (!value || !/\.[a-z0-9]+$/i.test(value)) return showToast("文件名需要包含扩展名");
      return acceptImageAssetChange(block, value, "图片已重命名");
    }
    const format = event.target.closest("[data-image-format]");
    if (format) {
      panel.querySelectorAll("[data-image-format]").forEach((button) => button.setAttribute("aria-pressed", String(button === format)));
      updateImageConversionSummary(panel);
      return;
    }
    const cropMode = event.target.closest("[data-image-crop-mode]")?.dataset.imageCropMode;
    if (cropMode) {
      setImageCropMode(panel, cropMode);
      return;
    }
    const tool = event.target.closest("[data-image-tool]");
    if (tool) {
      if (tool.dataset.imageTool === "rotate-left") panel.dataset.imageQuarterTurn = String(Number(panel.dataset.imageQuarterTurn || 0) - 90);
      if (tool.dataset.imageTool === "rotate-right") panel.dataset.imageQuarterTurn = String(Number(panel.dataset.imageQuarterTurn || 0) + 90);
      if (tool.dataset.imageTool === "flip") {
        panel.dataset.imageFlipped = String(panel.dataset.imageFlipped !== "true");
        tool.classList.toggle("is-active", panel.dataset.imageFlipped === "true");
      }
      if (tool.dataset.imageTool === "strip") tool.classList.toggle("is-active");
      applyImagePreviewTransform(panel);
      return;
    }
    const historyChoice = event.target.closest("[data-image-rename-history-index]");
    if (historyChoice) {
      panel._renameIndex = Number(historyChoice.dataset.imageRenameHistoryIndex);
      block._renameIndex = panel._renameIndex;
      renderImageRenameCandidate(panel);
      const history = panel.querySelector(".image-rename-history");
      if (history) history.hidden = true;
      return;
    }
  });
  const frame = block.querySelector(":scope > .real-image-frame");
  if (frame) frame.after(panel);
  else block.append(panel);
  return panel;
}

function openImageToolPanel(block, mode = "convert", editState = null) {
  const panel = ensureImageToolPanel(block);
  clearTimeout(panel._aiImageTimer);
  panel.dataset.imagePanelMode = mode;
  panel.dataset.imageQuarterTurn = "0";
  panel.dataset.imageFlipped = "false";
  panel.innerHTML = imagePanelMarkup(block, mode);
  if (mode === "ai") {
    block._aiImageVariants ||= [];
    panel._aiImageVariants = block._aiImageVariants;
    panel._aiImageIndex = Math.min(block._aiImageIndex || 0, Math.max(0, panel._aiImageVariants.length - 1));
    panel._aiImageRunId = block._aiImageRunId || `composer-ai-run-${++composerAiRunSequence}`;
    block._aiImageRunId = panel._aiImageRunId;
    block.classList.add("has-ai-card");
    if (panel._aiImageVariants.length) {
      panel.querySelector("[data-image-ai-prompt]").hidden = true;
      panel.querySelector("[data-image-ai-result]").hidden = false;
      renderImageAiCandidate(panel);
    }
  } else if (mode === "rename") {
    block._renameVariants ||= [semanticImageName(block)];
    panel._renameVariants = block._renameVariants;
    panel._renameIndex = Math.min(block._renameIndex || 0, Math.max(0, panel._renameVariants.length - 1));
    renderImageRenameCandidate(panel);
  } else {
    if (editState) hydrateImageEditPanel(panel, editState);
    else {
      setImageCropMode(panel, "rectangle");
      applyImagePreviewTransform(panel);
    }
  }
  panel.hidden = false;
  block.querySelector(":scope > .block-copy-menu")?.setAttribute("hidden", "");
  syncOpenEditorState(block);
  const liveCopy = mode === "rename"
    ? ["图片命名", "可以输入命名重点、反复生成候选，并在版本历史中左右切换。"]
    : mode === "ai"
    ? ["AI 改图", "先说明想怎么改或选择预设；生成后可继续追问、浏览历史版本，再决定是否接受。"]
    : ["编辑图片", "矩形裁剪可拖动和缩放，自由圈选可直接描画；旋转使用明确的 90° 动作和小范围倾斜校正。"];
  setLive(...liveCopy);
}

let pastedImageSequence = 0;

function composerPasteContext() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return { block: focusedBlock, range: null };
  const range = selection.getRangeAt(0);
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const block = start?.closest?.(".doc-block");
  if (!block || !paper.contains(block)) return { block: focusedBlock, range: null };
  return { block, range: range.cloneRange() };
}

function paragraphContinuation(block, fragment, source) {
  const continuation = document.createElement("section");
  continuation.className = "doc-block paragraph-block pasted-image-continuation";
  continuation.dataset.blockKind = "paragraph";
  continuation.dataset.blockTitle = `${block.dataset.blockTitle || "段落"} · 续段`;
  continuation.dataset.source = source;
  continuation.innerHTML = blockControlsHTML();
  const paragraph = document.createElement("p");
  paragraph.append(fragment);
  continuation.append(paragraph);
  decorateBlock(continuation);
  markEditorChrome(continuation);
  return continuation;
}

function placePastedImageBlock(imageBlock, insertion) {
  const anchor = insertion?.block;
  const range = insertion?.range;
  const paragraph = anchor?.dataset.blockKind === "paragraph" ? anchor.querySelector(":scope > p") : null;
  if (!paragraph || !range?.collapsed || !paragraph.contains(range.startContainer)) {
    if (anchor?.parentElement === paper) anchor.after(imageBlock);
    else paper.append(imageBlock);
    return;
  }

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(paragraph);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = document.createRange();
  afterRange.selectNodeContents(paragraph);
  afterRange.setStart(range.startContainer, range.startOffset);
  const beforeFragment = beforeRange.cloneContents();
  const afterFragment = afterRange.cloneContents();
  const beforeText = beforeRange.toString();
  const afterText = afterRange.toString();

  if (!beforeText.trim()) {
    anchor.before(imageBlock);
    return;
  }
  if (!afterText.trim()) {
    anchor.after(imageBlock);
    return;
  }

  paragraph.replaceChildren(beforeFragment);
  anchor.dataset.source = beforeText.trimEnd();
  const continuation = paragraphContinuation(anchor, afterFragment, afterText.trimStart());
  anchor.after(imageBlock);
  imageBlock.after(continuation);
}

function insertPastedImageBlock(file, insertion = composerPasteContext()) {
  pastedImageSequence += 1;
  const extension = imageExtension(file?.name || "", file?.type?.split("/")[1] || "png");
  const objectUrl = file ? URL.createObjectURL(file) : "assets/real-map-auckland-route.png";
  const anchor = insertion?.block || focusedBlock;
  const block = document.createElement("section");
  block.className = "doc-block image-block pasted-image-block";
  block.dataset.blockKind = "image";
  block.dataset.blockTitle = `粘贴图片 ${pastedImageSequence}`;
  let heading = anchor;
  while (heading && !/^heading-/.test(heading.dataset?.blockKind || "")) heading = heading.previousElementSibling;
  block.dataset.imageContext = `${heading?.dataset.blockTitle || ""} ${anchor?.dataset.blockTitle || ""}`.trim();
  block.dataset.source = `![[attachments/composer-pasted-image-${pastedImageSequence}.${extension}]]`;
  block.innerHTML = `
    ${blockControlsHTML()}
    <figure class="real-image-frame">
      <a class="lightgallery composer-lightgallery" href="${objectUrl}" data-thumbnail="${objectUrl}"><img src="${objectUrl}" alt="从剪贴板粘贴的图片" /></a>
      ${imageToolbarMarkup()}
      <figcaption>从剪贴板粘贴 · 附件仍是候选，确认命名后才写入 Vault</figcaption>
    </figure>
  `;
  placePastedImageBlock(block, insertion);
  decorateBlock(block);
  markEditorChrome(block);
  imageGallery?.refresh?.();
  setFocusedBlock(block);
  openImageToolPanel(block, "rename");
  const panel = block.querySelector(":scope > .image-tool-panel");
  panel?.insertAdjacentHTML("afterbegin", '<div class="image-paste-receipt"><svg><use href="#i-check"></use></svg><span><b>已读取剪贴板图片</b><small>先确认自动命名，再创建附件并写入 embed</small></span></div>');
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  setLive("图片已粘贴", "Composer 已在正文光标位置创建图片 Block，并生成语义文件名；附件写入、重命名和 Markdown embed 将在一次事务里完成。 ");
  showToast("图片已粘贴 · 请确认自动命名");
}

function openImageGallery(block) {
  const trigger = block.querySelector(".lightgallery");
  if (!trigger) return;

  trigger.click();
  setLive("lightGallery 图片查看", "图片全屏查看由 lightGallery 接管：顶部工具栏、缩放、拖拽、Esc 关闭和底部缩略图都由成熟 viewer 处理。裁剪、标注和 AI 图注仍留在 Composer 编辑层。");
  showToast("已打开 lightGallery 图片查看器");
}

function closeImageGallery() {
  if (!document.documentElement.classList.contains("lg-on")) return;

  if (imageGallery && typeof imageGallery.closeGallery === "function") {
    imageGallery.closeGallery();
    return;
  }

  document.querySelector(".lg-close")?.click();
}

function handleNative(block) {
  const kind = block.dataset.blockKind;
  setLive("原生文件动作", `${kind} 块会调用自己的 adapter：Base 走 Bases，Canvas 走 JSON Canvas，Excalidraw 走 Excalidraw 插件。Peak 只拥有渲染壳和回滚。`);
  showToast("原生文件动作已发送到 Ambient");
}

const DRAFT_TYPES = [
  { label: "段落", prefix: "" },
  { label: "标题", prefix: "## " },
  { label: "列表", prefix: "- " },
  { label: "待办", prefix: "- [ ] " },
  { label: "引用", prefix: "> " },
  { label: "Callout", prefix: "> [!note] " },
  { label: "公式", prefix: "$$", suffix: "$$" },
];

const INSERT_PRESETS = {
  paragraph: "",
  heading: "## ",
  list: "- ",
  quote: "> ",
  callout: "> [!note]\n",
  formula: "$$E = mc^2$$",
  image: "![[new-image.png|720]]",
  table: "| 项目 | 说明 |\n| --- | --- |\n| 新项目 | 待填写 |",
  base: "![[new-view.base]]",
  canvas: "![[new-canvas.canvas]]",
  excalidraw: "![[new-drawing.excalidraw.md]]",
  ai: "根据上文继续写一个可执行的下一步",
};

function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMiniMarkdown(text) {
  return text
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return "";
      if (/^\$\$(.*)\$\$$/.test(line)) return `<div class="math-render" data-tex="${escapeHtml(line.slice(2, -2))}"></div>`;
      if (line.startsWith("### ")) return `<h3 class="mini-h3">${inlineMd(line.slice(4))}</h3>`;
      if (line.startsWith("## ")) return `<h2 class="mini-h2">${inlineMd(line.slice(3))}</h2>`;
      if (line.startsWith("# ")) return `<h2 class="mini-h2">${inlineMd(line.slice(2))}</h2>`;
      if (line.startsWith("- [ ] ")) return `<div class="mini-task"><input type="checkbox" disabled /> <span>${inlineMd(line.slice(6))}</span></div>`;
      if (line.startsWith("- [x] ")) return `<div class="mini-task"><input type="checkbox" checked disabled /> <span>${inlineMd(line.slice(6))}</span></div>`;
      if (line.startsWith("> [!")) return `<div class="mini-callout">${inlineMd(line.replace(/^>\s*/, ""))}</div>`;
      if (line.startsWith("> ")) return `<blockquote class="mini-quote">${inlineMd(line.slice(2))}</blockquote>`;
      if (line.startsWith("- ")) return `<div class="mini-li">• ${inlineMd(line.slice(2))}</div>`;
      return `<p>${inlineMd(line)}</p>`;
    })
    .join("");
}

function renderMathIn(root) {
  if (!window.katex) return;
  root.querySelectorAll("[data-tex]").forEach((node) => {
    katex.render(node.dataset.tex, node, {
      displayMode: node.classList.contains("math-render"),
      throwOnError: false,
      strict: false,
    });
  });
}

function removeDraft(draft, silent) {
  clearInterval(draft.streamTimer);
  draft.remove();
  if (silent) return;
  setLive("草稿已丢弃", "未写入任何 Markdown。");
  showToast("已丢弃新块草稿");
}

function createDraftBlock(afterBlock, insertKind = "") {
  const existing = paper.querySelector(".draft-block");
  if (existing) removeDraft(existing, true);

  const draft = document.createElement("section");
  draft.className = "doc-block draft-block";
  draft.dataset.blockKind = "draft";
  draft.dataset.blockTitle = "新块草稿";
  draft.dataset.source = "";
  draft.innerHTML = `
    <div class="draft-head"><span>新块</span><small>直接写 Markdown 即时预览 · 点类型插入语法 · 或写一句话让 AI 生成 · ⌘⏎ 写入 · Esc 关闭</small></div>
    <div class="draft-types">${DRAFT_TYPES.map((type) => `<button data-draft-type="${escapeHtml(type.prefix)}" data-suffix="${escapeHtml(type.suffix || "")}">${type.label}</button>`).join("")}</div>
    <textarea class="draft-input" placeholder="## 标题、- 列表、> 引用、$$公式$$… 直接写；或描述内容让 AI 生成"></textarea>
    <div class="draft-preview" hidden></div>
    <div class="ai-card-actions draft-actions">
      <button data-action="draft-commit">写入为块</button>
      <button data-action="draft-ai">AI 生成</button>
      <button data-action="draft-cancel">取消</button>
    </div>
  `;
  afterBlock.insertAdjacentElement("afterend", draft);

  const input = draft.querySelector(".draft-input");
  if (insertKind && Object.hasOwn(INSERT_PRESETS, insertKind)) {
    input.value = INSERT_PRESETS[insertKind];
    updateDraftPreview(draft);
  }
  input.addEventListener("input", () => updateDraftPreview(draft));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    commitDraft(draft);
  });
  input.focus();
  setLive("新块草稿", "⌘⏎ 在任意块内创建新块：输入 Markdown 会即时预览，也可以把输入当 prompt 交给 AI 流式生成，接受后才写入。");
  showToast("新块草稿已创建");
  draft.scrollIntoView({ block: "center", behavior: "smooth" });
  if (insertKind === "ai") setTimeout(() => runDraftAi(draft), 120);
  return draft;
}

function updateDraftPreview(draft) {
  const input = draft.querySelector(".draft-input");
  const preview = draft.querySelector(".draft-preview");
  delete draft.dataset.aiResult;
  draft.querySelector('[data-action="draft-commit"]').textContent = "写入为块";
  if (!input.value.trim()) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  preview.hidden = false;
  preview.innerHTML = renderMiniMarkdown(input.value);
  renderMathIn(preview);
}

function guessDraftKind(text) {
  const line = text.trim();
  if (line.startsWith("$$")) return "math";
  if (line.startsWith("#")) return "heading-2";
  if (line.startsWith("- [")) return "checklist";
  if (line.startsWith("- ")) return "list";
  if (line.startsWith("> [!")) return "callout";
  if (line.startsWith("> ")) return "quote";
  return "paragraph";
}

function commitDraft(draft) {
  const input = draft.querySelector(".draft-input");
  const value = (draft.dataset.aiResult || input.value).trim();
  if (!value) {
    showToast("先输入内容");
    input.focus();
    return;
  }

  const fromAi = Boolean(draft.dataset.aiResult);
  const kind = guessDraftKind(value);
  const section = document.createElement("section");
  section.className = "doc-block committed-block";
  section.dataset.blockKind = kind;
  section.dataset.blockTitle = fromAi ? "AI 生成块" : "新写入块";
  section.dataset.source = value;
  section.innerHTML = `${blockControlsHTML()}<div class="committed-body">${renderMiniMarkdown(value)}</div>`;
  clearInterval(draft.streamTimer);
  draft.replaceWith(section);
  renderMathIn(section);
  decorateBlock(section);

  if (fromAi) {
    section.classList.add("has-ai-accepted");
    rollbackTrail.unshift({ block: section, label: "AI 生成新块", title: section.dataset.blockTitle });
    renderRollbackTrail();
  }
  setFocusedBlock(section);
  setLive("新块已写入", `新块以 ${kind} 语法进入 Markdown source range；块控件、AI 建议和拖拽与其他块一致。`);
  showToast(fromAi ? "AI 草稿已写入 · 可在 Ambient 回滚" : "新块已写入 Markdown");
}

function runDraftAi(draft) {
  const input = draft.querySelector(".draft-input");
  const preview = draft.querySelector(".draft-preview");
  const prompt = input.value.trim();
  if (!prompt) {
    showToast("先写一句 prompt");
    input.focus();
    return;
  }

  const candidate = `**${prompt}**（AI 草稿）\n结合本文“获取 → 管理 → 输出 → 回顾”的闭环，可以拆成三步：\n- 先明确输出物和读者是谁；\n- 把相关笔记链接进来（知识库、信息管理）；\n- 为下一次回顾留一条可执行待办。`;
  delete draft.dataset.aiResult;
  preview.hidden = false;
  preview.innerHTML = "";
  draft.classList.add("is-ai-streaming");
  setLive("AI 生成新块", "输入被当作 prompt：内容流式写入预览区，接受后才成为 Markdown 块，随时可丢弃。");

  let cursor = 0;
  clearInterval(draft.streamTimer);
  draft.streamTimer = setInterval(() => {
    cursor += 6;
    preview.innerHTML = renderMiniMarkdown(candidate.slice(0, cursor));
    if (cursor < candidate.length) return;
    clearInterval(draft.streamTimer);
    draft.classList.remove("is-ai-streaming");
    draft.dataset.aiResult = candidate;
    renderMathIn(preview);
    draft.querySelector('[data-action="draft-commit"]').textContent = "接受为新块";
    showToast("AI 草稿已生成 · 接受后写入");
  }, 24);
}

const linkPopover = document.createElement("div");
linkPopover.className = "link-popover";
linkPopover.hidden = true;
document.body.appendChild(linkPopover);
let linkPopoverTarget = null;
let linkPopoverHideTimer = null;

function linkPopoverName(target) {
  if (target.classList.contains("footnote-ref")) return "脚注 [^1]";
  return target.textContent.trim();
}

function linkDestinationFor(target) {
  if (target.classList.contains("footnote-ref")) {
    return { kind: "footnote", target: "#footnote-def-1", label: "跳到脚注定义" };
  }
  if (target.classList.contains("vault-chip")) {
    if (target.classList.contains("is-stale")) return null;
    const note = target.dataset.vaultTarget || `${linkPopoverName(target).replace(/^\[\[|\]\]$/g, "")}.md`;
    return { kind: "vault", target: note, label: `打开 ${note}` };
  }
  if (target.classList.contains("ext-chip")) {
    return { kind: "external", target: target.href, label: `访问 ${target.href}` };
  }
  return null;
}

function openComposerLink(target) {
  const destination = linkDestinationFor(target);
  if (!destination) return;
  window.dispatchEvent(new CustomEvent("peak:composer-open-link", {
    detail: {
      kind: destination.kind,
      target: destination.target,
      sourceBlock: target.closest(".doc-block")?.dataset.blockTitle || "",
    },
  }));
  document.body.dataset.lastComposerNavigation = destination.target;
  if (destination.kind === "footnote") {
    document.querySelector(destination.target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("已定位到脚注定义");
    return;
  }
  if (destination.kind === "vault") {
    showToast(`打开笔记 · ${destination.target}`);
    setLive("打开知识库链接", `宿主将定位到 ${escapeHtml(destination.target)}；Composer 保留当前编辑上下文。`);
    return;
  }
  window.open(destination.target, "_blank", "noopener,noreferrer");
  showToast("已在外部浏览器打开来源");
}

function linkActionsFor(target) {
  if (target.classList.contains("footnote-ref")) {
    return [
      { label: "跳到脚注定义", reason: "脚注引用", nav: "#footnote-def-1" },
      { label: "核对出处", reason: "脚注待核对" },
    ];
  }
  if (target.classList.contains("vault-chip")) {
    if (target.classList.contains("is-stale")) {
      return [
        { label: "修复失效链接", reason: "目标笔记已删除" },
        { label: "移除链接", reason: "保留纯文本" },
      ];
    }
    return [
      { label: "解释引用关系", reason: "vault 链接" },
      { label: "同步目标要点", reason: "目标笔记可读" },
    ];
  }
  return [
    { label: "转 link card", reason: "外部链接" },
    { label: "抓取摘要", reason: "外部来源未读" },
    { label: "核对来源", reason: "引用可信度" },
  ];
}

function showLinkPopover(target) {
  clearTimeout(linkPopoverHideTimer);
  if (linkPopoverTarget === target && !linkPopover.hidden) return;
  linkPopoverTarget = target;

  const name = linkPopoverName(target);
  const actions = linkActionsFor(target);
  const destination = linkDestinationFor(target);
  const destinationControl = destination
    ? `<button class="link-popover-destination" type="button" data-link-open title="${escapeHtml(destination.label)}"><svg><use href="#${destination.kind === "vault" ? "i-file" : destination.kind === "footnote" ? "i-locate" : "i-link"}"></use></svg><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(destination.label)}</small></span></button>`
    : `<span class="link-popover-title">${escapeHtml(name)}</span>`;
  linkPopover.innerHTML =
    destinationControl +
    actions
      .map(
        (item) =>
          `<button data-link-action="${escapeHtml(item.label)}" data-reason="${escapeHtml(item.reason)}"${item.nav ? ` data-nav="${item.nav}"` : ""}>${escapeHtml(item.label)}</button>`
      )
      .join("");
  linkPopover.hidden = false;

  const rect = target.getBoundingClientRect();
  const popRect = linkPopover.getBoundingClientRect();
  let top = rect.top - popRect.height - 6;
  if (top < 70) top = rect.bottom + 6;
  let left = rect.left;
  if (left + popRect.width > window.innerWidth - 12) left = window.innerWidth - popRect.width - 12;
  linkPopover.style.top = `${top}px`;
  linkPopover.style.left = `${Math.max(12, left)}px`;
}

function hideLinkPopover() {
  linkPopover.hidden = true;
  linkPopoverTarget = null;
}

function scheduleHideLinkPopover() {
  clearTimeout(linkPopoverHideTimer);
  linkPopoverHideTimer = setTimeout(hideLinkPopover, 260);
}

function initLinkPopover() {
  paper.addEventListener("pointerover", (event) => {
    const chip = event.target.closest(".vault-chip, .ext-chip, .footnote-ref");
    if (chip) showLinkPopover(chip);
  });
  paper.addEventListener("pointerout", (event) => {
    const chip = event.target.closest(".vault-chip, .ext-chip, .footnote-ref");
    if (chip) scheduleHideLinkPopover();
  });
  linkPopover.addEventListener("pointerenter", () => clearTimeout(linkPopoverHideTimer));
  linkPopover.addEventListener("pointerleave", scheduleHideLinkPopover);
  window.addEventListener("scroll", hideLinkPopover, true);

  paper.addEventListener("click", (event) => {
    const target = event.target.closest(".vault-chip:not(.is-stale), .ext-chip, .footnote-ref");
    if (!target) return;
    event.preventDefault();
    openComposerLink(target);
  });

  linkPopover.addEventListener("click", (event) => {
    const open = event.target.closest("[data-link-open]");
    if (open && linkPopoverTarget) {
      event.preventDefault();
      const target = linkPopoverTarget;
      hideLinkPopover();
      openComposerLink(target);
      return;
    }
    const button = event.target.closest("[data-link-action]");
    if (!button || !linkPopoverTarget) return;

    if (button.dataset.nav) {
      document.querySelector(button.dataset.nav)?.scrollIntoView({ behavior: "smooth", block: "center" });
      hideLinkPopover();
      showToast("已定位到脚注定义");
      return;
    }

    const block = linkPopoverTarget.closest(".doc-block");
    const name = linkPopoverName(linkPopoverTarget);
    hideLinkPopover();
    if (!block) return;
    setFocusedBlock(block);
    showAiSuggestionCard(block, {
      label: button.dataset.linkAction,
      reason: `${button.dataset.reason}：${name}`,
      trigger: "link",
      microTitle: name,
    });
  });
}

const formatTokenPopover = document.createElement("div");
formatTokenPopover.className = "format-token-popover";
formatTokenPopover.hidden = true;
formatTokenPopover.contentEditable = "false";
document.body.appendChild(formatTokenPopover);
let formatTokenTarget = null;
let formatTokenHideTimer = null;

function hideFormatTokenPopover() {
  formatTokenPopover.hidden = true;
  formatTokenTarget = null;
}

function scheduleHideFormatTokenPopover() {
  clearTimeout(formatTokenHideTimer);
  formatTokenHideTimer = setTimeout(hideFormatTokenPopover, 260);
}

function showFormatTokenPopover(target) {
  clearTimeout(formatTokenHideTimer);
  formatTokenTarget = target;
  const suggestion = target.dataset.aiStyle || "";
  formatTokenPopover.innerHTML = `
    <header>
      <span><b>${escapeHtml(target.dataset.formatLabel || "行内样式")}</b><small>${suggestion ? "当前样式 · AI 有新建议" : "当前样式 · 可继续编辑"}</small></span>
      ${suggestion ? '<i><svg><use href="#i-spark"></use></svg> AI 建议</i>' : ""}
    </header>
    <code>${escapeHtml(target.dataset.formatSource || target.textContent.trim())}</code>
    ${suggestion ? `<p>${escapeHtml(suggestion)}</p>` : ""}
    <footer>
      <button type="button" data-format-preview="text">文字色</button>
      <button type="button" data-format-preview="highlight">标记色</button>
      ${suggestion ? '<button type="button" class="is-ai" data-format-preview="ai"><svg><use href="#i-spark"></use></svg>预览建议</button>' : ""}
      <button type="button" data-format-preview="reset">原样</button>
    </footer>`;
  formatTokenPopover.hidden = false;
  const rect = target.getBoundingClientRect();
  const popRect = formatTokenPopover.getBoundingClientRect();
  let top = rect.top - popRect.height - 7;
  if (top < 70) top = rect.bottom + 7;
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(12, Math.min(window.innerWidth - popRect.width - 12, left));
  formatTokenPopover.style.top = `${top}px`;
  formatTokenPopover.style.left = `${left}px`;
}

function previewFormatToken(target, mode) {
  target.classList.remove("is-preview-text", "is-preview-highlight", "is-preview-ai");
  if (mode !== "reset") target.classList.add(`is-preview-${mode}`);
  const labels = {
    text: "已预览文字色",
    highlight: "已预览标记色",
    ai: "已预览 AI 建议样式",
    reset: "已恢复原样",
  };
  showToast(labels[mode] || "样式预览已更新");
  showFormatTokenPopover(target);
}

function initFormatTokenPopover() {
  paper.addEventListener("pointerover", (event) => {
    const token = event.target.closest(".format-token");
    if (token) showFormatTokenPopover(token);
  });
  paper.addEventListener("pointerout", (event) => {
    if (event.target.closest(".format-token")) scheduleHideFormatTokenPopover();
  });
  paper.addEventListener("focusin", (event) => {
    const token = event.target.closest(".format-token");
    if (token) showFormatTokenPopover(token);
  });
  paper.addEventListener("focusout", (event) => {
    if (event.target.closest(".format-token")) scheduleHideFormatTokenPopover();
  });
  formatTokenPopover.addEventListener("pointerenter", () => clearTimeout(formatTokenHideTimer));
  formatTokenPopover.addEventListener("pointerleave", scheduleHideFormatTokenPopover);
  formatTokenPopover.addEventListener("click", (event) => {
    const button = event.target.closest("[data-format-preview]");
    if (!button || !formatTokenTarget) return;
    previewFormatToken(formatTokenTarget, button.dataset.formatPreview);
  });
  window.addEventListener("scroll", hideFormatTokenPopover, true);
}

function closeTopSurface() {
  if (closeSelectionSurface()) return true;
  if (!formatTokenPopover.hidden) {
    hideFormatTokenPopover();
    return true;
  }
  if (!linkPopover.hidden) {
    hideLinkPopover();
    return true;
  }
  const openDraft = paper.querySelector(".draft-block");
  if (openDraft) {
    removeDraft(openDraft);
    return true;
  }
  const openInlineInput = paper.querySelector(".block-action-bar .aim.open");
  if (openInlineInput) {
    openInlineInput.classList.remove("open");
    const input = openInlineInput.querySelector("input");
    if (input) {
      input.value = "";
      input.blur();
    }
    return true;
  }
  const openVaultLibrary = paper.querySelector(".vault-property-overlay:not([hidden])");
  if (openVaultLibrary) {
    openVaultLibrary.querySelector("[data-vault-property-action='close']")?.click();
    return true;
  }
  const openMenu = paper.querySelector(".ai-menu:not(.block-action-bar):not([hidden])");
  if (openMenu) {
    const openInput = openMenu.querySelector(".aim.open");
    if (openInput) {
      openInput.classList.remove("open");
      const input = openInput.querySelector("input");
      if (input) {
        input.value = "";
        input.blur();
      }
      return true;
    }
    openMenu.hidden = true;
    syncOpenEditorState(openMenu.closest(".doc-block"));
    return true;
  }
  const openStrip = paper.querySelector(".insert-strip:not([hidden])");
  if (openStrip) {
    closeInsertStrip(openStrip.closest(".doc-block"));
    return true;
  }
  const openInsight = paper.querySelector(".insight-panel:not([hidden])");
  if (openInsight) {
    openInsight.hidden = true;
    syncOpenEditorState(openInsight.closest(".doc-block"));
    return true;
  }
  const openComment = paper.querySelector(".comment-editor:not([hidden])");
  if (openComment) {
    cancelComment(openComment.closest(".doc-block"));
    return true;
  }
  const openCard = paper.querySelector(".rw-review, .ins-card");
  if (openCard && typeof openCard._dismiss === "function") {
    openCard._dismiss();
    setLive("已关闭 AI 候选", "未写入任何 Markdown 源。");
    return true;
  }
  return false;
}

function nativeSourceFor(block) {
  const kind = block.dataset.blockKind;
  if (kind === "mermaid") return block.querySelector("#mermaid-render")?.dataset.definition || "";
  if (kind === "canvas") return JSON.stringify(canvasData, null, 2);
  if (kind === "excalidraw") return JSON.stringify({ type: "excalidraw", elements: excalidrawNodes, edges: excalidrawEdges }, null, 2);
  return block.dataset.source || "";
}

function syncNativeSource(block) {
  const code = block.querySelector(".native-source-pane code");
  if (code) code.textContent = nativeSourceFor(block);
}

function toggleNativeView(block, mode) {
  const preview = block.querySelectorAll(".native-preview");
  const source = block.querySelector(".native-source-pane");
  const showSource = mode === "source";
  preview.forEach((node) => { node.hidden = showSource; });
  if (source) source.hidden = !showSource;
  syncNativeSource(block);
  block.querySelectorAll('[data-action="native-view"]').forEach((button) => button.classList.toggle("is-active", button.dataset.nativeMode === mode));
  setLive(showSource ? "原生源码视图" : "原生预览视图", showSource ? "这里展示可复制、可编辑的原文件片段；切回预览可查看实时渲染。" : "已回到原生文件的渲染预览，正文不需要常驻源码。 ");
}

async function copyNativeSource(block) {
  const source = nativeSourceFor(block);
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(source);
    showToast("原生源码已复制");
  } catch {
    showToast("浏览器未授权剪贴板；源码已显示在源码视图");
  }
  setLive("复制原生源码", "复制内容保持 Mermaid / Canvas JSON / Excalidraw JSON 的原生可导入格式。 ");
}

function copyNativeImage(block) {
  const kind = block.dataset.blockKind;
  const target = kind === "mermaid" ? block.querySelector("#mermaid-render svg") : kind === "excalidraw" ? block.querySelector("#excalidraw-render") : block.querySelector("#json-canvas-render");
  if (!target) return showToast("当前预览还在渲染中");
  setLive("复制预览图像", "mock 已选择当前原生预览；真实实现会将 SVG 或 Canvas 截图写入系统剪贴板。 ");
  showToast("已选择预览图像（mock）");
}

function scheduleNativeStep(review, delay, callback) {
  review._timers ||= [];
  review._timers.push(setTimeout(() => {
    if (review.isConnected) callback();
  }, delay));
}

function clearNativeSteps(review) {
  (review._timers || []).forEach((timer) => clearTimeout(timer));
  review._timers = [];
}

function recordNativeStep(review, label) {
  review._stepCount = (review._stepCount || 0) + 1;
  const log = review.querySelector(".native-stream-log");
  const row = document.createElement("span");
  row.innerHTML = `<svg><use href="#i-check"></use></svg>${escapeHtml(label)}`;
  log?.appendChild(row);
  const progress = review.querySelector("[data-native-progress]");
  if (progress) progress.textContent = `已应用 ${review._stepCount} 个增量 patch`;
}

function finishNativeStream(review) {
  review.classList.remove("is-busy");
  const progress = review.querySelector("[data-native-progress]");
  if (progress) progress.textContent = "预览已更新 · 尚未写回原文件";
  const accept = review.querySelector('[data-native-review="accept"]');
  if (accept) accept.disabled = false;
}

function nativeReview(block, title, restore, accept) {
  block.querySelector(".native-inline-review")?.remove();
  const review = document.createElement("div");
  review.className = "native-inline-review is-busy";
  review.innerHTML = `<div class="native-review-copy"><span><svg><use href="#i-spark"></use></svg>${escapeHtml(title)}</span><small data-native-progress>正在生成第一个增量 patch…</small></div><div class="native-stream-log" aria-live="polite"></div><div class="native-review-actions"><button data-native-review="accept" disabled><svg><use href="#i-check"></use></svg>接受</button><button data-native-review="restore">还原</button></div>`;
  const sourcePane = block.querySelector(".native-source-pane");
  if (sourcePane) sourcePane.after(review);
  else block.appendChild(review);
  review._dismiss = () => {
    clearNativeSteps(review);
    restore();
    review.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  review.querySelector('[data-native-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-native-review="accept"]').addEventListener("click", () => {
    clearNativeSteps(review);
    accept();
    review.remove();
    block.classList.remove("is-ai-running");
  });
  return review;
}

function runNativeIncrement(block, item) {
  closeAiCards();
  block.classList.add("has-ai-card", "is-ai-running");
  const kind = block.dataset.blockKind;
  if (kind === "mermaid") {
    const render = block.querySelector("#mermaid-render");
    const original = render.dataset.definition;
    const definitions = [
      `${original}\n  F{来源校验}`,
      `${original}\n  F{来源校验}\n  C --> F`,
      `${original}\n  F{来源校验}\n  C --> F\n  F -->|可信| D`,
      `${original}\n  F{来源校验}\n  C --> F\n  F -->|可信| D\n  F -->|待核对| B`,
    ];
    const restore = () => { render.dataset.definition = original; renderMermaid(); syncNativeSource(block); };
    const accept = () => {
      block.dataset.source = `\`\`\`mermaid\n${render.dataset.definition}\n\`\`\``;
      markAiAccepted(block, item, item.label, restore);
      setLive("Mermaid 分支已写入", "AI 增量添加了来源校验节点和两条边，预览与 Mermaid 源码保持一致。 ");
    };
    const review = nativeReview(block, item.label, restore, accept);
    const labels = ["新增“来源校验”节点", "连接信息管理 → 来源校验", "补充可信分支", "补充待核对回路"];
    definitions.forEach((definition, index) => {
      scheduleNativeStep(review, 320 + index * 430, () => {
        render.dataset.definition = definition;
        renderMermaid();
        syncNativeSource(block);
        recordNativeStep(review, labels[index]);
        if (index === definitions.length - 1) finishNativeStream(review);
      });
    });
    setLive("Mermaid 增量生成", "先加入一个节点，再补两条边；每一步都会重新渲染预览，直到你接受写回。 ");
    return;
  }
  if (kind === "canvas") {
    const original = JSON.parse(JSON.stringify(canvasData));
    const restore = () => { canvasData.nodes = original.nodes; canvasData.edges = original.edges; renderCanvas(); syncNativeSource(block); };
    const accept = () => {
      block.dataset.source = `![[assets/pkm-composer.canvas]]\n<!-- ${canvasData.nodes.length} nodes / ${canvasData.edges.length} edges -->`;
      markAiAccepted(block, item, item.label, restore);
      setLive("Canvas 节点已写入", "画布中新增了一个可回访问题节点和连接边，Canvas JSON 与预览已同步。 ");
    };
    const review = nativeReview(block, item.label, restore, accept);
    scheduleNativeStep(review, 320, () => {
      canvasData.nodes.push({ id: "verify", type: "text", x: 360, y: -130, width: 220, height: 86, color: "6", text: "## 来源校验\n为关键判断补来源、置信度和下一步。" });
      renderCanvas();
      syncNativeSource(block);
      recordNativeStep(review, "新增来源校验节点");
    });
    scheduleNativeStep(review, 920, () => {
      canvasData.edges.push({ fromNode: "manage", toNode: "verify", label: "待核对", color: "6" });
      canvasData.edges.push({ fromNode: "verify", toNode: "output", label: "确认后输出", color: "6" });
      renderCanvas();
      syncNativeSource(block);
      recordNativeStep(review, "写入两条 Canvas edge");
      finishNativeStream(review);
    });
    setLive("Canvas 增量生成", "先写入节点，再写入两条 edge；每一小步都会重新渲染 JSON Canvas 预览。 ");
    return;
  }
  if (kind === "excalidraw") {
    const originalNodes = excalidrawNodes.map((node) => ({ ...node }));
    const originalEdges = excalidrawEdges.map((edge) => [...edge]);
    const restore = () => { excalidrawNodes.splice(0, excalidrawNodes.length, ...originalNodes); excalidrawEdges.splice(0, excalidrawEdges.length, ...originalEdges); renderExcalidraw(); syncNativeSource(block); };
    const accept = () => {
      block.dataset.source = `![[assets/101-A-产品类别分析.excalidraw.md]]\n<!-- ${excalidrawNodes.length} elements -->`;
      markAiAccepted(block, item, item.label, restore);
      setLive("Excalidraw 节点已写入", "手绘图新增了来源校验节点与连接线，保留 Excalidraw 的原始元素格式。 ");
    };
    const review = nativeReview(block, item.label, restore, accept);
    scheduleNativeStep(review, 320, () => {
      excalidrawNodes.push({ x: 588, y: 28, w: 160, h: 44, text: "来源校验", color: "#2563eb" });
      renderExcalidraw();
      syncNativeSource(block);
      recordNativeStep(review, "绘制来源校验节点");
    });
    scheduleNativeStep(review, 920, () => {
      excalidrawEdges.push(["信息管理", "来源校验"], ["来源校验", "信息输出"]);
      renderExcalidraw();
      syncNativeSource(block);
      recordNativeStep(review, "连接两条手绘关系线");
      finishNativeStream(review);
    });
    setLive("Excalidraw 增量生成", "先落一个手绘节点，再逐步添加两根连接线；过程中的每一次变更都会重新渲染。 ");
    return;
  }
  return runInsert(block, block, item);
}

function handleAction(action, button) {
  if (action === "open-ai-input") return openAiInput(button);
  if (action === "close-ai-input") return closeAiInput(button);

  const micro = button.closest(".micro-block");
  const block = button.closest(".doc-block");
  if (!block) return;
  setFocusedBlock(block);
  pulseButton(button, block, action);

  if (action === "toggle-ai-history") return toggleAiHistory(button, block, micro || block);

  if (action === "easy-copy" && micro) return openBlockCopyMenu(block, micro);
  if (micro) return handleMicroAction(action, micro, button, block);

  if (action === "save-comment") return saveComment(block);
  if (action === "cancel-comment") return cancelComment(block);
  if (action === "close-insert") return closeInsertStrip(block);
  if (action === "cancel-merge-mode") return closeMergeSelectionMode("已取消合并");
  if (action === "close-table-formula") return closeTableFormulaEditor();
  if (action === "apply-table-formula") return applyTableFormula();
  if (action === "draft-commit") return commitDraft(block);
  if (action === "draft-ai") return runDraftAi(block);
  if (action === "draft-cancel") return removeDraft(block);
  if (action === "review-insight") {
    const panel = button.closest(".insight-panel");
    const insight = INSIGHTS[Number(panel?.dataset.insightIndex)];
    if (!insight) return;
    return showAiSuggestionCard(block, { label: "复核 insight", reason: `${insight.kind} 有时效`, trigger: "insight", microTitle: insight.kind });
  }
  if (action === "confirm-insight") {
    const panel = button.closest(".insight-panel");
    const insight = INSIGHTS[Number(panel?.dataset.insightIndex)];
    if (!insight) return;
    insight.status = insight.status === "已确认" ? "未确认" : "已确认";
    button.textContent = insight.status === "已确认" ? "取消确认" : "标记已确认";
    panel.querySelector(".insight-head small").textContent = insightHeadMeta(insight);
    const badge = block.querySelector(`.insight-badge[data-insight-index="${panel.dataset.insightIndex}"]`);
    if (badge) badge.textContent = `${insight.kind} · ${insight.status}`;
    setLive("insight 状态已更新", `${insight.kind} 现在是「${insight.status}」。只有已确认的 insight 才有资格写回正文。`);
    return showToast(`Insight ${insight.status}`);
  }
  if (action === "close-insight") {
    const panel = button.closest(".insight-panel");
    if (panel) panel.hidden = true;
    syncOpenEditorState(block);
    return;
  }
  if (action === "insert") return showInsertMenu(button, block);
  if (action === "remove") return handleRemove(block, button);
  if (action === "comment") return handleComment(block);
  if (action === "ai") return toggleAiMenu(block);
  if (action === "move") return handleMove(block);
  if (action === "easy-copy") return openBlockCopyMenu(block);
  if (action === "switch-chart") return renderChartDraft(block, button.dataset.chartType || "bar");
  if (action === "switch-image-layout") return switchImageLayout(block, button.dataset.imageLayout || "hero");
  if (action === "add-row") return addTableRow();
  if (action === "add-column") return addTableColumn();
  if (action === "remove-row") return removeTableRow();
  if (action === "align-table") return alignTableColumn();
  if (action === "sort-table") return sortTableByCurrentColumn();
  if (action === "formula-table") return openTableFormulaEditor();
  if (["merge-cells", "transpose-table", "chart-table"].includes(action)) return handleTableTool(action);
  if (action === "zoom-image") return selectImageMode(block, "zoom");
  if (action === "edit-image") return openImageToolPanel(block, "convert");
  if (action === "rename-image") return openImageToolPanel(block, "rename");
  if (action === "crop-image") return selectImageMode(block, "crop");
  if (action === "annotate-image") return toggleImageAnnotation(block);
  if (action === "ai-caption") return showAiSuggestionCard(block, { label: "生成图注", trigger: "image-toolbar" });
  if (action === "ai-image") {
    closeAiCards();
    return openImageToolPanel(block, "ai");
  }
  if (action === "ai-table") return showAiSuggestionCard(block, { label: "总结表格", trigger: "table-toolbar" });
  if (action === "paste-csv") {
    setLive("CSV 粘贴", "CSV 会被解析成 Markdown 表格，并在写入前提供源格式预览。");
    return showToast("CSV 粘贴流程预览");
  }
  if (action === "native-view") return toggleNativeView(block, button.dataset.nativeMode || "preview");
  if (action === "copy-native-source") return copyNativeSource(block);
  if (action === "copy-native-image") return copyNativeImage(block);
  if (action === "open-native") return handleNative(block);
  if (action === "ai-native") {
    return showAiSuggestionCard(block, {
      label: button.dataset.aiLabel || getAiActions(block)[0].label,
      trigger: "native-toolbar",
    });
  }
}

function initImageGallery() {
  const galleryLinks = paper.querySelectorAll(".lightgallery");
  if (!galleryLinks.length) return;
  if (!window.lightGallery) {
    setLive("图片查看器未加载", "lightGallery 没有加载成功；图片仍会以普通附件链接显示。");
    return;
  }

  imageGallery = window.lightGallery(paper, {
    plugins: [window.lgThumbnail, window.lgZoom].filter(Boolean),
    selector: ".lightgallery",
    speed: 400,
    hideBarsDelay: 2000,
    allowMediaOverlap: true,
    exThumbImage: "data-thumbnail",
    toggleThumb: true,
    thumbWidth: 80,
    thumbHeight: "60px",
    actualSize: false,
    showZoomInOutIcons: true,
    download: false,
  });
}

function renderCanvas() {
  const root = document.getElementById("json-canvas-render");
  if (!root) return;
  root.innerHTML = "";

  const nodes = canvasData.nodes;
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const width = root.clientWidth || 780;
  const height = root.clientHeight || 430;
  const scale = Math.min((width - 48) / (maxX - minX), (height - 48) / (maxY - minY));
  const offsetX = 24 - minX * scale;
  const offsetY = 24 - minY * scale;
  const nodeById = new Map();

  function place(value, axis) {
    return value * scale + (axis === "x" ? offsetX : offsetY);
  }

  nodes.forEach((node) => {
    nodeById.set(node.id, node);
    if (node.type !== "group") return;

    const group = document.createElement("div");
    group.className = "canvas-group";
    group.style.left = `${place(node.x, "x")}px`;
    group.style.top = `${place(node.y, "y")}px`;
    group.style.width = `${node.width * scale}px`;
    group.style.height = `${node.height * scale}px`;
    group.innerHTML = `<span class="canvas-group-label">${node.label}</span>`;
    root.appendChild(group);
  });

  canvasData.edges.forEach((edge) => {
    const from = nodeById.get(edge.fromNode);
    const to = nodeById.get(edge.toNode);
    if (!from || !to) return;

    const x1 = place(from.x + from.width / 2, "x");
    const y1 = place(from.y + from.height / 2, "y");
    const x2 = place(to.x + to.width / 2, "x");
    const y2 = place(to.y + to.height / 2, "y");
    const dx = x2 - x1;
    const dy = y2 - y1;
    const line = document.createElement("div");
    line.className = "canvas-edge";
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.width = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    line.style.background = canvasColors[edge.color] || "#8195b4";
    line.style.color = canvasColors[edge.color] || "#8195b4";
    root.appendChild(line);

    const label = document.createElement("div");
    label.className = "canvas-edge-label";
    label.textContent = edge.label;
    label.style.left = `${(x1 + x2) / 2 - 18}px`;
    label.style.top = `${(y1 + y2) / 2 - 14}px`;
    root.appendChild(label);
  });

  nodes.forEach((node) => {
    if (node.type === "group") return;

    const el = document.createElement("div");
    el.className = `canvas-node ${node.type === "file" ? "file-node" : ""}`;
    el.style.left = `${place(node.x, "x")}px`;
    el.style.top = `${place(node.y, "y")}px`;
    el.style.width = `${node.width * scale}px`;
    el.style.height = `${node.height * scale}px`;
    el.style.borderColor = canvasColors[node.color] || "#c5cedd";

    if (node.type === "file") {
      const file = node.file.split("/").pop();
      el.innerHTML = `<strong>${file}</strong><span>${node.file}</span>`;
    } else {
      const [heading, ...rest] = node.text.split("\n");
      el.innerHTML = `<strong>${heading.replace(/^#+\s*/, "")}</strong><span>${rest.join(" ")}</span>`;
    }

    root.appendChild(el);
  });

  const source = document.getElementById("canvas-source-code");
  if (source) source.textContent = JSON.stringify(canvasData, null, 2);
}

function svgText(svg, x, y, text, options = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("font-size", options.size || 14);
  node.setAttribute("font-weight", options.weight || 760);
  node.setAttribute("fill", options.color || "#172033");
  node.setAttribute("text-anchor", options.anchor || "middle");
  node.textContent = text;
  svg.appendChild(node);
}

function renderExcalidraw() {
  const svg = document.getElementById("excalidraw-render");
  if (!svg || !window.rough) return;

  svg.innerHTML = "";
  const rc = rough.svg(svg);
  const byText = new Map(excalidrawNodes.map((node) => [node.text, node]));

  excalidrawEdges.forEach(([fromText, toText]) => {
    const from = byText.get(fromText);
    const to = byText.get(toText);
    if (!from || !to) return;

    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;
    svg.appendChild(rc.line(x1, y1, x2, y2, {
      stroke: "#56657c",
      strokeWidth: 1.4,
      roughness: 1.4,
      bowing: 2,
    }));
  });

  excalidrawNodes.forEach((node) => {
    svg.appendChild(rc.rectangle(node.x, node.y, node.w, node.h, {
      stroke: node.color,
      strokeWidth: 2,
      roughness: 1.8,
      fill: "#ffffff",
      fillStyle: "solid",
    }));
    svgText(svg, node.x + node.w / 2, node.y + node.h / 2 + 5, node.text, {
      color: node.color,
      size: node.text.length > 8 ? 13 : 15,
    });
  });

  const source = document.getElementById("excalidraw-source-code");
  if (source) source.textContent = JSON.stringify({ type: "excalidraw", elements: excalidrawNodes, edges: excalidrawEdges }, null, 2);

}

function renderMermaid() {
  const node = document.getElementById("mermaid-render");
  if (!node || !window.mermaid) return;

  try {
    window.mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { curve: "basis" } });
    const definition = node.dataset.definition || "";
    const source = document.getElementById("mermaid-source-code");
    if (source) source.textContent = definition;
    const rendered = window.mermaid.render(`mermaid-pkm-flow-${++mermaidRenderSerial}`, definition);
    if (rendered && typeof rendered.then === "function") {
      rendered.then((out) => {
        node.innerHTML = typeof out === "string" ? out : out.svg;
      }).catch(() => {});
    }
  } catch {
    // keep the plain-text fallback already in the markup
  }
}

function renderMathBlocks() {
  if (!window.katex) return;

  document.querySelectorAll("[data-tex]").forEach((node) => {
    katex.render(node.dataset.tex, node, {
      displayMode: node.classList.contains("math-render"),
      throwOnError: false,
      strict: false,
    });
  });
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented) return;
  const ambientTab = event.target.closest("[data-intelligence-mode]");
  if (ambientTab) {
    event.preventDefault();
    switchAmbientView(ambientTab.dataset.intelligenceMode);
    return;
  }
  const ambientAction = event.target.closest("[data-ambient-action]");
  if (ambientAction) {
    event.preventDefault();
    handleAmbientAction(ambientAction.dataset.ambientAction, ambientAction.dataset.ambientId);
    return;
  }
  if (event.target.closest("[data-copilot-capabilities]")) {
    event.preventDefault();
    openCopilotSubview("capabilities");
    return;
  }
  const copilotView = event.target.closest("[data-copilot-view]");
  if (copilotView) {
    event.preventDefault();
    openCopilotSubview(copilotView.dataset.copilotView);
    return;
  }
  const capabilityChoice = event.target.closest("[data-copilot-capability]");
  if (capabilityChoice) {
    event.preventDefault();
    openCapabilityRunner(capabilityChoice.dataset.copilotCapability);
    return;
  }
  const capabilityOption = event.target.closest("[data-copilot-option]");
  if (capabilityOption) {
    event.preventDefault();
    capabilityOption.parentElement?.querySelectorAll("[data-copilot-option]").forEach((option) => option.classList.toggle("is-active", option === capabilityOption));
    return;
  }
  const capabilityRun = event.target.closest("[data-copilot-capability-run]");
  if (capabilityRun) {
    event.preventDefault();
    runCapability(capabilityRun.dataset.copilotCapabilityRun);
    return;
  }
  const capabilityDraft = event.target.closest("[data-copilot-capability-draft]");
  if (capabilityDraft) {
    event.preventDefault();
    const capability = copilotCapabilities.find((item) => item.id === capabilityDraft.dataset.copilotCapabilityDraft);
    const input = document.getElementById("copilot-input");
    if (!capability || !input) return;
    input.value = capabilityPrompt(capability);
    openCopilotSubview("thread");
    input.focus();
    return;
  }
  const capabilityApply = event.target.closest("[data-copilot-capability-apply]");
  if (capabilityApply) {
    event.preventDefault();
    applyCapability(capabilityApply.dataset.copilotCapabilityApply);
    return;
  }
  const historyPreview = event.target.closest("[data-history-preview]");
  if (historyPreview) {
    event.preventDefault();
    previewHistoryEntry(Number(historyPreview.dataset.historyPreview));
    return;
  }
  const historyLocate = event.target.closest("[data-history-locate]");
  if (historyLocate) {
    event.preventDefault();
    locateHistoryEntry(Number(historyLocate.dataset.historyLocate));
    return;
  }
  const sourcebarToggle = event.target.closest("[data-sourcebar-toggle]");
  if (sourcebarToggle) {
    event.preventDefault();
    const expanded = sourcebar?.classList.toggle("is-expanded") || false;
    sourcebarToggle.setAttribute("aria-expanded", String(expanded));
    if (sourcebarDetail) sourcebarDetail.hidden = !expanded;
    return;
  }
  const copilotSuggestion = event.target.closest("[data-copilot-suggestion]");
  if (copilotSuggestion) {
    event.preventDefault();
    if (copilotSuggestion.dataset.copilotSuggestion === "organize") switchAmbientView("copilot");
    const input = document.getElementById("copilot-input");
    if (!input) return;
    const suggestionText = {
      visual: "为这一节生成一张能解释来源、判断与行动关系的说明图",
      evidence: "检查当前判断缺少什么证据，并补充可追溯的来源",
      rewrite: "把当前块改成更清楚、可验证的判断，并保留原意",
      organize: "读取本节、最近编辑和关联来源，把未落位的想法整理成可插入的大纲与桥接段",
    };
    input.value = suggestionText[copilotSuggestion.dataset.copilotSuggestion] || "继续完善当前内容";
    input.focus();
    return;
  }
  if (event.target.closest("[data-copilot-context]")) {
    event.preventDefault();
    if (copilotContext) copilotContext.textContent = "已加入：当前块、前后两段、2 条 Ambient 关联";
    setLive("Copilot 上下文已扩展", "本轮会同时参考正文邻域和高置信 Ambient 关联，不需要把上下文复制进聊天框。 ");
    return;
  }
  const copilotArtifact = event.target.closest("[data-copilot-artifact]");
  if (copilotArtifact) {
    event.preventDefault();
    focusedBlock?.scrollIntoView({ behavior: "smooth", block: "center" });
    focusedBlock?.classList.add("is-copilot-located");
    setTimeout(() => focusedBlock?.classList.remove("is-copilot-located"), 850);
    setLive("已定位 Copilot 上下文", "关系草图对应当前焦点块；生成后的图表会紧接在该块后面出现。 ");
    return;
  }
  const copilotApply = event.target.closest("[data-copilot-apply]");
  if (copilotApply) {
    event.preventDefault();
    const copilotMessage = copilotApply.closest(".copilot-message");
    const targetBlock = copilotMessage?._copilotBlock || focusedBlock;
    if (!targetBlock) return showToast("先选择一个块");
    const isVisual = copilotApply.dataset.copilotApply === "visual";
    showAiSuggestionCard(targetBlock, {
      label: isVisual ? "生成配图" : "润色改写",
      reason: "Copilot 对话产物",
      customText: isVisual ? "" : (copilotMessage?._copilotCommand || "将判断改得更清楚且可验证"),
      trigger: "copilot",
    });
    setLive(isVisual ? "Copilot 图块已发往正文" : "Copilot patch 已发往正文", isVisual ? "图表将作为真实图像草稿出现在当前块下方。" : "正文将原地显示流式 diff，接受后才写入 Markdown。 ");
    return;
  }
  const voiceInput = event.target.closest("[data-copilot-voice]");
  if (voiceInput) {
    event.preventDefault();
    const input = document.getElementById("copilot-input");
    const listening = voiceInput.getAttribute("aria-pressed") !== "true";
    voiceInput.setAttribute("aria-pressed", String(listening));
    voiceInput.classList.toggle("is-listening", listening);
    if (!listening) {
      setLive("听写已停止", "语音内容只保留在输入草稿中");
      return;
    }
    setLive("正在听写", "语音会先进入输入框，不会自动运行能力");
    window.setTimeout(() => {
      if (voiceInput.getAttribute("aria-pressed") !== "true" || !input) return;
      input.value = input.value || "把当前判断改清楚，并保留来源和回滚路径";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      voiceInput.setAttribute("aria-pressed", "false");
      voiceInput.classList.remove("is-listening");
      input.focus();
      setLive("听写已转成草稿", "确认或编辑后再发送");
    }, 620);
    return;
  }
  if (event.target.closest("[data-copilot-send]")) {
    event.preventDefault();
    runCopilotCommand();
    return;
  }
  const historyReplay = event.target.closest("[data-ai-history-replay]");
  if (historyReplay) {
    event.preventDefault();
    const entry = aiSuggestionHistory[Number(historyReplay.dataset.aiHistoryReplay)];
    if (!entry) return;
    showAiSuggestionCard(entry.block, {
      label: entry.item.label,
      reason: entry.item.reason,
      host: entry.microTitle ? historyReplay.closest(".micro-block") || entry.block : entry.block,
      microTitle: entry.microTitle,
      customText: entry.customText,
      trigger: "history",
    });
    return;
  }
  const rollbackButton = event.target.closest("[data-rollback-index]");
  if (rollbackButton) return rollbackEntry(Number(rollbackButton.dataset.rollbackIndex));

  const issuePill = event.target.closest(".issue-pill");
  if (issuePill) {
    event.preventDefault();
    const block = issuePill.closest(".doc-block");
    if (!block) return;
    setFocusedBlock(block);
    const micro = issuePill.closest(".micro-block");
    showAiSuggestionCard(block, {
      label: issuePill.dataset.aiLabel,
      reason: issuePill.dataset.reason || "",
      trigger: "issue",
      host: micro || block,
      microTitle: micro?.dataset.microTitle || "",
    });
    return;
  }

  const aiQuickButton = event.target.closest("[data-ai-quick]");
  const actionButton = event.target.closest("[data-action]");
  const panelButton = event.target.closest("[data-panel-action]");
  const insertButton = event.target.closest("[data-insert-kind]");
  const block = event.target.closest(".doc-block");

  if (block) setFocusedBlock(block);

  if (aiQuickButton) {
    event.preventDefault();
    const targetBlock = aiQuickButton.closest(".doc-block");
    if (!targetBlock) return;
    const menu = aiQuickButton.closest(".ai-menu");
    const micro = aiQuickButton.closest(".micro-block");
    if (menu && !menu.classList.contains("block-action-bar")) {
      menu.hidden = true;
      syncOpenEditorState(targetBlock);
    }
    showAiSuggestionCard(targetBlock, {
      label: aiQuickButton.dataset.aiQuick,
      reason: aiQuickButton.dataset.reason || "",
      trigger: menu ? "ai-menu" : "quick-chip",
      host: micro || targetBlock,
      microTitle: micro?.dataset.microTitle || "",
    });
    return;
  }

  const draftType = event.target.closest("[data-draft-type]");
  if (draftType) {
    event.preventDefault();
    const draft = draftType.closest(".draft-block");
    const input = draft.querySelector(".draft-input");
    input.value = draftType.dataset.draftType + input.value + (draftType.dataset.suffix || "");
    input.focus();
    updateDraftPreview(draft);
    return;
  }

  const insightBadge = event.target.closest(".insight-badge");
  if (insightBadge) {
    event.preventDefault();
    const targetBlock = insightBadge.closest(".doc-block");
    const insight = INSIGHTS[Number(insightBadge.dataset.insightIndex)];
    if (!targetBlock || !insight) return;
    setFocusedBlock(targetBlock);
    toggleInsightPanel(targetBlock, insight, insightBadge);
    return;
  }

  if (actionButton) {
    event.preventDefault();
    if (actionButton.dataset.action === "move" && suppressNextMoveClick) {
      suppressNextMoveClick = false;
      return;
    }
    handleAction(actionButton.dataset.action, actionButton);
    return;
  }

  if (panelButton) {
    const action = panelButton.dataset.panelAction;
    const targetTitle = focusedBlock ? focusedBlock.dataset.blockTitle || "当前块" : "尚未选中块";
    setLive("Ambient action", `动作 ${escapeHtml(action)} 作用于“${escapeHtml(targetTitle)}”。焦点块由点击/编辑确定，不随 hover 漂移。`);
    showToast(`Ambient action: ${action}`);
    if (action === "rewrite" && focusedBlock) {
      showAiSuggestionCard(focusedBlock, { label: getAiActions(focusedBlock)[0].label, trigger: "ambient" });
    }
    if (action === "comment" && focusedBlock) handleComment(focusedBlock);
    if (action === "source" && focusedBlock) {
      focusedBlock.classList.toggle("is-source-open");
      const isOpen = focusedBlock.classList.contains("is-source-open");
      document.querySelectorAll('[data-panel-action="source"]').forEach((sourceButton) => {
        sourceButton.innerHTML = `<svg><use href="#i-code"></use></svg> ${isOpen ? "收起源格式" : "展开源格式"}`;
      });
      setLive(isOpen ? "源格式已展开" : "源格式已收起", isOpen ? "这里只展示当前块的 Markdown 或原生文件引用；阅读态不再常驻显示路径和语法。" : "正文回到阅读优先的状态。需要时仍可随时展开。 ");
      return;
    }
    return;
  }

  if (insertButton) {
    event.preventDefault();
    const kind = insertButton.dataset.insertKind;
    const hostBlock = insertButton.closest(".doc-block");
    if (!hostBlock) return;
    closeInsertStrip(hostBlock);
    createDraftBlock(hostBlock, kind);
    setLive("插入草稿已创建", `${escapeHtml(kind)} 已在当前块下方原地展开；可以继续编辑、预览，再决定是否写入 Markdown。`);
  }
});

document.addEventListener("focusin", (event) => {
  const block = event.target.closest?.(".doc-block");
  if (block) setFocusedBlock(block);
});

document.addEventListener("keydown", (event) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "z" && !isNativeUndoTarget(event.target)) {
    event.preventDefault();
    if (event.shiftKey) redoComposerTransaction();
    else undoComposerTransaction();
    return;
  }
  if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "y" && !isNativeUndoTarget(event.target)) {
    event.preventDefault();
    redoComposerTransaction();
    return;
  }
  if (event.target.closest?.("[data-intelligence-root]")) return;
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.target.closest?.(".draft-input")) {
    const anchor = event.target.closest?.(".doc-block") || focusedBlock;
    if (!anchor || anchor.classList.contains("draft-block")) return;
    event.preventDefault();
    createDraftBlock(anchor);
    return;
  }
  if (event.key !== "Escape") return;
  if (document.documentElement.classList.contains("lg-on")) {
    closeImageGallery();
    return;
  }
  if (closeTopSurface()) event.stopPropagation();
}, true);

initHistorySnapshots();
seedHistoryTransactions();
initComposerTransactionControls();
initDirectEditTransactions();
switchAmbientView("copilot");
setFocusedBlock(document.querySelector('[data-block-title="AI 旁路段落"]') || document.querySelector(".title-block") || document.querySelector(".paragraph-block"));
initBlockBadges();
initInsights();
initMicroHints();
initLinkPopover();
initFormatTokenPopover();
initControlLabels();
initBlockDragHandles();
initTableInteractions();
renderCanvas();
renderExcalidraw();
renderMathBlocks();
renderMermaid();
initImageGallery();
renderAmbientPushCards();
renderCapabilityBrowser();
document.getElementById("copilot-capability-search")?.addEventListener("input", (event) => {
  renderCapabilityBrowser(event.currentTarget.value);
});
document.getElementById("copilot-input")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  runCopilotCommand();
});

/* ---------- one continuous editing surface + selection-aware actions ---------- */

const selectionToolbar = document.getElementById("selection-toolbar");
const selectionScope = document.getElementById("selection-scope");
const selectionReview = document.getElementById("selection-review");
const selectionToolbarPopover = document.getElementById("selection-toolbar-popover");
let selectionState = null;
let reviewSelectionState = null;
let selectionFrame = 0;
let aiRefreshTimer = 0;

const SELECTION_FORMAT_UNIT_SELECTOR = [
  "p",
  "li",
  "td",
  "th",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figcaption",
  "code",
  ".callout-title",
  ".callout-body",
  ".metadata-grid > span",
  ".metadata-grid > strong",
  ".base-row > span",
  ".source-line > span",
].join(",");

function markEditorChrome(root = paper) {
  const selector = [
    "button",
    "input",
    "textarea",
    "select",
    "svg",
    ".block-controls",
    ".block-badges",
    ".block-tail-actions",
    ".ai-anchor",
    ".micro-tail-actions",
    ".object-toolbar",
    ".block-copy-menu",
    ".image-tool-panel",
    ".native-actions",
    ".native-inline-tools",
    ".native-inline-review",
    ".native-source-pane",
    ".table-toolbar",
    ".micro-controls",
    ".insert-strip",
    ".ai-menu",
    ".comment-editor",
    ".rw-review",
    ".ins-card",
    ".generated-draft-review",
    ".insight-panel",
    ".source-details",
    ".metadata-review",
    ".list-review",
    ".list-to-table-review",
    ".checklist-review",
    ".vault-link-review",
    ".formula-review",
    ".formula-explainer",
    ".formula-extract-review",
    ".formula-breakdown",
    ".generated-formula-block",
  ].join(",");
  if (root.matches?.(selector)) root.contentEditable = "false";
  const chrome = root.querySelectorAll(selector);
  chrome.forEach((node) => {
    node.contentEditable = "false";
  });
}

function initComposerCanvas() {
  markEditorChrome();
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.("button,input,textarea,select,svg")) node.contentEditable = "false";
        markEditorChrome(node);
      });
    });
  });
  observer.observe(paper, { childList: true, subtree: true });

  paper.addEventListener("input", (event) => {
    if (event.target.closest?.("input,textarea,button")) return;
    const block = event.target.closest?.(".doc-block");
    if (!block) return;
    block.classList.add("ai-needs-refresh");
    clearTimeout(aiRefreshTimer);
    aiRefreshTimer = window.setTimeout(() => refreshBlockAi(block), 620);
  });
}

function refreshBlockAi(block) {
  block.classList.remove("ai-needs-refresh");
  const actions = getAiActions(block);
  const actionBar = block.querySelector(":scope > .block-action-bar");
  const pills = actionBar?.querySelector(".aim-pills");
  if (!actionBar || !pills) return;
  pills.innerHTML = `${aiPillsHTML(block)}<span class="sep"></span>`;
  actionBar.dataset.aiCount = String(actions.length);
  actionBar.title = actions.map((item) => `${item.label}（${item.reason}）`).join("\n");
  setLive("本块建议已更新", "编辑内容后，Composer 会重新评估当前块的类型、结构和当前内容，只保留与当前块有关的短动作。");
}

function selectionFormatUnit(node) {
  const parent = node.parentElement;
  const block = parent?.closest?.(".doc-block");
  if (!parent || !block) return null;
  const unit = parent.closest(SELECTION_FORMAT_UNIT_SELECTOR);
  if (unit && block.contains(unit)) return unit;
  return parent;
}

function selectionTextSegments(range) {
  const segments = [];
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.data || !node.data.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent?.closest(".doc-block")) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[contenteditable="false"],button,input,textarea,select,script,style')) return NodeFilter.FILTER_REJECT;
      try {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } catch (_error) {
        return NodeFilter.FILTER_REJECT;
      }
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    let start = node === range.startContainer ? range.startOffset : 0;
    let end = node === range.endContainer ? range.endOffset : node.data.length;
    start = Math.max(0, Math.min(start, node.data.length));
    end = Math.max(start, Math.min(end, node.data.length));
    const selected = node.data.slice(start, end);
    const leading = selected.match(/^\s*/)?.[0].length || 0;
    const trailing = selected.match(/\s*$/)?.[0].length || 0;
    start += leading;
    end -= trailing;
    if (end <= start) continue;
    const unit = selectionFormatUnit(node);
    const block = node.parentElement.closest(".doc-block");
    if (!unit || !block) continue;
    segments.push({ node, start, end, unit, block });
  }
  return segments;
}

function selectionFormatUnits(segments) {
  const grouped = [];
  const byUnit = new Map();
  segments.forEach((segment) => {
    let group = byUnit.get(segment.unit);
    if (!group) {
      group = { unit: segment.unit, block: segment.block, segments: [] };
      byUnit.set(segment.unit, group);
      grouped.push(group);
    }
    group.segments.push(segment);
  });
  return grouped.map((group) => {
    const first = group.segments[0];
    const last = group.segments.at(-1);
    const range = document.createRange();
    range.setStart(first.node, first.start);
    range.setEnd(last.node, last.end);
    return { ...group, range };
  });
}

function tableCellSelectionState() {
  if (!selectedTableCells.length || !selectedTableRange) return null;
  const block = table.closest(".doc-block");
  if (!block) return null;
  const rows = Array.from(table.rows);
  const units = selectedTableCells.map((cell) => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    return { unit: cell, block, segments: [], range };
  });
  const rects = selectedTableCells.map((cell) => cell.getBoundingClientRect());
  const rect = {
    left: Math.min(...rects.map((item) => item.left)),
    right: Math.max(...rects.map((item) => item.right)),
    top: Math.min(...rects.map((item) => item.top)),
    bottom: Math.max(...rects.map((item) => item.bottom)),
  };
  rect.width = rect.right - rect.left;
  rect.height = rect.bottom - rect.top;
  const cellsByRow = new Map();
  selectedTableCells.forEach((cell) => {
    const { row, column } = tableCellCoordinates(cell);
    if (!cellsByRow.has(row)) cellsByRow.set(row, []);
    cellsByRow.get(row).push({ cell, column });
  });
  const matrix = Array.from(cellsByRow.entries())
    .sort(([rowA], [rowB]) => rowA - rowB)
    .map(([, cells]) => cells
      .sort((a, b) => a.column - b.column)
      .map(({ cell }) => cell.textContent.trim()));
  const merge = mergeableTableSelection();
  return {
    kind: "table-cells",
    range: units[0].range.cloneRange(),
    text: matrix.map((row) => row.join("\t")).join("\n"),
    blocks: [block],
    segments: [],
    units,
    matrix,
    rect,
    selectionMode: selectedTableMode || "range",
    isMergeable: merge.valid,
    mergeReason: merge.reason || "",
    rowCount: cellsByRow.size,
    columnCount: new Set(selectedTableCells.map((cell) => cell.cellIndex)).size,
  };
}

function selectionScopeText(state) {
  if (!state?.units?.length) return "";
  if (state.kind === "table-cells" && state.selectionMode === "discrete") return `不连续选择 · ${state.units.length} 个单元格 · ⌘/Ctrl 点击追加`;
  if (state.kind === "table-cells") return `${state.rowCount} 行 × ${state.columnCount} 列 · ${state.units.length} 个单元格`;
  const tags = state.units.map(({ unit }) => unit.tagName.toLowerCase());
  if (tags.every((tag) => tag === "td" || tag === "th")) return `跨 ${state.units.length} 个单元格`;
  if (tags.every((tag) => tag === "li")) return `跨 ${state.units.length} 个列表项`;
  if (state.blocks.length > 1) return `跨 ${state.blocks.length} 个块 · ${state.units.length} 个片段`;
  if (state.units.length > 1) return `跨 ${state.units.length} 个片段`;
  return "";
}

function getSelectionState() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return tableCellSelectionState();
  const range = selection.getRangeAt(0);
  const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!anchor || !paper.contains(anchor)) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const blocks = Array.from(paper.querySelectorAll(":scope > .doc-block"))
    .filter((block) => range.intersectsNode(block));
  if (!blocks.length) return null;
  if (blocks.some((block) => block.dataset.blockKind === "code") || anchor.closest?.("pre, code, .native-source-pane")) return null;
  const segments = selectionTextSegments(range);
  const units = selectionFormatUnits(segments);
  if (!units.length) return null;
  return { range: range.cloneRange(), text, blocks, segments, units };
}

function updateSelectionToolbar() {
  selectionFrame = 0;
  const state = getSelectionState();
  if (!state) {
    if (!selectionToolbarPopover.hidden && selectionState) return;
    paper.classList.remove("has-text-selection");
    selectionToolbar.hidden = true;
    if (selectionReview.hidden) selectionState = null;
    return;
  }

  selectionState = state;
  paper.classList.add("has-text-selection");
  document.querySelectorAll(".selection-table-only").forEach((element) => {
    element.hidden = state.kind !== "table-cells";
  });
  const mergeButton = selectionToolbar.querySelector('[data-selection-table-action="merge"]');
  if (mergeButton) {
    mergeButton.disabled = state.kind !== "table-cells" || !state.isMergeable;
    mergeButton.title = state.kind === "table-cells" && !state.isMergeable
      ? state.mergeReason
      : "合并为一个单元格；Markdown 源将保真升级为 HTML table";
  }
  const scope = selectionScopeText(state);
  selectionScope.hidden = !scope;
  selectionScope.textContent = scope;
  selectionToolbar.hidden = false;
  const rects = state.kind === "table-cells"
    ? [state.rect]
    : Array.from(state.range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const visibleRects = rects.filter((rect) => rect.bottom > 0 && rect.top < window.innerHeight);
  const rect = visibleRects[0] || rects[0] || state.range.getBoundingClientRect();
  const toolbarWidth = selectionToolbar.offsetWidth || 620;
  const left = Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, rect.left + rect.width / 2 - toolbarWidth / 2));
  const toolbarHeight = selectionToolbar.offsetHeight || 38;
  let preferredTop = rect.top - toolbarHeight - 8;
  if (state.kind === "table-cells") {
    const tableRect = table.getBoundingClientRect();
    const belowTable = tableRect.bottom + 8;
    preferredTop = belowTable + toolbarHeight <= window.innerHeight - 12
      ? belowTable
      : tableRect.top - toolbarHeight - 8;
  } else if (preferredTop < 12) {
    preferredTop = rect.bottom + 8;
  }
  const top = Math.max(12, Math.min(window.innerHeight - toolbarHeight - 12, preferredTop));
  selectionToolbar.style.left = `${left}px`;
  selectionToolbar.style.top = `${top}px`;
}

function scheduleSelectionToolbar() {
  if (selectionFrame) return;
  selectionFrame = requestAnimationFrame(updateSelectionToolbar);
}

function closeSelectionSurface() {
  const wasOpen = !selectionToolbar.hidden || !selectionReview.hidden;
  selectionToolbar.hidden = true;
  selectionToolbarPopover.hidden = true;
  selectionReview.hidden = true;
  selectionState = null;
  reviewSelectionState = null;
  document.querySelectorAll(".selection-table-only").forEach((element) => {
    element.hidden = true;
  });
  paper.classList.remove("has-text-selection");
  return wasOpen;
}

function selectionRange() {
  const state = selectionState;
  if (!state?.range || state.units.length !== 1) return null;
  return state.units[0].range.cloneRange();
}

function restoreSelectionState() {
  if (!selectionState?.range) return;
  if (selectionState.kind === "table-cells") {
    scheduleSelectionToolbar();
    return;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(selectionState.range.cloneRange());
  scheduleSelectionToolbar();
}

function createSelectionWrapper(tagName, attributes = {}) {
  const wrapper = document.createElement(tagName);
  wrapper.dataset.selectionFormatFragment = "true";
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "style") Object.assign(wrapper.style, value);
    else if (name === "className") wrapper.className = value;
    else wrapper.setAttribute(name, value);
  });
  return wrapper;
}

function finishSelectionTransaction(blocks) {
  if (selectionState?.kind === "table-cells") clearTableCellSelection();
  blocks.forEach((block) => block.classList.add("ai-needs-refresh"));
  closeSelectionSurface();
  setFocusedBlock(blocks.at(-1));
}

function commitSelectionWrapper(tagName, attributes = {}) {
  const range = selectionRange();
  if (!range) {
    showToast("一个链接只能落在一个段落、列表项或单元格内");
    return false;
  }
  const wrapper = createSelectionWrapper(tagName, attributes);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  finishSelectionTransaction(selectionState.blocks);
  return true;
}

function commitSelectionUnitWrappers(tagName, attributes = {}) {
  const state = selectionState;
  if (!state?.units?.length) return null;
  const units = state.units.map((unit) => ({ ...unit, range: unit.range.cloneRange() }));
  [...units].reverse().forEach(({ range }) => {
    const wrapper = createSelectionWrapper(tagName, attributes);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
  });
  finishSelectionTransaction(state.blocks);
  return { unitCount: units.length, blockCount: state.blocks.length };
}

function applySelectionFormat(format, value = "") {
  const formats = {
    bold: () => commitSelectionUnitWrappers("strong"),
    italic: () => commitSelectionUnitWrappers("em"),
    underline: () => commitSelectionUnitWrappers("span", { className: "html-format", style: { textDecoration: "underline", textUnderlineOffset: "2px" } }),
    strikeThrough: () => commitSelectionUnitWrappers("del"),
    foreColor: () => commitSelectionUnitWrappers("span", { className: "html-format", style: { color: value } }),
    hiliteColor: () => commitSelectionUnitWrappers("mark", { className: "html-format", style: { backgroundColor: value } }),
  };
  const applied = formats[format]?.();
  if (!applied) return;
  const enhanced = ["underline", "foreColor", "hiliteColor"].includes(format);
  const scope = applied.unitCount > 1 ? `已分别写入 ${applied.unitCount} 个结构片段；` : "";
  setLive("选区格式已应用", enhanced ? `${scope}每个片段会序列化为可回到源文件的 HTML span/mark，不跨越 Markdown 结构边界。` : `${scope}每个片段使用标准 Markdown 对应语法，并合并为同一撤销事务。`);
  showToast(enhanced ? "已应用 HTML 增强格式" : "已应用 Markdown 格式");
}

function renderSelectionPalette(format) {
  const isText = format === "foreColor";
  const colors = isText
    ? [["#1f2937", "正文"], ["#7c3aed", "紫色"], ["#2563eb", "蓝色"], ["#b45309", "棕色"], ["#b42318", "红色"], ["#16845f", "绿色"]]
    : [["#fff1a8", "重点"], ["#dff4e8", "定义"], ["#dfeaff", "资料"], ["#eee5ff", "想法"], ["#fde4e4", "风险"], ["transparent", "清除"]];
  selectionToolbarPopover.innerHTML = `<span>${isText ? "文字颜色" : "Highlightr 标记颜色"} · 写入可移除的 HTML 增强格式</span><div class="selection-palette">${colors.map(([color, label]) => `<button type="button" data-selection-color="${color}" data-selection-color-format="${format}" style="--selection-color:${color === "transparent" ? "#fff" : color}" title="${label}" aria-label="${label}"><i>${label}</i></button>`).join("")}</div>`;
  selectionToolbarPopover.hidden = false;
}

function renderSelectionLinkForm() {
  selectionToolbarPopover.innerHTML = `<div class="selection-popover-head"><span>Paste URL into selection · 也可手动输入 Wiki 链接</span><button type="button" data-selection-popover-close aria-label="关闭"><svg><use href="#i-x"></use></svg></button></div><div class="selection-link-form"><input type="text" data-selection-link-input placeholder="https://… 或 [[笔记名]]" /><button type="button" data-selection-link-paste><svg><use href="#i-link"></use></svg> 粘贴 URL</button><button type="button" data-selection-link-apply>应用</button></div><small class="selection-link-hint">直接按 ⌘V 粘贴 URL，也会立即把当前选区变成链接。</small>`;
  selectionToolbarPopover.hidden = false;
  selectionToolbarPopover.querySelector("input")?.focus();
}

async function pasteSelectionLinkFromClipboard() {
  const input = selectionToolbarPopover.querySelector("[data-selection-link-input]");
  try {
    const value = await navigator.clipboard.readText();
    if (!/^https?:\/\/\S+$/i.test(value.trim())) throw new Error("not url");
    if (input) input.value = value.trim();
    showToast("已读取剪贴板 URL");
  } catch (_error) {
    input?.focus();
    showToast("浏览器未开放剪贴板读取，请在输入框粘贴 URL");
  }
}

function applySelectionLink(valueOverride = "") {
  const input = selectionToolbarPopover.querySelector("[data-selection-link-input]");
  const value = valueOverride.trim() || input?.value.trim();
  if (!value) return showToast("先输入网址或 Wiki 链接");
  const wiki = value.match(/^\[\[(.+)\]\]$/);
  const href = wiki ? `obsidian://${wiki[1]}` : value;
  if (!commitSelectionWrapper("a", { href, className: wiki ? "internal-link" : "external-link" })) return;
  setLive("链接已添加", wiki ? "选区已绑定 Wiki 链接；接受写入时保留 [[…]] 语义。" : "选区已绑定 Markdown 链接；显示文字与目标地址分别保留。 ");
  showToast(wiki ? "已添加 Wiki 链接" : "已添加链接");
}

function renderSelectionCopyMenu(state = selectionState) {
  if (!state) return;
  selectionToolbarPopover._copyPayload = copyPayloadForSelection(state);
  selectionToolbarPopover.innerHTML = copyMenuMarkup(state.blocks.length > 1 ? `跨 ${state.blocks.length} 个块` : "当前选区");
  selectionToolbarPopover.hidden = false;
}

function selectionPreviewText(text) {
  return text.length > 116 ? `${text.slice(0, 116)}…` : text;
}

function selectionActionLabel(action) {
  return {
    polish: "润色选区",
    shorten: "精简选区",
    expand: "扩写选区",
  }[action] || "审阅选区";
}

function renderSelectionReview(action, state = selectionState) {
  if (!state) return;
  const endBlock = state.blocks.at(-1);
  if (!endBlock) return;
  const isAsk = action === "ask";
  const isTableCells = state.kind === "table-cells";
  const scopeTitle = isTableCells ? "单元格选区" : "跨块选区";
  const scopeDetail = isTableCells
    ? `${state.rowCount} 行 × ${state.columnCount} 列 · ${state.units.length} 个单元格`
    : `覆盖 ${state.blocks.length} 个内容块`;
  reviewSelectionState = state;
  selectionReview.hidden = false;
  selectionReview.dataset.selectionAction = action;
  selectionReview.innerHTML = `
    <div class="selection-review-head">
      <span>${scopeTitle}</span>
      <small>${scopeDetail}</small>
    </div>
    <p>“${escapeHtml(selectionPreviewText(state.text))}”</p>
    ${isAsk ? '<textarea class="selection-prompt" placeholder="例如：找出这段论证缺少的前提，并补一个问题"></textarea>' : `<strong>${selectionActionLabel(action)}</strong><small>先生成候选 patch，不直接改写原文。</small>`}
    <div class="selection-review-actions">
      <button type="button" data-selection-review="close">取消</button>
      <button type="button" class="is-primary" data-selection-review="run">${isAsk ? "生成建议" : "查看候选"}</button>
    </div>
  `;
  endBlock.after(selectionReview);
  if (isAsk) selectionReview.querySelector("textarea")?.focus();
}

function runSelectionReview() {
  const state = reviewSelectionState || selectionState;
  if (!state) return;
  const action = selectionReview.dataset.selectionAction || "polish";
  const endBlock = state.blocks.at(-1);
  if (!endBlock) return;
  const customText = selectionReview.querySelector(".selection-prompt")?.value.trim();
  if (action === "ask" && !customText) {
    showToast("先写下想让 AI 检查或补充的内容");
    selectionReview.querySelector(".selection-prompt")?.focus();
    return;
  }
  const label = action === "ask" ? (customText.length > 16 ? `${customText.slice(0, 16)}…` : customText) : selectionActionLabel(action);
  const scope = state.kind === "table-cells"
    ? `${state.rowCount} 行 × ${state.columnCount} 列：${selectionPreviewText(state.text)}`
    : `跨 ${state.blocks.length} 个块：${selectionPreviewText(state.text)}`;
  selectionReview.hidden = true;
  selectionToolbar.hidden = true;
  reviewSelectionState = null;
  showAiSuggestionCard(endBlock, {
    label,
    reason: scope,
    customText: action === "ask" ? customText : "",
    microTitle: state.kind === "table-cells" ? "单元格选区" : "跨块选区",
    host: endBlock,
  });
  setLive("跨块 AI 候选", "选区没有被直接覆盖；建议以可接受、可拒绝的 patch 展示在选区末尾，便于保留 Markdown 映射。 ");
}

function initSelectionToolbar() {
  document.addEventListener("selectionchange", scheduleSelectionToolbar);
  paper.addEventListener("pointerup", scheduleSelectionToolbar);
  selectionToolbar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("input,textarea")) return;
    event.preventDefault();
  });
  selectionToolbar.addEventListener("click", (event) => {
    if (event.target.closest("[data-copy-close],[data-selection-popover-close]")) {
      selectionToolbarPopover.hidden = true;
      restoreSelectionState();
      return;
    }
    const copyChoice = event.target.closest("[data-copy-kind]");
    if (copyChoice) return performCopyChoice(copyChoice.dataset.copyKind, selectionToolbarPopover._copyPayload, selectionToolbarPopover, copyChoice);
    const color = event.target.closest("[data-selection-color]");
    if (color) return applySelectionFormat(color.dataset.selectionColorFormat, color.dataset.selectionColor);
    if (event.target.closest("[data-selection-link-paste]")) return pasteSelectionLinkFromClipboard();
    if (event.target.closest("[data-selection-link-apply]")) return applySelectionLink();
    const tableAction = event.target.closest("[data-selection-table-action]");
    if (tableAction && selectionState?.kind === "table-cells") {
      if (tableAction.dataset.selectionTableAction === "clear") {
        clearTableCellSelection();
        closeSelectionSurface();
        return showToast("已清除单元格选择");
      }
      const merge = mergeableTableSelection();
      if (!merge.valid) return showToast(merge.reason);
      mergeSelectedCells();
      closeSelectionSurface();
      return;
    }
    const formatButton = event.target.closest("[data-selection-format]");
    if (formatButton && selectionState) {
      const format = formatButton.dataset.selectionFormat;
      if (format === "link") return renderSelectionLinkForm();
      if (format === "foreColor" || format === "hiliteColor") return renderSelectionPalette(format);
      return applySelectionFormat(format);
    }
    const button = event.target.closest("[data-selection-action]");
    if (!button || !selectionState) return;
    const state = selectionState;
    const action = button.dataset.selectionAction;
    if (action === "easy-copy") return renderSelectionCopyMenu(state);
    if (action === "comment") {
      const block = state.blocks.at(-1);
      if (!block) return;
      handleComment(block);
      const editor = block.querySelector(":scope > .comment-editor");
      const label = editor?.querySelector("label");
      if (label) label.textContent = `选区评论 · 覆盖 ${state.blocks.length} 个块`;
      block.dataset.commentScope = `跨 ${state.blocks.length} 个块`;
      selectionToolbar.hidden = true;
      return;
    }
    renderSelectionReview(action, state);
    selectionToolbar.hidden = true;
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-selection-review]");
    if (!action) return;
    if (action.dataset.selectionReview === "close") return closeSelectionSurface();
    runSelectionReview();
  });
}

function initComposerPaste() {
  paper.addEventListener("paste", (event) => {
    if (event.target.closest?.("input,textarea")) return;
    const image = Array.from(event.clipboardData?.files || []).find((file) => file.type.startsWith("image/"));
    if (image) {
      event.preventDefault();
      insertPastedImageBlock(image, composerPasteContext());
      return;
    }
    const state = getSelectionState();
    const text = event.clipboardData?.getData("text/plain")?.trim() || "";
    if (!state || !/^https?:\/\/\S+$/i.test(text)) return;
    event.preventDefault();
    selectionState = state;
    applySelectionLink(text);
  });
}

function appendMetadataCandidate(key, value, origin = "AI 建议") {
  const block = document.querySelector(".frontmatter-block");
  const grid = block?.querySelector(".metadata-grid");
  if (!block || !grid) return false;
  const existing = Array.from(grid.querySelectorAll(":scope > span"))
    .find((label) => label.childNodes[0]?.textContent.trim() === key);
  if (existing) {
    existing.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`“${key}” 已在当前 Frontmatter 中`);
    return false;
  }
  block.querySelector(":scope > .metadata-property-draft")?.remove();
  const draft = document.createElement("section");
  draft.className = "metadata-property-draft";
  draft.contentEditable = "false";
  draft.innerHTML = `
    <header><span><b>属性候选</b><small>${escapeHtml(origin)} · 尚未写入 YAML</small></span><button type="button" data-metadata-draft="cancel" aria-label="取消"><svg><use href="#i-x"></use></svg></button></header>
    <div class="metadata-property-fields"><label>key<input data-metadata-draft-key value="${escapeHtml(key)}" /></label><label>value<input data-metadata-draft-value value="${escapeHtml(value)}" /></label></div>
    <footer><span>先确认 key / value；接受后才写入 Frontmatter</span><div><button type="button" data-metadata-draft="cancel">取消</button><button type="button" class="is-primary" data-metadata-draft="accept"><svg><use href="#i-check"></use></svg>接受并写入</button></div></footer>
  `;
  draft.dataset.metadataOrigin = origin;
  grid.after(draft);
  block.classList.add("has-open-editor");
  syncOpenEditorState(block);
  draft.querySelector("[data-metadata-draft-value]")?.focus();
  setLive("Frontmatter 属性候选", `“${escapeHtml(key)}”已进入逐字段审阅；接受前不会修改 Markdown。`);
  return true;
}

function initMetadataProfile() {
  const block = document.querySelector(".frontmatter-block");
  const suggestions = document.getElementById("metadata-ai-suggestions");
  const overlay = document.getElementById("vault-property-overlay");
  const custom = document.getElementById("vault-property-custom");
  const trigger = document.getElementById("vault-property-trigger");
  if (!block || !suggestions || !overlay) return;
  const closeLibrary = ({ restoreFocus = true } = {}) => {
    overlay.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    syncOpenEditorState(block);
    if (restoreFocus) trigger?.focus();
  };
  document.addEventListener("click", (event) => {
    const vaultAction = event.target.closest("[data-vault-property-action]")?.dataset.vaultPropertyAction;
    if (vaultAction === "open") {
      if (!overlay.hidden) return closeLibrary();
      overlay.hidden = false;
      trigger?.setAttribute("aria-expanded", "true");
      syncOpenEditorState(block);
      overlay.querySelector("[data-vault-property-key]")?.focus();
      setLive("Vault 属性库", "入口跟随当前 Frontmatter 在属性框下方展开；统计范围仍是整个 Vault，选择字段后只为本文创建可审阅的 key / value 候选。 ");
      return;
    }
    if (vaultAction === "close") return closeLibrary();
    const property = event.target.closest("[data-vault-property-key]");
    if (!property) return;
    const opened = appendMetadataCandidate(property.dataset.vaultPropertyKey, property.dataset.vaultPropertyValue || "", property.dataset.vaultPropertyOrigin || "人工");
    if (opened) closeLibrary({ restoreFocus: false });
  });
  custom?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(custom);
    const key = String(form.get("key") || "").trim();
    const value = String(form.get("value") || "").trim();
    if (!key || !value) return showToast("先填写自定义 key 和 value");
    if (appendMetadataCandidate(key, value, "人工")) {
      custom.reset();
      closeLibrary({ restoreFocus: false });
    }
  });
  block.addEventListener("click", (event) => {
    const action = event.target.closest("[data-metadata-action]")?.dataset.metadataAction;
    if (action === "suggest") {
      suggestions.hidden = !suggestions.hidden;
      syncOpenEditorState(block);
      setLive("AI 属性建议", "建议与属性告警并列出现；每一项都必须先选择，再进入 key / value 审阅。 ");
      return;
    }
    if (action === "close-suggestions") {
      suggestions.hidden = true;
      syncOpenEditorState(block);
      return;
    }
    if (action === "choose") {
      const choice = event.target.closest("[data-metadata-action='choose']");
      if (!choice) return;
      if (appendMetadataCandidate(choice.dataset.metadataKey, choice.dataset.metadataValue || "", choice.dataset.metadataOrigin || "AI 建议")) suggestions.hidden = true;
      syncOpenEditorState(block);
      return;
    }
    const draftAction = event.target.closest("[data-metadata-draft]")?.dataset.metadataDraft;
    if (!draftAction) return;
    const draft = event.target.closest(".metadata-property-draft");
    if (!draft) return;
    if (draftAction === "cancel") {
      draft.remove();
      syncOpenEditorState(block);
      return showToast("属性候选已取消");
    }
    const key = draft.querySelector("[data-metadata-draft-key]")?.value.trim();
    const value = draft.querySelector("[data-metadata-draft-value]")?.value.trim();
    if (!key || !value) return showToast("key 和 value 不能为空");
    const grid = block.querySelector(".metadata-grid");
    const duplicate = Array.from(grid.querySelectorAll(":scope > span"))
      .some((item) => item.childNodes[0]?.textContent.trim() === key);
    if (duplicate) return showToast(`“${key}” 已在当前 Frontmatter 中`);
    const label = document.createElement("span");
    const origin = draft.dataset.metadataOrigin || "人工";
    label.innerHTML = `${escapeHtml(key)} <i class="metadata-origin ${origin.includes("AI") ? "is-ai" : ""}">${escapeHtml(origin)}</i>`;
    const committed = document.createElement("strong");
    committed.textContent = value;
    grid.append(label, committed);
    draft.remove();
    refreshMetadataSource(block);
    markAccepted(block, `添加属性 ${key}`, () => {
      label.remove();
      committed.remove();
      refreshMetadataSource(block);
    }, () => {
      grid.append(label, committed);
      refreshMetadataSource(block);
    });
    syncOpenEditorState(block);
    showToast(`已写入属性 · ${key}`);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeLibrary();
  });
}

function initAmbientDock() {
  const toggle = document.getElementById("ambient-toggle");
  const app = document.querySelector(".composer-app");
  const panel = document.getElementById("ambient-panel");
  if (!toggle || !app) return;
  const setOpen = (open) => {
    app.classList.toggle("ambient-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    window.PeakIntelligencePanel?.setOpen(open, "#ambient-panel", { restoreFocus: false });
    if (panel) panel.toggleAttribute("inert", !open);
  };
  toggle.addEventListener("click", () => {
    setOpen(!app.classList.contains("ambient-open"));
  });
  document.querySelectorAll("[data-intelligence-close]").forEach((close) => {
    close.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !app.classList.contains("ambient-open")) return;
    if (panel?.querySelector("dialog[open]")) return;
    setOpen(false);
    toggle.focus();
  });
  setOpen(window.innerWidth > 1180);
}

/* ---------- shared adaptive Intelligence ↔ Composer host bridge ---------- */
const intelligenceReviewState = {
  changes: [],
  activeIndex: 0,
  view: "work",
  running: false,
  ready: false,
  snapshots: new Map(),
  historySnapshots: new Map(),
};

function intelligenceTargetBlock(change) {
  if (!change?.target) return null;
  const exact = Array.from(paper.querySelectorAll(".doc-block")).find((block) => block.dataset.blockTitle === change.target);
  if (exact) return exact;
  const target = change.target.replace(/段落$/, "");
  return Array.from(paper.querySelectorAll(".doc-block")).find((block) => (block.dataset.blockTitle || "").includes(target)) || focusedBlock;
}

function intelligenceHistoryTarget(entry) {
  const title = entry?.target?.split(" · ")[0]?.trim();
  if (!title) return { block: null, message: "这笔事务缺少可定位的正文目标" };
  if (title === "全文") return { block: null, message: "“全文”事务涉及多个 Markdown 范围，当前 mock 不支持一键定位" };

  const candidates = Array.from(paper.querySelectorAll(".doc-block")).filter((block) => block.dataset.blockTitle === title);
  if (!candidates.length) return { block: null, message: `当前文档里没有“${title}”对应的正文块` };
  if (candidates.length === 1) return { block: candidates[0], message: "" };

  const versions = [entry?.after, entry?.before].filter(Boolean);
  const matched = candidates.find((block) => {
    const source = block.dataset.source || "";
    const visibleText = block.textContent || "";
    return versions.some((version) => source.includes(version) || visibleText.includes(version));
  });
  if (matched) return { block: matched, message: "" };
  return { block: null, message: `“${title}”存在 ${candidates.length} 个同名块，无法安全判断这笔事务的位置` };
}

function focusIntelligenceDocumentBlock(block) {
  if (!block) return;
  if (!block.hasAttribute("tabindex")) block.tabIndex = -1;
  block.focus({ preventScroll: true });
}

function rememberIntelligenceHistorySnapshot(change) {
  const block = intelligenceTargetBlock(change);
  const snapshot = block && intelligenceReviewState.snapshots.get(block);
  const historyId = change?.historyId || (change?.id ? `accepted-${change.id}` : "");
  if (!block || !snapshot || !historyId) return;
  intelligenceReviewState.historySnapshots.set(historyId, {
    block,
    snapshot: { html: snapshot.html, source: snapshot.source },
  });
}

function syncIntelligenceHistoryRollbackAvailability(root) {
  const dialog = root.querySelector(".history-dialog[open]");
  const rollback = dialog?.querySelector("[data-rollback-history]");
  if (!dialog || !rollback) return;
  const controller = window.PeakIntelligencePanel?.controller(root);
  const historyId = controller?.state?.historySelection;
  const canRollback = Boolean(historyId && intelligenceReviewState.historySnapshots.has(historyId));
  rollback.disabled = !canRollback;
  rollback.setAttribute("aria-disabled", String(!canRollback));
  const note = dialog.querySelector(".history-dialog-footer > small");
  if (canRollback) {
    rollback.title = "恢复到本轮写入前，并新增一笔系统回滚记录";
    if (note) note.textContent = "将检查当前正文仍与本事务一致，再恢复本轮快照。";
    return;
  }
  rollback.title = "这笔历史没有当前会话的安全快照";
  if (note) note.textContent = "只读演示历史没有当前会话快照，因此不能安全回滚；本次运行中新接受的写入可以回滚。";
}

function recordIntelligenceRollback(root, entry) {
  const controller = window.PeakIntelligencePanel?.controller(root);
  const today = controller?.state?.history?.[0];
  if (!today || !entry) return;
  const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  today.entries.unshift({
    id: `rollback-${entry.id}-${Date.now()}`,
    title: `回滚 · ${entry.title}`,
    target: entry.target,
    time: now,
    delta: "rollback",
    origin: "system",
    originLabel: "系统回滚",
    before: entry.after,
    after: entry.before,
  });
  controller.state.historySelection = null;
  controller.render();
}

function intelligenceTextSurface(block) {
  if (!block) return null;
  const kind = block.dataset.blockKind;
  if (kind === "heading-1") return block.querySelector(":scope > h1");
  if (kind === "heading-2") return block.querySelector(":scope > h2");
  if (kind === "quote") return block.querySelector(":scope > blockquote");
  return block.querySelector(":scope > p, :scope > ul, :scope > ol, :scope > .callout-body") || block;
}

function rememberIntelligenceSnapshot(block) {
  if (!block || intelligenceReviewState.snapshots.has(block)) return;
  intelligenceReviewState.snapshots.set(block, {
    html: block.innerHTML,
    source: block.dataset.source || "",
  });
}

function clearIntelligenceReviewDecorations() {
  paper.querySelectorAll(".composer-inline-diff-text").forEach((node) => {
    node.replaceWith(document.createTextNode(node.dataset.before || node.querySelector("del")?.textContent || ""));
  });
  paper.classList.remove("is-clean-reading", "is-reviewing-all");
  paper.querySelectorAll(".is-intelligence-review-target, .is-intelligence-review-visible, .is-intelligence-streaming").forEach((block) => {
    block.classList.remove("is-intelligence-review-target", "is-intelligence-review-visible", "is-intelligence-streaming");
  });
  paper.querySelectorAll("[data-intelligence-review-ui]").forEach((node) => node.remove());
}

function findReviewTextNode(surface, before) {
  if (!surface || !before) return null;
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.includes(before)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest("[contenteditable='false'], .composer-change-pins, .block-badges, .block-tail-actions")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  return walker.nextNode();
}

function renderInlineIntelligenceChange(change, block, active) {
  const surface = intelligenceTextSurface(block);
  const textNode = findReviewTextNode(surface, change.before);
  if (!textNode) {
    const fallback = document.createElement("span");
    fallback.className = "composer-inline-change-fallback";
    fallback.dataset.intelligenceReviewUi = "fallback";
    fallback.contentEditable = "false";
    fallback.textContent = `${change.title} · 结构型候选请在对象原位审阅`;
    surface?.after(fallback);
    return;
  }

  const source = textNode.textContent || "";
  const start = source.indexOf(change.before);
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + change.before.length);
  const wrapper = document.createElement("span");
  wrapper.className = "composer-inline-diff-text";
  wrapper.dataset.before = change.before;
  wrapper.dataset.status = change.status;
  wrapper.contentEditable = "false";
  const added = Math.max(1, Math.round((change.after || "").length / 7));
  const removed = Math.max(0, Math.round((change.before || "").length / 12));
  wrapper.innerHTML = `<del>${escapeHtml(change.before)}</del><ins>${escapeHtml(change.after)}</ins><i class="composer-inline-diff-meta">${active ? "当前 · " : ""}+${added} −${removed}</i>`;
  range.deleteContents();
  range.insertNode(wrapper);
}

function renderIntelligencePins(changes) {
  const grouped = new Map();
  changes.forEach((change, index) => {
    const block = intelligenceTargetBlock(change);
    if (!block) return;
    if (!grouped.has(block)) grouped.set(block, []);
    grouped.get(block).push({ change, index });
  });
  grouped.forEach((items, block) => {
    const rail = document.createElement("span");
    rail.className = "composer-change-pins";
    rail.dataset.intelligenceReviewUi = "pins";
    rail.setAttribute("contenteditable", "false");
    items.forEach(({ change, index }) => {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.dataset.composerChangeIndex = String(index);
      pin.dataset.status = change.status;
      pin.className = index === intelligenceReviewState.activeIndex ? "is-active" : "";
      pin.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><i>${change.status === "accepted" ? "✓" : change.status === "rejected" ? "×" : intelligenceReviewState.running ? "…" : "•"}</i>`;
      pin.setAttribute("aria-label", `改动 ${index + 1}：${change.title}`);
      rail.append(pin);
    });
    block.append(rail);
  });
}

function renderIntelligenceDocumentReview() {
  clearIntelligenceReviewDecorations();
  const nav = document.getElementById("composer-change-navigator");
  const controller = window.PeakIntelligencePanel?.controller("#ambient-panel");
  const changes = controller?.state?.changes || intelligenceReviewState.changes;
  intelligenceReviewState.changes = changes;
  if (controller?.mode !== "copilot" || !changes.length || (!intelligenceReviewState.running && !intelligenceReviewState.ready && controller?.stage !== "review")) {
    if (nav) nav.hidden = true;
    return;
  }

  intelligenceReviewState.activeIndex = Math.max(0, Math.min(intelligenceReviewState.activeIndex, changes.length - 1));
  paper.classList.toggle("is-clean-reading", intelligenceReviewState.view === "clean");
  paper.classList.toggle("is-reviewing-all", intelligenceReviewState.view === "all");
  if (intelligenceReviewState.view !== "clean") renderIntelligencePins(changes);
  const visible = intelligenceReviewState.view === "all" ? changes : [];
  visible.forEach((change) => {
    if (!change) return;
    const block = intelligenceTargetBlock(change);
    if (!block) return;
    rememberIntelligenceSnapshot(block);
    const active = changes.indexOf(change) === intelligenceReviewState.activeIndex;
    block.classList.add(active ? "is-intelligence-review-target" : "is-intelligence-review-visible");
    if (active && intelligenceReviewState.running) block.classList.add("is-intelligence-streaming");
    renderInlineIntelligenceChange(change, block, active);
    if (active) block.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  if (!nav) return;
  const active = changes[intelligenceReviewState.activeIndex];
  const inReview = controller?.stage === "review";
  const pending = changes.filter((change) => change.status === "pending").length;
  const viewCopy = intelligenceReviewState.view === "clean"
    ? "不显示洞察、告警与候选标记"
    : intelligenceReviewState.view === "work"
      ? "保留洞察与定位点，不展开候选"
      : active?.title || "全部候选已在正文原位展开";
  const reviewActions = inReview && active?.status === "pending"
    ? intelligenceReviewState.view === "all"
      ? '<button class="is-accept" type="button" data-composer-review-action="accept">接受</button><button type="button" data-composer-review-action="reject">拒绝</button>'
      : '<button class="is-accept" type="button" data-composer-review-view="all">查看改动</button>'
    : !inReview && !intelligenceReviewState.running
      ? '<button class="is-accept" type="button" data-composer-start-review>审阅此处</button>'
      : "";
  nav.innerHTML = `<div class="composer-review-modes" role="group" aria-label="正文工作状态"><button type="button" data-composer-review-view="work" aria-pressed="${intelligenceReviewState.view === "work"}">工作视图</button><button type="button" data-composer-review-view="all" aria-pressed="${intelligenceReviewState.view === "all"}">全部改动</button><button type="button" data-composer-review-view="clean" aria-pressed="${intelligenceReviewState.view === "clean"}">纯净阅读</button></div><div class="composer-change-copy"><strong>第 ${intelligenceReviewState.activeIndex + 1} 处</strong><small>${escapeHtml(viewCopy)}</small><span class="composer-change-count">${pending} 处待审</span></div><div class="composer-change-actions"><button type="button" data-composer-review-nav="previous" aria-label="上一处"><svg><use href="#i-chevron-up"></use></svg></button><button type="button" data-composer-review-nav="next" aria-label="下一处"><svg><use href="#i-chevron-down"></use></svg></button>${reviewActions}</div>`;
  nav.hidden = false;
}

function intelligenceCommitPlan(change) {
  const block = intelligenceTargetBlock(change);
  if (!block || !change?.before) return null;
  const surface = intelligenceTextSurface(block);
  const currentText = surface?.textContent || "";
  const source = block.dataset.source || "";
  if (!surface || !currentText.includes(change.before) || !source.includes(change.before)) return null;
  return { block, surface, currentText, source };
}

function commitIntelligenceChange(change) {
  const plan = intelligenceCommitPlan(change);
  if (!plan) return false;
  const { block, surface, currentText, source } = plan;
  rememberIntelligenceSnapshot(block);
  const snapshot = intelligenceReviewState.snapshots.get(block);
  surface.textContent = currentText.replace(change.before, change.after);
  block.dataset.source = source.replace(change.before, change.after);
  markAccepted(block, change.title, () => {
    block.innerHTML = snapshot.html;
    block.dataset.source = snapshot.source;
    block.classList.remove("has-ai-accepted");
    setFocusedBlock(block);
  });
  setFocusedBlock(block);
  return true;
}

function initSharedIntelligenceBridge() {
  const root = document.getElementById("ambient-panel");
  const nav = document.getElementById("composer-change-navigator");
  if (!root || !nav) return;

  root.addEventListener("peak:intelligence-submit", (event) => {
    setLive("Copilot 已开始", `正在围绕「${event.detail.context?.title || "当前块"}」运行`);
  });
  root.addEventListener("peak:intelligence-before-review-action", (event) => {
    if (event.detail.action === "reject") return;
    const invalid = (event.detail.changes || []).find((change) => !intelligenceCommitPlan(change));
    if (!invalid) return;
    event.preventDefault();
    const block = intelligenceTargetBlock(invalid);
    if (block) {
      setFocusedBlock(block);
      block.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    showToast(`无法安全写入「${invalid.target}」：正文已偏离本轮快照`);
  });
  root.addEventListener("peak:intelligence-run-state", (event) => {
    intelligenceReviewState.changes = event.detail.changes || [];
    intelligenceReviewState.running = event.detail.status === "running";
    intelligenceReviewState.ready = event.detail.status === "ready";
    intelligenceReviewState.activeIndex = 0;
    intelligenceReviewState.view = "work";
    renderIntelligenceDocumentReview();
  });
  root.addEventListener("peak:intelligence-stage", (event) => {
    if (event.detail.stage === "brief") {
      intelligenceReviewState.running = false;
      intelligenceReviewState.ready = false;
    }
    renderIntelligenceDocumentReview();
  });
  root.addEventListener("peak:intelligence-mode", (event) => {
    if (event.detail.mode === "history") clearIntelligenceReviewDecorations();
    renderIntelligenceDocumentReview();
  });
  root.addEventListener("peak:intelligence-review-location", (event) => {
    intelligenceReviewState.activeIndex = event.detail.index;
    intelligenceReviewState.changes = window.PeakIntelligencePanel?.controller(root)?.state?.changes || intelligenceReviewState.changes;
    renderIntelligenceDocumentReview();
  });
  root.addEventListener("peak:intelligence-review-action", (event) => {
    const accepted = event.detail.action === "accept-all" ? event.detail.changes : event.detail.action === "reject" ? [] : [event.detail.change];
    accepted.filter(Boolean).forEach((change) => {
      if (!commitIntelligenceChange(change)) return;
      rememberIntelligenceHistorySnapshot(change);
    });
    intelligenceReviewState.changes = window.PeakIntelligencePanel?.controller(root)?.state?.changes || intelligenceReviewState.changes;
    renderIntelligenceDocumentReview();
  });
  root.addEventListener("peak:intelligence-history-locate", (event) => {
    const { block, message } = intelligenceHistoryTarget(event.detail.entry);
    if (!block) return showToast(message);
    setFocusedBlock(block);
    focusIntelligenceDocumentBlock(block);
    block.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  root.addEventListener("peak:intelligence-history-rollback", (event) => {
    const entry = event.detail.entry;
    const rollback = entry && intelligenceReviewState.historySnapshots.get(entry.id);
    if (!rollback) {
      event.preventDefault();
      return showToast("这笔记录没有当前会话的安全快照，已保持正文不变");
    }
    const { block, snapshot } = rollback;
    if (entry.after && !(block.dataset.source || "").includes(entry.after)) {
      event.preventDefault();
      return showToast("当前正文已偏离这笔事务的写入结果，不能安全回滚");
    }
    block.innerHTML = snapshot.html;
    block.dataset.source = snapshot.source;
    block.classList.remove("has-ai-accepted");
    intelligenceReviewState.historySnapshots.delete(entry.id);
    setFocusedBlock(block);
    focusIntelligenceDocumentBlock(block);
    recordIntelligenceRollback(root, entry);
    showToast("已恢复到本轮写入前，并记录一笔系统回滚事务");
  });
  root.addEventListener("peak:intelligence-open-source", (event) => showToast(`打开来源：${event.detail.source?.title || "Vault 文档"}`));
  root.addEventListener("click", (event) => {
    if (!event.target.closest("[data-history-id]")) return;
    requestAnimationFrame(() => syncIntelligenceHistoryRollbackAvailability(root));
  });

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const controller = window.PeakIntelligencePanel?.controller(root);
    if (button.dataset.composerReviewView) {
      intelligenceReviewState.view = button.dataset.composerReviewView;
      return renderIntelligenceDocumentReview();
    }
    if (button.dataset.composerReviewNav) return controller?.moveReview(button.dataset.composerReviewNav === "previous" ? -1 : 1);
    if (button.dataset.composerReviewAction) return controller?.resolveReview(button.dataset.composerReviewAction);
    if (button.dataset.composerStartReview !== undefined) return controller?.startReview(intelligenceReviewState.activeIndex);
  });
  paper.addEventListener("click", (event) => {
    const pin = event.target.closest("[data-composer-change-index]");
    if (!pin) return;
    intelligenceReviewState.view = "all";
    window.PeakIntelligencePanel?.controller(root)?.startReview(Number(pin.dataset.composerChangeIndex));
  });

  const controller = window.PeakIntelligencePanel?.controller(root);
  intelligenceReviewState.changes = controller?.state?.changes || [];
  intelligenceReviewState.activeIndex = controller?.state?.activeChangeIndex || 0;
  intelligenceReviewState.ready = controller?.mode === "copilot" && controller?.stage === "review";
  renderIntelligenceDocumentReview();
}

initComposerCanvas();
initBlockCollapseControls();
initSelectionToolbar();
initComposerPaste();
initMetadataProfile();
initAmbientDock();
initSharedIntelligenceBridge();
