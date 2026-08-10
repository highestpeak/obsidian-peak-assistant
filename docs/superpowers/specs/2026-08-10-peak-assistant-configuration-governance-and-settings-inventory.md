# Peak Assistant 配置治理与 Onboarding / Settings 职责边界

> - 状态：design-only product contract · configuration inventory · implementation not started
> - 日期：2026-08-10
> - 面向读者：产品负责人、产品设计师、交互设计师、后续实现与验收人员
> - 适用范围：Peak Assistant 的首次配置、长期设置、模块内偏好、系统默认、状态与维护操作
> - 配套文档：[Onboarding 与 Settings 能力、内容和流程 Brief](./2026-08-09-onboarding-settings-capability-content-flow-brief.md)

## 0. 这份文档解决什么问题

这份文档不讨论 Settings 长什么样，也不规定导航、分栏、控件、颜色或图标。它只回答四件事：

1. Peak Assistant 到底有哪些需要治理的配置；
2. 哪些允许用户设置，哪些只允许高级设置，哪些必须由系统决定；
3. 每项配置属于哪个产品模块，权威修改位置在哪里；
4. Onboarding、Settings、功能模块和系统各自负责什么，为什么必须这样分。

本文是配置层的 source of truth。后续 UI 可以重新设计，但不能因为视觉简化删除这里保留的真实能力，也不能把本文标为系统内部或尚未接通的字段画成普通用户可用设置。

建议审阅顺序：先看第 0–5 节确认治理原则与模块边界，再看第 6 节完整产品清单、第 7 节当前字段去留，最后集中确认第 10–11 节的现状缺口和 owner decisions。

### 0.1 最终结论

- **不是所有可变参数都是用户设置。** 模板 JSON、算法阈值、运行时限制和状态缓存可以变化，但不因此自动获得 Settings 入口。
- **不采用全局 Standard / Advanced 模式。** 高级程度属于具体配置项，由影响范围、风险、频率和理解成本决定；它不是一套替代 Settings。
- **配置有四个权威责任域：Onboarding、Settings、功能模块、系统。** 同一项配置只能有一个写入权威，可以从其他位置深链进入，但不能复制出多份互相冲突的值。
- **普通用户控制意图，系统控制机制。** 用户可以决定“默认用哪个连接”“是否自动更新索引”“AI 能否编辑”；不应默认控制 PageRank 权重、路由打分、轮询间隔或 schema 版本。
- **任何正式设置都必须有真实 consumer。** 仅有字段、表单或保存成功不算设置；必须能证明启动后可恢复、运行时会消费、修改后能验证实际生效。
- **状态、操作和设置必须分开。** “索引覆盖率”是状态，“自动更新索引”是设置，“重建索引”是操作；它们不能混成同一种配置项。
- **Onboarding 的完成不是第一次成功。** Onboarding 只写入完成首次任务所需的最小配置，随后必须进入真实工作入口并观察结果。

### 0.2 明确不做

- 不规定 Settings 的具体页面布局；
- 不决定侧栏、标签页、卡片、折叠或搜索控件的视觉形式；
- 不把旧 Settings 中出现过的每个字段都默认保留为用户设置；
- 不把“源码里有默认值”误写成“用户应该看到这个默认值”；
- 不把 Provider、模型、任务、工具、Agent runtime 和媒体 route 混为同一个对象；
- 不把诊断、迁移、重建和删除动作伪装成普通开关；
- 不在 Codex / Claude Code runtime adapter 尚未完成前写成已验证可用；
- 不将本文件视为实现完成证明。

## 1. 什么才有资格成为正式设置

一个项目只有同时满足以下条件，才能作为正式用户设置开放：

1. **表达用户意图**：用户能够理解自己为什么改变它；
2. **有真实 consumer**：至少一个 production runtime 会读取并改变可观察行为；
3. **可持久化恢复**：重启后值不会被归一化、迁移或默认值静默覆盖；
4. **有安全边界**：输入可校验，依赖与影响范围明确；
5. **可验证生效**：产品能区分已保存、已生效、等待处理和失败；
6. **有恢复路径**：可以恢复自动、恢复默认或撤销；
7. **有唯一 owner**：不会在多个页面保存互相冲突的同一意图。

缺少其中任一项时，应归入以下之一：

- 尚未开放；
- 只读状态；
- 系统内部配置；
- 维护操作；
- 一次性确认；
- 迁移兼容字段。

### 1.1 必须区分的四种“默认”

| 默认类型 | 含义 | 用户恢复默认时的行为 |
| --- | --- | --- |
| 编译默认 | 产品在没有任何环境信息时的安全 fallback | 不应把当前数值复制成永久 override |
| 自动默认 | 系统根据可用连接、模型能力、任务和环境动态解析 | 删除用户 override，重新加入自动解析 |
| 用户默认 | 用户明确选择的长期偏好 | 保留，直到用户修改或恢复自动 |
| 本次有效值 | 某次运行实际使用的连接、模型、route、权限与参数 | 只写入 receipt，不自动变成长期默认 |

“恢复默认”应优先意味着移除用户 override，而不是把某个当时的编译默认写死。否则产品升级后，旧用户无法得到更可靠的新默认。

## 2. 配置治理分类

本文对每个项目使用以下治理结论：

| 标记 | 名称 | 含义 |
| --- | --- | --- |
| `AUTO` | 自动可覆盖 | 系统应有可靠自动值；用户可以固定 override，也可以恢复自动 |
| `USER` | 常用可设 | 用户长期意图，影响清楚，适合在 Settings 中直接管理 |
| `LOCAL` | 模块内可设 | 只影响当前功能、当前任务或当前视图，权威位置在 owning surface |
| `POWER` | 高级可设 | 有真实作用，但影响范围大、风险高、频率低或理解成本高 |
| `CONSENT` | 确认事项 | 许可、成本或数据影响的一次性明确确认；不是长期普通开关 |
| `ACTION` | 运维动作 | 验证、重建、清理、迁移、删除等命令；执行后产生进度与 receipt |
| `STATUS` | 只读状态 | 系统检测或计算出的事实；允许刷新和修复，但不允许手工填写 |
| `SYSTEM` | 系统固定 | 算法、schema、安全硬边界、内部阈值或表现配置，不向普通用户开放 |
| `BLOCKED` | 暂不开放 | 字段或 UI 可能已存在，但持久化、consumer、能力或验证不完整 |

`POWER` 不是一个全局模式。它只表示某一项应该降低默认视觉干扰，并附带影响说明、校验与恢复方式。

## 3. 一项配置应该放在哪里

```text
它是否表达用户意图？
  否 → 状态、系统配置或运行 receipt
  是 → 当前 production runtime 是否真实消费？
        否 → 暂不开放
        是 → 是否只影响当前任务、当前文档或当前视图？
              是 → owning surface
              否 → 是否是完成所选首次任务的必要阻塞项？
                    是 → Onboarding 只询问最小值，并写入同一份长期配置
                    否 → Settings
              → 如果有安全、成本、迁移或重处理影响，再归为高级、确认或运维动作
```

### 3.1 五条硬规则

1. 同一个值只有一个写入 owner；
2. 状态入口可以跳转到 owner，但不能自行维护副本；
3. 模块内选择如果需要成为长期默认，必须明确执行“设为默认”，不能自动污染 Settings；
4. Onboarding 不发明自己的 Provider、模型、索引或权限数据结构；
5. 设置保存后必须重新读取 effective state，不能由前端自行假设成功。

## 4. Onboarding、Settings、功能模块和系统的职责

### 4.1 Onboarding：负责第一次成功

Onboarding 的输入是：

- 用户第一次想完成的真实任务；
- 当前环境、连接、Vault、索引、工具和 runtime 的真实 readiness；
- 已保存且仍有效的用户配置；
- 上次未完成流程的进度。

Onboarding 只允许写入：

- 完成首次任务所需的新连接或认证；
- 未被用户固定的任务自动默认；
- 完成该任务所需的最低安全许可；
- 与首次任务直接相关的索引、媒体或 runtime consent；
- Onboarding 进度、证据时间和首次任务 handoff 状态。

Onboarding 不负责：

- 完整 Provider 和模型目录管理；
- 逐项讲解 Peak 的所有功能；
- temperature、chunk size、PageRank、timeout 等高级参数；
- 全量 MCP、Skills、Command Gateway 管理；
- 长期数据保留、目录迁移、调试 trace；
- 替用户重新覆盖已经固定的 task assignment；
- 把 setup completion 当成 first success。

为什么这样分：新用户此时没有足够上下文判断大量技术选项。Onboarding 应把“学习产品”替换成“完成一件事”，只在系统无法自动补齐阻塞依赖时提问。

### 4.2 Settings：负责长期掌控

Settings 负责：

- 当前系统是否正常，以及问题影响什么；
- Connection、任务默认、安全、索引、媒体、数据和工具的长期配置；
- 设置的保存、生效、重启、重处理和迁移状态；
- 恢复自动、恢复默认和依赖影响检查；
- 定位并进入局部修复流程；
- 高级设置、诊断和危险操作的治理；
- 对所有模块的可搜索入口，但不复制模块内状态。

Settings 不负责：

- 当前聊天的临时模型切换；
- 当前 Composer 动作的临时 instruction；
- 当前 File Atlas 视图的筛选与缩放；
- 当前媒体任务的 prompt、数量和候选预览；
- 当前 Agent run 的逐步确认；
- 运行历史本身的完整浏览体验。

为什么这样分：Settings 管理跨任务、跨会话的长期意图。把一次性上下文选择放入 Settings，会让用户无法判断它影响“现在”还是“以后”。

### 4.3 Owning surface：负责当前任务

Chat Studio、Composer、AI Search、File Atlas、Agent、Media、Command Center 等功能模块负责：

- 当前任务输入；
- 当前任务的临时模型、route 或 preset；
- 当前上下文范围；
- 当前视图和工作流偏好；
- 运行前确认；
- 当前结果、receipt、重试和恢复；
- 明确的“设为长期默认”动作。

为什么这样分：只有任务现场拥有足够上下文解释选择的实际影响，用户也能立即看到结果。

### 4.4 System：负责机制和事实

系统负责：

- 自动检测和 readiness；
- 模型能力、目录来源和新鲜度；
- 自动路由与 fallback 解析；
- 索引覆盖、changed / missing、semantic readiness；
- schema、版本、迁移和安全硬边界；
- 算法权重、阈值、批大小、内部 timeout 与表现配置；
- requested configuration 与 effective configuration 的 receipt；
- 发现配置不可用时阻止假成功。

为什么这样分：这些事实不能由用户可靠填写；允许用户手工修改会破坏可信度、安全性或可支持性。

### 4.5 Diagnostics / Maintenance：负责检查和修复

Diagnostics 是只读事实和导出；Maintenance 是有明确影响的动作。两者可以从 Settings 进入，但都不是普通“设置”。

每个维护动作必须说明：

- 准确目标；
- 影响范围；
- 是否会重处理或删除；
- 是否可取消与恢复；
- 当前进度；
- 最终 receipt；
- 完成后重新读取的 readiness。

## 5. 模块所有权地图

| 模块 | 它拥有的配置意图 | Onboarding 角色 | 不属于它的内容 |
| --- | --- | --- | --- |
| Setup & Readiness | 无长期业务偏好；只拥有 setup 进度 | 检测、恢复、串联首次任务 | Provider 字段、索引参数、模型目录 |
| Connections | 连接实例、认证、endpoint、启停 | 只补首次任务缺失的连接 | 任务路由、工具许可、模型能力事实 |
| Task Models | 任务组默认、assignment override、fallback 意图 | 自动分配最小可用默认 | Provider 凭据、模型目录维护 |
| Safety & Agent Runtime | 默认写权限、升级策略、预算意图 | 只确认首次任务最低权限 | 单次 tool approval、内部 risk classification |
| Knowledge Index & Search | 索引范围、更新策略、质量层级、分析输出 | 验证并执行最小必要索引 | 当前 query、索引覆盖率手工输入 |
| Chat Studio | 对话级临时行为、附件和会话选择 | 首次 Chat handoff | 全局 Provider 管理、长期索引策略 |
| Composer | 文档默认打开方式、Copilot/Intelligence长期偏好 | 首次 Composer handoff | 当前选区、当前 action instruction |
| AI Search / Analysis | 分析输出与历史偏好 | 首次 Search handoff | 另建一套模型体系 |
| File Atlas / Graph | 图谱的稳定默认与模块内视图偏好 | 验证目标文档和图数据可用 | 图算法权重、当前选中节点 |
| Tools, MCP & Skills | 工具连接、长期 allow/deny、Skills 位置 | 仅在首次任务依赖时处理 | 当前 run approval、系统风险硬限制 |
| Media & Files | route、每类媒体默认、生成位置、许可 | 首次媒体任务最小配置 | 当前 prompt、预览和生成结果 |
| Workspace & Ambient | 启动偏好、相关内容载体、Command Center 长期组织 | 首次成功后的推荐入口 | 当前活动文档、最近文件事实 |
| Data, Usage & Privacy | 数据位置、保留、预览、预算与隐私意图 | 只处理阻塞首次任务的 consent | 原始 usage receipt、内部 DB schema |
| Appearance & Accessibility | 稳定显示与交互偏好 | 只检测系统能力，不强迫选择 | 产品设计 token、组件级 CSS |
| Maintenance & Developer | 无普通偏好；高级运行与诊断控制 | 不进入默认首次流程 | 普通状态和高频配置 |

## 6. 完整产品配置清单

本节是目标产品清单。它规定产品需要覆盖的用户意图，不等于当前全部已经实现。

### 6.1 Setup、Readiness 与首次成功

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 当前整体 readiness | `STATUS` | Setup & Readiness | 必须读取 | 由各能力真实证据聚合，不允许手填 |
| 各工作入口 readiness | `STATUS` | 各能力 adapter | 按首次目标读取 | Chat、Search、Composer、Atlas、Agent、Media 分开 |
| 最后验证时间与来源 | `STATUS` | Readiness projection | 必须显示 | 状态必须带 evidence time |
| setup 进度 | `STATUS` | Onboarding state | 必须恢复 | 进度不等于能力 ready |
| 第一次任务目标 | `LOCAL` | Onboarding | 必须选择或自动推荐 | 只服务本次首次成功，不是长期产品模式 |
| 继续 / 重跑 Setup | `ACTION` | Setup & Readiness | 可执行 | 不静默覆盖已有 pinned override |
| 局部修复某项能力 | `ACTION` | 对应模块 | 可执行 | 修复后重新读取 readiness |
| first success 结果 | `STATUS` | 首次任务 owner | 必须观察 | 真实任务完成才成立 |
| upgrade prompt dismiss time | `SYSTEM` | 触发该提示的模块 | 不询问 | 只是 UI 状态，不是用户业务设置 |

这里没有普通 `USER` 设置，因为 Setup 页面应展示事实和动作，而不是复制所有配置。

### 6.2 Connections 与 Provider

#### 上线优先级

| 类型 | 产品结论 | 当前边界 |
| --- | --- | --- |
| OpenAI direct API | P0 一等连接 | 当前 Profile 类型已存在 |
| Anthropic direct API | P0 一等连接 | 当前 Profile 类型已存在 |
| OpenRouter gateway | P0 一等连接 | 必须动态发现目录并显示缓存新鲜度 |
| Ollama local service | P0 一等连接 | 必须检测本地服务和动态模型 |
| Codex Agent runtime | P0 Agent runtime | 当前不能冒充普通 LLM Profile；adapter 尚未完整 |
| Claude Code Agent runtime | P0 Agent runtime | 当前不能冒充普通 LLM Profile；adapter 尚未完整 |
| Google / Perplexity | P1 扩展连接 | 当前 Profile 类型已存在 |
| LiteLLM / LM Studio / vLLM / custom | P2 compatible endpoint | 只在高级配置中开放 |
| Simulator | 开发 / QA | 不进入普通连接目录 |

#### 用户可控内容

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 新增连接 | `USER` | Connections | 缺失时才询问 | Onboarding 只展示完成目标所需的少量推荐项 |
| 连接显示名称 | `USER` | Connections | 使用可靠默认名 | 多账户时才需要用户区分 |
| API key / auth | `USER` | Connections | 阻塞时输入 | 密文处理；不得在 receipt 或日志回显 |
| base URL | `POWER` | Connections | Ollama / custom 必需时询问 | 已知 Provider 使用系统默认 endpoint |
| custom headers / env | `POWER` | Connections / MCP | 不询问 | 密钥字段需单独保护 |
| 启用 / 停用连接 | `USER` | Connections | 复用已启用且 verified 的连接 | 停用前显示受影响任务 |
| 测试 / 重新验证 | `ACTION` | Connections | 保存后立即执行 | API key 非空不等于 ready |
| 删除连接 | `ACTION` | Connections | 不执行 | 必须先列出 task assignments 和 fallback 影响 |
| 清除本地凭据 | `ACTION` | Connections | 不执行 | 与删除显示记录区分 |
| 多账户 / 多 endpoint | `POWER` | Connections | 不询问 | 每个实例有独立名称和验证状态 |
| 模型目录刷新 | `ACTION` | Connections | 必要时执行 | OpenRouter / Ollama 优先动态 discovery |
| 目录来源、新鲜度、错误 | `STATUS` | Connections | 必须读取 | fallback catalog 必须明确标记 |
| Provider 能力清单 | `STATUS` | Capability registry | 用于自动筛选 | 用户不能手工声明已知 Provider 的能力 |
| custom endpoint 模型能力 override | `POWER` | Compatible endpoints | 不询问 | 仅未知 endpoint；需显著提示可能导致错误路由 |
| connection id、createdAt | `SYSTEM` | Persistence | 不显示为设置 | 只用于稳定引用和迁移 |

连接只回答“Peak 可以调用谁”。它不拥有“Chat 默认用谁”或“Embedding 默认用谁”，这些属于 Task Models。

### 6.3 Models、任务默认与模型选择

模型选择器不是一个独立的 Settings 模块。它是一种被多个任务配置复用的选择能力。真正的产品配置单位是“某类任务默认使用什么”，而不是“全局选一个模型”。

#### 任务组与 assignment

| 任务组 | 必须覆盖的 assignment | 默认策略 |
| --- | --- | --- |
| Conversation & writing | Chat Studio、Composer Copilot、Quick assist | 组级 Auto；单项可固定 |
| Research & web | Research、AI Search planner、AI Search report writer、Web search、Stronger fallback | 按 tools、web、context 与质量需求自动筛选 |
| Knowledge processing | Knowledge embeddings、Vault intelligence | embedding 与 generative model 分开 |
| Understand files | Image/PDF/video understanding、Audio transcription | 按输入 modality 筛选 |
| Agent work | Agent run、Fast tool helper | Agent runtime 与普通 LLM route 分开 |
| Create media | Image、Video、Music、Speech | 使用媒体 route / preset，不混入文本模型目录 |

这 18 项是产品职责，不是模型数量，也不要求默认展示 18 个选择器。assignment 继承任务组，只有偏离组默认时才形成 pinned override。

#### 配置与状态

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 任务组默认 | `AUTO` | Task Models | 自动建立 | 优先满足能力、可用性和用户已有连接 |
| 单个 assignment override | `POWER` | Task Models | 不询问 | 只有用户明确固定才脱离继承 |
| 当前会话临时模型 | `LOCAL` | Chat Studio | 首次 handoff 可自动 | 不自动改长期默认 |
| 当前 action 临时模型 | `LOCAL` | owning action | 不询问 | receipt 记录 requested / effective |
| 恢复 Auto | `ACTION` | Task Models | 可用于修复 | 删除 override，重新继承 |
| 自动 fallback | `AUTO` | Task Models | 自动建立 | 必须说明何时会触发 |
| stronger escalation 是否允许 | `USER` | Safety & Agent | 不询问 | 默认允许，但受预算和权限约束 |
| 模型候选与兼容性 | `STATUS` | Model catalog | 自动筛选 | 来源、能力、新鲜度和不兼容原因可见 |
| 实际使用的模型与 route | `STATUS` | Run receipt | 首次任务必须记录 | 不用默认值代替实际值 |
| raw model id | `STATUS` / `POWER` | Model catalog | 不要求理解 | 普通语义使用 display name；高级可查看 raw id |
| Provider `primaryModel` / `fastModel` | `BLOCKED` | Migration | 不进入新设计 | 与 task assignments 重叠，应迁移后退役 |
| 旧 `defaultModel` | `BLOCKED` | Migration | 不进入新设计 | 不能继续作为含义模糊的全局模型 |
| 旧 quick/deep/premium tier 字段 | `BLOCKED` | Migration | 不暴露术语 | 映射到用户可理解的任务职责后逐步退役 |

#### 输出与运行控制

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| reasoning effort | `POWER` | Task Models / action | 只有兼容模型和真实 consumer 才开放 |
| text verbosity | `POWER` | Task Models / action | 应先提供任务语义默认 |
| temperature | `POWER` | Task Models / action | 默认由模型或产品 preset 决定 |
| top-p / top-k | `POWER` | Task Models / action | 不与 temperature 同时强迫普通用户判断 |
| presence / frequency penalty | `POWER` | Task Models / action | 只为支持该参数的 Provider 开放 |
| max output tokens | `POWER` | Task Models / action | 必须受模型上限校验 |
| step / total timeout | `POWER` | Runtime | 只有可证明被执行路径消费时开放 |
| model-routing scoring / tier preference table | `SYSTEM` | Model router | 属于产品机制，不是用户偏好 |
| context safety factor / long-context threshold | `SYSTEM` | Model router | 防止超限的安全机制 |
| chat loop max steps / tool calls | `SYSTEM` | Chat runtime | 产品运行硬边界；将来若开放需单独风险设计 |

### 6.4 Safety、Agent runtime、Tools、MCP 与 Skills

#### 安全与 Agent

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 默认 permission mode | `USER` | Safety & Agent | 首次 Agent 任务确认 | 默认 `acceptEdits`；`bypassPermissions` 必须高风险确认 |
| 当前 run permission override | `LOCAL` | Agent run | 运行前确认 | 只影响当前 run |
| 自动 escalation | `USER` | Safety & Agent | 不询问 | 当前默认开启 |
| 最大 escalation 次数 | `POWER` | Safety & Agent | 不询问 | 当前范围 1–3 |
| escalation score threshold | `POWER` | Safety & Agent | 不询问 | 不要求普通用户理解自评分 |
| hooks 是否启用 | `POWER` | Safety & Agent | 不询问 | 默认关闭；需要明确执行边界 |
| Agent runtime 安装、版本、登录 | `STATUS` | Agent runtime | 目标依赖时检测 | 不允许手填 ready |
| 工作目录策略 | `USER` / `POWER` | Agent runtime | 目标依赖时确认 | 默认使用明确的当前 Vault / workspace 边界 |
| session 创建、恢复、停止 | `ACTION` | Agent runtime | 首次任务可执行 | 不是长期设置 |
| runtime timeout / interrupt | `POWER` / `ACTION` | Agent runtime | 不询问 | timeout 是策略，interrupt 是动作 |
| destructive / unknown command system block | `SYSTEM` | Safety policy | 自动执行 | 用户不可覆盖硬阻止 |

#### MCP、Obsidian commands 与 Skills

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 新增 MCP server | `POWER` | Tools | 仅首次任务依赖时 | 默认无外部 server |
| MCP name / transport | `POWER` | Tools | 必要时配置 | stdio 与 SSE 分开验证 |
| MCP command / args / URL | `POWER` | Tools | 不默认询问 | 输入校验并显示执行边界 |
| MCP env / headers | `POWER` | Tools | 不询问 | 密文值保护 |
| MCP enable / disable | `USER` | Tools | 可复用已连接工具 | 停用前显示受影响 Skills / Agents |
| MCP connection status / tool count | `STATUS` | Tools runtime | 依赖时读取 | connecting、connected、error 分开 |
| Web Access assignment | `AUTO` | Task Models / Tools | 任务需要时建立 | 不把 Web 当 Provider |
| 扫描第三方 Obsidian commands | `ACTION` | Command Gateway | 不进入默认流程 | 扫描后产生可审查 finding |
| command allow / deny | `USER` | Command Gateway | 目标依赖时确认 | decision 是用户意图 |
| risk、purpose、source hash、stale | `STATUS` | Command Gateway | 自动读取 | 用户不手工填写风险事实 |
| destructive / unknown compiled exclusion | `SYSTEM` | Command Gateway | 自动执行 | 不允许 review 解除 |
| command audit receipt | `STATUS` | Command Gateway | 首次 run 可记录 | 记录实际 observation |
| Skills folder | `POWER` | Skills | 不询问 | 默认从 AI root 派生 |
| Skill enable / disable / scope | `USER` / `LOCAL` | Skills owner | 目标依赖时最小处理 | 全局启停与单次选择分开 |
| Skill instruction / allowed tools | `POWER` | Skill editor | 不询问 | 需要 schema 校验和明确风险 |
| Gateway batch size、regex、settle delay、rotation | `SYSTEM` | Template config | 不询问 | 内部算法和运行上限 |

### 6.5 Knowledge Index、Search 与 AI Analysis

#### 状态和日常策略

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| local store health | `STATUS` | Knowledge Index | 必须检测 | ready / error / unavailable |
| indexed / eligible / coverage | `STATUS` | Knowledge Index | 必须读取 | 不允许手工填写 |
| missing / changed files | `STATUS` | Knowledge Index | 必须读取 | 决定最小 update 动作 |
| last successful build / update | `STATUS` | Knowledge Index | 必须读取 | 带 evidence time |
| text search readiness | `STATUS` | Knowledge Index | 必须读取 | 与 semantic readiness 分开 |
| semantic / full enrichment readiness | `STATUS` | Knowledge Index | 目标依赖时读取 | 缺失时可 degraded，不一定 failed |
| indexing stage / progress / cancelability | `STATUS` | Knowledge Index | 运行时显示 | 不能长期停留在无事实的 Scanning |
| index level：fast / semantic / full | `USER` | Knowledge Index | 只选满足目标的最低层级 | 变更可能触发重处理 |
| auto index / incremental update | `USER` | Knowledge Index | 首次索引后说明 | 当前默认 false；上线默认仍需 owner 决策 |
| refresh interval | `POWER` | Knowledge Index | 不询问 | 当前编译默认 5 秒 |
| include document types | `USER` | Knowledge Index | 使用可靠推荐集合 | 只开放真实 loader 支持的类型 |
| include / exclude folders and patterns | `USER` | Knowledge Index | 只处理明显冲突 | 默认排除 `.git`、`node_modules`、`.obsidian`、数据目录等 |
| embedding task assignment | `AUTO` | Task Models | semantic 目标依赖时建立 | 不在 Index 中另存一套冲突模型 |
| PPR reranking | `POWER` | Search quality | 不询问 | 当前默认开启；应说明影响搜索排序 |
| Hub curation scheduler | `USER` | Knowledge intelligence | 不询问 | 当前默认关闭 |
| Hub curation interval | `POWER` | Knowledge intelligence | 不询问 | 当前默认 7 天 |

#### 内容解析、chunking 与分析输出

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| Markdown / PDF / image / Excalidraw 等类型 | `USER` | Knowledge Index | 只有端到端 loader 通过才可选择 |
| XLSX | `BLOCKED` | Knowledge Index | 当前 loader 明确返回不支持，不得画成可用开关 |
| chunk size / overlap | `POWER` | Knowledge Index | 当前默认 1000 / 200；变更需 re-index |
| minimum document size for chunking | `POWER` | Knowledge Index | 当前默认 1500；当前 UI key 需要修复后才可靠 |
| skip code blocks | `POWER` | Knowledge Index | 当前默认关闭 |
| code placeholder / max code chars | `POWER` | Knowledge Index | 只有 skip/code strategy 需要时出现 |
| inspector keyword / tag counts | `LOCAL` / `POWER` | Inspector / File Atlas | 更适合模块内偏好，不是索引核心设置 |
| inspector folder grouping / depth | `LOCAL` / `POWER` | Inspector / File Atlas | 当前 UI 存在，但启动恢复链路不完整 |
| AI Analysis auto-save | `USER` | AI Search / Analysis | 首次分析使用默认；当前默认开启 |
| AI Analysis output folder | `USER` | AI Search / Analysis | 默认从 AI root 派生；修改需说明未来写入与迁移边界 |
| exclude saved analyses from search | `USER` | AI Search / Analysis | 当前默认开启，防止结果反复污染搜索 |
| analysis history limit | `USER` | AI Search / Analysis | 当前默认 5 |
| short / full / session summary limits | `POWER` | AI Search / Analysis | 当前默认 150 / 2000 / 3000 |
| thought / search agent model fields | `BLOCKED` | Migration | 迁入 Task Models，避免与 planner / writer assignment 重复 |

当前 `includeDocumentTypes` 的逐类结论：

| 文档类型 | 当前默认 | 目标治理 | 说明 |
| --- | --- | --- | --- |
| Markdown | 开启 | `USER` | 核心文本来源 |
| PDF | 开启 | `USER` | 需要 parser 与失败状态 |
| Image | 开启 | `USER` | 需要真实图像理解 / OCR 依赖 |
| Excalidraw | 开启 | `USER` | 当前有专属 loader |
| TXT | 关闭 | `USER` | 文本 loader 可用后允许开启 |
| CSV | 关闭 | `USER` | 当前 table loader 支持 |
| JSON | 关闭 | `USER` | 当前有专属 loader |
| HTML / XML | 关闭 | `USER` | 当前有专属 loader |
| DOCX | 关闭 | `USER` | 当前有专属 loader |
| PPTX | 关闭 | `USER` | 当前有专属 loader |
| Canvas | 关闭 | `USER` | 当前有专属 loader |
| URL | 关闭 | `POWER` | 与本地 Vault 文件不同，需明确抓取和隐私边界 |
| XLSX | 关闭 | `BLOCKED` | 类型存在，但当前 loader 明确不解析 |
| Folder | 关闭 | `SYSTEM` | 结构资源，不应伪装成普通可索引文件类型 |
| Unknown | 关闭 | `SYSTEM` | 不应允许用户盲目开启 |

#### Operations

| 操作 | 治理 | 必须说明 |
| --- | --- | --- |
| 更新 changed files | `ACTION` | 预计文件数、阶段、取消、receipt |
| full re-index | `ACTION` | 覆盖范围、耗时、旧索引可用性 |
| rebuild vectors | `ACTION` | embedding connection、成本、pending 数量 |
| run LLM enrichment | `ACTION` | 模型、成本、数据范围 |
| refresh hubs / gap / intuition | `ACTION` | 输出、影响、失败恢复 |
| compare search results | `ACTION` | 仅诊断/评估，不静默改变生产默认 |
| delete index data | `ACTION` | 危险操作；准确目标、可恢复性和后续重建 |

#### Vault Intelligence / Lint

| 事项 | 治理 | 权威模块 | 说明 |
| --- | --- | --- | --- |
| 运行 Vault quality scan | `ACTION` | Vault Intelligence | 生成 finding，不直接修改文件 |
| findings、severity、evidence | `STATUS` | Vault Intelligence | 系统事实，不是设置 |
| dismiss / restore a finding | `LOCAL` | Vault Intelligence | 用户审阅状态，不改变算法事实 |
| 应用某项 fix | `ACTION` | Finding owner | 受 Safety permission 与精确预览约束 |
| scan scope | `LOCAL` / `POWER` | Vault Intelligence | 当前目录、文件或全 Vault 在运行现场选择 |
| dimension weights、thresholds、scan bounds | `SYSTEM` | `vault-lint-config` | 产品质量与性能机制，不向普通用户开放 |
| 自动扫描 schedule | `BLOCKED` | Vault Intelligence | 只有真实后台 consumer、资源边界和通知策略完成后才开放 |

### 6.6 Chat Studio、Composer、Prompts 与动作配置

#### 长期偏好

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| Chat 默认任务模型 | `AUTO` | Task Models | 自动建立 | 不在 Chat 中复制一份全局值 |
| 当前 conversation 固定模型 | `LOCAL` | Chat Studio | 首次 handoff 可自动 | 只影响该 conversation |
| attachment handling default | `POWER` | Chat Studio / Files | 不询问 | `direct` 与 `degrade_to_text`；必须说明数据与质量影响 |
| 当前 conversation attachment override | `LOCAL` | Chat Studio | 不询问 | 不污染长期默认 |
| Composer 默认文档视图 | `USER` | Composer | 首次 Composer 目标可说明 | 当前默认 Markdown；只影响未来普通打开 |
| Composer Intelligence 手动开关偏好 | `USER` | Composer | 不询问 | contextual open 不应改写用户长期选择 |
| code block syntax theme | `USER` | Appearance | 不询问 | 当前有 5 个 curated theme；不等于产品整体主题 |
| custom prompts folder | `POWER` | Prompts | 不询问 | 默认从 AI root 派生 |
| 用户自定义 Prompt 内容 | `LOCAL` / `POWER` | Prompt owner | 不询问 | 只有明确 production caller 的 Prompt 才可配置 |
| per-action model override | `POWER` | Action configuration | 不询问 | 必须绑定 capability step，而非共享 Prompt 文件 |
| per-action output controls | `POWER` | Action configuration | 不询问 | 仅在实际 caller 消费时开放 |

#### 系统拥有的内容

| 事项 | 治理 | 原因 |
| --- | --- | --- |
| Chat max steps、max tool calls、token budget | `SYSTEM` | Agent loop 安全和稳定性边界 |
| Composer action registry、action order、disabled reasons | `SYSTEM` | 产品能力目录和运行 guard，不是用户偏好 |
| Composer nearby context char limit | `SYSTEM` | 内部上下文策略；当前模板默认 800 |
| Prompt schema、变量、版本、production caller | `SYSTEM` | 保证执行合同，不允许普通用户破坏 |
| 当前选区、当前 block、active document | `STATUS` | 运行上下文，不是设置 |
| history / run receipt | `STATUS` | 运行事实；用户可以清理或导出，但不能编辑事实 |

原则：用户可以创建自己的 Prompt 或修改明确允许定制的 instruction，但系统 Prompt、运行 schema 和安全约束必须保持受治理。不能把一个“Prompt Library”做成所有内部 Prompt 的随意编辑器。

### 6.7 File Atlas、Graph、Inspector 与结构化智能

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| 当前中心文件 / 选中节点 | `STATUS` | File Atlas | 来自当前上下文 |
| 当前 scope、filter、layout、zoom | `LOCAL` | File Atlas | 属于本次探索，不进入中央 Settings |
| 是否记住上次视图 | `USER` | File Atlas | 只有用户明确需要跨会话恢复时开放 |
| 默认 prune depth | `LOCAL` / `POWER` | File Atlas | 当前声明默认 2；应先证明持久化链路 |
| skeleton backbone only | `LOCAL` / `POWER` | File Atlas | 当前声明默认关闭；更适合模块内控制 |
| leaf opacity / width scale | `LOCAL` / `POWER` | File Atlas | 表现偏好，不应成为高层 Settings 主项 |
| inspector link count / folder grouping | `LOCAL` / `POWER` | Inspector / File Atlas | 与当前探索信息密度直接相关 |
| Hub scheduler | `USER` | Knowledge intelligence | 长期后台行为，归 Settings |
| Hub、gap、community freshness | `STATUS` | Knowledge intelligence | 系统计算，不允许手工标记 ready |
| community weights、node bounds、pair limits | `SYSTEM` | Graph algorithm | 算法质量和性能边界 |
| interaction open / close delay、card offset | `SYSTEM` | Product config | 表现配置，不是用户业务设置 |
| graph analysis version | `SYSTEM` | Migration / algorithm | 版本合同 |
| rebuild graph / enrich / recompute gaps | `ACTION` | Maintenance | 运行后记录范围与 receipt |

Graph / File Atlas 的“可配置”应优先留在探索现场。中央 Settings 只保留真正跨会话、跨文档的稳定默认和后台行为。

### 6.8 Media Generation、文件理解与输出

#### 长期配置

| 事项 | 治理 | 权威模块 | Onboarding | 默认与说明 |
| --- | --- | --- | --- | --- |
| 默认 media route | `AUTO` | Media | 首次媒体目标自动解析 | `auto` 优先；native / fal 仅作为 override |
| OpenAI native profile | `AUTO` / `POWER` | Media | 可复用 verified OpenAI | 多个 OpenAI 连接时允许固定 |
| fal.ai key | `USER` | Media connection | fal route 阻塞时输入 | 作为凭据管理，不与 preset 混合 |
| generated media folder | `USER` | Media | 使用可靠默认 | 当前默认 `_attachments/media` |
| image / video / music / TTS 默认 preset | `USER` | Media | 只配置首次任务对应种类 | 每类独立，不能缩成三个笼统模型 |
| per-kind model override | `POWER` | Media | 不询问 | 必须校验 route 与 preset 能力 |
| aspect ratio / quantity / duration / voice default | `USER` / `POWER` | Media | 首次任务使用 preset | 高频语义值可设；硬边界由系统控制 |
| 当前生成 prompt、数量、附件、seed | `LOCAL` | Media task | 在任务现场设置 | 不自动保存为长期默认 |
| attachment handling | `POWER` | Chat / Files | 不询问 | 与媒体生成 route 分开 |
| music licensing acceptance | `CONSENT` | Media | 首次音乐任务必须确认 | 按 policy version 记录；版本升级重新确认 |
| 成本确认 | `CONSENT` | Media task | 预计成本达到阈值时 | 每次高影响任务确认，不等于长期预算 |

#### 状态与系统配置

| 事项 | 治理 | 原因 |
| --- | --- | --- |
| route availability / supported kinds | `STATUS` | 来自真实 probe |
| last validation time | `STATUS` | 验证结果的一部分，不是用户编辑字段 |
| adapter endpoint paths、poll interval、timeout | `SYSTEM` | 协议与运行机制 |
| preset registry、允许范围、MIME 与 reference limits | `SYSTEM` | 能力合同和安全边界 |
| effective model、route、cost、output path | `STATUS` | 写入生成 receipt |
| validate media configuration | `ACTION` | 执行真实 probe 后刷新状态 |

媒体模型和文本 LLM 不应塞进一个无分类的目录。它们共享 Connection 和 receipt 原则，但任务能力、参数和验证方式不同。

### 6.9 Workspace、Command Center 与 Ambient

#### Command Center

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| open on startup | `USER` | Command Center | 当前默认关闭 |
| replace empty tab | `USER` | Command Center | 当前默认关闭 |
| groups、items、order、home layout | `LOCAL` | Command Center customize | 用户拥有，但应在该模块直接编辑 |
| pinned targets / quick access | `LOCAL` | Command Center customize | 与当前工作组织紧密相关 |
| modal density | `SYSTEM` / `LOCAL` | Command Center | 当前类型固定 compact；无真实选择时不要假设可设 |
| catalog availability、hotkeys、recent targets | `STATUS` | Command Center runtime | 从 Obsidian 与当前 workspace 解析 |
| compatibility mirror fields | `SYSTEM` | Migration | 不向用户暴露 |

#### Ambient / Related Notes

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| Ambient master enabled | `USER` | Ambient | 当前默认开启 |
| Related Notes / primary carrier | `USER` | Ambient | 应使用低打扰默认 |
| status bar carrier | `USER` | Ambient | 当前默认关闭 |
| serendipity gutter | `USER` | Ambient | 当前默认关闭 |
| morning briefing | `USER` | Ambient | 当前默认关闭 |
| feedback learning | `USER` | Ambient | 当前默认开启；需解释使用哪些本地反馈 |
| LLM explanation | `POWER` | Ambient | 当前默认关闭；可能产生额外调用和成本 |
| max push items | `POWER` | Ambient | 当前默认 5 |
| trigger / doc-switch / writing-pause cooldown | `POWER` | Ambient | 当前默认 30s / 5s / 5s |
| min character delta | `POWER` | Ambient | 当前默认 30 |
| graph expansion hops | `POWER` | Ambient | 当前默认 2 |
| LLM explanation cooldown | `POWER` | Ambient | 当前默认 120s |
| 当前 context、signal、score、metadata | `STATUS` | Ambient runtime | 运行事实，不是设置 |

Ambient 的高打扰载体默认关闭是产品安全默认；用户可以逐项开启，不需要进入另一套“高级模式”。

### 6.10 Data、Storage、Usage、Budget 与 Privacy

#### 目录与存储

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| AI root folder | `POWER` | Data & Storage | 影响多个派生路径；修改需依赖检查 |
| data storage folder | `POWER` | Data & Storage | 机器数据 canonical 位置；不可静默搬迁或删除 |
| AI Analysis output folder | `USER` | AI Analysis | 用户可见产出位置 |
| media attachment folder | `USER` | Media | 用户可见产出位置 |
| Skills folder | `POWER` | Skills | 用户拥有的 skill packs |
| Inbox folder | `USER` | Workspace | 快速捕获与建议落点 |
| custom prompts folder | `POWER` | Prompts | 用户自定义 prompt 来源 |
| derived folder values | `STATUS` | Folder policy | 默认从 AI root 计算，不应伪装成独立选择 |
| custom override folder | `POWER` | 对应 owner | 只有确有需要时覆盖派生值 |
| SQLite backend | `SYSTEM` / `POWER` | Developer | 默认 auto；只有诊断需要时允许固定 |

任何目录变更必须说明：

- 是立即生效还是只影响未来写入；
- 是否需要迁移已有数据；
- 是否会改变索引排除规则；
- 是否可能产生循环索引或重复材料；
- 失败时旧数据是否仍可用；
- 如何恢复默认派生路径。

#### Usage、receipts 与隐私

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| usage tracking enabled | `USER` | Usage & Privacy | 当前默认开启；必须先明确是本地记录还是外发 telemetry |
| detail retention days | `USER` | Usage & Privacy | 当前默认 30 天 |
| prompt / response preview rendering | `USER` | Usage & Privacy | 当前默认开启；关闭后 UI 隐藏，但底层保留语义需重新审视 |
| required safety receipts | `SYSTEM` | Runtime audit | 即使关闭可选 tracking，安全和恢复所需最小 receipt 仍保留 |
| monthly AI spending target | `USER` | Budget | 当前 harness 默认 40 USD；0 表示不显示 pace |
| budget reset day | `USER` | Budget | 当前默认每月 1 日 |
| budget threshold alert | `USER` | Budget | 当前默认 40% |
| context compact alert | `USER` | Budget / Chat | 当前默认 70% context ratio |
| costly Agent receipt threshold | `POWER` | Budget | 当前默认 0.15 USD 或 50k tokens |
| low-cost pip silence threshold | `POWER` | Budget | 当前默认关闭 |
| per-run actual tokens / cost / duration | `STATUS` | Usage receipt | 事实，不可编辑 |
| export / clear usage history | `ACTION` | Usage & Privacy | 明确范围和可恢复性 |

媒体 generation config 中的成本策略与 Agent harness 的 40 USD 月度目标不是同一层配置。上线前必须明确：一个是单次媒体 route / cost guard，另一个是全局或 Agent usage budget；不能以两个“Budget”名字并列而不解释范围。

### 6.11 Appearance、Accessibility 与 Keyboard

| 事项 | 治理 | 权威模块 | 默认与说明 |
| --- | --- | --- | --- |
| code block syntax theme | `USER` | Appearance | 当前 curated 5 项 |
| app light / dark / theme integration | `AUTO` | Appearance | 优先跟随 Obsidian；如 Peak 有自主 Theme Boundary，应有可靠 fallback |
| reduced motion | `AUTO` / `USER` | Accessibility | 默认跟随系统；允许明确覆盖 |
| text scale / density | `AUTO` / `USER` | Accessibility | 优先继承 Obsidian；只有真实全局 consumer 才开放 |
| keyboard shortcut assignment | `LOCAL` | Obsidian hotkeys / owning surface | 不复制 Obsidian 自有 hotkey 设置 |
| Key Tips enablement | `USER` | Keyboard | 仅在共享 runtime 已接通时开放 |
| focus、roving navigation、Escape behavior | `SYSTEM` | Interaction contract | 可访问性行为，不是用户设置 |
| icons、colors、spacing、component radius | `SYSTEM` | Design system | 设计 token，不属于产品 Settings |
| graph appearance defaults | `LOCAL` / `POWER` | File Atlas | 归 owning surface，不塞入全局 Appearance |

### 6.12 Maintenance、Diagnostics 与 Developer

#### Maintenance

| 事项 | 治理 | 说明 |
| --- | --- | --- |
| verify database health | `ACTION` | 只读检查优先，输出具体结论 |
| cleanup useless data | `ACTION` | 必须预览准确目标和可恢复性 |
| build / clear user profile | `ACTION` | 构建与删除分开；删除是危险操作 |
| update / rebuild index | `ACTION` | 使用 Knowledge Index contract |
| vector / LLM / graph maintenance | `ACTION` | 显示依赖、成本、进度和 receipt |
| reset individual setting | `ACTION` | 移除 override，恢复 Auto 或编译默认 |
| reset a module | `ACTION` | 先预览范围，不影响其他模块 |
| export diagnostics | `ACTION` | 默认 redacted，明确包含哪些数据 |

#### Diagnostics / Developer settings

| 事项 | 治理 | 默认与说明 |
| --- | --- | --- |
| debug trace mode | `POWER` | 默认 off；redacted 推荐；raw 高风险 |
| trace retention | `POWER` | 当前 20 / 100 / session |
| trace copy format | `POWER` | Markdown / JSON / both |
| include raw content | `POWER` / `CONSENT` | 仅 raw mode；必须警告敏感内容 |
| clear traces | `ACTION` | 明确目标和不可恢复性 |
| DevTools graph inspector | `POWER` | 当前默认关闭 |
| exact output controls | `POWER` | 仅真实 consumer |
| exact runtime timeout | `POWER` | 仅真实 consumer |
| raw endpoint / headers | `POWER` | 只对 custom / compatible endpoint |
| runtime hooks | `POWER` | 默认关闭，说明执行权限 |
| simulator scenario / speed / strict | `SYSTEM` / Developer | QA 能力，不在普通产品设置中 |
| internal IDs、hashes、schema、migration state | `STATUS` / `SYSTEM` | 可用于诊断，不可编辑 |

### 6.13 系统模板配置不是用户 Settings

项目中的 `templates/config/*` 解决的是产品配置和非工程修改问题，不代表终端用户需要看到这些字段。其治理如下：

| 模板配置族 | 产品用途 | 用户控制结论 |
| --- | --- | --- |
| `onboarding.json` / `settings.json` | 文案、步骤标签、surface 内容 | `SYSTEM`；设计与本地化 source |
| `chat.json` / `chat-studio.json` | Chat 文案、密度、shell 和模块表现 | `SYSTEM`；稳定用户意图另存 persisted setting |
| `chat-runtime.json` | loop steps、token、tool-call、timeout | `SYSTEM` |
| `model-routing.json` | Auto 路由 tier、偏好、context guard | `SYSTEM`；用户只控制 task override |
| `models/*` / `curator-catalog.json` | 模型与环境推荐目录 | `STATUS` / `SYSTEM`；动态来源优先 |
| `media-generation.json` | route、preset、adapter、poll、limits | 静态表 `SYSTEM`；只允许窄 user overlay |
| `composer.json` | action registry、上下文、transaction、文案 | `SYSTEM`；明确开放的 action override 另存 |
| `file-atlas.json` | kind、preset、filter、identity、strings | `SYSTEM`；当前视图偏好在 File Atlas |
| `result-graph-community.json` / `community-colors.json` | 图算法、bounds、interaction、palette | `SYSTEM` |
| `keyboard-navigation.json` | zone、key tips、activation、a11y labels | `SYSTEM`；用户 enablement 需独立 persisted consumer |
| `command-center-defaults.json` | 首次 board seed | `SYSTEM` seed；初始化后 board 归用户 |
| `plugin-command-gateway.json` | discovery、classification、audit limits | `SYSTEM`；用户只审查 allow / deny |
| `vault-lint-config.json` | weights、thresholds、scan bounds | `SYSTEM`；用户可触发 scan 和审阅 finding |
| `rich-output-types.json` | renderer 类型和字段合同 | `SYSTEM` |
| `artifact-create.json` | artifact 文件名、扩展名、错误与默认材料 | `SYSTEM`；每次创建目标在 owning action |
| `dashboard.json` | usage dashboard 内容与 carriers | `SYSTEM`；预算和隐私意图另存 |
| `time-within-normalize.json` | 时间语义归一化 | `SYSTEM` |
| `ai-search-simulator.json` | QA scenario、speed、endpoint | Developer only |

判断标准不是“非工程人员会不会改这个 JSON”，而是“终端用户是否需要为自己的长期工作意图承担这个决定”。

## 7. 当前源码字段去留表

本节逐项处理当前主要持久化字段，避免“重新设计”演变成无依据地删除旧配置。结论是产品治理目标，不表示迁移已经完成。

### 7.1 `AIServiceSettings`

| 当前字段 | 目标结论 | 目标 owner | 备注 |
| --- | --- | --- | --- |
| `rootFolder` | 保留为 `POWER` | Data & Storage | 路径影响大，需要迁移合同 |
| `defaultModel` | 迁移后退役 | Task Models | 含义模糊，与 assignment 重叠 |
| `llmProviderConfigs` | 仅兼容迁移 | Connections | 新结构使用 connection profiles |
| `profileEnabled` | 退役 / `SYSTEM` | Migration | 不应作为普通开关 |
| `defaultOutputControl` | 条件保留为 `POWER` | Task Models | 每个字段需验证真实 consumer |
| `attachmentHandlingDefault` | 保留为 `POWER` | Chat / Files | 当前 loader 未恢复该字段，需补齐后开放 |
| `falApiKey` | 保留为 `USER` | Media connection | 作为凭据，而非普通 preset 字段 |
| `mediaAttachmentFolder` | 保留为 `USER` | Media | 用户可见输出位置 |
| `mediaDefaults.defaultRoute` | 保留为 `AUTO` | Media | 默认 Auto，允许固定 route |
| `mediaDefaults.nativeProfileId` | 保留为 `AUTO` / `POWER` | Media | 多 OpenAI connection 时有意义 |
| `mediaDefaults.defaultPresetIds` | 保留为 `USER` | Media | 每种媒体独立 |
| `mediaDefaults.presetOverrides` | 保留为 `POWER` | Media | 仅窄 overlay，不复制整张 preset 表 |
| `mediaDefaults.lastValidatedAt` | 改为 `STATUS` | Media readiness | 不应作为可编辑配置 |
| `mediaDefaults.musicLicensingAccepted` | 保留为 `CONSENT` | Media | 当前 normalize 未恢复，需要修复 |

### 7.2 `SearchSettings`

| 当前字段 | 目标结论 | 目标 owner | 备注 |
| --- | --- | --- | --- |
| `autoIndex` | 保留为 `USER` | Knowledge Index | 上线默认需 owner 决策 |
| `includeDocumentTypes` | 保留为 `USER` | Knowledge Index | 只展示真实支持类型；XLSX 当前 blocked |
| `ignorePatterns` | 保留为 `USER` | Knowledge Index | 校验系统目录和循环污染 |
| `chunking.maxChunkSize` | 保留为 `POWER` | Knowledge Index | 变更需 re-index |
| `chunking.chunkOverlap` | 保留为 `POWER` | Knowledge Index | 变更需 re-index |
| `chunking.minDocumentSizeForChunking` | 保留为 `POWER` | Knowledge Index | 当前 UI 使用了错误 key |
| `chunking.embeddingModel` | 迁移到 assignment | Task Models | Knowledge embeddings 唯一 owner |
| `chunking.skipCodeBlocksInChunking` | 保留为 `POWER` | Knowledge Index | 与代码 Vault 相关 |
| `chunking.codeBlockPlaceholder` | 保留为 `POWER` | Knowledge Index | 条件字段 |
| `chunking.maxCodeChunkChars` | 保留为 `POWER` | Knowledge Index | 条件字段 |
| `aiAnalysisModel.*` | 迁移到 assignment | Task Models | planner / writer 分开 |
| `indexRefreshInterval` | 保留为 `POWER` | Knowledge Index | 当前默认 5000ms |
| `shortSummaryLength` | 保留为 `POWER` | AI Analysis | 需要运行时消费测试 |
| `fullSummaryLength` | 保留为 `POWER` | AI Analysis | 需要运行时消费测试 |
| `aiAnalysisSessionSummaryWordCount` | 保留为 `POWER` | AI Analysis | 需要运行时消费测试 |
| `aiAnalysisAutoSaveEnabled` | 保留为 `USER` | AI Analysis | 当前默认开启 |
| `aiAnalysisAutoSaveFolder` | 保留为 `USER` | AI Analysis | 与 root folder 依赖 |
| `aiAnalysisExcludeAutoSaveFolderFromSearch` | 保留为 `USER` | AI Analysis | 当前默认开启 |
| `aiAnalysisHistoryLimit` | 保留为 `USER` | AI Analysis | 当前默认 5 |
| `inspectorLinks.*` | 移到 `LOCAL` / `POWER` | Inspector / File Atlas | 当前 loader 未恢复 |
| `indexLevel` | 保留为 `USER` | Knowledge Index | 变更触发 staged indexing |
| `searchUpgradePromptDismissedAt` | `SYSTEM` | Search UX state | 不作为用户设置展示 |
| `enablePPR` | 保留为 `POWER` | Search quality | 当前默认开启 |
| `hubCurationSchedulerEnabled` | 保留为 `USER` | Knowledge intelligence | 当前 loader 未恢复 |
| `hubCurationIntervalDays` | 保留为 `POWER` | Knowledge intelligence | 当前 loader 未恢复 |

### 7.3 Connections / Profiles

| 当前字段 | 目标结论 | 目标 owner | 备注 |
| --- | --- | --- | --- |
| `profiles[].id` / `createdAt` | `SYSTEM` | Persistence | 稳定引用和迁移 |
| `profiles[].name` | `USER` | Connections | 多实例可辨识 |
| `profiles[].kind` | 创建时选择；之后受限修改 | Connections | 类型变化通常应新建 connection |
| `profiles[].enabled` | `USER` | Connections | 停用前依赖检查 |
| `profiles[].baseUrl` | `POWER` | Connections | 已知 Provider 用默认值 |
| `profiles[].apiKey` | `USER` | Connections | secret |
| `profiles[].primaryModel` | 迁移后退役 | Task Models | 旧抽象 |
| `profiles[].fastModel` | 迁移后退役 | Task Models | 旧抽象 |
| `profiles[].customHeaders` | `POWER` | Connections | secret-aware |
| `embeddingEndpoint` / `embeddingApiKey` / `embeddingModel` | 迁移或高级 compatible endpoint | Task Models / Connections | 不与 embedding assignment 重复 |
| `icon` / `description` | `SYSTEM`；custom 可有限编辑 | Connections metadata | 已知 Provider 使用 registry metadata |
| `activeAgentConfig` | 迁入 Agent assignment | Task Models | 单一 owner |
| `activeAgentFastConfig` | 迁入 Fast helper assignment | Task Models | 单一 owner |
| `activeChatConfig` | 迁入 Chat assignment | Task Models | 单一 owner |
| `activeCopilotConfig` | 迁入 Copilot assignment | Task Models | 单一 owner |
| `activeEmbeddingConfig` | 迁入 Embedding assignment | Task Models | 单一 owner |
| `activeWebSearchConfig` | 迁入 Web assignment | Task Models | 单一 owner |
| `customEndpoints` | 保留为 `POWER` | Connections | 动态发现模型；能力 override 风险提示 |
| `simulatorConfig` | Developer only | Simulator | 不进入普通连接目录 |

### 7.4 Harness、Budget 与 Permissions

| 当前字段 | 目标结论 | 目标 owner |
| --- | --- | --- |
| `localFastConfig` | 迁入 Fast helper assignment | Task Models |
| `localDeepConfig` | 迁入 Research assignment | Task Models |
| `onlineConfig` | 迁入 Stronger fallback assignment | Task Models |
| `allowEscalation` | 保留为 `USER` | Safety & Agent |
| `maxEscalationsPerLoop` | 保留为 `POWER` | Safety & Agent |
| `autoEscalateScoreBelow` | 保留为 `POWER` | Safety & Agent |
| `hooksEnabled` | 保留为 `POWER` | Safety & Agent |
| `defaultPermissionMode` | 保留为 `USER` | Safety & Agent |
| `budget.monthlyUsd` | 保留为 `USER` | Budget |
| `budget.resetDayOfMonth` | 保留为 `USER` | Budget |
| `budget.alertRules` | 保留为 `USER` / `POWER` | Budget |

### 7.5 Ambient、Composer、Command Center 与 Graph

| 当前字段族 | 目标结论 | 目标 owner | 当前注意事项 |
| --- | --- | --- | --- |
| `ambientPush.enabled` | `USER` | Ambient | master enable |
| Ambient carrier flags | `USER` | Ambient | 高打扰项默认关闭 |
| Ambient timing / counts / hops | `POWER` | Ambient | 保留真实 consumer |
| Ambient runtime context / score | `STATUS` | Ambient | 不持久化为偏好 |
| `composer.defaultDocumentView` | `USER` | Composer | 当前默认 Markdown |
| `composer.intelligenceManualOpen` | `USER` | Composer | contextual open 不改写 |
| `commandCenter.home.openOnStartup` | `USER` | Command Center | 当前默认关闭 |
| `commandCenter.home.replaceEmptyTab` | `USER` | Command Center | 当前默认关闭 |
| Command Center groups / layout / pins | `LOCAL` | Command Center customize | 用户拥有的模块配置 |
| Command Center compatibility mirrors | `SYSTEM` | Migration | 不开放 |
| `graphViz.*` | `LOCAL` / `POWER` | File Atlas | 当前 loader 未恢复，先标 blocked |

### 7.6 MCP、Command Gateway、Usage 与 Developer

| 当前字段族 | 目标结论 | 目标 owner | 当前注意事项 |
| --- | --- | --- | --- |
| `mcpServers[].name/enabled/transport` | `POWER` / `USER` | Tools | 当前 loader 未恢复整个列表 |
| MCP command/args/env/url/headers | `POWER` | Tools | secret-aware |
| MCP status/toolCount/error | `STATUS` | Tools runtime | 不写入配置 |
| Command Gateway `reviews.decision` | `USER` | Command Gateway | 用户长期意图 |
| review risk/purpose/hash/time | `STATUS` | Command Gateway | 系统事实 |
| Command Gateway `findings` | `STATUS` | Command Gateway | 自动生成、漂移后失效 |
| Gateway config thresholds / patterns | `SYSTEM` | Template config | 不开放 |
| `usageTrackingEnabled` | `USER` | Usage & Privacy | 当前 loader 正常恢复 |
| `usageDetailRetentionDays` | `USER` | Usage & Privacy | 当前 loader 正常恢复 |
| `usagePreviewEnabled` | `USER` | Usage & Privacy | 需明确底层保留语义 |
| `sqliteBackend` | `POWER` / Developer | Storage | 默认 auto |
| `enableDevTools` | `POWER` | Developer | 默认 false |
| `debugTrace.*` | `POWER` | Diagnostics | 当前 loader 有 sanitize |
| `codeBlockTheme` | `USER` | Appearance | 当前 loader 有 whitelist normalize |
| folder paths | `USER` / `POWER` | 各 owner | 当前 loader 有 legacy migration |

## 8. Onboarding 与 Settings 的共享数据合同

### 8.1 单一配置记录

每一项长期配置至少需要：

```text
settingId
moduleOwner
value or overrideAbsent
source: compiled | auto | user | migration
scope: global | vault | connection | taskGroup | assignment | surface
updatedAt
schemaVersion
effectiveState
effectiveAt
requires: none | reconnect | restart | reindex | reprocess | migration
```

Onboarding、Settings 和 owning surface 不应维护不同的数据结构。它们只是以不同上下文读取和写入同一条记录。

### 8.2 Readiness 投影

每项能力状态至少需要：

```text
capabilityId
status: checking | ready | degraded | action-required | unavailable | error | disabled
evidenceAt
evidenceSource
configuredState
effectiveDependencies
impact
recommendedAction
lastReceiptId
```

`configured` 不等于 `ready`；`optional` 是优先级，不是状态；`Scanning` 只有在真实任务正在运行且有进度时才成立。

### 8.3 保存与生效

```text
用户修改
  → 校验值和依赖
  → 写入唯一配置记录
  → 触发真实 consumer 更新
  → 如需 reconnect / restart / reindex / migration，创建独立 operation
  → 重新读取 effective state
  → 返回已生效、等待处理或失败
```

保存成功但 consumer 未更新时，必须显示“已保存但尚未生效”，不能显示完成。

### 8.4 Inheritance 与 override

- 任务组拥有 Auto 默认；
- assignment 默认继承任务组；
- 用户明确固定后成为 pinned override；
- 恢复 Auto 删除 pinned override；
- Onboarding 只能填补未配置项，不能覆盖 pinned override；
- Provider 或模型失效时，只自动迁移未固定项；
- pinned 项失效后进入 action-required，不允许静默换模型；
- 当前会话 / action 的临时选择只进入 run receipt，除非用户明确设为长期默认。

## 9. Onboarding 的写入边界与完整流程

```text
1. 检测环境、已有配置与 readiness
2. 确定第一次真实任务
3. 计算该任务的最小依赖差集
4. 只补齐缺失 connection、最低 permission 或必要 consent
5. 为未固定 assignment 应用 Auto 默认
6. 验证 connection、index、runtime、media 或 tool 依赖
7. 打开真实 owning surface，并带入安全的预填任务
8. 观察真实结果：first success 或可恢复失败
```

### 9.1 Onboarding 可以问的问题

- 第一次想完成什么；
- 完成该任务所需的连接凭据；
- 无法自动决定时，选择一个可用连接；
- 首次 Agent 任务需要的最低写权限；
- 首次媒体任务需要的成本或许可确认；
- 首次索引需要的明确内容范围或性能 consent；
- 无目标时是否接受最低摩擦推荐任务。

### 9.2 Onboarding 不应问的问题

- 全部 Provider 和全部模型；
- quick / deep / premium 等内部层级；
- temperature、top-p、top-k、penalties；
- chunk size、overlap、PPR、图算法权重；
- 月度预算与所有告警阈值；
- MCP 全量目录、Skills 编辑、Command Gateway 批量审批；
- debug trace、SQLite backend、runtime hooks；
- 每一个模块的显示偏好。

### 9.3 为什么不能用固定页数定义 Onboarding

已有 verified connection 和可用 index 的用户不需要重复配置；只使用 Ollama 的用户不需要看到云端 key；首次生成图片的用户需要 media route，却不需要 semantic index。流程长度由“目标依赖差集”决定，而不是由产品功能数量决定。

## 10. 当前源码事实与上线前缺口

以下是 2026-08-10 对当前源码的静态审计结论。它们用于约束后续实现，不代表已经修复。

### 10.1 已有基础

- 当前 model catalog 合计 113 个 entries：Simulator 1、OpenAI 18、Claude 9、Gemini 9、Perplexity 5、Ollama 16、OpenRouter fallback 55；
- OpenAI、Anthropic、Google、Perplexity、Ollama、OpenRouter、LiteLLM、custom 和 Simulator 已有 Profile 类型；
- Chat、Copilot、Embedding、Web Search、Agent 等已有多套 role / tier 字段；
- Knowledge Index、Media、Ambient、Usage、MCP、Command Gateway、Composer、Command Center 等已有真实配置或 runtime 结构；
- 模板配置已经承载 chat runtime、model routing、media、composer、file-atlas、command gateway、vault lint 等内部产品参数；
- 当前设置保存入口会调用 `saveData(this.settings)`，但启动时会经过显式 `normalizePluginSettings()`。

### 10.2 不能当作正式设置的当前缺口

| 缺口 | 证据 | 产品后果 |
| --- | --- | --- |
| `attachmentHandlingDefault` 未在 AI normalize 中恢复 | 类型和 UI 有字段，loader 未复制 | 重启后可能回到默认，暂不能宣称可靠设置 |
| `musicLicensingAccepted` 未在 media override normalize 中恢复 | 类型存在，normalize 未处理 | consent 可能丢失或重复询问 |
| `inspectorLinks` 未在 Search normalize 中恢复 | Settings 可写，loader 未复制 | 当前 Inspector 数值不是可靠持久偏好 |
| Hub scheduler enabled / interval 未恢复 | 类型和 runtime 存在，loader 未复制 | 重启后后台行为可能变化 |
| `mcpServers` 未在 top-level normalize 中恢复 | UI 可写，loader 未复制 | 外部工具配置可能重启丢失 |
| `graphViz` 未在 top-level normalize 中恢复 | defaults/type 存在，loader 未复制 | Graph 偏好不能视为稳定设置 |
| chunk minimum size UI key 不一致 | 类型是 `minDocumentSizeForChunking`，UI 使用 `minDocSizeToChunk` | 当前控件可能写入 consumer 不读取的字段 |
| XLSX 表面属于可选类型但 loader 明确不解析 | `TableDocumentLoader` 对 xlsx 返回 null | 不得将 XLSX 画成可用开关 |
| Index status 只有 builtAt、indexedDocs、isReady | `getIndexStatus()` 返回三字段 | 无法可靠表达 eligible、changed、missing、coverage、semantic freshness |
| Codex / Claude Code 不在当前 ProfileKind | Profile 类型未包含 runtime adapter | 不得画成 verified 普通 Provider |
| 连接、role、harness tier、search models 多处重复 | 多套字段并存 | 用户无法知道哪个是唯一有效模型默认 |
| 许多模板参数可热更新 | `templates/config/*` | 它们是产品配置，不等于用户设置 |

### 10.3 当前必须做的配置治理收口

1. 建立配置注册表：每项配置有 owner、类型、默认来源、consumer、影响和恢复方式；
2. 将 role、tier、legacy default model 收敛成 Task Models 的 task group / assignment；
3. 补齐 normalize / migration / persistence tests，删除“能保存但重启丢失”的假设置；
4. 建立 shared readiness projection，补齐 Index、Connection、Media、Agent、Tools 的真实状态；
5. 将状态、设置、consent 和 operation 分开建模；
6. 只有验证过 end-to-end consumer 的字段才进入正式 UI；
7. 为每项 re-index、reconnect、restart、migration 建立 operation 和 receipt；
8. 对 provider / model 动态目录记录来源、新鲜度和 fallback；
9. 完成 Codex / Claude Code 专属 runtime adapter 后再开放；
10. 先迁移旧字段再退役，不能直接删除用户已有配置。

## 11. 需要产品负责人确认的决策

下列问题不应由 UI 设计师自行决定：

### D1. 首次任务默认入口

建议：没有明确目标时，根据当前环境选择最低摩擦任务；有可用 index 时优先 Vault question / Search，有活动文档时优先 Composer，没有文档时优先 Chat，不默认进入空白页。

### D2. `autoIndex` 上线默认

当前编译默认是关闭。建议区分：首次全量索引需要明确触发；首次成功建立索引后，增量更新可以默认开启，并允许关闭。需要确认性能、隐私和大型 Vault 边界。

### D3. Usage tracking 的准确语义

当前默认开启，但源码字段名不能证明数据是否只在本地。上线前必须明确区分：本地运行 receipt、可选 usage history、外发 telemetry。三者不能共用一个含糊开关。

### D4. Budget 范围

需要确认 40 USD 是全产品月度目标、仅 Agent harness 目标，还是用户可选 usage pace；Media 单次成本 guard 是否独立。建议形成一个总预算域，按 Chat / Agent / Media 分类汇总，而不是多个无范围的 Budget。

### D5. Attachment 默认策略

当前默认 `direct`。建议改成 capability-aware Auto：模型和政策允许时 direct，不允许时降级为解析文本，并在 receipt 中说明。保留高级固定 override。

### D6. Provider 首发范围

建议 P0 明确为 OpenAI、Anthropic、OpenRouter、Ollama、Codex、Claude Code；Google、Perplexity 和 compatible endpoints 保留在扩展 / 高级范围。Codex、Claude Code 必须作为 Agent runtime，不伪装成普通聊天 Provider。

### D7. Task assignment 的可见粒度

建议普通用户只管理 6 个任务组，单项 18 assignments 在对应组内按需展开；系统默认继承。这里规定的是内容层级，不是具体 UI。

### D8. 用户自定义 Prompt 边界

需要确认哪些 production capability 允许改 instruction、哪些只允许复制为用户版本、哪些系统 Prompt 永远只读。不能将所有内部 Prompt 一次性开放。

## 12. 给 UI 设计师的内容约束

设计师可以自由决定视觉和布局，但必须保留：

1. 每个模块的状态结论；
2. 状态证据与最后验证时间；
3. 用户可以改变的长期意图；
4. 自动值、用户 override 与本次 effective value 的区别；
5. 当前修改的保存和生效状态；
6. 需要 reconnect / restart / re-index / migration 的影响；
7. 原地修复和恢复自动 / 默认；
8. 高级项的逐模块分层；
9. consent、operation、danger 与普通设置的语义隔离；
10. owning surface 与 Settings 的唯一 owner 关系。

设计师不得：

- 设计全局 Standard / Advanced 双模式；
- 为了简洁删除本文保留的真实配置；
- 把 `STATUS` 画成用户可编辑值；
- 把 `SYSTEM` 机制包装成普通偏好；
- 把 `BLOCKED` 能力画成已可用；
- 在多个模块复制同一模型、目录或权限设置；
- 用“保存成功”代替“已实际生效”；
- 让用户在 Onboarding 中浏览 113 个模型；
- 让 OpenRouter fallback 目录看起来像实时目录；
- 把 Codex / Claude Code、Web、MCP 或 Media 当成同类文本模型；
- 把 Settings 变成所有内部参数的展示柜。

## 13. 实现与验收标准

### 13.1 配置注册表

每个正式设置必须登记：

- stable id；
- 模块 owner；
- 治理类型；
- scope；
- 编译默认与 Auto resolver；
- persistence key 和 schema version；
- production consumer；
- 校验规则；
- effective-state readback；
- reprocess / restart / reconnect / migration 影响；
- reset 行为；
- Onboarding 是否允许写入；
- receipt 与敏感数据规则。

### 13.2 自动化验证

- 每个 persisted field 有 normalize / migration / round-trip test；
- 每个用户可见设置有至少一个 consumer test；
- 改值后能读取 effective state；
- 恢复 Auto 会删除 override，而不是写死旧默认；
- pinned assignment 不被 Onboarding 或 Provider refresh 覆盖；
- Provider 删除前能列出所有依赖；
- Index level、chunking 和路径变更正确产生 operation；
- 密钥不会出现在 logs、receipts、debug exports；
- dangerous actions 有明确确认和结果 receipt；
- Settings 与 Onboarding 读取同一 readiness；
- 重启后所有正式设置保持一致；
- 当前已发现的 normalize 缺口全部有 regression tests。

### 13.3 产品验收

- 新用户只完成首次目标所需的最少决定；
- 已有连接、index 和 pinned defaults 被正确复用；
- 用户能从任一能力问题到达唯一配置 owner；
- 每项设置都能回答“影响什么、是否保存、是否生效、如何恢复”；
- 高级能力没有被删除，也不会压过常用任务；
- 状态、设置、操作、确认和危险行为不会混淆；
- 不存在重启后丢失但 UI 仍宣称成功的设置；
- 不存在没有 production consumer 的假开关；
- 完成 Onboarding 后进入真实工作入口并产生 first-success 结果；
- UI 设计可以改变，但本文规定的模块所有权与配置边界保持不变。

## 14. Source evidence

本文件的当前事实主要来自：

- `src/core/config/settingsTypes.ts`：主要持久化字段与编译默认；
- `src/app/settings/PluginSettingsLoader.ts`：启动恢复、normalize 与兼容迁移；
- `src/core/profiles/types.ts`：Connections、roles 与 compatible endpoints；
- `src/core/types/ambient.ts`：Ambient 设置与默认；
- `src/core/command-center/types.ts`：Command Center 用户配置与派生状态；
- `src/core/types/mcp.ts`：MCP 配置与连接状态；
- `src/core/types/plugin-command-gateway.ts`：用户 review、系统 finding、risk 与 receipt；
- `src/core/ports/SettingsActionsPort.ts`：Settings 中的 setup / maintenance / index operations；
- `src/service/chat/chatRuntimeConfig.ts`：Chat loop 内部 budget / timeout；
- `src/service/chat/modelRouter.ts`：Auto model 的能力筛选和内部路由配置；
- `src/service/search/index/indexService.ts` 与 `src/core/types/index-status.ts`：当前 Index status 边界；
- `src/core/document/loader/TableDocumentLoader.ts`：当前 XLSX 不支持事实；
- `templates/config/*`：产品模板配置、模型目录、媒体 preset 与内部机制；
- `docs/conventions/configurability.md`：模板配置、domain fallback 与常量的代码所有权规则。

其中 `templates/config/*` 是“产品配置可由非工程人员调整”的 source，不自动等于“终端用户应该在 Settings 中修改”。两种 configurability 必须始终分开。
