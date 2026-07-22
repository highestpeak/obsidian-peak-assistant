# Chat Studio 完整实施规格与单条 Session 交接指令

日期：2026-07-15  
状态：**Canonical implementation contract（目标实现唯一权威）**  
范围：Peak Assistant 生产 Chat Studio 的功能、UI、UX、数据契约、实施 DAG 与验收  
视觉基线：[`docs/gstack/chat-studio-interactive-2026-07-13/index.html`](../../gstack/chat-studio-interactive-2026-07-13/index.html)  
当前生产地图：[`docs/11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html)  
请求上下文地图：[`docs/11-feature-chat-context.html`](../../11-feature-chat-context.html)

> 本文吸收 2026-07-13 至 2026-07-15 Chat Studio 讨论中已经接受的全部 owner 要求，并把仍停留在 mock、口头描述或开放问题中的部分特化成可编码契约。下一次实施不应再从聊天记录反推需求。

## 0. 给下一 Session 的唯一一段话

复制下面这一段即可开始；不需要再附本轮聊天记录：

> 在 `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant` 中完整实现 `docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md`。先按 §16 Stage 0 做只读差距矩阵，再在同一 session 继续按 DAG 实施所有 MUST 轨道，不要停在计划或静态 mock；以本文作为目标行为唯一权威，以生产源码作为当前运行真相，以 `docs/gstack/chat-studio-interactive-2026-07-13/index.html`、`composer-lab.html` 和 `qa-gate2.mjs` 作为视觉/交互验收基线。保留用户现有未提交改动，不重画 Quick Search，不引入第二套 Chat 状态，不展示任何未被运行时消费的假控件。每个可见动作都必须完成“状态 → 持久化/服务 → 回执 → 测试”闭环；如遇真实数据迁移或破坏性边界才停下询问，其余问题用本文默认值继续。完成后运行 §18 的 targeted tests、build、mock validation、浏览器/Obsidian 手测并按 §19 输出 requirement ID 对照表；未通过全部 MUST 不得声称完成，也不要自行 commit。

## 1. 怎么使用本文

本文同时承担四个角色：

1. **目标规格**：回答最终产品必须怎样工作。
2. **实现边界**：回答哪些状态、schema、service 与 UI 必须接线。
3. **实施计划**：回答修改顺序、依赖和禁止范围。
4. **验收清单**：回答怎样证明不是“只画出来了”。

术语：

- **MUST**：本轮完整实现不可缺少；缺一项不得标完成。
- **SHOULD**：若不实现必须给出代码证据和替代方案。
- **FUTURE**：记录方向但不进入本轮完成口径。
- **Current**：当前源码真实存在，不代表体验已经符合目标。
- **Proposal**：仅在 HTML 或文档中出现；接线前不能展示在生产 UI。

## 2. 文档地图、阅读顺序与冲突规则

### 2.1 下一位执行者的最短阅读顺序

| 顺序 | 文档 | 责任 | 实施时怎样使用 |
|---:|---|---|---|
| 1 | **本文** | 完整目标、数据契约、DAG、验收 | 目标行为唯一权威 |
| 2 | [`11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html) | 当前生产三栏、store、组件与代码证据 | 建立 current → target 差距 |
| 3 | [`11-feature-chat-context.html`](../../11-feature-chat-context.html) | 请求前消息、附件、项目、Vault/Web、能力上下文怎样装配 | 不得在 UI 另造一条 context pipeline |
| 4 | [`index.html`](../../gstack/chat-studio-interactive-2026-07-13/index.html) | 完整三栏目标交互 | 对照布局、状态和细节 |
| 5 | [`composer-lab.html`](../../gstack/chat-studio-interactive-2026-07-13/composer-lab.html) | Composer 状态实验 | 对照输入、来源、模型、助手、权限、窄栏 |
| 6 | [`qa-gate2.mjs`](../../gstack/chat-studio-interactive-2026-07-13/qa-gate2.mjs) | 160 项 owner-feedback 自动检查 | 迁移为生产测试/手测矩阵 |
| 7 | [`decisions.md`](../../gstack/chat-studio-interactive-2026-07-13/decisions.md) | Gate 0–9 接受/否定记录 | 查“为什么这样定”，不覆盖本文 |
| 8 | [`research-and-inventory.md`](../../gstack/chat-studio-interactive-2026-07-13/research-and-inventory.md) | 本地能力、竞品、HCI 与运行时真相 | 避免伪造能力 |

### 2.2 完整相关文档清单

| 分类 | 文档 | 当前地位 |
|---|---|---|
| 权威规格 | 本文 | **Canonical target** |
| 根索引 | [`docs/index.html`](../../index.html) | 长期文档入口；11A 条目反链本文 |
| 路线图 | [`docs/roadmap.html`](../../roadmap.html) | 本轮登记为 decided / implementation-ready；不等于已上线 |
| 历史进度 | [`docs/progress.md`](../../progress.md) | 保留 Phase AN 等历史事实；旧品牌栏、Overview/Artifacts 不覆盖新目标 |
| 产品定位 | [`2026-07-14-chat-studio-product-positioning-and-composer-v2.md`](./2026-07-14-chat-studio-product-positioning-and-composer-v2.md) | 已吸收；保留产品论证和外部参考 |
| 讨论汇总 | [`discussion-synthesis.md`](../../gstack/chat-studio-interactive-2026-07-13/discussion-synthesis.md) | 决策背景，不再承担实现规格 |
| 当前功能 | [`11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html) | 当前生产事实入口 |
| Context | [`11-feature-chat-context.html`](../../11-feature-chat-context.html) | Context pipeline 事实入口 |
| 交互包入口 | [`README.md`](../../gstack/chat-studio-interactive-2026-07-13/README.md) | Mock 说明、运行和 QA |
| 三栏 Mock | [`index.html`](../../gstack/chat-studio-interactive-2026-07-13/index.html) | 目标视觉/交互 reference，不是 runtime proof |
| Composer Mock | [`composer-lab.html`](../../gstack/chat-studio-interactive-2026-07-13/composer-lab.html) | Composer 细节 reference |
| 产品报告 | [`product-strategy.html`](../../gstack/chat-studio-interactive-2026-07-13/product-strategy.html) | 产品循环与五类任务的视觉说明 |
| Gate 日志 | [`decisions.md`](../../gstack/chat-studio-interactive-2026-07-13/decisions.md) | Gate 0–9 历史 |
| 研究盘点 | [`research-and-inventory.md`](../../gstack/chat-studio-interactive-2026-07-13/research-and-inventory.md) | 能力与竞品证据 |
| 视觉校准 | [`calibration.md`](../../gstack/chat-studio-interactive-2026-07-13/calibration.md) | Peak house style 证据 |
| 原 Mock 计划 | [`2026-07-13-chat-studio-interactive-html-mock-plan.md`](../plans/2026-07-13-chat-studio-interactive-html-mock-plan.md) | 已完成的设计过程，不是生产计划 |
| 早期布局 | [`2026-06-02-chat-studio-layout-design.md`](./2026-06-02-chat-studio-layout-design.md)、[`2026-06-02-chat-studio-layout.md`](../plans/2026-06-02-chat-studio-layout.md)、[`2026-06-02-chat-studio-layout-v2-design.md`](./2026-06-02-chat-studio-layout-v2-design.md)、[`2026-06-02-chat-studio-layout-v2.md`](../plans/2026-06-02-chat-studio-layout-v2.md) | 历史输入；冲突时本文覆盖 |
| 早期 Chat UI | [`2026-04-20-chat-system-polish-design.md`](./2026-04-20-chat-system-polish-design.md)、[`2026-04-22-chat-ui-redesign-design.md`](./2026-04-22-chat-ui-redesign-design.md)、[`2026-05-22-chat-bot-ui-design.md`](./2026-05-22-chat-bot-ui-design.md) | 历史考古，不直接执行 |
| 模型选择 | [`2026-05-25-agent-model-selection-design.md`](./2026-05-25-agent-model-selection-design.md)、[`2026-05-08-model-selection-unification-design.md`](./2026-05-08-model-selection-unification-design.md) | 理解 Profile/模型现状；Composer 目标以本文为准 |
| Context 底座 | [`2026-05-02-unified-context-pipeline-design.md`](./2026-05-02-unified-context-pipeline-design.md) | Context 架构背景 |
| 工具/产物 | [`2026-05-10-chat-tool-infrastructure-design.md`](./2026-05-10-chat-tool-infrastructure-design.md) | 工具运行背景；产物 UI 契约以本文为准 |
| 相邻运行时要求 | [`2026-07-05-chat-product-requirements-claude-handoff.md`](../plans/2026-07-05-chat-product-requirements-claude-handoff.md) | 只吸收仍有效的 Current Work State / rich generation 要求；不要整份重跑 |
| 旧视觉探索 | [`chat-focused-redesign-2026-05-29/`](../../gstack/chat-focused-redesign-2026-05-29/) | Historical design exploration；其中旧 mode、voice、inline follow-up 不直接执行 |
| 文档编辑 Composer | [`2026-07-09-peak-composer-editing-view.md`](./2026-07-09-peak-composer-editing-view.md)、[`2026-07-15-composer-block-ai-capability-contract.md`](./2026-07-15-composer-block-ai-capability-contract.md) | 另一产品 surface；不得共享 Chat-specific state、draft、submit pipeline 或 runtime，但必须复用 shared PromptInput kernel、trigger/keyboard grammar 与视觉 primitives（见 [`prompt-input-consistency.md`](../../conventions/prompt-input-consistency.md)） |

> 交接风险：本文和当前交互包在此 checkout 中可能仍是未跟踪文件。同一 checkout 的新 session 可以读取；新 worktree、换机器或只从 commit 创建的 session 可能看不到。开始跨 worktree 交接前，owner 需要显式 stage/commit 或把这些文件带入目标工作区；执行者不得自行 commit。

### 2.3 冲突时怎样判断

- 问“**现在有什么**”：生产源码 > 当前功能文档 > 历史 progress。
- 问“**这次要建什么**”：本文 > Gate 9 mock > `decisions.md` > 旧目标 spec。
- 问“**模型/Provider 真支持什么**”：运行时 catalog/Profile 数据 > 文案或模型名称。
- 问“**Quick Search 长什么样**”：生产 `QuickSearchModal` 自己拥有；Chat Studio 文档和 mock 都不能替它定义内部 UI。
- Mock 看得见但本文标为 FUTURE/禁止，不能实施；本文要求但 mock 只做占位，必须补真实 runtime。

### 2.4 Current → Target implementation matrix

| Surface | 当前事实 | 本轮动作 | 状态 |
|---|---|---|---|
| 单 leaf 三栏 shell | 已有 `ChatStudioView`、splitter 和共享 store | 保留结构，补 view-aware right visibility、workspace persistence、窄屏折叠和 a11y | Reuse + Refactor |
| 左栏项目/会话 | 已有 project/conversation list、selection 与菜单片段 | 重排 Pinned/Projects/Recent，拆 chevron/name/menu，接真实管理 command 与 history type picker | Refactor |
| Quick Search | 生产 `QuickSearchModal` 已拥有 Raw/AI/Vault Intelligence | 只做 app-owned handoff/focus restore；不复制内部 UI | Reuse only |
| Chat message renderer | 已有 Markdown/stream/tool/附件等基础组件 | 扩展资源排列、身份规则、状态 receipt、真实 action registry | Reuse + Extend |
| Composer | 已有输入、附件、模型/运行入口，但 ownership 与状态语义分散 | 建 single owner/coordinator、draft matrix、唯一入口、source/model/Assistant/workflow contract | Major Refactor |
| Project home | 已有项目 overview，但信息与启动心智不足 | 建紧凑 identity/stats/description draft/start Composer/四 collections | Refactor + New data |
| Right index | 已有 Overview/Artifacts 推导 | 改为 receipt-driven Outline/Resources、真实 anchor、scroll spy、filter boundary | Replace projection |
| Model selection | 已有 Profile/model registry 与设置绑定 | 复用 truth source，补 searchable profile-qualified selector 与 capability metadata/filter | Reuse + Extend |
| Assistant | 有 Agent/Profile/Harness 相邻真相，但没有锁定的 Chat picker/builder 合同 | 先映射现有 truth，再补 durable definition、picker、AI draft/preview/save | New UI + Adapter |
| Artifact | 有正文 renderer、tool result、Artifact port/refs，但 Chat receipt 不完整 | 建关联 receipt 和 capability-driven actions；producer 只暴露真实支持 kind | New contract + Adapter |
| Project Plans | mock 有 fixtures，生产 durable owner 未锁 | 使用 Vault-backed 或 conversation-backed ref；不得实现内存 task list | New contract |
| Title/actions/suggestions | 存在部分按钮、More、suggested next | 补标题生命周期、动态 overflow、真实 Save/Branch/Trace/Retry 和主 Composer reply anchor | Refactor |

`Current` 只由源码/测试证明；`Target` 只由本文定义。实施 Stage 0 要把上表每行补成精确文件、schema、测试和迁移，而不是重新讨论产品方向。

### 2.5 P0 runtime-truth gates

以下是 2026-07-15 源码审计确认的生产缺口。它们优先于视觉移植：

1. **Vault Search 目前不是检索能力**：现有开关主要进入 `SystemPromptSlot` capability 文案；`chatToolBuilder.ts` 只构建 Web tool，`VaultIntuitionSlot` / `CurrentFileSlot` 已注册但未进入当前 `ChatProfile`。必须接通真实 retrieval + actual source receipt；完成前生产按钮显示 unavailable/disabled，不能声称“已检索整个 Vault”。
2. **Auto model 目前不能可靠保留**：`useChatSession.ts` 会把会话 hydrate 为具体 model 并写回，store 也缺少恢复 Auto 的明确值。必须持久化 `ModelSelection = auto | fixed(profileId, modelId)`，Auto 不能用“字段碰巧为空”猜测。
3. **cancel / timeout / error 不一致**：abort/timeout 后部分 assistant message 或 RunEnvelope 仍可能被记为 completed，SDK error event 也可能被忽略。message、run、tool 三层状态必须同源并区分 failed/cancelled/timeout/permission-required；partial output 可保留但不能算成功。
4. **Assistant 领域模型不存在**：Provider Profile、User Profile、custom system prompt、RunChip role 都不是用户可复用 Assistant。必须新增 registry/storage/adapter；不得把 Profile 改名后冒充 Assistant。
5. **Artifact 只有底层 port**：`ArtifactPort` 尚未形成 Chat producer → receipt → persisted association → right index 全链路；右栏仍有 regex 推断。必须先建 typed receipt，再显示生成/保存/版本动作。
6. **项目描述不能复用 `shortSummary`**：该字段会被 `ContextUpdateService` 自动重写。新增用户拥有的 `description`，保留系统拥有的 `generatedSummary`，可选 `instructions`；AI 只改 description draft，用户 Save 后才写入。
7. **Composer 仍有假交互**：当前 RunChip role 只在 local state，模型面板不是完整 picker，Mic disabled，Vault switch 不执行检索。每个控件要么接入 dispatch/request receipt，要么删除/禁用并说明原因。

这些 gate 不允许用“后端以后再接”跳过。Track A/B 修复 truth 后，才进入表层 polish。

## 3. Impact Contract

### 3.1 Primary outcome

把当前“复用旧组件的三栏容器”升级为一个生产可用的知识工作空间：用户可以恢复工作、组合本地/外部证据、运行对话或工作流、检查过程和产物、追问/分支、保存回 Vault，并从项目继续。

### 3.2 必须移动的指标

- 本文全部 MUST requirement 有生产实现和验证证据，完成率 **100%**。
- 生产中 proposal-only / 点击无效果控件为 **0**。
- 同一时刻 live Composer 实例为 **1**；draft/context 没有双 store 或跨页面泄漏。
- 右栏可见条目的真实定位成功率为 **100%**。
- 可见消息动作都有 handler、状态反馈和失败路径；More 中重复 inline 动作为 **0**。
- 项目主页、空对话、活跃会话三种状态保持同一输入心智，并通过宽/窄、light/dark 回归。

### 3.3 Required tracks

1. 数据与状态契约；2. 三栏 shell 与左栏；3. 中栏消息/产物；4. Composer；5. 项目主页；6. 右栏；7. 搜索/模型/助手边界；8. 测试与可访问性。

### 3.4 Optional tracks

只允许把 §15 明确标为 FUTURE 的 marketplace、多 Agent 编排、公共模板市场、专业 trace 工作台留后。它们不得成为完成 MUST 的借口。

### 3.5 Forbidden scope

- 不重做或复制 Quick Search 内部 UI。
- 不删除大功能换取实现速度；不改与 Chat 无关的搜索、Copilot、Settings 行为。
- 不新增 service-layer runtime singleton 或扩大 `AppContext.getInstance()` 依赖捷径。
- 不把模型名、能力、i18n、阈值、spacing 常量硬编码在业务逻辑；配置进入 `templates/config/` 或明确 defaults。
- 不用第二套 store、第二个 Composer、第二个全文搜索或第二条 context pipeline。
- 不用装饰性 Peak logo、品牌 masthead、渐变、超大圆角或 emoji 图标。
- 不覆盖或回滚用户当前未提交改动；不自行 commit。

### 3.6 Skip / stop / completion rule

- Silent skip budget：**0**。每个 skip 必须列 requirement ID、证据、影响和后续。
- 只有会破坏既有持久数据、需要不可逆迁移，或本文确实没有 owner 默认值时才能停下询问。
- Build/test 通过但只做了样式或 partial wiring，必须标记 partial，不算完成。

## 4. 产品定位与统一心智模型

> Chat Studio 是以 Vault 为长期记忆、以对话为临时工作台、以可追溯产物为结果的知识工作空间。

五类核心任务：Recall（找回事实）、Synthesize（跨材料组织）、Create（生成产物）、Maintain（写回知识）、Research（本地不足时补外部来源）。

用户发送前只需要理解：

1. **我要什么**：消息正文或 `/` 工作流。
2. **我明确带了什么**：附件、`[[Vault 文档]]`、URL、reply anchor。
3. **还允许去哪里找**：项目上下文为基础；Vault Search 和 Web Search 独立可组合。

模型是引擎，Assistant 是当前对话长期身份，workflow 是完成方法，权限在真实动作发生时出现。四者不合并成一个“模式”菜单。

## 5. 整体布局与状态机

### 5.1 三栏唯一责任

| 区域 | 责任 | 不能做 |
|---|---|---|
| 左栏 | 恢复对象：置顶、项目、最近会话、管理 | 不承担正文搜索结果或当前会话大纲 |
| 中栏 | 当前任务：启动、消息、运行、产物、Composer、项目主页 | 不复制左栏目录或右栏索引 |
| 右栏 | 当前会话 recall：Outline / Resources、搜索、定位 | 不在项目主页重复项目 collections |

三栏投影同一 `chatDataStore` 与 navigation/session state；不得各自复制 active project、conversation、message、artifact 数据。

### 5.2 Canonical view states

| State | 中栏 | Composer | 右栏 |
|---|---|---|---|
| `home` | 恢复工作/最近入口 | 可选中心起点 | 无 current conversation 时隐藏 |
| `new` | 简短问候 + 3 个 starter | 视觉中部 | **隐藏** |
| `project-home` | 项目身份 + Composer + 四 collections | 摘要之后、tabs 之前 | **隐藏且 splitter 不可聚焦** |
| `active` | 当前消息线程 | 消息画布底部 | Outline / Resources |
| `streaming` | typewriter + stop + process receipt | 保持可 steer，禁止重复发送 | 实时增量更新 |
| `tool-run` | reasoning/tool/permission/status | 可 steer/stop | process 节点进 Outline |
| `error/cancel/timeout` | 可恢复回执 | Retry 可用 | 保留失败节点 |
| `catalog` | renderer 组件目录（仅开发/测试） | 不作为用户入口 | 类型索引 |

### 5.3 尺寸与响应式

- 基准：左 248px、右 304px、header 44px、中心阅读内容约 720px、Composer 外轨约 760px。
- 1728×880：三栏完整；宽回答动作应全部 inline，More 消失。
- 894×835：至少左 200px / 中 440px / 右 220px，发送按钮和核心动作可见，无页面横向 overflow。
- `< 894px`：默认先折叠右栏，再把左栏变成可恢复 drawer；中心不低于可用消息/Composer 宽度。折叠是布局状态，不丢 selection。
- 两条 splitter 支持鼠标拖拽、键盘 4px 步进、双击复位；使用 owner document 以支持 detached window；宽度是否持久化应进入 UI preference，不塞入会话数据。
- Studio 内所有 portal、menu、dialog、fullscreen、event listener、RAF 和 viewport 读取都从元素的 `ownerDocument/defaultView` 派生；禁止在 detached window 路径直接依赖全局 `document/window`。
- 使用现有 `--pk-*` tokens、Lucide icon、4px spacing grid、28–34px row。focus-visible、hover、selected、disabled、error、streaming 必须可区分。

## 6. 左栏规格

### 6.1 固定顺序

`新对话 → 搜索知识库 → 置顶 → 项目 → 最近`。不显示 Peak logo、Peak 文本头或永久搜索框。

### 6.2 新对话与知识库搜索

- `L-NEW-01` 新对话创建 pending conversation，不在点击时先写空文件；首次发送后完成持久化。
- `L-SEARCH-01` “搜索知识库”调用生产 `QuickSearchModal`/对应 app-owned opener；Chat Studio 不读写其内部 tabs、query 或结果 state。
- `L-SEARCH-02` 不显示未经配置的 `⌘K`；快捷键来自真实 command binding。

### 6.3 置顶、项目和最近

- `L-PIN-01` 置顶最多显示高价值工作；同一 conversation 在置顶和最近按 id 去重。
- `L-PROJECT-01` chevron 只展开/折叠；项目名只进入项目主页；二者独立 hit target、焦点和 aria-label。
- `L-PROJECT-02` 项目展开后显示足够的会话量；拖入项目必须有 before/over/accepted/error 反馈。
- `L-RECENT-01` 最近按 Today / Yesterday / This week / Earlier 分组，行内不重复日期。
- `L-RECENT-02` “查看全部”位于 Recent section header，打开独立的**对话标题** picker。
- `L-RECENT-03` picker 支持标题 query + canonical `ConversationType` 单选，AND 语义；打开时重置为 All，防止隐藏 filter 让结果“消失”。
- `L-RECENT-04` 类型只允许 `chat / agent / plan / canvas / template / custom`；project membership、topic、一次 `/研究` 不是类型。
- `L-RECENT-05` `ConversationType` 只用于旧数据兼容、历史显示和筛选；它不能重新变成创建前的 Chat / Agent / Plan 运行模式选择器。

### 6.4 行菜单

菜单必须为不透明 surface、有边框/阴影/分隔；Pin 与 Unpin 互斥。Conversation 行的完整 action registry：

1. Pin 或 Unpin；2. Rename；3. Move to project / Remove from project；4. Open source file；5. Archive / Restore（若持久层支持）；6. Delete（destructive 分组、二次确认）。

项目行：New conversation、Rename、Open project folder/definition、Archive/Delete（只在真实服务存在时出现）。隐藏不支持动作，不放 disabled 假项。

标题重命名/自动生成采用 `idle → thinking → typing → saving → done/error`；生成时必须出现可见逐字替换，不能只旋转 icon。人工改名设置 `titleManuallyEdited`，自动改名不得静默覆盖。

## 7. 中栏：启动态、Header 与消息主体

### 7.1 新对话启动态

- `C-EMPTY-01` 可视中心显示短问候，例如配置化的“今天想推进什么？”；不放大品牌/插画。
- `C-EMPTY-02` 最多 3 个 Peak-specific starter：继续最近工作、总结最近材料、寻找相关材料。项目主页对应为继续项目、总结进展、规划下一步。
- `C-EMPTY-03` starter 只填入 editable draft，不 auto-send；有草稿后退场。
- `C-EMPTY-04` greeting/starter 文案来自 `templates/config/chat-studio.json`，可以按项目/最近活动选择，逻辑文件不硬编码中英文。

### 7.2 Conversation header

- 标题在左，项目归属为次级文本；不显示 Peak 标志或 Assistant 重复身份。
- 当前会话可显示 Open source、Regenerate title；项目主页不显示 conversation-only action。
- title regeneration 状态遵守 §6.4；屏幕阅读器只在完成时宣告最终标题，逐字动画不制造连续噪声。

### 7.3 身份显示

- 默认单一 Assistant 不显示 `AI Assistant` 头像/头标。
- 只有 non-default Assistant、多 Agent handoff、明确模型归属变化或 debug/trace 场景显示身份；身份展示解释“谁/什么配置产生了这条消息”，不抢正文层级。

### 7.4 用户输入资源 renderer

| 输入 | 目标呈现与行为 |
|---|---|
| 1 张图 | 单图预览，保持比例，可打开 lightbox |
| 2 张图 | 双列等高 crop |
| 3 张图 | hero + 两张次图 |
| 4 张图 | 2×2 |
| 5–7 张图 | hero + thumbs |
| 8+ 张图 | 有限网格 + `+N` overlay |
| PDF/DOCX/PPTX/XLSX/MD/TXT/CSV/JSON/HTML/XML/ZIP | 文件卡；显示真实名称/类型/可得 metadata；解析失败有降级回执 |
| 1–4 文件 | 完整卡堆叠/网格；不挤压正文 |
| 5+ 文件 | compact chips，可展开完整列表 |
| URL | 标题/host/摘要/安全缩略图；抓取失败退为 favicon/Globe，不伪造 OG |
| Vault 文档/`[[wikilink]]` | 文件名/路径/类型；hover/focus preview，点击定位原文 |
| 项目上下文 | 只显示作用域回执，不复制整份项目材料 |

发送前可移除/重排资源；发送后资源成为 turn 证据，不允许编辑造成历史与请求不一致。

### 7.5 Assistant 正文与产物 renderer

普通正文支持 Markdown、列表、引用、表格、代码、Diff、Mermaid、数学、wikilink、引用标记。**丰富正文不等于 Artifact。**

只有可继续使用/保存/打开的结果使用 artifact receipt：生成图片、Markdown/DOCX/PDF、代码文件、Excalidraw/Canvas、Obsidian Base、Diff/patch、多文件 bundle。Receipt 必须显示真实状态 `generating / ready / saved / failed / stale`、kind、title、producer message/run、可用动作（Preview/Open/Save/Download/Edit/Apply）以及错误。无 handler 的动作不渲染。

表格支持复制 TSV/Markdown；代码支持 copy；Diff 只在有授权的 apply port 时显示 Apply；Mermaid 支持复制/下载/全屏；图片支持预览/保存；Vault 文件打开走 navigation port。

### 7.6 过程和生命周期

- `queued`：请求已经入队但未开始生成；显示排队原因/取消入口，不创建空 assistant 正文。
- `sending`：用户消息已接受；不可重复提交。
- `streaming`：正文 typewriter；同一个 assistant bubble 增量更新，无完成时闪烁。
- `reasoning`：只有 provider 真实给出时显示为默认折叠的“分析过程”；不伪造内部思维。
- `tool-run`：按 run/phase 聚合，显示工具、对象、持续时间和结果摘要；详细参数按需展开。
- `permission`：只在即将执行外部写入/危险动作时出现，列对象、动作、范围；允许一次/本轮/拒绝须由 runtime 消费。
- `completed / error / cancelled / timeout`：都有明确回执和可恢复动作；取消/超时不能假装成功产物。

### 7.7 消息动作与动态 overflow

Assistant 回答的 **persistent core** 固定为：Copy、Retry/Regenerate、Star、Branch、Trace。它们不进入 More；极窄时可只保留 icon 和 tooltip。

Adaptive actions 的优先级从高到低：

1. Targeted follow-up；2. Save to Vault；3. View raw；4. Copy Markdown；5. Copy JSON。

使用 `ResizeObserver`/可测量容器计算真实可用宽度，从最低优先级反向压入 More。More 只在有隐藏项时出现，只列当前隐藏项，顺序仍按优先级，不能复制 inline 动作。Delete 若对该消息适用，只放 More 的 destructive 分组末尾并要求确认；它不参与普通 inline promotion。

语义：Copy 复制用户可读正文；Copy Markdown 复制 canonical markdown；Copy JSON 复制结构化 message/receipt；View raw 是可读 payload viewer；Trace 打开/复制该 message 的 `debugRunId`，不能误用“最近一次 trace”。没有 trace 时核心槽位仍保留为 disabled，并给出“本消息没有 Trace”的原因。Save to Vault 必须返回保存路径、成功/失败和 Open action，不能只 toast。

用户消息至少提供 Copy、Edit & resend、Branch from here；Edit & resend 必须保留旧历史并形成明确 branch/revision，不原地篡改已经产生回答的 turn。System/process/error receipt 只显示与类型相关的 Copy details、Trace、Retry/Resume。

### 7.8 Suggested next 与定向追问

- inline 最多 2 个高置信 follow-up；点击只回填主 Composer。
- More 分组：更多追问、改写/清单等 answer actions、Save、Custom follow-up。
- Targeted follow-up 设置 reply anchor，滚动并聚焦唯一主 Composer；禁止消息内部第二个输入框。
- reply anchor 显示被追问消息的短摘要，可移除；发送后写入 turn relationship，右栏可定位父消息。

## 8. Composer 完整规格

### 8.1 单一 owner

同一 Chat Studio 同时只能有一个 live editor。`new`、`project-home`、`active` 改变 placement，但不创建两套 draft/context state。可以由稳定 `ComposerCoordinator` + slot/portal 实现；即使 DOM target 切换，draft、selection、attachments、reply anchor 与焦点必须保留，且任一时刻 `Composer` DOM count = 1。

Draft key：`new`、`project:<projectId>`、`conversation:<conversationId>`。切换对象保存/恢复对应草稿；项目主页不继承上一会话的一次性 workflow、附件、reply、Assistant override、模型 override、Vault/Web switch。项目归属由页面 scope 与 Source 表达，context shelf 不再重复项目 chip。

### 8.2 结构

```text
explicit context shelf（有内容才出现）
  reply / Assistant / workflow / [[doc]] / file / URL
editor（1–N 行自增长）
footer
  + resources | source summary | model/Assistant run chip | send/stop
```

- 默认无附件时约 84px；多行增长设合理 max-height 后内部滚动。
- Enter 发送、Shift+Enter 换行；IME composing 时不得误发。
- 发送条件由正文/附件/workflow 与 runtime readiness 决定；发送中变 Stop，不同时出现 Send+Stop。

### 8.3 语法与入口唯一所有权

| 入口 | 唯一责任 |
|---|---|
| `+` | 文件/图片、Vault 文档（复用 `[[` picker）、链接 |
| `[[` | 紧凑 Vault 文档/文件夹 picker；选择后插入 wikilink + context chip |
| `/` | 研究、规划、编码、生成图片、生成文档等 workflow/action |
| `@` | 本轮不占用；有真实 Assistant/App mention source 后再启用 |
| Source | 项目基础 + Vault Search/Web Search 扩展 |
| Model/Assistant | engine override 与 conversation identity |

鼠标和键盘打开同一 surface、更新同一 state。不能同时出现两个 slash hint 或把 `+`、`/`、Source 的能力重复一遍。

### 8.4 来源组合

```ts
interface TurnSourceScope {
  project: { projectId: string; locked: true } | null;
  vaultSearch: boolean;
  webSearch: boolean;
  explicitRefs: ExplicitContextRef[];
}
```

项目对话的 project row 使用“始终” badge，不是 disabled active switch。Vault 与 Web 为独立 switch，可全关、单开、全开；popover 保持打开以便组合。摘要如 `项目上下文 + Vault + Web`。项目基础自动包含 project id、name、description 与本轮 explicit refs；项目资源库只是可检索范围，不把全部文件正文无条件塞进 prompt。每次请求保存 **effective scope receipt**，并记录实际检索/引用的文件，使 UI 能证明真实使用范围。

### 8.5 模型选择

一级只显示 `自动模型` 或 `{Profile name} · {model displayName}`。选择值必须显式为 `{ mode: 'auto' }` 或 `{ mode: 'fixed', profileId, modelId }`。自动模型含义严格为：当前会话显式 Auto 时跟随当前默认 Chat/Agent binding；固定值则锁定具体 Profile/model。没有真正 router 前不得写“按任务和附件智能路由”。

Selector MUST：

- 搜索 Profile、Provider、display name、model id；
- 按**已启用 Profile**分组，同 Provider 的不同 Profile 不合并；
- 允许 Auto 和具体 `{profileId, modelId}`；
- capability 多选 AND filter：vision、PDF input、tools、web search、reasoning、image generation、local；
- context floor：All / ≥128K / ≥1M；output-token floor 使用同一 AND 语义；未知值不通过正向 filter；
- 显示 Provider/Profile、model id、input/output context 和真实 tags；未知则省略/标 unknown；
- 一键清除 filter、一键恢复 Auto；当前 override 持久化到 conversation。

模型 metadata 只来自 `ProfileRegistry`、`ModelRegistry` 与 `templates/config/models/`。优先抽取/复用 Settings 的 `RoleModelPicker` 搜索、Profile 分组、键盘与 tag 基础，不能再做一套 catalog。生产前扩展 `ModelCapabilities`/schema 以显式支持 `imageGeneration`，并确认 `maxInputTokens`、`maxOutputTokens`；不得从名称推断。Settings Recommended preset、Harness tier、reasoning/verbosity 是不同系统，不在 Composer 伪装成 Fast/Balanced/Best。

### 8.6 Assistant

默认 Assistant 不显示 chip；non-default Assistant 是 conversation-level default，选择后持续显示，直到恢复 default。Picker 支持搜索 name/purpose，按 Default / Saved 分组。

最小持久契约：

```ts
interface ChatAssistantDefinition {
  id: string;
  name: string;
  summary: string;
  instructions: string;
  knowledgeRefs: ExplicitContextRef[];
  toolPolicy: { allow: string[]; deny: string[]; approval: 'always' | 'writes' | 'never' };
  preferredModel?: { profileId: string; modelId: string };
  createdAt: number;
  updatedAt: number;
}
```

AI 创建流程：自然语言 prompt → 生成可编辑 draft（name/summary/instructions）→ 可选 Advanced（knowledge/tools/model）→ preview → explicit Save。AI 不直接保存、启用或扩大工具权限。Saved Assistant 支持 edit、duplicate、archive/delete；优先映射到现有 Agent/Profile/Harness truth source，不能另建第二套 persona runtime。Conversation 只保存 `assistantId`；删除 Assistant 时安全回落 Default 并保留历史 receipt。

### 8.7 Workflow、运行和权限

Workflow selection 产生 context chip，可移除；发送后写入 turn receipt。Stop 必须向 runtime 发取消信号。只有 runtime 明确返回 `canSteer=true` 时，Enter 才可把新输入提交为当前 run 的 steering event，并生成可见 receipt；否则输入区必须标为“下一轮草稿/队列”，不能伪装 steer 已进入当前 run。需要权限时 Composer 上方显示 permission card；拒绝后保留草稿/上下文并给替代路径。

## 9. 项目主页

项目行 name 打开项目主页。主页不是 conversation，也不是稀疏 launchpad；它是项目级 start/resume surface。

顺序：

1. 紧凑 identity（name + 可编辑 description + New conversation）；
2. inline stats（conversations/messages/starred/resources）；
3. 项目 greeting + 单一 project-scoped Composer + 3 starters；
4. `Conversations / Starred / Resources / Plans` tabs 与紧凑 rows。

项目存储明确分开：`description` 归用户所有、可人工编辑/AI 起草；`generatedSummary` 归系统/`ContextUpdateService` 所有；可选 `instructions` 作为项目规则。禁止继续用会被自动刷新的 `project.context.shortSummary` 承载用户说明。Description 点击正文就地 textarea；hover/focus 显示低噪声 pencil。人工编辑和 AI rewrite 共用一个 draft：`view → editing → generating → draft → saving/error`。AI 根据项目材料生成可编辑草稿，明确提示“保存前不会覆盖”；Save 才持久化，Cancel 恢复旧值。不得恢复独立“编辑说明”主按钮。

项目主页隐藏右栏和 splitter；切入项目 conversation 后恢复右栏和底部 Composer。

### 9.1 Project Plan 最小持久契约

```ts
interface ProjectPlanRef {
  id: string;
  projectId: string;
  title: string;
  status: 'planned' | 'active' | 'blocked' | 'done' | 'archived';
  source:
    | { kind: 'conversation'; conversationId: string }
    | { kind: 'vault'; path: string };
  progress?: { completed: number; total: number };
  updatedAt: number;
}
```

Plans 是 durable project state，不是某一次 agent 临时 tool steps，也不是新的内存 task list。项目页只索引 conversation-backed 或 Vault-backed plan；Create/Rename/Status/Archive 写回对应 source。从回答“保存为计划”需 explicit confirmation 和 receipt。

## 10. 右栏：当前会话导航

只在存在 current conversation 时出现。

### 10.1 Outline

- 按 topic/time 组织 user、assistant、reasoning/tool/run、error 和 artifact anchor。
- 当前滚动位置有 scroll spy；点击使用稳定 target id 定位，短暂 highlight。
- 默认 Assistant 不重复出现在每行；用类型 icon/短 label 表达 U、AI、tool、artifact。
- Outline 不显示孤立 resource filter；可有当前会话 search。

### 10.2 Resources

方向 filter：All / Input / Generated。类型至少：Message、Image、Document、URL、Vault context、Table/Data、Code/Diff、Diagram/Canvas/Drawing、Base、Process/Tool。

Direction 与 type 可组合；空态说明当前 filter，而不是“没有资源”。每行显示 title、kind、direction、time/producer；点击定位对应消息/receipt，Open 走真实 port。切换到 Outline 时 Resources filter 必须完全被忽略或重置，隐藏控件不能继续过滤大纲。

### 10.3 状态与可访问性

- 右栏可折叠、可调宽，恢复时保持 tab/query/filter；新 conversation 清理旧 selection。
- 项目主页 `aria-hidden=true` 且 splitter `tabIndex=-1`；不能只是视觉透明。
- search/filter 变化不改变中栏数据，只改变投影。

## 11. 搜索边界

三个搜索 surface 永不合并：

1. **Quick Search**：知识库 Raw retrieval / AI Search / Vault Intelligence，由生产 `QuickSearchModal` 独立拥有。
2. **Conversation history picker**：只查已加载/可枚举 conversation title + canonical type。
3. **`[[` document picker**：只选 Vault 文档/文件夹并回填 explicit context。

Chat Studio 只负责 app-owned handoff、关闭/恢复焦点和错误回执。Mock 的“handoff receipt”不会出现在正式产品；也不复制 Web/Refine/List/Tree/Graph controls。

## 12. 数据与状态契约

### 12.0 Reset / persistence matrix

| 状态 | Owner / key | 切换会话或页面 | 发送成功 | 失败/取消 | 重载 |
|---|---|---|---|---|---|
| 文本 draft | draft store；`new/project/conversation` key | 保存并恢复对应 key | 清当前 key | 保留 | workspace session 恢复 |
| 附件 / explicit refs / reply / workflow | 同一 draft entity | 不跨 key 泄漏 | 仅成功后清 | 保留以便 retry | 按安全 URI 恢复；临时上传需降级回执 |
| project base | 从 current page/project 派生 | 随 scope 切换 | 不清理 | 不清理 | 从 project truth 重建，绝不复制进 shelf |
| Vault/Web switches | conversation/new/project draft defaults | 同 key 保留；不得泄漏到其他新会话/项目 | 记录 effective receipt | 保留 | 恢复该 key/default |
| model override / Assistant | conversation durable meta；new/project draft override | conversation 随对象恢复；新对象用默认 | 首次发送绑定新 conversation | 保留草稿 override | 持久化恢复 |
| 三栏宽度 / 收起 | workspace UI preference | 跨会话保留 | 不变 | 不变 | workspace 恢复；双击 reset |
| 右栏 tab/query/filter | current conversation projection + workspace preference | 新 conversation 清 selection；可保留 tab | 不变 | 保留 | 有 conversation 才恢复；Outline 忽略 Resources filter |

任何状态若无法从现有 store/文档持久层复用，先补 app-owned port/schema，再画控件；禁止用组件 module singleton 临时兜底。

### 12.1 需要扩展但不能另起平行体系

```ts
type ModelSelection =
  | { mode: 'auto' }
  | { mode: 'fixed'; profileId: string; modelId: string };

interface ChatConversationUiMeta {
  assistantId?: string;
  modelSelection: ModelSelection;
  archived?: boolean;
  pinned?: boolean;
}

interface ExplicitContextRef {
  id: string;
  kind: 'vault-file' | 'vault-folder' | 'upload' | 'url' | 'reply';
  uri: string;
  title: string;
  mimeType?: string;
  sourceMessageId?: string;
}

interface ChatTurnRelationship {
  messageId: string;
  replyToMessageId?: string;
  branchFromMessageId?: string;
  revisionOfMessageId?: string;
}

interface TurnExecutionReceipt {
  requestId: string;
  messageId: string;
  runId?: string;
  effectiveModel: { profileId?: string; provider: string; modelId: string };
  assistantId?: string;
  workflowId?: string;
  requestedSources: TurnSourceScope;
  actualSources: SourceReceipt;
  status: 'queued' | 'sending' | 'streaming' | 'waiting-permission' | 'completed' | 'error' | 'cancelled' | 'timeout';
  artifactIds: string[];
  startedAt: number;
  finishedAt?: number;
  error?: { code: string; message: string; recoverable: boolean };
}

interface SourceReceipt {
  projectIncluded: boolean;
  vaultQueries: string[];
  vaultDocuments: Array<{ id: string; path: string; title: string }>;
  webQueries: string[];
  webSources: Array<{ id: string; url: string; title: string }>;
}
```

这些字段应合并进现有 core chat types / persisted metadata，不能只存在组件 local state。旧 conversation 缺字段时有 backward-compatible defaults。

### 12.2 Artifact view contract

复用 `ArtifactRef`/`ArtifactPort`，增加 Chat UI 所需的关联视图，不复制 body store：

```ts
interface ChatArtifactReceipt {
  artifactId: string;
  runId: string;
  messageId: string;
  conversationId: string;
  projectId?: string;
  direction: 'input' | 'generated';
  kind: 'image' | 'document' | 'table' | 'dataset' | 'code' | 'diff' | 'diagram' | 'drawing' | 'canvas' | 'base' | 'bundle' | 'audio' | 'video' | 'custom';
  title: string;
  uri?: string;
  contentType?: string;
  preview?: { kind: 'image' | 'text' | 'document' | 'code' | 'none'; uri?: string; text?: string };
  vaultPath?: string;
  externalUri?: string;
  version?: number;
  sourceIds?: string[];
  state: 'pending' | 'generating' | 'needs-permission' | 'ready' | 'saving' | 'saved' | 'failed' | 'cancelled' | 'stale';
  availableActions: Array<'preview' | 'open' | 'save' | 'download' | 'copy' | 'edit' | 'apply' | 'retry' | 'review'>;
  createdAt: number;
  error?: { code: string; message: string; recoverable: boolean };
}
```

`availableActions` 由 port/capability 计算，不由 UI 猜。ConversationIndex 读 receipts，不继续只用 fenced-code 正则猜所有 artifact。

### 12.3 Action registry

把消息动作集中为 registry：`id / applicable(message, runtime) / priority / persistent / execute / pendingLabel / successReceipt / errorReceipt`。UI 和 More 使用同一 registry，杜绝重复菜单和不同 handler。

### 12.4 配置与文案

新增/扩展 `templates/config/chat-studio.json`，保存 greeting、starter fallback、label、filter、action copy、density thresholds；TypeScript 有同结构 fallback。业务逻辑中不散落中英文 label、能力映射、阈值或颜色。

## 13. 生产代码地图与改造落点

| 现有文件 | 当前责任 | 目标改造 |
|---|---|---|
| `src/ui/view/chat-studio-view/ChatStudioView.tsx` | 三栏 shell + resize | view-aware right visibility、responsive/collapse、layout persistence、single Composer coordinator |
| `src/ui/store/chatDataStore.ts` | project/conversation/message/stream/tool entity state | 保持 entity source；增加 receipt 投影，不复制 domain 数据 |
| `src/ui/view/chat-view/store/chatViewStore.ts` | navigation、draft/session controls | 拆清 durable conversation override 与 per-draft ephemeral state；移除含糊遗留 mode 暴露 |
| `src/ui/view/project-list-view/ProjectListView.tsx` | 左栏 shell/toolbar/query | 新顺序、原生 search handoff、section density |
| `ProjectsSection.tsx` / `ConversationsSection.tsx` | project/recent rows | disclosure/navigation、pin/type picker、menu、drag/title lifecycle |
| `src/ui/view/chat-view/ChatViewComponent.tsx` | 中栏 router | canonical view states、Composer slot contract |
| `view-Home.tsx` / `view-ProjectOverview.tsx` / `view-Messages.tsx` | 首页/项目/线程 | 统一 start state、完整项目主页、active thread placement |
| `hooks/useProjectLoad.ts` | 项目 conversation/star/resource/stats 加载 | description/generatedSummary、plans/artifact refs 投影；不复制 entity owner |
| `components/Composer.tsx` + `src/ui/component/prompt-input/` | 输入与现有 Run chip | Composer V2、syntax owners、source/model/Assistant/workflow、permission lifecycle |
| `hooks/useChatSubmit.ts` / `useChatSession.ts` / `useStreamChat.ts` | submit/session/stream | effective receipt、model profile identity、source scope、cancel/restore |
| `MessageViewItem.tsx` / `MessageListRenderer.tsx` | 消息 renderer | identity rule、type-specific renderer、action registry |
| `MessageMorePopover.tsx` | 消息 More | truthful dynamic overflow、raw/md/json/save/reply |
| `MessageSuggestedNext.tsx` / `MessageInlineFollowup.tsx` | 建议/局部追问 | 两条 inline + grouped More；删除 nested Composer，统一 reply anchor |
| `MessageAttachmentsList.tsx` | 图片/文件/URL 输入展示 | 全排列、metadata、preview/fallback、a11y |
| `ToolCallSummary.tsx` / `MessageStatusIndicator.tsx` | process/status | run grouping、permission、error/resume receipt |
| `ConversationIndex.tsx` | Overview/Artifacts 推导 | Outline/Resources、receipt-driven types、真实 anchor/filter/scroll spy |
| `src/core/types/chat.ts` | ConversationType、message/meta/resource | Assistant/model/source/receipt backward-compatible domain fields |
| `src/core/storage/vault/ChatStore.ts` / chat docs | conversation persistence | 新 meta/receipt migration、project description/plans |
| `src/service/chat/service-project.ts` / `ChatProjectSummaryDoc.ts` | project persistence 和系统摘要 | 新增用户 description/instructions，保持 generated summary 独立 owner |
| `src/service/chat/ChatConversationRun.ts` / `src/service/run-envelope/types.ts` | run 状态与通用 artifact ref | 修正 completed/cancel/timeout/error/permission 语义，挂 TurnExecutionReceipt |
| `src/service/chat/context/ContextPipeline.ts` / `profiles/ChatProfile.ts` / slots | 实际 request context 装配 | requested vs actual source receipt；未启用 slot 不得在 UI 冒充可用 |
| `src/service/chat/tools/chatToolBuilder.ts` | 当前 Web tool builder | 接真实 Vault retrieval port 或把 Vault Search 标 unavailable |
| `src/core/profiles/ProfileRegistry.ts` | enabled Profiles 和 bindings | Profile-qualified selector source |
| `src/core/providers/model-registry.ts` + `templates/config/models/` | model metadata | capability/context filters、缺失字段 schema |
| `src/ui/view/settings/components/RoleModelPicker.tsx` | 已有模型搜索/Profile 分组/键盘/tag | 抽共享 picker primitives，避免 Chat 复制第二套 |
| `src/core/ports/ArtifactPort.ts` + run-envelope stores | artifact refs/body | ChatArtifactReceipt 关联，不建第二个 artifact store |
| `src/app/commands/PeakCommandActions.ts` / `src/app/ui-host/modals/QuickSearchModal.tsx` | 原生 Quick Search owner | 只通过 app-owned opener 调用，不改内部 UI |
| `conversation-outline-view/ConversationOutlineView.tsx` + app view | 独立 outline leaf | 与 Studio active route 同步；避免项目/空态残留第二个索引 |

推荐按 8 行上限拆组件；不要把所有新逻辑继续塞回 `Composer.tsx` 或 `ConversationIndex.tsx`。

## 14. 关键端到端流程

### F1 · 新对话

左栏 New → `new` start state → starter/手输 → 添资源/选来源/模型/Assistant/workflow → send → 创建 conversation + user message + receipt → stream → artifact/status → active thread + right index。

### F2 · 项目继续工作

project name → project home → greeting/start prompt → project Composer（project locked）→ first send → project conversation → right index 恢复。Chevron 展开不进入主页。

### F3 · 定向追问/建议

message action 或 suggested next → reply anchor + editable draft → 主 Composer → send relationship → 新回答；不嵌套输入、不自动发。

### F4 · 检索与证据

`[[` → explicit Vault ref；Source toggles → allowed retrieval scope；左栏 Search → 原生 Quick Search。三条路径独立，turn receipt 记录实际 scope，引用可定位原文。

### F5 · 产物闭环

workflow/tool 产生 body → `ArtifactPort` 存储 → message receipt ready → preview/open/save/apply → 状态更新 → Resources 和项目 Resources 可恢复；失败不会生成 ready 假卡。

### F6 · 模型与 Assistant

搜索/筛选 model → 固定 `{profileId, modelId}` → Composer 回显 → request 用同一 binding → receipt 证明；恢复 Auto。Assistant prompt → draft → optional advanced → preview → save → conversation binding → non-default chip/identity。

### F7 · 中断与恢复

stream/tool run → Stop/permission reject/error/timeout → runtime cancel/rollback → 持久回执 → Retry/Resume，保留可编辑 draft 和显式 context，不制造重复 assistant message。

## 15. 明确不做与未来方向

本轮不做：公共 Assistant marketplace、常驻 Provider/temperature/token console、第二套全文搜索、默认 Assistant 重复头、每个 tool 一个 Composer icon、inline follow-up Composer、未有真实 mention source 的 `@`、为视觉变化重做 Quick Search。

FUTURE：多 Agent handoff workspace、复杂多产物 bundle review、专业 trace debugger、共享 workflow/project template market、reasoning/verbosity 在完整端到端支持后的按模型暴露。

## 16. 实施 DAG

### Stage 0 · Read-only audit（必须先做，但同一 session 继续）

产出 current → target matrix：requirement ID、现有 owner 文件、reuse/new/refactor、schema migration、test。核对 dirty worktree，声明只碰 Chat 范围。除真实 destructive blocker 外不等待第二次授权。

### Track A · Domain 与 persistence

- A1：定义 conversation UI meta、draft key、TurnSourceScope/Receipt、Assistant、ProjectPlan、ChatArtifactReceipt。
- A2：扩展 ChatStore/chat docs，分离 project description/generatedSummary，写 backward-compatible parser/migration 与 round-trip tests。
- A3：实现可持久化 `ModelSelection` Auto/fixed；扩展 catalog capability schema，建立 enabled Profile/model query API。
- A4：接通真实 Vault retrieval 与 `SourceReceipt`；若本轮无法安全接通，生产控件必须 unavailable，不能伪装已检索。
- A5：统一 message/run/tool 的 completed/failed/cancelled/timeout/permission 状态与 partial-output 规则。
- A6：建立 action/workflow/renderer registries、Assistant adapter/storage 和 config strings。

### Track B · Shell 与左栏（依赖 A1/A2/A6）

- B1：view-aware Studio shell、right visibility、responsive/collapse/resize。
- B2：左栏信息架构、原生 search handoff、pin/project/recent。
- B3：项目 disclosure/name split、row menus、title lifecycle、conversation type picker。

### Track C · Single Composer（依赖 A1–A6，可与 B 并行）

- C1：ComposerCoordinator、placement、draft isolation。
- C2：`+ / [[ /` 与 attachment/link picker。
- C3：source combinator + effective receipt。
- C4：Profile-qualified model selector + filters。
- C5：Assistant picker/builder/persistence。
- C6：send/stop/permission/retry lifecycle。

### Track D · Messages 与 artifacts（依赖 A2/A4）

- D1：input resources renderer 全排列。
- D2：rich answer/process/status/permission renderer。
- D3：artifact receipt 与 real action ports。
- D4：central message action registry + dynamic overflow。
- D5：suggested next + main Composer reply anchor。

### Track E · Project home（依赖 A2、C）

- E1：compact identity/stats、inline human + AI description draft。
- E2：project greeting/starters/Composer。
- E3：Conversations/Starred/Resources/Plans + durable Plan actions。

### Track F · Right index（依赖 D）

- F1：Outline item model + real anchors + scroll spy。
- F2：Resources direction/type filter + receipts。
- F3：project hidden state、collapse/resize/a11y。

### Track G · Integration and deletion

- G1：接通 end-to-end flows F1–F7。
- G2：删除/退役旧 nested follow-up、重复 controls、regex-only artifact guesses（保留兼容 fallback 时要注明退出条件）。
- G3：light/dark、wide/narrow、detached window、keyboard/IME/a11y。

## 17. Requirement 验收矩阵

> **2026-07-21 晚状态标注方式**：每个子表下方新增 "2026-07-21 状态" 小节，逐 ID 标注 `pass` / `partial` / `credential-blocked`。
> - `pass` = 源码 + 测试锁定 + 有实机截图或纯代码可验证；
> - `partial` = 主链路 pass，但存在诚实缺口（列出）；
> - `credential-blocked` = 代码全落地并锁在测试里，仅等 owner 真实凭据实机；
> - `manual-pending` = 涉及 VoiceOver / 双主题 / 多视口 / detached popout 全流程 QA，本 session 未跑。

### 17.1 Shell / navigation

- [ ] `SHELL-01` 无 Peak 品牌头；三栏密度符合 §5。
- [ ] `SHELL-02` 1728 与 894 无横向 overflow；三栏 minimum 保持。
- [ ] `SHELL-03` splitter mouse/keyboard/double-click/detached window 正常。
- [ ] `SHELL-04` project-home 真正隐藏右栏与焦点；active 恢复。
- [ ] `LEFT-01` New/Search/Pinned/Projects/Recent 顺序和入口正确。
- [ ] `LEFT-02` Quick Search 为 native handoff，无 fake internals/假快捷键。
- [ ] `LEFT-03` project chevron/name 行为拆分。
- [ ] `LEFT-04` opaque state-aware menus 和 destructive boundary。
- [ ] `LEFT-05` title regeneration 有 thinking + visible typing + persistence。
- [ ] `LEFT-06` View All title/type AND filter、canonical types、去重、reset。

**2026-07-21 状态**：
- `SHELL-01` `pass` — 实机截图确认无品牌头（`/tmp/peak-acceptance/`）。
- `SHELL-02` `partial(manual-pending)` — 1728 实机跑过；894 视口未在本 session 手工过。
- `SHELL-03` `partial(manual-pending)` — splitter aria + Home/End/Enter reset 已实现（Track 9 detached/a11y），代码 pass；detached window 全流程键盘未跑。
- `SHELL-04` `pass` — project-home 隐藏右栏代码路径复用 legacy，未回归。
- `LEFT-01`..`LEFT-06` `pass` — 无 legacy Home 删除后回归，Track A-G 已在 2026-07-20 landed。

### 17.2 Composer

- [ ] `COMP-01` new/project/active 任一状态 Composer count = 1，草稿隔离且切换可恢复。
- [ ] `COMP-02` new/project Composer 在视觉中部/内容流，active 在消息底部。
- [ ] `COMP-03` `+` 仅资源，`[[` 仅 Vault refs，`/` 仅 workflow，`@` 未占用。
- [ ] `COMP-04` project locked + Vault/Web independent switches；receipt 与实际请求一致。
- [ ] `COMP-05` model search/profile grouping/capability AND/context+output floor/Auto+fixed/unknown truth 完整，Auto reload 后仍为 Auto。
- [ ] `COMP-06` 不出现 Fast/Balanced/Best 或 unwired reasoning 控件。
- [ ] `COMP-07` Assistant searchable、conversation binding、prompt-first AI draft、advanced optional、explicit save。
- [ ] `COMP-08` multiline/IME/attachment/remove/send/stop/permission/retry keyboard flow 正常。
- [ ] `COMP-09` starter 只填草稿、不 auto-send、有 draft 后退场。

**2026-07-21 状态**：
- `COMP-01` `pass` — 实机截图确认 DOM 恰 1 Composer。
- `COMP-02` `pass` — 空态 Composer 居中实机确认。
- `COMP-03` `pass` — Track 3 Composer 入口语义已 land，`+` 仅资源三项、`/` slash Generate 组含 image/edit/video/music/document，`[[` 保留，`@` 未占用；测试 `test/composer-entry-semantics.test.ts` 锁定。实机截图确认 `/` 面 GENERATE 组缺 key 诚实禁用。
- `COMP-04` `partial` — Track 2 Composer 单一真值锁 requested vs actual sources 分开持久化，`test/composer-source-truth.test.ts` 锁定；**诚实遗留**：`chatViewStore` 旧 source 字段保留为单向镜像未全删。
- `COMP-05` `pass` — Track 1 Auto 真实路由锁定：auto sentinel 持久化不回写，`modelRouter` 能力过滤，`TurnExecutionReceipt` 补 `requestedSelection/modelSource/routeReason/requiredCapabilities`；测试 `test/model-router.test.ts`。
- `COMP-06` `pass` — 无 Fast/Balanced/Best；实机截图 Auto 标签确认。
- `COMP-07` `pass` — Track 4 Assistant Builder 完整（Advanced / lifecycle / ephemeral preview），`test/assistant-builder-lifecycle.test.ts`。
- `COMP-08` `partial(manual-pending)` — 键盘 flow 代码复用 legacy；IME 组合 / 多修饰键流未在本 session 手工跑。
- `COMP-09` `pass` — 实机截图 starter 只填不发确认。

### 17.3 Messages / artifacts

- [ ] `MSG-01` 默认 Assistant 无重复 identity；non-default/handoff 有清晰归属。
- [ ] `MSG-02` 图片 1/2/3/4/5–7/8+ 与文件少/多布局都可读。
- [ ] `MSG-03` file/URL/Vault preview 和失败 fallback 真实。
- [ ] `MSG-04` Markdown/table/code/diff/Mermaid/math/wikilink renderer 正常。
- [ ] `MSG-05` artifact receipt 有真实状态、关联、动作与失败路径；无 fake ready。
- [ ] `MSG-06` streaming typewriter 无闪烁；reasoning/tool/status/permission/error 生命周期完整。
- [ ] `MSG-07` 5 个 core actions 始终保留；宽屏 adaptive 全显且无 More。
- [ ] `MSG-08` 窄屏 reverse-priority overflow；More 只含隐藏项且无重复。
- [ ] `MSG-09` raw/md/json/save/targeted follow-up 都执行真实 handler 并反馈。
- [ ] `MSG-10` top 2 suggested next + grouped More；所有选择只填主 Composer。

**2026-07-21 状态**：
- `MSG-01`..`MSG-04` `pass` — 2026-07-20 landed，本轮未回归改动。
- `MSG-02` 图片布局分档纯函数补入 Track 9 detached/a11y，含 lightbox；`partial(manual-pending)` 多视口视觉。
- `MSG-05` `pass` — Track 5 artifact-Turn 关联 `TurnExecutionReceipt.artifactIds` 真实回填；Track 7 结构化产物 5 producer 全数 producer 失败保留 content + retry；测试 `test/artifact-turn-association.test.ts` + `test/artifact-create-producers.test.ts`（15 场景）。
- `MSG-06` `partial(credential-blocked)` — 状态生命周期代码 pass，permission 三态实现（deny/allow once/allow-for-run）；真实流式 turn 端到端要凭据。
- `MSG-07`..`MSG-08` `pass` — Track 8 消息动作 registry 优先级 + 反向 overflow（core 5 永不进 More）锁定。
- `MSG-09` `pass` — Track 8 Trace 打开真实 `AgentTrace`，Retry 走 variant 版本化，Branch 建真分支，save 走真实 handler；测试 3 个新文件。
- `MSG-10` `pass` — suggested next 顶部≤2 只填 Composer，targeted follow-up 用主 Composer reply anchor。

### 17.4 Project / right / persistence

- [ ] `PROJ-01` identity/stats/description/New conversation/四 tabs 信息完整但不堆卡。
- [ ] `PROJ-02` description inline human/AI draft、explicit save/cancel、持久化。
- [ ] `PROJ-03` project greeting/starters/Composer 与 new-chat 心智一致。
- [ ] `PROJ-04` Plans 是 durable schema，不是 tool steps；CRUD round-trip。
- [ ] `RIGHT-01` Outline/Resources 职责分开；filter 只在 Resources。
- [ ] `RIGHT-02` 所有可见条目定位真实 target + highlight；scroll spy 正确。
- [ ] `RIGHT-03` direction/type AND filter、empty state、open action 正确。
- [ ] `DATA-01` 新旧 conversation/project round-trip，无数据丢失。
- [ ] `DATA-02` effective model/Assistant/source/workflow/run/artifacts 可从历史恢复。
- [ ] `DATA-03` 刷新/重载后 pin、project description、plans、stars、artifacts、overrides 一致。
- [ ] `DATA-04` §12.0 每种 reset/persistence 行为有 test；new/project/conversation 之间无草稿、来源或 override 泄漏。

**2026-07-21 状态**：
- `PROJ-01`..`PROJ-04` `pass` — 2026-07-20 landed，本轮未回归改动。
- `RIGHT-01`..`RIGHT-03` `pass` — Track 5 artifact 关联 + Track 7 producer receipt 新增 `dataview/extract/reminder` kind，`folderPaths` 增 Artifacts/* 子目录；Resources / Outline 全认；scroll-spy 随消息增删 re-observe（Track 9）。
- `DATA-01`..`DATA-02` `pass` — Track 1 `TurnExecutionReceipt` 增 `requestedSelection/modelSource/routeReason/requiredCapabilities`；Track 5 `artifactIds` 真实回填；historical restore 已在 2026-07-20 landed。
- `DATA-03` `partial(manual-pending)` — reload persistence 代码 pass；实机 reload 未在本 session 逐项跑（除了 auto sentinel 与 media job resume 已有测试锁）。
- `DATA-04` `pass` — Track 2 requested vs actual sources 分开持久化 + `test/composer-source-truth.test.ts`；其余 §12.0 已由 2026-07-20 覆盖。

### 17.5 Runtime truth gates

- [ ] `RUN-01` Vault Search 触发真实 retrieval 并写 actual document receipt；否则 UI 明确 unavailable。
- [ ] `RUN-02` requested source switches 与 actual project/Vault/Web query/source receipt 分开持久化并可回看。
- [ ] `RUN-03` message/run/tool 的 failed/cancelled/timeout/permission 状态一致，partial output 不记 completed。
- [ ] `RUN-04` Assistant 有真实 registry/storage/adapter；Profile、User Profile、Assistant 不混用。
- [ ] `RUN-05` project `description` 与系统 `generatedSummary` 分离，AI draft 不自动保存。
- [ ] `RUN-06` Artifact producer/store/receipt/view/action 全链路真实；regex 只可作为有退出条件的旧数据 fallback。
- [ ] `RUN-07` RunChip role、Mic、model/source 等旧假控件已接线或删除/禁用，没有 local-only 视觉状态。

**2026-07-21 状态**：
- `RUN-01` `partial(credential-blocked)` — Track 2 `ChatRuntimeStatePort.isVaultSearchAvailable` `main.ts` 真值注入，`SystemPromptSlot` 不再硬编码可用；测试锁定；真实 turn 触发流式 retrieval receipt 需要 provider 凭据实机跑（无 key 场景 UI 已诚实 unavailable）。
- `RUN-02` `pass` — Track 2 分离持久化 + `test/composer-source-truth.test.ts`。
- `RUN-03` `pass` — Track 6 media job 状态机 + Track 7 producer failed receipt + Track 8 permission 三态；`useStreamChat` allow-for-run 层强制；**诚实缺口**：allow-for-run 仅 `useStreamChat` 层，不下沉到 harness。
- `RUN-04` `pass` — Track 4 Assistant Builder lifecycle + ephemeral preview；`EphemeralAssistantRegistry` 内存级 resolver 优先。
- `RUN-05` `pass` — 2026-07-20 landed。
- `RUN-06` `pass` — Track 5 `artifactIds` 真实回填 + Track 7 5 producer 全链路 + `artifact_create` ToolDef（`kind='edit'` 走 PermissionGuard）。
- `RUN-07` `pass` — 2026-07-20 landed，本轮零回归。

### 17.6 Accessibility / visual quality

- [ ] `A11Y-01` 所有 icon-only button 有 accessible name/tooltip；菜单和 dialog 有焦点圈/escape/restore。
- [ ] `A11Y-02` splitter、project disclosure、tabs、filter、menus 可键盘操作。
- [ ] `A11Y-03` streaming/title typing 使用合适 live region，不逐字符轰炸。
- [ ] `VIS-01` light/dark、100%/125% zoom、长中英文标题、空/满数据正常。
- [ ] `VIS-02` 无透明菜单、无 oversized gap、无重复 header、无孤立按钮行。

**2026-07-21 状态**：
- `A11Y-01` `partial(manual-pending)` — Track 9 icon-only button + tooltip 增补代码 pass；实机 VoiceOver 逐项未跑（Track 8 留 10 条清单）。
- `A11Y-02` `partial(manual-pending)` — Track 9 splitter aria + Home/End/Enter reset + `NavRow` 键盘化代码 pass；实机 detached popout 全流程键盘未跑。
- `A11Y-03` `partial(manual-pending)` — Track 9 msg-list `role="log"` `aria-live` 代码 pass；VoiceOver 播报节奏未在本 session 验听。
- `VIS-01` `partial(manual-pending)` — 亮/暗主题、125% zoom、894/1440 视口本 session 未跑；代码路径 tokens + 语义色 2026-07-20 landed，无本轮回归。
- `VIS-02` `pass` — 2026-07-20 全插件字体/语义色/portal 归轨已 land，本轮零回归。

## 18. 验证方案

### 18.1 文档与 mock 基线

```bash
node docs/gstack/chat-studio-interactive-2026-07-13/validate.mjs
python3 -m http.server 8173
node docs/gstack/chat-studio-interactive-2026-07-13/qa-gate2.mjs
```

### 18.2 生产代码

为 A–F 每轨增加 targeted tests，至少覆盖 persistence parser、source/model/Assistant resolution、action registry、overflow priority、conversation filters、project plan、artifact receipt、real target mapping。然后运行：

```bash
npm run test -- test/<new-chat-studio-targeted-test>.test.ts
npm run build
npm run test
```

不得只看进程 exit code；completion note 记录实际 test files/assertions、失败/挂起和未执行原因。

### 18.3 实机/浏览器检查

- Obsidian 主窗口与 detached window；light/dark。
- 1728×880、1440×900、894×835、窄于 894 的折叠策略。
- new → first send；project → conversation；model/Assistant/source；attachments；stream/stop/error；reply/suggested next；artifact save/open；right locate；reload restore。
- Dev console 无 error，页面无横向 overflow，焦点顺序和 Escape/restore 正确。

## 19. 下一 Session 完成报告格式

1. **Outcome**：是否满足 Impact Contract；若否，明确 partial。
2. **Changed surfaces**：按 Track A–G 列文件和行为，不用“优化若干”。
3. **Requirement matrix**：§17 每个 ID = pass / blocked / skipped + 证据。
4. **Runtime truth**：哪些控件已真实接线，哪些被隐藏/推迟。
5. **Verification**：命令、测试数、浏览器视口、Obsidian 手测结果。
6. **Migrations/compatibility**：旧 conversation/project 如何兼容。
7. **Remaining risk**：只列真实 blocker，不把一般 polish 包装成 blocker。

## 20. Definition of Done

只有同时满足以下条件才可称完成：

- 全部 MUST 需求和 §17 checkbox 有证据；
- 没有 proposal-only 控件、重复 Composer、重复搜索或重复 state owner；
- F1–F7 从入口走到持久结果/失败恢复；
- 生产 UI 通过 build、targeted/full tests（或诚实说明 runner 问题）、wide/narrow、light/dark、keyboard/a11y；
- 文档继续区分 current、target、mock，不把新提案倒写成已上线；
- 未回滚用户现有改动，未自行 commit。
