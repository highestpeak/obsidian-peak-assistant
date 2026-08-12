# Peak Assistant Onboarding 与 Settings 上线准备设计

> 状态：历史设计与诊断记录。当前产品要求以 [2026-08-09 能力、内容和流程 Brief](./2026-08-09-onboarding-settings-capability-content-flow-brief.md) 为准；当前交互参考从 [2026-08-12 文档入口](../../gstack/settings-onboarding-unified-2026-08-12/index.html) 打开。
>
> 范围：只重新定义首次成功路径、Settings 信息架构、连接与模型选择体验；本轮没有修改 Onboarding、Settings、Provider 或索引生产代码。
>
> 证据：`iShot_2026-08-06_22.35.56.mp4`、`iShot_2026-08-06_22.47.22.mp4`，以及当前源码、2026-05-29 旧版设计和当前 Roadmap。

## 1. 结论

当前问题不是简单的视觉老旧，而是三个系统性错位叠加：

- **产品已经扩展，Onboarding 仍停留在 5 月的能力模型。** 旧流程只呈现 Chat、Vault Search、AI Analysis、Copilot，没有覆盖 Chat Studio、AI Search、Composer、File Atlas、媒体生成，也没有解释这些能力之间的关系。
- **设置概念先于用户任务。** 用户先被迫理解 Provider、starter model、budget、speed、tier、preset、embedding、route，之后才知道能做什么。首次决策负担过高。
- **状态与动作不是同一份真相。** Onboarding 的 Index 与 System Check 来自静态 JSON；Settings 的一部分状态来自实时服务；完成页卡片又没有真正打开目标功能。结果是界面可以同时声称 “Not yet”“Scanning”“Ready”，却无法证明用户真的完成了一次任务。

新方案的核心不是少几个页面，而是把首次流程改成一条闭环：

```text
理解价值 → 连接一个可用 AI → 接受可靠默认 → 验证 Vault → 立刻完成真实任务
```

## 2. 录像与源码诊断

### 2.1 Onboarding

录像中可以稳定复现以下问题：

1. **步骤条拥挤。** 七个长标签压在 720px modal 顶部，当前步骤又使用宽胶囊，注意力先被导航结构占满。
2. **Provider 列表混入开发态能力。** 用户同时看到 Anthropic、OpenAI、Ollama、OpenRouter、AI Search Simulator，删除动作与首次连接动作同权重。
3. **OpenRouter 模型列表无信息架构。** `BootstrapModelStep` 直接映射整个本地 catalog，只靠正则给大量项目贴 `Recommended`，没有搜索、能力过滤、稳定展示名或任务上下文。
4. **首次流程要求不必要的偏好决策。** 用户必须选择预算与 speed/quality，才能运行 Curator；这两个问题无法替代实际 capability、privacy、availability 与 model health 检测。
5. **推荐结果只有三项是结构决定。** Review 固定遍历 `quick / deep / premium`，因此不会自然覆盖 Conversation、Knowledge Index、Media 或 Agent tasks。
6. **Knowledge Index 状态是假的。** `templates/config/onboarding.json` 固定写入 `No index yet`、`Scanning`、`Missing embeddings`；Onboarding 没有消费 `IndexService.getIndexStatus()`。
7. **System Check 也是静态表。** Provider、AI behavior、Index、Web、Safety 的状态都来自 JSON，不是验证 receipt。
8. **完成页不完成。** 四张 “Try first” 卡是无 handler 的 `div`；底部 `Open Chat` 只 dispatch `finish` 并关闭 modal；`Open Settings` 也只关闭 modal。
9. **底部按钮遮挡有明确布局根因。** body 自己设置 `max-height: 70vh`，外层同时叠加 progress 与 footer；modal shell 又 `overflow: hidden`，没有针对整体高度建立 grid/flex 的 `minmax(0, 1fr)` 约束。

### 2.2 Settings

Settings 相比旧版已经方向正确，但当前仍把长期配置当成“功能全集”：

- 第一层横向并列 Overview、AI Setup、Knowledge Index、Tools、Media Generation、Advanced；在中等宽度里缺少稳定的空间层级。
- AI Setup 一页同时塞入 Safety、5 个 presets、5 个 behavior rows、全部 providers 与 advanced controls，用户无法先确认“系统是否健康”。
- 打开 AI Setup 会自动创建 Simulator profile，使开发/测试能力进入真实 Provider 列表。
- Overview 的 Provider Ready 只表示存在 enabled profile，不代表连接成功；AI behavior 只检查部分 harness slots。
- Overview 的 Conversation summary 当前误读 `localFastConfig`，与 Fast Lookup 显示同一个 binding。
- Knowledge Index 首屏同时暴露文档类型、ignore patterns、PageRank、inspector、AI Analysis 输出、summary length、chunking、rebuild 等大量运营与调参项。
- Media Generation 暴露 `templates/config/media-generation.json`、preset id、model id、override 与内部 route 命名。用户真正需要的是“能否生成、默认走哪条路、输出到哪里、失败怎么修复”。

### 2.3 旧设计为何不再适合

当前样式并不是偶然漂移。production CSS 明确标注 source mock 为 `docs/gstack/onboarding-redesign-2026-05-29/mock.css`，Git 历史也显示旧 mock、strings 与 production rewrite 是连续落地的。也就是说：

> 旧设计被实现了，但产品已经越过了它的能力边界。

本次不应继续在旧 7 步流程上做 cosmetic patch，而应更新用户心智模型、状态投影与完成定义。

## 3. 产品心智模型

用户不需要先理解内部 runtime。Peak 应先用三个工作目标解释自己：

1. **对话与创作**
   - Chat Studio：问答、研究、写作、生成图片/视频/音频。
   - Composer：在当前文档中写作、Copilot、Intelligence/History。
2. **查找与理解**
   - AI Search：从 Vault 中寻找答案与证据。
   - File Atlas：看文件、Hub、关系与使用结构。
3. **委托与推进**
   - Wizard：把复杂任务拆成受控步骤。
   - Agent runtimes：在权限与确认机制下运行 Codex 或 Claude Code 类型的长任务。

Onboarding 只显示“你马上能做什么”；Settings 才解释“由什么连接、模型与策略驱动”。

## 4. 新 Onboarding：五个阶段

### 阶段 1：认识 Peak

目标：30 秒内形成价值预期，并为完成后的第一次真实动作留下 intent；不做功能百科。

首屏不再用三张过度简化的营销卡定稿，提供三种候选：

- **A · Choose a goal（推荐）**：四个真实目标——Ask and create、Work on these notes、Find and understand、Explore how my vault connects；每项同时给例子与目标 surface。
- **B · See the workspace**：用当前文档、Composer/Copilot、Chat Studio、AI Search、File Atlas、Wizard 建立工作区心智地图。
- **C · Start from a note**：从当前或最近文档直接选择 Continue writing、Ask what is missing、Find supporting notes、Explore its neighborhood，第一次成功路径最短。

最终可以选一个方向，也可以采用 A 的任务选择结构与 B 的模块关系表达组合。用户此时不接触 Provider、model、index 或 runtime 术语。

### 阶段 2：连接一个 AI

目标：只要求一个可用连接，不要求用户先设计完整 model plan。

默认可见的首发范围：

- Cloud API：OpenAI、Anthropic、OpenRouter。
- Local：Ollama。
- Agent runtime：Codex、Claude Code。

每次只展开一个选择，在原地完成认证、探测、测试。测试成功必须生成一份 connection receipt，包括：

- 认证方式；
- 可用能力；
- 已验证时间；
- latency / error 摘要；
- 需要用户确认的权限边界。

Custom OpenAI-compatible、LiteLLM、Google、Perplexity、fal.ai 等进入 `More connections` 或 Settings，不占首次流程主视线。首次流程不提供删除操作。

### 阶段 3：确认自动默认

目标：零问题完成默认设置。

Peak 根据已验证连接自动生成 task-based defaults：

- Conversation & writing（3 assignments）；
- Research & web（5 assignments）；
- Knowledge processing（2 assignments）；
- Understand files（2 assignments）；
- Agent work（2 assignments）；
- Create media（4 assignments）。

共 18 个 concrete assignments。默认只显示六个组的可用状态、继承关系和 fallback，不显示 raw model id。用户可以展开查看，但不再强迫回答预算与速度问题，也不再要求选择 bootstrap model。

### 阶段 4：验证 Vault

目标：消费真实索引状态，并只给一个下一步动作。

状态必须来自共享 `ReadinessProjection`，至少包含：

- 本地 store 是否可用；
- 已索引文件数 / eligible 文件数；
- missing / changed 数量；
- semantic capability 是否可运行；
- 数据新鲜度与最后成功时间；
- 推荐动作与影响说明。

若索引已经可用，显示真实覆盖率并允许直接继续；若缺少 embedding，只把 semantic 标成可选增强，不能把整个 Knowledge Index 写成 `Not yet`。`Scanning` 必须是短生命周期状态，并在超时后转为可恢复错误。

### 阶段 5：开始第一次任务

目标：Onboarding 只有在目标 surface 打开且任务已预填时才算完成。

提供 capability-aware launch actions：

- `Ask in Chat Studio`：打开 Chat Studio，并预填一个与 Vault 相关的问题。
- `Open a note in Composer`：优先当前文档，否则选择一篇最近文档。
- `Search my vault`：打开 AI Search，并带入示例 query。
- `Explore File Atlas`：打开 File Atlas 的可用入口。
- `Create an image`：仅在 media route ready 时显示。

底部操作区必须固定在 modal 内部，不参与 body 滚动；所有 action 都必须有真实 command / view activation handler。

## 5. 新 Settings 信息架构

`AI connection` 与 `AI behavior` 都是实现视角，无法让用户判断里面管理的是账号、模型、runtime 还是路由，因此不再作为导航名称。第三版同样取消全局 `Standard / Advanced`：切换模式会改变导航和内容范围，用户必须先判断自己属于哪种用户，之后还要重新寻找同一个设置。这不是降低复杂度，而是增加一个元决策。

Settings 只使用一套固定左侧导航：

```text
General                 Status and setup
AI & models             Providers, runtimes, and task defaults
Knowledge & search      Index and AI Search
Tools & media           Web, MCP, image, video, music, and speech
Workspace               Composer and product preferences
Data & privacy          Folders, usage, retention, and privacy
Developer               Diagnostics and precise runtime control
```

七个位置始终不变。分层发生在每个页面内部，而不是通过全局模式：

1. 高频、影响明确的设置直接显示为标准设置行；
2. 低频但仍属于该能力的设置在页面内以 `More options` / details 展开；
3. 横跨多功能、会改变 execution semantics 的运行级参数集中到最底部 `Developer`；
4. 搜索直接返回具体目标和所属分类，不要求用户先理解分类术语。

这不是取消旧设置。判断一项配置是否保留，只看它是否存在真实 consumer、是否改变产品行为、用户是否有合理的长期控制需求；不以它是否“高级”作为删除依据。

### General

General 是入口状态页，不是另一份完整设置表。它只回答“Peak 是否可用”和“最常改的全局默认是什么”：

- 一条整体 readiness 结论；
- AI setup、Knowledge index、Default safety 三项基础状态；
- 默认 Markdown 打开方式；
- Generated media folder；
- 重新运行 Setup assistant。

状态必须来自共享投影，并显示影响范围与修复入口。General 不重复渲染 Provider 列表、模型分配表或索引调参。

### AI & models

一个页面回答两个连续问题：Peak 可以调用谁，以及每类任务默认由谁负责。连接仍按运行方式区分：

- API services；
- Local models；
- Agent runtimes；
- Media services；
- compatible gateways。

首屏只显示最常用连接：OpenAI、OpenRouter、Ollama；Anthropic、Codex、Claude Code 与 compatible endpoints 在同页 `Show all supported providers and runtimes` 内展开。Codex 与 Claude Code 必须标为 Agent runtime，不能伪装成普通 chat provider。连接行主信息是状态、能力与最后验证时间；model 数量、raw endpoint、删除凭据等进入 Manage。

模型按任务绑定，而不是暴露 Fast / Deep / Premium 内部术语。常用视图显示六个 group default；同页 `Per-feature model overrides` 展开 18 个 concrete assignments：

- **Conversation & writing（3）**：Chat Studio、Composer Copilot、Quick assist。
- **Research & web（5）**：Research、AI Search planner、AI Search report writer、Web search、Stronger fallback。
- **Knowledge processing（2）**：Knowledge embeddings、Vault intelligence。
- **Understand files（2）**：Images/PDF/video understanding、Audio transcription。
- **Agent work（2）**：Agent run、Fast tool helper。
- **Create media（4）**：Image generation、Video generation、Music generation、Speech generation。

组内 assignment 默认继承 group default；只有明确 override 的条目保持 pinned。模型、provider 或 runtime 变化后，Auto 重新评估未 pinned 的 assignment；任何 incompatible assignment 必须显示原因和修复入口。

需要明确区分两个数字：当前 bundled catalog 有 113 个 LLM entries，其中 OpenRouter fallback catalog 为 55 个；这表示“可选模型库存”。18 个 assignments 表示“Peak 哪些工作职责需要模型或 runtime”，不是把模型库存缩成 18 个。OpenRouter 与 Ollama 还应使用 runtime discovery 覆盖 bundled fallback，因此实际候选可以更多且会变化。

18 assignments 是新的产品配置合同，不等于当前已经有 18 个独立、完整接线的 persisted slots。当前源码分散存在 Active Agent、Agent Fast、Chat、Copilot、Embedding、Web Search，Harness fast/research/stronger，AI Search thought/search refs，四类 media overrides 与 transcription model。实施时应将重叠项映射为继承关系；只有真正需要独立选择且有 execution consumer 的 assignment 才新增 override storage，不能机械制造 18 份重复配置。

### Knowledge & search

默认只显示 readiness、coverage、自动更新、包含内容、搜索质量和 Saved AI Search results。PageRank、chunk size、summary lengths、ignore patterns、Hub curation 等留在本页 `Indexing details`；repair/rebuild 独立成 danger section。已有可用索引不得显示 `Not yet`；增量待处理与不可搜索必须是两个不同状态。

### Tools & media

按能力显示：Image、Video、Music & speech、Web、External tools、Obsidian commands。用户面对的是 capability status、默认 route 与原地修复入口。preset、model override、aspect/duration/voice、validation receipt 与模板路径留在本页 `Media route details`；真正影响底层调用语义的 raw endpoint/header 进入 Developer。

### Workspace

承接原来散落在 AI Setup 与 Advanced 的长期交互偏好：

- Composer defaults 与 sidecar/Copilot 行为；
- Profile、personalization 与 ambient suggestions；
- Command Center board 与 launcher preferences；
- File Atlas / graph visualization 的 MST pruning、backbone、leaf opacity 与 width scaling；
- code presentation 与 appearance。

### Data & privacy

集中所有“Peak 保存到哪里、保留多久、显示多少内容”的控制：

- usage tracking、retention、preview visibility 与 privacy；
- Chat root、DataStore、custom prompts、skills、inbox、AI Analysis 与 media folders。

默认显示 Peak root、plugin data、usage receipts 与 privacy；各业务文件夹的独立覆盖在 `Individual folder overrides` 展开。路径变更、迁移或清除必须先说明影响、是否立即生效和恢复方式。

### Developer

Developer 固定在侧栏底部，不是另一种 Settings 模式。它只收纳跨能力、需要理解 execution semantics 的设置：

本轮设计不以“看起来简洁”为理由删除已有必要设置。迁移原则如下：

- **Routing & output**：temperature、top-p、top-k、penalties、reasoning effort、verbosity、step/total timeout、fallback、escalation、attachment handling、per-action overrides、provider base URL 与 custom headers。
- **Agent safety**：permission mode、allow escalation、maximum escalations、threshold、runtime hooks、monthly budget、reset day、alerts、MCP 与 plugin-command access。
- **Knowledge page details**：index level、refresh interval、document-type inclusion、ignore patterns、PPR、inspector link counts/depth、AI Analysis auto-save/history/exclusion/summary lengths、chunk size/overlap/minimum size/code handling、Hub curation schedule/interval，以及 rebuild/repair。它们不因为低频就被错误搬离 Knowledge。
- **Storage & diagnostics**：canonical data folders、SQLite projection backend、usage retention、debug trace mode/retention/copy format/raw content、DevTools graph inspector、maintenance、reset 与 diagnostics export。
- **Tools page details**：native profile、fal.ai key、output folder、per-kind preset IDs、model/aspect/quantity/duration/max duration/voice overrides、validation receipt 与 music license acceptance。raw provider headers 和 execution routing 才进入 Developer。

纯内部、没有真实 execution consumer 的字段不应继续伪装成可工作的设置；先标记 unavailable，再完成 resolver 接线或移除 dead path。

## 6. Provider 与 runtime 设计

### 6.1 不寻找“一个库替我们接全”

AI SDK 已提供多 Provider adapter 与中央 Provider Registry；OpenRouter 可以用一个 API key 访问大量模型；LiteLLM 可作为 OpenAI-compatible proxy 统一更多模型并提供 retry、fallback、budget。但它们都不能替 Peak 定义：

- 哪些能力被产品消费；
- 连接是否真的健康；
- 哪个 model 适合哪个任务；
- Vault 与工具权限；
- Codex / Claude Code 的 session、审批、事件流与中断；
- 媒体任务的异步 receipt。

因此 Peak 应保留自己的控制平面：

```text
Settings / Onboarding
        ↓
Connection Registry
        ├── Capability Manifest
        ├── Model Catalog
        ├── Health + Verification Receipt
        └── Routing Policy
                ↓
        Transport adapters
        ├── Direct API: OpenAI / Anthropic / OpenRouter
        ├── Local API: Ollama
        ├── Agent runtime: Codex / Claude Code
        ├── Media: OpenAI native / fal.ai
        └── Advanced gateway: LiteLLM / custom compatible
```

### 6.2 Codex 与 Claude Code 不是普通模型 Provider

两者都提供高层 agent runtime：有 session、工具、权限、事件流、工作目录和中断语义。UI 可以统一成 Connection 卡，但实现契约必须与 direct chat provider 分离。当前代码只定义了 `provider-direct` 与 `hermes-harness` backend；Codex / Claude Code adapter 是新的 implementation scope，不能因为 mock 出现就宣称已支持。

### 6.3 共享 task-model chooser

`provider-picker.html` 不是新产品页面，也不是 OpenRouter 专属设置入口。它只是为了设计审查而单独放大的 focused component。production 中它从 `Models by task` 的任意 group default 或 concrete assignment 打开为同一个 drawer，并接收：

- 当前 assignment；
- 可用 provider/profile；
- required capabilities；
- cost/privacy/context constraints；
- 当前继承与 override 状态。

当来源是 OpenRouter 时，选择器使用其动态 catalog，并按下面三层展示：

新选择器分三层：

1. **Best matches**：根据当前任务需要的 tools、vision、context、structured output、price/privacy 选 3 个稳定候选。
2. **Search and filters**：搜索 display name；能力、价格、上下文、速度、数据策略为显式 filter。
3. **All compatible models**：按匹配度排序，raw model id 只作为 secondary metadata。

模型目录应优先消费 OpenRouter 的动态 Models API，并缓存带 freshness 的 snapshot；不能继续把 bundled 55-item catalog 直接渲染成 onboarding radio list。

## 7. 共享状态真相

Onboarding 与 Settings 必须消费同一个状态投影，而不是分别拼 UI 文案：

```ts
type ReadinessState =
  | 'checking'
  | 'ready'
  | 'degraded'
  | 'action-required'
  | 'unavailable'
  | 'error';

interface ReadinessItem {
  id: string;
  state: ReadinessState;
  summary: string;
  evidenceAt?: number;
  sourceRevision?: string;
  repair?: { label: string; actionId: string };
}
```

关键规则：

- `ready` 必须来自实际 service/adapter 检测；
- `checking` 必须有 timeout 和下一状态；
- `degraded` 表示核心功能仍可用，并明确缺失的增强能力；
- `action-required` 必须有原地修复入口；
- 状态不明时显示 `Could not verify`，不能假装 `Not yet`；
- 所有 repair action 完成后立即重读同一投影。

## 8. 视觉方向

- 采用 restrained neutral surface，紫色只用于主 CTA、选中态与少量 focus ring。
- Onboarding 使用 920×680 左侧 5 步 rail + 主内容 + sticky footer；主区只滚动内容。
- Settings 使用约 1120×750 的固定七分类左侧导航 + 右侧主面板；导航不会因页面或用户模式而改变。
- 页面主体采用标准设置行，不用 dashboard card 矩阵承载主要配置；分组标题只解释影响范围。
- 边框与轻微 elevation 建立层级，不使用大面积紫底、渐变、过大圆角或彩色功能卡矩阵。
- 状态用 icon + 一句人话 + timestamp 表达，chip 不承担长解释。
- raw id、endpoint、template path、tuning knobs 在所属页面的详情或 Developer 中逐步展开。

## 9. 实施边界与推荐顺序

本设计建议按下面顺序实现，避免“先换皮、状态仍然不真”：

1. 建立共享 `ReadinessProjection` 与 connection verification receipt。
2. 把 Index、Provider/runtime、task-model assignment、Media status 接入投影；删除 Onboarding 静态 status rows。
3. 建立 Connection Registry 的 UI-facing manifest，区分 API、local、agent、media、gateway。
4. 实现新版 Settings shell、固定七分类、全局搜索、General 与 AI & models；迁移原有设置，保持存储兼容。
5. 实现 5 阶段 Onboarding，并让完成动作真正打开目标 surface。
6. 实现 capability-aware shared task-model chooser 和动态 OpenRouter catalog。
7. 最后迁移 Knowledge / Media 页面内详情与 Developer controls，并补齐 Codex、Claude Code adapter。

## 10. 验收合同

### Onboarding

- 未阅读文档的新用户可在 3 分钟内完成一个可用连接并运行首次任务。
- 默认路径不出现 raw model id、tier、preset、embedding provider 等内部术语。
- 连接错误、索引错误可原地修复；重试后状态立即更新。
- 已有 Index 时显示真实覆盖率，不出现静态 `Not yet`。
- 页面任意可用高度下 footer 始终可见且可聚焦。
- 完成动作打开真实 surface 并预填任务；关闭 modal 不算完成。

### Settings

- 用户能在 10 秒内回答：AI 是否可用、Vault 是否可搜索、媒体是否可生成、哪里需要处理。
- 左侧七个分类始终不变；不存在全局 Standard / Advanced 模式，也不会因打开 Developer 隐藏普通设置。
- 用户能通过分类或搜索定位具体设置；普通路径只出现用户可理解的任务角色。
- 低频设置在所属页面展开；只有跨能力、改变 execution semantics 的参数进入 Developer。
- 旧 Settings 中存在真实 consumer 的设置全部有明确迁移归属，不能以简化视觉为理由静默删除。
- 所有变更显示 saved/effective state；需要 rebuild/restart 时先确认影响。
- Connection 的 `Ready` 来自测试 receipt，而不是 API key 是否非空。
- Dangerous actions 与普通配置隔离，支持恢复默认值。

### 验证边界

当前交付是设计 spec 与静态可点击 HTML mock；没有改 production，也没有在真实 Obsidian 中验证交互。状态为：

> INTERACTION NOT VERIFIED · IMPLEMENTATION NOT STARTED

## 11. 可点击 mock

- [Review board](../../gstack/onboarding-settings-redesign-2026-08-06/index.html)
- [Onboarding start variants](../../gstack/onboarding-settings-redesign-2026-08-06/start-variants.html)
- [Onboarding click-through](../../gstack/onboarding-settings-redesign-2026-08-06/onboarding.html)
- [Settings click-through](../../gstack/onboarding-settings-redesign-2026-08-06/settings.html)
- [Task model chooser focused review](../../gstack/onboarding-settings-redesign-2026-08-06/provider-picker.html)

## 12. 外部实现参考

- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [AI SDK provider capability matrix](https://ai-sdk.dev/providers/ai-sdk-providers)
- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [LiteLLM overview](https://docs.litellm.ai/)
- [OpenAI Codex SDK announcement](https://openai.com/index/codex-now-generally-available/)
- [Claude Code CLI programmatic mode](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Claude Agent SDK migration model](https://platform.claude.com/docs/en/managed-agents/migration)
