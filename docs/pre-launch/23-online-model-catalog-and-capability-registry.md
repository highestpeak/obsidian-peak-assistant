# 23 · 在线模型目录与能力证据收口

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 模型基础设施
>
> 状态：已登记，等待 Release Candidate 范围确认
>
> 来源：`codex://threads/019f9e94-6c7d-7173-b4f4-7ed6b5d4bb53`、`codex://threads/019fe6a9-b87e-7d83-9095-a3ea47c11d0f`
>
> 配置合同：[Settings configurable capability inventory](../superpowers/specs/2026-08-12-settings-configurable-capabilities-by-group.md)

## 任务目标

把当前分散的 bundled model JSON、TemplateManager Provider JSON、Ollama 运行时探测和未接线的 `ModelRegistry.syncFromServer()` 收口成一个可靠模型目录。目录既服务于用户的模型 picker，也为 Chat、媒体和 Peak Hermes 的自动路由提供带来源、时间和验证状态的能力证据。

本任务不是“下载一份更长的模型列表”。它必须解决目录更新失败、错误能力声明、离线启动、用户不想看到某些模型、同名模型难识别，以及 Agent 误选不支持工具模型的问题。

## 当前事实

- [x] `templates/config/models/model-catalog.json` 提供随插件发布的 fallback。
- [x] Provider JSON 可以在启动时由 TemplateManager 合并进内存 registry。
- [x] Ollama 可以从本地 `/api/tags` 探测模型并合并到内存目录。
- [x] `ModelRegistry.syncFromServer()` 可以按 Provider 请求远端 endpoint 并合并结果。
- [ ] 远端同步没有生产调用者、Settings 入口或启动调度。
- [ ] 远端结果不持久化；重启后丢失，也没有 last-known-good cache。
- [ ] 没有 `ETag` / `Last-Modified` 条件请求、严格 schema / semantic validation、原子替换、失败回滚和 freshness 状态。
- [ ] 没有统一的隐藏、用户别名和 capability override 持久化 / UI。
- [ ] 能力布尔值没有表达来源：模型原生、Provider 增强、本地转换、外部工具、用户覆盖或真实 probe。

## 1. 目录发布契约

- [ ] 使用项目控制的 HTTPS JSON endpoint；GitHub raw / release artifact / Gist 可以作为首期载体，但客户端只依赖稳定 URL 和数据合同。
- [ ] 根对象包含 `schemaVersion`、`catalogVersion`、`generatedAt`、Provider 条目和模型条目。
- [ ] 每个模型保留稳定 Provider ID、真实 API model ID、display name、状态、上下文 / 输出限制、价格、输入 / 输出 modality 与能力证据。
- [ ] 下载内容只作为数据解析，禁止执行远端脚本、HTML 或任意表达式。
- [ ] 目录变更通过 review、schema check、重复 ID 检查和能力语义校验后发布。

## 2. 客户端更新与离线恢复

- [ ] 首次使用 bundled fallback 立即可工作，不让在线目录阻塞启动。
- [ ] 后台使用 `ETag` / `If-None-Match` 和 `Last-Modified` / `If-Modified-Since` 条件请求。
- [ ] 新目录通过 schema 与 semantic validation 后，才原子写入 last-known-good cache。
- [ ] 网络错误、超时、404、认证失败、错误 JSON、未知 schema 和能力降级都不覆盖最后成功缓存。
- [ ] fallback 顺序固定为：有效在线缓存 → bundled fallback → Provider / runtime 可验证的局部发现。
- [ ] 显示当前来源、catalog version、最后成功检查、缓存年龄、失败原因和下一次重试；不能只显示 `Fresh`。
- [ ] Ollama 离线时保留上次已知模型，但明确显示不可达，不把缓存模型当成当前可调用。

## 3. 模型目录管理

AI & Models 只有一个 **Manage model catalog** 入口，管理以下同一类意图：

- [ ] 按 Profile / Provider、模型 ID、别名和 capability 搜索；
- [ ] 隐藏模型：从 picker 和 Automatic 候选中排除，不修改上游目录；
- [ ] 用户别名：只改善识别，不改变真实 API model ID；
- [ ] 能力覆盖：仅在自动发现不可靠时开放，显示风险、来源和最后验证；
- [ ] 恢复上游值、恢复单模型默认或清除全部目录覆盖；
- [ ] 查看哪些 feature / action 当前引用该模型，避免隐藏或删除后留下无解释绑定。

Provider 详情可以显示目录摘要并跳转到这个入口，但不能再保存另一份隐藏 / 别名 / capability override。

## 4. 能力证据与 Peak Hermes 门禁

- [ ] 能力不是一个来源不明的布尔值。每项记录 `supported / unsupported / unknown`、来源、更新时间和可选 probe receipt。
- [ ] 至少覆盖 text、vision、audio、video、PDF / file input、tools、tool-result continuation、structured output、reasoning、embedding、image generation / editing 和上下文限制。
- [ ] OpenRouter 需要区分模型原生能力、Provider server tools / plugins 与 Peak 本地转换；目录声明不能代替 request adapter 接线。
- [ ] Peak Hermes 的主执行模型必须通过工具调用、结果续接、结构化协议、上下文和流式稳定性验证；未知或过期证据 fail closed。
- [ ] 不支持 tools 的模型仍可作为 Hermes 明确隔离的纯总结 / 改写子任务模型，不能进入需要工具的主循环。
- [ ] 能力 probe 不发送用户 Vault 内容；测试失败、限流和 Provider 暂时异常与“永久不支持”分开记录。

## 5. 与 Settings / Mock 的关系

- [ ] AI & Models 的连接区显示连接健康，不把 key 已保存当成模型能力可用。
- [ ] Manage model catalog 位于连接之后、Automatic 与 feature defaults 之前或附近，属于模型配置链的一部分。
- [ ] Advanced 只提供诊断跳转，不再拥有第二个 `Model catalog sources` 设置。
- [ ] 每个 model picker 使用同一目录、隐藏和别名结果；Agent picker额外应用 Hermes capability gate。
- [ ] Provider 原生媒体 route 只有在当前连接与模型具有对应能力时出现；无能力时不渲染空选项。

## 6. 验证

- [ ] focused tests：304、更新、损坏 JSON、未知 schema、缓存写入失败、回滚、超时和离线启动。
- [ ] migration tests：已有 bundled / custom model ID、手动 feature 绑定、隐藏 / 别名覆盖升级后保持可解释。
- [ ] routing tests：tools / vision / PDF / media 能力未知、过期、冲突与 probe 失败时不会被 Automatic / Hermes 错选。
- [ ] security tests：目录不能覆盖 credential、Base URL、执行代码、内部 prompt、权限或工具 allowlist。
- [ ] UI tests：搜索、隐藏、别名、恢复、目录来源、新鲜度、键盘选择和失效绑定修复。
- [ ] 生产 build 与真实 Obsidian 验收：断网启动、目录刷新、重启恢复、OpenRouter / Ollama picker 和 Hermes 模型筛选。

## 完成条件

- [ ] 在线更新、持久缓存、fallback 和恢复形成一个可解释闭环。
- [ ] 模型隐藏、别名和能力覆盖只有一个正式 owner，且所有 picker 消费同一结果。
- [ ] OpenRouter / Ollama 目录状态不会把缓存、离线或静态 fallback 假装成实时可用。
- [ ] Peak Hermes 不会因为陈旧或缺失的能力声明选择不支持工具的主执行模型。
- [ ] mock、Settings 文档、生产实现和公开主张使用同一套状态名与能力边界。

## 不要做

- 不把远端 JSON 当作远程代码或无校验配置注入。
- 不在每次打开 picker 时阻塞等待网络。
- 不让 Provider 目录覆盖用户隐藏、别名或手动绑定。
- 不以静态模型名猜测工具、视觉或结构化输出能力。
- 不在 Provider 详情、Advanced 和 model picker 中分别保存三份目录偏好。
