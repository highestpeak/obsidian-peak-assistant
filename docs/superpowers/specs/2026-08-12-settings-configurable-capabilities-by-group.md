# Peak Assistant Settings 可配置能力总表（按功能组）

> - 状态：产品配置清单与实现审计 · 目标能力已定义 · 生产接线部分完成
> - 日期：2026-08-12
> - 面向读者：产品负责人、产品设计师、交互设计师、实现与验收人员
> - Settings 一级功能组：`AI & Models → Agents → Knowledge & Search → Advanced`
> - 配套产品契约：[Onboarding 与 Settings 能力、内容和流程 Brief](./2026-08-09-onboarding-settings-capability-content-flow-brief.md)
> - 字段与治理附录：[设置清单与 Onboarding / Settings 分工](./2026-08-10-peak-assistant-configuration-governance-and-settings-inventory.md)
> - 当前交互参考：[Settings 与 Onboarding 设计包](../../gstack/settings-onboarding-unified-2026-08-12/index.html)

## 0. 这份文档解决什么问题

这份文档按用户当前看到的四个 Settings 功能组，逐项回答：

1. Peak 有哪些行为允许用户长期调整；
2. 哪些行为应该由系统自动决定；
3. 哪些只是状态、一次操作或一次确认，不应伪装成设置；
4. 每项能力的默认值由谁决定，修改后影响什么；
5. 当前代码是否真的会读取、保存并执行这项设置。

它不规定页面布局、控件样式、颜色和图标。UI 设计可以重新组织具体呈现，但不能改变本文定义的能力归属、唯一修改位置、依赖关系和真实状态。

### 0.1 建议怎么审阅

- **先做产品判断**：看第 0–2 节，确认哪些内容才算设置，以及四个功能组的边界；
- **逐组确认能力**：看第 3–6 节，重点检查是否缺少真实使用能力，或把状态 / 操作误当成设置；
- **从产品功能反查**：看第 7 节，确认 Chat Studio、Composer、Search、Atlas、Ambient、Agents 和媒体生成都能找到归属；
- **安排实现**：看第 8–9 节，先处理假设置、错误语义、持久化缺口和未接线消费者；
- **检查 Onboarding 边界**：看第 10–11 节，确保首次流程没有复制整套 Settings。

### 0.2 最重要的结论

- **Settings 不是旧字段陈列柜。** 只有用户能够理解、产品确实读取、修改后能够验证、重启后不会丢失的内容，才算正式设置。
- **不为了页面简洁删除真实能力。** 低频但必要的选项进入局部展开或 `Advanced`，而不是直接消失。
- **一个意图只能有一个修改位置。** 其他功能可以显示当前值并跳转，但不能保存第二份冲突配置。
- **AI 配置是一条连续关系。** 用户先连接服务，再确认可用模型，最后按自己认识的产品功能设置任务默认；连接、模型和任务默认不能混为一项。
- **Agent 配置不等于模型配置。** Agents 管理执行方式、工具、权限和确认；使用哪个模型仍由 AI & Models 管理。
- **Knowledge 长期策略与 Index 当前任务分开。** Settings 决定索引范围和质量；Knowledge Index 工作区显示扫描进度、速度、预计时间、顺序、错误和历史。
- **系统默认、自动选择和用户选择必须能区分。** 恢复自动应删除用户覆盖，让产品重新计算，而不是把某个旧默认值永久写死。
- **保存成功不等于生效成功。** 对连接、模型、索引、权限和路径等设置，产品还需要显示验证、重连、重建、重启或重新处理结果。

### 0.3 本文明确不做

- 不重复 Onboarding 的首次成功流程；
- 不把每个内部模板、阈值、算法权重和兼容字段都开放给用户；
- 不为每个产品动作复制一套 Provider 凭证；
- 不把运行中的进度、错误数量、成本和覆盖率写成可编辑字段；
- 不把“清理缓存”“重建索引”“导出诊断”写成开关；
- 不把目标设计中的 `REQUIRED` 能力描述成当前已经可用；
- 不把 Codex、Claude Code 只定义成 Agent runtime，它们的普通对话与 Agent 能力需要分别检测。

## 1. 如何阅读这份总表

### 1.1 用户控制类型

| 类型 | 含义 | 例子 |
| --- | --- | --- |
| 自动，可覆盖 | 系统先给出可靠选择；用户有明确需要时可以固定 | Chat Studio 默认模型、Embedding 模型 |
| 普通设置 | 经常需要理解和调整，直接影响产品行为 | 自动索引、默认安全模式 |
| 高级设置 | 必要但低频，展开后才能修改 | Chunk 大小、请求超时、调试保留数量 |
| 功能内设置 | 只影响某个具体工作区，应在使用现场修改 | 单次对话模型、Composer 当前文档视图 |
| 一次性确认 | 只在高影响动作发生时确认，不形成普通偏好 | 音乐生成条款、删除本地索引 |
| 操作 | 立即启动一个可观察、可取消的任务 | 重建索引、测试连接、导出诊断 |
| 只读状态 | 帮助用户判断系统是否正常 | 连接健康、模型目录更新时间、索引覆盖率 |
| 系统内部 | 系统需要，但普通用户不应该管理 | 图算法权重、路由评分、模板内部阈值 |
| 尚未开放 | 产品方向成立，但实现或验证尚未完成 | Codex / Claude Code 双能力接入 |

### 1.2 当前事实标记

| 标记 | 含义 |
| --- | --- |
| `CURRENT` | 当前有主要读取、保存和运行时消费者 |
| `PARTIAL` | 有字段或局部消费者，但保存、生效、状态或覆盖范围不完整 |
| `REQUIRED` | 上线目标需要，但当前没有完整实现 |
| `CONDITIONAL` | 只有相应 Provider、文件类型、工具或运行环境存在时才出现 |
| `INTERNAL` | 保留为系统配置或模板配置，不进入普通 Settings |

本文的 `CURRENT` 只代表源码链路已存在，不代表真实 Obsidian 交互已经验收。目标 mock 和本文都不能代替生产验证。

### 1.3 四个功能组各自回答什么

| 功能组 | 用户来这里要解决的问题 | 不归这里管理的内容 |
| --- | --- | --- |
| AI & Models | Peak 可以连接谁、有哪些模型、每种工作默认用哪个模型 | Agent 写入权限、索引范围、数据保留 |
| Agents | Agent 怎么执行、可以调用什么、什么时候必须询问我 | Provider 凭证、普通搜索质量、外观 |
| Knowledge & Search | Vault 哪些内容进入知识系统，怎样搜索、分析和维护 | 当前索引任务进度、数据文件夹、模型凭证 |
| Advanced | 文件与数据位置、隐私保留、工作区行为、外观、诊断维护 | 常用模型绑定、Agent 日常权限、搜索主要策略 |

## 2. 跨功能组的共同规则

### 2.1 设置值的继承顺序

同一项行为可以有多层来源，但最终只能解析出一个有效值：

1. **产品安全默认**：没有环境和用户信息时仍然可以工作的 fallback；
2. **自动选择**：系统根据已连接服务、模型能力、成本、隐私要求和任务重新计算；
3. **用户全局覆盖**：用户在 Settings 中明确选择的长期偏好；
4. **功能覆盖**：某个产品功能或动作的专用默认；
5. **本次运行覆盖**：仅对当前对话、当前文档或本次任务有效；
6. **实际执行值**：运行时最终使用的连接、模型、参数、工具和权限，写入 receipt，不反向变成长期设置。

“恢复自动”应删除第 3 或第 4 层覆盖，让第 2 层重新解析。它不应复制当前自动结果作为新的永久值。

### 2.2 每项正式设置必须说明的反馈

| 变化类型 | 保存后必须说明 |
| --- | --- |
| 立即生效 | 已保存，下一次相关操作使用新值 |
| 新任务生效 | 当前运行不改变，新任务开始后生效 |
| 需要重连 | 凭证或地址已保存，连接验证通过后才可用 |
| 需要重新处理 | 范围、Embedding 或解析策略改变，需要增量更新或重建 |
| 需要重启 | 明确告诉用户为什么需要重启，并提供稍后处理 |
| 高影响操作 | 先预览影响范围，再确认；完成后提供结果和恢复入口 |

### 2.3 设置、状态与操作不能混写

以知识索引为例：

- `自动更新索引` 是设置；
- `4,119 / 4,860 个文档已完成` 是状态；
- `立即更新` 是操作；
- `更换 Embedding 模型` 是跨组设置，会触发重新处理；
- `查看 741 个待处理文档` 是进入 Knowledge Index 工作区的导航。

同样的分离规则适用于连接测试、Agent 运行、数据清理、诊断导出和媒体生成。

## 3. AI & Models

AI & Models 只管理一条主线：

> 连接 → 可用模型 → 自动选择策略 → 按产品功能设置任务默认 → 必要时调整生成参数

### 3.1 连接：Peak 可以调用谁

#### 首发主要连接

| 连接能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| OpenAI | 配置 API key、可选 Base URL、启用状态 | 支持对话、Embedding、图片及兼容能力；保存后必须测试真实请求 | `CURRENT` |
| Anthropic | 配置 API key、可选 Base URL、启用状态 | 支持对话、工具调用与长上下文 | `CURRENT` |
| OpenRouter | 配置 API key、可选 Base URL、启用状态 | 提供多服务商在线模型目录；必须显示目录新鲜度和缓存来源 | `PARTIAL`：连接已有，动态目录仍需收口 |
| Ollama | 配置本地地址、启用状态 | 自动探测本地模型；无 API key；离线时保留上次结果并显示不可达 | `CURRENT`，目录依赖运行时探测 |
| Codex | 连接本地或账号能力；分别检测普通对话和 Agent 执行 | 不能用“Agent 可用”推断“普通对话可用” | `REQUIRED` |
| Claude Code | 连接本地或账号能力；分别检测普通对话和 Agent 执行 | 与 Anthropic API 连接不是同一个连接意图 | `REQUIRED` |

#### 更多连接

| 连接能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Google | API key、Base URL、启用状态 | 提供 Gemini 等模型 | `CURRENT` |
| Perplexity | API key、Base URL、启用状态 | 普通对话和搜索型能力都可以被模型任务使用 | `CURRENT` |
| LiteLLM | Base URL、凭证、Headers、启用状态 | 作为用户自有网关，不预设其后端模型能力 | `CURRENT` |
| 自定义 OpenAI-compatible | 名称、Base URL、API key、Headers、启用状态 | 用户必须能够手动声明或校验模型能力 | `CURRENT` |
| 第二个同类连接 | 新实例名称和独立凭证 | 允许工作账号、个人账号或不同网关并存 | `CURRENT` |
| AI Search Simulator | 本地地址、场景、速度和严格模式 | 仅开发与确定性 QA 使用，不作为普通用户连接 | `CONDITIONAL` / 开发环境 |

#### 媒体服务连接

| 连接能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| OpenAI 媒体能力 | 复用 OpenAI 连接，选择允许的媒体 Profile | 图片及兼容视频能力按模型目录验证 | `CURRENT` / 能力依模型而定 |
| fal.ai | 单独 API key | 用于图片、视频、音频或音乐路由；不应混进普通语言模型列表 | `CURRENT` |
| Provider 原生媒体路由 | 在具体媒体类型中选择 | 只有连接和模型都满足能力时才可选 | `CONDITIONAL` |

#### 连接详情中允许设置

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 连接名称 | 普通设置 | 便于区分多个相同 Provider 实例 | `CURRENT` |
| 启用 / 停用 | 普通设置 | 停用后不参与自动选择，但保留配置 | `CURRENT` |
| API key / 认证 | 普通设置，敏感值 | 必须安全存储、遮盖显示，不进入诊断导出 | `CURRENT` |
| Base URL | 高级设置 | 影响兼容网关、自托管和本地连接 | `CURRENT` |
| 自定义 Headers | 高级设置 | 只对支持的远端或网关连接开放 | `CURRENT` |
| Embedding 端点或模型 | 高级设置 | 影响该连接暴露的向量能力 | `CURRENT` |
| Simulator 场景 | 开发环境设置 | 只对 Simulator 连接可见 | `CURRENT` / 开发环境 |

#### 连接详情中只显示状态或操作

- **只读状态**：已保存、正在检查、可用、部分能力可用、需要修复、离线、不可用；
- **只读证据**：最后检查时间、响应时间、鉴权结果、可用能力、模型目录更新时间；
- **操作**：测试连接、重新检测、刷新模型目录、查看错误、删除连接；
- **一次性确认**：删除仍被任务默认引用的连接时，先显示受影响的功能并要求改绑或恢复自动。

“API key 已填写”只能表示已配置，不能表示连接已经可用。

### 3.2 模型目录：这个连接中有哪些可用模型

| 设置或能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Provider 模型目录 | 主要为只读状态 | 来自内置目录、在线目录或本地探测；需要记录来源和更新时间 | `CURRENT` / Provider 覆盖不同 |
| 手动刷新目录 | 操作 | 不改变任务绑定；只更新可选模型与能力证据 | `PARTIAL` |
| 手动添加自定义模型 ID | 高级设置 | 只对兼容网关开放；必须声明上下文和能力 | `CURRENT` / 校验需加强 |
| 隐藏不想使用的模型 | 高级设置 | 从 picker 和自动路由候选中排除，不删除 Provider 目录 | `REQUIRED` |
| 模型别名 | 高级设置 | 仅改善用户识别，不改变真实 model ID | `REQUIRED` |
| 模型能力覆盖 | 高级设置 | 只在自动发现不可靠时使用；需提示错误声明会导致运行失败 | `PARTIAL` |
| 目录缓存 | 系统自动 | 在线失败时使用最近成功缓存，再降级到 bundled fallback | `REQUIRED` |

模型目录至少需要表达：文本输入、图像输入、音频输入、视频输入、工具调用、结构化输出、推理、Embedding、图片生成 / 编辑、视频生成和上下文长度。

OpenRouter 的目标不是把固定长列表硬编码进插件。插件应追踪一个有版本与 `Last-Modified` / `ETag` 的在线 JSON，保留本地缓存和随插件发布的最小 fallback；用户看到的必须是目录新鲜度，而不是假装静态列表永远正确。

### 3.3 自动选择策略：降低首次选择压力

策略是批量设置任务默认的起点，不应成为五张只有文案、不会真正改配置的装饰卡。

| 策略维度 | 用户控制 | 系统行为 | 当前事实 |
| --- | --- | --- | --- |
| 均衡 | 普通设置 | 在质量、速度和日常成本之间平衡 | `REQUIRED`：旧 Settings 卡片当前不实际改绑定 |
| 节省成本 | 普通设置 | 优先便宜或本地模型，能力不足时才升级 | `REQUIRED` |
| 最佳质量 | 普通设置 | 允许更强模型承担复杂推理与研究 | `REQUIRED` |
| 允许云端 | 普通设置 | 本地与云端都可参与自动选择 | `REQUIRED` |
| 优先本地 | 普通设置 | 日常任务先本地，必要时提示是否升级云端 | `REQUIRED` |
| 仅限本地 | 普通设置 | 自动排除云端候选；能力不足时明确失败，不静默上传 | `REQUIRED` |
| 已自定义 | 只读派生状态 | 当用户修改某些任务默认后显示，不是可点击的预设 | `REQUIRED` |

应用策略前应预览将改变哪些“自动”任务。已有明确用户覆盖默认保留；只有用户主动选择“同时替换我的自定义”时才覆盖。

### 3.4 任务默认：按用户认识的功能逐层选择

模型选择必须使用层级：

> 产品功能 → 动作组 → 具体动作 → 继承来源与当前有效模型

第一层不要要求用户先理解 `fast / deep / premium` 等内部路由。只有用户展开具体动作时，才显示 Provider、模型、能力要求和高级参数。

#### Chat Studio

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 日常对话 | 自动，可覆盖 | 普通问答、写作和聊天 | `CURRENT`：主要依赖 Chat role |
| 快速回答 | 自动，可覆盖 | 短回答与轻量操作，可偏向速度和成本 | `CURRENT`：依赖 Fast Agent / 路由 |
| 深度研究 | 自动，可覆盖 | 多步检索、综合、工具调用和长输出 | `CURRENT` / Agent 路径有差异 |
| 当前对话模型 | 功能内、本次会话覆盖 | 不修改全局 Chat 默认 | `CURRENT` |
| 默认附件处理 | 普通设置 | 决定文件按全文、摘要或能力路线进入上下文 | `PARTIAL`：当前字段未完整恢复 |

#### Composer 与 Copilot

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| Copilot 对话 | 自动，可覆盖 | 围绕当前文档讨论、问答和解释 | `CURRENT`：主要依赖 Copilot role |
| 改写与润色 | 自动，可覆盖 | 重写、扩写、压缩、翻译和语气调整 | `CURRENT` / 动作映射需统一 |
| 结构与提纲 | 自动，可覆盖 | 规划段落、提纲和文档结构 | `CURRENT` / 动作映射需统一 |
| 多文件变更 | 自动，可覆盖 | 需要强推理、工具与写入确认 | `PARTIAL` |
| 当前文档运行模型 | 功能内、本次覆盖 | 不修改 Composer 全局默认 | `CURRENT` / 入口依动作而定 |
| 纯 Markdown 格式操作 | 不使用生成模型 | 加粗、链接、列表等确定性编辑必须明确标注 | `CURRENT` |

Composer block 的具体 prompt、模板内容和某次指令属于功能内配置；Settings 只负责其默认模型与共用生成参数，不承担 prompt 编辑器。

#### Vault Search 与 AI Search

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 全文与过滤搜索 | 不使用生成模型 | SQLite / FTS 与确定性筛选 | `CURRENT` |
| 查询理解 | 自动，可覆盖 | 解析自然语言查询和条件 | `CURRENT` / 具体链路依 mode |
| 结果总结 | 自动，可覆盖 | 对已检索证据做简短回答 | `CURRENT` |
| 深度 AI Search | 自动，可覆盖 | 规划、调用 Vault / Web 工具并生成报告 | `CURRENT` / 多条 Agent 路径 |
| Rerank | 自动，可覆盖或关闭 | 只在启用模型重排时需要 | `PARTIAL` |
| 当前搜索运行模型 | 功能内、本次覆盖 | 只影响当前 AI Search run | `CURRENT` / 入口依 mode |

#### Knowledge Index

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| Embedding | 自动，可覆盖 | 生成向量；更换后通常需要重建相关向量 | `CURRENT` |
| 文档摘要 | 自动，可覆盖 | 生成短摘要和完整摘要 | `CURRENT` / 触发链路依 index level |
| 标签与主题 | 自动，可覆盖 | 生成知识标签和主题候选 | `PARTIAL` |
| 语义边与 Hub 分析 | 自动，可覆盖 | 为关系、Hub 和结构分析提供模型能力 | `PARTIAL` |
| 全文索引 | 不使用生成模型 | 解析、分块和 FTS 不应显示模型选择 | `CURRENT` |

Embedding 模型的唯一修改位置在 AI & Models。Knowledge & Search 显示当前绑定、健康状态和“更改模型”跳转，但不保存第二份值。

#### File Atlas 与 AI Graph

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 文件浏览与本地关系 | 不使用生成模型 | 文件树、链接、邻域关系和历史统计 | `CURRENT` |
| 文档理解 | 自动，可覆盖 | 摘要、主题、关键实体和关系解释 | `PARTIAL` |
| 生成 AI Graph | 自动，可覆盖 | 从明确来源生成图结构和说明 | `CURRENT` / artifact 路径已有 |
| 更新 / 比较 AI Graph | 自动，可覆盖 | 生成候选 diff，接受后才写入新版本 | `CURRENT` / 依工作流而定 |
| 图布局 | 不使用生成模型 | 可视化布局属于功能算法，不是模型任务 | `CURRENT` |

#### Ambient 与 Vault Intelligence

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 触发检测 | 不使用生成模型 | 文档切换、停顿、字符变化等本地规则 | `CURRENT` |
| 发现解释 | 自动，可覆盖 | 为相关发现生成一句可读解释 | `CURRENT`，默认关闭 LLM 解释 |
| Vault 分析 | 自动，可覆盖 | 结构、主题、异常、建议和维护任务 | `PARTIAL` |
| 建议变更 | 自动，可覆盖 | 只能产生候选、证据和 diff，不静默写 Vault | `PARTIAL` |

#### Agents、Wizard 与 Peak Hermes

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 快速 Agent | 自动，可覆盖 | 轻量工具调用与短任务 | `CURRENT`：Fast Agent role |
| 通用 Agent | 自动，可覆盖 | 多步任务与工具调用 | `CURRENT`：Agent role |
| 深度 Agent / Research | 自动，可覆盖 | 长流程、升级和综合 | `PARTIAL`：路由不完全统一 |
| Peak Hermes 主模型 | 自动，可覆盖 | Hermes workflow 的默认推理模型 | `REQUIRED`：需和现有 harness 统一 |
| Codex / Claude Code Agent | 选择执行连接或自动 | 需要同时验证 runtime、工作目录和权限 | `REQUIRED` |

Agent 使用哪个模型在 AI & Models 设置；Agent 是否能读写、调用哪些工具和何时确认在 Agents 设置。

#### 媒体生成

| 动作组 / 动作 | 默认模型控制 | 说明 | 当前事实 |
| --- | --- | --- | --- |
| 生成图片 | 路由、连接、模型、preset | 支持自动、Provider 原生或 fal 路由 | `CURRENT` |
| 编辑图片 | 路由、连接、模型、preset | 依赖参考图与可用编辑能力 | `CURRENT` |
| 生成视频 | 路由、连接、模型、preset | 显示时长、比例和能力限制 | `CURRENT` / Provider 依赖 |
| 生成音频 / 语音 | 路由、连接、模型、voice、preset | 区分语音、音效等输出 | `CURRENT` / Provider 依赖 |
| 生成音乐 | 路由、连接、模型、preset | 首次使用需要条款确认 | `CURRENT` / 路由依赖 |

### 3.5 高级模型控制

高级参数不是一个悬空的全局表，也不应该复制到所有功能卡片中。每个任务默认都应显示：

- 当前继承自哪里；
- 是否有该动作的覆盖；
- 此模型是否支持该参数；
- 恢复自动后会删除哪一层覆盖。

| 参数 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Temperature | 高级；全局默认 + 动作覆盖 | 影响输出随机性；模型不支持时隐藏 | `CURRENT` |
| Top-p | 高级；全局默认 + 动作覆盖 | 与 Temperature 同时修改时提示组合影响 | `CURRENT` |
| Top-k | 高级；仅支持的模型 | 不应对不支持的 Provider 强行发送 | `CURRENT` / Provider 依赖 |
| Presence penalty | 高级；仅支持的模型 | 影响重复主题 | `CURRENT` |
| Frequency penalty | 高级；仅支持的模型 | 影响重复词句 | `CURRENT` |
| Reasoning effort | 高级；仅推理模型 | 目标支持 low / medium / high 或 Provider 映射 | `PARTIAL`：字段有，主要请求链路未统一转发 |
| Output verbosity | 高级；仅支持的模型 | 控制输出详略，不替代 prompt | `PARTIAL` |
| 最大输出 | 高级；全局或动作覆盖 | 必须受模型和任务上限共同约束 | `CURRENT` |
| 总超时 | 高级；更接近任务执行控制 | 控制完整请求或任务等待时间 | `CURRENT` / 应与 Agent 超时区分 |
| 单步超时 | 高级；Agent 动作适用 | 对普通一次性生成不显示 | `CURRENT` / 应归 Agents 展示 |

高级模型参数的推荐默认由产品提供。普通用户不需要为了完成 Onboarding 修改任何一项。

### 3.6 媒体生成默认

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 每种媒体的默认路由 | 自动，可覆盖 | `auto / native / fal`，只显示真实可用路线 | `CURRENT` |
| 默认 OpenAI 媒体连接 | 自动，可覆盖 | 多个 OpenAI 连接时决定媒体优先使用哪一个 | `CURRENT` |
| 图片 / 视频 / 音频 / 音乐 preset | 普通设置 | 批量保存常用模型与参数组合 | `CURRENT` |
| 默认模型 | 高级或 preset 内 | 按媒体种类分别保存 | `CURRENT` |
| 比例、数量、时长、voice | 高级或 preset 内 | 只显示该模型支持的参数 | `CURRENT` |
| 媒体保存目录 | 不在本组修改 | 在 Advanced 的 Files & Data 中唯一管理 | `CURRENT` |
| 音乐条款确认 | 一次性确认 | 在第一次真实生成前完成，不能用默认勾选代替 | `PARTIAL`：字段恢复不完整 |

### 3.7 AI & Models 中不应开放的内部内容

- 模型自动路由评分权重；
- 价格与能力归一化算法；
- 内部 `quick / deep / premium` tier 名称；
- Provider adapter 的重试细节；
- model ID 别名映射的内置表；
- OpenRouter fallback 的打包实现；
- 单次实际路由 receipt 的写入结构。

这些内容应由模板、能力目录或运行时管理。诊断信息可以显示最终选择原因，但不要求普通用户维护算法。

## 4. Agents

Agents 管理第二条主线：

> 选择 Agent 执行方式 → 决定可用工具 → 限制读写与外部访问 → 定义确认规则 → 查看每次实际执行证据

### 4.1 Agent 执行方式

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Peak Hermes | 普通设置，启用 / 停用 | Peak 自有 Agent harness 和工作流；默认执行方式 | `PARTIAL`：现有 harness 需统一为产品概念 |
| Codex Agent | 条件性执行连接 | 使用 Codex runtime；需要单独健康和权限检测 | `REQUIRED` |
| Claude Code Agent | 条件性执行连接 | 使用 Claude Code runtime；需要单独健康和权限检测 | `REQUIRED` |
| 其他模型 Agent | 自动，可覆盖 | 使用支持工具调用的普通模型连接运行 Peak Agent loop | `CURRENT` |
| 默认 Agent 执行方式 | 自动，可覆盖 | 根据可用 runtime、任务、隐私与权限决定 | `REQUIRED` |
| 允许自动升级 | 普通设置 | 快速 Agent 能力不足时是否请求更强路线 | `CURRENT` / 覆盖范围不统一 |
| 最大升级次数 | 高级设置 | 防止循环升级和不可预测成本 | `CURRENT` |
| 升级阈值 | 高级设置 | 应保持产品默认，只有高级用户调整 | `CURRENT` |

Hermes 是 Agent 流程拥有者；Codex、Claude Code 和普通模型连接提供执行能力。它们不能被当成同一层的“模型名称”。

### 4.2 默认安全模式

默认安全模式必须保留，但语义需要纠正为真实执行行为：

| 模式 | 用户看到的含义 | 允许行为 | 当前事实 |
| --- | --- | --- | --- |
| 只读 | Agent 可以分析，但不能修改 Vault 或执行写入工具 | 读文件、搜索、生成候选和报告 | `CURRENT` / 需要全链路一致 |
| 每次询问 | 每次产生外部影响前都询问 | 用户逐次允许或拒绝写文件、命令或外部动作 | `PARTIAL`：runtime 有 `ask`，持久化类型未正式支持 |
| 自动接受文件修改 | 当前 run 内自动允许受控编辑，其他风险仍按规则确认 | 仅限明确工作范围和可恢复写入 | `CURRENT` runtime 名为 `acceptEdits`，旧 UI 曾错误标成 Ask |
| 绕过确认 | 不询问直接执行允许范围内的动作 | 只面向明确理解风险的高级用户；必须强警告和可见状态 | `CURRENT` runtime 名为 `bypassPermissions` |

上线前必须完成两件事：

1. 正式保存真实的“每次询问”模式，不能再用 `acceptEdits` 冒充；
2. 确认默认模式确实被所有 Agent 执行路径读取，而不只是 Settings 中保存了一个字段。

### 4.3 权限范围

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 读取 Vault | 普通设置或能力状态 | Agent 完成 Vault 任务的最低权限 | `CURRENT` / 不同工具需统一 |
| 修改 Vault 文件 | 普通设置 | 受安全模式和 run 范围共同约束 | `CURRENT` |
| 创建新文件 | 普通设置 | 默认询问；写入路径受约束 | `CURRENT` |
| 删除 / 移动文件 | 高风险设置 | 默认每次询问；不能被普通自动接受静默覆盖 | `PARTIAL` |
| 执行 Obsidian command | 普通设置 + 命令级审核 | 稳定命令可授权，高风险命令逐项确认 | `CURRENT` / gateway 体系 |
| 执行本地命令 | 高级设置 | 必须限制工作目录、命令类型和环境 | `REQUIRED` / runtime 依赖 |
| 访问工作区外文件 | 高风险设置 | 默认禁止；一次授权不得变成永久全盘访问 | `REQUIRED` |
| 访问网络 | 普通设置 | 默认按工具和域名确认，不等于 Web Search 开关 | `PARTIAL` |
| 使用敏感连接 | 条件性设置 | Agent 可使用连接，但不能读取或输出明文密钥 | `REQUIRED` |

权限应同时说明：允许什么、作用范围、持续多久、何时再次确认、如何撤销。仅有一个“Allow tools”总开关不够。

### 4.4 可用工具

| 工具能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Vault 读取与搜索工具 | 普通设置 / 默认启用 | Agent 查找和引用用户内容 | `CURRENT` |
| Vault 编辑工具 | 普通设置 / 默认受限 | 仍受默认安全模式和 run 审核约束 | `CURRENT` |
| Web Search / Web fetch | 普通设置 | 外部联网，需说明发送的查询和内容 | `CURRENT` / Provider 依赖 |
| Obsidian commands | 命令级设置 | 通过 Command Gateway 审核，不与模型混排 | `CURRENT` |
| MCP servers | 高级设置 | 管理第三方工具连接、启用状态和能力 | `PARTIAL`：字段与 UI 有，保存和运行时接线不完整 |
| Skills | 高级设置 | 决定 Agent 可发现的本地技能来源；不等同于自动授权执行 | `CURRENT` / 目录与运行时需分别核对 |
| 自定义工具 | 高级设置 | 必须声明输入、输出、风险和权限 | `REQUIRED` |

#### MCP Server 允许设置

- 名称与启用状态；
- 传输方式：`stdio` 或远端连接；
- 本地命令、参数和必要环境变量；
- 远端 URL 与 Headers；
- 能力检测、最后连接时间和错误状态；
- 删除、停用、重新测试。

环境变量和 Headers 可能包含敏感信息，诊断与 receipt 中必须脱敏。MCP Server 的工具被检测到，不代表用户已经授予写入权限。

### 4.5 确认策略与受信任范围

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 仅本次允许 | 运行时选择 | 对一次工具调用有效，不写入长期 allowlist | `CURRENT` / 路径依 Agent |
| 本次 run 允许 | 运行时选择 | 对当前任务中同类动作有效，结束后失效 | `CURRENT` / 路径依 Agent |
| 始终允许某个低风险动作 | 高级设置 | 需要显示命令、工具、作用域和来源 hash | `CURRENT` / Command Gateway |
| 始终拒绝 | 高级设置 | 形成可撤销的 deny 规则 | `CURRENT` / Command Gateway |
| 风险升级时重新询问 | 系统规则 | 即使低风险动作已允许，范围扩大时仍需确认 | `REQUIRED` |
| 审核过期 | 系统规则或高级设置 | 工具或命令定义发生变化后旧授权自动失效 | `CURRENT` / gateway evidence |

### 4.6 执行限制、成本与可恢复性

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 单步超时 | 高级设置 | 某一步超时后允许重试、跳过或停止 | `CURRENT` |
| 总任务超时 | 高级设置 | 防止 Agent 无限运行；不得静默丢失已有结果 | `CURRENT` |
| 最大步骤 / 循环保护 | 系统默认，必要时高级 | 保护成本与稳定性 | `CURRENT` / 多 runtime 需统一 |
| 月度 Agent 预算 | 高级设置 | 当前数据结构归 harness；是否升级为全产品预算需产品决定 | `PARTIAL` |
| 预算重置日 | 高级设置 | 只在预算启用时显示 | `CURRENT` / Agent scope |
| 预算预警阈值 | 高级设置 | 达到阈值后提醒，不静默阻断当前任务 | `CURRENT` |
| 单次 run 成本 / token 上限 | 高级设置 | 超限前给出继续、降级或停止选择 | `CURRENT` / 作用范围需统一 |
| 保存 Agent receipts | 系统默认 | 记录实际模型、工具、权限、成本和结果，便于审计与恢复 | `CURRENT` |
| Hooks | 高级设置 | 只有真实消费者和清楚用途后才能正式开放 | `PARTIAL`：当前未找到完整运行时消费者 |

当前 Budget 数据还包含四条独立提示规则，不能只用一个“预算提醒”总开关概括：

| 提示规则 | 当前编译默认 | 产品归属 | 当前事实 |
| --- | --- | --- | --- |
| 月度预算进度提醒 | 达到 40% 时提醒 | 如果预算仅属于 Agent，留在 Agents；如果升级为全产品预算，迁入 Advanced | `CURRENT` 数据结构 |
| Context compact 建议 | 上下文使用达到 70% 时提示 | 属于 Agent / Chat 运行反馈，不应静默压缩 | `CURRENT` 数据结构 |
| 高成本 Agent receipt | 单次达到 0.15 USD 或 50,000 tokens | 属于运行后证据 | `CURRENT` 数据结构 |
| 隐藏低成本消息标记 | 默认关闭；阈值 0.0005 USD | 属于 Usage 展示偏好 | `CURRENT` 数据结构 |

如果预算未来覆盖 Chat、Search、媒体和 Agent，全局预算应迁入 Advanced 的 Usage & Retention；Agents 只显示 Agent 分配额度和当前状态。

### 4.7 Agents 中只显示的状态与操作

- **状态**：Hermes / Codex / Claude Code 是否可用，当前执行方式，工具数量，MCP 健康，权限摘要，正在运行的任务，最近失败；
- **操作**：测试 runtime、重新检测工具、打开当前 Agent run、查看 receipt、撤销授权、停止任务；
- **一次性确认**：工作目录外访问、高风险写入、删除、命令执行、绕过确认；
- **导航**：使用模型跳转到 AI & Models；数据保留跳转到 Advanced。

## 5. Knowledge & Search

Knowledge & Search 管理长期知识状态：

> 哪些内容进入系统 → 处理到什么深度 → 怎样检索与分析 → 怎样维护 Atlas、Graph、Ambient 和 Vault Intelligence

### 5.1 索引范围与自动更新

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 自动更新索引 | 普通设置 | 文件变化后增量维护；默认当前为关闭 | `CURRENT` |
| 每次索引生成什么 | 在 Index workspace 配置 | Core search 显示 Full-text 与 Embeddings；Generated knowledge 再按摘要、标签与实体、关系、内容理解展开到具体动作；Recommended 只恢复推荐组合 | `TARGET`：替代 fast / indexLevel 等抽象套餐 |
| 包含的文档类型 | 普通设置 | 按真实能力矩阵选择，不只按扩展名 | `CURRENT` |
| 包含 / 排除文件夹 | 普通设置 | 支持 Vault 路径范围；与 ignore pattern 合并解释 | `PARTIAL` |
| Ignore patterns | 高级设置 | 排除生成目录、缓存或用户指定 pattern | `CURRENT` |
| 索引刷新间隔 | 高级设置 | 只在自动更新时适用 | `CURRENT` |
| 更换 Embedding 模型 | 跳转到 AI & Models | 这里显示影响和重建要求，但不保存第二份值 | `CURRENT` |
| 增量更新策略 | 系统自动 | 根据内容 hash、版本和产物状态决定需要重做的步骤 | `REQUIRED` / 当前状态投影不完整 |

### 5.2 文档类型能力矩阵

用户不是在选择“扩展名”，而是在选择某类内容可以参与哪些能力。至少需要分别表达：

- 能否识别；
- 能否抽取正文；
- 能否全文搜索；
- 能否分块和生成向量；
- 能否生成摘要、标签和关系；
- 能否被 Composer 打开或编辑；
- 能否由 Peak 创建。

| 文档类型 | 默认进入索引 | 需要的设置语义 | 当前事实 |
| --- | --- | --- | --- |
| Markdown | 开 | 全文、链接、标签、摘要和向量 | `CURRENT` |
| PDF | 开 | 文本提取；扫描件需明确 OCR 状态 | `CURRENT` / OCR 依文件 |
| 图片 | 开 | OCR / 视觉描述是否启用，成本和隐私提示 | `CURRENT` / enrichment 依连接 |
| Excalidraw | 开 | 文本标签、引用和画布关系 | `CURRENT` |
| TXT | 关 | 是否纳入全文与向量 | `CURRENT` 类型存在 |
| CSV / JSON / HTML | 关 | 结构化或文本抽取边界；避免把机器数据误作笔记 | `CURRENT` 类型存在 |
| Canvas | 关 | 卡片文本和链接；与 Excalidraw 分开 | `CURRENT` 类型存在 |
| Peak Sheet | 按产品策略 | 使用自己的结构化工具和索引投影，不按普通文档解析 | `REQUIRED` / 新文件类型需登记 |
| Peak AI Graph | 按产品策略 | 索引用户可读说明与来源，不把内部图数据重复作为普通文档 | `CURRENT` artifact，索引策略需收口 |
| DOCX / PPTX / XLSX / XML / URL / Unknown | 不进入产品范围 | 即使存在底层 loader 或历史注册，也不在本轮 Knowledge Index 设置中承诺支持 | `OUT OF PRODUCT SCOPE` |

新增 Peak 原生文件类型时，必须先登记其识别、读取、搜索、向量、AI enrichment、编辑和生成能力，再决定是否出现在文档类型设置中。

### 5.3 分块、摘要与 enrichment

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 最大 Chunk 大小 | 高级设置 | 当前编译默认 1000；改变后可能需要重新分块和向量化 | `CURRENT` |
| Chunk overlap | 高级设置 | 当前默认 200；与 chunk 大小联动校验 | `CURRENT` |
| 触发分块的最小文档大小 | 高级设置 | 当前运行字段默认 1500 | `PARTIAL`：当前 UI 使用了不同字段名，不能证明用户修改会生效 |
| 跳过代码块 | 高级设置 | 决定代码是否进入普通文本分块 | `CURRENT` |
| 代码块替代文字 | 高级设置 | 跳过代码时插入的说明文字；空值需要安全 fallback | `CURRENT` 字段，普通用户通常无需修改 |
| 最大代码字符数 | 高级设置 | 防止巨大代码块占满上下文 | `CURRENT` |
| 短摘要长度 | 高级设置 | 当前默认 150；影响列表与轻量上下文 | `CURRENT` |
| 完整摘要长度 | 高级设置 | 当前默认 2000；影响文档理解 | `CURRENT` |
| AI Analysis 会话摘要长度 | 高级设置 | 当前默认 3000；只影响分析产物 | `CURRENT` |
| 生成向量 | 每次运行独立选择 | Core search 中直接显示为 Embeddings；语义检索和语义关系依赖它，需显示模型和重建影响 | `CURRENT` |
| Markdown 摘要 | 每次运行独立选择 | 从笔记正文生成短摘要和完整摘要；长度由长期设置管理 | `CURRENT` |
| PDF 摘要 | 每次运行独立选择 | 必须基于已抽取 PDF 正文生成，不能用文件名或占位文本代替 | `IN DEVELOPMENT`：底层可抽取正文，索引 enrichment 尚未接通 |
| 图片描述与摘要 | 每次运行独立选择 | 必须把真实图像内容交给视觉模型，并说明成本与隐私 | `IN DEVELOPMENT`：当前索引路径没有传递图像内容 |
| Canvas / Excalidraw 摘要 | 每次运行独立选择 | 基于可读文字、引用和结构生成，不把内部 JSON 当摘要 | `IN DEVELOPMENT` |
| 本地关键词与关键句 | 系统自动 | 使用确定性本地分析，不产生模型调用 | `CURRENT` |
| AI topic tags | 每次运行独立选择 | 生成用于发现和聚类的主题概念，并显示预计用量 | `CURRENT` / Markdown 路径 |
| Functional tags | 每次运行独立选择 | 识别 decision、plan、reference 等文档作用 | `CURRENT` / Markdown 路径 |
| 人物、地点、日期 | 每次运行独立选择 | 抽取可复用的上下文实体 | `CURRENT` / Markdown 路径 |
| 推断文档日期 | 每次运行独立选择 | 只有来源足够明确时才写入索引产物 | `CURRENT` / Markdown 路径 |
| 显式链接、标签与文件夹关系 | 系统自动 | 保留 Vault 已经存在的关系事实 | `CURRENT` |
| 语义相似关系 | 每次运行独立选择 | 开启时自动保证 Embeddings 可用 | `CURRENT` |
| Communities / Hub signals | 每次运行独立选择 | 生成聚类、中心性与结构缺口信号 | `CURRENT` 处理存在 / 用户级开关是 `TARGET` |
| Search ranking signals | 系统自动 | 维护 PageRank 与关系感知排序信号 | `CURRENT` |
| PDF、Canvas、Excalidraw 文本抽取 | 系统自动 | 作为相应文件类型进入全文与向量步骤前的准备动作 | `CURRENT` / 能力依 loader |
| 扫描 PDF OCR、图片 OCR、图片视觉描述 | 每次运行独立选择 | 只在真实 OCR / vision pipeline 可用时开放，不能用 disabled 外观假装已经支持 | `IN DEVELOPMENT` |

Index workspace 直接展示真实产物，不再要求用户先理解“快速 / 语义 / 完整”等套餐名。第一层是 `Core search`：Full-text 是每次运行的基础，Embeddings 可以直接开关。第二层是 `Generated knowledge`：按照 Summaries、Tags & entities、Relationships、Content understanding 四组展开，每个动作独立说明其状态、依赖、成本和处理对象。

组名只是导航，不能充当一个会模糊能力边界的总开关。例如 `Summaries` 必须继续拆成 Markdown、PDF、图片和视觉文档；还没接通的路径明确标为 `In development`，而不是让用户误以为一个开关已经覆盖所有文件类型。`Recommended` 只恢复核心层和必要自动动作，不能隐藏或覆盖用户逐项选择。详细长度、chunking、后台刷新等长期参数仍留在 Settings，避免同一配置出现两个 owner。

### 5.4 Search 与 AI Analysis

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 语义检索 | 普通设置 | 需要 Embedding 和向量状态；不可用时自动降级并说明 | `CURRENT` |
| Personalized PageRank | 高级设置 | 当前默认开启；影响关系型排序 | `CURRENT` |
| Rerank | 高级设置 | 依赖可用模型；失败时保留原排序 | `PARTIAL` |
| AI 查询分析模型 | 跳转 / 引用任务默认 | AI & Models 是唯一模型 owner | `CURRENT` 字段存在，所有权需迁移统一 |
| AI Analysis 自动保存 | 普通设置 | 当前默认开启；影响是否产生持久分析记录 | `CURRENT` |
| 分析历史查看、重试和删除 | 不作为设置 | 属于 AI Analysis 运行结果 / 历史工作区 | `CURRENT` 能力，入口需统一 |
| 排除已保存分析以避免反馈循环 | 系统自动 | 属于检索安全策略，不要求普通用户维护一个含混开关 | `CURRENT` 内部行为 |
| 分析输出位置 | 跟随 Data root | 不再单独暴露目录覆盖 | `TARGET` |
| Inspector links | 高级设置 | 决定结果检查器显示哪些跳转 | `PARTIAL`：当前恢复和消费者不完整 |

Inspector links 当前还拆成五个底层字段：关键词数量默认 8、标签数量默认 8、文件夹分组默认开启、分组最小数量默认 6、最大目录深度默认 4。目标 Settings 可以把它们放在同一处高级展开，但必须先补齐持久化恢复和真实消费者，不能因为控件能修改就标成已生效。

### 5.5 File Atlas 与 AI Graph

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 默认 Atlas 范围 | 自动，可覆盖 | 当前文件、文件夹或 Vault 的默认范围 | `REQUIRED` |
| 默认关系层数 | 高级设置 | 只影响初始可视范围，不改变索引事实 | `PARTIAL`：现有 graphViz 默认未完整恢复 |
| 布局与骨架模式 | 功能内或高级 | 更适合在 File Atlas 当前视图修改 | `PARTIAL` |
| 关系透明度 / 线宽 | 外观或功能内 | 不应混入知识质量设置 | `PARTIAL` |
| AI Graph 自动建议 | 普通设置 | 只生成候选，不自动覆盖用户 artifact | `REQUIRED` |
| AI Graph 来源范围 | 功能内设置 | 绑定当前图任务，不是全局索引范围 | `CURRENT` |
| 版本保留与 materialize | Advanced / 功能内操作 | 由 artifact 治理决定，不做简单开关 | `CURRENT` / 路径依工作流 |

### 5.6 Ambient 与 Vault Intelligence

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Ambient suggestions | 普通设置 | 当前默认开启；控制是否生成轻量发现 | `CURRENT` |
| 文档切换触发 | 高级设置 | 当前默认等待 5 秒 | `CURRENT` |
| 写作停顿触发 | 高级设置 | 当前默认等待 5 秒 | `CURRENT` |
| 最小字符变化 | 高级设置 | 当前默认 30 字符，减少噪音 | `CURRENT` |
| 冷却时间 | 高级设置 | 当前默认 30 秒 | `CURRENT` |
| 每次最多建议 | 高级设置 | 当前默认 5 条 | `CURRENT` |
| 关系图跳数 | 高级设置 | 当前默认 2 跳 | `CURRENT` |
| 反馈控件 | 普通设置 | 当前默认开启，用于改进用户自己的建议质量 | `CURRENT` |
| LLM 解释 | 普通设置 | 当前默认关闭；打开前说明连接、成本和内容发送范围 | `CURRENT` |
| LLM 解释冷却 | 高级设置 | 当前默认 120 秒 | `CURRENT` |
| 状态栏提示 | 普通设置 | 当前默认关闭 | `CURRENT` |
| Serendipity gutter | 实验性设置 | 当前默认关闭，明确标记实验 | `CURRENT` |
| Morning briefing | 实验性设置 | 当前默认关闭，明确说明生成时机和来源 | `CURRENT` |
| Vault Intelligence 自动扫描 | 普通设置 | 只生成状态与发现，不静默改文件 | `REQUIRED` / 当前多条能力在演进 |
| 自动建议修复 | 普通设置 | 产生候选、证据和 diff；应用仍需用户审核 | `REQUIRED` |

### 5.7 Hub curation 与知识维护

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 定时 Hub curation | 高级设置 | 当前默认关闭；开启后按周期生成维护候选 | `PARTIAL`：Service 会读，Settings 恢复不完整 |
| Curation 间隔 | 高级设置 | 当前默认 7 天；仅在 scheduler 开启时显示 | `PARTIAL` |
| Pinned / ignored findings | 功能内设置 | 用户在 Vault Intelligence 或 review surface 管理 | `CURRENT` / 依具体 finding |
| 自动应用维护 | 不提供普通开关 | Vault 写入必须经过候选、证据、diff 和 Apply | `INTERNAL` / 安全边界 |

### 5.8 Knowledge & Search 中只显示的状态与操作

- **状态**：索引覆盖率、新增 / 变更 / 缺失文档、全文可用性、Embedding 可用性、enrichment 完成度、失败数量、最后成功维护时间；
- **操作**：立即更新、增量修复、重建指定产物、完整重建、打开 Knowledge Index 工作区、导出失败清单；
- **高影响确认**：更换 Embedding、删除本地索引、扩大到敏感文件夹、重新处理大量媒体；
- **运行入口**：首次批量索引和长任务必须进入可反复打开的单独工作区，显示进度、速度、预计时间、文档顺序、类型占比和逐文档步骤。

`Index readiness` 不能仅来自一个静态偏好。必须根据真实文件、索引产物、模型可用性和最后维护证据计算。

## 6. Advanced

Advanced 收纳低频但必要的长期控制。它不是一套隐藏的“专业模式”，也不是所有内部参数的垃圾桶。

### 6.1 Files & Data

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Data root | 高级设置 | Chat、AI Analysis、Prompts、Skills、Inbox、receipts、DataStore 与可重建索引都从该根目录派生；改变时必须说明迁移和旧内容处理 | `TARGET`：收口现有多个路径字段 |
| Media root | 高级设置 | 图片、视频、音频和音乐共用独立根目录，因为体积和同步策略通常不同 | `CURRENT` 能力，目标命名需统一 |
| 数据迁移 | 操作 | 复制、校验、切换、失败回滚；不能静默执行 | `REQUIRED` |
| 恢复默认目录 | 操作 | 只移除 Data root / Media root 的用户覆盖，不删除旧内容 | `REQUIRED` |

Settings 只开放这两个根目录。Analysis、Skills、Inbox、Custom prompts、Attachments、Resource summaries、Hub summaries、User profile、receipts、DataStore 和索引等子路径都由产品从 Data root 稳定派生，不再逐项暴露。诊断可以显示最终路径，但不能把内部目录结构重新变成普通设置。

路径变更必须说明：哪些新内容会写到新位置、旧内容是否迁移、是否需要重启或重建、失败后如何恢复。

### 6.2 Privacy, Usage & Retention

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Usage tracking | 普通设置 | 当前默认开启；必须说明记录字段和本地 / 远端边界 | `CURRENT` |
| Usage 保留天数 | 高级设置 | 当前默认 30 天 | `CURRENT` |
| Usage 内容预览 | 普通设置 | 当前默认开启；关闭后 Dashboard 隐藏 prompt / response preview，但底层记录保留策略需要另行说明 | `PARTIAL`：字段、恢复和消费者已有，当前 Settings 入口缺失 |
| Chat / Agent history 保留 | 高级设置 | 按 artifact 治理和用户删除语义执行 | `PARTIAL` / 多存储载体 |
| Debug trace 模式 | 高级设置 | `off / redacted / raw`；raw 必须强警告 | `CURRENT` |
| Debug trace 保留量 | 高级设置 | 当前支持按模式使用 20 / 100 / session 等上限 | `CURRENT` |
| Copy trace 格式 | 高级设置 | Markdown、JSON 或两者 | `CURRENT` |
| 包含原始内容 | 高风险设置 | 当前默认关闭；启用前说明可能包含 Vault 内容 | `CURRENT` |
| 本地索引内容范围 | 跳转到 Knowledge & Search | Advanced 只说明数据位置和删除，不复制范围设置 | `CURRENT` |
| 云端发送策略 | 普通设置或状态摘要 | 实际由连接、任务、local-only 策略与 Agent 权限共同决定 | `REQUIRED` |
| 清除本地历史 / traces | 操作 | 预览删除范围、不可恢复内容和不受影响的用户文件 | `CURRENT` / 各存储需统一入口 |
| 导出我的数据 | 操作 | 区分用户 artifact、canonical record 和本地缓存 | `REQUIRED` |

隐私状态不能只藏在 Advanced。Agents、Knowledge 和媒体执行前可以显示相关摘要，但详细修改仍回到唯一 owner。

### 6.3 Workspace behavior

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Composer 默认文档视图 | 普通设置 | 当前默认 Markdown；影响打开文档时的默认工作方式 | `CURRENT` |
| Composer 内容宽度 | 功能内持久偏好 | `Readable / Wide`，当前默认 Readable；在 Composer 现场修改，Settings 只需能恢复默认 | `CURRENT` 源码接线；真实交互尚未验证 |
| Composer Intelligence 手动打开 | 高级设置 | 当前默认关闭；影响 Copilot / Intelligence 的启动方式 | `CURRENT` |
| Command Center 启动时打开 | 普通设置 | 影响 Vault 启动后的入口 | `CURRENT` |
| 替换空标签页 | 普通设置 | 只在用户打开空工作区时生效 | `CURRENT` |
| Command Center 默认布局 | 普通设置或功能内 | 系统起始布局与用户自定义组分开 | `CURRENT` |
| 用户自定义 Command Center 分组 | 功能内设置 | 在 Command Center 现场管理，不塞进中央 Settings | `CURRENT` |
| Preview 能力 | 高级 / 实验设置 | 当前默认开启；必须说明影响哪个预览 surface | `CURRENT` / 用户语义需明确 |

### 6.4 Appearance & Accessibility

| 设置能力 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| 代码主题 | 普通设置 | 当前提供 GitHub Dark、One Dark Pro、Nord、Dracula、Vitesse Dark | `CURRENT` |
| 跟随 Obsidian 主题 | 自动，可覆盖 | Peak chrome 应优先继承宿主语义 token | `REQUIRED` / 各 surface 需一致 |
| 内容密度 | 普通设置 | 紧凑 / 舒适只改变信息密度，不隐藏能力 | `REQUIRED` |
| 减少动效 | 自动跟随系统，可覆盖 | 尊重系统设置；所有关键状态不能只靠动画表达 | `REQUIRED` |
| 高对比度 | 自动跟随系统，可覆盖 | 颜色之外保留文字和形状证据 | `REQUIRED` |
| 图关系视觉参数 | 功能内优先 | 透明度、线宽和 skeleton 更适合 Atlas 当前视图 | `PARTIAL`：旧 graphViz 字段未完整恢复 |

字体、颜色、圆角和图标配色等设计系统实现参数不应全部成为用户设置。只有确实影响可读性、可访问性或稳定偏好的内容才开放。

### 6.5 Diagnostics & Maintenance

| 设置或操作 | 用户控制 | 默认与影响 | 当前事实 |
| --- | --- | --- | --- |
| Developer tools | 高级 / 开发设置 | 开启后暴露调试入口，不改变普通功能数据 | `CURRENT` |
| SQLite backend override | 系统内部或故障诊断 | 当前支持 `auto / better-sqlite3`；普通用户没有稳定选择意图，不进入常规 Settings | `CURRENT` runtime / `INTERNAL` UI 决策 |
| 导出诊断包 | 操作 | 默认脱敏；列出将包含的文件和字段 | `REQUIRED` |
| 重新检测全部连接 | 操作 | 更新健康与能力状态，不改凭证 | `REQUIRED` |
| 重新加载模型目录 | 操作 | 更新目录、缓存和新鲜度 | `REQUIRED` |
| 重建本地索引 | 高影响操作 | 打开 Knowledge Index 工作区显示全过程 | `CURRENT` / 运行视图需统一 |
| 重建 SQLite projection | 维护操作 | 只重建 read model，不删除 canonical 数据 | `CURRENT` / 应隐藏在维护区 |
| 清理缓存 | 操作 | 先说明可重新生成内容和预计影响 | `CURRENT` / 多缓存需统一 |
| 修复数据位置 | 操作 | 检查权限、缺失目录和迁移残留 | `REQUIRED` |
| 恢复某组默认值 | 操作 | 删除该组用户覆盖，不影响其他组 | `REQUIRED` |
| 恢复全部默认值 | 高影响操作 | 预览将清除的偏好；不删除用户内容和凭证，除非另行确认 | `REQUIRED` |

### 6.6 系统内部配置，不进入普通 Settings

下列内容虽然可以通过模板或代码调整，但普通用户不应维护：

- Prompt 正文、schema、内部角色映射；
- 多语言正则、标签映射和颜色映射；
- Search、Graph、Hub 和 Vault Intelligence 的算法权重；
- 自动路由候选评分、重试和 fallback 顺序；
- Agent loop 的内部状态机与 receipt schema；
- 数据 writer、artifact carrier、sync 和 materialization 规则；
- 索引内部队列优先级与数据库 schema；
- 纯 QA fixtures、Simulator 默认场景和开发阈值。

当前 `defaultModel`、`llmProviderConfigs`、`profileEnabled` 等旧 AI 字段仍承担 fallback 或迁移兼容，不能突然删除；但目标 Settings 应以连接、Profile registry 和任务默认作为用户真值。`searchUpgradePromptDismissedAt` 只是提示是否已关闭的 UI 状态，`lastValidatedAt` 只是媒体配置检查时间，它们也不是用户设置。

产品可以提供诊断只读信息，但不应把内部复杂度转嫁给用户。

## 7. 按产品功能反查设置归属

这张表帮助设计师或实现人员从功能名称反查 Settings，不需要先理解内部模块。

| 产品功能 | AI & Models | Agents | Knowledge & Search | Advanced / 功能内 |
| --- | --- | --- | --- | --- |
| Chat Studio | 对话、快速、研究模型与参数 | 使用 Agent 时的工具和权限 | Vault / Web 检索依赖状态 | 历史保留在 Advanced；当前对话覆盖在 Chat 内 |
| Composer / Copilot | 对话、改写、结构、多文件模型 | 写入权限、命令和工具确认 | 当前文档知识与 Ambient 来源 | 默认文档视图在 Advanced；当前文档选项在 Composer 内 |
| Vault Search / AI Search | 查询理解、总结、研究模型 | 多步 AI Search 的工具与网络权限 | 索引、语义、rerank、分析保存策略 | 输出目录与保留在 Advanced；当前 run 在 Search 内 |
| Knowledge Index | Embedding、摘要、标签和关系模型 | enrichment Agent 需要的工具权限 | 范围、类型、深度、自动更新、分块 | 数据位置在 Advanced；当前进度在 Index 工作区 |
| File Atlas | 文档理解和 AI Graph 模型 | 生成 / 更新 Graph 时的权限 | Atlas 范围、关系和知识策略 | 视觉布局功能内；数据保留在 Advanced |
| AI Graph | 生成、更新和比较模型 | 写入 artifact 和工具确认 | 来源知识和关系质量 | 版本 / materialize 在功能内或 Advanced |
| Ambient | 解释模型 | 自动建议涉及动作时的权限 | 触发、冷却、数量和 Vault Intelligence 策略 | 显示位置部分在功能内 |
| Peak Hermes / Wizard | Agent / Research 默认模型 | runtime、工具、安全、升级和成本 | 使用 Vault 时读取索引状态 | receipt 保留和诊断在 Advanced |
| 图片 / 视频 / 音频 / 音乐 | 路由、连接、模型和 preset | 只有 Agent 自动生成时使用权限 | 不属于知识设置，除非产物被索引 | 保存目录、隐私和条款记录在 Advanced |
| Command Center | 不拥有模型 | 由入口触发 Agent 时使用 Agents 规则 | 显示知识状态但不改索引 | 启动行为在 Advanced；布局在功能内 |

## 8. 当前实现缺口：设计不能假装已经完成

以下问题来自 2026-08-12 对设置类型、默认值、加载器、当前 Settings 和主要运行时消费者的审计。

### 8.1 P0：上线前必须解决

1. **安全模式语义错误。** runtime 有真正的 `ask`，但持久化类型没有正式包含；旧 UI 将 `acceptEdits` 标成 Ask。必须统一枚举、文案、保存和运行时读取。
2. **默认安全模式是否真正生效不清楚。** 当前有保存与 bridge 传递，但不能证明所有 Agent 路径都执行同一权限门。
3. **推荐策略存在假交互。** 当前 Settings 的 recommendation cards 明确是 cosmetic；点击不会真正改变任务绑定。上线 UI 不能保留这种行为。
4. **部分字段重启后丢失。** `attachmentHandlingDefault`、音乐条款确认、Inspector links、Hub scheduler、MCP servers 和 graph visualization 等字段存在不同程度的恢复缺口。
5. **Codex / Claude Code 双能力未完整接入。** 普通对话和 Agent 执行必须分别检查并显示，不能先画成 Ready。
6. **模型目录新鲜度没有统一契约。** OpenRouter 在线 JSON、缓存、fallback、`ETag` / `Last-Modified` 和更新时间需要正式实现；Ollama 需要本地探测失败语义。
7. **Knowledge readiness 不完整。** 当前状态不能完整表达 changed、missing、semantic readiness、freshness 和 repair result。
8. **模型参数并非全部被请求链路使用。** reasoning effort 与 output verbosity 已有字段，但不能当成所有 Provider 和功能都已生效。
9. **最小分块阈值的 UI 字段名不一致。** 运行时字段是 `minDocumentSizeForChunking`，当前 Settings 使用 `minDocSizeToChunk`；修复前用户控制应标为未生效，而不是 `CURRENT`。

### 8.2 P1：需要明确产品所有权

1. Agent budget 是只控制 Hermes / Agent，还是升级为全产品 AI budget；
2. AI Analysis 模型字段迁移到统一任务默认后，旧字段如何兼容；
3. File Atlas 的图视觉参数保留在功能内，还是在 Advanced 提供默认；
4. Prompt、preset 和 task override 的编辑边界；
5. MCP、Skills 和 Command Gateway 的统一能力 / 权限摘要；
6. 多个相同 Provider 连接删除、禁用和改名后的引用迁移；
7. Peak Sheet、Peak AI Graph 和后续原生文件类型的索引能力登记。

### 8.3 不应继续公开的“假设置”

一个字段满足以下任意情况时，修复前不应作为正常可用设置展示：

- 只改变 UI，本地重启后恢复默认；
- 能保存但没有运行时消费者；
- 有消费者但无法显示是否生效；
- 名称与真实行为不同；
- 修改后需要重建或重启，却没有说明；
- 与另一个页面保存相同意图；
- 当前能力并不存在，只是未来设计占位。

产品可以用“即将支持”或只读诊断表达这些事实，但不能提供看似可点击、实际无效的控制。

## 9. 新增或保留正式设置的登记模板

任何设置进入产品前，都应完成以下登记：

| 字段 | 必须回答的问题 |
| --- | --- |
| 用户意图 | 用户为什么需要改变它？不用内部模块名解释 |
| 唯一 owner | AI & Models、Agents、Knowledge & Search、Advanced 或具体功能中的哪一个 |
| 控制类型 | 自动覆盖、普通、高级、功能内、一次确认、操作、状态或内部 |
| 默认来源 | 产品 fallback、自动解析、用户覆盖、迁移值还是本次运行值 |
| 持久化位置 | 保存在哪里，敏感值如何保护，重启后怎样恢复 |
| 运行时消费者 | 哪个生产路径读取并改变可观察行为 |
| 依赖 | 需要什么连接、模型、权限、文件类型或索引状态 |
| 生效方式 | 立即、新任务、重连、重建、重启或重新处理 |
| 状态证据 | 怎样区分已保存、正在应用、已生效、失败和需要修复 |
| 恢复路径 | 如何撤销、恢复自动、恢复默认或回滚 |
| 影响范围 | 是否影响现有数据、当前任务、成本、隐私或文件写入 |
| 验收方法 | 自动测试、生产运行证据和真实 Obsidian 交互分别验证什么 |

缺少真实消费者、持久化恢复、状态证据或恢复路径时，只能先作为内部配置、实验项或未开放能力，不能称为完成的用户设置。

## 10. Settings 与 Onboarding 的职责边界

### Onboarding 负责

- 让用户选择一个第一次想完成的真实任务；
- 只检查该任务所需的一条可用连接；
- 自动给出任务默认，不要求理解完整模型目录；
- 检测已有 Vault 和 Index 状态，不把已有索引写成 Not yet；
- 在原地验证、修复并保存进度；
- 配置完成后打开 Chat Studio、Composer、Vault Search、File Atlas、Agent 或媒体生成中的真实入口；
- 区分 `Setup complete` 与 `First success`。

### Settings 负责

- 提供本文四个功能组的长期配置和状态；
- 允许用户理解当前有效值、继承来源和依赖；
- 支持安全修改、验证、恢复自动与恢复默认；
- 提供连接、索引、Agent、数据和维护问题的修复入口；
- 保留高级能力，但通过清楚分组降低普通用户的视觉负担。

### 具体功能页面负责

- 当前对话、当前文档或当前 run 的一次性覆盖；
- 与任务上下文强相关的 prompt、来源、范围和输出选择；
- 运行进度、结果审核、diff、历史和恢复；
- 把需要长期修改的内容链接回 Settings 的唯一 owner。

### 系统负责

- 自动探测连接、模型能力、Index 状态和可用工具；
- 计算自动默认与 fallback；
- 保存实际执行 receipt；
- 在升级后重新解析自动默认，而不是沿用陈旧值；
- 对内部模板、算法、schema、迁移和投影负责；
- 不把失败伪装成 Ready，也不把内部复杂度交给普通用户。

## 11. 验收清单

### 内容覆盖

- [ ] 四个功能组都有清楚职责和唯一 owner；
- [ ] Chat Studio、Composer / Copilot、Vault Search / AI Search、Knowledge Index、File Atlas / AI Graph、Ambient / Vault Intelligence、Agents / Hermes、媒体生成都能反查设置；
- [ ] 主要 Provider、更多 Provider、媒体连接和开发 Simulator 分层完整；
- [ ] 模型目录、自动策略、任务默认和高级参数没有混成一个 picker；
- [ ] 旧设置中有真实作用的能力没有因为页面简化而消失。

### 行为真实性

- [ ] 每个可编辑项有持久化位置和生产消费者；
- [ ] 每个设置能显示保存与生效的区别；
- [ ] 重连、重建、重启和重新处理影响清楚；
- [ ] 恢复自动会删除用户覆盖，而不是写死旧默认；
- [ ] `PARTIAL` 和 `REQUIRED` 不显示成已经 Ready；
- [ ] 安全模式枚举、文案与运行行为完全一致。

### 用户体验

- [ ] 普通用户不理解 Provider 内部结构也能完成第一项配置；
- [ ] 用户可以从熟悉的产品功能逐层找到模型默认；
- [ ] 高级设置可找到，但不会压住常用设置；
- [ ] 错误能在原地修复，修复后重新读取真实状态；
- [ ] 当前索引任务能反复打开并看到进展；
- [ ] Settings 修改不会静默丢失或产生两个冲突 owner。

## 12. 源码与文档证据入口

本次清单基于以下当前入口审计，不以 mock 代替实现事实：

- Settings 类型与编译默认：`src/core/config/settingsTypes.ts`
- Settings 恢复与迁移：`src/app/settings/PluginSettingsLoader.ts`
- Provider 与 Profile：`src/core/providers/`、`src/core/profiles/`
- Chat、Copilot 与模型角色：`src/service/chat/`、`src/core/profiles/ProfileRegistry.ts`
- Agent loop、Harness 与权限：`src/service/agents/`
- Knowledge / Search / Index：`src/service/search/`
- Ambient：`src/service/ambient/`
- MCP 与 Command Gateway：`src/service/mcp/`、`src/service/command-gateway/`
- 当前设置 mock：`docs/gstack/settings-onboarding-unified-2026-08-12/settings.html`
- 字段迁移与配置治理细表：[`2026-08-10 设置清单`](./2026-08-10-peak-assistant-configuration-governance-and-settings-inventory.md)

源码继续变化时，应先更新“当前事实”和缺口，不要直接删除产品能力要求。真实上线结论仍需要 focused tests、生产 build、运行时证据与真实 Obsidian 交互共同验证。
