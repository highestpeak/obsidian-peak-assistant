(() => {
  "use strict";

  const VERSION = "adaptive-sidecar-2026-07-21";
  const MODES = ["copilot", "history"];
  const STAGES = ["brief", "session", "review"];
  const instances = new WeakMap();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const icon = (name) => `<svg aria-hidden="true"><use href="#ia-${name}"></use></svg>`;

  const ICONS = `
    <svg class="icon-sprite" aria-hidden="true" data-peak-intelligence-icons>
      <symbol id="ia-check" viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"></path></symbol>
      <symbol id="ia-spark" viewBox="0 0 24 24"><path d="M12 3l1.7 5.3L17 10l-5.3 1.7L10 17l-1.7-5.3L3 10l5.3-1.7z"></path><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path></symbol>
      <symbol id="ia-message" viewBox="0 0 24 24"><path d="M5 5h14v11H8l-3 3z"></path><path d="M9 9h6M9 12h4"></path></symbol>
      <symbol id="ia-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6M12 7v5l3 2"></path></symbol>
      <symbol id="ia-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></symbol>
      <symbol id="ia-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></symbol>
      <symbol id="ia-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></symbol>
      <symbol id="ia-arrow-up" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"></path></symbol>
      <symbol id="ia-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></symbol>
      <symbol id="ia-chevron-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></symbol>
      <symbol id="ia-chevron-up" viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"></path></symbol>
      <symbol id="ia-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></symbol>
      <symbol id="ia-refresh" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"></path><path d="M6.1 8.2A7 7 0 0 1 18.6 7M17.9 15.8A7 7 0 0 1 5.4 17"></path></symbol>
      <symbol id="ia-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12"></path><circle cx="12" cy="12" r="2.5"></circle></symbol>
      <symbol id="ia-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path></symbol>
      <symbol id="ia-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></symbol>
      <symbol id="ia-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></symbol>
      <symbol id="ia-locate" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="12" r="8"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></symbol>
      <symbol id="ia-undo" viewBox="0 0 24 24"><path d="m9 14-4-4 4-4"></path><path d="M5 10h11a4 4 0 0 1 0 8h-1"></path></symbol>
      <symbol id="ia-command" viewBox="0 0 24 24"><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"></path></symbol>
      <symbol id="ia-network" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"></circle><circle cx="19" cy="7" r="2"></circle><circle cx="8" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="m7 7 9.8-.2M6.2 7.7l1.1 8.2M10 18h6M18.6 9l-.4 7"></path></symbol>
      <symbol id="ia-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"></path><circle cx="3.5" cy="6" r=".8"></circle><circle cx="3.5" cy="12" r=".8"></circle><circle cx="3.5" cy="18" r=".8"></circle></symbol>
      <symbol id="ia-folder" viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v10H3z"></path><path d="M3 6v12"></path></symbol>
      <symbol id="ia-expand" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"></path><path d="m3 8 6-6M21 8l-6-6M21 16l-6 6M3 16l6 6"></path></symbol>
      <symbol id="ia-zoom-in" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6"></path></symbol>
      <symbol id="ia-zoom-out" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5M7.5 10.5h6"></path></symbol>
      <symbol id="ia-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></symbol>
      <symbol id="ia-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 15-4-4L5 20"></path></symbol>
      <symbol id="ia-bulb" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4"></path><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.4 1.5-1.5 2.5h-4c-.1-1-.6-1.8-1.5-2.5Z"></path></symbol>
      <symbol id="ia-route" viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><path d="M8 18h2a4 4 0 0 0 4-4V10a4 4 0 0 1 4-4M6 16V8"></path></symbol>
      <symbol id="ia-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></symbol>
      <symbol id="ia-shield-check" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"></path><path d="m9 12 2 2 4-4"></path></symbol>
      <symbol id="ia-book-open" viewBox="0 0 24 24"><path d="M2 4h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"></path><path d="M22 4h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"></path></symbol>
      <symbol id="ia-scan-text" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h8M7 12h10M7 16h7"></path></symbol>
      <symbol id="ia-align-left" viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h12"></path></symbol>
      <symbol id="ia-pen-line" viewBox="0 0 24 24"><path d="m12 20 9-9-4-4-9 9-1 5zM15 9l4 4M3 21h6"></path></symbol>
      <symbol id="ia-clipboard-list" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"></path></symbol>
      <symbol id="ia-file-text" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"></path></symbol>
      <symbol id="ia-split" viewBox="0 0 24 24"><circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M8 5h3a4 4 0 0 1 4 4v5a4 4 0 0 0 1 2.6M8 5h3a4 4 0 0 1 4 4"></path></symbol>
      <symbol id="ia-tag" viewBox="0 0 24 24"><path d="M20 13 11 22l-9-9V4h9z"></path><circle cx="7" cy="9" r="1.5"></circle></symbol>
      <symbol id="ia-languages" viewBox="0 0 24 24"><path d="m5 8 4 10M3 14h8M14 5h7M17.5 3v2M14 9c1.2 3 3.5 5.5 7 7M21 9c-1.3 3.2-3.7 5.7-7 7"></path></symbol>
      <symbol id="ia-list-check" viewBox="0 0 24 24"><path d="m3 6 2 2 3-3M11 7h10M3 13l2 2 3-3M11 14h10M3 20l2 2 3-3M11 21h10"></path></symbol>
    </svg>`;

  const SUGGESTIONS = [
    { id: "counterpoint", title: "补一个反方比较", body: "当前判断只有正向论证，补清哪些场景不适合直接回写正文。", target: "AI 旁路段落", reason: "当前段缺少适用边界", capability: "review-article", status: "active" },
    { id: "evidence-loop", title: "给核心判断找支撑材料", body: "沿当前链接和最近编辑找到可追溯依据，避免结论只依赖表述。", target: "知识库结构段落", reason: "命中 [[知识库]] 与 3 条近期材料", capability: "add-evidence", status: "active" },
    { id: "split-idea", title: "安放 2 条散落想法", body: "先建议放到对应段落，不直接写入正文。", target: "知识结构列表", reason: "本次会话存在 2 个未安放判断", capability: "suggest-split", status: "active" },
    { id: "link-opportunity", title: "补上结果回写的知识闭环", body: "把正文事务、来源和回滚记录之间的关系说清楚。", target: "AI 旁路段落", reason: "跨 4 个相关主题重复出现", capability: "suggest-links-graph", status: "active" },
    { id: "terminology", title: "统一“工作台 / 编辑面”术语", body: "避免工作台、sidecar、编辑现场指向不同概念。", target: "Composer 定位段落", reason: "检测到 3 组近义表达", capability: "correct-content", status: "active" },
    { id: "task-check", title: "检查可验证动作是否完整", body: "确认定位、接受、拒绝与回滚都有明确结果。", target: "小节结论", reason: "当前段落包含流程性承诺", capability: "check-task-list", status: "active" },
  ];

  const RELATED_MATERIALS_SNAPSHOT = window.PeakVaultResultFixtures.createRelatedMaterialsSnapshot();
  const SOURCES = RELATED_MATERIALS_SNAPSHOT.items.map((item) => ({ ...item }));

  const THOUGHTS = [
    { id: "thought-boundary", title: "原生对象也应保留增量过程", body: "建议放到 Composer architecture 的对象边界段。" },
    { id: "thought-review", title: "表格与公式 review 都用上下对比", body: "尚未确认是否应该成为所有非文本对象的统一规则。" },
    { id: "thought-history", title: "History 要按批次折叠多处改动", body: "可等 Review change set 合同确定后再写入。" },
    { id: "thought-context", title: "冻结后仍允许查看来源", body: "需要区分查看 snapshot 和刷新下一轮上下文。" },
  ];

  const CAPABILITIES = [
    ["correct-content", "推荐给当前对象", "修正内容", "Correct Content", "修正表达、逻辑和事实问题", "shield-check"],
    ["add-evidence", "推荐给当前对象", "补上依据", "Add Evidence", "寻找材料并把依据带入本轮", "book-open"],
    ["suggest-links-graph", "推荐给当前对象", "图谱建议链接", "Suggest Links Graph", "从知识图谱发现可解释连接", "network"],
    ["review-article", "审阅与修正", "审阅文章", "Review Article", "检查论证、结构、遗漏和风险", "scan-text"],
    ["polish-document", "审阅与修正", "润色文档", "Polish Document", "保持原意，改善行文与节奏", "spark"],
    ["format-polish", "审阅与修正", "格式整理", "Format Polish", "整理标题、列表与 Markdown 结构", "list"],
    ["continue-writing", "写作", "继续写作", "Continue Writing", "沿当前段落继续生成内容", "pen-line"],
    ["writing-plan", "写作", "写作计划", "Writing Plan", "先生成可调整的文章结构", "clipboard-list"],
    ["write-article", "写作", "撰写文章", "Write Article", "根据主题和材料生成草稿", "file-text"],
    ["suggest-split", "结构与提取", "建议拆分", "Suggest Split", "识别可独立成块或成文的部分", "split"],
    ["summarize", "结构与提取", "总结", "Summarize", "生成可定位的摘要", "align-left"],
    ["extract-concepts", "结构与提取", "提取概念", "Extract Concepts", "提取核心概念及其关系", "bulb"],
    ["suggest-tags", "知识连接", "建议标签", "Suggest Tags", "根据内容和知识库建议标签", "tag"],
    ["suggest-links", "知识连接", "建议链接", "Suggest Links", "发现适合加入正文的内部链接", "link"],
    ["translate", "写作", "翻译", "Translate", "按目标语言保留格式翻译", "languages", "请先选择目标语言"],
    ["check-task-list", "审阅与修正", "检查任务列表", "Check Task List", "识别遗漏、阻塞与不一致", "list-check"],
    ["rewrite-selection", "写作", "重写选区", "Rewrite Selection", "按指令重写当前选中文本", "pen-line", "当前没有文本选区"],
  ].map(([id, group, title, en, desc, iconName, disabled]) => ({ id, group, title, en, desc, iconName, disabled }));

  const CHANGES = [
    { id: "chg-01", target: "AI 旁路段落", title: "补清结果为什么必须回到正文", reason: "当前段只说“回到原位”，没有解释审阅、所有权与回滚之间的判断链。", capability: "修正内容", scope: "Paragraph · 2 行", before: "用户接受之前不会真的写回文件。", after: "用户可以在真实上下文中逐项审阅；只有接受后才写入，并始终保留回滚路径。", status: "pending" },
    { id: "chg-02", target: "知识库结构段落", title: "补一个反方边界", reason: "当前论证只陈述结构多样性，缺少“不该叠加”的判断条件。", capability: "审阅文章", scope: "Paragraph · 1 行", before: "碎片化思想、阅读摘录和灵感更适合网络结构；一门技术、一组课程或一本书的读书笔记更适合树状结构。", after: "碎片化思想、阅读摘录和灵感更适合网络结构；一门技术、一组课程或一本书的读书笔记更适合树状结构；如果结构只增加维护成本，就不应为了完整而叠加。", status: "pending" },
    { id: "chg-03", target: "Composer 定位段落", title: "把“工作台”改成具体任务表述", reason: "工作台是容器词，不能准确说明 Composer 与原生文档对象的关系。", capability: "修正内容", scope: "Paragraph · 1 行", before: "变成更顺手的工作台", after: "变成可直接审阅与回写的编辑面", status: "pending" },
    { id: "chg-04", target: "文档标题", title: "让标题覆盖组织阶段", reason: "正文重点不只是获取与输出，还包含结构化组织。", capability: "润色文档", scope: "Heading 1 · 1 行", before: "从信息获取到输出", after: "从收集、组织到输出", status: "pending" },
  ];

  const INSIGHTS = [
    { id: "review-boundary", severity: "值得确认", title: "结果回到正文不是展示偏好，而是审阅边界", body: "候选只有回到原对象，用户才能同时看到语义位置、来源和影响范围。", sourceIds: ["knowledge-base", "composer-architecture"] },
    { id: "frozen-context", severity: "上下文风险", title: "来源与上下文必须绑定同一次运行快照", body: "光标可以继续移动，但本轮洞察和候选必须保留当时读取的范围。", sourceIds: ["knowledge-review", "evidence-matrix"] },
  ];

  const TRACE = [
    ["14:20:01", "读取当前对象", "AI 旁路段落与邻近 2 段"],
    ["14:20:01", "冻结本轮上下文", "当前块、邻近段落、知识库.md"],
    ["14:20:02", "检索相关材料", "比较 37 项候选，保留 5 项强关联"],
    ["14:20:03", "形成 2 条可追问洞察", "审阅边界、冻结上下文"],
    ["14:20:04", "准备 4 处候选改动", "按正文出现顺序排列，没有自动写入"],
  ].map(([time, label, detail]) => ({ time, label, detail, status: "done" }));

  const INITIAL_THREAD = [
    { type: "system", title: "自动上下文已就绪", time: "14:19", body: "已读取当前块、邻近 2 段与 [[知识库]]。正文位置变化时，这条状态会原位更新。", chips: ["当前块", "邻近 2 段", "[[知识库]]"] },
    { type: "user", title: "你的指令", time: "14:20", quote: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。", body: "这段判断有点跳，补清为什么 AI 结果必须回到正文。" },
    { type: "assistant", title: "Copilot", time: "14:20", body: "关键不是 AI 能不能生成，而是候选是否回到原对象接受审阅。只有用户接受后，改变才成为可定位、可回滚的正文事务。", chips: ["当前块", "知识库.md"] },
    { type: "system", title: "已带入建议 · 上一轮", time: "14:21", body: "“补清来源关系”只装配了能力和材料，尚未改动正文。", chips: ["补上依据", "图谱建议链接"] },
  ];

  const HISTORY = [
    { day: "今天", date: "2026-07-21", entries: [
      { id: "hist-01", title: "修正 AI 旁路段落", target: "AI 旁路段落 · Paragraph · 2 行", time: "15:04", delta: "+18 −8", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "AI 应该贴在当前块旁边。", after: "AI 应该贴着当前对象工作，并把候选放回正文原位审阅。" },
      { id: "hist-02", title: "补上知识结构依据", target: "知识库结构段落 · Paragraph · 1 行", time: "14:47", delta: "+12 −0", origin: "mixed", originLabel: "AI 后调整", before: "真正重要的是内容之后还能被找到。", after: "真正重要的是内容之后还能被找到、组合并重新输出。" },
      { id: "hist-03", title: "调整章节标题", target: "章节标题 · Heading 2", time: "14:31", delta: "+4 −6", origin: "user", originLabel: "你直接编辑", before: "知识库的多种结构", after: "知识库不是单一目录，而是多种结构叠加" },
    ] },
    { day: "昨天", date: "2026-07-20", entries: [
      { id: "hist-04", title: "加入知识库链接", target: "AI 旁路段落 · Inline link", time: "18:42", delta: "+1 −0", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "自动参考知识库", after: "自动参考 [[知识库]]" },
      { id: "hist-05", title: "恢复一次标题修改", target: "文档标题 · Heading 1", time: "17:10", delta: "rollback", origin: "system", originLabel: "系统回滚", before: "PKM 的组织方法", after: "PKM 产品类别分析：从信息获取到输出" },
      { id: "hist-06", title: "压缩导语", target: "Composer 定位段落 · Paragraph", time: "16:26", delta: "+8 −19", origin: "mixed", originLabel: "AI 后调整", before: "这个视图希望让 Markdown 文件更顺手。", after: "这个 Composer 视图把 Markdown 变成更顺手的工作台。" },
    ] },
    { day: "7 月 15 日", date: "2026-07-15", entries: [
      { id: "hist-07", title: "建立 Frontmatter", target: "Frontmatter metadata", time: "21:45", delta: "+5 −0", origin: "user", originLabel: "你直接编辑", before: "无", after: "created / updated / tags" },
      { id: "hist-08", title: "补充跨库链接说明", target: "知识结构列表 · List item", time: "20:18", delta: "+11 −0", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "网络结构 / 树形结构", after: "增加跨库链接：保留来源、引用和迁移差异。" },
      { id: "hist-09", title: "格式整理", target: "全文 · Markdown", time: "19:52", delta: "+3 −3", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "混合标题与列表缩进", after: "统一标题层级与列表缩进" },
    ] },
  ];

  const SHELL = `
    <header class="sidecar-header">
      <div class="sidecar-presence"><span class="presence-icon">${icon("spark")}</span><span><strong>Intelligence</strong><small><i></i>正在跟随正文</small></span></div>
      <button class="icon-button" type="button" data-panel-close data-intelligence-close aria-label="关闭 Intelligence">${icon("x")}</button>
    </header>
    <nav class="primary-tabs" role="tablist" aria-label="Intelligence 工作面">
      <button type="button" role="tab" data-mode="copilot" data-intelligence-mode="copilot" aria-selected="true">${icon("message")}Copilot</button>
      <button type="button" role="tab" data-mode="history" data-intelligence-mode="history" aria-selected="false">${icon("history")}History <b data-history-count>9</b></button>
    </nav>
    <nav class="stage-tabs" role="tablist" aria-label="Copilot 工作队列" hidden></nav>
    <section class="sidecar-content" role="tabpanel" tabindex="-1"></section>
    <section class="session-dock" aria-label="Copilot 输入区" hidden>
      <div class="quick-actions">
        <button type="button" data-capability="correct-content">修正内容</button>
        <button type="button" data-capability="add-evidence">补上依据</button>
        <button type="button" data-capability="suggest-links-graph">图谱建议链接</button>
        <button class="all-capabilities" type="button" data-open-capabilities>${icon("command")}全部能力</button>
      </div>
      <div class="prompt-input-shell">
        <div class="prompt-context"></div>
        <textarea class="prompt-input" rows="1" placeholder="描述要改什么，或输入 / 选择能力…"></textarea>
        <div class="prompt-footer"><div class="prompt-tools"><button class="icon-button" type="button" data-add-context aria-label="添加上下文">${icon("plus")}</button><button class="icon-button" type="button" data-voice aria-label="语音输入">${icon("mic")}</button></div><div class="prompt-run"><button class="model-button" type="button" data-model-info aria-label="查看自动模型说明">自动模型 ${icon("chevron-down")}</button><button class="send-button" type="button" data-send aria-label="发送" disabled>${icon("arrow-up")}</button></div></div>
      </div>
    </section>
    <dialog class="capability-dialog" aria-labelledby="capability-dialog-title"><div class="dialog-shell"><header><span><strong id="capability-dialog-title">全部能力</strong><small>选择后进入输入框，不会自动运行</small></span><button class="icon-button" type="button" data-close-capabilities aria-label="关闭">${icon("x")}</button></header><label class="picker-search">${icon("search")}<input type="search" data-capability-search placeholder="搜索能力、结果或英文名称" /></label><div class="capability-results"></div></div></dialog>
    <dialog class="history-dialog" aria-labelledby="history-dialog-title"><div class="history-dialog-shell"></div></dialog>
    <dialog class="graph-dialog" aria-labelledby="graph-dialog-title"><div class="graph-dialog-shell"></div></dialog>
    <div class="toast" hidden role="status" aria-live="polite"></div>`;

  function ensureIcons() {
    if (document.querySelector("[data-peak-intelligence-icons]")) return;
    document.body.insertAdjacentHTML("afterbegin", ICONS);
  }

  function initialState(root, options = {}) {
    const params = new URLSearchParams(window.location.search);
    const mode = MODES.includes(options.mode || params.get("mode")) ? (options.mode || params.get("mode")) : "copilot";
    const stage = STAGES.includes(options.stage || params.get("stage")) ? (options.stage || params.get("stage")) : "brief";
    return {
      mode,
      stage,
      open: true,
      sensingMode: "smart",
      autoRun: false,
      refreshTime: "14:32",
      refreshRevision: 1,
      expanded: { suggestions: false, thoughts: false },
      suggestions: SUGGESTIONS.map((item) => ({ ...item })),
      sources: SOURCES.map((item) => ({ ...item })),
      thoughts: THOUGHTS.map((item) => ({ ...item })),
      context: { id: "ai-sidecar", title: "AI 旁路段落", kind: "paragraph", source: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。" },
      contextIds: ["current", "adjacent", "knowledge"],
      selectedCapability: null,
      sessionTitle: "补清为什么 AI 结果必须回到正文",
      thread: INITIAL_THREAD.map((item) => ({ ...item, chips: item.chips ? [...item.chips] : undefined })),
      running: false,
      runReady: false,
      runTab: "changes",
      runExpanded: true,
      runOpenItem: null,
      changes: CHANGES.map((item) => ({ ...item })),
      activeChangeIndex: 0,
      reviewStatus: "reviewing",
      reviewEditing: false,
      history: HISTORY.map((group) => ({ ...group, entries: group.entries.map((item) => ({ ...item })) })),
      historySelection: null,
      historyExpandedGroups: new Set(),
      pickerMode: "capability",
      voiceActive: false,
      graph: { selectedNodeId: "source:knowledge-base", selectedSourceId: "knowledge-base", resultView: "graph", density: "detailed", collapsedFolders: [], preset: "constellation", showSemantic: false, zoom: 1, panX: 0, panY: 0 },
      root,
    };
  }

  class IntelligenceController {
    constructor(root, options = {}) {
      this.root = root;
      this.state = initialState(root, options);
      this.runTimer = 0;
      this.toastTimer = 0;
      this.voiceTimer = 0;
      this.graphTrigger = null;
      this.capabilityTrigger = null;
      this.historyTrigger = null;
      this.onClick = this.handleClick.bind(this);
      this.onInput = this.handleInput.bind(this);
      this.onKeydown = this.handleKeydown.bind(this);
      this.onChange = this.handleChange.bind(this);
      this.onPointerOver = (event) => this.graph?.handlePointerOver(event, this.root);
      this.onPointerOut = (event) => this.graph?.handlePointerOut(event, this.root);
      this.onDoubleClick = (event) => this.graph?.handleDoubleClick(event);
      this.onWheel = (event) => this.graph?.handleWheel(event, this.root);
      this.onPointerDown = (event) => this.graph?.handlePointerDown(event);
      this.onPointerMove = (event) => this.graph?.handlePointerMove(event, this.root);
      this.onPointerUp = (event) => this.graph?.handlePointerUp(event, this.root);
      this.onGraphCancel = (event) => {
        event.preventDefault();
        this.closeGraph();
      };
      this.onCapabilityCancel = (event) => {
        event.preventDefault();
        this.closeCapabilities();
      };
      this.onHistoryCancel = (event) => {
        event.preventDefault();
        this.closeHistory();
      };
      root.addEventListener("click", this.onClick);
      root.addEventListener("input", this.onInput);
      root.addEventListener("keydown", this.onKeydown);
      root.addEventListener("change", this.onChange);
      root.addEventListener("pointerover", this.onPointerOver);
      root.addEventListener("pointerout", this.onPointerOut);
      root.addEventListener("dblclick", this.onDoubleClick);
      root.addEventListener("wheel", this.onWheel, { passive: false });
      root.addEventListener("pointerdown", this.onPointerDown);
      root.addEventListener("pointermove", this.onPointerMove);
      root.addEventListener("pointerup", this.onPointerUp);
      root.addEventListener("pointercancel", this.onPointerUp);
      this.query(".graph-dialog")?.addEventListener("cancel", this.onGraphCancel);
      this.query(".capability-dialog")?.addEventListener("cancel", this.onCapabilityCancel);
      this.query(".history-dialog")?.addEventListener("cancel", this.onHistoryCancel);
      this.createGraph();
      this.render();
      this.setOpen(options.open !== false, { emit: false, restoreFocus: false });
    }

    get mode() { return this.state.mode; }
    get stage() { return this.state.stage; }
    query(selector) { return $(selector, this.root); }
    queryAll(selector) { return $$(selector, this.root); }

    emit(type, detail = {}, options = {}) {
      return this.root.dispatchEvent(new CustomEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: Boolean(options.cancelable),
        detail,
      }));
    }

    createGraph() {
      if (!window.PeakVaultResultBrowser) return;
      this.graph = window.PeakVaultResultBrowser.create({
        state: this.state.graph,
        escapeHtml,
        icon,
        snapshot: { ...RELATED_MATERIALS_SNAPSHOT, items: this.state.sources },
        getDialogRoot: () => this.query(".graph-dialog"),
        onOpenSource: (id) => this.openSource(id),
        onToast: (message) => this.notify(message),
        onRender: () => {
          const dialog = this.query(".graph-dialog");
          if (dialog?.open) this.renderGraphDialog();
          if (this.state.mode === "copilot" && this.state.stage === "brief") this.renderBrief();
        },
      });
    }

    totalHistory() {
      return this.state.history.reduce((sum, group) => sum + group.entries.length, 0);
    }

    setMode(mode, options = {}) {
      if (!MODES.includes(mode)) return;
      this.state.mode = mode;
      this.render();
      if (options.focus) this.query(`[data-mode="${mode}"]`)?.focus({ preventScroll: true });
      if (options.emit !== false) this.emit("peak:intelligence-mode", { mode });
    }

    setStage(stage, options = {}) {
      if (!STAGES.includes(stage)) return;
      this.state.mode = "copilot";
      this.state.stage = stage;
      this.render();
      if (stage === "session" && options.focusComposer !== false) {
        requestAnimationFrame(() => this.query(".prompt-input")?.focus({ preventScroll: true }));
      }
      if (stage === "review") this.emitReviewLocation();
      if (options.emit !== false) this.emit("peak:intelligence-stage", { stage });
    }

    setOpen(open, options = {}) {
      this.state.open = Boolean(open);
      const app = this.root.closest(".composer-app") || document.querySelector(".composer-app");
      app?.classList.toggle("is-panel-open", this.state.open);
      app?.classList.toggle("ambient-open", this.state.open);
      app?.classList.add("intelligence-ready");
      this.root.setAttribute("aria-hidden", String(!this.state.open));
      this.root.inert = !this.state.open;
      const toggle = document.querySelector("#ambient-toggle, [data-panel-toggle]");
      toggle?.setAttribute("aria-expanded", String(this.state.open));
      if (!this.state.open && options.restoreFocus !== false) toggle?.focus({ preventScroll: true });
      if (options.emit !== false) this.emit("peak:intelligence-open-change", { open: this.state.open });
    }

    updateContext(payload = {}) {
      this.state.context = { ...this.state.context, ...payload };
      const system = this.state.thread.find((event) => event.type === "system" && event.title === "自动上下文已就绪");
      if (system) {
        system.body = `已读取「${this.state.context.title}」、邻近 2 段与 [[知识库]]。正文位置变化时，这条状态会原位更新。`;
        system.chips = [this.state.context.title, "邻近 2 段", "[[知识库]]"];
      }
      this.render();
    }

    notify(title, detail = "") {
      const toast = this.query(".toast");
      if (!toast) return;
      clearTimeout(this.toastTimer);
      toast.textContent = detail ? `${title} · ${String(detail).replace(/<[^>]+>/g, "").trim()}` : title;
      toast.hidden = false;
      this.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2200);
    }

    syncUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", this.state.mode);
      if (this.state.mode === "copilot") url.searchParams.set("stage", this.state.stage);
      else url.searchParams.delete("stage");
      if (url.searchParams.has("variant")) url.searchParams.set("variant", "adaptive");
      window.history.replaceState(null, "", url);
    }

    renderShell() {
      this.root.dataset.variant = "adaptive";
      this.root.dataset.stage = this.state.stage;
      this.root.dataset.stageNav = "hidden";
      this.queryAll("[data-mode]").forEach((button) => {
        const selected = button.dataset.mode === this.state.mode;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      const stageTabs = this.query(".stage-tabs");
      if (stageTabs) stageTabs.hidden = true;
      const dock = this.query(".session-dock");
      if (dock) dock.hidden = !(this.state.mode === "copilot" && this.state.stage === "session");
      const count = this.query("[data-history-count]");
      if (count) count.textContent = String(this.totalHistory());
    }

    renderBrief() {
      const active = this.state.suggestions.filter((item) => item.status === "active");
      const visibleSuggestions = active.slice(0, this.state.expanded.suggestions ? 6 : 3);
      const visibleThoughts = this.state.thoughts.slice(0, this.state.expanded.thoughts ? 4 : 2);
      const sensingLabels = { off: "仅手动", smart: "停笔后", continuous: "编辑时" };
      const sensingHint = this.state.sensingMode === "off"
        ? "现在只在你点击“更新建议”时检查"
        : this.state.sensingMode === "smart"
          ? "切换文件或停笔后自动检查"
          : "编辑期间会定期检查，消耗更多 token";
      const suggestions = visibleSuggestions.map((item, index) => `
        <article class="suggestion-row${index === 0 ? " is-primary" : ""}" data-suggestion-id="${item.id}">
          <span class="suggestion-index">${String(index + 1).padStart(2, "0")}</span>
          <div class="suggestion-copy"><div class="suggestion-title"><strong>${escapeHtml(item.title)}</strong></div><p>${escapeHtml(item.body)}</p><div class="suggestion-meta"><span>${escapeHtml(item.target)}</span><span>${escapeHtml(item.reason)}</span></div></div>
          <div class="suggestion-actions"><button type="button" data-discuss-suggestion="${item.id}">讨论</button><details class="suggestion-more"><summary aria-label="更多操作" title="更多操作">${icon("more")}</summary><div class="suggestion-menu" role="menu"><button type="button" role="menuitem" data-defer-suggestion="${item.id}"><span>移到后面</span><small>降低当前排序</small></button><button class="is-ignore" type="button" role="menuitem" data-ignore-suggestion="${item.id}"><span>本轮忽略</span><small>刷新后可恢复</small></button></div></details></div>
        </article>`).join("");
      const thoughts = visibleThoughts.map((item) => `<article class="thought-row"><div class="thought-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div><button class="row-action" type="button" data-use-thought="${item.id}">整理</button></article>`).join("");
      this.query(".sidecar-content").innerHTML = `
        <div class="brief-view">
          <header class="brief-head">
            <div class="brief-status"><span><i class="${this.state.sensingMode === "off" ? "is-paused" : ""}"></i>${this.state.sensingMode === "off" ? "仅手动检查" : "正在关注"}「${escapeHtml(this.state.context.title)}」</span><time>${this.state.refreshTime} · v${this.state.refreshRevision}</time></div>
            <h2>针对当前正文，接下来值得处理什么</h2><p>${sensingHint}。结果会在这里原位更新，不会追加到对话。</p>
            <div class="brief-head-actions"><button type="button" data-start-session>问 Copilot</button><button type="button" data-refresh-brief>${icon("refresh")}更新建议</button><details class="sensing-control"><summary><i class="${this.state.sensingMode === "off" ? "is-paused" : ""}"></i>建议更新 · ${sensingLabels[this.state.sensingMode]} ${icon("chevron-down")}</summary><div class="sensing-menu" role="group" aria-label="建议更新设置"><span class="sensing-menu-label">什么时候检查新建议</span><button type="button" role="radio" aria-checked="${this.state.sensingMode === "off"}" data-sensing-mode="off"><span><strong>仅手动</strong><small>只在你点击“更新建议”时检查</small></span><i></i></button><button type="button" role="radio" aria-checked="${this.state.sensingMode === "smart"}" data-sensing-mode="smart"><span><strong>停笔后更新 <em>推荐</em></strong><small>切换文件或停止编辑后检查</small></span><i></i></button><button type="button" role="radio" aria-checked="${this.state.sensingMode === "continuous"}" data-sensing-mode="continuous"><span><strong>编辑时定期更新</strong><small>编辑期间定期检查；消耗更多 token</small></span><i></i></button><span class="sensing-menu-label is-secondary">发现新建议后</span><button class="auto-run-setting" type="button" role="checkbox" aria-checked="${this.state.autoRun}" data-toggle-auto-run><span><strong>自动准备待审改动</strong><small>符合规则时可继续生成候选；仍需你审阅</small></span><i></i></button><small class="sensing-menu-note">任何设置都不会自动接受或写入正文</small></div></details></div>
          </header>
          <section class="brief-section"><header class="section-title"><span><strong>接下来可能要做</strong><b>38</b><small>按影响与正文顺序排序</small></span></header><div class="suggestion-list">${suggestions}</div><button class="list-more" type="button" data-expand="suggestions">${this.state.expanded.suggestions ? "收起" : "查看全部 38 条建议"}</button></section>
          <section class="brief-section"><header class="section-title"><span><strong>相关材料</strong><b>${this.state.sources.length}</b><small>作为建议依据，不直接改正文</small></span><button class="section-action" type="button" data-refresh-brief>${icon("refresh")}刷新</button></header>${this.graph ? this.graph.renderInline() : ""}<button class="list-more" type="button" data-open-materials="list">打开完整视图</button></section>
          <section class="brief-section"><header class="section-title"><span><strong>还没安放的想法</strong><b>19</b><small>不是待办，由你决定是否写入</small></span></header><div class="thought-list">${thoughts}</div><button class="list-more" type="button" data-expand="thoughts">${this.state.expanded.thoughts ? "收起" : "查看全部 19 条想法"}</button></section>
        </div>`;
    }

    renderEvent(event) {
      const avatar = event.type === "assistant" ? "AI" : event.type === "user" ? "你" : "✓";
      const chips = event.chips?.length ? `<div class="event-chips">${event.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>` : "";
      return `<article class="thread-event is-${event.type}"><span class="event-avatar">${avatar}</span><div class="event-body"><div class="event-title"><strong>${escapeHtml(event.title)}</strong><time>${escapeHtml(event.time)}</time></div>${event.quote ? `<blockquote class="message-quote">引用 · ${escapeHtml(this.state.context.title)}<br>${escapeHtml(event.quote)}</blockquote>` : ""}<p>${escapeHtml(event.body)}</p>${chips}${event.run ? this.renderRunReceipt() : ""}</div></article>`;
    }

    renderRunPanel() {
      if (this.state.runTab === "changes") {
        return `<div class="run-inline-list" data-kind="changes">${this.state.changes.slice(0, 3).map((change, index) => { const open = this.state.runOpenItem === change.id; return `<article class="run-inline-item is-change${open ? " is-open" : ""}" data-status="${change.status}"><button class="run-inline-row" type="button" aria-expanded="${open}" data-run-item="${change.id}"><span>${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(change.title)}</strong><small>${escapeHtml(change.target)} · ${escapeHtml(change.scope)}</small></span><em>${change.status === "pending" ? "待审阅" : change.status === "accepted" ? "已接受" : "已拒绝"}</em>${icon("chevron")}</button>${open ? `<div class="run-inline-detail"><p>${escapeHtml(change.reason)}</p><div class="inline-diff"><del>${escapeHtml(change.before)}</del> <ins>${escapeHtml(change.after)}</ins></div><footer><button type="button" data-locate-change="${change.id}">${icon("locate")}在正文审阅</button></footer></div>` : ""}</article>`; }).join("")}</div><button class="run-inline-more" type="button" data-start-review>查看全部 ${this.state.changes.length} 处改动</button>`;
      }
      if (this.state.runTab === "insights") {
        return `<div class="run-inline-list" data-kind="insights">${INSIGHTS.map((insight, index) => `<article class="run-inline-insight"><span>${icon("spark")}</span><div><small>${escapeHtml(insight.severity)} · ${insight.sourceIds.length} 项依据</small><strong>${escapeHtml(insight.title)}</strong><p>${escapeHtml(insight.body)}</p><footer><button type="button" data-use-insight="${insight.id}">继续追问</button><button type="button" data-use-insight="${insight.id}" data-as-change>生成修改</button></footer></div><b>${String(index + 1).padStart(2, "0")}</b></article>`).join("")}</div>`;
      }
      if (this.state.runTab === "sources") {
        return `<div class="run-inline-panel-head"><span>本轮冻结的材料</span><button type="button" data-open-materials="graph">${icon("network")}打开完整视图</button></div><div class="run-inline-list" data-kind="sources">${this.state.sources.slice(0, 3).map((source) => `<article class="run-inline-source"><div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.path)}</small><p>${escapeHtml(source.reason)}</p></div><b>${source.score}%</b><footer><button type="button" data-view-source="${source.id}">${icon("eye")}查看</button><button type="button" data-use-source="${source.id}">带入下一轮</button></footer></article>`).join("")}</div>`;
      }
      return `<div class="run-inline-trace-note"><span>4 秒 · 1 轮</span><small>只显示可验证动作，不展示模型私有推理</small></div><ol class="run-inline-trace">${TRACE.map((step) => `<li data-status="done"><time>${step.time}</time><i>✓</i><span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></span></li>`).join("")}</ol>`;
    }

    renderRunReceipt() {
      const tabs = [["changes", "改动", this.state.changes.length], ["insights", "洞察", INSIGHTS.length], ["sources", "来源", this.state.sources.length], ["trace", "记录", TRACE.length]];
      return `<section class="run-receipt"><header><span><strong>${escapeHtml(this.state.sessionTitle)}</strong><small>4 秒 · ${this.state.changes.filter((item) => item.status === "pending").length} 处等待审阅</small></span><div class="run-receipt-actions"><button class="run-primary-action" type="button" data-start-review>开始审阅</button><button class="run-inline-toggle" type="button" aria-expanded="${this.state.runExpanded}" data-run-toggle>${this.state.runExpanded ? "收起" : "展开"}${icon("chevron")}</button></div></header><nav class="run-inline-tabs" role="tablist">${tabs.map(([id, label, count]) => `<button type="button" role="tab" aria-selected="${this.state.runTab === id}" data-run-tab="${id}"><span>${label}</span><b>${count}</b></button>`).join("")}</nav><section class="run-inline-panel" data-run-inline-panel="${this.state.runTab}"${this.state.runExpanded ? "" : " hidden"}>${this.renderRunPanel()}</section></section>`;
    }

    renderSession() {
      const running = this.state.running ? `<article class="thread-event is-run"><span class="event-avatar">AI</span><div class="event-body"><div class="event-title"><strong>正在执行 · 4/5</strong><time>现在</time></div><ol class="run-progress-list"><li class="is-done"><i>✓</i><span><strong>理解任务并冻结上下文</strong><small>3 项上下文已固定</small></span></li><li class="is-done"><i>✓</i><span><strong>检索相关材料</strong><small>找到 5 项来源</small></span></li><li class="is-current"><i></i><span><strong>生成正文候选</strong><small>按正文顺序准备修改</small></span></li></ol><div class="run-live-actions"><button type="button" data-stop-run>停止</button><button type="button" data-redirect-run>追加下一步指令</button></div></div></article>` : "";
      const thread = this.state.thread.map((event) => this.renderEvent(event)).join("");
      this.query(".sidecar-content").innerHTML = `<div class="session-view"><header class="task-head"><div class="task-leading"><button class="task-back" type="button" data-back-brief aria-label="返回建议">${icon("chevron-left")}</button><div class="task-copy"><h2>${escapeHtml(this.state.sessionTitle)}</h2><p>围绕具体任务协作 · 上下文在运行开始时冻结</p></div></div><button class="task-action" type="button" data-start-review>审阅 ${this.state.changes.length} 处改动</button></header><div class="thread">${thread}${running}</div></div>`;
    }

    activeChange() {
      return this.state.changes[this.state.activeChangeIndex] || null;
    }

    renderReview() {
      const change = this.activeChange();
      if (!change) return;
      const resolved = this.state.changes.filter((item) => item.status !== "pending").length;
      if (resolved === this.state.changes.length) {
        const accepted = this.state.changes.filter((item) => item.status === "accepted").length;
        const rejected = this.state.changes.filter((item) => item.status === "rejected").length;
        this.query(".sidecar-content").innerHTML = `<div class="review-view"><section class="review-complete"><i>✓</i><h3>这组改动已经处理完</h3><p>${accepted} 处已接受并写入正文，${rejected} 处已拒绝。只有接受的事务进入 History。</p><button type="button" data-run-tab="changes" data-stage-link="session">查看完整审阅记录</button><button type="button" data-mode="history">查看 History</button><button type="button" data-stage-link="session">继续协作</button></section></div>`;
        return;
      }
      const rows = this.state.changes.map((item, index) => `<button class="change-row${index === this.state.activeChangeIndex ? " is-active" : ""}${item.status !== "pending" ? " is-resolved" : ""}" type="button" data-change-index="${index}" data-status="${item.status}"><span class="change-status">${item.status === "accepted" ? "✓" : item.status === "rejected" ? "×" : ""}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.target)}</small></button>`).join("");
      const actions = change.status !== "pending"
        ? `<span class="review-decision" data-status="${change.status}">${change.status === "accepted" ? "已接受" : "已拒绝"}</span>`
        : this.state.reviewEditing
          ? `<label class="review-edit"><span>编辑候选后再写入</span><textarea class="review-edit-input" rows="4">${escapeHtml(change.after)}</textarea></label><div class="review-edit-actions"><button class="accept-change" type="button" data-review-edit-save>保存并接受</button><button type="button" data-review-edit-cancel>取消</button></div>`
          : `<button class="accept-change" type="button" data-review-action="accept">接受</button><button type="button" data-review-action="edit-accept">编辑后接受</button><button class="reject-change" type="button" data-review-action="reject">拒绝</button><button type="button" data-review-action="accept-all">全部接受</button>`;
      this.query(".sidecar-content").innerHTML = `<div class="review-view"><section class="review-navigator"><header class="review-title"><div class="task-leading"><button class="task-back review-back" type="button" data-stage-link="session" aria-label="返回协作">${icon("chevron-left")}</button><div class="task-copy"><h2>审阅改动</h2><p>正文原位是事实来源，侧栏负责导航和解释。</p></div></div></header><div class="review-progress"><span>改动 ${this.state.activeChangeIndex + 1} / ${this.state.changes.length}</span><span class="progress-track"><i style="width:${(resolved / this.state.changes.length) * 100}%"></i></span><span>${resolved} 已处理</span></div><div class="review-nav-buttons"><button type="button" data-review-nav="previous">${icon("chevron-up")}上一处</button><button type="button" data-review-nav="next">${icon("chevron-down")}下一处</button></div></section><article class="review-card"><span class="review-kicker">${escapeHtml(change.capability)} · ${change.id}</span><h3>${escapeHtml(change.title)}</h3><p>${escapeHtml(change.reason)}</p><div class="review-meta"><span>${escapeHtml(change.target)}</span><span>${escapeHtml(change.scope)}</span><span>${escapeHtml(change.status)}</span></div><div class="review-location-note">${icon("locate")}<span>改动已显示在正文原位。用正文编号、上一处或下一处切换。</span></div><div class="review-actions">${actions}</div></article><section class="review-overview"><strong>本轮全部改动</strong><div class="change-list">${rows}</div></section></div>`;
    }

    renderHistory() {
      const groups = this.state.history.map((group) => `<section class="history-day"><header><span>${escapeHtml(group.day)}</span><time>${escapeHtml(group.date)}</time></header><div class="history-list">${this.renderHistoryDay(group.entries)}</div></section>`).join("");
      this.query(".sidecar-content").innerHTML = `<div class="history-view"><header class="history-heading"><div><h2>文档历史</h2><p>记录你的直接编辑、AI 辅助后接受、AI 后调整与系统回滚；不记录建议和生成过程。</p></div><b>${this.totalHistory()} 笔事务</b></header>${groups}</div>`;
    }

    renderHistoryRow(entry, nested = false) {
      return `<button class="history-row${nested ? " is-nested" : ""}" type="button" data-history-id="${entry.id}" data-origin="${entry.origin}"><i class="history-dot"></i><span class="history-copy"><span class="history-title"><strong>${escapeHtml(entry.title)}</strong><em class="origin-tag">${escapeHtml(entry.originLabel)}</em></span><small>${escapeHtml(entry.target)}</small></span><span class="history-meta"><time>${escapeHtml(entry.time)}</time><b>${escapeHtml(entry.delta)}</b></span></button>`;
    }

    renderHistoryDay(entries) {
      const display = [];
      for (let index = 0; index < entries.length;) {
        const entry = entries[index];
        if (!entry.groupId) {
          display.push(this.renderHistoryRow(entry));
          index += 1;
          continue;
        }
        const grouped = [];
        while (entries[index]?.groupId === entry.groupId) {
          grouped.push(entries[index]);
          index += 1;
        }
        if (grouped.length === 1) {
          display.push(this.renderHistoryRow(grouped[0]));
          continue;
        }
        const expanded = this.state.historyExpandedGroups.has(entry.groupId);
        const label = entry.groupLabel || (entry.origin === "user" ? "连续直接编辑" : "本轮 Copilot 写入");
        display.push(`
          <section class="history-batch" data-origin="${escapeHtml(entry.origin)}" data-history-group="${escapeHtml(entry.groupId)}">
            <button class="history-batch-summary" type="button" data-history-group-toggle="${escapeHtml(entry.groupId)}" aria-expanded="${expanded}">
              <i class="history-dot"></i>
              <span class="history-copy"><span class="history-title"><strong>${escapeHtml(label)} · ${grouped.length} 处</strong><em class="origin-tag">${escapeHtml(entry.originLabel)}</em></span><small>${grouped.length} 笔独立事务 · 展开后可逐笔查看、定位与回滚</small></span>
              <span class="history-meta"><time>${escapeHtml(grouped[0].time)}</time><b>${grouped.length} 笔</b>${icon("chevron-down")}</span>
            </button>
            <div class="history-batch-entries" ${expanded ? "" : "hidden"}>${grouped.map((item) => this.renderHistoryRow(item, true)).join("")}</div>
          </section>`);
      }
      return display.join("");
    }

    toggleHistoryGroup(groupId) {
      if (!groupId) return;
      if (this.state.historyExpandedGroups.has(groupId)) this.state.historyExpandedGroups.delete(groupId);
      else this.state.historyExpandedGroups.add(groupId);
      this.renderHistory();
      requestAnimationFrame(() => this.queryAll("[data-history-group-toggle]").find((button) => button.dataset.historyGroupToggle === groupId)?.focus({ preventScroll: true }));
    }

    renderComposer() {
      const contextLabels = { current: `当前块 · ${this.state.context.title}`, adjacent: "邻近 2 段", knowledge: "知识库.md", graph: "链接图谱 · 2 hop" };
      this.state.sources.forEach((source) => { contextLabels[`source:${source.id}`] = source.title; });
      const chips = this.state.contextIds.map((id) => id === "current"
        ? `<span class="context-chip is-locked">${icon("link")}${escapeHtml(contextLabels[id])}</span>`
        : `<button class="context-chip" type="button" data-remove-context="${id}">${icon("link")}${escapeHtml(contextLabels[id] || id)}${icon("x")}</button>`);
      const capability = CAPABILITIES.find((item) => item.id === this.state.selectedCapability);
      if (capability) chips.unshift(`<button class="context-chip is-action" type="button" data-remove-capability>${icon("spark")}${escapeHtml(capability.title)}${icon("x")}</button>`);
      const context = this.query(".prompt-context");
      if (context) context.innerHTML = chips.join("");
      this.queryAll(".quick-actions [data-capability]").forEach((button) => button.classList.toggle("is-selected", button.dataset.capability === this.state.selectedCapability));
      this.updatePromptState();
    }

    render() {
      this.renderShell();
      if (this.state.mode === "history") this.renderHistory();
      else if (this.state.stage === "brief") this.renderBrief();
      else if (this.state.stage === "session") this.renderSession();
      else this.renderReview();
      this.renderComposer();
      this.syncUrl();
    }

    updatePromptState() {
      const prompt = this.query(".prompt-input");
      const send = this.query("[data-send]");
      if (!prompt || !send) return;
      prompt.style.height = "auto";
      prompt.style.height = `${Math.min(prompt.scrollHeight, 128)}px`;
      send.disabled = !prompt.value.trim() || this.state.running;
    }

    openCapabilities(mode = "capability") {
      this.state.pickerMode = mode;
      this.capabilityTrigger = document.activeElement;
      const dialog = this.query(".capability-dialog");
      const title = this.query("#capability-dialog-title");
      const subtitle = this.query(".capability-dialog .dialog-shell > header small");
      const search = this.query("[data-capability-search]");
      if (title) title.textContent = mode === "context" ? "添加上下文" : "全部能力";
      if (subtitle) subtitle.textContent = mode === "context" ? "选择后成为 context chip" : "选择后进入输入框，不会自动运行";
      if (search) {
        search.value = "";
        search.placeholder = mode === "context" ? "搜索文件、图谱或上下文" : "搜索能力、结果或英文名称";
      }
      this.renderCapabilityResults("");
      dialog?.showModal();
      requestAnimationFrame(() => search?.focus());
    }

    renderCapabilityResults(query = "") {
      const results = this.query(".capability-results");
      if (!results) return;
      const normalized = query.trim().toLocaleLowerCase();
      if (this.state.pickerMode === "context") {
        const options = [["adjacent", "邻近 2 段", "当前块前后各一段", "route"], ["knowledge", "知识库.md", "显式 Vault 文档引用", "book-open"], ["graph", "链接图谱 · 2 hop", "当前对象的近邻图谱", "network"]];
        const matches = options.filter(([, title, desc]) => !normalized || `${title} ${desc}`.toLocaleLowerCase().includes(normalized));
        const rows = matches.map(([id, title, desc, iconName]) => `<button class="capability-row" type="button" data-context-option="${id}"><i>${icon(iconName)}</i><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></span><em>${this.state.contextIds.includes(id) ? "已加入" : "加入"}</em></button>`).join("");
        results.innerHTML = `<section class="capability-group"><header><span>上下文</span><span>加入输入框</span></header>${rows || "<small>没有匹配结果</small>"}</section>`;
        return;
      }
      const matches = CAPABILITIES.filter((item) => !normalized || `${item.title} ${item.en} ${item.desc}`.toLocaleLowerCase().includes(normalized));
      const groups = [...new Set(matches.map((item) => item.group))];
      results.innerHTML = groups.map((group) => {
        const items = matches.filter((item) => item.group === group);
        return `<section class="capability-group"><header><span>${escapeHtml(group)}</span><span>${items.length} 项</span></header>${items.map((item) => `<button class="capability-row" type="button" data-picker-capability="${item.id}"${item.disabled ? " disabled" : ""}><i>${icon(item.iconName)}</i><span><strong>${escapeHtml(item.title)} · ${escapeHtml(item.en)}</strong><small>${escapeHtml(item.disabled || item.desc)}</small></span><em>${item.disabled ? "不可用" : this.state.selectedCapability === item.id ? "已选择" : "选择"}</em></button>`).join("")}</section>`;
      }).join("") || "<small>没有匹配结果</small>";
    }

    openGraph(view = "graph", trigger) {
      if (!this.graph) return this.notify("完整资料视图尚未加载");
      this.graphTrigger = trigger || document.activeElement;
      this.state.graph.resultView = ["list", "tree", "graph"].includes(view) ? view : "graph";
      this.renderGraphDialog();
      const dialog = this.query(".graph-dialog");
      if (!dialog) return;
      dialog.showModal();
      requestAnimationFrame(() => {
        $("[data-close-graph]", dialog)?.focus({ preventScroll: true });
      });
    }

    renderGraphDialog() {
      const shell = this.query(".graph-dialog-shell");
      if (shell && this.graph) shell.innerHTML = this.graph.renderDialog();
    }

    closeGraph() {
      const dialog = this.query(".graph-dialog");
      if (dialog?.open) dialog.close();
      const shell = this.query(".graph-dialog-shell");
      if (shell) shell.replaceChildren();
      const trigger = this.graphTrigger?.isConnected ? this.graphTrigger : this.query("[data-open-graph]");
      this.graphTrigger = null;
      requestAnimationFrame(() => trigger?.focus?.({ preventScroll: true }));
    }

    openSource(id) {
      const source = this.state.sources.find((item) => item.id === id);
      this.emit("peak:intelligence-open-source", { source });
      this.notify("打开来源", source?.title || "Vault 文档");
    }

    beginSuggestion(id) {
      const suggestion = this.state.suggestions.find((item) => item.id === id);
      if (!suggestion) return;
      this.state.selectedCapability = suggestion.capability;
      this.state.sessionTitle = suggestion.title;
      this.state.thread.push({ type: "user", title: "你的指令", time: "现在", quote: this.state.context.source, body: `讨论建议：${suggestion.title}` });
      this.state.thread.push({ type: "assistant", title: "Copilot", time: "现在", body: `我会围绕「${suggestion.target}」继续。相关材料会作为可见上下文带入，直到运行开始才冻结。`, chips: [suggestion.target, "建议快照"] });
      this.setStage("session");
    }

    submit() {
      const prompt = this.query(".prompt-input");
      const value = prompt?.value.trim();
      if (!value || this.state.running) return;
      this.state.sessionTitle = value.length > 36 ? `${value.slice(0, 36)}…` : value;
      this.state.thread.push({ type: "user", title: "你的指令", time: "现在", quote: this.state.context.source, body: value });
      this.state.running = true;
      this.state.runReady = false;
      prompt.value = "";
      this.emit("peak:intelligence-submit", { prompt: value, context: { ...this.state.context, ids: [...this.state.contextIds] }, capability: this.state.selectedCapability });
      this.emit("peak:intelligence-run-state", { status: "running", changes: this.state.changes.map((item) => ({ ...item })) });
      this.render();
      clearTimeout(this.runTimer);
      this.runTimer = window.setTimeout(() => {
        this.state.running = false;
        this.state.runReady = true;
        this.state.thread.push({ type: "assistant", title: "Copilot", time: "现在", body: "本轮已经形成可追溯产物。改动回到正文原位审阅，洞察、来源与过程保留在同一次运行中。", run: true });
        this.emit("peak:intelligence-run-state", { status: "ready", changes: this.state.changes.map((item) => ({ ...item })) });
        this.render();
        requestAnimationFrame(() => { const content = this.query(".sidecar-content"); if (content) content.scrollTop = content.scrollHeight; });
      }, 760);
    }

    startReview(index = this.state.activeChangeIndex) {
      this.state.activeChangeIndex = Math.max(0, Math.min(index, this.state.changes.length - 1));
      this.state.reviewEditing = false;
      this.setStage("review", { focusComposer: false });
    }

    emitReviewLocation() {
      const change = this.activeChange();
      if (change) this.emit("peak:intelligence-review-location", { change: { ...change }, index: this.state.activeChangeIndex, total: this.state.changes.length });
    }

    moveReview(delta) {
      const total = this.state.changes.length;
      this.state.activeChangeIndex = (this.state.activeChangeIndex + delta + total) % total;
      this.state.reviewEditing = false;
      this.renderReview();
      this.emitReviewLocation();
    }

    canResolveReview(action, changes) {
      if (action === "reject") return true;
      return this.root.dispatchEvent(new CustomEvent("peak:intelligence-before-review-action", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { action, changes: changes.map((item) => ({ ...item })) },
      }));
    }

    recordAcceptedChanges(changes) {
      const today = this.state.history[0];
      if (!today) return;
      changes.forEach((change) => {
        const historyId = `accepted-${change.id}`;
        if (this.findHistory(historyId)) return;
        change.historyId = historyId;
        today.entries.unshift({
          id: historyId,
          title: change.title,
          target: `${change.target} · ${change.scope}`,
          time: "现在",
          delta: "+1 −1",
          origin: "ai",
          originLabel: "AI 辅助 · 已接受",
          groupId: "copilot-run-current",
          groupLabel: "本轮 Copilot 写入",
          before: change.before,
          after: change.after,
        });
      });
    }

    recordDocumentTransaction(transaction) {
      if (!transaction?.id || this.findHistory(transaction.id)) return;
      const today = this.state.history[0];
      if (!today) return;
      today.entries.unshift({
        id: transaction.id,
        title: transaction.title || "文档编辑",
        target: transaction.target || "当前文档",
        time: transaction.time || "现在",
        delta: transaction.delta || "+1 −1",
        origin: transaction.origin || "user",
        originLabel: transaction.originLabel || "你直接编辑",
        groupId: transaction.groupId || null,
        groupLabel: transaction.groupLabel || null,
        before: transaction.before || "",
        after: transaction.after || "",
      });
      this.renderShell();
      if (this.state.mode === "history") this.renderHistory();
    }

    resolveReview(action) {
      if (action === "accept-all") {
        const accepted = this.state.changes.filter((change) => change.status === "pending");
        if (!this.canResolveReview(action, accepted)) return this.notify("无法安全写入", "正文已变化，请重新运行或刷新候选");
        accepted.forEach((change) => { change.status = "accepted"; });
        this.recordAcceptedChanges(accepted);
        this.emit("peak:intelligence-review-action", { action, changes: accepted.map((item) => ({ ...item })) });
        this.render();
        return;
      }
      const change = this.activeChange();
      if (!change) return;
      if (!this.canResolveReview(action, [change])) return this.notify("无法安全写入", "目标文字与运行快照不一致");
      change.status = action === "reject" ? "rejected" : "accepted";
      this.state.reviewEditing = false;
      if (change.status === "accepted") this.recordAcceptedChanges([change]);
      this.emit("peak:intelligence-review-action", { action, change: { ...change }, index: this.state.activeChangeIndex });
      const next = this.state.changes.findIndex((item, index) => index > this.state.activeChangeIndex && item.status === "pending");
      if (next >= 0) this.state.activeChangeIndex = next;
      this.render();
      this.emitReviewLocation();
    }

    findHistory(id) {
      for (const group of this.state.history) {
        const entry = group.entries.find((item) => item.id === id);
        if (entry) return entry;
      }
      return null;
    }

    restoreFocus(trigger) {
      if (!trigger?.isConnected) return;
      requestAnimationFrame(() => trigger.focus?.({ preventScroll: true }));
    }

    closeCapabilities(options = {}) {
      const trigger = this.capabilityTrigger;
      this.query(".capability-dialog")?.close();
      this.capabilityTrigger = null;
      if (options.restoreFocus !== false) this.restoreFocus(trigger);
    }

    closeHistory(options = {}) {
      const trigger = this.historyTrigger;
      this.query(".history-dialog")?.close();
      this.historyTrigger = null;
      if (options.restoreFocus !== false) this.restoreFocus(trigger);
      return trigger;
    }

    openHistory(id) {
      const entry = this.findHistory(id);
      if (!entry) return;
      this.state.historySelection = id;
      this.historyTrigger = document.activeElement;
      const shell = this.query(".history-dialog-shell");
      shell.innerHTML = `<header><span><strong id="history-dialog-title">${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.originLabel)} · ${escapeHtml(entry.time)}</small></span><button class="icon-button" type="button" data-close-history aria-label="关闭">${icon("x")}</button></header><div class="history-dialog-body"><div class="history-range"><span>${escapeHtml(entry.target)}</span><span>${escapeHtml(entry.delta)}</span></div><div class="inline-diff"><del>${escapeHtml(entry.before)}</del> <ins>${escapeHtml(entry.after)}</ins></div></div><footer class="history-dialog-footer"><small>正在检查这笔事务是否有安全快照。</small><div><button type="button" data-locate-history>${icon("locate")}定位正文</button><button class="rollback" type="button" data-rollback-history disabled aria-disabled="true" title="正在检查安全快照">${icon("undo")}回滚</button></div></footer>`;
      this.query(".history-dialog")?.showModal();
    }

    handleClick(event) {
      if (event.target === this.query(".capability-dialog")) return this.closeCapabilities();
      if (event.target === this.query(".history-dialog")) return this.closeHistory();
      if (event.target === this.query(".graph-dialog")) return this.closeGraph();
      const button = event.target.closest("button, summary");
      if (!button || !this.root.contains(button)) return;
      if (button.matches("summary")) return;
      if (this.graph?.handleButton(button, this.root)) return;
      if (button.dataset.mode) { event.preventDefault(); return this.setMode(button.dataset.mode); }
      if (button.dataset.panelClose !== undefined || button.dataset.intelligenceClose !== undefined) return this.setOpen(false);
      if (button.dataset.startSession !== undefined) return this.setStage("session");
      if (button.dataset.backBrief !== undefined) return this.setStage("brief", { focusComposer: false });
      if (button.dataset.stageLink) return this.setStage(button.dataset.stageLink, { focusComposer: false });
      if (button.dataset.discussSuggestion) return this.beginSuggestion(button.dataset.discussSuggestion);
      if (button.dataset.deferSuggestion) {
        const index = this.state.suggestions.findIndex((item) => item.id === button.dataset.deferSuggestion);
        if (index >= 0) this.state.suggestions.push(this.state.suggestions.splice(index, 1)[0]);
        this.render();
        return this.notify("已移到建议列表后面");
      }
      if (button.dataset.ignoreSuggestion) {
        const suggestion = this.state.suggestions.find((item) => item.id === button.dataset.ignoreSuggestion);
        if (suggestion) suggestion.status = "ignored";
        this.render();
        return this.notify("本轮已忽略", "下次更新建议时可以恢复");
      }
      if (button.dataset.expand) { this.state.expanded[button.dataset.expand] = !this.state.expanded[button.dataset.expand]; return this.render(); }
      if (button.dataset.refreshBrief !== undefined) {
        this.state.refreshRevision += 1;
        this.state.refreshTime = "刚刚";
        this.state.suggestions.forEach((item) => { if (item.status === "ignored") item.status = "active"; });
        this.state.suggestions.unshift(this.state.suggestions.pop());
        this.render();
        return this.notify("建议已原地重排", "没有追加到对话");
      }
      if (button.dataset.sensingMode) {
        this.state.sensingMode = button.dataset.sensingMode;
        button.closest("details")?.removeAttribute("open");
        this.render();
        const notices = {
          off: ["已切换为仅手动", "只有点击“更新建议”时才检查"],
          smart: ["已切换为停笔后更新", "切换文件或停止编辑后检查"],
          continuous: ["已切换为编辑时更新", "编辑期间会定期检查，消耗更多 token"],
        };
        return this.notify(...notices[this.state.sensingMode]);
      }
      if (button.dataset.toggleAutoRun !== undefined) { this.state.autoRun = !this.state.autoRun; button.closest("details")?.removeAttribute("open"); this.render(); return this.notify(this.state.autoRun ? "已允许自动准备待审改动" : "现在只显示建议", this.state.autoRun ? "候选仍需审阅，不会直接写入正文" : "由你决定是否讨论或运行"); }
      if (button.dataset.useThought) {
        const thought = this.state.thoughts.find((item) => item.id === button.dataset.useThought);
        this.state.thread.push({ type: "user", title: "你的指令", time: "现在", body: `整理想法：${thought?.title || "未安放想法"}` });
        return this.setStage("session");
      }
      if (button.dataset.openMaterials) return this.openGraph(button.dataset.openMaterials, button);
      if (button.dataset.openGraph !== undefined) return this.openGraph("graph", button);
      if (button.dataset.closeGraph !== undefined) return this.closeGraph();
      if (button.dataset.viewSource) return this.openSource(button.dataset.viewSource);
      if (button.dataset.useSource) {
        const source = this.state.sources.find((item) => item.id === button.dataset.useSource);
        const contextId = source ? `source:${source.id}` : "knowledge";
        if (!this.state.contextIds.includes(contextId)) this.state.contextIds.push(contextId);
        this.renderComposer();
        this.notify("材料已带入下一轮", source?.title || "Vault 文档");
        return;
      }
      if (button.dataset.capability) { this.state.selectedCapability = button.dataset.capability; this.renderComposer(); return this.query(".prompt-input")?.focus(); }
      if (button.dataset.openCapabilities !== undefined) return this.openCapabilities("capability");
      if (button.dataset.addContext !== undefined) return this.openCapabilities("context");
      if (button.dataset.closeCapabilities !== undefined) return this.closeCapabilities();
      if (button.dataset.pickerCapability) { this.state.selectedCapability = button.dataset.pickerCapability; this.closeCapabilities({ restoreFocus: false }); this.renderComposer(); return this.query(".prompt-input")?.focus(); }
      if (button.dataset.contextOption) { if (!this.state.contextIds.includes(button.dataset.contextOption)) this.state.contextIds.push(button.dataset.contextOption); this.closeCapabilities({ restoreFocus: false }); this.renderComposer(); return this.query(".prompt-input")?.focus(); }
      if (button.dataset.removeContext) { this.state.contextIds = this.state.contextIds.filter((id) => id !== button.dataset.removeContext); return this.renderComposer(); }
      if (button.dataset.removeCapability !== undefined) { this.state.selectedCapability = null; return this.renderComposer(); }
      if (button.dataset.send !== undefined) return this.submit();
      if (button.dataset.modelInfo !== undefined) return this.notify("自动模型", "会按能力、上下文规模与成本自动路由；此 mock 不切换真实模型");
      if (button.dataset.voice !== undefined) {
        clearTimeout(this.voiceTimer);
        this.state.voiceActive = !this.state.voiceActive;
        button.classList.toggle("is-listening", this.state.voiceActive);
        if (!this.state.voiceActive) return;
        this.notify("正在听写", "语音只会写入草稿");
        this.voiceTimer = window.setTimeout(() => {
          this.state.voiceActive = false;
          button.classList.remove("is-listening");
          const prompt = this.query(".prompt-input");
          if (prompt) prompt.value = "把这组修改按风险从高到低排列";
          this.updatePromptState();
          prompt?.focus();
        }, 1000);
        return;
      }
      if (button.dataset.runTab) { this.state.runTab = button.dataset.runTab; this.state.runExpanded = true; return this.renderSession(); }
      if (button.dataset.runToggle !== undefined) { this.state.runExpanded = !this.state.runExpanded; return this.renderSession(); }
      if (button.dataset.runItem) { this.state.runOpenItem = this.state.runOpenItem === button.dataset.runItem ? null : button.dataset.runItem; return this.renderSession(); }
      if (button.dataset.startReview !== undefined) return this.startReview();
      if (button.dataset.locateChange) { const index = this.state.changes.findIndex((item) => item.id === button.dataset.locateChange); return this.startReview(index); }
      if (button.dataset.reviewNav) return this.moveReview(button.dataset.reviewNav === "previous" ? -1 : 1);
      if (button.dataset.changeIndex !== undefined) { this.state.activeChangeIndex = Number(button.dataset.changeIndex); this.state.reviewEditing = false; this.renderReview(); return this.emitReviewLocation(); }
      if (button.dataset.reviewAction === "edit-accept") {
        this.state.reviewEditing = true;
        this.renderReview();
        return requestAnimationFrame(() => this.query(".review-edit-input")?.focus({ preventScroll: true }));
      }
      if (button.dataset.reviewEditSave !== undefined) {
        const value = this.query(".review-edit-input")?.value.trim();
        if (!value) return this.notify("候选不能为空");
        const change = this.activeChange();
        if (change) change.after = value;
        this.state.reviewEditing = false;
        return this.resolveReview("accept");
      }
      if (button.dataset.reviewEditCancel !== undefined) { this.state.reviewEditing = false; return this.renderReview(); }
      if (button.dataset.reviewAction) return this.resolveReview(button.dataset.reviewAction);
      if (button.dataset.stopRun !== undefined) { this.state.running = false; clearTimeout(this.runTimer); this.render(); return this.notify("本轮运行已停止"); }
      if (button.dataset.redirectRun !== undefined) { const prompt = this.query(".prompt-input"); if (prompt) prompt.value = "先处理风险最高的改动"; return this.updatePromptState(); }
      if (button.dataset.historyGroupToggle) return this.toggleHistoryGroup(button.dataset.historyGroupToggle);
      if (button.dataset.historyId) return this.openHistory(button.dataset.historyId);
      if (button.dataset.closeHistory !== undefined) return this.closeHistory();
      if (button.dataset.locateHistory !== undefined) { const entry = this.findHistory(this.state.historySelection); this.closeHistory({ restoreFocus: false }); this.emit("peak:intelligence-history-locate", { entry }); return; }
      if (button.dataset.rollbackHistory !== undefined) {
        const entry = this.findHistory(this.state.historySelection);
        const trigger = this.closeHistory({ restoreFocus: false });
        const completed = this.emit("peak:intelligence-history-rollback", { entry }, { cancelable: true });
        if (!completed) {
          this.restoreFocus(trigger);
          return this.notify("无法安全回滚", "当前正文已变化，或这笔记录没有可用快照");
        }
        return this.notify("已完成安全回滚", entry?.title || "History 事务");
      }
      if (button.dataset.useInsight) { this.setStage("session"); const prompt = this.query(".prompt-input"); if (prompt) prompt.value = button.dataset.asChange !== undefined ? "把这条洞察生成可审阅修改" : "继续解释这条洞察"; return this.updatePromptState(); }
    }

    handleInput(event) {
      if (event.target.matches("[data-capability-search]")) return this.renderCapabilityResults(event.target.value);
      if (event.target.matches(".prompt-input")) this.updatePromptState();
    }

    handleKeydown(event) {
      const sourceRow = event.target.closest("[data-result-source]");
      if (sourceRow && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const rows = this.queryAll("[data-result-source]").filter((row) => row.offsetParent !== null);
        const currentIndex = rows.indexOf(sourceRow);
        if (currentIndex < 0 || rows.length === 0) return;
        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = rows.length - 1;
        if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
        if (event.key === "ArrowDown") nextIndex = Math.min(rows.length - 1, currentIndex + 1);
        rows[nextIndex].click();
        return;
      }

      const folderToggle = event.target.closest("[data-folder-toggle]");
      if (folderToggle && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        const expanded = folderToggle.getAttribute("aria-expanded") === "true";
        if ((event.key === "ArrowLeft" && expanded) || (event.key === "ArrowRight" && !expanded)) {
          event.preventDefault();
          folderToggle.click();
        }
        return;
      }

      const graphTab = event.target.closest("[data-result-view], [data-graph-preset]");
      if (graphTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const selector = graphTab.dataset.resultView ? "[data-result-view]" : "[data-graph-preset]";
        const tabs = this.queryAll(selector);
        const currentIndex = tabs.indexOf(graphTab);
        if (currentIndex < 0) return;
        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        const next = tabs[nextIndex];
        this.graph?.handleButton(next, this.root);
        return;
      }

      const tab = event.target.closest("[data-mode]");
      if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const tabs = this.queryAll("[data-mode]");
        const index = tabs.indexOf(tab);
        let next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
        return this.setMode(tabs[next].dataset.mode, { focus: true });
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && event.target.matches(".prompt-input")) { event.preventDefault(); this.submit(); }
    }

    handleChange(event) {
      if (this.graph?.handleChange(event.target)) return;
    }

    destroy() {
      clearTimeout(this.runTimer);
      clearTimeout(this.toastTimer);
      clearTimeout(this.voiceTimer);
      this.root.removeEventListener("click", this.onClick);
      this.root.removeEventListener("input", this.onInput);
      this.root.removeEventListener("keydown", this.onKeydown);
      this.root.removeEventListener("change", this.onChange);
      this.root.removeEventListener("pointerover", this.onPointerOver);
      this.root.removeEventListener("pointerout", this.onPointerOut);
      this.root.removeEventListener("dblclick", this.onDoubleClick);
      this.root.removeEventListener("wheel", this.onWheel);
      this.root.removeEventListener("pointerdown", this.onPointerDown);
      this.root.removeEventListener("pointermove", this.onPointerMove);
      this.root.removeEventListener("pointerup", this.onPointerUp);
      this.root.removeEventListener("pointercancel", this.onPointerUp);
      this.query(".graph-dialog")?.removeEventListener("cancel", this.onGraphCancel);
      this.query(".capability-dialog")?.removeEventListener("cancel", this.onCapabilityCancel);
      this.query(".history-dialog")?.removeEventListener("cancel", this.onHistoryCancel);
      this.root.replaceChildren();
      instances.delete(this.root);
    }
  }

  function mount(target, options = {}) {
    const root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) return null;
    const existing = instances.get(root);
    if (existing) return root;
    ensureIcons();
    root.className = "peak-intelligence-root intelligence-sidecar";
    root.dataset.peakIntelligence = "adaptive";
    root.dataset.intelligenceMounted = "true";
    root.dataset.intelligenceVersion = VERSION;
    root.setAttribute("aria-label", "Intelligence");
    root.innerHTML = SHELL;
    instances.set(root, new IntelligenceController(root, options));
    return root;
  }

  function controller(target) {
    const root = typeof target === "string" ? document.querySelector(target) : target?.matches?.("[data-intelligence-root]") ? target : target?.closest?.("[data-intelligence-root]");
    if (root) return instances.get(root) || null;
    const fallback = document.querySelector("[data-intelligence-root]");
    return fallback ? instances.get(fallback) || null : null;
  }

  function mountAll() { document.querySelectorAll("[data-intelligence-root]").forEach((root) => mount(root)); }
  function setOpen(open, target, options) { controller(target)?.setOpen(open, options); }
  function setMode(mode, target, options) { controller(target)?.setMode(mode, options); }
  function setStage(stage, target, options) { controller(target)?.setStage(stage, options); }
  function updateContext(payload, target) { controller(target)?.updateContext(payload); }
  function notify(title, detail, target) { controller(target)?.notify(title, detail); }

  window.PeakIntelligencePanel = Object.freeze({ version: VERSION, mount, mountAll, controller, setOpen, setMode, setStage, updateContext, notify });
  mountAll();
})();
