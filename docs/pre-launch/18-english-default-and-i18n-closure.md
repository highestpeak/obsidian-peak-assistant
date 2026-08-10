# 18 · English Default 与多语言配置收口

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0 · 大型语言收口
>
> 状态：待审计与实施
>
> 前置任务：[剩余功能完成与 Release Candidate 冻结](16-remaining-feature-closure.md)
>
> 下游任务：[README 与公开文档包](04-public-documentation-package.md)、[网站与首页演示视频](06-website-and-demo-videos.md)

## 核心决定

Peak Assistant 的默认产品语言为英文。默认产品体验和所有公开发布材料都必须使用经过人工复核的英文正稿，具体范围见下文。

多语言能力通过明确的 locale/config 边界提供，不能继续在业务逻辑中散落硬编码文案。首发版本可以只提供完整的英文资源，但架构必须允许以后增加经过验证的语言包。

“移除项目中的中文”不等于删除语言相关能力，也不能改写用户内容。需要保留的具体边界在中文命中分类与验证合同中列出。

## 1. 当前事实与需要确认的部分

已确认的项目约束来自 [AGENTS.md](../../AGENTS.md) 和 [Configurability convention](../conventions/configurability.md)：

- 项目规则禁止在逻辑文件中硬编码 i18n 字符串和多语言 regex。
- 配置型内容优先放入 `templates/config/`，并通过 `TemplateManager` 读取。
- Prompt 使用 `PromptId` 与 `PromptService`，不能散落在源码中。
- [公开仓库边界任务](03-public-repository-and-english.md)要求默认公开语言为英文，同时保护多语言处理能力。

实施前仍需确认：

- [ ] 当前是否已有统一 locale registry、translator、fallback 和持久化设置。
- [ ] 哪些 UI 文案已经配置化，哪些仍硬编码在 source、template 或 CSS content 中。
- [ ] 默认 Prompt 的语言和 AI 输出语言目前由谁决定。
- [ ] 网站、README、公开文档、workflow、测试和示例数据中有哪些中文命中。
- [ ] 哪些中文属于功能性 fixture、搜索规则或第三方样本，不能直接删除。

不要假设现有 `TemplateManager` 等同于完整 i18n runtime。必须先审计当前调用链和资源所有权，再选择最小且统一的语言架构。

## 2. 中文命中分类

对 first-party 项目文件执行 Unicode CJK 扫描。每个命中只能进入以下一种状态：

- [ ] **默认产品文案**：翻译为英文，并迁移到统一语言资源。
- [ ] **公开内容**：改写为经过人工复核的英文正稿。
- [ ] **源码注释、测试名称或维护说明**：改为英文。
- [ ] **可配置的非英文翻译**：移动到明确命名的 locale pack。
- [ ] **功能性多语言规则或 fixture**：保留并加入小型 allowlist，说明测试或运行理由。
- [ ] **用户数据或迁移样例**：不得自动翻译或改写；仅在安全、私有的 fixture 边界内保留。
- [ ] **第三方或生成内容**：确认所有权与发布边界，不把未知内容冒充 first-party 正稿。
- [ ] **私有 Owner 文档**：按[公开仓库边界任务](03-public-repository-and-english.md)移出公开项目或发布快照。

最终目标不是机械追求仓库中不存在任何 CJK code point，而是公开源代码、产品默认体验和 release artifact 中不存在无法解释的中文。

## 3. English Default 范围

以下 first-party 内容必须默认使用英文：

- [ ] Obsidian Command Palette 中的命令名称和描述。
- [ ] Settings、onboarding、按钮、菜单、tooltip、dialog 和表单。
- [ ] Notice、错误、警告、成功状态、空状态和恢复提示。
- [ ] Search、Graph、Composer、Chat Studio、File Atlas 和其他公开 surface 的标签。
- [ ] 默认 Prompt、agent instruction、template、profile 和演示数据。
- [ ] 日志中面向维护者的 first-party 说明和可操作错误。
- [ ] README、公开文档、贡献指南、License 周边说明和 GitHub template。
- [ ] Landing Page、metadata、视频字幕、截图内文字和发布帖子母包。
- [ ] build、release、migration 和 setup 脚本中的 first-party 输出。
- [ ] 源码注释、测试描述和 first-party fixture 文件名；功能性多语言 fixture 除外。

AI 默认 Prompt 可以使用英文，但 AI 最终回答语言不能被无条件锁死。用户明确选择的语言、当前会话语言或配置的输出语言应继续生效。

## 4. 目标语言架构

- [ ] 建立一个明确的 locale registry 和语言资源 schema。
- [ ] 将 `en` 定义为 canonical default 和最终 fallback。
- [ ] 明确语言选择来源、优先级、持久化位置和重启恢复行为。
- [ ] 所有产品文案通过同一个 translator/lookup 边界读取。
- [ ] 禁止 UI、service 和 runtime 各自创建第二套翻译 helper 或 label map。
- [ ] 缺失 key、无效 locale 和资源加载失败都回退到英文，而不是显示空白或 raw key。
- [ ] placeholder、数字、日期、快捷键、路径和变量插值具有一致规则。
- [ ] locale pack 可以独立增加、验证和移除，不需要修改业务逻辑。
- [ ] Settings 中只展示真正达到完整度和验收标准的语言。
- [ ] 若首发只提供英文，语言配置边界仍需可测试，但不能展示无法使用的空语言选项。

`templates/config/` 和 `TemplateManager` 是当前项目的配置约束，但 locale 资源的最终载体必须在审计后确定。不要为了遵守目录习惯，把高频 UI lookup 强行塞进不适合的 Prompt 或大 JSON 文件。

## 5. 分阶段实施

### Phase 0 · 建立基线

- [ ] 锁定 branch、commit、Release Candidate 和扫描范围。
- [ ] 生成中文命中清单，并按文件类型、产品 surface 和分类状态分组。
- [ ] 记录现有配置、Prompt、template、label map 和错误文案入口。
- [ ] 为现有英文默认行为和必要的中文处理能力增加 characterization tests。
- [ ] 建立临时 allowlist，并要求每项具有功能性理由。

### Phase 1 · 建立统一语言边界

- [ ] 定义 locale key 命名、schema、默认值、fallback 和插值合同。
- [ ] 在 app composition 层组装语言 runtime，避免 service module singleton。
- [ ] 建立 Settings 读取、保存和重启恢复流程。
- [ ] 建立缺失 key、无效资源和加载失败的英文 fallback。
- [ ] 为 translator、schema、fallback 和配置 roundtrip 添加测试。

### Phase 2 · 迁移产品文案

- [ ] 按公开 surface 分批迁移 UI、Notice、错误、空状态和恢复提示。
- [ ] 迁移默认 Prompt、template、profile、命令和维护者错误输出。
- [ ] 将业务逻辑中的 label map 和语言判断移到统一边界。
- [ ] 每完成一个 surface，运行 focused tests 并在真实 Obsidian 中检查正常、空、错和恢复状态。
- [ ] 删除被新语言资源替代的旧常量和兼容 helper，避免双系统长期共存。

### Phase 3 · 迁移公开内容

- [ ] 将 README、网站、公开文档和贡献指南改为英文正稿。
- [ ] 检查 workflow、GitHub template、release notes、演示数据和脚本输出。
- [ ] 重新录制或编辑仍显示中文默认文案的截图和视频。
- [ ] 将私有中文 Owner 文档移出公开仓库或发布快照。
- [ ] 对图片、视频、metadata、source archive 和 release artifact 再次扫描。

### Phase 4 · 多语言回归与删除旧路径

- [ ] 验证英文默认值、手动 locale 配置、缺失 key fallback 和重启恢复。
- [ ] 验证中文 Vault、CJK 路径、中文搜索、语言检测和多语言输入没有被破坏。
- [ ] 验证 AI 可以按用户明确要求使用非英文输出。
- [ ] 收紧 allowlist，只保留具有代码所有权和功能理由的命中。
- [ ] 删除临时迁移 adapter、重复资源和已失效的兼容路径。

## 6. 验证合同

### 自动检查

- [ ] 中文扫描覆盖 `src/`、`templates/`、`website/`、公开文档、测试、脚本和 workflow。
- [ ] 扫描排除项和 allowlist 有版本控制、Owner 和理由。
- [ ] locale schema、key 完整度、重复 key、无效 placeholder 和 fallback 具有测试。
- [ ] 默认安装、设置 roundtrip、语言切换和无效配置具有测试。
- [ ] focused tests、全量测试、TypeScript 检查和生产 build 通过，或 baseline failure 被精确隔离。
- [ ] 最终 release artifact 和 source archive 单独扫描，而不是只扫描工作区。

### 真实 Obsidian 验收

- [ ] 干净安装后所有默认可见文字为英文。
- [ ] 覆盖 onboarding、Settings、Command Palette、核心 views、modal、Notice 和错误恢复。
- [ ] 修改语言配置后，明确要求的 surface 生效并在重启后保持。
- [ ] 缺失资源或无效 locale 安全回退到英文。
- [ ] 中文 Vault 内容、文件名、搜索输入和 AI 请求仍可正常工作。
- [ ] 截图、视频和网站使用同一个最终英文版本。

## 7. 回滚与兼容

- [ ] 迁移按 surface 分批提交，使每批都能独立验证和回滚。
- [ ] 在新语言边界稳定前保留可控的旧行为对照，但禁止无限期双写或双 runtime。
- [ ] locale setting 需要版本化默认值和无效值恢复策略。
- [ ] 回滚代码不能损坏已保存设置、用户内容或 Prompt override。
- [ ] 如果语言迁移导致核心流程不稳定，先恢复英文默认可用性，再处理次要语言能力。

## 8. 完成条件

- [ ] 干净安装和默认配置下，所有 first-party 产品文字均为英文。
- [ ] 所有公开网站、README、文档、截图、视频和 release artifact 使用英文正稿。
- [ ] 业务逻辑中不存在未登记的硬编码中文或第二套翻译系统。
- [ ] 非英文只能存在于明确的 locale pack、功能性规则、测试 fixture 或用户内容边界。
- [ ] 每个保留的中文扫描命中都有 Owner、理由和验证。
- [ ] locale 配置、英文 fallback 和重启恢复通过自动与真实 Obsidian 验收。
- [ ] 中文 Vault、搜索和用户指定的非英文 AI 输出没有被误伤。
- [ ] Owner 能说明语言真值、配置入口、fallback 和新增语言包的方法。

## 不要做

- 不运行无边界的全仓库自动翻译或字符替换。
- 不翻译、删除或重写用户 Vault 内容。
- 不删除中文搜索、分词、语言检测或功能性 fixture。
- 不在建立统一语言边界后继续把英文文案硬编码回逻辑文件。
- 不为了显示“支持多语言”发布不完整、未经复核的语言包。
- 不让机器翻译未经人工检查就进入 UI、隐私、安全或错误恢复文案。
- 不让旧翻译 helper、新 locale runtime 和 TemplateManager label map 长期并存。
- 不因为 AI 可以快速迁移就跳过扫描分类、回滚和真实 Obsidian 验收。
