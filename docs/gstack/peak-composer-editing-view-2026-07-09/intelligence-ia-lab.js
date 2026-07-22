(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = (name) => `<svg aria-hidden="true"><use href="#ia-${name}"></use></svg>`;
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const params = new URLSearchParams(window.location.search);
  const legacyView = params.get("view");
  const requestedStage = params.get("stage")
    || (legacyView === "conversation" ? "session" : legacyView === "workbench" ? "brief" : "brief");

  const SUGGESTIONS = [
    {
      id: "counterpoint",
      title: "补一个反方比较",
      body: "当前判断只有正向论证，补清哪些场景不适合直接回写正文。",
      reason: "当前段缺少适用边界",
      target: "AI 旁路段落",
      capability: "review-article",
    },
    {
      id: "evidence-loop",
      title: "给核心判断找支撑材料",
      body: "沿当前链接和最近编辑找到可追溯依据，避免结论只依赖表述。",
      reason: "命中 [[知识库]] 与 3 条近期材料",
      target: "知识库结构段落",
      capability: "add-evidence",
    },
    {
      id: "split-idea",
      title: "安放 2 条散落想法",
      body: "先建议放到对应段落，不直接写入正文。",
      reason: "本次会话存在 2 个未安放判断",
      target: "知识结构列表",
      capability: "suggest-split",
    },
    {
      id: "link-opportunity",
      title: "补上结果回写的知识闭环",
      body: "把正文事务、来源和回滚记录之间的关系说清楚。",
      reason: "跨 4 个相关主题重复出现",
      target: "AI 旁路段落",
      capability: "suggest-links-graph",
    },
    {
      id: "terminology",
      title: "统一“工作台 / 编辑面”术语",
      body: "避免同一文档中工作台、sidecar、编辑现场指向不同概念。",
      reason: "检测到 3 组近义表达",
      target: "Composer 定位段落",
      capability: "correct-content",
    },
    {
      id: "task-check",
      title: "检查可验证动作是否完整",
      body: "确认定位、接受、拒绝与回滚都有明确结果。",
      reason: "当前段落包含流程性承诺",
      target: "小节结论",
      capability: "check-task-list",
    },
  ];

  const RELATED_SOURCE_FIXTURES = [
    ["editor-transaction", "编辑器事务模型.md", "Projects/Peak/Composer/编辑器事务模型.md", "解释接受、拒绝与回滚如何形成一次正文事务"],
    ["ai-writeback-audit", "AI 写回审计.md", "Projects/Peak/Composer/AI 写回审计.md", "记录候选内容从生成到接受写入的边界"],
    ["block-identity", "Block identity.md", "Projects/Peak/Composer/Block identity.md", "说明修改结果如何稳定定位到原生正文对象"],
    ["composer-review-flow", "Composer review flow.md", "Projects/Peak/Composer/Composer review flow.md", "覆盖逐项审阅与 previous / next change 导航"],
    ["markdown-roundtrip", "Markdown roundtrip.md", "Projects/Peak/Composer/Markdown roundtrip.md", "验证编辑结果能回到源 Markdown 而不丢失结构"],
    ["inline-diff", "Inline diff 交互.md", "Projects/Peak/Composer/Inline diff 交互.md", "比较原位 diff 与上下 before / after 的适用场景"],
    ["history-rollback", "History rollback.md", "Projects/Peak/Composer/History rollback.md", "定义接受写入后的定位、查看与安全回滚"],
    ["editor-ownership", "Editor ownership.md", "Projects/Peak/Composer/Editor ownership.md", "强调正文最终所有权仍属于作者"],
    ["review-queue", "Review queue.md", "Projects/Peak/Composer/Review queue.md", "描述大量候选改动的排序和分批审阅"],
    ["prompt-context", "Prompt context contract.md", "Projects/Peak/Intelligence/Prompt context contract.md", "区分自动上下文、显式来源和冻结快照"],
    ["sidecar-design", "智能侧栏设计.md", "Projects/Peak/Intelligence/智能侧栏设计.md", "记录贴近正文的 sidecar 信息架构"],
    ["ambient-handbook", "Ambient Push handbook.md", "Projects/Peak/Intelligence/Ambient Push handbook.md", "说明主动建议如何原位更新而不污染对话"],
    ["current-work-state", "Current Work State.md", "Projects/Peak/Intelligence/Current Work State.md", "保存当前工作判断及其可追溯信号"],
    ["run-envelope", "Capability Run Envelope.md", "Projects/Peak/Intelligence/Capability Run Envelope.md", "约束能力、上下文与执行回执属于同一轮运行"],
    ["action-receipts", "Agent action receipts.md", "Projects/Peak/Intelligence/Agent action receipts.md", "展示 agent choice、工具调用和结果回执"],
    ["source-provenance", "Source provenance.md", "Projects/Peak/Intelligence/Source provenance.md", "让洞察与修改都能回到具体来源"],
    ["suggest-links", "Suggest Links contract.md", "Projects/Peak/Capabilities/Suggest Links contract.md", "定义建议链接与图谱近邻的解释信息"],
    ["add-evidence", "Add Evidence contract.md", "Projects/Peak/Capabilities/Add Evidence contract.md", "描述如何检索、选择并带入证据"],
    ["result-subgraph", "Result subgraph notes.md", "Projects/Peak/Search/Result subgraph notes.md", "记录搜索结果到局部关系图的投影规则"],
    ["search-ranking", "Search ranking review.md", "Projects/Peak/Search/Search ranking review.md", "解释相关材料为什么排在当前顺序"],
    ["semantic-edge", "Semantic edge policy.md", "Projects/Peak/Search/Semantic edge policy.md", "区分显式引用和已索引语义关系"],
    ["folder-projection", "Folder projection.md", "Projects/Peak/Search/Folder projection.md", "从完整 Vault path 派生目录树"],
    ["retrieval-contract", "Knowledge retrieval.md", "Projects/Peak/Search/Knowledge retrieval.md", "约束检索结果、score 与 reason 的稳定字段"],
    ["pkm-output", "PKM 输出工作流.md", "B-2/信息聚合-PKM/PKM 输出工作流.md", "补充知识从收集、组织到重新输出的路径"],
    ["review-principles", "文档审阅原则.md", "B-2/信息聚合-PKM/文档审阅原则.md", "提供论证完整性与适用边界的检查清单"],
    ["evidence-conclusion", "证据与结论.md", "B-2/信息聚合-PKM/证据与结论.md", "说明结论如何绑定依据并保持可复查"],
    ["base-data-model", "Base data model.md", "B-2/信息聚合-PKM/Base data model.md", "比较结构化字段和正文叙述的协作方式"],
    ["canvas-editing", "Canvas editing notes.md", "B-2/信息聚合-PKM/Canvas editing notes.md", "记录非文本对象的编辑与审阅边界"],
    ["graph-semantics", "Graph relation semantics.md", "B-2/信息聚合-PKM/Graph relation semantics.md", "定义引用、语义和弱关联的视觉语法"],
    ["user-research", "Composer user research.md", "Research/Peak/Composer user research.md", "汇总作者对正文旁 AI 协作的反馈"],
    ["sidecar-interviews", "Intelligence sidecar interviews.md", "Research/Peak/Intelligence sidecar interviews.md", "记录用户如何理解建议、对话和审阅"],
    ["vault-search-study", "Vault Search usability study.md", "Research/Peak/Vault Search usability study.md", "验证列表、文件夹和图谱三种视图的认知模型"],
  ];

  const RELATED_MATERIALS_SNAPSHOT = window.PeakVaultResultFixtures.createRelatedMaterialsSnapshot();
  const SOURCES = RELATED_MATERIALS_SNAPSHOT.items.map((item) => ({ ...item }));

  const THOUGHTS = [
    { id: "thought-boundary", title: "原生对象也应保留增量过程", body: "建议放到 Composer architecture 的对象边界段。" },
    { id: "thought-review", title: "表格与公式 review 都用上下对比", body: "尚未确认是否应该成为所有非文本对象的统一规则。" },
    { id: "thought-history", title: "History 要按批次折叠多处改动", body: "可等 Review change set 合同确定后再写入。" },
    { id: "thought-context", title: "上下文冻结后仍允许用户查看来源", body: "需要区分查看 snapshot 和刷新下一轮上下文。" },
  ];

  const CAPABILITIES = [
    { id: "correct-content", group: "推荐给当前对象", title: "修正内容", en: "Correct Content", desc: "修正表达、逻辑和事实问题", badge: "AI" },
    { id: "add-evidence", group: "推荐给当前对象", title: "补上依据", en: "Add Evidence", desc: "寻找材料并把依据带入本轮", badge: "证" },
    { id: "suggest-links-graph", group: "推荐给当前对象", title: "图谱建议链接", en: "Suggest Links Graph", desc: "从知识图谱发现可解释连接", badge: "链" },
    { id: "review-article", group: "审阅与修正", title: "审阅文章", en: "Review Article", desc: "检查论证、结构、遗漏和风险", badge: "审" },
    { id: "polish-document", group: "审阅与修正", title: "润色文档", en: "Polish Document", desc: "保持原意，改善行文与节奏", badge: "润" },
    { id: "format-polish", group: "审阅与修正", title: "格式整理", en: "Format Polish", desc: "整理标题、列表与 Markdown 结构", badge: "格" },
    { id: "rewrite-selection", group: "写作", title: "重写选区", en: "Rewrite Selection", desc: "按指令重写当前选中文本", badge: "改", disabled: "当前没有文本选区" },
    { id: "continue-writing", group: "写作", title: "继续写作", en: "Continue Writing", desc: "沿当前段落继续生成内容", badge: "续" },
    { id: "writing-plan", group: "写作", title: "写作计划", en: "Writing Plan", desc: "先生成可调整的文章结构", badge: "纲" },
    { id: "write-article", group: "写作", title: "撰写文章", en: "Write Article", desc: "根据主题和材料生成草稿", badge: "写" },
    { id: "suggest-split", group: "结构与提取", title: "建议拆分", en: "Suggest Split", desc: "识别可独立成块或成文的部分", badge: "拆" },
    { id: "summarize", group: "结构与提取", title: "总结", en: "Summarize", desc: "生成可定位的摘要", badge: "总" },
    { id: "extract-concepts", group: "结构与提取", title: "提取概念", en: "Extract Concepts", desc: "提取核心概念及其关系", badge: "概" },
    { id: "suggest-tags", group: "知识连接", title: "建议标签", en: "Suggest Tags", desc: "根据内容和知识库建议标签", badge: "签" },
    { id: "suggest-links", group: "知识连接", title: "建议链接", en: "Suggest Links", desc: "发现适合加入正文的内部链接", badge: "链" },
    { id: "translate", group: "写作", title: "翻译", en: "Translate", desc: "按目标语言保留格式翻译", badge: "译", disabled: "请先选择目标语言" },
    { id: "check-task-list", group: "审阅与修正", title: "检查任务列表", en: "Check Task List", desc: "识别遗漏、阻塞与不一致", badge: "任" },
  ];

  const CONTEXT_OPTIONS = [
    { id: "current-block", title: "当前块 · AI 旁路段落", desc: "正文当前定位对象", badge: "块" },
    { id: "adjacent", title: "邻近 2 段", desc: "当前块前后各一段", badge: "邻" },
    { id: "knowledge", title: "知识库.md", desc: "显式 Vault 文档引用", badge: "文" },
    { id: "graph", title: "链接图谱 · 2 hop", desc: "当前对象的近邻图谱", badge: "图" },
    { id: "selection", title: "使用选中文本", desc: "当前没有选区", badge: "选", disabled: "当前没有文本选区" },
  ];

  const INITIAL_THREAD = [
    {
      type: "system",
      title: "自动上下文已就绪",
      time: "14:19",
      body: "已读取当前块、邻近 2 段与 [[知识库]]。正文位置变化时，这条状态会原位更新。",
      chips: ["当前块", "邻近 2 段", "[[知识库]]"],
    },
    {
      type: "user",
      title: "你的指令",
      time: "14:20",
      quote: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。",
      body: "这段判断有点跳，补清为什么 AI 结果必须回到正文。",
    },
    {
      type: "assistant",
      title: "Copilot",
      time: "14:20",
      body: "关键不是 AI 能不能生成，而是候选是否回到原对象接受审阅。只有用户接受后，改变才成为可定位、可回滚的正文事务。",
      chips: ["当前块", "知识库.md"],
      action: "修正内容",
    },
    {
      type: "system",
      title: "已带入建议 · 上一轮",
      time: "14:21",
      body: "“补清来源关系”只装配了能力和材料，尚未改动正文。",
      chips: ["补上依据", "图谱建议链接"],
    },
    {
      type: "assistant",
      title: "Copilot",
      time: "昨天 18:42",
      body: "上一轮围绕知识结构整理出 3 处改动和 2 条洞察。你已经完成审阅，仍可回来看哪些接受、拒绝或调整后接受。",
      runId: "run-reviewed",
      showInsight: true,
    },
  ];

  const CHANGES = [
    {
      id: "chg-01",
      blockId: "ai-sidecar",
      target: "AI 旁路段落",
      title: "补清结果为什么必须回到正文",
      reason: "当前段只说“回到原位”，没有解释审阅、所有权与回滚之间的判断链。",
      capability: "修正内容",
      scope: "Paragraph · 2 行",
      before: "把候选修改放回正文原位，并在接受前保持可回滚。",
      after: "把候选修改放回正文原位，让用户在真实上下文中逐项审阅；只有接受后才写入，并始终保留回滚路径。",
      previewHtml: '<p class="doc-inline-diff">AI 应该贴在当前块旁边：知道当前块的源范围与 Markdown 语法，自动参考 <span class="vault-link" contenteditable="false">[[知识库]]</span>，<del>把候选修改放回正文原位，并在接受前保持可回滚。</del><ins>把候选修改放回正文原位，让用户在真实上下文中逐项审阅；只有接受后才写入，并始终保留回滚路径。</ins></p>',
      afterHtml: '<p>AI 应该贴在当前块旁边：知道当前块的源范围与 Markdown 语法，自动参考 <span class="vault-link" contenteditable="false">[[知识库]]</span>，把候选修改放回正文原位，让用户在真实上下文中逐项审阅；只有接受后才写入，并始终保留回滚路径。</p>',
    },
    {
      id: "chg-02",
      blockId: "structure",
      target: "知识库结构段落",
      title: "补一个反方边界",
      reason: "当前论证只陈述结构多样性，缺少“不该叠加”的判断条件。",
      capability: "审阅文章",
      scope: "Paragraph · 1 行",
      before: "真正重要的是内容之后还能被找到、组合并重新输出。",
      after: "真正重要的是内容之后还能被找到、组合并重新输出；如果结构只增加维护成本，就不应为了完整而叠加。",
      previewHtml: '<p class="doc-inline-diff">知识库的结构应由要存储、重组和输出的知识决定。碎片化思想适合网络结构，系统课程适合树形结构；<del>真正重要的是内容之后还能被找到、组合并重新输出。</del><ins>真正重要的是内容之后还能被找到、组合并重新输出；如果结构只增加维护成本，就不应为了完整而叠加。</ins></p>',
      afterHtml: '<p>知识库的结构应由要存储、重组和输出的知识决定。碎片化思想适合网络结构，系统课程适合树形结构；真正重要的是内容之后还能被找到、组合并重新输出；如果结构只增加维护成本，就不应为了完整而叠加。</p>',
    },
    {
      id: "chg-03",
      blockId: "positioning",
      target: "Composer 定位段落",
      title: "把“工作台”改成具体任务表述",
      reason: "工作台是容器词，不能准确说明 Composer 与原生文档对象的关系。",
      capability: "修正内容",
      scope: "Paragraph · 1 行",
      before: "变成更顺手的工作台",
      after: "变成可直接审阅与回写的编辑面",
      previewHtml: '<p class="doc-inline-diff">这个 Composer 视图把 Markdown <del>变成更顺手的工作台</del><ins>变成可直接审阅与回写的编辑面</ins>，同时保留源文件、链接与原生对象。图片、表格、公式、Base、Canvas 与 Excalidraw 都能在正文中继续编辑。</p>',
      afterHtml: '<p>这个 Composer 视图把 Markdown 变成可直接审阅与回写的编辑面，同时保留源文件、链接与原生对象。图片、表格、公式、Base、Canvas 与 Excalidraw 都能在正文中继续编辑。</p>',
    },
    {
      id: "chg-04",
      blockId: "title",
      target: "文档标题",
      title: "让标题覆盖组织阶段",
      reason: "正文重点不只是获取与输出，还包含结构化组织。",
      capability: "润色文档",
      scope: "Heading 1 · 1 行",
      before: "从信息获取到输出",
      after: "从收集、组织到输出",
      previewHtml: '<h1 class="doc-inline-diff">PKM 产品类别分析：<del>从信息获取到输出</del><ins>从收集、组织到输出</ins></h1>',
      afterHtml: '<h1>PKM 产品类别分析：从收集、组织到输出</h1>',
    },
    {
      id: "chg-05",
      blockId: "structure-heading",
      target: "章节标题",
      title: "压缩章节标题",
      reason: "标题可以直接表达判断，减少“不是……而是……”的解释负担。",
      capability: "润色文档",
      scope: "Heading 2 · 1 行",
      before: "知识库不是单一目录，而是多种结构叠加",
      after: "知识库由多种结构共同工作",
      previewHtml: '<h2 class="doc-inline-diff">1. <del>知识库不是单一目录，而是多种结构叠加</del><ins>知识库由多种结构共同工作</ins></h2>',
      afterHtml: '<h2>1. 知识库由多种结构共同工作</h2>',
    },
    {
      id: "chg-06",
      blockId: "structure-list",
      target: "知识结构列表",
      title: "补一条输出结构",
      reason: "列表覆盖网络、树形和跨库连接，但缺少直接面向交付物的输出组织。",
      capability: "建议拆分",
      scope: "List · 新增 1 项",
      before: "3 个结构类型",
      after: "增加“输出结构”",
      previewHtml: '<ul class="doc-inline-diff"><li><strong>网络结构：</strong>承接滑箱笔记、论文旁批与临时判断。</li><li><strong>树形结构：</strong>承接系统学习、书籍章节与项目文档。</li><li><strong>跨库链接：</strong>保留来源、引用和迁移差异。</li><li><ins><strong>输出结构：</strong>把可复用判断组织成文章、报告与决策记录。</ins></li></ul>',
      afterHtml: '<ul><li><strong>网络结构：</strong>承接滑箱笔记、论文旁批与临时判断。</li><li><strong>树形结构：</strong>承接系统学习、书籍章节与项目文档。</li><li><strong>跨库链接：</strong>保留来源、引用和迁移差异。</li><li><strong>输出结构：</strong>把可复用判断组织成文章、报告与决策记录。</li></ul>',
    },
    {
      id: "chg-07",
      blockId: "metadata",
      target: "Frontmatter metadata",
      title: "补充 reviewable 标签",
      reason: "这篇文档已经明确采用可审阅 AI 写入模式，可用标签表达。",
      capability: "建议标签",
      scope: "Frontmatter · 1 字段",
      before: "tags: pkm, composer, ai-assisted",
      after: "增加 reviewable-ai",
      previewHtml: '<span>created</span><strong>2023-10-15 21:45</strong><span>updated</span><strong>2026-07-18 14:32</strong><span>tags</span><strong><em>pkm</em><em>composer</em><em>ai-assisted</em><ins><em>reviewable-ai</em></ins></strong>',
      afterHtml: '<span>created</span><strong>2023-10-15 21:45</strong><span>updated</span><strong>2026-07-18 14:32</strong><span>tags</span><strong><em>pkm</em><em>composer</em><em>ai-assisted</em><em>reviewable-ai</em></strong>',
    },
    {
      id: "chg-08",
      blockId: "conclusion",
      target: "小节结论",
      title: "补上作者所有权",
      reason: "定位、判断和撤销之外，还需要明确最终文字属于谁。",
      capability: "继续写作",
      scope: "Paragraph · 1 行",
      before: "让每一次建议都能被定位、判断和撤销。",
      after: "让每一次建议都能被定位、判断和撤销，并让作者始终拥有最终文字。",
      previewHtml: '<p class="doc-inline-diff">因此，编辑器里的 AI 价值不在于生成更多文字，而在于<del>让每一次建议都能被定位、判断和撤销。</del><ins>让每一次建议都能被定位、判断和撤销，并让作者始终拥有最终文字。</ins></p>',
      afterHtml: '<p>因此，编辑器里的 AI 价值不在于生成更多文字，而在于让每一次建议都能被定位、判断和撤销，并让作者始终拥有最终文字。</p>',
    },
  ];

  const RUN_INSIGHTS = [
    {
      id: "insight-review-boundary",
      title: "结果回到正文不是展示偏好，而是审阅边界",
      body: "候选只有回到原对象，用户才能同时看到语义位置、来源和影响范围；离开正文的长答案无法形成可靠写入事务。",
      severity: "值得确认",
      sourceIds: ["knowledge-base", "composer-architecture"],
    },
    {
      id: "insight-frozen-context",
      title: "来源与上下文必须绑定同一次运行快照",
      body: "编辑光标可以继续移动，但已经生成的洞察和候选改动必须保留当时读取的范围，避免审阅对象悄悄漂移。",
      severity: "上下文风险",
      sourceIds: ["knowledge-review", "evidence-matrix"],
    },
  ];

  const RUN_TRACE = [
    { id: "trace-observe", kind: "observe", label: "读取当前对象", detail: "AI 旁路段落与邻近 2 段", status: "done", time: "14:20:01" },
    { id: "trace-freeze", kind: "system", label: "冻结本轮上下文", detail: "当前块、邻近段落、知识库.md", status: "done", time: "14:20:01" },
    { id: "trace-search", kind: "read", label: "检索相关材料", detail: "比较 37 项候选，保留 5 项强关联", status: "done", time: "14:20:02" },
    { id: "trace-insight", kind: "insight", label: "形成 2 条可追问洞察", detail: "审阅边界、冻结上下文", status: "done", time: "14:20:03" },
    { id: "trace-change", kind: "prepare", label: "准备 8 处候选改动", detail: "按正文出现顺序排列，没有自动写入", status: "done", time: "14:20:04" },
    { id: "trace-review", kind: "submit-review", label: "等待用户审阅", detail: "正文原位预览可接受、拒绝或编辑后接受", status: "done", time: "14:20:04" },
  ];

  const RUN_PROGRESS = [
    { label: "理解任务并冻结上下文", detail: "3 项上下文已固定" },
    { label: "读取当前块与邻近段落", detail: "定位 AI 旁路段落" },
    { label: "检索相关材料", detail: "找到 5 项来源" },
    { label: "归纳可追问洞察", detail: "形成 2 条判断" },
    { label: "生成正文候选", detail: "按正文出现顺序准备 8 处" },
  ];

  const RUN_FIXTURES = [
    {
      id: "run-current",
      title: "补清为什么 AI 结果必须回到正文",
      time: "14:20",
      executionStatus: "completed",
      reviewStatus: "pending-review",
      snapshot: "当前块 · 邻近 2 段 · 知识库.md",
      changes: CHANGES.map((change) => ({ ...change, status: "pending", decision: null })),
      insights: RUN_INSIGHTS.map((insight) => ({ ...insight })),
      sources: SOURCES.slice(0, 5).map((source) => ({ ...source })),
      trace: RUN_TRACE.map((step) => ({ ...step })),
    },
    {
      id: "run-reviewed",
      title: "统一知识结构章节",
      time: "昨天 18:42",
      executionStatus: "completed",
      reviewStatus: "reviewed",
      snapshot: "知识结构段落 · 章节标题 · 知识库.md",
      changes: [
        { ...CHANGES[4], status: "accepted", decision: "按建议接受", historyId: "hist-run-05" },
        { ...CHANGES[6], status: "rejected", decision: "拒绝：标签过早" },
        { ...CHANGES[7], status: "accepted", decision: "编辑后接受", historyId: "hist-run-08" },
      ],
      insights: RUN_INSIGHTS.map((insight) => ({ ...insight })),
      sources: SOURCES.slice(0, 3).map((source) => ({ ...source })),
      trace: RUN_TRACE.slice(0, 5).map((step) => ({ ...step, time: step.time.replace("14:20", "18:42") })),
    },
  ];

  const HISTORY = [
    {
      day: "今天",
      date: "2026-07-18",
      entries: [
        { id: "hist-01", title: "修正 AI 旁路段落", target: "AI 旁路段落 · Paragraph · 2 行", time: "15:04", delta: "+18 −8", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "AI 应该贴在当前块旁边，并把候选修改放回正文原位。", after: "AI 应该贴在当前块旁边，并把候选修改放回正文原位；只有用户接受后才成为正文事务。" },
        { id: "hist-02", title: "补上知识结构依据", target: "知识库结构段落 · Paragraph · 1 行", time: "14:47", delta: "+12 −0", origin: "mixed", originLabel: "AI 后调整", before: "真正重要的是内容之后还能被找到。", after: "真正重要的是内容之后还能被找到、组合并重新输出。" },
        { id: "hist-03", title: "调整章节标题", target: "章节标题 · Heading 2", time: "14:31", delta: "+4 −6", origin: "user", originLabel: "你直接编辑", before: "知识库的多种结构", after: "知识库不是单一目录，而是多种结构叠加" },
      ],
    },
    {
      day: "昨天",
      date: "2026-07-17",
      entries: [
        { id: "hist-run-08", title: "补上作者所有权", target: "小节结论 · Paragraph · 1 行", time: "18:45", delta: "+13 −0", origin: "mixed", originLabel: "AI 后调整", before: "让每一次建议都能被定位、判断和撤销。", after: "让每一次建议都能被定位、判断和撤销，并让作者始终拥有最终文字。", runId: "run-reviewed", changeId: "chg-08" },
        { id: "hist-run-05", title: "压缩章节标题", target: "章节标题 · Heading 2 · 1 行", time: "18:42", delta: "+8 −14", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "知识库不是单一目录，而是多种结构叠加", after: "知识库由多种结构共同工作", runId: "run-reviewed", changeId: "chg-05" },
        { id: "hist-04", title: "加入知识库链接", target: "AI 旁路段落 · Inline link", time: "18:42", delta: "+1 −0", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "自动参考知识库", after: "自动参考 [[知识库]]" },
        { id: "hist-05", title: "恢复一次标题修改", target: "文档标题 · Heading 1", time: "17:10", delta: "rollback", origin: "system", originLabel: "系统回滚", before: "PKM 的组织方法", after: "PKM 产品类别分析：从信息获取到输出" },
        { id: "hist-06", title: "压缩导语", target: "Composer 定位段落 · Paragraph", time: "16:26", delta: "+8 −19", origin: "mixed", originLabel: "AI 后调整", before: "这个视图希望让 Markdown 文件在编辑的时候有更加顺手的使用体验。", after: "这个 Composer 视图把 Markdown 变成更顺手的工作台。" },
      ],
    },
    {
      day: "7 月 15 日",
      date: "2026-07-15",
      entries: [
        { id: "hist-07", title: "建立 Frontmatter", target: "Frontmatter metadata", time: "21:45", delta: "+5 −0", origin: "user", originLabel: "你直接编辑", before: "无", after: "created / updated / tags" },
        { id: "hist-08", title: "补充跨库链接说明", target: "知识结构列表 · List item", time: "20:18", delta: "+11 −0", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "网络结构 / 树形结构", after: "增加跨库链接：保留来源、引用和迁移差异。" },
        { id: "hist-09", title: "格式整理", target: "全文 · Markdown", time: "19:52", delta: "+3 −3", origin: "ai", originLabel: "AI 辅助 · 已接受", before: "混合标题与列表缩进", after: "统一标题层级与列表缩进" },
      ],
    },
  ];

  const requestedVariant = params.get("variant");
  const fixtureHasActiveWork = params.get("fresh") !== "1";
  const state = {
    variant: ["adaptive", "staged", "hybrid"].includes(requestedVariant) ? requestedVariant : "adaptive",
    mode: params.get("mode") === "history" ? "history" : "copilot",
    stage: ["brief", "session", "review"].includes(requestedStage) ? requestedStage : "brief",
    panelOpen: true,
    suggestions: SUGGESTIONS.map((item) => ({ ...item, status: "active" })),
    sources: SOURCES.map((item) => ({ ...item })),
    thoughts: THOUGHTS.map((item) => ({ ...item })),
    expanded: { suggestions: false, sources: false, thoughts: false },
    graph: {
      selectedNodeId: "source:knowledge-base",
      selectedSourceId: "knowledge-base",
      resultView: "graph",
      density: "detailed",
      collapsedFolders: [],
      preset: "constellation",
      showSemantic: false,
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    thread: INITIAL_THREAD.map((event) => ({ ...event })),
    sessionTitle: "补清为什么 AI 结果必须回到正文",
    sessionStatus: fixtureHasActiveWork || requestedStage !== "brief" ? "active" : "idle",
    activeRunId: "run-current",
    runs: RUN_FIXTURES.map((run) => ({
      ...run,
      changes: run.changes.map((change) => ({ ...change })),
      insights: run.insights.map((insight) => ({ ...insight, sourceIds: [...insight.sourceIds] })),
      sources: run.sources.map((source) => ({ ...source })),
      trace: run.trace.map((step) => ({ ...step })),
    })),
    runInline: Object.fromEntries(RUN_FIXTURES.map((run) => [run.id, {
      tab: "changes",
      expanded: run.id === "run-current",
      openItem: null,
      showAll: { changes: false, insights: true, sources: false, trace: false },
    }])),
    runDialog: { runId: null, tab: "changes", selectedChangeId: null },
    runSequence: 0,
    runStep: -1,
    sessionClueQueuedId: null,
    sessionClueIds: ["evidence-loop", "split-idea", "link-opportunity"],
    clueUpdate: { id: "recommendation-current-context", time: "14:32", revision: 1 },
    sensingMode: "smart",
    autoRun: false,
    selectedCapability: null,
    contextIds: ["current-block", "adjacent", "knowledge"],
    pickerMode: "capability",
    voiceActive: false,
    running: false,
    review: {
      status: fixtureHasActiveWork || requestedStage === "review" ? "reviewing" : "idle",
      changes: CHANGES.map((change) => ({ ...change, status: "pending" })),
      activeIndex: Math.min(1, CHANGES.length - 1),
      activeChangeId: CHANGES[Math.min(1, CHANGES.length - 1)]?.id || null,
      viewMode: "current",
    },
    history: HISTORY.map((group) => ({ ...group, entries: group.entries.map((entry) => ({ ...entry })) })),
    historySelection: null,
    refreshTime: "14:32",
    refreshRevision: 1,
  };

  const dom = {
    app: $("#composer-app"),
    sidecar: $("#intelligence-panel"),
    content: $("#sidecar-content"),
    stageTabs: $("#stage-tabs"),
    dock: $("#session-dock"),
    prompt: $("#prompt-input"),
    promptShell: $("#prompt-input-shell"),
    promptContext: $("#prompt-context"),
    send: $("[data-send]"),
    sourceStatus: $("#source-status"),
    sourcePreview: $("#source-preview"),
    capabilityDialog: $("#capability-dialog"),
    capabilityTitle: $("#capability-title"),
    capabilitySearch: $("#capability-search"),
    capabilityResults: $("#capability-results"),
    historyDialog: $("#history-dialog"),
    historyDialogContent: $("#history-dialog-content"),
    graphDialog: $("#graph-dialog"),
    graphDialogContent: $("#graph-dialog-content"),
    runDialog: $("#run-dialog"),
    runDialogContent: $("#run-dialog-content"),
    liveChangeNav: $("#live-change-nav"),
    toast: $("#toast"),
    paper: $("#paper"),
  };

  const blocks = new Map();
  $$(".doc-block").forEach((block) => {
    blocks.set(block.dataset.blockId, {
      element: block,
      baseHtml: block.innerHTML,
      committedHtml: block.innerHTML,
    });
  });

  let toastTimer = 0;
  let voiceTimer = 0;
  let runTimer = 0;
  let runInterval = 0;
  let graphDialogTrigger = null;
  let runDialogTrigger = null;
  let pendingDocumentPinFocus = null;
  const graphSurface = window.PeakVaultResultBrowser.create({
    state: state.graph,
    escapeHtml,
    icon,
    snapshot: { ...RELATED_MATERIALS_SNAPSHOT, items: state.sources },
    getDialogRoot: () => dom.graphDialog,
    onOpenSource: (id) => showToast(`打开来源：${state.sources.find((source) => source.id === id)?.title || "Vault 文档"}`),
    onToast: showToast,
    onRender: () => {
      if (dom.graphDialog.open) renderGraphDialog();
      if (state.mode === "copilot" && state.stage === "brief") renderBrief();
    },
  });

  function syncUrl() {
    const next = new URL(window.location.href);
    next.searchParams.set("variant", state.variant);
    next.searchParams.set("mode", state.mode);
    if (state.mode === "copilot") {
      next.searchParams.set("stage", state.stage);
    } else {
      next.searchParams.delete("stage");
    }
    next.searchParams.delete("view");
    window.history.replaceState(null, "", next);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      dom.toast.hidden = true;
    }, 2200);
  }

  function totalHistory() {
    return state.history.reduce((sum, group) => sum + group.entries.length, 0);
  }

  function pendingChanges() {
    return state.review.changes.filter((change) => change.status === "pending");
  }

  function resolvedChanges() {
    return state.review.changes.filter((change) => change.status !== "pending");
  }

  function activeChange() {
    const change = state.review.changes[state.review.activeIndex] || null;
    state.review.activeChangeId = change?.id || null;
    return change;
  }

  function setActiveChangeIndex(index) {
    const count = state.review.changes.length;
    if (!count) return false;
    const nextIndex = ((Number(index) % count) + count) % count;
    state.review.activeIndex = nextIndex;
    state.review.activeChangeId = state.review.changes[nextIndex]?.id || null;
    return true;
  }

  function setReviewMode(mode, options = {}) {
    if (!["current", "all", "original"].includes(mode)) return;
    state.review.viewMode = mode;
    render();
    if (options.locate !== false && mode === "current") locateActiveChange(true);
    if (options.focus === false) return;
    const nextMode = $(`[data-review-mode="${mode}"]`, dom.liveChangeNav);
    nextMode?.focus({ preventScroll: true });
    if (document.activeElement !== nextMode) {
      window.requestAnimationFrame(() => nextMode?.focus({ preventScroll: true }));
    }
  }

  function selectDocumentChange(index, options = {}) {
    if (!setActiveChangeIndex(index)) return;
    if (options.reveal !== false && state.review.viewMode === "original") {
      state.review.viewMode = "current";
    }
    render();
    if (options.focus !== false) {
      const pin = $(`[data-document-change-index="${state.review.activeIndex}"]`, dom.paper);
      pin?.focus({ preventScroll: true });
      if (document.activeElement !== pin) {
        window.requestAnimationFrame(() => pin?.focus({ preventScroll: true }));
      }
    }
    locateActiveChange(options.smooth !== false);
  }

  function runById(id) {
    return state.runs.find((run) => run.id === id) || null;
  }

  function activeRun() {
    return runById(state.activeRunId);
  }

  function runCounts(run) {
    if (!run) return { changes: 0, insights: 0, sources: 0, trace: 0, pending: 0 };
    return {
      changes: run.changes.length,
      insights: run.insights.length,
      sources: run.sources.length,
      trace: run.trace.length,
      pending: run.changes.filter((change) => change.status === "pending").length,
    };
  }

  function inlineRunState(runId) {
    if (!state.runInline[runId]) {
      state.runInline[runId] = {
        tab: "changes",
        expanded: true,
        openItem: null,
        showAll: { changes: false, insights: true, sources: false, trace: false },
      };
    }
    return state.runInline[runId];
  }

  function showRunInline(runId, tab = "changes", options = {}) {
    const run = runById(runId);
    if (!run) return;
    const inline = inlineRunState(run.id);
    inline.tab = ["changes", "insights", "sources", "trace"].includes(tab) ? tab : "changes";
    inline.expanded = true;
    state.mode = "copilot";
    state.stage = "session";
    render();
    window.requestAnimationFrame(() => {
      const receipt = $(`.run-receipt[data-run-id="${run.id}"]`);
      receipt?.scrollIntoView({ behavior: options.smooth === false ? "auto" : "smooth", block: "nearest" });
      $(`[data-run-inline-tab="${inline.tab}"]`, receipt)?.focus({ preventScroll: true });
    });
  }

  function syncActiveRunReview() {
    const run = activeRun();
    if (!run) return;
    run.changes = state.review.changes.map((change) => ({ ...change }));
    const pending = pendingChanges().length;
    if (state.review.status === "generating") {
      run.executionStatus = "running";
      run.reviewStatus = "collecting";
      return;
    }
    run.executionStatus = "completed";
    run.reviewStatus = pending > 0
      ? resolvedChanges().length > 0 ? "partially-reviewed" : "pending-review"
      : "reviewed";
  }

  function capabilityById(id) {
    return CAPABILITIES.find((item) => item.id === id) || null;
  }

  function contextById(id) {
    const fixed = CONTEXT_OPTIONS.find((item) => item.id === id);
    if (fixed) return fixed;
    if (id?.startsWith("source:")) {
      const source = state.sources.find((item) => item.id === id.slice(7));
      if (!source) return null;
      return { id, title: `相关材料 · ${source.title}`, desc: source.reason, badge: "文" };
    }
    if (id?.startsWith("insight:")) {
      const insightId = id.slice(8);
      const insight = state.runs.flatMap((run) => run.insights).find((item) => item.id === insightId);
      if (!insight) return null;
      return { id, title: `本轮洞察 · ${insight.title}`, desc: insight.body, badge: "察" };
    }
    return null;
  }

  function setVariant(variant) {
    if (!["adaptive", "staged", "hybrid"].includes(variant)) return;
    state.variant = variant;
    render();
    const message = variant === "adaptive"
      ? "方案 A：状态随任务推进"
      : variant === "staged"
        ? "方案 B：阶段始终可见"
        : "方案 C：简洁内容 + 轻量队列导航";
    showToast(message);
  }

  function setMode(mode) {
    if (!["copilot", "history"].includes(mode)) return;
    state.mode = mode;
    render();
    window.requestAnimationFrame(() => dom.content.focus({ preventScroll: true }));
  }

  function setStage(stage, options = {}) {
    if (!["brief", "session", "review"].includes(stage)) return;
    if (stage === "review" && state.review.changes.length === 0) return;
    if (stage === "review" && state.variant === "hybrid" && state.review.status === "idle") return;
    state.mode = "copilot";
    state.stage = stage;
    if (stage === "session") state.sessionStatus = "active";
    if (stage === "review") {
      state.review.status = "reviewing";
      if (window.innerWidth <= 1180) state.panelOpen = false;
    }
    render();
    if (stage === "session" && options.focusComposer) {
      window.requestAnimationFrame(() => dom.prompt.focus({ preventScroll: true }));
    }
    if (stage === "review") {
      locateActiveChange(options.smooth !== false);
    }
  }

  function renderShell() {
    dom.app.classList.toggle("is-panel-open", state.panelOpen);
    dom.sidecar.dataset.variant = state.variant;
    dom.sidecar.dataset.stage = state.stage;
    $$('[data-variant]').forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.variant === state.variant));
    });
    $$('.primary-tabs [data-mode]').forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.mode === state.mode));
    });
    const hybridHasActiveWork = state.sessionStatus === "active" || state.review.status !== "idle";
    const hybridNavVisible = state.variant === "hybrid" && hybridHasActiveWork;
    const stageNavVisible = state.mode === "copilot" && (state.variant === "staged" || hybridNavVisible);
    dom.sidecar.dataset.stageNav = stageNavVisible ? "visible" : "hidden";
    dom.stageTabs.hidden = !stageNavVisible;

    const hybridLabels = {
      brief: ["建议", `+${state.refreshRevision + 6}`],
      session: ["进行中", state.sessionStatus === "active" ? "1" : "0"],
      review: ["待审", state.review.status === "idle" ? "0" : String(pendingChanges().length)],
    };
    const stagedLabels = {
      brief: ["建议", "94"],
      session: ["协作", "4"],
      review: ["审阅", String(state.review.changes.length)],
    };
    const stageLabels = state.variant === "hybrid" ? hybridLabels : stagedLabels;
    $$('.stage-tabs [data-stage]').forEach((button) => {
      const selected = button.dataset.stage === state.stage;
      const [label, count] = stageLabels[button.dataset.stage];
      $('[data-stage-label]', button).textContent = label;
      $('b', button).textContent = count;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      const countLabel = button.dataset.stage === "brief"
        ? `${count.replace("+", "")} 条新排序`
        : button.dataset.stage === "session"
          ? `${count} 个进行中任务`
          : `${count} 处待审改动`;
      button.setAttribute("aria-label", `${label}，${countLabel}`);
      button.disabled = button.dataset.stage === "review"
        && (state.review.changes.length === 0 || (state.variant === "hybrid" && state.review.status === "idle"));
    });
    const selectedStageTab = $(`.stage-tabs [data-stage="${state.stage}"]`);
    if (stageNavVisible && selectedStageTab) {
      dom.content.setAttribute("aria-labelledby", selectedStageTab.id);
    } else {
      dom.content.removeAttribute("aria-labelledby");
    }
    $("#history-count").textContent = totalHistory();
    dom.dock.hidden = !(state.mode === "copilot" && state.stage === "session");
    $('[data-panel-toggle]').setAttribute("aria-expanded", String(state.panelOpen));
  }

  function renderMaterialGraph() {
    return graphSurface.renderInline();
  }

  function renderGraphDialog() {
    dom.graphDialogContent.innerHTML = graphSurface.renderDialog();
  }

  function openGraphDialog(trigger, resultView = "graph") {
    graphDialogTrigger = trigger || document.activeElement;
    state.graph.resultView = ["list", "tree", "graph"].includes(resultView) ? resultView : "graph";
    renderGraphDialog();
    dom.graphDialog.showModal();
    window.requestAnimationFrame(() => {
      $('[data-close-graph]', dom.graphDialog)?.focus({ preventScroll: true });
    });
  }

  function closeGraphDialog(options = {}) {
    if (dom.graphDialog.open) dom.graphDialog.close();
    dom.graphDialogContent.replaceChildren();
    const originalTrigger = graphDialogTrigger;
    const triggerSelector = originalTrigger?.dataset.openMaterials
      ? `[data-open-materials="${originalTrigger.dataset.openMaterials}"]`
      : "[data-open-graph]";
    const restoreTriggerFocus = () => {
      const trigger = originalTrigger?.isConnected ? originalTrigger : $(triggerSelector);
      trigger?.focus?.({ preventScroll: true });
    };
    graphDialogTrigger = null;
    if (options.restoreFocus === false) return;
    restoreTriggerFocus();
    window.requestAnimationFrame(restoreTriggerFocus);
  }

  function runStatusLabel(run) {
    if (run.executionStatus === "running") return "正在运行";
    if (run.executionStatus === "cancelled") return "已停止";
    if (run.reviewStatus === "reviewed") return "已完成审阅";
    if (run.reviewStatus === "partially-reviewed") return "审阅进行中";
    if (run.reviewStatus === "pending-review") return "等待审阅";
    return "运行完成";
  }

  function changeStatusLabel(change) {
    if (change.status === "accepted") return change.decision || "已接受";
    if (change.status === "rejected") return change.decision || "已拒绝";
    if (change.status === "stale") return "正文已变化";
    return "待审阅";
  }

  function renderRunChanges(run) {
    const selected = run.changes.find((change) => change.id === state.runDialog.selectedChangeId) || run.changes[0] || null;
    const list = run.changes.map((change, index) => `
      <button class="run-change-row${selected?.id === change.id ? " is-active" : ""}" type="button" data-run-change="${change.id}" data-status="${change.status}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span><strong>${escapeHtml(change.title)}</strong><small>${escapeHtml(change.target)} · ${escapeHtml(change.scope)}</small></span>
        <em>${escapeHtml(changeStatusLabel(change))}</em>
      </button>
    `).join("");
    const accepted = run.changes.filter((change) => change.status === "accepted").length;
    const rejected = run.changes.filter((change) => change.status === "rejected").length;
    const pending = run.changes.filter((change) => change.status === "pending").length;
    const detail = selected ? `
      <article class="run-change-detail" data-status="${selected.status}" tabindex="-1">
        <header><span><small>${escapeHtml(selected.capability)}</small><strong>${escapeHtml(selected.title)}</strong></span><em>${escapeHtml(changeStatusLabel(selected))}</em></header>
        <p>${escapeHtml(selected.reason)}</p>
        <div class="run-detail-meta"><span>${escapeHtml(selected.target)}</span><span>${escapeHtml(selected.scope)}</span></div>
        <div class="inline-diff"><del>${escapeHtml(selected.before)}</del> <ins>${escapeHtml(selected.after)}</ins></div>
        <footer>
          <button type="button" data-locate-run-change="${selected.id}">${icon("locate")}${run.id === state.activeRunId ? "定位正文" : "定位当前版本"}</button>
          ${selected.historyId ? `<button type="button" data-history-id="${selected.historyId}">${icon("history")}查看写入事务</button>` : ""}
        </footer>
      </article>
    ` : `<div class="run-empty">本轮没有正文改动。</div>`;
    return `
      <div class="run-change-summary"><span>${run.reviewStatus === "reviewed" ? "审阅结果" : "候选改动"}</span><small>${accepted} 已接受 · ${rejected} 已拒绝 · ${pending} 待审阅</small>${pending && run.id === state.activeRunId ? `<button type="button" data-start-review>继续审阅 ${pending} 处</button>` : ""}</div>
      <div class="run-change-layout"><div class="run-change-list">${list}</div>${detail}</div>
    `;
  }

  function renderRunInsights(run) {
    if (!run.insights.length) return `<div class="run-empty">这轮没有发现需要单独处理的问题。</div>`;
    return `<div class="run-insight-list">${run.insights.map((insight, index) => `
      <article class="run-insight-row">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><small>${escapeHtml(insight.severity)}</small><strong>${escapeHtml(insight.title)}</strong><p>${escapeHtml(insight.body)}</p><em>依据 ${insight.sourceIds.length} 项本轮来源</em></div>
        <footer><button type="button" data-ask-insight="${insight.id}" data-run-id="${run.id}">追问</button><button type="button" data-propose-insight="${insight.id}" data-run-id="${run.id}">生成修改</button></footer>
      </article>
    `).join("")}</div>`;
  }

  function renderRunSources(run) {
    if (!run.sources.length) return `<div class="run-empty">本轮没有引用 Vault 来源。</div>`;
    return `
      <div class="run-source-toolbar"><span>本轮冻结的材料快照</span><button type="button" data-open-graph-from-run>${icon("network")}在 Vault Search 中查看</button></div>
      <div class="run-source-list">${run.sources.map((source) => `
        <article class="run-source-row">
          <div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.path)}</small><p>${escapeHtml(source.reason)}</p></div>
          <b>${source.score}%</b>
          <footer><button type="button" data-view-source="${source.id}">${icon("eye")}查看来源</button><button type="button" data-use-source="${source.id}">带入下一轮</button></footer>
        </article>
      `).join("")}</div>
    `;
  }

  function renderRunTrace(run) {
    if (!run.trace.length) return `<div class="run-empty">本轮没有可显示的运行事件。</div>`;
    return `
      <div class="run-trace-intro"><span>${icon("clock")}4 秒 · 1 轮 · ${run.trace.length} 个事件</span><small>本轮读取、生成与审阅状态</small></div>
      <ol class="run-trace-list">${run.trace.map((step) => `
        <li data-kind="${step.kind}" data-status="${step.status}">
          <time>${escapeHtml(step.time)}</time><i>✓</i><span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></span>
        </li>
      `).join("")}</ol>
    `;
  }

  function renderRunDialog() {
    const run = runById(state.runDialog.runId);
    if (!run) return;
    const counts = runCounts(run);
    const tabs = [
      ["changes", "改动", counts.changes],
      ["insights", "洞察", counts.insights],
      ["sources", "来源", counts.sources],
      ["trace", "运行记录", counts.trace],
    ];
    const body = state.runDialog.tab === "changes"
      ? renderRunChanges(run)
      : state.runDialog.tab === "insights"
        ? renderRunInsights(run)
        : state.runDialog.tab === "sources"
          ? renderRunSources(run)
          : renderRunTrace(run);
    dom.runDialogContent.innerHTML = `
      <header class="run-dialog-head">
        <span class="run-dialog-mark">${icon("spark")}</span>
        <span><strong id="run-dialog-title">${escapeHtml(run.title)}</strong><small>${escapeHtml(run.time)} · ${escapeHtml(runStatusLabel(run))}</small></span>
        <button class="icon-button" type="button" data-close-run aria-label="关闭运行详情">${icon("x")}</button>
      </header>
      <div class="run-snapshot"><span>本轮上下文</span><strong>${escapeHtml(run.snapshot)}</strong><small>4 秒 · 1 轮 · 已保存</small></div>
      <nav class="run-dialog-tabs" role="tablist" aria-label="本轮产物">
        ${tabs.map(([id, label, count]) => `<button type="button" role="tab" aria-selected="${state.runDialog.tab === id}" data-run-dialog-tab="${id}"><span>${label}</span><b>${count}</b></button>`).join("")}
      </nav>
      <section class="run-dialog-body" data-run-panel="${state.runDialog.tab}">${body}</section>
    `;
  }

  function openRunDialog(runId, tab = "changes", trigger = null) {
    const run = runById(runId);
    if (!run) return;
    runDialogTrigger = trigger || document.activeElement;
    state.runDialog.runId = run.id;
    state.runDialog.tab = ["changes", "insights", "sources", "trace"].includes(tab) ? tab : "changes";
    state.runDialog.selectedChangeId = run.changes[0]?.id || null;
    renderRunDialog();
    if (!dom.runDialog.open) dom.runDialog.showModal();
    window.requestAnimationFrame(() => $(`[data-run-dialog-tab="${state.runDialog.tab}"]`, dom.runDialog)?.focus({ preventScroll: true }));
  }

  function closeRunDialog(options = {}) {
    if (dom.runDialog.open) dom.runDialog.close();
    state.runDialog.runId = null;
    if (options.restoreFocus === false) return;
    const trigger = runDialogTrigger?.isConnected ? runDialogTrigger : null;
    runDialogTrigger = null;
    window.requestAnimationFrame(() => trigger?.focus?.({ preventScroll: true }));
  }

  function renderBrief() {
    const activeSuggestions = state.suggestions.filter((item) => item.status === "active");
    const suggestionLimit = state.expanded.suggestions ? 6 : 3;
    const thoughtLimit = state.expanded.thoughts ? 4 : 2;
    const sensingLabels = { off: "仅手动", smart: "停笔后", continuous: "编辑时" };
    const sensingHint = state.sensingMode === "off"
      ? "现在只在你点击“更新建议”时检查"
      : state.sensingMode === "smart"
        ? "切换文件或停笔后自动检查"
        : "编辑期间会定期检查，消耗更多 token";

    const suggestionRows = activeSuggestions.slice(0, suggestionLimit).map((item, index) => `
      <article class="suggestion-row${index === 0 ? " is-primary" : ""}" data-suggestion-id="${item.id}">
        <span class="suggestion-index">${String(index + 1).padStart(2, "0")}</span>
        <div class="suggestion-copy">
          <div class="suggestion-title"><strong>${escapeHtml(item.title)}</strong></div>
          <p>${escapeHtml(item.body)}</p>
          <div class="suggestion-meta"><span>${escapeHtml(item.target)}</span><span>${escapeHtml(item.reason)}</span></div>
        </div>
        <div class="suggestion-actions">
          <button type="button" data-discuss-suggestion="${item.id}">讨论</button>
          <details class="suggestion-more">
            <summary aria-label="更多操作" title="更多操作">${icon("more")}</summary>
            <div class="suggestion-menu" role="menu" aria-label="建议操作">
              <button type="button" role="menuitem" data-defer-suggestion="${item.id}"><span>移到后面</span><small>降低当前排序</small></button>
              <button class="is-ignore" type="button" role="menuitem" data-ignore-suggestion="${item.id}"><span>本轮忽略</span><small>刷新后可恢复</small></button>
            </div>
          </details>
        </div>
      </article>
    `).join("");

    const thoughtRows = state.thoughts.slice(0, thoughtLimit).map((item) => `
      <article class="thought-row">
        <div class="thought-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>
        <button class="row-action" type="button" data-use-thought="${item.id}">整理</button>
      </article>
    `).join("");

    dom.content.innerHTML = `
      <div class="brief-view">
        <header class="brief-head">
          <div class="brief-status"><span><i class="${state.sensingMode === "off" ? "is-paused" : ""}"></i>${state.sensingMode === "off" ? "仅手动检查" : "正在关注"}「AI 旁路段落」</span><time>${state.refreshTime} · v${state.refreshRevision}</time></div>
          <h2>针对当前正文，接下来值得处理什么</h2>
          <p>${sensingHint}。结果会在这里原位更新，不会追加到对话。</p>
          <div class="brief-head-actions">
            <button type="button" data-start-session>问 Copilot</button>
            <button type="button" data-refresh-brief>${icon("refresh")}更新建议</button>
            <details class="sensing-control">
              <summary><i class="${state.sensingMode === "off" ? "is-paused" : ""}"></i>建议更新 · ${sensingLabels[state.sensingMode]} ${icon("chevron-down")}</summary>
              <div class="sensing-menu" role="group" aria-label="建议更新设置">
                <span class="sensing-menu-label">什么时候检查新建议</span>
                <button type="button" role="radio" aria-checked="${state.sensingMode === "off"}" data-sensing-mode="off"><span><strong>仅手动</strong><small>只在你点击“更新建议”时检查</small></span><i></i></button>
                <button type="button" role="radio" aria-checked="${state.sensingMode === "smart"}" data-sensing-mode="smart"><span><strong>停笔后更新 <em>推荐</em></strong><small>切换文件或停止编辑后检查</small></span><i></i></button>
                <button type="button" role="radio" aria-checked="${state.sensingMode === "continuous"}" data-sensing-mode="continuous"><span><strong>编辑时定期更新</strong><small>编辑期间定期检查；消耗更多 token</small></span><i></i></button>
                <span class="sensing-menu-label is-secondary">发现新建议后</span>
                <button class="auto-run-setting" type="button" role="checkbox" aria-checked="${state.autoRun}" data-toggle-auto-run><span><strong>自动准备待审改动</strong><small>符合规则时可继续生成候选；仍需你审阅</small></span><i></i></button>
                <small class="sensing-menu-note">任何设置都不会自动接受或写入正文</small>
              </div>
            </details>
          </div>
        </header>

        <section class="brief-section">
          <header class="section-title"><span><strong>接下来可能要做</strong><b>38</b><small>按影响与正文顺序排序</small></span></header>
          <div class="suggestion-list">${suggestionRows}</div>
          <button class="list-more" type="button" data-expand="suggestions">${state.expanded.suggestions ? "收起" : "查看全部 38 条建议"}</button>
        </section>

        <section class="brief-section">
          <header class="section-title"><span><strong>相关材料</strong><b>37</b><small>作为建议依据，不直接改正文</small></span><button class="section-action" type="button" data-refresh-brief>${icon("refresh")}刷新</button></header>
          ${renderMaterialGraph()}
          <button class="list-more" type="button" data-open-materials="list">打开 Vault Search 结果浏览器</button>
        </section>

        <section class="brief-section">
          <header class="section-title"><span><strong>还没安放的想法</strong><b>19</b><small>不是待办，由你决定是否写入</small></span></header>
          <div class="thought-list">${thoughtRows}</div>
          <button class="list-more" type="button" data-expand="thoughts">${state.expanded.thoughts ? "收起" : "查看全部 19 条想法"}</button>
        </section>
      </div>
    `;
  }

  function renderInlineRunChanges(run, inline) {
    const showAll = inline.showAll.changes;
    const visible = showAll ? run.changes : run.changes.slice(0, 3);
    const rows = visible.map((change, index) => {
      const itemKey = `changes:${change.id}`;
      const open = inline.openItem === itemKey;
      return `
        <article class="run-inline-item is-change${open ? " is-open" : ""}" data-status="${change.status}">
          <button class="run-inline-row" type="button" aria-expanded="${open}" data-run-inline-item="${itemKey}" data-run-id="${run.id}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <span><strong>${escapeHtml(change.title)}</strong><small>${escapeHtml(change.target)} · ${escapeHtml(change.scope)}</small></span>
            <em>${escapeHtml(changeStatusLabel(change))}</em>${icon("chevron")}
          </button>
          ${open ? `
            <div class="run-inline-detail">
              <p>${escapeHtml(change.reason)}</p>
              <div class="inline-diff"><del>${escapeHtml(change.before)}</del> <ins>${escapeHtml(change.after)}</ins></div>
              <footer>
                <button type="button" data-locate-inline-change data-run-id="${run.id}" data-change-id="${change.id}">${icon("locate")}${run.id === state.activeRunId ? "在正文审阅" : "定位当前版本"}</button>
                ${change.historyId ? `<button type="button" data-history-id="${change.historyId}">${icon("history")}查看写入事务</button>` : ""}
              </footer>
            </div>
          ` : ""}
        </article>
      `;
    }).join("");
    const remaining = run.changes.length - 3;
    return `
      <div class="run-inline-list" data-kind="changes">${rows}</div>
      ${remaining > 0 ? `<button class="run-inline-more" type="button" data-run-inline-more="changes" data-run-id="${run.id}">${showAll ? "收起改动列表" : `查看其余 ${remaining} 处改动`}</button>` : ""}
    `;
  }

  function renderInlineRunInsights(run) {
    if (!run.insights.length) return `<div class="run-inline-empty">本轮没有需要单独确认的洞察。</div>`;
    return `<div class="run-inline-list" data-kind="insights">${run.insights.map((insight, index) => `
      <article class="run-inline-insight">
        <span>${icon("spark")}</span>
        <div><small>${escapeHtml(insight.severity)} · ${insight.sourceIds.length} 项依据</small><strong>${escapeHtml(insight.title)}</strong><p>${escapeHtml(insight.body)}</p>
          <footer><button type="button" data-ask-insight="${insight.id}" data-run-id="${run.id}">继续追问</button><button type="button" data-propose-insight="${insight.id}" data-run-id="${run.id}">生成修改</button></footer>
        </div>
        <b>${String(index + 1).padStart(2, "0")}</b>
      </article>
    `).join("")}</div>`;
  }

  function renderInlineRunSources(run, inline) {
    if (!run.sources.length) return `<div class="run-inline-empty">本轮没有引用 Vault 来源。</div>`;
    const showAll = inline.showAll.sources;
    const visible = showAll ? run.sources : run.sources.slice(0, 3);
    const remaining = run.sources.length - 3;
    return `
      <div class="run-inline-panel-head"><span>本轮冻结的材料</span><button type="button" data-open-graph-from-run>${icon("network")}在 Vault Search 中查看</button></div>
      <div class="run-inline-list" data-kind="sources">${visible.map((source) => `
        <article class="run-inline-source">
          <div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.path)}</small><p>${escapeHtml(source.reason)}</p></div>
          <b>${source.score}%</b>
          <footer><button type="button" data-view-source="${source.id}">${icon("eye")}查看</button><button type="button" data-use-source="${source.id}">带入下一轮</button></footer>
        </article>
      `).join("")}</div>
      ${remaining > 0 ? `<button class="run-inline-more" type="button" data-run-inline-more="sources" data-run-id="${run.id}">${showAll ? "收起材料列表" : `查看其余 ${remaining} 项来源`}</button>` : ""}
    `;
  }

  function renderInlineRunTrace(run, inline) {
    if (!run.trace.length) return `<div class="run-inline-empty">本轮没有可显示的运行记录。</div>`;
    const showAll = inline.showAll.trace;
    const visible = showAll ? run.trace : run.trace.slice(0, 3);
    const remaining = run.trace.length - 3;
    return `
      <div class="run-inline-trace-note"><span>4 秒 · 1 轮</span><small>只显示可验证动作，不展示模型私有推理</small></div>
      <ol class="run-inline-trace">${visible.map((step) => `
        <li data-status="${step.status}"><time>${escapeHtml(step.time)}</time><i>✓</i><span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></span></li>
      `).join("")}</ol>
      ${remaining > 0 ? `<button class="run-inline-more" type="button" data-run-inline-more="trace" data-run-id="${run.id}">${showAll ? "收起运行记录" : `查看其余 ${remaining} 个事件`}</button>` : ""}
    `;
  }

  function renderInlineRunPanel(run, inline) {
    if (inline.tab === "changes") return renderInlineRunChanges(run, inline);
    if (inline.tab === "insights") return renderInlineRunInsights(run);
    if (inline.tab === "sources") return renderInlineRunSources(run, inline);
    return renderInlineRunTrace(run, inline);
  }

  function renderRunSummary(runId) {
    const run = runById(runId);
    if (!run) return "";
    const counts = runCounts(run);
    const inline = inlineRunState(run.id);
    const reviewed = run.reviewStatus === "reviewed";
    const statusLabel = reviewed
      ? `${run.changes.filter((change) => change.status === "accepted").length} 已接受 · ${run.changes.filter((change) => change.status === "rejected").length} 已拒绝`
      : counts.pending > 0 ? `${counts.pending} 处等待审阅` : "运行完成";
    const reviewAction = run.id === state.activeRunId && counts.pending > 0
      ? `<button class="run-primary-action" type="button" data-start-review>开始审阅</button>`
      : "";
    const tabs = [
      ["changes", "改动", counts.changes],
      ["insights", "洞察", counts.insights],
      ["sources", "来源", counts.sources],
      ["trace", "记录", counts.trace],
    ];

    return `
      <section class="run-receipt" data-run-id="${run.id}">
        <header><span><strong>${escapeHtml(run.title)}</strong><small>4 秒 · ${escapeHtml(statusLabel)}</small></span><div class="run-receipt-actions">${reviewAction}<button class="run-inline-toggle" type="button" aria-expanded="${inline.expanded}" data-run-inline-toggle data-run-id="${run.id}">${inline.expanded ? "收起" : "展开"}${icon("chevron")}</button></div></header>
        <nav class="run-inline-tabs" role="tablist" aria-label="本轮产物">
          ${tabs.map(([id, label, count]) => `<button id="run-tab-${run.id}-${id}" type="button" role="tab" tabindex="${inline.tab === id ? "0" : "-1"}" aria-controls="run-panel-${run.id}" aria-selected="${inline.tab === id}" aria-expanded="${inline.expanded && inline.tab === id}" data-run-inline-tab="${id}" data-run-id="${run.id}"><span>${label}</span><b>${count}</b></button>`).join("")}
        </nav>
        <section id="run-panel-${run.id}" class="run-inline-panel" role="tabpanel" aria-labelledby="run-tab-${run.id}-${inline.tab}" data-run-inline-panel="${inline.tab}"${inline.expanded ? "" : " hidden"}>${renderInlineRunPanel(run, inline)}</section>
      </section>
    `;
  }

  function renderEvent(event) {
    const avatar = event.type === "assistant" ? "AI" : event.type === "user" ? "你" : "✓";
    const chips = event.chips?.length
      ? `<div class="event-chips">${event.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}${event.action ? `<button type="button" data-start-review>${escapeHtml(event.action)} · 生成改动</button>` : ""}</div>`
      : event.action
        ? `<div class="event-chips"><button type="button" data-start-review>${escapeHtml(event.action)} · 生成改动</button></div>`
        : "";
    return `
      <article class="thread-event is-${event.type}">
        <span class="event-avatar">${avatar}</span>
        <div class="event-body">
          <div class="event-title"><strong>${escapeHtml(event.title)}</strong><time>${escapeHtml(event.time)}</time></div>
          ${event.quote ? `<blockquote class="message-quote">引用 · AI 旁路段落<br>${escapeHtml(event.quote)}</blockquote>` : ""}
          <p>${escapeHtml(event.body)}</p>
          ${chips}
          ${event.runId ? renderRunSummary(event.runId, event.showInsight) : ""}
        </div>
      </article>
    `;
  }

  function renderSession() {
    const run = activeRun();
    const hasCurrentRunReceipt = state.thread.some((event) => event.runId === run?.id);
    const fixtureRunReceipt = run && !hasCurrentRunReceipt && !["idle", "generating"].includes(state.review.status)
      ? renderEvent({
        type: "assistant",
        title: "Copilot",
        time: run.time,
        body: "本轮已经形成可追溯产物。改动回到正文原位审阅，洞察、来源与过程保留在同一次运行中。",
        runId: run.id,
        showInsight: true,
      })
      : "";
    const thread = `${state.thread.map(renderEvent).join("")}${fixtureRunReceipt}`;
    const runCountsNow = runCounts(run);
    const headerAction = state.running
      ? `<button class="task-action" type="button" data-stop-run>停止</button>`
      : run?.reviewStatus === "reviewed"
        ? `<button class="task-action" type="button" data-show-run-inline="${run.id}" data-run-tab="changes">查看审阅记录</button>`
        : `<button class="task-action" type="button" data-start-review>审阅 ${runCountsNow.changes || 8} 处改动</button>`;
    const progressRows = RUN_PROGRESS.slice(0, Math.max(0, state.runStep + 1)).map((step, index, rows) => `
      <li class="${index === rows.length - 1 && state.running ? "is-current" : "is-done"}">
        <i>${index === rows.length - 1 && state.running ? "" : "✓"}</i><span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></span>
      </li>
    `).join("");
    const running = state.running ? `
      <article class="thread-event is-run">
        <span class="event-avatar">AI</span>
        <div class="event-body">
          <div class="event-title"><strong>正在执行 · ${state.runStep + 1}/${RUN_PROGRESS.length}</strong><time>现在</time></div>
          <ol class="run-progress-list">${progressRows}</ol>
          <div class="run-live-actions"><button type="button" data-stop-run>停止</button><button type="button" data-redirect-run>追加下一步指令</button></div>
        </div>
      </article>
    ` : "";
    const clueItems = state.sessionClueIds
      .map((id) => state.suggestions.find((item) => item.id === id && item.status === "active"))
      .filter(Boolean);
    const clueMessages = clueItems.map((item, index) => `
      <article class="thread-event is-assistant is-clue-update${state.sessionClueQueuedId === item.id ? " is-queued" : ""}" data-message-id="${state.clueUpdate.id}:${item.id}" data-clue-id="${item.id}" data-revision="${state.clueUpdate.revision}">
        <span class="event-avatar">AI</span>
        <div class="event-body">
          <div class="event-title"><strong>Copilot 建议 · ${index + 1}/${clueItems.length}</strong><time>${escapeHtml(state.clueUpdate.time)}</time></div>
          <div class="clue-message-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.target)}</small></div>
          <p>${escapeHtml(item.body)}</p>
          <small class="clue-message-evidence">为什么出现：${escapeHtml(item.reason)}</small>
          <div class="clue-message-actions"><button type="button" data-use-session-clue="${item.id}">${state.sessionClueQueuedId === item.id ? "已带入下一轮" : "带入下一轮"}</button><button type="button" data-ignore-suggestion="${item.id}">忽略</button>${index === clueItems.length - 1 ? `<button type="button" data-back-brief>查看全部建议</button>` : ""}</div>
        </div>
      </article>
    `).join("");
    dom.content.innerHTML = `
      <div class="session-view">
        <header class="task-head">
          <div class="task-leading">
            <button class="task-back" type="button" data-back-brief aria-label="返回建议">${icon("chevron-left")}</button>
            <div class="task-copy"><h2>${escapeHtml(state.sessionTitle)}</h2><p>围绕具体任务协作 · 上下文在运行开始时冻结</p></div>
          </div>
          ${headerAction}
        </header>
        <div class="thread">${thread}${running}${clueMessages}</div>
      </div>
    `;
  }

  function renderReview() {
    const change = activeChange();
    const total = state.review.changes.length;
    const resolved = resolvedChanges().length;

    if (!change || resolved === total) {
      const accepted = state.review.changes.filter((item) => item.status === "accepted").length;
      const rejected = state.review.changes.filter((item) => item.status === "rejected").length;
      dom.content.innerHTML = `
        <div class="review-view">
          <div class="review-complete">
            <i>✓</i>
            <h3>这组改动已经处理完</h3>
            <p>${accepted} 处已接受并写入正文，${rejected} 处已拒绝。只有接受的事务进入 History。</p>
            <button type="button" data-show-run-inline="${state.activeRunId}" data-run-tab="changes">查看完整审阅记录</button>
            <button type="button" data-mode-link="history">查看 History</button>
            <button type="button" data-stage-link="session">继续协作</button>
          </div>
        </div>
      `;
      return;
    }

    const rows = state.review.changes.map((item, index) => {
      const symbol = item.status === "accepted" ? "✓" : item.status === "rejected" ? "×" : "";
      return `
        <button class="change-row${index === state.review.activeIndex ? " is-active" : ""}${item.status !== "pending" ? " is-resolved" : ""}" type="button" data-change-index="${index}" data-change-id="${item.id}" data-status="${item.status}">
          <span class="change-status">${symbol}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.target)}</small>
        </button>
      `;
    }).join("");
    const reviewActions = change.status === "pending"
      ? `
        <button class="accept-change" type="button" data-review-action="accept">接受</button>
        <button type="button" data-review-action="edit-accept">编辑后接受</button>
        <button class="reject-change" type="button" data-review-action="reject">拒绝</button>
        <button type="button" data-review-action="accept-all">全部接受</button>
      `
      : `
        <span class="review-decision" data-status="${change.status}">${escapeHtml(change.decision || (change.status === "accepted" ? "已接受" : "已拒绝"))}</span>
        ${change.historyId ? `<button type="button" data-history-id="${change.historyId}">查看写入事务</button>` : ""}
      `;

    dom.content.innerHTML = `
      <div class="review-view">
        <section class="review-navigator">
          <header class="review-title">
            <div class="task-leading">
              <button class="task-back review-back" type="button" data-stage-link="session" aria-label="返回协作">${icon("chevron-left")}</button>
              <div class="task-copy"><h2>审阅改动</h2><p>正文原位是事实来源，侧栏负责导航和解释。</p></div>
            </div>
          </header>
          <div class="review-progress">
            <span>改动 ${state.review.activeIndex + 1} / ${total}</span>
            <span class="progress-track"><i style="width:${((resolved + 1) / total) * 100}%"></i></span>
            <span>${resolved} 已处理</span>
          </div>
          <div class="review-nav-buttons">
            <button type="button" data-review-nav="previous">${icon("chevron-up")}上一处</button>
            <button type="button" data-review-nav="next">${icon("chevron-down")}下一处</button>
          </div>
        </section>

        <article class="review-card">
          <span class="review-kicker">${escapeHtml(change.capability)} · ${escapeHtml(change.id)}</span>
          <h3>${escapeHtml(change.title)}</h3>
          <p>${escapeHtml(change.reason)}</p>
          <div class="review-meta"><span>${escapeHtml(change.target)}</span><span>${escapeHtml(change.scope)}</span><span>${escapeHtml(change.status)}</span></div>
          <div class="review-location-note">${icon("locate")} <span>改动已显示在正文原位。用正文编号、上一处或下一处切换。</span></div>
          <div class="review-actions">${reviewActions}</div>
        </article>

        <section class="review-overview">
          <strong>本轮全部改动</strong>
          <div class="change-list">${rows}</div>
        </section>
      </div>
    `;
  }

  function renderHistory() {
    const groups = state.history.map((group) => `
      <section class="history-day">
        <header><span>${escapeHtml(group.day)}</span><time>${escapeHtml(group.date)}</time></header>
        <div class="history-list">
          ${group.entries.map((entry) => `
            <button class="history-row" type="button" data-history-id="${entry.id}" data-origin="${entry.origin}">
              <i class="history-dot"></i>
              <span class="history-copy">
                <span class="history-title"><strong>${escapeHtml(entry.title)}</strong><em class="origin-tag">${escapeHtml(entry.originLabel)}</em></span>
                <small>${escapeHtml(entry.target)}</small>
              </span>
              <span class="history-meta"><time>${escapeHtml(entry.time)}</time><b>${escapeHtml(entry.delta)}</b></span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");

    dom.content.innerHTML = `
      <div class="history-view">
        <header class="history-heading"><div><h2>已接受写入</h2><p>按日期与来源记录真实改变，不记录建议和生成过程。</p></div><b>${totalHistory()} 笔事务</b></header>
        ${groups}
      </div>
    `;
  }

  function renderComposer() {
    const chips = state.contextIds.map(contextById).filter(Boolean).map((item) => `
      <button class="context-chip" type="button" data-remove-context="${item.id}">${icon("link")}${escapeHtml(item.title)} ${icon("x")}</button>
    `);
    const capability = capabilityById(state.selectedCapability);
    if (capability) {
      chips.unshift(`<button class="context-chip is-action" type="button" data-remove-capability>${icon("spark")}${escapeHtml(capability.title)} ${icon("x")}</button>`);
    }
    dom.promptContext.innerHTML = chips.join("");
    $$('.quick-actions [data-capability]').forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.capability === state.selectedCapability);
    });
    updatePromptState();
  }

  function reviewStatusLabel(change) {
    if (change.status === "accepted") return "已接受";
    if (change.status === "rejected") return "已拒绝";
    return state.running ? "AI 草拟" : "待审";
  }

  function renderDocumentPins(record, indexedChanges, activeIndex) {
    if (!indexedChanges.length) return;
    const buttons = indexedChanges.map(({ change, index }) => {
      const active = index === activeIndex;
      const status = reviewStatusLabel(change);
      const label = `改动 ${index + 1} / ${state.review.changes.length}，${change.target}，${change.title}，${status}`;
      const statusSymbol = change.status === "accepted" ? "✓" : change.status === "rejected" ? "×" : state.running ? "…" : "•";
      return `
        <button class="doc-change-pin${active ? " is-active" : ""}" type="button"
          contenteditable="false" draggable="false" data-review-ui
          data-document-change-index="${index}" data-change-id="${change.id}"
          data-status="${change.status}" aria-current="${active ? "true" : "false"}"
          aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" tabindex="${active ? "0" : "-1"}">
          <span>${String(index + 1).padStart(2, "0")}</span><i aria-hidden="true">${statusSymbol}</i>
        </button>
      `;
    }).join("");
    record.element.insertAdjacentHTML(
      "beforeend",
      `<span class="doc-change-pin-rail" contenteditable="false" data-review-ui role="group" aria-label="此处的候选改动">${buttons}</span>`,
    );
  }

  function renderDocument() {
    blocks.forEach((record) => {
      record.element.innerHTML = record.committedHtml;
      record.element.classList.remove(
        "is-review-target",
        "is-review-visible",
        "is-review-anchor",
        "is-review-collision",
        "is-streaming-target",
        "is-accepted",
      );
      record.element.removeAttribute("data-review-label");
      record.element.removeAttribute("data-review-status");
      record.element.removeAttribute("data-review-view");
    });
    dom.liveChangeNav.hidden = true;

    if (state.mode !== "copilot") return;
    const inReview = state.stage === "review";
    const inSessionPreview = state.stage === "session"
      && (state.running || ["reviewable", "reviewing"].includes(state.review.status));
    if (!inReview && !inSessionPreview) return;

    const total = state.review.changes.length;
    let changeIndex = state.review.activeIndex;
    if (state.running) changeIndex = Math.max(0, Math.min(total - 1, state.runStep - 1));
    if (!setActiveChangeIndex(changeIndex)) return;
    const change = activeChange();
    if (!change) return;

    const viewMode = state.running ? "current" : state.review.viewMode;
    const indexedChanges = state.review.changes.map((item, index) => ({ change: item, index }));
    const pinChanges = state.running ? indexedChanges.slice(0, changeIndex + 1) : indexedChanges;
    const byBlock = new Map();
    pinChanges.forEach((item) => {
      if (!byBlock.has(item.change.blockId)) byBlock.set(item.change.blockId, []);
      byBlock.get(item.change.blockId).push(item);
    });

    if (viewMode === "original") {
      blocks.forEach((record) => {
        record.element.innerHTML = record.committedHtml;
      });
    }

    byBlock.forEach((items, blockId) => {
      const record = blocks.get(blockId);
      if (!record) return;
      const activeItem = items.find((item) => item.index === changeIndex) || null;
      let previewItem = null;
      if (viewMode === "current") previewItem = activeItem;
      if (viewMode === "all" && items.length === 1) previewItem = items[0];
      if (viewMode === "all" && items.length > 1) previewItem = activeItem;

      record.element.classList.add("is-review-anchor");
      record.element.dataset.reviewView = viewMode;
      if (items.length > 1) record.element.classList.add("is-review-collision");
      if (previewItem) {
        record.element.innerHTML = previewItem.change.previewHtml;
        record.element.dataset.reviewStatus = previewItem.change.status;
        record.element.dataset.reviewLabel = `${reviewStatusLabel(previewItem.change)} ${previewItem.index + 1} / ${total}`;
        if (state.running && previewItem.index === changeIndex) {
          record.element.classList.add("is-streaming-target");
        } else if (previewItem.index === changeIndex) {
          record.element.classList.add("is-review-target");
        } else {
          record.element.classList.add("is-review-visible");
        }
      }
      renderDocumentPins(record, items, changeIndex);
    });

    const statusLabel = reviewStatusLabel(change);
    const added = Math.max(1, Math.round(change.after.length / 7));
    const removed = Math.max(0, Math.round(change.before.length / 12));
    const modeCopy = viewMode === "all"
      ? `全部 ${total} 处已在正文展开`
      : viewMode === "original"
        ? `原文 · 保留 ${total} 个定位点`
        : change.status === "pending" ? "候选尚未写入" : statusLabel;
    const modeDisabled = state.running ? " disabled aria-disabled=\"true\" title=\"生成完成后可切换\"" : "";
    const modeControls = `
      <div class="live-review-modes" role="group" aria-label="正文改动显示方式">
        <button type="button" data-review-mode="current" aria-pressed="${viewMode === "current"}">当前一处</button>
        <button type="button" data-review-mode="all" aria-pressed="${viewMode === "all"}"${modeDisabled}>全部改动</button>
        <button type="button" data-review-mode="original" aria-pressed="${viewMode === "original"}"${modeDisabled}>原文</button>
      </div>
    `;
    const navigation = state.running ? "" : `
      <button type="button" data-live-review-nav="previous" aria-label="上一处">${icon("chevron-up")}</button>
      <button type="button" data-live-review-nav="next" aria-label="下一处">${icon("chevron-down")}</button>
    `;
    const decisionActions = change.status !== "pending"
      ? `<span class="live-decision" data-status="${change.status}">${escapeHtml(change.decision || statusLabel)}</span>${change.historyId ? `<button type="button" data-history-id="${change.historyId}">查看事务</button>` : ""}`
      : inReview && viewMode === "original"
        ? `<button type="button" data-review-mode="current">查看改动</button>`
        : inReview
          ? `<button class="is-accept" type="button" data-review-action="accept">接受</button><button type="button" data-review-action="reject">拒绝</button>`
          : state.running
            ? `<button type="button" data-stop-run>停止</button>`
            : `<button class="is-accept" type="button" data-live-open-review>开始审阅</button>`;
    dom.liveChangeNav.innerHTML = `
      ${modeControls}
      <div class="live-change-copy"><small>${modeCopy}</small><strong>${changeIndex + 1} / ${total}</strong><span>+${added} −${removed}</span></div>
      <div class="live-change-actions">${navigation}${decisionActions}</div>
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(modeCopy)}，当前是第 ${changeIndex + 1} 处</span>
    `;
    dom.liveChangeNav.hidden = false;
    dom.sourceStatus.textContent = `${state.running ? "AI 草拟" : "审阅"} · ${change.target} · ${viewMode === "current" ? "当前一处" : viewMode === "all" ? "全部改动" : "原文"}`;
    dom.sourcePreview.textContent = viewMode === "original" ? change.before : `${change.before} → ${change.after}`;
  }

  function render() {
    renderShell();
    if (state.mode === "history") {
      renderHistory();
    } else if (state.stage === "brief") {
      renderBrief();
    } else if (state.stage === "session") {
      renderSession();
    } else {
      renderReview();
    }
    renderComposer();
    renderDocument();
    const documentHasCopilotPreview = state.mode === "copilot"
      && (state.stage === "review" || (state.stage === "session" && (state.running || ["reviewable", "reviewing"].includes(state.review.status))));
    if (!documentHasCopilotPreview) {
      dom.sourceStatus.textContent = "当前块 · AI 旁路段落";
      dom.sourcePreview.textContent = "AI 应该贴在当前块旁边，并把候选修改放回正文原位。";
    }
    syncUrl();
  }

  function updatePromptState() {
    dom.prompt.style.height = "auto";
    dom.prompt.style.height = `${Math.min(dom.prompt.scrollHeight, 128)}px`;
    dom.send.disabled = !dom.prompt.value.trim() || state.running;
  }

  function openPicker(mode) {
    state.pickerMode = mode;
    dom.capabilityTitle.textContent = mode === "context" ? "添加上下文" : "全部能力";
    const subtitle = $(".dialog-shell > header small", dom.capabilityDialog);
    subtitle.textContent = mode === "context" ? "选择后成为 context chip" : "选择后进入输入框，不会自动运行";
    dom.capabilitySearch.value = "";
    dom.capabilitySearch.placeholder = mode === "context" ? "搜索文件、图谱或上下文" : "搜索能力、结果或英文名称";
    renderPickerResults();
    dom.capabilityDialog.showModal();
    window.requestAnimationFrame(() => dom.capabilitySearch.focus());
  }

  function closePicker() {
    if (dom.capabilityDialog.open) dom.capabilityDialog.close();
  }

  function renderPickerResults() {
    const query = dom.capabilitySearch.value.trim().toLocaleLowerCase();
    if (state.pickerMode === "context") {
      const rows = CONTEXT_OPTIONS.filter((item) => `${item.title} ${item.desc}`.toLocaleLowerCase().includes(query)).map((item) => `
        <button class="capability-row" type="button" data-context-choice="${item.id}" ${item.disabled ? "disabled" : ""}>
          <i>${escapeHtml(item.badge)}</i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.disabled || item.desc)}</small></span><em>${state.contextIds.includes(item.id) ? "已加入" : "加入"}</em>
        </button>
      `).join("");
      dom.capabilityResults.innerHTML = `<section class="capability-group"><header><span>上下文</span><span>加入输入框</span></header>${rows || "<small>没有匹配结果</small>"}</section>`;
      return;
    }

    const filtered = CAPABILITIES.filter((item) => `${item.title} ${item.en} ${item.desc}`.toLocaleLowerCase().includes(query));
    const groups = [...new Set(filtered.map((item) => item.group))];
    dom.capabilityResults.innerHTML = groups.map((group) => `
      <section class="capability-group">
        <header><span>${escapeHtml(group)}</span><span>${filtered.filter((item) => item.group === group).length} 项</span></header>
        ${filtered.filter((item) => item.group === group).map((item) => `
          <button class="capability-row" type="button" data-capability-choice="${item.id}" ${item.disabled ? "disabled" : ""}>
            <i>${escapeHtml(item.badge)}</i><span><strong>${escapeHtml(item.title)} · ${escapeHtml(item.en)}</strong><small>${escapeHtml(item.disabled || item.desc)}</small></span><em>${state.selectedCapability === item.id ? "已选择" : "选择"}</em>
          </button>
        `).join("")}
      </section>
    `).join("") || "<small>没有匹配结果</small>";
  }

  function bindCapability(id, options = {}) {
    const capability = capabilityById(id);
    if (!capability || capability.disabled) return;
    state.selectedCapability = id;
    state.sessionTitle = options.taskTitle || capability.title;
    closePicker();
    setStage("session", { focusComposer: true });
    showToast(`已装配能力：${capability.title}`);
  }

  function addContext(id) {
    const item = contextById(id);
    if (!item || item.disabled) return;
    if (!state.contextIds.includes(id)) state.contextIds.push(id);
    closePicker();
    setStage("session", { focusComposer: true });
    showToast(`已加入上下文：${item.title}`);
  }

  function beginSuggestion(id) {
    const item = state.suggestions.find((suggestion) => suggestion.id === id);
    if (!item) return;
    state.sessionTitle = item.title;
    state.selectedCapability = item.capability;
    state.thread = [
      INITIAL_THREAD[0],
      {
        type: "system",
        title: "已把建议带入协作",
        time: "现在",
        body: `${item.reason}。建议只装配能力与上下文，发送前不会改动正文。`,
        chips: [item.target, capabilityById(item.capability)?.title || "Copilot"],
      },
      ...INITIAL_THREAD.slice(1),
    ];
    setStage("session", { focusComposer: true });
  }

  function useSessionClue(id) {
    const item = state.suggestions.find((suggestion) => suggestion.id === id && suggestion.status === "active");
    if (!item) return;
    state.sessionClueQueuedId = item.id;
    state.selectedCapability = item.capability;
    state.sessionTitle = `下一轮：${item.title}`;
    render();
    dom.prompt.value = `围绕“${item.title}”，先说明依据，再生成可审阅的修改。`;
    updatePromptState();
    dom.prompt.focus({ preventScroll: true });
    showToast("线索已带入输入框；当前运行快照没有改变");
  }

  function useInsight(insightId, runId, mode) {
    const run = runById(runId);
    const insight = run?.insights.find((item) => item.id === insightId);
    if (!insight) return;
    const contextId = `insight:${insight.id}`;
    if (!state.contextIds.includes(contextId)) state.contextIds.push(contextId);
    state.sessionTitle = mode === "propose" ? `把洞察变成正文修改：${insight.title}` : `继续追问：${insight.title}`;
    if (mode === "propose") state.selectedCapability = "correct-content";
    closeRunDialog({ restoreFocus: false });
    setStage("session", { focusComposer: true });
    dom.prompt.value = mode === "propose"
      ? `基于这条洞察，生成可逐项审阅的正文修改：${insight.title}`
      : `关于“${insight.title}”，请说明它对当前段落的具体影响。`;
    updatePromptState();
    dom.prompt.focus({ preventScroll: true });
    showToast(mode === "propose" ? "洞察已装配为修改任务" : "洞察已带入下一轮追问");
  }

  function stopRun() {
    window.clearTimeout(runTimer);
    window.clearInterval(runInterval);
    state.running = false;
    state.runStep = -1;
    state.review.status = "idle";
    const run = activeRun();
    if (run) {
      run.executionStatus = "cancelled";
      run.reviewStatus = "no-review";
      run.changes = [];
    }
    state.thread.push({
      type: "system",
      title: "本轮已停止",
      time: "现在",
      body: "已停止后续生成，未写入正文，也没有创建 History 事务。",
    });
    render();
    showToast("已停止，本轮没有写入正文");
  }

  function queueRunDirective() {
    dom.prompt.value = "先检查事实依据，再继续生成候选改动。";
    updatePromptState();
    dom.prompt.focus({ preventScroll: true });
    showToast("下一步指令已暂存；停止或完成本轮后可发送");
  }

  function startReview() {
    state.running = false;
    window.clearTimeout(runTimer);
    window.clearInterval(runInterval);
    if (pendingChanges().length === 0) {
      const run = activeRun();
      if (run) showRunInline(run.id, "changes");
      return;
    }
    if (dom.runDialog.open) closeRunDialog({ restoreFocus: false });
    state.sessionStatus = "active";
    state.review.status = "reviewing";
    state.review.viewMode = "current";
    if (window.innerWidth <= 1180) state.panelOpen = false;
    setStage("review", { smooth: true });
  }

  function locateActiveChange(smooth = true) {
    window.requestAnimationFrame(() => {
      const change = activeChange();
      const record = change ? blocks.get(change.blockId) : null;
      if (!record) return;
      record.element.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    });
  }

  function moveReview(direction) {
    const count = state.review.changes.length;
    if (!count) return;
    setActiveChangeIndex(state.review.activeIndex + direction);
    render();
    locateActiveChange(true);
  }

  function nextPendingIndex(fromIndex) {
    const count = state.review.changes.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (fromIndex + offset) % count;
      if (state.review.changes[index].status === "pending") return index;
    }
    return -1;
  }

  function recordAcceptedChange(change, label = "AI 辅助 · 已接受", batchId = null) {
    const today = state.history[0];
    const id = `hist-live-${Date.now()}-${change.id}`;
    today.entries.unshift({
      id,
      title: change.title,
      target: `${change.target} · ${change.scope}`,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      delta: "+1 −1",
      origin: label.includes("调整") ? "mixed" : "ai",
      originLabel: label,
      before: change.before,
      after: change.after,
      runId: state.activeRunId,
      changeId: change.id,
      batchId,
    });
    change.historyId = id;
    return id;
  }

  function resolveChange(action) {
    const change = activeChange();
    if (!change || change.status !== "pending") {
      const next = nextPendingIndex(state.review.activeIndex);
      if (next >= 0) {
        setActiveChangeIndex(next);
        render();
        locateActiveChange(true);
      }
      return;
    }

    if (action === "accept" || action === "edit-accept") {
      change.status = "accepted";
      change.decision = action === "edit-accept" ? "编辑后接受" : "按建议接受";
      const record = blocks.get(change.blockId);
      if (record) record.committedHtml = change.afterHtml;
      recordAcceptedChange(change, action === "edit-accept" ? "AI 后调整" : "AI 辅助 · 已接受");
      showToast(action === "edit-accept" ? "已编辑后接受，事务进入 History" : "已接受并写入正文");
    } else {
      change.status = "rejected";
      change.decision = "已拒绝";
      showToast("已拒绝，本次不会进入 History");
    }

    const next = nextPendingIndex(state.review.activeIndex);
    if (next >= 0) setActiveChangeIndex(next);
    if (pendingChanges().length === 0) state.review.status = "resolved";
    syncActiveRunReview();
    render();
    if (next >= 0) locateActiveChange(true);
  }

  function acceptAllChanges() {
    const accepted = pendingChanges();
    const batchId = `changeset-${Date.now()}`;
    accepted.forEach((change) => {
      change.status = "accepted";
      change.decision = "按建议接受";
      const record = blocks.get(change.blockId);
      if (record) record.committedHtml = change.afterHtml;
      recordAcceptedChange(change, "AI 辅助 · 已接受", batchId);
    });
    if (accepted.length) {
      state.review.status = "resolved";
      syncActiveRunReview();
    }
    render();
    showToast(`已接受剩余 ${accepted.length} 处改动`);
  }

  function refreshBrief() {
    state.refreshRevision += 1;
    state.refreshTime = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const first = state.suggestions.shift();
    if (first) state.suggestions.push(first);
    render();
    showToast("已重新比较当前块、最近编辑和显式链接");
  }

  function submitPrompt() {
    const value = dom.prompt.value.trim();
    if (!value || state.running) return;
    const previousRun = activeRun();
    const previousRunWasVisible = Boolean(previousRun && state.review.status !== "idle");
    if (previousRunWasVisible && !state.thread.some((event) => event.runId === previousRun.id)) {
      state.thread.push({
        type: "assistant",
        title: "Copilot",
        time: previousRun.time,
        body: "本轮已经形成可追溯产物。改动、洞察、来源与运行记录都保留在这条消息内。",
        runId: previousRun.id,
      });
    }
    if (previousRunWasVisible) inlineRunState(previousRun.id).expanded = false;
    state.thread.push({ type: "user", title: "你的指令", time: "现在", body: value, quote: "AI 旁路段落" });
    dom.prompt.value = "";
    state.running = true;
    state.runStep = 0;
    state.review.status = "generating";
    state.review.viewMode = "current";
    state.review.changes = CHANGES.map((change) => ({ ...change, status: "pending", decision: null }));
    setActiveChangeIndex(0);
    state.runSequence += 1;
    const runId = `run-session-${Date.now()}-${state.runSequence}`;
    const run = {
      id: runId,
      title: value,
      time: "现在",
      executionStatus: "running",
      reviewStatus: "collecting",
      snapshot: state.contextIds.map(contextById).filter(Boolean).map((item) => item.title).join(" · "),
      changes: state.review.changes.map((change) => ({ ...change })),
      insights: RUN_INSIGHTS.map((insight) => ({ ...insight, sourceIds: [...insight.sourceIds] })),
      sources: SOURCES.slice(0, 5).map((source) => ({ ...source })),
      trace: RUN_TRACE.map((step) => ({ ...step, status: "queued" })),
    };
    state.runs.push(run);
    state.activeRunId = run.id;
    state.runInline[run.id] = {
      tab: "changes",
      expanded: true,
      openItem: null,
      showAll: { changes: false, insights: true, sources: false, trace: false },
    };
    state.sessionClueQueuedId = null;
    render();
    window.clearInterval(runInterval);
    runInterval = window.setInterval(() => {
      const currentRun = activeRun();
      if (currentRun?.trace[state.runStep]) currentRun.trace[state.runStep].status = "done";
      state.runStep += 1;
      if (state.runStep < RUN_PROGRESS.length) {
        render();
        return;
      }
      window.clearInterval(runInterval);
      state.running = false;
      state.runStep = RUN_PROGRESS.length - 1;
      state.review.status = "reviewable";
      if (currentRun) currentRun.trace.forEach((step) => { step.status = "done"; });
      syncActiveRunReview();
      state.thread.push({
        type: "assistant",
        title: "Copilot",
        time: "现在",
        body: "我把任务拆成 8 处可独立判断的正文修改，并形成 2 条可继续追问的洞察。候选已经回到正文原位，等待你逐项审阅。",
        chips: ["8 处改动", "2 条洞察", "冻结上下文"],
        runId: state.activeRunId,
        showInsight: true,
      });
      render();
      dom.content.scrollTop = dom.content.scrollHeight;
    }, 260);
  }

  function toggleVoice() {
    window.clearTimeout(voiceTimer);
    state.voiceActive = !state.voiceActive;
    const button = $("[data-voice]");
    button.classList.toggle("is-listening", state.voiceActive);
    button.setAttribute("aria-label", state.voiceActive ? "停止语音输入" : "语音输入");
    if (!state.voiceActive) return;
    showToast("正在听写…语音只会写入草稿");
    voiceTimer = window.setTimeout(() => {
      state.voiceActive = false;
      button.classList.remove("is-listening");
      button.setAttribute("aria-label", "语音输入");
      dom.prompt.value = `${dom.prompt.value}${dom.prompt.value ? " " : ""}把这组修改按风险从高到低排列`;
      updatePromptState();
      dom.prompt.focus();
    }, 1200);
  }

  function findHistoryEntry(id) {
    for (const group of state.history) {
      const entry = group.entries.find((item) => item.id === id);
      if (entry) return entry;
    }
    return null;
  }

  function openHistoryDialog(id) {
    const entry = findHistoryEntry(id);
    if (!entry) return;
    state.historySelection = entry.id;
    dom.historyDialogContent.innerHTML = `
      <header><span><strong id="history-dialog-title">${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.originLabel)} · ${escapeHtml(entry.time)}</small></span><button class="icon-button" type="button" data-close-history aria-label="关闭">${icon("x")}</button></header>
      <div class="history-dialog-body">
        <div class="history-range"><span>${escapeHtml(entry.target)}</span><span>${escapeHtml(entry.delta)}</span></div>
        <div class="inline-diff"><del>${escapeHtml(entry.before)}</del> <ins>${escapeHtml(entry.after)}</ins></div>
      </div>
      <footer class="history-dialog-footer"><small>回滚前会检查当前正文是否仍与本事务目标一致。</small><div><button type="button" data-locate-history>${icon("locate")} 定位正文</button><button class="rollback" type="button" data-rollback-history>${icon("undo")} 回滚</button></div></footer>
    `;
    dom.historyDialog.showModal();
  }

  function closeHistoryDialog() {
    if (dom.historyDialog.open) dom.historyDialog.close();
  }

  function handleDocumentClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.variant) return setVariant(button.dataset.variant);
    if (button.dataset.panelToggle !== undefined) {
      state.panelOpen = true;
      return render();
    }
    if (button.dataset.panelClose !== undefined) {
      state.panelOpen = false;
      return render();
    }
    if (button.dataset.mode) return setMode(button.dataset.mode);
    if (button.dataset.modeLink) return setMode(button.dataset.modeLink);
    if (button.dataset.stage) return setStage(button.dataset.stage, { focusComposer: button.dataset.stage === "session" });
    if (button.dataset.stageLink) return setStage(button.dataset.stageLink, { focusComposer: button.dataset.stageLink === "session" });
    if (button.dataset.backBrief !== undefined) return setStage("brief");
    if (button.dataset.startSession !== undefined) return setStage("session", { focusComposer: true });
    if (button.dataset.discussSuggestion) return beginSuggestion(button.dataset.discussSuggestion);
    if (button.dataset.useSessionClue) return useSessionClue(button.dataset.useSessionClue);
    if (button.dataset.deferSuggestion) {
      const suggestionIndex = state.suggestions.findIndex((item) => item.id === button.dataset.deferSuggestion);
      if (suggestionIndex >= 0) {
        const [suggestion] = state.suggestions.splice(suggestionIndex, 1);
        state.suggestions.push(suggestion);
      }
      render();
      return showToast("已移到建议列表后面");
    }
    if (button.dataset.ignoreSuggestion) {
      const fromClueMessage = Boolean(button.closest(".is-clue-update"));
      const suggestion = state.suggestions.find((item) => item.id === button.dataset.ignoreSuggestion);
      if (suggestion) suggestion.status = "ignored";
      if (state.sessionClueQueuedId === button.dataset.ignoreSuggestion) state.sessionClueQueuedId = null;
      if (fromClueMessage) state.clueUpdate.revision += 1;
      render();
      if (fromClueMessage) {
        window.requestAnimationFrame(() => $(".is-clue-update [data-use-session-clue], .is-clue-update [data-back-brief]")?.focus({ preventScroll: true }));
      }
      return showToast("本轮已忽略，刷新后仍可恢复");
    }
    if (button.dataset.expand) {
      state.expanded[button.dataset.expand] = !state.expanded[button.dataset.expand];
      return render();
    }
    if (button.dataset.refreshBrief !== undefined) return refreshBrief();
    if (button.dataset.sensingMode) {
      state.sensingMode = button.dataset.sensingMode;
      button.closest("details")?.removeAttribute("open");
      render();
      const notices = {
        off: "已切换为仅手动；只有点击“更新建议”时才检查",
        smart: "已切换为停笔后更新；切换文件或停止编辑后检查",
        continuous: "已切换为编辑时更新；编辑期间会定期检查",
      };
      return showToast(notices[state.sensingMode]);
    }
    if (button.dataset.toggleAutoRun !== undefined) {
      state.autoRun = !state.autoRun;
      button.closest("details")?.removeAttribute("open");
      render();
      return showToast(state.autoRun ? "已允许自动准备待审改动；候选仍需你审阅" : "现在只显示建议；由你决定是否运行");
    }
    if (button.dataset.showRunInline) return showRunInline(button.dataset.showRunInline, button.dataset.runTab);
    if (button.dataset.runInlineTab) {
      const inline = inlineRunState(button.dataset.runId);
      inline.tab = button.dataset.runInlineTab;
      inline.expanded = true;
      inline.openItem = null;
      renderSession();
      return window.requestAnimationFrame(() => {
        const receipt = $(`.run-receipt[data-run-id="${button.dataset.runId}"]`);
        $(`[data-run-inline-tab="${inline.tab}"]`, receipt)?.focus({ preventScroll: true });
      });
    }
    if (button.dataset.runInlineToggle !== undefined) {
      const runId = button.dataset.runId;
      const inline = inlineRunState(button.dataset.runId);
      inline.expanded = !inline.expanded;
      renderSession();
      return window.requestAnimationFrame(() => $(`.run-receipt[data-run-id="${runId}"] [data-run-inline-toggle]`)?.focus({ preventScroll: true }));
    }
    if (button.dataset.runInlineMore) {
      const runId = button.dataset.runId;
      const category = button.dataset.runInlineMore;
      const inline = inlineRunState(button.dataset.runId);
      inline.showAll[button.dataset.runInlineMore] = !inline.showAll[button.dataset.runInlineMore];
      renderSession();
      return window.requestAnimationFrame(() => $(`.run-receipt[data-run-id="${runId}"] [data-run-inline-more="${category}"]`)?.focus({ preventScroll: true }));
    }
    if (button.dataset.runInlineItem) {
      const runId = button.dataset.runId;
      const itemKey = button.dataset.runInlineItem;
      const inline = inlineRunState(button.dataset.runId);
      inline.openItem = inline.openItem === button.dataset.runInlineItem ? null : button.dataset.runInlineItem;
      renderSession();
      return window.requestAnimationFrame(() => $(`.run-receipt[data-run-id="${runId}"] [data-run-inline-item="${itemKey}"]`)?.focus({ preventScroll: true }));
    }
    if (button.dataset.locateInlineChange !== undefined) {
      const run = runById(button.dataset.runId);
      const index = run?.changes.findIndex((change) => change.id === button.dataset.changeId) ?? -1;
      const selected = index >= 0 ? run?.changes[index] : null;
      if (run?.id === state.activeRunId && index >= 0) {
        setActiveChangeIndex(index);
        state.review.viewMode = "current";
        return setStage("review", { smooth: true });
      }
      const record = selected ? blocks.get(selected.blockId) : null;
      if (!record) return showToast("当时的正文对象已不存在，记录仍可在消息中查看");
      record.element.scrollIntoView({ behavior: "smooth", block: "center" });
      record.element.focus({ preventScroll: true });
      return showToast("已定位当前版本；消息仍保留当时快照");
    }
    if (button.dataset.openRunArtifact) return openRunDialog(button.dataset.openRunArtifact, button.dataset.runTab, button);
    if (button.dataset.closeRun !== undefined) return closeRunDialog();
    if (button.dataset.runDialogTab) {
      state.runDialog.tab = button.dataset.runDialogTab;
      renderRunDialog();
      return window.requestAnimationFrame(() => $(`[data-run-dialog-tab="${state.runDialog.tab}"]`, dom.runDialog)?.focus({ preventScroll: true }));
    }
    if (button.dataset.runChange) {
      state.runDialog.selectedChangeId = button.dataset.runChange;
      renderRunDialog();
      if (window.innerWidth > 760) return;
      return window.requestAnimationFrame(() => {
        const detail = $(".run-change-detail", dom.runDialog);
        detail?.scrollIntoView({ behavior: "smooth", block: "start" });
        detail?.focus({ preventScroll: true });
      });
    }
    if (button.dataset.askInsight) return useInsight(button.dataset.askInsight, button.dataset.runId, "ask");
    if (button.dataset.proposeInsight) return useInsight(button.dataset.proposeInsight, button.dataset.runId, "propose");
    if (button.dataset.stopRun !== undefined) return stopRun();
    if (button.dataset.redirectRun !== undefined) return queueRunDirective();
    if (button.dataset.liveReviewNav === "previous") return moveReview(-1);
    if (button.dataset.liveReviewNav === "next") return moveReview(1);
    if (button.dataset.liveOpenReview !== undefined) return startReview();
    if (button.dataset.locateRunChange) {
      const run = runById(state.runDialog.runId);
      const index = run?.changes.findIndex((change) => change.id === button.dataset.locateRunChange) ?? -1;
      const selected = index >= 0 ? run?.changes[index] : null;
      closeRunDialog({ restoreFocus: false });
      if (run?.id === state.activeRunId && index >= 0) {
        setActiveChangeIndex(index);
        state.review.viewMode = "current";
        return setStage("review", { smooth: true });
      }
      const record = selected ? blocks.get(selected.blockId) : null;
      if (!record) return showToast("当时的正文对象已不存在，审阅记录仍可只读查看");
      record.element.scrollIntoView({ behavior: "smooth", block: "center" });
      record.element.focus({ preventScroll: true });
      return showToast("已定位当前版本；审阅记录仍按当时快照显示");
    }
    if (button.dataset.openGraphFromRun !== undefined) {
      closeRunDialog({ restoreFocus: false });
      return openGraphDialog(button, "graph");
    }
    if (button.dataset.openMaterials) return openGraphDialog(button, button.dataset.openMaterials);
    if (button.dataset.openGraph !== undefined) return openGraphDialog(button, "graph");
    if (button.dataset.closeGraph !== undefined) return closeGraphDialog();
    if (graphSurface.handleButton(button, dom.graphDialog.open ? dom.graphDialog : document)) return;
    if (button.dataset.viewSource) return showToast(`打开来源：${state.sources.find((source) => source.id === button.dataset.viewSource)?.title || "Vault 文档"}`);
    if (button.dataset.useSource) {
      if (dom.graphDialog.open) closeGraphDialog({ restoreFocus: false });
      if (dom.runDialog.open) closeRunDialog({ restoreFocus: false });
      const sourceContextId = `source:${button.dataset.useSource}`;
      state.contextIds = state.contextIds.filter((id) => id !== "knowledge");
      if (!state.contextIds.includes(sourceContextId)) state.contextIds.push(sourceContextId);
      const source = state.sources.find((item) => item.id === button.dataset.useSource);
      state.sessionTitle = source ? `用「${source.title}」补清判断依据` : "用相关材料补清判断依据";
      return setStage("session", { focusComposer: true });
    }
    if (button.dataset.useThought) {
      state.sessionTitle = "为未安放想法寻找位置";
      return bindCapability("suggest-split", { taskTitle: state.sessionTitle });
    }
    if (button.dataset.capability) return bindCapability(button.dataset.capability);
    if (button.dataset.openCapabilities !== undefined) return openPicker("capability");
    if (button.dataset.addContext !== undefined) return openPicker("context");
    if (button.dataset.voice !== undefined) return toggleVoice();
    if (button.dataset.send !== undefined) return submitPrompt();
    if (button.dataset.removeCapability !== undefined) {
      state.selectedCapability = null;
      return renderComposer();
    }
    if (button.dataset.removeContext) {
      state.contextIds = state.contextIds.filter((id) => id !== button.dataset.removeContext);
      return renderComposer();
    }
    if (button.dataset.capabilityChoice) return bindCapability(button.dataset.capabilityChoice);
    if (button.dataset.contextChoice) return addContext(button.dataset.contextChoice);
    if (button.dataset.closeDialog !== undefined) return closePicker();
    if (button.dataset.startReview !== undefined) return startReview();
    if (button.dataset.reviewNav === "previous") return moveReview(-1);
    if (button.dataset.reviewNav === "next") return moveReview(1);
    if (button.dataset.reviewMode) return setReviewMode(button.dataset.reviewMode);
    if (button.dataset.documentChangeIndex !== undefined) {
      return selectDocumentChange(Number(button.dataset.documentChangeIndex));
    }
    if (button.dataset.reviewAction === "accept") return resolveChange("accept");
    if (button.dataset.reviewAction === "edit-accept") return resolveChange("edit-accept");
    if (button.dataset.reviewAction === "reject") return resolveChange("reject");
    if (button.dataset.reviewAction === "accept-all") return acceptAllChanges();
    if (button.dataset.changeIndex !== undefined) {
      const index = Number(button.dataset.changeIndex);
      setActiveChangeIndex(index);
      state.review.viewMode = "current";
      render();
      locateActiveChange(true);
      return window.requestAnimationFrame(() => {
        $(`.change-row[data-change-index="${index}"]`, dom.content)?.focus({ preventScroll: true });
      });
    }
    if (button.dataset.historyId) {
      if (dom.runDialog.open) closeRunDialog({ restoreFocus: false });
      return openHistoryDialog(button.dataset.historyId);
    }
    if (button.dataset.closeHistory !== undefined) return closeHistoryDialog();
    if (button.dataset.locateHistory !== undefined) {
      closeHistoryDialog();
      showToast("已定位到事务目标；此 mock 保留正文当前视图");
      return;
    }
    if (button.dataset.rollbackHistory !== undefined) {
      closeHistoryDialog();
      showToast("已模拟回滚；正式实现需要先做 stale/conflict 检查");
    }
  }

  document.addEventListener("click", handleDocumentClick);

  dom.liveChangeNav.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-review-mode]");
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const modes = $$('[data-review-mode]', dom.liveChangeNav).filter((button, index, all) => (
      all.findIndex((candidate) => candidate.dataset.reviewMode === button.dataset.reviewMode) === index
    ));
    const currentIndex = modes.findIndex((button) => button.dataset.reviewMode === current.dataset.reviewMode);
    if (currentIndex < 0 || modes.length === 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = modes.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % modes.length;
    setReviewMode(modes[nextIndex].dataset.reviewMode);
  });

  dom.paper.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-document-change-index]");
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (!current || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const count = state.review.changes.length;
    if (!count) return;
    event.preventDefault();
    const currentIndex = Number(current.dataset.documentChangeIndex);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = count - 1;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + count) % count;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % count;
    pendingDocumentPinFocus = nextIndex;
    selectDocumentChange(nextIndex, { reveal: false, focus: false });
  });

  document.addEventListener("keyup", (event) => {
    if (pendingDocumentPinFocus === null) return;
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const index = pendingDocumentPinFocus;
    pendingDocumentPinFocus = null;
    $(`[data-document-change-index="${index}"]`, dom.paper)?.focus({ preventScroll: true });
  });

  dom.prompt.addEventListener("input", () => {
    const value = dom.prompt.value;
    if (/(^|\s)\/$/.test(value)) {
      dom.prompt.value = value.replace(/\/$/, "");
      updatePromptState();
      openPicker("capability");
      return;
    }
    if (value.endsWith("[[")) {
      dom.prompt.value = value.slice(0, -2);
      updatePromptState();
      openPicker("context");
      return;
    }
    updatePromptState();
  });

  dom.prompt.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submitPrompt();
  });

  dom.content.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-run-inline-tab]");
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const receipt = current.closest(".run-receipt");
    const tabs = $$('[data-run-inline-tab]', receipt);
    const currentIndex = tabs.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    const runId = tabs[nextIndex].dataset.runId;
    const inline = inlineRunState(runId);
    inline.tab = tabs[nextIndex].dataset.runInlineTab;
    inline.expanded = true;
    inline.openItem = null;
    renderSession();
    window.requestAnimationFrame(() => {
      const nextReceipt = $(`.run-receipt[data-run-id="${runId}"]`);
      $(`[data-run-inline-tab="${inline.tab}"]`, nextReceipt)?.focus({ preventScroll: true });
    });
  });

  dom.capabilitySearch.addEventListener("input", renderPickerResults);

  dom.capabilityDialog.addEventListener("click", (event) => {
    if (event.target === dom.capabilityDialog) closePicker();
  });

  dom.historyDialog.addEventListener("click", (event) => {
    if (event.target === dom.historyDialog) closeHistoryDialog();
  });

  dom.runDialog.addEventListener("click", (event) => {
    if (event.target === dom.runDialog) closeRunDialog();
  });

  dom.runDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeRunDialog();
  });

  dom.runDialog.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-run-dialog-tab]");
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = $$('[data-run-dialog-tab]', dom.runDialog);
    const currentIndex = tabs.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    state.runDialog.tab = tabs[nextIndex].dataset.runDialogTab;
    renderRunDialog();
    window.requestAnimationFrame(() => $(`[data-run-dialog-tab="${state.runDialog.tab}"]`, dom.runDialog)?.focus({ preventScroll: true }));
  });

  dom.graphDialog.addEventListener("click", (event) => {
    if (event.target === dom.graphDialog) closeGraphDialog();
  });

  dom.graphDialog.addEventListener("change", (event) => {
    graphSurface.handleChange(event.target);
  });

  dom.graphDialog.addEventListener("pointerover", (event) => graphSurface.handlePointerOver(event, dom.graphDialog));
  dom.graphDialog.addEventListener("pointerout", (event) => graphSurface.handlePointerOut(event, dom.graphDialog));
  dom.graphDialog.addEventListener("dblclick", (event) => graphSurface.handleDoubleClick(event));
  dom.graphDialog.addEventListener("pointerdown", (event) => graphSurface.handlePointerDown(event));
  dom.graphDialog.addEventListener("pointermove", (event) => graphSurface.handlePointerMove(event, dom.graphDialog));
  dom.graphDialog.addEventListener("pointerup", (event) => graphSurface.handlePointerUp(event, dom.graphDialog));
  dom.graphDialog.addEventListener("pointercancel", (event) => graphSurface.handlePointerUp(event, dom.graphDialog));
  dom.graphDialog.addEventListener("wheel", (event) => graphSurface.handleWheel(event, dom.graphDialog), { passive: false });

  dom.graphDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeGraphDialog();
  });

  dom.graphDialog.addEventListener("keydown", (event) => {
    const sourceRow = event.target.closest("[data-result-source]");
    if (sourceRow && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const rows = $$('[data-result-source]', dom.graphDialog).filter((row) => row.offsetParent !== null);
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

    const current = event.target.closest("[data-result-view], [data-graph-preset]");
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const selector = current.dataset.resultView ? "[data-result-view]" : "[data-graph-preset]";
    const tabs = $$(selector, dom.graphDialog);
    const currentIndex = tabs.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    const next = tabs[nextIndex];
    graphSurface.handleButton(next, dom.graphDialog);
    window.requestAnimationFrame(() => {
      const value = next.dataset.resultView || next.dataset.graphPreset;
      $(`${selector}[data-${current.dataset.resultView ? "result-view" : "graph-preset"}="${value}"]`, dom.graphDialog)?.focus({ preventScroll: true });
    });
  });

  dom.stageTabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = $$("[data-stage]", dom.stageTabs).filter((tab) => !tab.disabled);
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0 || tabs.length === 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    const nextTab = tabs[nextIndex];
    setStage(nextTab.dataset.stage);
    window.requestAnimationFrame(() => nextTab.focus({ preventScroll: true }));
  });

  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable;
    if (event.key === "Escape") {
      if (dom.capabilityDialog.open) return closePicker();
      if (dom.runDialog.open) return closeRunDialog();
      if (dom.historyDialog.open) return closeHistoryDialog();
      if (dom.graphDialog.open) return closeGraphDialog();
      if (state.voiceActive) return toggleVoice();
      if (window.innerWidth <= 1180 && state.panelOpen) {
        state.panelOpen = false;
        return render();
      }
    }
    const documentReviewActive = state.mode === "copilot"
      && (state.stage === "review" || (state.stage === "session" && ["reviewable", "reviewing"].includes(state.review.status)));
    if (!typing && event.altKey && documentReviewActive && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      return moveReview(event.key === "ArrowUp" ? -1 : 1);
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === "a") return setVariant("adaptive");
    if (event.key.toLowerCase() === "b") return setVariant("staged");
    if (event.key.toLowerCase() === "c") return setVariant("hybrid");
    if (event.key === "1") return setStage("brief");
    if (event.key === "2") return setStage("session");
    if (event.key === "3") return setStage("review");
  });

  render();
})();
