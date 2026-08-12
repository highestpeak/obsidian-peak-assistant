# Peak Assistant Settings、Onboarding 与 Knowledge Index 首发核心路径实施记录

> - 日期：2026-08-13
> - 分支：`codex/onboarding-settings-knowledge-index`
> - 状态：首发核心路径源码完成；真实 Obsidian 交互、失败注入与 P1 enrichment 未完成
> - 产品契约：[最终设计](../specs/2026-08-13-onboarding-settings-knowledge-index-final-design.md)
> - 完整任务：[实现任务与验收计划](./2026-08-13-onboarding-settings-knowledge-index-implementation.md)
> - 配置总表：[Settings 可配置能力总表](../specs/2026-08-12-settings-configurable-capabilities-by-group.md)

## 1. 本轮交付结论

本轮把已经确认的产品结构从静态设计推进到生产源码。Settings、Onboarding 和 Knowledge Index 不再各自发明 Provider、模型、索引或安全概念，而是共享同一配置和 runtime owner。

这次可以称为“首发核心路径源码完成”，不能称为“全部上线验收完成”。原因是标准 Agent Skills、完整 MCP、capability probe、非 Markdown enrichment、真实 Obsidian 交互和 dogfood 仍在开放范围内。

## 2. 用户现在得到什么

### 2.1 Settings

一级结构固定为：

1. `AI & Models`
2. `Agents`
3. `Knowledge & Search`
4. `Advanced`

页面保留 Obsidian 原生 Settings 左侧栏。Peak 内容区使用居中水平分类，不再提供 Peak 私有侧栏、Overview、Features、全局 Standard / Advanced 模式或没有明确价值的常驻搜索。

`AI & Models` 现在形成一条连续路径：

- 管理 OpenAI、Anthropic、OpenRouter、Ollama、Codex 和 Claude Code 连接；
- 从真实 Profile 和模型目录构造统一选择项；
- 通过同一个可搜索、按连接分组、按能力过滤的 Provider → Model picker 修改模型；
- 在产品功能和具体动作两层设置 Automatic 或固定模型；
- 配置 Chat Studio 附件策略和媒体生成路线；
- 在页面末尾进入 AI Control Center；
- 集中配置 OpenRouter catalog、隐藏模型和别名。

`Agents` 只描述 Peak Hermes：

- Peak Hermes 是唯一 runtime；
- execution model 使用统一模型 picker，并要求工具能力；
- 默认安全模式是 `Ask every time`；
- Web、MCP、Skills、Obsidian commands 和 external plugin commands 有独立开关与入口；
- Command Gateway 是外部插件命令的独立审阅面；
- runtime 会消费工具开关、权限模式和主要 permission scope。

`Knowledge & Search` 只保存长期默认：

- 文件类型；
- include folders；
- ignore patterns；
- 自动更新、change debounce、启动行为、batch 和 retry；
- embedding、summary length、chunking；
- Inspector Links、AI Analysis auto-save 等长期搜索行为；
- 当前进度只做摘要，并跳转到独立 Index Workspace。

`Advanced` 收纳低频控制：

- Data root；
- Media root；
- privacy / retention；
- workspace appearance；
- diagnostics 与 maintenance；
- Better SQLite 只显示状态和修复，不提供 backend 选择。

### 2.2 模型目录与 OpenRouter

OpenRouter 动态目录使用一个项目控制的 JSON：

- 必须是 `schemaVersion: 1`；
- 可带 `catalogVersion`；
- 通过 `ETag` 和 `Last-Modified` 做条件请求；
- 304 保留当前 cache；
- 网络失败或 JSON 校验失败时保留 last-known-good；
- 首次没有 cache 时仍可使用 bundled catalog；
- Settings 显示上次检查时间、版本和错误；
- 启动后超过 24 小时会后台刷新。

隐藏模型和别名使用稳定的 `profileId:modelId` identity。别名不修改 Provider 实际 model ID。

### 2.3 Knowledge scope

首发索引类型固定为：

- Markdown
- PDF
- Images
- Excalidraw
- Plain text
- CSV
- JSON
- HTML
- Canvas

DOCX、PPTX 和 XLSX 不进入这份首发 index scope。Peak Sheet 与 AI Graph 使用自己的数据和索引策略，不冒充普通文档 loader。

include folders 与 ignore patterns 已进入相同的 path predicate，并被 full scan、incremental update、删除检查和 Index Workspace preview 使用。文件夹匹配按 path segment 处理，避免 `Notes` 错误匹配 `Notes-old`。

### 2.4 Knowledge Index Workspace

Index Workspace 是单页长任务工作面：

- 页面顶部是可折叠 run setup；
- 没有 active run 时先配置，开始后自动折叠；
- Full-text 永远建立；
- Embeddings、Markdown summaries、AI topic / functional tags、graph ranking / hub maintenance 可按本次 run 独立选择；
- local keywords、已有链接 / tags / folder relations 和文本抽取明确标为系统自动产物，不提供假开关；
- PDF / image / Canvas summaries、OCR、视觉描述、实体和更多图产物显示 `In development`，不可点击。

运行时展示：

- 当前阶段、百分比、文档数；
- 当前速度、预计剩余时间、已用时间和剩余文档；
- 按实际 scope 统计的文件类型饼图与详情；
- 排序后的文档队列、当前位置和当前文档；
- pause、resume、cancel、rerun；
- 失败阶段、失败路径、错误文本和 retry 入口；
- complete 状态和直接打开 Vault Search 的动作。

索引器现在按配置 batch size 扫描，按文档 retry，记录失败后继续处理其他文件。Fast onboarding run 只建立本地 FTS，不在背后偷偷执行全图维护。

### 2.5 Onboarding

Onboarding 使用五个可恢复步骤：

1. `Connect AI`
2. `Core models`
3. `Prepare vault`
4. `System check`
5. `Try Peak`

Fresh install、existing setup 和中途退出使用同一状态机：

- 初始没有连接时展示首发 Provider，完成配置后立即做真实 connection test；
- existing setup 复用现有连接和模型，但仍重新检查连接；
- Core models 只为 Conversation、Knowledge 和 Agent 选择最小必要模型；
- Agent 模型使用工具能力筛选；
- Prepare vault 自动检查并修复 Better SQLite；失败时不能继续；
- Better SQLite Ready 后启动最快的本地 FTS；
- System check 汇总连接、模型、SQLite 和索引，而不是显示静态 Ready；
- Try Peak 直接打开 Chat Studio、Vault Search、File Atlas、最近 Markdown 文档或 Composer；没有输入框，也不会结束在空白页。

进度草稿保存在同一个 `MyPluginSettings.onboarding` 中，完成后记录 `completedAt`。没有 onboarding-only Provider、模型或安全配置副本。

## 3. 运行时和安全边界

- `runAgentLoop` 即使调用方没有显式传 PermissionGuard，也会创建默认 `Ask` guard；不存在无 guard 的工具执行路径。
- Harness bridge 消费 Settings 的 safety mode、permission rules 和工具开关。
- Web、MCP、Skills 和 Obsidian command 可以从可用工具集合中被关闭。
- Agent execution model 同步到 ProfileRegistry 的 active agent config。
- 这不代表所有工具已经拥有完整 capability probe，也不代表旧 Agent 入口已经全部通过真实宿主验收。

## 4. 配置迁移与兼容

- 新 Settings schema 提供 model routing、catalog preferences、Harness settings、Knowledge scope 和 onboarding progress 的默认值与 loader normalization。
- 旧 Profile、active model 和 search 设置继续作为迁移来源；未知或损坏值回退到安全默认。
- legacy PPR 用户值不会重新打开已退役的 AI rerank UI；默认保持关闭。
- Better SQLite 仍使用现有 managed native module 目录和修复机制，不移动用户 Vault 内容。
- 本轮没有删除用户文档、旧 profile、旧索引数据库或历史数据。

## 5. 验证证据

已通过：

- `onboarding-state-machine`
- `settings-product-contract`
- `settings-model-routing-roundtrip`
- `unified-model-selection`
- `harness-settings-roundtrip`
- `harness-permission`
- `knowledge-index-scope`
- `openrouter-catalog`
- `b2-copilot-analysis-harness-wire-in`
- `index-initializer-port`
- `media-settings-overlay`
- `t11p-remaining-ui-app-tail-regression`
- production build、bundle syntax 和 simulator boundary

全量测试结果为 `485/489`。4 个失败均来自本轮未触碰的既有基线：

- `code-block-theme-settings`
- `composer-frontmatter-inline-tag-candidate`
- `generated-output-registry`
- `no-inline-llm-prompts`

仓库全量 TypeScript 检查仍被既有依赖声明和历史基线错误阻塞；对本任务新增与修改路径进行错误筛选，没有发现本任务路径的 TypeScript 诊断。本轮不会用扩大范围的方式顺手修复这些基线。

本机没有 Obsidian CDP listener，且真实 Obsidian 未从这个 isolated worktree 加载，因此以下保持 `INTERACTION NOT VERIFIED`：

- Settings 四 tab 的真实尺寸、滚动和主题；
- picker 的 click-toggle、outside click、Escape、keyboard 和 focus restore；
- Onboarding fresh / existing / repair；
- Better SQLite 下载与 ABI mismatch；
- 大 Vault 的 ETA、pause/resume、失败显示和 complete transition；
- launchpad 对真实产品 surface 的跳转。

## 6. 开放任务

### P0：发布门槛

- 为 Connection 与 Hermes 建立可持久化 Capability Evidence Service，区分静态声明、runtime metadata、probe、时间和失败。
- 修复 Chat Studio direct / extract / summarize 附件路径，让设置真实改变发送上下文并写 receipt。
- 审计所有 Agent / Wizard 入口，证明没有绕过 Peak Hermes、Settings safety 或 default guard 的路径。
- 为 index failure 增加 failed-only retry 与持久 run history，避免 retry 必须重跑整次任务。
- 完成旧配置 migration / orphan 引用 / rollback 测试。
- 执行 API key、timeout、OpenRouter invalid JSON / offline、Ollama offline、SQLite ABI、不可写目录和单文档失败注入。
- 在真实 Obsidian 完成 light / dark、窄面板、长目录、empty / large Vault、fresh / existing / repair 全流程 QA。

### P1：完整产品范围

- Provider-specific advanced model controls 和 ignored / rejected 参数 receipt。
- 标准 Agent Skills：`SKILL.md`、progressive disclosure、scripts、references、assets、迁移与 quarantine。
- MCP Streamable HTTP、认证、health recovery、Resources / Prompts 判决和逐工具信任。
- PDF summaries、image summaries、Canvas / Excalidraw summaries。
- scanned PDF OCR、image OCR、visual description。
- people / places / dates、inferred date、semantic similarities、communities 与更细 enrichment progress。
- Hermes durable recovery、完整 run receipt、budget / cost / timeout policies。

### P2：体验与运维

- OpenRouter catalog 正式发布地址、签名 / checksum、观测和回滚工具。
- onboarding completion、first searchable、first success、repair success 与 ETA error 的本地产品指标。
- Index run history、对比、导出诊断和 failed-item selection。
- 长模型名、多语言和键盘导航的系统性可访问性回归。

## 7. 发布判决

本分支可以进入代码 review 和真实宿主验收。它不能直接被描述成“所有 Settings / Onboarding / Knowledge Index 能力已经完成”，也不能在 P0 QA、migration 和 failure injection 之前宣布上线准备完成。
