# Peak Assistant UI 综合调研与改进报告

> 调研日期：2026-04-18
> 方法：Playwright 自动化截图 + 真实 Obsidian 环境手动截图 + 竞品调研 + 学术文献 + 项目内设计文档交叉验证

---

## 一、行业产品调研

### 1.1 主流 AI Chat 产品 UI 趋势

**三大产品的界面哲学：**

| 产品 | 核心定位 | UI 哲学 | 关键 UX 特征 |
|------|---------|---------|-------------|
| ChatGPT | 通用工作台 | "一站式完成所有任务" | Canvas（独立编辑面板）、GPTs 市场、文件上传即分析 |
| Claude | 长文本协作 | "极简 + 紫色调 + Projects" | Artifacts（侧栏输出物）、Projects（上下文分组）、双栏布局 |
| Gemini | Google 生态嵌入 | "AI 在你已有工具中出现" | Gem 模板、Deep Research、与 Docs/Gmail 深度集成 |

**2025-2026 共性趋势：**

1. **结构化回复 > 文本墙** — 所有产品都在向格式化输出发展：代码块、表格、引用、折叠区域。纯文本流式输出已是上一代 UI。
2. **Artifacts / Canvas 模式** — 将"AI 的交付物"从"对话流"中分离出来，放到独立面板。这是 2024-2025 最重要的 AI UI 创新。ChatGPT 的 Canvas、Claude 的 Artifacts、Gemini 的 Deep Research 侧栏都是这一范式。
3. **Process 可见但默认折叠** — ChatGPT 的 "Show thinking"、Claude 的思考过程折叠、Gemini 的 "Show research steps" 都采用"先展示结果，按需展开过程"的 progressive disclosure 模式。
4. **情感化与拟人化** — 打字指示器、情绪感知 UI、个性化语气调节。但这与 Obsidian 的"工具感"定位不完全兼容。
5. **Mobile-first 但 Desktop-aware** — 触控友好按钮、响应式布局、语音输入。Obsidian 桌面端为主，但 iPad 用户增长中。

**参考来源：**
- [Chatbot UI Best Practices 2026 - Vynta](https://vynta.ai/blog/chatbot-ui/)
- [Comparing Conversational AI Tool UIs 2025 - IntuitionLabs](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)

### 1.2 AI 搜索产品：Perplexity 的 Citation-Forward 设计

Perplexity 重新定义了 AI 搜索 UX 的核心原则：

1. **Citation-forward（引用前置）** — 每个事实后跟随 [1][2] 编号引用，用户可一键验证。改变了"搜索结果 = 有序列表"的旧范式，变为"搜索结果 = 信息综合 + 可追溯来源"。
2. **Source panel（来源面板）** — 左栏回答 + 右栏来源列表，信息与来源并排而非分页切换。
3. **Follow-up questions（追问建议）** — 回答后自动建议"你可能还想问"，降低用户发起下一轮搜索的认知成本。
4. **Speed + Verification + Synthesis** — 用户可以在"提问 → 回答 → 来源验证"之间快速切换，不需要上下文切换。

**参考来源：**
- [Perplexity Platform Guide: Citation-Forward Answers](https://www.unusual.ai/blog/perplexity-platform-guide-design-for-citation-forward-answers)
- [AI UX Patterns: Citations - ShapeofAI](https://www.shapeof.ai/patterns/citations)

### 1.3 AI IDE 产品：Cursor / Windsurf 的 Trace 处理

Cursor 和 Windsurf 作为 AI 编码助手，同样面临"展示 AI 过程 vs 直接给结果"的设计选择：

- **Cursor Agent**：tool calls（文件搜索、代码编辑）以简洁的一行摘要显示（"Searched 3 files" / "Edited main.ts"），点击展开详情。不显示完整 JSON 输入/输出。
- **Windsurf Cascade**：同样折叠 context 检索步骤，只展示最终代码和说明。额外提供 Memories（学习用户模式）和 Codemaps（可视化架构）。
- **共性模式**：所有 AI IDE 都采用 **"一行摘要 + 可展开详情"** 模式处理 agent trace，而非默认展示完整执行日志。

**参考来源：**
- [Windsurf vs Cursor 2026 - NxCode](https://www.nxcode.io/resources/news/windsurf-vs-cursor-2026-ai-ide-comparison)

### 1.4 知识管理产品：Notion AI / Heptabase

**Notion AI（3.0, 2025-2026）：**
- 引入自主 AI Agents（多步工作流执行）
- Wiki 功能：任何 database 可变为可搜索知识库，带自动分类和 AI Q&A
- 关键差异化：跨整个 workspace 的上下文感知，不仅限于当前页面
- 从"被动工具"到"主动助手"的产品转型

**Heptabase 的图视化知识管理（竞品调研已记录在 memory）：**
- 白板为核心隐喻，卡片可自由拖拽分组
- 图只服务于知识构建的具体动作（分组、连线、标注），不提供纯粹的"全局概览"

**参考来源：**
- [Notion AI Review 2026](https://max-productive.ai/ai-tools/notion-ai/)
- [Notion AI vs Coda AI 2026](https://aiproductivity.ai/blog/notion-ai-vs-coda-ai/)

---

## 二、Obsidian 生态与用户习惯

### 2.1 Obsidian 插件 UX 隐性规范

2500+ 插件形成的社区约定：

1. **设置页面** — 嵌入 Obsidian Settings → Community Plugins → 你的插件。标准布局：左侧 label + description，右侧控件。折叠区域用于分组。
2. **模态框** — 继承 `Modal` 类，Esc 关闭，不覆盖其他 Obsidian 功能。
3. **侧栏** — Obsidian 原生左右侧栏（`ItemView`）。插件应使用原生 leaf 而非自建侧栏。
4. **命令面板** — Cmd+P 触发，所有重要操作注册为命令。用户期望 AI 功能也能通过命令面板触达。
5. **Quick Switcher 范式** — Cmd+O 打开，输入即搜索，回车打开文件。核心交互模式之一。
6. **设计哲学** — Obsidian 创始人 Ango 将 Obsidian 与"千篇一律的 Bootstrap 网页"对立——插件系统是"创造性表达"的赌注，但社区仍期望基本的一致性和质量。

**社区设计资源：** [Obsidian Design System - Figma](https://www.figma.com/community/file/1172227339881210762/obsidian-design-system)

### 2.2 Obsidian AI 插件竞品：社区痛点

对 Copilot / Smart Connections 的主要社区反馈：

| 痛点 | 具体表现 | Peak Assistant 状态 |
|------|---------|-------------------|
| API Key 管理繁琐 | 每个插件独立配置 key，model 支持有限 | ✅ 已解决：Multi-provider 统一配置 + AES-GCM 加密 |
| 本地模型兼容性差 | Ollama/OpenRouter 支持不足 | ✅ 已解决：Ollama + OpenRouter 原生支持 |
| 付费墙争议 | Smart Connections $20/月引发社区反弹 | ✅ 优势：免费开源插件 |
| 插件冲突 | 多个 AI 插件同时安装会崩溃 | ⚠️ 需关注：未验证与其他 AI 插件的兼容性 |
| 缺乏标准 AI 接口 | 社区讨论"为什么没有统一的 LLM 接口插件" | 🔄 机会：有可能成为事实标准 |

**参考来源：**
- [Obsidian Forum: 为什么没有标准 AI 接口插件？](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)
- [Smart Connections vs Copilot 比较](https://smartconnections.app/obsidian-copilot/)

### 2.3 Obsidian 用户画像

| 特征 | 描述 | 对设计的启示 |
|------|------|-------------|
| Power user 占比高 | 愿意学习快捷键和语法，但期望回报 | 高级语法（# / @ / : / [[）正确；但要有新手入口 |
| Markdown-first | 所有内容最终要能变成 .md 文件 | AI 分析结果持久化为 Markdown 是正确方向 |
| 隐私敏感 | 本地存储优先，反感数据上云 | 本地 Ollama 支持 + 加密 Key 是核心卖点 |
| 定制欲强 | CSS snippets, 社区主题，个性化工作流 | 提供 configurability（templates/config）而非 hardcode |
| 知识管理导向 | 不只是"问 AI"，而是"用 AI 管理知识" | 搜索 + 图谱 + 分析三合一是正确产品方向 |

---

## 三、学术研究基础

### 3.1 Information Foraging Theory（信息觅食理论）

**来源：** Pirolli & Card, PARC, 1999

**核心概念：** 用户在搜索信息时，行为类似动物觅食——遵循"信息气味"（Information Scent）最大化获取价值、最小化认知成本。

**关键原理：**
- **信息气味越强，用户越快找到目标** — 搜索结果的 snippet 质量直接影响用户是否点击
- **Patch 导航** — 用户在"信息丰富区域"停留，"信息贫瘠区域"快速离开
- **成本-收益分析** — 用户持续评估"继续在当前位置搜索"vs"换个地方搜索"的收益

**对 Peak Assistant 的设计启示：**
- 搜索结果中 "0 days ago" 是**极弱的信息气味**——无法帮助用户区分哪个结果更值得点击
- Heading 匹配的紫色 "H" 标识是**强信息气味**——正面设计
- 文件路径过长截断后变成噪声，降低了信息气味

**参考来源：**
- [Information Foraging Theory - NNGroup](https://www.nngroup.com/articles/information-foraging/)
- [Information Scent - NNGroup](https://www.nngroup.com/articles/information-scent/)
- [Enhancing Snippet Visualizations for Web Search (2024)](https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2443267)

### 3.2 Progressive Disclosure（渐进式披露）

**来源：** NNGroup 经典研究

**核心定义：** 将高级或不常用功能推迟到二级界面，减少当前任务的认知负荷。

**量化效果：** 渐进式界面比全量展示界面快 **30-50%** 完成初始任务。

**三种实现模式：**
1. **Staged disclosure** — 分步骤引导（如 setup wizard）
2. **Inline expansion** — 点击展开详情（如"显示更多"）
3. **Optional depth** — 提供入口但不强制进入（如"高级设置"链接）

**在 AI 产品中的应用趋势：**
- ChatGPT "Show thinking" = inline expansion
- Claude Artifacts 折叠 = inline expansion  
- Cursor agent trace = 一行摘要 + 可展开 = inline expansion

**对 Peak Assistant 的直接适用场景：**
1. Chat trace — 应默认折叠为一行摘要，点击展开
2. Input placeholder — 信息量过大，应只保留核心提示
3. 快捷按钮（Transfer To Project / Update Articles / Code Review）— 应在有对话内容后再显示

**参考来源：**
- [Progressive Disclosure - NNGroup](https://www.nngroup.com/articles/progressive-disclosure/)
- [Progressive Disclosure in AI - AI Design Patterns](https://www.aiuxdesign.guide/patterns/progressive-disclosure)
- [What is Progressive Disclosure? - IxDF](https://ixdf.org/literature/topics/progressive-disclosure)

### 3.3 Cognitive Load Theory（认知负荷理论）

**来源：** Sweller, 1988

**三种认知负荷：**
| 类型 | 定义 | 设计目标 |
|------|------|---------|
| 内在负荷 (Intrinsic) | 任务本身的复杂性 | 不可减少，但可分解 |
| 外在负荷 (Extraneous) | UI 设计增加的不必要复杂性 | **应消除** |
| 相关负荷 (Germane) | 帮助用户构建心智模型的有益复杂性 | **应增加** |

**Peak Assistant UI 元素的认知负荷分类：**

| UI 元素 | 负荷类型 | 判定 | 行动 |
|---------|---------|------|------|
| Trace JSON（展开的 Input/Output）| 外在负荷 | 用户不需要看 `startTimestamp: 1776474609827` | 默认隐藏 |
| "No model selected" + "Used 0"（红色）| 外在负荷 | 用户不知道这意味着什么，徒增焦虑 | 改为引导式 |
| Search mode 下拉菜单 | 相关负荷 | 帮用户理解搜索能力 | 保持，好设计 |
| 文件 diff 预览（+21 -33）| 相关负荷 | 清晰展示 AI 做了什么修改 | 保持，好设计 |
| Conversation Outline 右侧栏 | 相关负荷 | 帮用户把握对话结构 | 保持，好设计 |
| Provider 双栏设置页 | 相关负荷 | 直观展示 provider/model 关系 | 保持，benchmark 级设计 |

### 3.4 Empty State 设计研究

**来源：** Smashing Magazine, Mobbin, UXPin

**核心原则：**
- Empty state 是用户的"第一印象时刻"——可以成就或毁掉产品的关键指标
- 好的 empty state = **引导行动的画布**，不是空白页面
- 三要素：个性化插画/icon + 友好文案 + **主要行动按钮（CTA）**
- "Starter content"：预填示例或模板，展示功能可能的样子

**Peak Assistant 的 empty state 现状：**
| 页面 | 现状 | 评价 |
|------|------|------|
| Chat 空对话 | "Ready when you are." | ✅ 简洁优雅，但缺少引导 |
| Chat Home 无项目 | "No projects yet. Create your first project to see it here." + 空文件夹 icon | ⚠️ 有文案但缺少 CTA 按钮 |
| Settings 全折叠（mock 环境）| 3 个灰色标题 + 大量空白 | ❌ 看起来像"坏了" |
| Inspector 无链接 | "No links for this note. Open a note and try again." | ⚠️ 指令不清晰 |
| AI Analysis tab | 完全空白 | ❌ P0 bug |

**参考来源：**
- [Empty States in User Onboarding - Smashing Magazine](https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/)
- [Empty State UI Design - Mobbin](https://mobbin.com/glossary/empty-state)
- [Designing the Overlooked Empty States - UXPin](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/)

---

## 四、我们的设计初衷 vs 现状

### 4.1 项目内设计文档梳理

| 设计理念 | 来源文档 | 当前落地情况 |
|---------|---------|-------------|
| "搜索 = 锚初始化 → 受控图遍历 → 路径闭合验证" | `docs/graph-design.md` | 搜索后端已实现，前端 Inspector 部分呈现 |
| "看到正确的连接，而非所有连接" | memory: `research_doc_network_visualization.md` | Graph 的 Hops / Path 功能已实现 |
| "LLM 推理只用在真正连续性问题上" | V2 search redesign spec | 查询分类和 playbook 已设计，部分实现 |
| "Process View vs Report View 分离" | V2 search redesign spec | AI Analysis 的 Process/Report/Sources tab 已实现 |
| "渐进式单组件（active 展开，completed 折叠）" | memory: `project_ai_search_ui_refactor.md` | Search 部分已采用，**Chat trace 尚未采用** |
| "现代优雅、streaming 优先、每步独立可测" | memory: `feedback_design_approach.md` | streaming 已大量使用，部分 UI 仍需打磨 |
| "Graph 服务于行动，不是审美欣赏" | memory: `research_doc_network_visualization.md` | 原则正确，Inspector 高缩放下待改进 |
| "Filtering = spotlight, not scissors" | memory: `research_doc_network_visualization.md` | 部分实现（不匹配节点 dim 而非消失） |

### 4.2 核心 Gap 分析

**Gap 1：Chat trace 的 progressive disclosure 缺失**
```
设计理念:  "active step 展开, completed steps 折叠"（AI Search UI 已实现）
Chat 现状:  trace 5 步全部默认显示，展开时显示完整 JSON，占据整个视口
行业基准:  Cursor/Windsurf 的一行摘要模式、Claude 的 thinking 折叠
根本原因:  Chat 和 Search 的 trace 组件没有统一，Chat 侧没有应用 Search 的设计模式
```

**Gap 2：新手引导的完全缺失**
```
设计理念:  "每步独立可测"的工程原则正确，但没有对应的 UX 原则
Chat 现状:  "No model selected" + "Used 0"（红色），用户不知道下一步
行业基准:  ChatGPT 自动选默认 model、Claude 直接可用、Notion AI 一键开启
根本原因:  Multi-provider 架构的灵活性带来了额外的配置成本，没有设计 "零配置即可用" 路径
```

**Gap 3：信息气味不均匀**
```
设计理念:  搜索结果应帮助用户快速判断（信息觅食理论）
搜索现状:  "0 days ago" 时间戳无区分、路径截断后不可读、In-file 结果重复
Inspector:  500% zoom 下标签巨大不可读
行业基准:  Perplexity 的 citation 编号、Google 的 snippet 高亮
根本原因:  前端显示逻辑没有针对"信息气味"优化，只做了数据映射
```

**Gap 4：设计质量不均匀**
```
高水平组件:  Provider Settings 双栏、Search Mode 下拉、文件 diff 预览
低水平组件:  Chat Home 大量空白、Inspector empty state、Settings mock 全折叠
根本原因:  各功能模块开发时间不同，缺少全局设计审查机制
```

---

## 五、发现的问题汇总

### 5.1 Bug 列表

| ID | Bug | 严重度 | 发现方式 |
|----|-----|--------|---------|
| B1 | AI Analysis tab 切换后渲染空白页面 | **P0** | Playwright + 真实环境 |
| B2 | Desktop dev 环境白屏（缺 es-toolkit / util / fs / path / claude-agent-sdk / electron 的 browser mock） | **P1** | Playwright（**本次已修复**） |
| B3 | Chat input 残留反斜杠（图 7 中 "hello\"） | P2 | 真实截图 |

### 5.2 UX 问题清单

#### Chat 页面

| ID | 问题 | 维度 | 优先级 | 理论依据 |
|----|------|------|--------|---------|
| C1 | Sidebar conversation 名称截断过激（"我的独立开发产品 idea 的综合评价 给我快速致..."） | UX/信息论 | **P1** | 信息气味弱 |
| C2 | Trace 步骤默认展开，显示完整 JSON | 第一性原理 | **P1** | Progressive Disclosure、认知负荷（外在） |
| C3 | Trace 与消息之间缺乏视觉分隔 | UX | **P1** | 认知负荷 |
| C4 | "No model selected" + "Used 0"（红色） | 第一性原理/UX | **P0** | Empty state 研究 |
| C5 | 空对话状态显示 Transfer/Update/CodeReview 按钮 | 用户视角 | P2 | Progressive Disclosure |
| C6 | Input placeholder 信息密度过高 | 用户视角 | P2 | 认知负荷 |
| C7 | Quick Actions（New Conversation / New Project）占空间大但信息价值低 | 信息论 | P2 | 信息密度 |
| C8 | Recent Conversations 卡片缺乏视觉区分（同一灰色 icon） | 视觉 | P2 | 信息气味 |

#### Search Modal

| ID | 问题 | 维度 | 优先级 | 理论依据 |
|----|------|------|--------|---------|
| S1 | 时间显示 "0 days ago" 粒度过粗 | 信息论 | **P1** | 信息觅食理论 |
| S2 | 文件路径过长截断后不可读 | UX | P2 | 信息气味 |
| S3 | In-file 搜索结果 heading 和内容重复出现 | 信息论 | P2 | 信息冗余 |
| S4 | "Ask AI" 按钮在 Vault Search 模式下过于突出 | 视觉/UX | P2 | 注意力导向 |

#### Inspector

| ID | 问题 | 维度 | 优先级 | 理论依据 |
|----|------|------|--------|---------|
| I1 | Graph 高缩放下节点变色块、标签巨大 | 视觉 | **P1** | "Graph 服务于行动"原则 |
| I2 | "No links for this note" empty state 指引不清 | 用户视角 | P2 | Empty state 研究 |
| I3 | Hops 选择器（1 2 3）视觉反馈弱 | UX | P3 | UI 控件可发现性 |

#### Settings

| ID | 问题 | 维度 | 优先级 | 理论依据 |
|----|------|------|--------|---------|
| ST1 | Mock 环境 General tab 默认全折叠（真实环境正常） | UX | P2 | Mock 一致性 |
| ST2 | 数字输入框无单位标注（"5000" → ms? chars?） | 用户视角 | P2 | 认知负荷 |
| ST3 | Doc & Search 设置项多但缺少分组 | 视觉 | P2 | 信息架构 |

#### 全局

| ID | 问题 | 维度 | 优先级 | 理论依据 |
|----|------|------|--------|---------|
| G1 | 设计质量不均匀（Provider Settings 优秀 vs Chat Home 平庸） | 一致性 | **P1** | 设计系统统一性 |
| G2 | 缺乏统一的 empty state 设计模式 | UX | **P1** | Empty state 研究 |
| G3 | 品牌色（紫色）在 Chat 区域几乎不出现 | 视觉 | P2 | 品牌一致性 |

---

## 六、改进路线图

### 战略 1：Chat 体验的 Progressive Disclosure 改造

**核心原则：** 学习 Claude Artifacts + Cursor Agent 的模式——结果先行，过程按需。

| 改进项 | 现状 | 目标 | 理论依据 |
|--------|------|------|---------|
| Trace 默认收起 | 展开显示完整 JSON | 一行摘要（"✓ Loaded 5 context messages · 85ms"），点击展开 | Progressive Disclosure（30-50% 效率提升） |
| 新用户引导 | "No model selected" 红字 | 首次打开 → 检测 Ollama 或引导配置 API Key | Empty state 研究 |
| Input placeholder | 4 种语法一次性展示 | 只显示 "Type your message..."，语法提示移到 `/` 命令弹出 | 认知负荷理论 |
| 快捷按钮时机 | 空对话即显示 | 首条消息后再显示 | Progressive Disclosure |

### 战略 2：Search 的信息气味强化

**核心原则：** Information Foraging Theory——增强每个搜索结果的信息气味。

| 改进项 | 现状 | 目标 | 理论依据 |
|--------|------|------|---------|
| 时间显示 | "0 days ago" | "3h ago" / "刚刚" / "昨天" | 信息气味 |
| 路径显示 | 完整路径截断 | 最后 2 级目录 + 文件名，hover 全路径 | Snippet 设计研究 |
| In-file 去重 | Heading 和内容各出现一次 | 合并：heading 为标题，content 为 snippet | 信息冗余消除 |

### 战略 3：Graph 的语义缩放

**核心原则：** "Graph 服务于行动"——我们自己的设计原则。

| 改进项 | 现状 | 目标 | 理论依据 |
|--------|------|------|---------|
| 高 zoom 渲染 | 节点变巨大色块 | semantic zoom：放大时显示节点内容摘要 | Heptabase 竞品 |
| Empty state | 不清晰的错误提示 | 友好引导 + 建议操作 | Empty state 研究 |
| Hops 选择器 | 小文字 | segmented control / pill 按钮 | UI 可发现性 |

### 战略 4：统一设计语言

**核心原则：** 以 Provider Settings 和 Search Mode Dropdown 为 benchmark，拉齐全局。

| 改进项 | 现状 | 目标 | 理论依据 |
|--------|------|------|---------|
| Empty state 模式 | 各页面不一致 | 统一模式：icon + 文案 + CTA 按钮 | 设计系统一致性 |
| 品牌色 | Chat 区域无紫色 | 统一紫色系强调色 | 品牌一致性 |
| 信息密度 | Chat Home Quick Actions 过空 | 参考 Notion 紧凑 dashboard | 信息密度优化 |

---

## 七、设计质量标杆（项目内最佳实践）

以下组件已达到行业优秀水平，可作为其他页面的设计参考：

1. **Provider Settings 双栏设计**（图 10）— 左列 provider 列表（ENABLED/DISABLED 分组）+ 右侧 provider 配置 + Model List 带搜索和 toggle。信息架构清晰，操作直观。
2. **Search Mode 下拉菜单**（图 2）— icon + 模式名 + 说明 + 快捷键提示，一目了然。
3. **文件 Diff 预览**（图 8）— Button.tsx +21 -33 的红绿标注 + Undo all / Keep all 操作。简洁有力。
4. **Conversation Outline 右侧栏**（图 7-8）— USER / ASSISTANT 标签 + 消息摘要，帮用户把握对话结构。
5. **Search Mode 下拉 & 底部键盘提示** — 符合 Obsidian power user 的习惯和期望。

---

## 附录：参考来源

### 行业产品
- [Chatbot UI Best Practices 2026 - Vynta](https://vynta.ai/blog/chatbot-ui/)
- [Chatbot Interface Design Guide 2026 - Fuselab](https://fuselabcreative.com/chatbot-interface-design-guide/)
- [Comparing Conversational AI Tool UIs 2025 - IntuitionLabs](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)
- [Perplexity Platform Guide: Citation-Forward Answers](https://www.unusual.ai/blog/perplexity-platform-guide-design-for-citation-forward-answers)
- [AI UX Patterns: Citations - ShapeofAI](https://www.shapeof.ai/patterns/citations)
- [Notion AI Review 2026](https://max-productive.ai/ai-tools/notion-ai/)
- [Notion AI vs Coda AI 2026](https://aiproductivity.ai/blog/notion-ai-vs-coda-ai/)
- [Windsurf vs Cursor 2026 - NxCode](https://www.nxcode.io/resources/news/windsurf-vs-cursor-2026-ai-ide-comparison)

### Obsidian 生态
- [Obsidian Design System - Figma](https://www.figma.com/community/file/1172227339881210762/obsidian-design-system)
- [Top Obsidian Plugins 2026 - Obsibrain](https://www.obsibrain.com/blog/top-obsidian-plugins-in-2026-the-essential-list-for-power-users)
- [Obsidian Forum: 标准 AI 接口插件](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)
- [Smart Connections vs Copilot](https://smartconnections.app/obsidian-copilot/)

### 学术研究
- [Information Foraging Theory - NNGroup](https://www.nngroup.com/articles/information-foraging/)
- [Information Scent - NNGroup](https://www.nngroup.com/articles/information-scent/)
- [Progressive Disclosure - NNGroup](https://www.nngroup.com/articles/progressive-disclosure/)
- [Progressive Disclosure in AI - AI Design Patterns](https://www.aiuxdesign.guide/patterns/progressive-disclosure)
- [Empty States in User Onboarding - Smashing Magazine](https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/)
- [Empty State UI Design - Mobbin](https://mobbin.com/glossary/empty-state)
- [Enhancing Snippet Visualizations for Web Search (2024)](https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2443267)
- [Investigating Featured Snippets User Attitudes - ACM CHIIR 2023](https://dl.acm.org/doi/10.1145/3576840.3578323)
