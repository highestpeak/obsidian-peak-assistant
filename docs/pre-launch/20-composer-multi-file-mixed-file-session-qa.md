# 20 · Composer 同一 Session 多文件与混合文件类型验收

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · Composer 条件式功能与真实验收
>
> 状态：待做生产能力判决；当前 Roadmap 仍列为 Backlog
>
> 前置任务：[剩余功能完成与 Release Candidate 冻结](16-remaining-feature-closure.md)
>
> 相关任务：[Owner Dogfood](05-owner-dogfood.md)、[Landing Page 类比定位](11-landing-page-comparison-positioning.md)、[AI 生成 HTML 与图片定位](12-ai-generated-html-image-workspace-positioning.md)

## 任务目标

验证 Composer 是否真的具备以下完整能力：用户在**同一个 task session** 中显式纳入多个文件，在这些文件之间持续导航，并对多个文件产生可审阅、可选择接受、可恢复的修改。测试还要覆盖首次公开版本实际支持的混合文件类型，而不是只在多个 Markdown 标签页之间切换。

本任务不是把“模型读取过多个文件”称为多文件编辑，也不是用多个独立 session 分别修改文件后拼出结果。如果生产链路尚未具备该能力，本任务的结果应是回到[剩余功能收口](16-remaining-feature-closure.md)完成实现，或从首次公开版本和宣传文案中移除对应主张。

## 1. 先做生产能力判决

当前证据只说明产品方向与设计目标，不能证明能力已经交付：

- [Roadmap](../roadmap.html) 仍把 `Multi-file Copilot workspace` 列为 Backlog。
- [Composer Intelligence Task Workspace](../superpowers/specs/2026-08-12-composer-intelligence-task-workspace-design.md) 定义了 task member documents、Task Documents 和跨文件 review navigation。
- [Composer Block AI Capability Contract](../superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md) 定义了 `ProposedChangeSet`、逐项审阅和 accepted transaction。
- [Composer implementation handoff](../superpowers/plans/2026-07-24-peak-composer-complete-implementation-handoff.md) 中的 `ComposerTransaction` 仍以单个 `documentId` 为提交单位。

测试前必须确认生产代码是否存在以下闭环：

- [ ] 一个稳定的 task/session identity 可以包含多个文件身份。
- [ ] UI 能显示 active file、task member files 和当前待审文件集合。
- [ ] 读取上下文文件与允许写入文件是两组显式边界。
- [ ] 一个 run 可以产生指向两个或更多文件的 typed changes。
- [ ] 每个文件的 change 都能定位到真实目标，并独立 accept、reject 或标记 stale。
- [ ] 每个已接受 change 都形成可定位、可解释、可回滚的独立 History transaction。
- [ ] 不同文件类型通过各自 adapter 处理，不把二进制或 native object 当作普通文本 patch。

能力判决只允许产生三种结论：

- **Ready for QA**：生产闭环存在，继续执行本文全部验收。
- **Implementation gap**：将精确缺口移入[任务 16](16-remaining-feature-closure.md)，完成后重测。
- **Out of release scope**：不实现，并移除 multi-file 或 mixed-file editing 主张。

## 2. 固定测试材料与权限边界

测试材料必须来自隔离 Vault，并记录每个源文件的路径、稳定身份、revision 或 SHA-256。文件类型以首次公开版本最终批准的 capability matrix 为准，不能因为 loader 已注册就假定可编辑。

### 基础组合

- [ ] Markdown A + Markdown B：证明同一个 run 能修改至少两个普通文档。
- [ ] Markdown + HTML：仅在 HTML Workspace 已真实交付时执行。
- [ ] Markdown + code source：仅在对应源码类型的 Code Source Workspace 已真实交付时执行。
- [ ] Markdown + image：文本修改与 image candidate/save-as-new 必须走各自合法路径。
- [ ] Markdown + Peak Sheet 或结构化数据：仅在 typed patch、持久化和恢复均已交付时执行。
- [ ] Markdown + PDF 或其他只读类型：验证它可以作为 context，但不会被误授予文本写入能力。

每组材料都要显式标记：

- [ ] 可读取的 context files。
- [ ] 允许写入的 files。
- [ ] 只读或不支持写回的 files。
- [ ] 每种类型预期使用的 preview、candidate 和 save/version 机制。

## 3. 同一 Session 核心流程

- [ ] 从文件 A 创建一个有稳定名称或 ID 的 Composer task session。
- [ ] 显式加入文件 B 和至少一个不同类型文件，不因打开无关文件而自动扩张 task membership。
- [ ] 在 A、B 和混合类型文件之间导航，再回到 A。
- [ ] 导航后 conversation、draft、task context 和当前 change 位置保持不丢失。
- [ ] 发起一个必须协调多个文件才能完成的任务，禁止拆成多个独立 session。
- [ ] 同一个 run 产生两个或更多带明确 file identity 的 changes。
- [ ] Review 按文件分组，并能定位到每个文件中的真实 target。
- [ ] 接受文件 A 的 change，拒绝文件 B 的 change，并对第三个 change 追加指令或重新生成。
- [ ] 关闭并重新打开 Composer，未完成的 task、change set 和当前位置可以安全恢复。
- [ ] History 能从 task/run 找到每个已接受 transaction，也能从 transaction 返回来源 task/run。

## 4. 混合文件类型规则

### Markdown 与纯文本

- [ ] diff 与真实 source range 对齐。
- [ ] 保留未知 Markdown、wikilink、代码块和原有换行格式。
- [ ] revision 漂移时 fail closed，不在猜测位置写入。

### HTML 与代码文件

- [ ] HTML 的 source、preview 和 bundle boundary 与产品实际实现一致。
- [ ] 代码文件保留编码、换行和语法结构。
- [ ] import/reference context 不自动变成写入授权。
- [ ] 多文件 patch 的每个目标都有独立 diff 和 revision guard。

### 图片与其他 native file

- [ ] 图片 AI edit 产生可审阅 candidate，并按已批准规则 save-as-new 或创建版本。
- [ ] 不用通用文本 patch 覆盖图片、PDF 或其他二进制文件。
- [ ] 只读类型只能贡献上下文、引用或 annotation，除非对应 writeback 已明确交付。
- [ ] 某个 adapter 不支持请求时，session 保持可用并清楚说明限制。

### Sheet 与结构化数据

- [ ] 修改使用 typed row/cell/schema operation，而不是无结构全文替换。
- [ ] preview、accept、revision、持久化和 rollback 对应同一个 canonical source。
- [ ] 一个结构化 change 失败时，不静默污染同一 session 中已经审阅的文档 change。

## 5. Context 与写入授权

- [ ] 将文件加入 task context 不等于允许修改它。
- [ ] 每个允许写入的文件都由用户显式选择，或由清晰的确认步骤加入 write set。
- [ ] 搜索结果、related files、imports 或 backlinks 不会自动扩大 write set。
- [ ] 每次 accept 都重新检查对应文件的 revision、权限和 adapter capability。
- [ ] Provider 只接收完成当前任务所需的内容，并遵循产品公开的数据边界。
- [ ] 从 task 移除文件后，旧 pending change 不得继续静默写入。

## 6. 冲突、事务与回滚

- [ ] 在生成后从外部修改其中一个文件，只有受影响 change 变为 stale。
- [ ] 未漂移文件的 changes 仍可继续审阅，不被无关冲突全部作废。
- [ ] 接受 A、拒绝 B 后，最终 source 和 History 与用户选择一致。
- [ ] Undo A 不撤销 B 的无关直接编辑，也不回滚另一个 session 的 transaction。
- [ ] 每个 accepted change 都有独立 inverse transaction 或等价可验证恢复机制。
- [ ] 如果提供 `Accept all`，它必须具有明确的原子性或失败补偿；否则不提供该入口。
- [ ] 任一文件提交失败时，UI 必须显示实际部分状态，不能把半成功显示为全部完成。

## 7. 失败与恢复

- [ ] 首 token 前取消。
- [ ] 多文件结果只生成一部分时 Provider 失败。
- [ ] 某一个文件 adapter 失败，其他 pending changes 保持可审阅。
- [ ] 文件被重命名、移动、删除或权限变化。
- [ ] 插件 reload、Obsidian 重启和 Composer leaf 关闭后恢复。
- [ ] session 中途切到不属于 task 的文件，再返回原 task。
- [ ] 用户关闭 task 时存在 pending changes。
- [ ] mixed-file 请求包含当前不支持的写入类型。

所有失败路径都要确认：

- [ ] canonical source 没有隐藏的数据损失。
- [ ] 已提交与未提交状态可区分。
- [ ] 恢复动作和限制对用户可见。
- [ ] 重试不会重复应用已经接受的 change。

## 8. 自动化与真实 Obsidian 证据

自动化至少覆盖：

- [ ] task member identity 与 active file 切换。
- [ ] context set 与 write set 分离。
- [ ] 一个 run 产生跨多个 file identity 的 `ProposedChangeSet`。
- [ ] 逐文件 revision conflict、accept/reject 和 History linkage。
- [ ] reload/replay 后恢复未完成 task。
- [ ] 每个首次公开支持类型的 adapter contract。

真实验收遵循 [Obsidian Real-UI QA](../conventions/obsidian-real-ui-qa.md)：

- [ ] 使用 CDP 建立精确 session、active file、revision、selection 和 review 状态。
- [ ] 用 DOM assertion 证明文件切换后 task、current change 和授权集合仍一致。
- [ ] 录制一段短视频，完整展示跨文件导航、逐文件 accept/reject 和 History/Undo。
- [ ] 对 mixed-file 路径保存最终截图、源文件 SHA 和变更后证据。
- [ ] mock、harness、source inspection 和绿色 build 只作为辅助证据，不代替真实 Obsidian 验收。

## 9. 对外能力分级

- **完整通过**：可以准确宣传同一 task session 的多文件编辑，以及本次实际通过的文件类型。
- **仅多 Markdown 文件通过**：只能宣传 multi-document Markdown editing，不能声称 mixed-file workspace。
- **多文件 context、单文件写入**：只能宣传跨文档上下文，不能宣传 multi-file editing。
- **仍为单文档能力**：公开文案限定为当前文档内的 Composer editing。

所有 Landing Page、README、视频和发布帖必须使用同一分级结论。文件类型不能写成笼统的 `any file` 或 `all files`，必须列出已验证范围和只读边界。

## 完成条件

- [ ] 能力判决和对应源码入口已记录。
- [ ] 同一 session 至少包含两个允许写入的文件，并由同一个 run 生成 file-specific changes。
- [ ] 至少完成一个已批准的跨类型组合；若首发不提供 mixed-file editing，已明确判定为不适用并收窄主张。
- [ ] context files 与 writable files 的边界经过正反例验证。
- [ ] 每个 change 具备逐文件定位、diff、accept/reject、History 和恢复证据。
- [ ] stale、部分失败、reload 和 rollback 路径已通过。
- [ ] 真实 Obsidian 视频、DOM 和 source revision 证据齐全。
- [ ] 对外能力分级已同步到 Landing Page、README、视频和发布帖任务。

## 不要做

- 不把“读取多个文件”写成“编辑多个文件”。
- 不用多个独立 session 冒充同一 task session。
- 不把多个 Markdown 文件通过扩大成所有文件类型均通过。
- 不让 task membership 或 related context 自动授予写权限。
- 不用通用字符串 patch 写入图片、PDF 或 typed structured data。
- 不用 mock、单元测试或 build 结果冒充真实 Obsidian 交互证据。
- 不让批量接受产生不可见的部分提交状态。
