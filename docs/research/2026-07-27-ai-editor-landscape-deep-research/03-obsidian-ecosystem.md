# 03 · Obsidian 生态调研原稿：超级插件先例 + AI 竞品 + 官方路线（2026-07-27）

> 调研 agent 原始产出，供 README.md 综合分析引用。

## 1. Make.md —— "做太宽"的头号前车之鉴

- 定位：all-in-one 组织层——Spaces（自定义文件导航，替代 file explorer）、Contexts（no-code 数据库，对标 Dataview/Notion DB）、Flow/Flow Styler（块级编辑覆盖层）、日历/看板/画廊/表格视图。功能上同时对标 Dataview、Kanban、file explorer 和模板。
- 规模：836,517 下载、1,988 stars，Obsidian Stats 评分 70/100，**零用户评论**；最新版本仍在修基础渲染 bug。
- **核心抱怨（用户原话）**：论坛有整帖要求把文件导航功能拆成独立轻量插件——"Spaces is 1/5 of the plugin itself"（Galaxy_Emperor），Make.md 的缓存进程在大 vault 里吃到 **90% CPU/内存**、启动冻结，其余功能"要么用不上、要么被 Obsidian 原生功能取代"。
- 可靠性抱怨："causing me more frustration than benefit"（Aboyne）；"I've sort of stopped using MAKE.md because… it seems to be more of an inconvenience than a plus"（Bluemoondragon07）。
- 现状：未停更（月更多次），但模式是"宽表面积 → 慢性小 bug 消耗 → 重度用户流失 → 公开要求拆包"。
- 来源：https://forum.obsidian.md/t/make-spaces-by-make-md-a-separate-plugin-or-develop-another-one-with-the-same-functions-but-fast-and-lightweight/93901 ；https://forum.obsidian.md/t/about-the-make-md-plugin/80095 ；https://www.obsidianstats.com/plugins/make-md

## 2. Excalidraw —— 巨型插件却口碑极好的反例

- 6,848,062 下载、7,352 stars、**5.0/5 评分**（89/100）。功能绝对数量比 Make.md 还大（绘图、OCR、导出、LaTeX、脚本 API、AI、嵌入）。
- **纪律差异不在"少做"，而在"单域做深 + markdown 一等公民"**：
  - v1.2.0 起画板是 `.excalidraw.md` 真 markdown 文件（YAML frontmatter + Text Elements 段 + 内联 JSON）→ 出现在 graph view、backlinks、搜索里。
  - `[[wiki links]]` 在画板文本里工作且随重命名自动更新；透传 `![[file#^blockref]]`。
  - 显式设计为 Obsidian 之外可读可编辑（LogSeq、excalidraw.com、VS Code）。
  - **从不碰 file explorer、数据库、看板——单域纪律**。
- 来源：https://www.obsidianstats.com/plugins/obsidian-excalidraw-plugin ；https://github.com/zsviczian/obsidian-excalidraw-plugin

## 3. Kanban / Excalidraw 的"自定义视图 over markdown round-trip"模式——自建编辑器视图的直接先例

- Kanban 技术模式：给带 `kanban-plugin: board` frontmatter 的 `.md` 注册自定义 ItemView，"a visual layer over Markdown"——lanes 是 `##` 标题、cards 是列表项，**文件在插件外 100% 可读可编辑**。
- 竞品 Kanban for Professionals 把 **byte-level round-trip fidelity 当硬要求**：内置 "board validator that round-trips your file and reports any byte-level diff"。
- 风险面：Kanban 原作者退出、"seeking new maintainers"、533 open issues、一年多没发版、随 Obsidian 升级持续破损——**自定义视图需要持续追赶上游变化**。
- 来源：https://deepwiki.com/obsidian-community/obsidian-kanban ；https://github.com/mgmeyers/obsidian-kanban/issues/1157

## 4. Dataview → Datacore + 官方 Bases

- Datacore：同一作者（blacksmithgu）从零重写（2-10x 性能 + 可交互视图 + 放弃 DQL），**但下载 303K vs Dataview 4,639K**——同一位受信作者的继任者都撼不动存量，beta 拖了数年仍主要靠 BRAT 安装。
- **官方 Bases（2025/8, 1.9.x）是更大的冲击**：table/card/list/map 视图、公式、过滤，直接建在 Properties 上。社区评价："roughly the 'official version' of Dataview"，但**不完全替代**（"Bases only does note level… doesn't do inline properties"）。
- **2026 官方 roadmap（实时核查）**：已 shipped——Bases API、Map/List views、CSV 导入、Bases summaries、Bases search；**进行中——Kanban view for Bases**；计划——Calendar view、Publish 支持、聚合计算。**Obsidian 核心正在直接走进"数据库视图/看板视图"领地**。
- 来源：https://forum.obsidian.md/t/dataview-vs-bases/113073 ；https://obsidian.md/roadmap/ ；https://www.obsidianstats.com/plugins/datacore

## 5. AI 插件竞品（2026 快照）

- **Copilot for Obsidian（Brevilabs）**：商业化最成熟。定价 Free(BYOK) / Plus $14.99/mo（$139.99/yr）/ Self-Host $349.99 一次性。GitHub 抱怨集中在**性能**："Obsidian slows down over time when Copilot is enabled (possible memory leak)"（#1852）、"load times are almost doubled with copilot even with no Api key"（#1257）、"chat extremely slow after 2-3 conversation turns"（#2065）、订阅+API 双重付费抵触（#2034）。
- **Smart Connections**：免费核心 + Pro 插件层订阅。弱点："struggles with large vaults and requires manual configuration"。
- **Text Generator**：纯文本处理器（无 RAG），维护放缓但仍活跃。
- **Claude Code / Codex 集成类（2026 新品类）**：**Claudian**（vault 即 agent 工作目录，需本地 Claude Code CLI）+ Claude Code IDE + obsidian-claude-code-plugin 等多个竞争者——**品类正在碎片化，尚无整合赢家**。
- 结构性空白（第三方分析）：Obsidian 核心不带 MCP/OAuth server，每个 AI 插件都在重复发明 auth/桥接；"the AI tax of running Obsidian + a stack of brittle plugins is real"；没有任何插件有带 review queue 的原生 agent/automation 层。
- 来源：https://www.obsidiancopilot.com/en/pricing ；https://github.com/logancyang/obsidian-copilot/issues/1852 ；https://mindwiki.io/blog/obsidian-plus-ai-landscape-and-alternative ；https://github.com/YishenTu/claudian

## 6. Obsidian 官方路线与平台立场（2025-2026）

- 核心吸收轨迹：Bases（2025/8）→ Bases API/视图扩展（2025/11）→ Headless Sync、CLI、Bases search（2026/2）→ Siri/Shortcuts、mobile widgets、mobile UI 刷新（2026/1）→ 社区目录自动审查（2026/5）。**进行中：Kanban view for Bases + "Obsidian for Work"（企业插件治理）**。
- **Editor API 约束（自建编辑器视图的最大技术风险）**：官方 dev docs 承认 "building editor extensions can be challenging"；开发者报告**为自定义文件类型建独立 CodeMirror 实例会得到 broken editor experience，必须复用 Obsidian 的同一份 CM6 类实例——import 另一份 CM6 构建会静默破坏注册**。
- **官方 AI 立场**：不做 in-app "Ask AI" 按钮。CEO Steph Ango 2025 年底发布 **Obsidian Skills**（开源 repo，教 AI agent——特别是 Claude——使用 Obsidian 约定），明确选 Claude 为"官方"AI 伙伴（Claude Code 原生文件访问 + Anthropic local-first 隐私立场）。Skills 刻意"short, focused, and composable"——**官方哲学背书"窄而组合的工具"而非"大 AI 按钮"**。
- **Mobile 限制**：~30% 桌面插件无移动实现；插件类别无法做 widgets/OS 通知/Siri（官方自己做了）。2026 社区报告卡：Desktop 4.5 / **Mobile 3.1** / Community Plugins 4.5 / **Bases 4.4** / Automation 3.6。"lots of Community plugins that lose steam"（无偿维护者难以为继），Excalidraw 被当作健康存活的例外。
- 来源：https://obsidian.md/roadmap/ ；https://docs.obsidian.md/Plugins/Editor/Editor+extensions ；https://practicalpkm.com/2026-obsidian-report-card/ ；https://www.aiwithmo.com/blog/steph-ango-obsidian-skills

## 7. Plugin fatigue / 极简风潮是真的吗

- 是。2026 年买家指南共识数字："**Fewer than 20 plugins is the safe limit**… problems begin past 40"；哲学表述："Fewer, well-configured plugins typically outperform a bloated stack"。
- 新手引导反复强调"do not install 20 plugins on day one"、先空 vault 用两周。
- 理想插件的描述："disappear into your workflow — tools so integrated you forget they're there"。
- **生态揭示偏好一致**：奖励"窄、深、markdown-faithful"，惩罚"宽、浅、UI 接管"——即使宽的那个做得认真且活跃维护（Make.md）。
- 来源：https://www.obsibrain.com/blog/top-obsidian-plugins-in-2026-the-essential-list-for-power-users ；https://www.aitooldiscovery.com/guides/obsidian-reddit
