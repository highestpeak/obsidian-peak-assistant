# Peak Assistant Onboarding 与 Settings 能力、内容和流程 Brief

> 状态：当前产品要求 · target UI mock available · production implementation not started · interaction not verified
> 日期：2026-08-09
> 面向读者：产品设计师、交互设计师、产品负责人、后续实现与验收人员
> 适用范围：Peak Assistant 首次配置、重新配置、日常设置、修复与首次成功体验

## 0. 这份文档是什么

这是一份交给 UI 设计师的产品契约。它只规定：

- 产品必须具备哪些能力；
- 用户需要看到和理解哪些内容；
- 用户从开始到成功应经过什么流程；
- 每一步需要哪些真实状态；
- 失败时如何恢复；
- 什么条件才算完成。

它不规定页面布局、导航形式、控件形态、颜色、图标、尺寸、动效或视觉风格。设计师可以自由决定具体 UI，但不能删除这里定义的必要能力、状态、依赖关系和恢复路径。

本 brief 是当前能力、内容、状态和流程的 source of truth。[2026-08-12 Settings 与 Onboarding 文档包](../../gstack/settings-onboarding-unified-2026-08-12/index.html) 提供当前目标 mock；[2026-08-06 redesign](./2026-08-06-onboarding-settings-launch-readiness-redesign.md) 与同批 HTML variants 只保留为历史探索。

### 0.1 产品目标

Onboarding 的唯一目标是：

> 让新用户完成最低必要配置，并尽快获得第一次真实成功。

Settings 的唯一目标是：

> 让用户理解 Peak 当前是否正常，并能安全、可预测地改变产品行为。

### 0.2 明确不做

- 不在 Onboarding 中完整介绍全部产品功能；
- 不要求新用户先理解 Provider、模型路由、Embedding、MCP、Agent Harness 等技术体系；
- 不以“看起来更简洁”为理由删除原来有真实作用的设置；
- 不把普通用户和高级用户分成两套互相切换的 Settings；
- 不把静态文案、API key 是否非空或 mock 数据当成真实可用状态；
- 不把 Codex、Claude Code 限定成只做 Agent 的 runtime；它们的普通对话能力与 Agent 执行能力需要分别表达和验证；
- 不为 18 个任务机械制造 18 份互不相关的重复配置；
- 不把关闭 Onboarding 或看到完成文案当作第一次成功。

## 1. 需求标记

本文使用两个独立维度：

### 1.1 优先级

- **P0**：产品上线和首次成功所必需；
- **P1**：长期使用中必须可控，但不需要进入默认首次流程；
- **P2**：高级用户、调试或条件性能力。

### 1.2 当前事实

- **CURRENT**：当前源码已有主要能力；
- **PARTIAL**：已有部分底层能力，但状态、接线或用户流程不完整；
- **REQUIRED**：本 brief 要求具备，但当前源码没有完整实现；
- **CONDITIONAL**：只有相关连接或运行能力存在时才适用。

设计稿不得把 `REQUIRED` 或 `PARTIAL` 画成已经验证成功。未实现状态可以设计，但必须使用“尚不可用”“需要配置”或“无法验证”等诚实语义。

## 2. 用户心智与术语边界

用户只需要理解下面六个概念。

| 用户概念 | 它回答的问题 | 必须避免的混淆 |
| --- | --- | --- |
| 工作入口 | 我现在要去哪里完成任务？ | Chat Studio、Composer、AI Search、File Atlas、Agent 和媒体生成是不同任务入口，不是 Provider。 |
| 连接 | Peak 可以调用谁？ | 对普通用户统一叫连接；内部 `Profile` 不作为一级用户术语。 |
| 模型 | 这个连接中有哪些可用模型？ | 模型不是账户，也不是工作入口。 |
| 任务默认 | 某类工作默认由哪个连接和模型负责？ | 不向普通用户暴露 quick/deep/premium 等内部 tier。 |
| 工具 | AI 可以调用哪些外部能力？ | MCP、Web 和 Obsidian commands 是工具，不是模型。 |
| 安全 | AI 可以读什么、改什么，何时需要我确认？ | 权限不能藏在 Provider 或模型选择中。 |

在 Settings 信息架构中，连接、模型和任务默认属于同一个一级入口。它们是一条连续配置链：先建立连接，再查看连接提供的模型，最后决定各产品任务默认使用什么；三者在同一页面内分层呈现，但不能合并成同一个概念或同一张无结构列表。

### 2.1 Connection 的内部类型

这些类型可以共享一致的用户概念，但验证方式和运行语义不同：

- **Direct API**：OpenAI、Anthropic、OpenRouter；
- **Local model service**：Ollama；
- **普通对话 + Agent runtime**：Codex、Claude Code；同一连接可以提供两类能力，但验证结果不能互相代替；
- **Media service**：OpenAI native media、fal.ai；
- **Advanced gateway / compatible endpoint**：LiteLLM、自定义 OpenAI-compatible endpoint；
- **其他直接服务**：Google、Perplexity，保留为 Settings 中的扩展连接。

AI Search Simulator 是开发与 QA 能力，不属于普通用户连接目录。

## 3. Peak 必须覆盖的产品能力地图

Onboarding 不需要逐项讲解这张地图，但设计师必须知道首次任务可能落到哪里，Settings 也必须覆盖相应依赖。

### 3.1 对话与创作

- **Chat Studio**：提问、总结、起草、连续对话、附件理解、工具调用；
- **Composer**：打开和编辑文档；
- **Composer Copilot**：基于当前文档或选区进行改写、审阅、生成和操作；
- **Composer Intelligence / History**：查看建议、分析、变更记录和运行结果；
- **Quick assist**：不要求用户先进入复杂工作流的轻量 AI 动作。

### 3.2 查找与理解

- **Vault / Quick Search**：本地关键词与结构化搜索；
- **AI Search / AI Analysis**：规划搜索、读取资料、生成报告、后续问答；
- **File Atlas**：浏览文件关系、邻域、集合、图谱与上下文；
- **Knowledge Index**：全文索引、语义索引、图结构、摘要和增强数据。

### 3.3 委派与执行

- **Peak Hermes / Agent / Wizard**：Peak 自己的 Agent harness，负责多步流程、工具循环、确认、停止、receipt 和结果呈现；
- **Codex / Claude Code connection**：既可以承担普通对话，也可以在明确工作目录、权限、预算和中断语义下提供 Agent 执行能力；
- **Skills**：为特定任务提供步骤、允许工具和产出规则；
- **MCP 与 Obsidian commands**：为 Agent 提供经过审批的工具。

Peak Hermes 不是 Provider 或模型。它可以使用普通模型连接完成 Agent loop，也可以选择 Codex、Claude Code 等具有 Agent 能力的执行路线。

### 3.4 文件与媒体

- **理解文件**：图片、PDF、视频内容理解；
- **音频转写**：音频以及必要时的视频音轨转写；
- **生成图片**；
- **生成视频**；
- **生成音乐**；
- **生成语音 / TTS**。

### 3.5 个性化与工作空间

- **Command Center**：组织和启动常用命令、文档和工作入口；
- **Ambient / Related Notes**：在写作或切换文档时提供相关内容；
- **用户偏好与内容位置**：默认打开方式、生成内容位置、历史与保留策略；
- **Usage 与 receipts**：让用户知道模型、成本、运行结果和失败原因。

## 4. Onboarding 总原则

### 4.1 必须遵守

- 每一阶段只要求当前成功所需的信息；
- 先自动检测，再要求用户输入；
- 首次路径只做必要决定，其他选择保留到 Settings；
- 默认值必须能完成真实任务，而不只是保存成功；
- 每次连接、索引或能力验证都立即发生，不延迟到用户真正使用时；
- 错误必须在当前流程中可以修复和重试；
- 用户始终知道当前目标、验证结果、下一步和剩余工作；
- 用户返回或中断后，已完成且仍有效的状态不得丢失；
- 跳过只允许发生在不阻塞所选首次任务的能力上；
- 重新运行 Onboarding 不得静默覆盖用户已经固定的模型、权限或路径选择；
- Onboarding 与 Settings 必须读写同一份配置和同一份 readiness 状态。

### 4.2 首次流程不应询问

除非用户主动要求手动控制，首次流程不询问：

- 月度预算档位；
- “速度还是质量”；
- bootstrap / starter model；
- raw model id；
- quick / deep / premium tier；
- temperature、top-p、top-k、penalties；
- chunk size、overlap、PageRank 参数；
- base URL、custom headers 等非必要底层字段；
- 所有可用 Provider 和所有模型的完整清单。

这些都可以在 Settings 中长期调整。

## 5. Onboarding 的完整能力流程

Onboarding 是一条目标驱动、可分支的流程，不等于固定页数。

```text
检测当前环境
  → 选择第一次想完成的任务
  → 补齐该任务真正缺失的连接或权限
  → 应用并验证可靠默认值
  → 验证该任务依赖的 Vault / Index / Media / Agent 能力
  → 打开真实工作入口并带入任务
  → 观察第一次成功或给出可恢复失败
```

### 5.1 阶段 A：检测当前环境

**目标：** 在提问之前知道用户已经拥有什么。

**P0 检测内容：**

- 是否已有已保存的连接；
- 每个连接最近一次真实验证结果；
- Ollama 是否可达、有哪些本地模型；
- Codex / Claude Code runtime 是否安装、是否可启动、是否已认证；
- 当前 Vault 文件数量和可索引文件数量；
- 本地 store 是否可用；
- 是否已有索引、已索引数量、最后成功时间；
- 是否有 missing / changed 文件；
- Embedding / semantic search 是否可运行；
- 当前是否有可打开的文档、最近文档或活动文档；
- 图片、视频、音乐、语音生成 route 是否可用；
- Web、MCP 和 Obsidian command 工具是否已连接；
- 上次 Onboarding 进度和已完成步骤是否仍有效。

**规则：**

- 检测失败应表示“无法验证”，不能推断为“没有”；
- 检测必须有超时；
- 本地检测不得上传 Vault 内容或凭据；
- 已验证且未失效的内容直接复用，避免重复输入；
- 任何缓存状态都要带最后验证时间，并允许重新验证。

### 5.2 阶段 B：确定第一次目标

**目标：** 让后续步骤只服务于一个真实结果，而不是让用户学习整个产品。

至少支持下面的首次目标：

1. 在 Chat Studio 问一个关于自己资料的问题；
2. 打开一篇文档并使用 Composer / Copilot；
3. 搜索或分析 Vault；
4. 用 File Atlas 探索文档关系；
5. 运行一个 Agent / Wizard 任务；
6. 生成一张图片；
7. 稍后决定，由 Peak 选择最低摩擦的默认任务。

**内容要求：**

- 每个目标只解释最终能获得什么；
- 明确该目标是否需要云端连接、本地模型、索引或写权限；
- 用户更改目标后，保留已经完成且仍适用的配置；
- 不把完整功能介绍塞进这一阶段。

### 5.3 阶段 C：建立一个可用连接

**目标：** 只连接完成所选任务所需的一个可用能力来源。

**默认上线连接范围：**

- OpenAI；
- Anthropic；
- OpenRouter；
- Ollama；
- Codex；
- Claude Code。

**条件连接：**

- 如果首次目标是生成媒体，允许配置 OpenAI native media 或 fal.ai；
- Google、Perplexity、LiteLLM 和自定义 compatible endpoint 放在长期 Settings 中；
- 如果已有可用连接，允许直接复用；
- 不在首次流程暴露 Simulator。

**连接生命周期能力：**

1. 选择连接类型；
2. 获取所需凭据、地址或本地 runtime 信息；
3. 验证认证或本地进程；
4. 发现可用模型与能力；
5. 生成验证 receipt；
6. 将连接纳入任务默认；
7. 验证失败时原地修复、重试或更换连接。

**验证 receipt 至少包含：**

- 验证对象和连接类型；
- 认证是否成功；
- 实际发现的能力；
- 模型目录的来源与新鲜度；
- 验证时间；
- latency 或本地启动结果；
- 错误分类和可执行修复建议；
- 对 Agent runtime，额外包含版本、认证状态、工作目录与权限边界。

**成功条件：** API key 已保存不等于连接成功；只有一次不暴露用户内容的最小真实 probe 成功，连接才能进入 `ready`。

### 5.4 阶段 D：应用任务默认

**目标：** 系统自动给出能工作的默认路由，用户无需先理解模型生态。

系统根据已验证连接、任务能力、隐私条件和本地可用性自动处理：

- 为六个任务组确定默认连接与模型；
- 为组内任务建立继承关系；
- 为缺少能力的任务建立明确 fallback 或标为不可用；
- 保留用户已经固定的 override；
- 验证模型能力是否匹配任务；
- 记录默认值的来源和最后评估时间。

首次流程只需要告诉用户：

- 所选目标现在是否可用；
- Peak 将使用云端还是本地能力；
- 是否涉及 Vault 内容、外部工具或写操作；
- 哪些增强能力暂时不可用但不阻塞开始；
- 以后可以在 Settings 中修改。

首次流程不要求用户逐项选择 18 个 assignment。

### 5.5 阶段 E：验证任务依赖

不同首次目标只验证自己的阻塞依赖。

#### Chat Studio / Composer

- 至少一个 conversation-capable 模型可运行；
- 如带附件，模型或降级处理支持对应文件类型；
- Copilot 写操作采用明确的默认安全模式；
- 当前或最近文档可用时，能够建立真实文档上下文。

#### Vault Search / AI Search / File Atlas

- 本地 store 可用；
- text index 的真实覆盖率可读；
- missing / changed 文件数量可读；
- semantic 能力作为增强项独立判断；
- 索引更新不会被误写为必须从头 rebuild；
- 空 Vault 是合法状态，不是系统错误。

#### Agent / Wizard

- Agent runtime 或 Peak Harness 可运行；
- 模型支持工具调用或存在可用执行策略；
- 工作目录明确；
- 默认权限、确认规则和预算边界已确定；
- 至少一种停止 / 中断方式可用；
- 工具不可用时能说明影响而不是直接失败。

#### Media generation

- 对应 media kind 有可用 route；
- 凭据和模型已验证；
- 输出位置有效；
- 成本、时长或许可条件需要确认时已经处理；
- route 不可用时提供替代 route 或返回 Settings 修复。

### 5.6 阶段 F：启动第一次真实任务

**目标：** 把用户送进真实产品，而不是完成后进入空白页。

每个首次目标必须有真正的 handoff：

| 目标 | 必须完成的 handoff | 第一次成功事件 |
| --- | --- | --- |
| Chat Studio | 打开真实 Chat Studio，并带入一个可编辑的 Vault 相关问题 | 得到一次有效回复，或得到清楚、可恢复的失败原因 |
| Composer / Copilot | 打开当前文档；没有当前文档时选择最近文档 | 生成一次预览、建议或安全的 Copilot 结果，不自动写入用户内容 |
| Vault / AI Search | 打开真实搜索入口，并带入一个可编辑 query | 返回至少一组结果，或明确告诉用户 Vault 为空 / 索引缺失及修复方式 |
| File Atlas | 打开真实 File Atlas 上下文 | 成功加载当前或推荐文档的可浏览关系数据 |
| Agent / Wizard | 打开真实任务入口并带入一个安全的入门任务 | 产生计划、结果或 receipt；需要写操作时先请求确认 |
| Image generation | 打开真实生成流程并带入一个可编辑 prompt | 生成并保存一份可定位的图片，或返回可恢复失败 |

需要区分两个事件：

- **Setup complete**：必要配置已验证并持久化，目标工作入口已成功打开，任务已带入；
- **First success**：用户在真实工作入口中收到最小可用结果。

产品不能用“关闭 Onboarding”代替这两个事件。若第一次任务失败，用户的配置进度仍应保留，并提供重试、修复或换目标。

### 5.7 中断、返回与重新运行

- 每个已完成阶段持久化结果和验证时间；
- 重开 Obsidian 或插件后可以继续；
- 返回前一步不会清空后续仍然有效的内容；
- 连接、模型或索引实际变化后，只使受影响阶段失效；
- 重新运行 Onboarding 先读取现有 Settings；
- 用户固定的模型、权限、路径和数据策略默认不被覆盖；
- 如果建议覆盖现有值，必须先解释影响并取得确认；
- 用户可以从 Settings 针对某个问题进入修复流程，而不必重跑全部步骤。

## 6. Onboarding 分支与失败恢复

### 6.1 必须覆盖的常见分支

- 已有一个 verified connection；
- 有多个连接，部分失效；
- 只想本地使用 Ollama；
- 有 OpenRouter 但目录获取失败，只能使用有时间戳的缓存；
- Codex / Claude Code 已安装但未认证；
- Agent runtime 已认证但工作目录不可用；
- Vault 为空；
- Vault 很大，索引仍在后台处理；
- 已有 text index，但没有 embeddings；
- 已有 index，只有少量 changed files；
- SQLite store 无法初始化；
- 媒体 route 不可用或许可未确认；
- 用户中途退出或网络中断；
- 用户撤销凭据或模型已经下架；
- 产品升级后配置 schema 需要迁移。

### 6.2 错误内容契约

每个错误至少说明：

1. 失败的是哪项能力；
2. 用户仍然可以做什么；
3. 最可能的原因；
4. 一项主修复动作；
5. 其他可选动作，例如重试、更换连接、使用本地 fallback 或稍后处理；
6. 修复后系统会重新验证什么；
7. 是否保留现有进度和数据。

禁止只显示 raw error、HTTP code 或“Something went wrong”。技术细节可以保留给 diagnostics，但普通错误首先要可执行。

## 7. Settings 总原则

### 7.1 Settings 必须回答的七个问题

用户进入 Settings 后，应能回答：

1. Peak 现在是否可用？
2. 哪些连接正常，哪些需要处理？
3. 每类任务默认使用什么？
4. Vault 是否可搜索，Index 是否新鲜？
5. AI 可以使用哪些工具、读取什么、修改什么？
6. Peak 把数据保存到哪里、保留多久？
7. 我刚做的修改是否保存、何时生效、能否撤销？

### 7.2 内容分层原则

- 高频且影响明确的内容优先；
- 低频但有真实 consumer 的设置仍然保留；
- 高级程度由影响范围、风险和理解成本决定，不由“普通 / 专业用户”身份决定；
- 同一项设置只有一个权威位置，但可以被搜索、状态入口和错误修复链接到；
- 用户可以搜索自然语言、旧名称、Provider 名和功能名，定位到具体设置；
- 内部参数只有在确实改变用户可观察行为时才暴露；
- 无真实 execution consumer 的字段不得伪装成已生效；
- 所有设置都说明影响对象、默认值、保存状态和生效条件；
- 每个能力都提供恢复默认值或回到自动选择的方式。

## 8. Settings 完整能力清单

下面定义完整内容范围，不规定这些内容如何排版或导航。

### 8.1 系统状态与 Setup（P0 · PARTIAL）

**用户问题：Peak 现在能不能用，哪里需要处理？**

必须具备：

- 整体 readiness 结论；
- Chat / conversation readiness；
- Knowledge Index readiness；
- Search readiness；
- Agent readiness；
- Media generation readiness；
- Web / tools readiness；
- 默认 safety 状态；
- 最近一次成功验证时间；
- 当前正在运行的 setup、index、migration 或 validation；
- 每个问题的影响范围和修复入口；
- 继续、重新运行或局部修复 Onboarding；
- 版本或 schema migration 需要用户处理时的状态；
- 不能验证时的诚实状态。

这里是状态入口，不应复制所有详细配置。

### 8.2 Connections、凭据与运行能力（P0/P1 · PARTIAL）

**用户问题：Peak 可以调用谁，每个连接是否真的正常？**

#### P0 上线连接

- OpenAI direct API；
- Anthropic direct API；
- OpenRouter gateway；
- Ollama local service；
- Codex conversation 与 Agent runtime；
- Claude Code conversation 与 Agent runtime。

#### P1 / 条件连接

- Google；
- Perplexity；
- LiteLLM；
- 自定义 OpenAI-compatible endpoint；
- OpenAI native media；
- fal.ai media service；
- 同一 Provider 的多个账户或 endpoint。

#### 每个连接的通用能力

- 新增；
- 编辑显示名称；
- 设置或更换认证信息；
- 设置 endpoint；
- 启用、停用、重新验证；
- 查看连接类型和能力；
- 动态发现模型；
- 查看目录来源、新鲜度和缓存状态；
- 查看最后验证 receipt；
- 查看哪些任务正在使用该连接；
- 处理失效凭据、限流、余额、网络和模型下架；
- 删除前展示受影响的任务和 fallback；
- 凭据撤销与本地清除；
- 多实例时明确每个实例的用途。

#### Agent runtime 额外能力

下面这些状态只适用于连接的 Agent 能力；普通对话能力需要单独做 conversation probe。

- 安装 / 可执行文件检测；
- 版本检测；
- 登录 / 认证状态；
- 工作目录策略；
- session 创建、恢复和结束；
- 工具与写权限；
- 事件流与 receipt；
- 停止、中断和超时；
- runtime 更新或不兼容提示。

当前源码已支持 Anthropic、OpenAI、Google、Perplexity、Ollama、OpenRouter、LiteLLM、custom 和 Simulator 类型的 Provider profile；Codex 与 Claude Code adapter 仍是 `REQUIRED`，设计不得写成当前已经 ready。

#### OpenRouter 模型目录

插件不应要求每个版本手工内置完整模型列表。目标方案是追踪一份由项目维护的在线 JSON，可以放在项目文件或 GitHub Gist，并保留本地可恢复副本。

- 在线 JSON 包含 schema version、生成时间、模型 ID、显示名、能力和下架状态；
- 请求优先使用 `ETag` 或 `Last-Modified`，内容未变化时不重复下载；
- 更新成功后保留 last-known-good cache，不用空响应覆盖有效目录；
- 网络失败时先使用带时间戳的有效缓存，再降级到随插件发布的 bundled fallback；
- Settings 显示目录来源、最后检查时间、最后成功更新时间和 stale 状态；
- 在线目录只决定候选信息，连接是否可调用仍需要独立的真实验证。

### 8.3 Models 与任务路由（P0/P1 · PARTIAL）

**用户问题：每类工作默认由谁负责，为什么这次用了这个模型？**

#### 六个任务组与 18 个 concrete assignments

1. **Conversation & writing（3）**
   - Chat Studio；
   - Composer Copilot；
   - Quick assist。
2. **Research & web（5）**
   - Research；
   - AI Search planner；
   - AI Search report writer；
   - Web search；
   - Stronger fallback。
3. **Knowledge processing（2）**
   - Knowledge embeddings；
   - Vault intelligence。
4. **Understand files（2）**
   - Image / PDF / video understanding；
   - Audio transcription。
5. **Agent work（2）**
   - Agent run；
   - Fast tool helper。
6. **Create media（4）**
   - Image generation；
   - Video generation；
   - Music generation；
   - Speech generation。

这 18 项表示 Peak 的任务职责，不是模型数量。当前 bundled catalog 有 113 个 LLM entries，其中 OpenRouter fallback catalog 有 55 个；媒体配置另有 image、video、music、TTS presets。OpenRouter 与 Ollama 的实际模型数量应优先来自动态 discovery，因此会变化。

#### 路由能力

- 每个任务组有一个自动默认；
- assignment 默认继承组值；
- 单项可以固定 override；
- 用户可以恢复为自动继承；
- 自动选择只修改未固定的 assignment；
- 每个 assignment 声明 required capabilities；
- 模型选择只允许兼容候选；
- 缺少能力时解释不兼容原因；
- 支持 fallback、Agent escalation 与固定模型运行的区别；
- Provider、模型或 runtime 失效后重新评估未固定项；
- 修改前显示受影响的功能；
- 修改后 receipt 记录 requested 与 effective model / route；
- 可以回答“这次为什么用了这个模型”；
- model id 变化、模型下架和动态目录过期有迁移与修复策略。

#### 模型候选需要表达的事实

- Provider / connection；
- 模型名称与 raw id；
- chat / embedding / media / runtime 类型；
- tools、vision、PDF、audio、video、web、reasoning、image generation 等能力；
- context 和 output 限制；
- 成本和可能的数据策略；
- 本地或云端；
- 目录来源与新鲜度；
- 当前任务匹配原因；
- 当前是否可验证。

#### 高级输出与路由控制

- temperature；
- top-p；
- top-k；
- presence / frequency penalty；
- reasoning effort；
- text verbosity；
- step timeout 与 total timeout；
- attachment handling；
- fallback 与 escalation；
- maximum escalations；
- escalation threshold；
- per-action override；
- base URL 与 custom headers；
- Provider-specific options。

这些参数只有在真实调用路径消费它们时才可用。旧 `promptModelMap` 当前没有被主要 query path 完整消费，不能设计成已经可靠生效的“逐 Prompt 选模型”。

### 8.4 Knowledge Index 与 Search（P0/P1/P2 · CURRENT/PARTIAL）

**用户问题：我的 Vault 是否可搜索，搜索覆盖和质量如何？**

#### Readiness 与日常控制

- SQLite / local store 状态；
- indexed / eligible 文件数量；
- coverage；
- missing 文件；
- changed 文件；
- last successful build / update；
- 当前 index mode；
- text search readiness；
- semantic readiness；
- pending vector / LLM enrichment；
- 当前 indexing 进度、阶段、预计影响和取消 / 继续能力；
- 推荐的最小修复动作；
- 自动检测并增量更新；
- 手动更新 changed files；
- 已有 index 的复用。

#### 内容范围

- 自动索引策略；
- 刷新间隔；
- Markdown、PDF、image、Excalidraw、CSV、JSON、HTML、DOCX、XLSX、PPTX、Canvas、URL 等文档类型；
- ignore patterns；
- 数据文件夹或生成内容的默认排除；
- 空 Vault 和不可读取文件的说明。

#### 搜索质量与 AI Analysis

- Fast / Semantic / Full Knowledge Index mode；
- embedding 连接和模型；
- Personalized PageRank；
- Inspector keyword / tag / folder links；
- folder grouping 参数；
- AI Analysis auto-save；
- AI Analysis output folder；
- 历史数量；
- saved analysis 是否排除在后续搜索之外；
- session / short / full summary lengths；
- Hub curation schedule 和 interval；
- AI Search 保存结果与历史策略。

#### 高级索引控制

- max chunk size；
- chunk overlap；
- minimum document size；
- code block handling；
- placeholder；
- max embedded code chars；
- vector enrichment；
- LLM enrichment；
- PPR comparison；
- full re-index；
- vector rebuild；
- graph maintenance 与 consistency verification。

**关键状态规则：**

- 已有 index 不得显示 `Not yet`；
- 没有 embedding 只表示 semantic 不可用，不表示 text index 不可用；
- `Scanning` 必须有进度、超时和失败状态；
- “0 个文件”必须区分空 Vault、未索引、读取失败和状态未知；
- changed files 不能只用 `Vault 总数 - indexed count` 推断；
- update、enrich、rebuild 是不同影响级别，不能混为同一动作；
- rebuild 等重操作必须先解释时间、成本、影响和恢复方式。

### 8.5 Tools、Web、MCP、Skills 与 Obsidian commands（P1/P2 · CURRENT/PARTIAL）

**用户问题：AI 可以使用哪些外部能力，我是否信任它们？**

#### Web

- Web provider / model；
- 连接与验证状态；
- 哪些任务会使用 Web；
- 关闭 Web 后的 fallback；
- 数据发送范围；
- Web 错误与限流修复。

#### MCP

- 新增 stdio 或 SSE server；
- command、args、env 或 URL、headers；
- 启用 / 停用；
- connecting / connected / disconnected / error；
- 发现的工具数量；
- server 错误；
- 工具权限和允许范围；
- 凭据与环境变量的隐私；
- 删除前的影响说明。

#### Skills

- Skills folder；
- 已发现 skill；
- skill 的允许工具；
- skill 是否可运行；
- 缺少工具或模型时的依赖说明；
- 用户自定义和内置 skill 的来源区别；
- 更新、禁用和冲突处理。

#### Obsidian command gateway

- 扫描第三方命令；
- available / conditional / unavailable 状态；
- read / edit / destructive / unknown 风险；
- 允许或拒绝；
- command 或 plugin 更新后的 stale review；
- per-run / always / none confirmation；
- system-blocked destructive command；
- 最近运行 receipt 与可观察变化；
- 重新扫描和重新审核。

MCP 是工具来源，Skill 是工作手册，Provider 是模型来源。Settings 不得把三者合并成同一类连接。

### 8.6 Media generation 与文件理解（P0/P1 · CURRENT/PARTIAL）

**用户问题：Peak 能否理解或生成这种媒体，输出会去哪里？**

#### 生成能力

- image；
- video；
- music；
- speech / TTS；
- auto / native / fal route；
- per-kind route readiness；
- OpenAI profile；
- fal.ai key；
- output / attachment folder；
- per-kind default preset；
- model override；
- aspect ratio；
- quantity；
- duration 与 maximum duration；
- voice；
- reference input 限制；
- validation receipt；
- last validated time；
- generation 成本与超时；
- music licensing acceptance；
- 失败后的 fallback 和结果定位。

#### 理解能力

- 图片 vision；
- PDF native input 或 text extraction；
- video native input 或降级处理；
- audio native input 或 transcription；
- attachment direct / degrade-to-text policy；
- 每种文件类型的模型兼容性；
- 降级后会丢失什么信息；
- 文件大小、格式和 context 限制；
- 不支持时的修复或替代动作。

生成模型目录与聊天模型目录是不同能力来源，不能因为 LLM catalog 有很多模型就假设媒体 route 已经可用。

### 8.7 Workspace 与产品行为（P1 · CURRENT/PARTIAL）

**用户问题：Peak 在我的日常工作空间中如何表现？**

#### Chat Studio

- conversation 默认模型的继承；
- 附件处理；
- Web 和工具可用性；
- conversation data root；
- 历史、receipt 和内容预览策略。

#### Composer / Copilot

- Markdown 默认打开方式；
- Composer Intelligence 的手动打开偏好；
- Copilot 默认模型与安全策略；
- 写入前确认；
- 历史与运行结果；
- custom prompts folder；
- attachment understanding。

#### AI Search / File Atlas

- Search 与 AI Analysis 的默认模型继承；
- 保存结果和历史；
- related links 与图谱质量策略；
- File Atlas / graph 的 MST depth、backbone-only、leaf opacity、leaf width 等真实可配置行为；
- 搜索或图谱不可用时的状态与修复。

#### Agent / Wizard

- 默认 runtime；
- 默认工作目录；
- 默认 safety mode；
- escalation、budget、hooks；
- run history、receipt 与中断策略。

#### Command Center

- 常用入口、文档、书签、workspace 和命令的组织；
- Home 内容与顺序；
- startup 行为；
- empty tab 行为；
- action 是否可用与不可用原因。

#### Ambient / Related Notes

- 总开关；
- writing pause 和 document switch trigger；
- cooldown；
- 最少编辑量；
- suggestion 数量；
- graph expansion hops；
- feedback learning；
- LLM explanation；
- status bar、serendipity gutter、morning briefing 等高打扰载体；
- 高打扰能力默认关闭或明确 opt-in。

#### Presentation

- code block theme；
- 只有产品真正支持时才提供 language、motion、density 或其他展示偏好；
- 不重复 Obsidian 已经统一控制且 Peak 没有独立行为的设置。

### 8.8 Safety、权限、预算与确认（P0/P1 · CURRENT/PARTIAL）

**用户问题：AI 可以做什么，什么时候会花钱或修改内容？**

必须具备：

- read-only；
- ask before changes；
- automatic apply / bypass 的高风险说明；
- 不同工具和 runtime 的权限边界；
- Vault 读写范围；
- Agent 工作目录；
- 外部网络和 Web 使用；
- MCP 与 Obsidian command approval；
- destructive operation system block；
- run-time escalation；
- maximum escalations；
- escalation threshold；
- hooks 开关与影响；
- monthly budget；
- budget reset day；
- budget threshold alerts；
- context compact alerts；
- expensive-agent-run receipts；
- 低成本提示的降噪；
- per-run cost、token、model 和 duration receipt；
- 权限或预算阻止任务时的修复入口；
- 恢复默认安全策略。

危险模式不能只用简短标签表达，必须说明它允许什么、影响哪些入口、如何撤回。

### 8.9 Data、Privacy、Usage 与文件位置（P0/P1 · CURRENT/PARTIAL）

**用户问题：Peak 保存了什么、保存在哪里、保留多久？**

#### 数据位置

- Peak / Chat root；
- plugin DataStore；
- Prompts；
- Custom prompts；
- Skills；
- Inbox；
- Attachments；
- AI Analysis output；
- generated media；
- resource summaries；
- hub summaries；
- user profile；
- 可重建 SQLite / index 与用户资产的区别。

#### Usage 与隐私

- usage tracking；
- usage detail retention days；
- prompt / response preview visibility；
- redacted 与 raw diagnostics 的区别；
- 本地数据与会发送到 Provider 的数据；
- credentials 的存储和清除；
- 删除、导出和迁移；
- 用户关闭 tracking 后哪些 receipts 仍为运行安全所必需；
- 当前占用、最后清理和保留策略。

#### 路径修改契约

- 修改前说明会影响哪些内容；
- 明确是立即生效、只影响未来写入，还是需要迁移；
- 迁移有进度、失败恢复和 receipt；
- 不静默删除旧位置的数据；
- 允许恢复默认路径；
- 防止路径互相嵌套、循环索引或把生成内容重新索引造成污染。

### 8.10 Maintenance、Diagnostics 与 Developer control（P2 · CURRENT/PARTIAL）

**用户问题：系统异常时如何检查和修复，精确运行参数在哪里？**

#### Maintenance

- 增量 index update；
- full re-index；
- rebuild vectors；
- run LLM enrichment；
- graph maintenance；
- index / graph consistency verification；
- orphan cleanup；
- cache / projection rebuild；
- reset 与恢复默认值；
- diagnostics export；
- 每项操作的影响、预计耗时、可取消性和 receipt。

#### Diagnostics

- debug trace off / redacted / raw；
- retention；
- Markdown / JSON / both copy format；
- raw content inclusion；
- 清理 traces；
- 最近失败与错误分类；
- Provider、Index、Media、Agent 和 Tool receipts；
- 当前 effective route / model；
- catalog freshness；
- store、runtime 和版本信息。

#### Developer-only

- SQLite backend；
- graph inspector；
- raw endpoint、headers 和 provider extras；
- exact output controls；
- exact timeouts；
- runtime hooks；
- per-action model overrides；
- internal migration / compatibility information。

Developer control 不应改变其他设置的可见性，也不能成为“进入高级模式”的总开关。

## 9. 共享状态真相

Onboarding、Settings、错误修复和运行前检查必须消费同一份状态投影。

### 9.1 Readiness 状态

- **checking**：正在真实检测，必须有超时；
- **ready**：核心能力已通过真实验证；
- **degraded**：核心任务可用，但某项增强能力缺失；
- **action required**：用户必须完成一个明确动作；
- **unavailable**：当前环境或连接不支持；
- **error**：检测或运行失败，可以重试或修复；
- **disabled**：用户明确关闭；
- **not applicable**：对当前任务无关。

`optional` 是能力对当前任务的重要性，不是运行状态；`configured` 也不等于 `ready`。

### 9.2 设置修改状态

每次修改必须能表达：

- 未修改；
- 正在保存；
- 已保存；
- 保存失败；
- 已保存但尚未生效；
- 需要重启；
- 需要重新验证；
- 需要 re-index / reprocess；
- 需要迁移；
- 已恢复默认值。

### 9.3 Receipt 最低内容

所有关键验证或重操作都需要 receipt：

- 操作或验证对象；
- 开始与结束时间；
- 请求的配置；
- 实际生效的配置；
- 状态；
- Provider / model / runtime / route；
- 影响范围；
- 警告与错误；
- 下一步或修复动作；
- 必要时的成本、token、duration 和数据写入位置。

## 10. Onboarding 与 Settings 的共同数据契约

### 10.1 同一份 Source of Truth

- Onboarding 创建的连接必须立即出现在 Settings；
- Settings 修复连接后，Onboarding readiness 立即更新；
- Index、Media、Agent 和 Tool 状态不得由两套静态文案分别维护；
- Onboarding 建立的自动默认与 Settings 的 task assignments 是同一份配置；
- Settings 中固定的 override 会被 Onboarding 识别并保护；
- 所有状态都有 evidence time 和 source；
- 修复完成后重新读取状态，而不是前端自行假设成功。

### 10.2 Inheritance 与 Override

- 默认值属于任务组；
- 组内 assignment 默认继承；
- 用户显式修改后变为 pinned override；
- 恢复 Auto 会重新加入继承；
- Provider 或模型变化只自动调整非 pinned 项；
- 删除连接前必须列出受影响的 group、assignment 和 fallback；
- 重新运行 setup 不覆盖 pinned 项，除非用户明确确认。

## 11. 设置变更和危险操作流程

### 11.1 普通修改

```text
用户改变值
  → 校验输入与依赖
  → 保存
  → 应用到真实 consumer
  → 验证 effective state
  → 告知已生效、延迟生效或失败
```

如果保存成功但 runtime 没有消费新值，状态必须是“已保存但未生效”或“当前不可用”，不能显示成功。

### 11.2 需要额外处理的修改

对于 re-index、restart、migration、runtime reconnect：

- 修改前说明额外操作；
- 用户确认后才开始；
- 保存配置与执行重处理分别记录；
- 后台运行可以被重新找到；
- 失败不丢失原配置；
- 完成后更新 readiness 和 receipt。

### 11.3 危险操作

删除连接、删除数据、rebuild、raw trace、bypass permissions 等必须：

1. 说明准确目标；
2. 说明影响范围；
3. 说明是否可恢复；
4. 检查依赖；
5. 要求明确确认；
6. 执行后给出结果 receipt；
7. 提供下一步修复或恢复默认值。

## 12. 设计师必须保留的内容层级

设计师可以自由组织视觉，但以下内容层级不得丢失：

1. **当前结论**：是否可用；
2. **证据**：最后验证时间、来源和有效状态；
3. **影响**：哪些任务可用或不可用；
4. **主动作**：最小修复或下一步；
5. **长期控制**：默认值、继承与 override；
6. **高级细节**：低频参数、raw 信息与 diagnostics；
7. **危险操作**：与普通修改明确分离。

同一个能力必须同时具备状态、配置、验证、恢复四类内容。只有“可编辑字段”没有健康状态，不算完整 Settings；只有状态没有修复和长期控制，也不算完整 Settings。

## 13. 设计自由与禁止项

### 13.1 设计师可以自由决定

- 页面或流程的数量；
- 信息如何分组；
- 导航和返回方式；
- 状态、表单、搜索和帮助内容的具体表现；
- 响应式、动效和视觉语言；
- 逐步展开的具体交互。

### 13.2 设计师不得改变

- Onboarding 的目标驱动顺序；
- 首次路径只要求最低必要决定；
- 所有 Ready 必须来自真实验证；
- 已有 Index 不得显示 `Not yet`；
- text index 与 semantic readiness 必须分开；
- Provider、Agent runtime、Tool 和 Skill 的语义边界；
- 六个任务组和 18 个 assignment 的产品职责；
- 自动继承与 pinned override；
- 原有真实设置不能因视觉简化而消失；
- 错误必须可修复；
- 修改必须显示保存与生效状态；
- 危险操作必须说明影响；
- Onboarding 完成后必须进入真实任务；
- Codex / Claude Code 未完成 adapter 前不得显示为已验证可用。

### 13.3 禁止的产品模式

- 用全局 Standard / Advanced 开关改变整套 Settings 内容；
- 把所有 Provider、所有模型和所有高级参数塞入首次流程；
- 用功能宣传代替任务选择；
- 用静态 success rows 代替真实检测；
- 用“API key 已填写”代替连接验证；
- 让 OpenRouter 的完整模型目录成为无筛选的首次决定；
- 让用户为同一任务在多个地方分别配置互相冲突的模型；
- 保存后无反馈；
- 修改后需要 restart / re-index 却不告知；
- 错误只能去日志排查；
- 完成后进入空白页面。

## 14. 上线验收标准

### 14.1 Onboarding

- 未阅读外部文档的新用户可以完成主要流程；
- 默认路径只要求一个首次目标和完成它所需的最低配置；
- 已有可用连接、Index 和本地 runtime 会被正确复用；
- OpenAI、Anthropic、OpenRouter、Ollama 的连接可以真实验证；
- Codex、Claude Code 在 adapter 完成后能够分别验证普通对话，以及 Agent 所需的安装、认证、权限和工作目录；
- OpenRouter / Ollama 候选来自带新鲜度的动态目录或明确标记的 fallback cache；
- 连接错误、Index 错误和媒体错误能在流程中修复；
- 已有 Index 显示真实数量、覆盖率和新鲜度；
- text search 可用但 semantic 不可用时，整体状态为 degraded 而不是 failed；
- 任意中断后进度可恢复；
- 关键操作在所有支持的可用空间中始终可到达；
- Onboarding 必须打开真实工作入口并带入任务；
- 产品能区分 setup complete 与 first success；
- 第一次任务失败不会清空配置进度。

### 14.2 Settings

- 用户能快速判断 AI、Search、Index、Agent、Media 和 Tools 是否正常；
- 所有 Ready 都有验证证据；
- 用户能用自然语言搜索到具体设置；
- 六个任务组和 18 个 assignment 的继承关系清楚；
- 当前 113 个 bundled LLM entries 不会被误解为只有少数模型，也不会无筛选倾倒给用户；
- 模型或连接不兼容时能解释原因和修复；
- 原有存在真实 consumer 的设置都有明确归属；
- 高频设置、低频设置和 Developer 参数可以同时存在，不需要用户先选择身份模式；
- 每次修改都能看出保存和生效状态；
- restart、re-index、migration 和 reconnect 会提前告知；
- 路径变更不会静默移动或删除用户内容；
- 危险操作与普通修改隔离，并有 impact、confirmation 和 receipt；
- 用户能恢复 Auto、恢复默认值或撤销仍可撤销的修改；
- 无真实 consumer 的设置不会显示为已生效。

### 14.3 内容迁移验收

在批准最终 UI 前，必须把当前 `MyPluginSettings`、Profile、Search、Harness、Media、Ambient、Command Center、MCP、Plugin Command Gateway 和 Debug Trace 字段映射到新设计：

- `kept`：保留并有真实 consumer；
- `renamed`：只改变用户术语；
- `moved`：改变内容归属但不改变语义；
- `derived`：不再由用户输入，改为系统计算；
- `deprecated`：确认无 consumer 后退役；
- `blocked`：字段存在但 runtime 尚未消费，不能宣称生效。

任何未映射字段都视为设计遗漏，不能通过“简化”默认删除。

## 15. 当前实现基线与设计注意事项

以下是 2026-08-09 源码核对结果，用于防止设计 overclaim：

- Onboarding 当前是 7 个 primary steps，并保留 bootstrap model、budget、speed / quality 和 Curator recommendation；目标流程要求将这些从默认首次决定中移出；
- Onboarding 的 Knowledge Index 与 System Check 当前仍读取静态配置 rows；它们不是 live readiness；
- 当前 `Ready to try` 的主操作只把 wizard 标为完成并关闭，没有可靠地打开并预填真实工作入口；
- Settings 当前主要分为 Overview、AI Setup、Knowledge Index、Tools、Media Generation、Advanced；这只是当前实现，不是本 brief 规定的最终结构；
- 当前 Provider profile 类型包括 Anthropic、OpenAI、Google、Perplexity、Ollama、OpenRouter、LiteLLM、custom 和 Simulator；
- 当前 Add Provider 会暴露 Simulator，普通用户流程应移除；
- 当前 bundled model catalog 有 113 个 LLM entries；所有条目都标为 LLM type，media route 另有独立配置；
- OpenRouter bundled fallback 有 55 个条目，Ollama 已有运行时 discovery；OpenRouter 仍需要动态 catalog 与 freshness contract；
- 当前主要用户模型 binding 仍以 Conversation、Fast Lookup、Research、Stronger 和 Knowledge Index 为主；18 assignments 是目标产品合同，不是当前 18 个已完整接线的独立设置；
- 当前 `getIndexStatus()` 能返回 built time、indexed count 和 basic readiness，但 changed-file、semantic coverage、pending enrichment 和完整 freshness 仍需更强投影；
- 当前 Knowledge Settings 已有 index mode、document types、ignore patterns、PPR、Inspector links、AI Analysis、chunking 和 rebuild controls；这些不能在 redesign 中丢失；
- 当前 Media Settings 已有 route、fal.ai、output folder、per-kind presets、OpenAI native profile、status validation 和 licensing；这些不能被合并成一个简单开关；
- 当前 Settings 数据还包含 Ambient、Usage、Composer、Command Center、graph visualization、MCP、Plugin Command Gateway、Storage 和 Debug Trace 等长期控制，其中一部分尚未完整出现在当前 Settings UI；redesign 必须做字段迁移审计；
- Codex、Claude Code adapter 当前没有完整实现；只能设计为待连接 / 不可用 / 需要安装，不能设计为 CURRENT ready；
- 旧 `promptModelMap` 未被主要执行路径可靠消费，不能把它当成已工作的 per-prompt routing。

## 16. 实现与验证边界

本次交付只定义能力、内容和流程：

> DESIGN REQUIREMENTS READY · TARGET UI MOCK AVAILABLE · PRODUCTION IMPLEMENTATION NOT STARTED · INTERACTION NOT VERIFIED

后续 UI 设计应以本 brief 为能力 source of truth。后续工程实施还需要单独完成：

- 共享 Readiness Projection；
- connection verification receipts；
- Codex / Claude Code adapters；
- dynamic OpenRouter catalog；
- 任务路由与真实 execution consumers 的收敛；
- Onboarding 到真实工作入口的 handoff；
- Settings 字段迁移矩阵；
- 真实 Obsidian 中的键盘、焦点、滚动、窄高视口和端到端验证。

## 17. 源码与文档依据

- `src/ui/view/onboarding/OnboardingStateMachine.ts`
- `src/ui/view/onboarding/HarnessOnboardingWizard.tsx`
- `templates/config/onboarding.json`
- `src/core/config/settingsTypes.ts`
- `src/core/profiles/types.ts`
- `src/core/profiles/presets.ts`
- `src/ui/view/settings/`
- `templates/config/models/model-catalog.json`
- `templates/config/media-generation.json`
- `src/service/search/index/indexService.ts`
- `src/core/types/ambient.ts`
- `src/core/command-center/types.ts`
- `src/core/types/mcp.ts`
- `src/core/types/plugin-command-gateway.ts`
- `docs/18-feature-provider-model-mcp-skills.html`
- `docs/24-infra-ai-model-routing.html`
- `docs/superpowers/specs/2026-07-30-ai-control-center-design.md`
- `docs/superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md`
