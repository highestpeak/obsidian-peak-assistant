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
let tableSortAsc = false;
const rollbackTrail = [];
const aiSuggestionHistory = [];
let activeHistoryIndex = null;
let ambientPushLoading = false;
let ambientThemeLocked = true;
let activeCapabilityId = null;
let capabilityRunTimer = null;

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
  toast.textContent = message;
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
    ":scope > .insert-strip:not([hidden]), :scope > .comment-editor:not([hidden]), :scope > .insight-panel:not([hidden]), .ai-menu:not([hidden])"
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

function buildCandidate(block, item, microTitle, customText) {
  const key = `${microTitle || block.dataset.blockTitle || ""}::${item.label}`;
  if (candidateLibrary[key]) return candidateLibrary[key];
  if (customText) return `按指令「${customText}」生成的候选（mock 占位）：${firstSourceLine(block).slice(0, 40)}……`;
  if (item.label === "转成表格") {
    return (block.dataset.blockKind === "list" ? listToTable(block) : "") || paragraphToTable(block);
  }
  if (item.label === "提出追问") {
    return `1. 这一段的结论依赖什么前提？\n2. 有没有反例能推翻“${firstSourceLine(block).slice(0, 24)}…”？`;
  }
  if (item.label === "补一个例子") {
    return "例子：一条播客灵感先进 inbox，再拆进“信息聚合-PKM”主题笔记，最后在周复盘里被引用——原则由此落地。";
  }
  if (item.label === "提取公式") {
    return "候选公式：$score = w_1 \\cdot relevance + w_2 \\cdot recency$\n（变量含义需确认后再写入）";
  }
  if (item.label === "变量表") {
    return "| 符号 | 含义 |\n| --- | --- |\n| d | 阻尼系数 0.85 |\n| N | 节点总数 |\n| L(i) | 页面 i 的出链数 |";
  }
  return item.detail;
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
  paper.querySelectorAll(".rw-review, .ins-card, .generated-draft, .metadata-review, .list-review, .list-to-table-review, .checklist-review, .vault-link-review, .formula-review, .formula-explainer, .formula-extract-review, .native-inline-review").forEach((surface) => {
    if (surface === except) return;
    if (typeof surface._dismiss === "function") surface._dismiss();
  });
}

function markAccepted(block, label, restore = null) {
  block.classList.remove("has-ai-card");
  block.classList.add("has-ai-accepted");
  const before = block.dataset.lastCommittedSource ?? block.dataset.initialSource ?? "";
  const after = block.dataset.source || "";
  rollbackTrail.unshift({
    block,
    label: label || "AI patch",
    title: block.dataset.blockTitle || "当前块",
    restore,
    before,
    after,
    at: Date.now(),
  });
  block.dataset.lastCommittedSource = after;
  activeHistoryIndex = 0;
  renderRollbackTrail();
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
  const values = {};
  for (let index = 0; index < grid.children.length; index += 2) {
    const key = grid.children[index]?.textContent?.trim();
    const value = grid.children[index + 1]?.textContent?.trim();
    if (key && value) values[key] = value;
  }
  const tags = Array.from(grid.querySelectorAll(".tag-chip")).map((tag) => tag.textContent.trim());
  block.dataset.source = `---\ncreated: ${values.created || ""}\nupdated: ${values.updated || ""}\ntags: [${tags.join(", ")}]\n---`;
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
      markAccepted(block, item.label, () => {
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
    markAccepted(block, item.label, () => {
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
      markAccepted(block, item.label, () => {
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
  list.classList.add("is-review-original");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`
    <div class="list-compare">
      <section class="list-compare-original"><span>原列表</span></section>
      <span class="list-compare-arrow">→</span>
      <section class="list-compare-suggested"><span>建议顺序</span></section>
    </div>
  `));
  review.querySelector(".list-compare-original").appendChild(originalList);
  review.querySelector(".list-compare-suggested").appendChild(candidateList);
  review._dismiss = () => {
    list.classList.remove("is-review-original");
    review.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    list.replaceWith(candidateList);
    review.remove();
    block.classList.remove("is-ai-running");
    refreshListSource(block);
    markAccepted(block, item.label, () => {
      candidateList.replaceWith(originalList);
      refreshListSource(block);
    });
    setLive("列表已重排", "建议顺序已经原地替换旧列表，仍然只写回一条 Markdown list。 ");
  });
  setLive("重排列表", "原列表在上、建议列表在下，纵向核对后原地替换；拒绝后只留下原列表。 ");
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
  const rows = Array.from(tableNode.querySelectorAll("tr")).map((row) => Array.from(row.cells).map((cell) => cell.textContent.trim()));
  if (!rows.length) return;
  block.dataset.source = [
    `| ${rows[0].join(" | ")} |`,
    `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
  if (focusedBlock === block) setFocusedBlock(block);
}

function runListToTable(block, item) {
  closeAiCards();
  const list = block.querySelector(":scope > ul, :scope > ol");
  if (!list) return runInsert(block, block, item);
  const originalList = list.cloneNode(true);
  const candidateTable = tableFromRows(listRowsForTable(list));
  const review = createObjectReview("list-to-table-review", item.label, "把当前列表重写为可编辑的 Markdown 表格；建议列按阅读用途重新组织");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`
    <div class="list-compare table-transform-compare">
      <section class="list-compare-original"><span>原列表</span></section>
      <span class="list-compare-arrow">→</span>
      <section class="list-compare-suggested"><span>建议表格</span></section>
    </div>
  `));
  review.querySelector(".list-compare-original").appendChild(originalList);
  review.querySelector(".list-compare-suggested").appendChild(candidateTable);
  list.classList.add("is-review-original");
  list.after(review);
  block.classList.add("has-ai-card", "is-ai-running");
  review._dismiss = () => {
    list.classList.remove("is-review-original");
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
    markAccepted(block, item.label, () => {
      candidateTable.replaceWith(originalList);
      refreshListSource(block);
    });
    setLive("列表已转为表格", "候选表格已原地替换原列表，三列按结构、适用内容和下一步动作组织，仍可编辑并写回 pipe table。 ");
  });
  setLive("转成表格", "原列表在上、可编辑表格在下；接受时才把该块源改为 Markdown table。 ");
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
    markAccepted(block, item.label, () => { candidate.replaceWith(original); refreshChecklistSource(block); });
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
    markAccepted(block, item.label, () => { paragraph.innerHTML = original; refreshVaultLinksSource(block); });
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
        ["WS(V_i)", "节点 i 的最终权重"],
        ["1-d", "随机跳转留下的基础权重"],
        ["w_{ji}", "j 指向 i 的相似度权重"],
        ["Z_j", "节点 j 的全部出边权重之和"],
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
        ["\\Delta Q", "节点 i 移动带来的模块度变化"],
        ["k_{i,inC}", "i 与目标社区 C 的内部连边"],
        ["\\Sigma_{totC}", "社区 C 的总度数"],
        ["2m", "全图总边权，用于归一化"],
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
      ["PR(A)", "页面 A 的重要性"],
      ["d", "阻尼系数，通常取 0.85"],
      ["In(A)", "所有指向 A 的节点"],
      ["L(i)", "节点 i 的出链数量"],
    ],
  };
}

function runFormulaSplit(block, micro, item) {
  closeAiCards();
  const render = micro.querySelector(".math-render");
  if (!render) return;
  const originalTex = render.dataset.tex;
  const profile = formulaProfile(micro);
  const review = createObjectReview("formula-review", `${micro.dataset.microTitle} · ${item.label}`, "原式在上，拆分后的可渲染公式在下");
  review.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`
    <div class="formula-compare">
      <section><span>原公式</span><div class="math-render formula-old" data-tex="${escapeHtml(originalTex)}"></div></section>
      <div class="formula-arrow">→</div>
      <section><span>拆分后</span><div class="math-render" data-tex="${escapeHtml(profile.primary)}"></div>${profile.steps.map((step) => `<div class="formula-step"><small>${escapeHtml(step.label)}</small><div class="math-render" data-tex="${escapeHtml(step.tex)}"></div></div>`).join("")}</section>
    </div>
  `));
  micro.appendChild(review);
  renderKatexIn(review);
  micro.classList.add("is-micro-active");
  review._dismiss = () => {
    review.remove();
    micro.classList.remove("is-micro-active");
  };
  review.querySelector('[data-object-review="restore"]').addEventListener("click", review._dismiss);
  review.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    render.dataset.tex = profile.primary;
    renderKatexIn(micro);
    const breakdown = document.createElement("div");
    breakdown.className = "formula-breakdown";
    breakdown.innerHTML = profile.steps.map((step) => `<div><small>${escapeHtml(step.label)}</small><div class="math-render" data-tex="${escapeHtml(step.tex)}"></div></div>`).join("");
    render.after(breakdown);
    renderKatexIn(breakdown);
    review.remove();
    micro.classList.remove("is-micro-active");
    refreshMathSource(block);
    markAccepted(block, `${micro.dataset.microTitle} · ${item.label}`, () => {
      render.dataset.tex = originalTex;
      renderKatexIn(micro);
      breakdown.remove();
      refreshMathSource(block);
    });
    setLive("公式已拆分", "主公式已在原位替换为拆分后的结构，原式与每一步都保留为可渲染 LaTeX。 ");
  });
  setLive("拆分公式", "公式在原卡片中展示旧式与拆分候选；接受后直接更新该公式块，而不是新增文本段。 ");
}

function runFormulaExplain(block, micro, item) {
  closeAiCards();
  const profile = formulaProfile(micro);
  const explainer = createObjectReview("formula-explainer", `${micro.dataset.microTitle} · ${item.label}`, "符号沿箭头展开，保留公式上下文");
  const rows = profile.terms.map(([symbol, description], index) => `
    <div class="formula-term"><span class="formula-term-index">${index + 1}</span><div class="math-inline" data-tex="${escapeHtml(symbol)}"></div><span class="formula-term-arrow">→</span><p>${escapeHtml(description)}</p></div>
  `).join("");
  explainer.querySelector(".object-review-head").after(document.createRange().createContextualFragment(`<div class="formula-term-map">${rows}</div>`));
  micro.appendChild(explainer);
  renderKatexIn(explainer);
  explainer._dismiss = () => explainer.remove();
  explainer.querySelector('[data-object-review="restore"]').textContent = "关闭";
  explainer.querySelector('[data-object-review="restore"]').addEventListener("click", explainer._dismiss);
  explainer.querySelector('[data-object-review="accept"]').textContent = "保留注释";
  explainer.querySelector('[data-object-review="accept"]').addEventListener("click", () => {
    explainer.classList.remove("is-busy");
    explainer.classList.add("is-pinned");
    explainer.querySelector(".object-review-actions")?.remove();
    markAccepted(block, `${micro.dataset.microTitle} · ${item.label}`, () => explainer.remove());
    setLive("公式注释已保留", "箭头式符号解释作为该公式的局部注释保留，可在 Ambient 回滚。 ");
  });
  setLive(item.label, "公式的符号、归一化项和结果沿箭头分行解释，不再压成一段文本。 ");
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
    markAccepted(block, item.label, () => formula.remove());
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
  if (micro && ["解释公式", "变量表"].includes(item.label)) return runFormulaExplain(block, micro, item);
  const target = microTitle ? null : rewriteTargetFor(block);
  const wantsRewrite = customText ? Boolean(target) : REWRITE_LABELS.has(label) && Boolean(target);
  if (wantsRewrite) return runRewrite(block, target, item, { customText });
  return runInsert(host, block, item, { microTitle, customText });
}

/* ---------- in-place rewrite → streaming → word-level diff ---------- */
function runRewrite(block, target, item, { customText = "" } = {}) {
  closeAiCards();
  block.classList.add("has-ai-card", "is-ai-running");
  if (block._rewriteOriginal == null) block._rewriteOriginal = target.textContent.trim();
  const original = block._rewriteOriginal;
  const candidate = String(buildCandidate(block, item, "", customText)).replace(/\s*\n+\s*/g, " ").trim();

  const review = document.createElement("div");
  review.className = "rw-review is-busy";
  review.innerHTML = `
    <div class="rw-status"><span class="rw-dot"></span><span class="rw-label">原地改写生成中…</span> <span class="rw-count"></span></div>
    <span class="rw-spacer"></span>
    <button class="rw-btn ghost" data-rw="stop">停止</button>
    <div class="rw-btns">
      <button class="rw-btn primary" data-rw="accept"><svg><use href="#i-check"></use></svg>接受</button>
      <button class="rw-btn" data-rw="restore"><svg><use href="#i-undo"></use></svg>还原</button>
      <button class="rw-btn ghost" data-rw="retry">重试</button>
    </div>`;
  block.appendChild(review);

  const editableFlag = target.getAttribute("contenteditable");
  target.classList.add("is-diffing");
  target.setAttribute("contenteditable", "false");
  const statusEl = review.querySelector(".rw-label");
  const countEl = review.querySelector(".rw-count");

  const finishDiff = () => {
    const segs = diffTokens(tokenize(original), tokenize(candidate));
    target.innerHTML = renderDiff(segs);
    const { del, ins } = diffCounts(segs);
    review.classList.remove("is-busy");
    statusEl.textContent = "生成完成 · 未写入";
    countEl.innerHTML = `<del>−${del}</del> <ins>+${ins}</ins>`;
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
    block.classList.remove("has-ai-card", "is-ai-running");
  };

  let i = 0;
  clearInterval(review._timer);
  review._timer = setInterval(() => {
    i += 1;
    target.innerHTML = escapeHtml(candidate.slice(0, i)) + '<span class="ai-caret"></span>';
    if (i < candidate.length) return;
    clearInterval(review._timer);
    finishDiff();
  }, 18);

  review.querySelector('[data-rw="stop"]').addEventListener("click", () => {
    clearInterval(review._timer);
    finishDiff();
    statusEl.textContent = "已停止 · 未写入";
  });
  review.querySelector('[data-rw="restore"]').addEventListener("click", () => {
    review._dismiss();
    setLive("已还原", "块回到原始 Markdown，未写入任何内容。");
    showToast("已还原 · 未写入");
  });
  review.querySelector('[data-rw="retry"]').addEventListener("click", () => {
    cleanup();
    block.classList.remove("is-ai-running");
    runRewrite(block, target, item, { customText });
  });
  review.querySelector('[data-rw="accept"]').addEventListener("click", () => {
    target.textContent = candidate;
    block._rewriteOriginal = candidate;
    cleanup();
    block.classList.remove("is-ai-running");
    refreshProseSource(block);
    markAccepted(block, item.label);
    setLive("AI 改写已接受", "候选写回当前块的 Markdown range，进入 Obsidian undo stack，可从 Ambient 回滚。");
    showToast("已接受改写 · 可在 Ambient 回滚");
  });

  clearTimeout(block.aiTimer);
  block.aiTimer = setTimeout(() => block.classList.remove("is-ai-running"), 1300);
  setLive(item.label, `原地改写：${escapeHtml(item.reason)}。流式生成后在原文上按词展示 diff（红删绿增），接受前不写回文件。`);
  showToast(`${item.label}：原地改写生成中`);
}

/* ---------- additive creation: render a real draft block at the insertion point ---------- */
function draftShape(block, item, candidate) {
  if (item.label === "补提纲") {
    return { kind: "heading-2", source: "## 从输出目标反推知识结构", html: "<h2>从输出目标反推知识结构</h2><p>先定义读者要完成的判断，再决定这一节需要哪些来源、结构和可验证的结论。</p>" };
  }
  if (item.label === "生成导读问题" || item.label === "提出追问") {
    return { kind: "list", source: "- 这节最希望读者带走的判断是什么？\n- 哪个例子能证明这个判断？\n- 读者下一步应该去哪一篇笔记继续？", html: "<ul class=\"markdown-list\"><li>这节最希望读者带走的判断是什么？</li><li>哪个例子能证明这个判断？</li><li>读者下一步应该去哪一篇笔记继续？</li></ul>" };
  }
  if (item.label === "生成示意图" || item.label === "生成配图") {
    return { kind: "image", source: "![[assets/ai-knowledge-workflow-illustration.png|知识如何从材料形成可回滚的工作流]]", html: `<figure class="generated-figure"><a class="lightgallery" href="assets/ai-knowledge-workflow-illustration.png" data-thumbnail="assets/ai-knowledge-workflow-illustration.png"><img src="assets/ai-knowledge-workflow-illustration.png" alt="知识工作流生成示意图" /></a><figcaption>从材料、关系到成文与回看：生成图作为当前段落的视觉解释，可继续改图、评论或替换。</figcaption></figure>` };
  }
  if (item.label === "转成表格") {
    const source = buildCandidate(block, item, "", "");
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

function runInsert(host, block, item, { microTitle = "", customText = "" } = {}) {
  closeAiCards();
  const candidate = String(buildCandidate(block, item, microTitle, customText));
  const shape = draftShape(block, item, candidate);
  const isImageGeneration = shape.kind === "image";
  const draft = document.createElement("section");
  draft.className = `doc-block generated-draft ${shape.kind}-block`;
  draft.dataset.blockKind = shape.kind;
  draft.dataset.blockTitle = microTitle ? `${microTitle} · ${item.label}` : item.label;
  draft.dataset.source = shape.source;
  const generationBody = isImageGeneration
    ? `<div class="image-generation-stage" role="status" aria-live="polite">
        <div class="image-generation-preview"><span></span><span></span><span></span></div>
        <div class="image-generation-copy"><strong data-image-generation-status>正在理解这一段需要什么图…</strong><small>分析正文关系、选择画面结构并生成附件</small><ol><li class="is-active">理解内容</li><li>构建画面</li><li>生成附件</li></ol></div>
      </div>`
    : shape.html;
  draft.innerHTML = `${blockControlsHTML()}${generationBody}<div class="generated-draft-review">
    <span class="draft-status-dot"><svg><use href="#i-spark"></use></svg></span>
    <span class="draft-status-copy"><strong data-draft-status>${isImageGeneration ? "生成中" : "AI 草稿"}</strong><small>${escapeHtml(item.label)} · 未写入 Markdown</small></span>
    <div class="draft-review-actions"><button data-draft-result="accept"${isImageGeneration ? " disabled" : ""}><svg><use href="#i-check"></use></svg>接受</button><button data-draft-result="discard">丢弃</button></div>
  </div>`;

  if (host.classList?.contains("micro-block")) host.appendChild(draft);
  else block.after(draft);
  decorateBlock(draft);
  markEditorChrome(draft);
  renderKatexIn(draft);
  imageGallery?.refresh?.();
  block.classList.add("has-ai-card", "is-ai-running");
  draft.classList.add("is-generating");
  draft._generationTimers = [];

  const scheduleGeneration = (delay, callback) => {
    draft._generationTimers.push(setTimeout(() => {
      if (draft.isConnected) callback();
    }, delay));
  };

  draft._dismiss = () => {
    draft._generationTimers.forEach((timer) => clearTimeout(timer));
    draft.remove();
    block.classList.remove("has-ai-card", "is-ai-running");
  };
  draft.querySelector('[data-draft-result="discard"]').addEventListener("click", () => {
    draft._dismiss();
    setLive("已丢弃新块", "这个生成块没有写入 Markdown 或附件引用。 ");
  });
  draft.querySelector('[data-draft-result="accept"]').addEventListener("click", () => {
    if (draft.querySelector('[data-draft-result="accept"]')?.disabled) return;
    draft._generationTimers.forEach((timer) => clearTimeout(timer));
    draft.classList.remove("generated-draft", "is-generating");
    draft.querySelector(".generated-draft-review")?.remove();
    block.classList.remove("is-ai-running");
    markAccepted(draft, item.label, () => draft.remove());
    setLive("新块已写入", "生成结果已经作为实际可编辑块留在文档里；它有自己的拖动、插入、评论和 AI 上下文。 ");
    showToast("已接受新块 · 可在 Ambient 回滚");
  });

  const status = draft.querySelector("[data-draft-status]");
  if (isImageGeneration) {
    const stage = draft.querySelector(".image-generation-stage");
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
      stage?.replaceWith(document.createRange().createContextualFragment(shape.html));
      draft.classList.remove("is-generating");
      if (status) status.textContent = "生成完成";
      const accept = draft.querySelector('[data-draft-result="accept"]');
      if (accept) accept.disabled = false;
      imageGallery?.refresh?.();
      steps[2]?.classList.replace("is-active", "is-done");
      setLive("示意图已生成", "真实图像块已在插入位置渲染；接受前附件引用仍处于草稿事务。 ");
    });
  } else {
    scheduleGeneration(840, () => {
      draft.classList.remove("is-generating");
      if (status) status.textContent = "AI 草稿";
    });
  }
  clearTimeout(block.aiTimer);
  block.aiTimer = setTimeout(() => block.classList.remove("is-ai-running"), isImageGeneration ? 2200 : 1300);
  setLive(item.label, `${microTitle ? escapeHtml(microTitle) + " · " : ""}${isImageGeneration ? "正在生成真实图像附件，完成前不会突然出现最终图。" : "生成结果已经出现在真实插入位置；接受前仍是未写入事务。"}`);
  showToast(`${item.label}：${isImageGeneration ? "生成中" : "已生成草稿"}`);
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
  entry.restore?.();
  entry.block.dataset.source = entry.before;
  entry.block.dataset.lastCommittedSource = entry.before;
  if (!rollbackTrail.some((other) => other.block === entry.block)) {
    entry.block.classList.remove("has-ai-accepted");
  }
  activeHistoryIndex = rollbackTrail.length ? Math.max(0, Math.min(index, rollbackTrail.length - 1)) : null;
  renderRollbackTrail();
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

  menu = document.createElement("div");
  menu.className = "ai-menu";
  menu.hidden = true;
  const sugg = COPILOT_SUGGESTIONS[block.dataset.blockTitle];
  const suggRow = sugg
    ? `<button class="ai-sugg" data-ai-sugg data-label="${escapeHtml(sugg.label)}">
         <span class="ai-sugg-lead"><svg><use href="#i-spark"></use></svg></span>
         <span class="ai-sugg-body"><span class="ai-sugg-txt">${escapeHtml(sugg.txt)}</span><span class="ai-sugg-meta">${escapeHtml(sugg.meta)}</span></span>
         <span class="ai-sugg-go">生成</span>
       </button>`
    : "";
  menu.innerHTML = `
    <div class="aimc${sugg ? "" : " is-bare"}">
      ${suggRow}
      <div class="aim">
        <div class="aim-top">
          <span class="aim-lead"><svg><use href="#i-spark"></use></svg></span>
          ${sugg ? '<span class="aim-quick-label">快捷</span>' : ""}
          <div class="aim-pills">${aiPillsHTML(block)}<span class="sep"></span></div>
          <button class="aim-history-toggle" data-action="toggle-ai-history" title="查看本块生成历史"><svg><use href="#i-undo"></use></svg></button>
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
  const willOpen = menu.hidden;
  paper.querySelectorAll(".ai-menu:not([hidden])").forEach((other) => {
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
  menu.hidden = true;
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

function decorateBlock(block) {
  if (block.querySelector(":scope > .block-badges")) return;

  const badges = document.createElement("div");
  badges.className = "block-badges";
  const stateRow = document.createElement("div");
  stateRow.className = "block-state-row";
  badges.appendChild(stateRow);
  block.prepend(badges);
  block.querySelectorAll(":scope > .issue-pill").forEach((pill) => stateRow.appendChild(pill));

  const actions = getAiActions(block);
  const tail = document.createElement("div");
  tail.className = "block-tail-actions";
  const insert = document.createElement("button");
  insert.type = "button";
  insert.className = "block-tail-plus";
  insert.dataset.action = "insert";
  insert.title = "在下方插入";
  insert.innerHTML = '<svg><use href="#i-plus"></use></svg><span>在下方插入</span>';
  const comment = document.createElement("button");
  comment.type = "button";
  comment.className = "block-tail-comment";
  comment.dataset.action = "comment";
  comment.title = "添加块评论";
  comment.innerHTML = '<svg><use href="#i-comment"></use></svg><span>评论</span>';
  const anchor = document.createElement("div");
  anchor.className = "ai-anchor";
  const hint = document.createElement("button");
  hint.type = "button";
  hint.className = "ai-hint";
  hint.dataset.action = "ai";
  hint.textContent = `AI 建议 · ${actions.length}`;
  hint.title = actions.map((item) => `${item.label}（${item.reason}）`).join("\n");
  anchor.appendChild(hint);
  tail.append(insert, comment, anchor);
  block.appendChild(tail);
}

function initBlockBadges() {
  paper.querySelectorAll(".doc-block").forEach(decorateBlock);
}

function blockControlsHTML() {
  return `
    <div class="block-controls" aria-label="Block controls">
      <button data-action="move" title="按住拖动"><svg><use href="#i-grip"></use></svg></button>
      <button data-action="insert" title="在下方插入"><svg><use href="#i-plus"></use></svg></button>
    </div>
  `;
}

function initMicroHints() {
  paper.querySelectorAll(".math-card.micro-block").forEach((micro) => {
    if (micro.querySelector(":scope > .micro-tail-actions")) return;
    const block = micro.closest(".doc-block");
    const actions = getAiActions(block);
    const tail = document.createElement("div");
    tail.className = "micro-tail-actions";
    const insert = document.createElement("button");
    insert.type = "button";
    insert.className = "micro-tail-plus";
  insert.dataset.action = "insert";
    insert.title = "在该公式后插入";
  insert.innerHTML = '<svg><use href="#i-plus"></use></svg><span>在下方插入</span>';
    const comment = document.createElement("button");
    comment.type = "button";
    comment.className = "micro-tail-comment";
    comment.dataset.action = "comment";
    comment.title = "评论该公式";
    comment.innerHTML = '<svg><use href="#i-comment"></use></svg><span>评论</span>';
    const hint = document.createElement("button");
    hint.type = "button";
    hint.className = "ai-hint micro-ai-hint";
    hint.dataset.action = "ai";
    hint.textContent = `AI · ${actions.length}`;
    hint.title = actions.map((item) => `${item.label}（${item.reason}）`).join("\n");
    tail.append(insert, comment, hint);
    micro.appendChild(tail);
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
  if (!currentCell) return showToast("先点选一个单元格再切换对齐");
  const index = currentCell.cellIndex;
  const current = table.dataset[`align${index}`] || "left";
  const next = alignSteps[(alignSteps.indexOf(current) + 1) % alignSteps.length];
  table.dataset[`align${index}`] = next;
  table.querySelectorAll("tr").forEach((row) => {
    const cell = row.cells[index];
    if (cell) cell.style.textAlign = next;
  });
  setLive("列对齐", `“${escapeHtml(columnName(currentCell))}”列切换为 ${next}；回写时更新分隔行冒号语法（:--- / :---: / ---:）。`);
  showToast(`列对齐：${next}`);
}

function sortTableByCurrentColumn() {
  if (!currentCell) return showToast("先点选要排序的列中的单元格");
  const index = currentCell.cellIndex;
  const body = table.querySelector("tbody");
  const rows = Array.from(body.rows);
  tableSortAsc = !tableSortAsc;
  rows.sort((a, b) => (a.cells[index]?.textContent || "").localeCompare(b.cells[index]?.textContent || "", "zh") * (tableSortAsc ? 1 : -1));
  rows.forEach((row) => body.appendChild(row));
  setLive("按列排序", `已按“${escapeHtml(columnName(currentCell))}”列${tableSortAsc ? "升序" : "降序"}排序。真实实现应保留表头并进入 undo stack。`);
  showToast(`已按“${columnName(currentCell)}”${tableSortAsc ? "升序" : "降序"}排序`);
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

function handleTableTool(action) {
  if (action === "transpose-table") return transposeComposerTable();
  const messages = {
    "format-table": ["表格自动格式化", "按 Advanced Tables 的思路：自动补齐 pipe、对齐列宽、保持 Markdown table 可读。", "已格式化 Markdown 表格"],
    "formula-table": ["表格公式", "支持 TBLFM / spreadsheet-like 公式预览，写入前展示计算结果和源注释。", "公式预览已生成"],
  };
  const [title, body, toastMessage] = messages[action] || messages["format-table"];
  setLive(title, body);
  showToast(toastMessage);
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

function initTableInteractions() {
  if (!table) return;

  table.addEventListener("focusin", (event) => {
    const cell = event.target.closest("td, th");
    if (!cell) return;
    currentCell?.classList.remove("is-current-cell");
    currentCell = cell;
    cell.classList.add("is-current-cell");
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
  linkPopover.innerHTML =
    `<span class="link-popover-title">${escapeHtml(name)}</span>` +
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

  linkPopover.addEventListener("click", (event) => {
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

function closeTopSurface() {
  if (closeSelectionSurface()) return true;
  if (!linkPopover.hidden) {
    hideLinkPopover();
    return true;
  }
  const openDraft = paper.querySelector(".draft-block");
  if (openDraft) {
    removeDraft(openDraft);
    return true;
  }
  const openMenu = paper.querySelector(".ai-menu:not([hidden])");
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
      markAccepted(block, item.label, restore);
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
      markAccepted(block, item.label, restore);
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
      markAccepted(block, item.label, restore);
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

  if (micro) return handleMicroAction(action, micro, button, block);

  if (action === "save-comment") return saveComment(block);
  if (action === "cancel-comment") return cancelComment(block);
  if (action === "close-insert") return closeInsertStrip(block);
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
  if (action === "add-row") return addTableRow();
  if (action === "add-column") return addTableColumn();
  if (action === "remove-row") return removeTableRow();
  if (action === "align-table") return alignTableColumn();
  if (action === "sort-table") return sortTableByCurrentColumn();
  if (action === "format-table" || action === "formula-table" || action === "transpose-table") return handleTableTool(action);
  if (action === "zoom-image") return selectImageMode(block, "zoom");
  if (action === "crop-image") return selectImageMode(block, "crop");
  if (action === "annotate-image") return toggleImageAnnotation(block);
  if (action === "ai-caption") return showAiSuggestionCard(block, { label: "生成图注", trigger: "image-toolbar" });
  if (action === "ai-image") return showAiSuggestionCard(block, { label: "生成配图", trigger: "image-toolbar" });
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
    if (menu) {
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
switchAmbientView("copilot");
setFocusedBlock(document.querySelector('[data-block-title="AI 旁路段落"]') || document.querySelector(".title-block") || document.querySelector(".paragraph-block"));
initBlockBadges();
initInsights();
initMicroHints();
initLinkPopover();
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
let selectionState = null;
let reviewSelectionState = null;
let selectionFrame = 0;
let aiRefreshTimer = 0;

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
  const hint = block.querySelector(":scope > .ai-anchor .ai-hint");
  if (!hint) return;
  const actions = getAiActions(block);
  hint.textContent = `AI 建议 · ${actions.length}`;
  hint.title = actions.map((item) => `${item.label}（${item.reason}）`).join("\n");
  setLive("本块建议已更新", "编辑内容后，Composer 会重新评估当前块的类型、结构和当前内容，只保留与当前块有关的短动作。");
}

function getSelectionState() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
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
  return { range: range.cloneRange(), text, blocks };
}

function updateSelectionToolbar() {
  selectionFrame = 0;
  const state = getSelectionState();
  if (!state) {
    paper.classList.remove("has-text-selection");
    selectionToolbar.hidden = true;
    if (selectionReview.hidden) selectionState = null;
    return;
  }

  selectionState = state;
  paper.classList.add("has-text-selection");
  selectionScope.textContent = state.blocks.length > 1 ? `跨 ${state.blocks.length} 个块` : "选中当前块";
  selectionToolbar.hidden = false;
  const rect = state.range.getBoundingClientRect();
  const toolbarWidth = selectionToolbar.offsetWidth || 340;
  const left = Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, rect.left + rect.width / 2 - toolbarWidth / 2));
  const top = Math.max(12, rect.top - 44);
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
  selectionReview.hidden = true;
  selectionState = null;
  reviewSelectionState = null;
  paper.classList.remove("has-text-selection");
  return wasOpen;
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
  reviewSelectionState = state;
  selectionReview.hidden = false;
  selectionReview.dataset.selectionAction = action;
  selectionReview.innerHTML = `
    <div class="selection-review-head">
      <span>跨块选区</span>
      <small>覆盖 ${state.blocks.length} 个内容块</small>
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
  const scope = `跨 ${state.blocks.length} 个块：${selectionPreviewText(state.text)}`;
  selectionReview.hidden = true;
  selectionToolbar.hidden = true;
  reviewSelectionState = null;
  showAiSuggestionCard(endBlock, {
    label,
    reason: scope,
    customText: action === "ask" ? customText : "",
    microTitle: "跨块选区",
    host: endBlock,
  });
  setLive("跨块 AI 候选", "选区没有被直接覆盖；建议以可接受、可拒绝的 patch 展示在选区末尾，便于保留 Markdown 映射。 ");
}

function initSelectionToolbar() {
  document.addEventListener("selectionchange", scheduleSelectionToolbar);
  paper.addEventListener("pointerup", scheduleSelectionToolbar);
  selectionToolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  selectionToolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button || !selectionState) return;
    const state = selectionState;
    const action = button.dataset.selectionAction;
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
  view: "current",
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
  paper.querySelectorAll(".is-intelligence-review-target, .is-intelligence-review-visible, .is-intelligence-streaming").forEach((block) => {
    block.classList.remove("is-intelligence-review-target", "is-intelligence-review-visible", "is-intelligence-streaming");
  });
  paper.querySelectorAll("[data-intelligence-review-ui]").forEach((node) => node.remove());
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
  renderIntelligencePins(changes);
  const visible = intelligenceReviewState.view === "all"
    ? changes
    : intelligenceReviewState.view === "original"
      ? []
      : [changes[intelligenceReviewState.activeIndex]];
  visible.forEach((change) => {
    if (!change) return;
    const block = intelligenceTargetBlock(change);
    if (!block) return;
    rememberIntelligenceSnapshot(block);
    const active = changes.indexOf(change) === intelligenceReviewState.activeIndex;
    block.classList.add(active ? "is-intelligence-review-target" : "is-intelligence-review-visible");
    if (active && intelligenceReviewState.running) block.classList.add("is-intelligence-streaming");
    const preview = document.createElement("div");
    preview.className = "composer-inline-change";
    preview.dataset.intelligenceReviewUi = "preview";
    preview.dataset.status = change.status;
    preview.setAttribute("contenteditable", "false");
    preview.innerHTML = `<header><span>${change.status === "accepted" ? "已接受" : change.status === "rejected" ? "已拒绝" : intelligenceReviewState.running ? "AI 草拟" : "候选"} · ${escapeHtml(change.title)}</span><b>${escapeHtml(change.scope)}</b></header><div><del>${escapeHtml(change.before)}</del><ins>${escapeHtml(change.after)}</ins></div>`;
    block.append(preview);
    if (active) block.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  if (!nav) return;
  const active = changes[intelligenceReviewState.activeIndex];
  const inReview = controller?.stage === "review";
  const added = Math.max(1, Math.round((active?.after || "").length / 7));
  const removed = Math.max(0, Math.round((active?.before || "").length / 12));
  nav.innerHTML = `<div class="composer-review-modes" role="group" aria-label="正文改动显示方式"><button type="button" data-composer-review-view="current" aria-pressed="${intelligenceReviewState.view === "current"}">当前一处</button><button type="button" data-composer-review-view="all" aria-pressed="${intelligenceReviewState.view === "all"}">全部改动</button><button type="button" data-composer-review-view="original" aria-pressed="${intelligenceReviewState.view === "original"}">原文</button></div><div class="composer-change-copy"><small>${intelligenceReviewState.view === "original" ? "原文 · 保留定位点" : intelligenceReviewState.running ? "AI 正在草拟" : active?.status === "pending" ? "候选尚未写入" : active?.status === "accepted" ? "已接受" : "已拒绝"}</small><strong>${intelligenceReviewState.activeIndex + 1} / ${changes.length}</strong><span>+${added} −${removed}</span></div><div class="composer-change-actions"><button type="button" data-composer-review-nav="previous" aria-label="上一处"><svg><use href="#i-chevron-up"></use></svg></button><button type="button" data-composer-review-nav="next" aria-label="下一处"><svg><use href="#i-chevron-down"></use></svg></button>${inReview && active?.status === "pending" ? '<button class="is-accept" type="button" data-composer-review-action="accept">接受</button><button type="button" data-composer-review-action="reject">拒绝</button>' : !inReview && !intelligenceReviewState.running ? '<button class="is-accept" type="button" data-composer-start-review>开始审阅</button>' : ""}</div>`;
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
    intelligenceReviewState.view = "current";
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
    window.PeakIntelligencePanel?.controller(root)?.startReview(Number(pin.dataset.composerChangeIndex));
  });

  const controller = window.PeakIntelligencePanel?.controller(root);
  intelligenceReviewState.changes = controller?.state?.changes || [];
  intelligenceReviewState.activeIndex = controller?.state?.activeChangeIndex || 0;
  intelligenceReviewState.ready = controller?.mode === "copilot" && controller?.stage === "review";
  renderIntelligenceDocumentReview();
}

initComposerCanvas();
initSelectionToolbar();
initAmbientDock();
initSharedIntelligenceBridge();
