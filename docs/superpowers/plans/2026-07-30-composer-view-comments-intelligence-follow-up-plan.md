# Composer 视图、评论与 Intelligence 状态后续改动计划

> 日期：2026-07-30
> 状态：PARTIAL · INTERACTION NOT VERIFIED
> 范围：Composer View、Native Markdown 本地入口、评论可见性、Intelligence 可见性与来源上下文
> 不包含：AI provider、候选写回协议、Chat Composer、CodeMirror 编辑实现

## 1. 结论

这轮不是重做 7 月 29 日的文件视图与 Intelligence runtime，而是在现有 file-bound
Composer 基础上修正入口和界面状态语义。

需要完成七项改动：

1. 新 Composer View 默认关闭评论。
2. Intelligence 第一次使用默认关闭，并记住用户最后一次明确打开或关闭。
3. 新建或恢复 Composer 时直接呈现最终布局，不播放从右向左的进入动画。
4. Intelligence 的打开来源写入 presentation/session/run 上下文，但不显示常驻“入口”标签。
5. Scope 与建议更新策略收敛到同一条紧凑上下文栏。
6. “当前 leaf 立即切换”与“以后默认打开方式”成为两个独立操作。
7. Native Markdown 提供可见的当前 leaf Composer 入口，不再只依赖右键菜单。

这些改动完成后，用户看到的是安静、可预测的文档界面；系统内部仍保留足够的来源信息，
用于恢复上下文和解释一次 AI run 为什么从这里开始。

## 2. Source of truth

发生冲突时按以下顺序判断：

1. 2026-07-30 owner 反馈；
2. [交互 mock](../../gstack/composer-view-state-and-intelligence-entry-2026-07-30/index.html)
   与同目录 [README](../../gstack/composer-view-state-and-intelligence-entry-2026-07-30/README.md)；
3. 本计划；
4. [7 月 29 日技术设计](../specs/2026-07-29-composer-file-view-routing-and-intelligence-state-design.md)；
5. [7 月 29 日实现说明](./2026-07-29-composer-file-view-and-intelligence-implementation-note.md)；
6. 更早的 Composer / Intelligence 设计材料。

本计划只覆盖最新反馈产生的增量。已经实现的 file-bound Composer、多 Composer tab、
`编辑视图 / 纯净阅读`、Frozen Run、候选生命周期和写回链路不重新设计。

## 3. 当前事实与目标差距

| 区域 | 当前代码事实 | 目标行为 |
| --- | --- | --- |
| 评论 | `ComposerRoot.tsx` 中 `commentRailOpen` 初始为 `true` | 新 Composer leaf 初始关闭；只有明确点击评论、评论锚点或新建评论时打开 |
| Intelligence | `ComposerRoot.tsx` 中 `intelligenceOpen` 初始为 `true` | 首次默认关闭；以后按 workspace 中最后一次明确打开或关闭恢复 |
| Intelligence 动画 | sidecar CSS 的打开 class 总是带位移 transition | 初始 mount 和恢复状态无动画；只有用户明确从关闭切为打开时播放 |
| 打开来源 | 当前没有统一的 presentation origin 数据模型 | 来源写入上下文并随 run 冻结；普通工具栏打开不显示来源标签 |
| Scope | 已移入 Copilot 内容区，但与建议更新策略分离 | Scope、当前范围值和建议更新策略共用一条紧凑上下文栏 |
| 当前视图切换 | Composer 只在 pane menu 提供“切到原生 Markdown” | Composer 工具栏提供可见的当前 leaf 切换动作 |
| Native Markdown 入口 | 只在 file menu 提供“切到 Composer” | Markdown leaf 右侧提供小型本地按钮；保留 menu 作为辅助入口 |
| 默认打开方式 | `UndoRedoBar` 中的 segmented control 修改 future-open policy | 明确标为“以后打开”；不得让用户误认为它会转换当前 leaf |

## 4. 状态所有权

### 4.1 状态表

| 状态 | Owner | 初始值 | 持久化规则 |
| --- | --- | --- | --- |
| 以后默认打开方式 | plugin settings | Native Markdown | workspace 持久化 |
| 当前文档 View 类型 | 当前 Obsidian leaf | 由打开策略解析 | 通过同 leaf ViewState 转换 |
| 评论面板可见性 | 当前 Composer leaf | 关闭 | 不写 workspace preference，不复制到其他 leaf |
| Intelligence 明确可见性偏好 | workspace settings | 关闭 | 只由用户明确打开、关闭或点击关闭按钮更新 |
| Intelligence 上下文临时打开 | 当前 leaf presentation | 关闭 | 不覆盖 workspace 明确偏好 |
| Intelligence 打开来源 | 当前 presentation/session | 无 | run 开始时复制进 receipt / Frozen Run |
| Intelligence Scope | workspace runtime | 当前文档 | 沿用现有 workspace state persistence |
| Copilot / History、焦点与滚动 | 当前 leaf | Copilot / 当前焦点 / 顶部 | leaf-local |

### 4.2 可见性规则

Intelligence 的“打开”必须分成两类：

- **明确打开**：用户点击 Composer 工具栏的 Intelligence 按钮，或点击侧栏关闭按钮；
  这类动作更新 workspace preference。
- **上下文打开**：用户点击自动建议、“问 Copilot”、评论交接或 History 深链；
  这类动作只临时打开当前 leaf，不修改 workspace preference。

因此：

- 首次使用时侧栏关闭；
- 用户明确打开后，新 Composer leaf 直接以打开布局呈现；
- 用户明确关闭后，新 Composer leaf 保持关闭；
- workspace preference 为关闭时，自动建议仍可临时打开当前 leaf；
- 关闭该上下文 sidecar 后，再打开新文档仍保持关闭。

评论不采用同样的 workspace preference。每个新 Composer leaf 都从关闭开始。

## 5. Intelligence 来源合同

### 5.1 内部数据

新增稳定的内部来源类型，名称可采用 `IntelligencePresentationOrigin`：

```ts
type IntelligencePresentationOrigin =
  | { kind: "automatic-suggestion"; findingId: string; blockId: string }
  | { kind: "ask-copilot"; blockId?: string }
  | { kind: "comment-handoff"; commentId: string; blockId: string }
  | { kind: "history-deep-link"; runId: string }
  | { kind: "native-editor"; filePath: string };
```

当前 leaf 保存 presentation origin。用户真正开始 run 时，把该值复制到：

- Copilot `FrozenRunContext`；
- `RunReceipt`；
- workspace `FrozenComposerRunEnvelope`。

来源是运行收据的一部分，不应只写 telemetry。

### 5.2 展示规则

- 工具栏打开：不显示“来源”“入口”或类似标签。
- 自动建议打开：焦点卡显示“来自自动建议”，并显示对应建议标题。
- “问 Copilot”打开：焦点卡显示来自当前正文块，并保留正文引用。
- 评论交接打开：焦点卡显示来自评论交接，并保留评论引用。
- History 深链：只在 run/detail 区域呈现，不污染主工具栏。

禁止恢复已删除的常驻 `入口 · 自动建议` chip。稳定 `kind` 只属于内部数据和 History
详情，不能直接当作产品标签输出。

## 6. 界面改动

### 6.1 Composer 顶部控制栏

左侧保留：

- `编辑视图 / 纯净阅读`；
- 紧凑的 `以后打开 · Composer / 原生 Markdown` preference。

右侧保留：

- `切到原生 Markdown`，转换当前 leaf；
- 评论按钮及数量；
- Intelligence 按钮；
- Undo / Redo。

“以后打开”只修改设置。“切到原生 Markdown”只转换当前 leaf。两者互不联动。

### 6.2 Native Markdown 本地入口

为每个 Markdown leaf 挂载一个 app-owned、leaf-local 的小型操作：

- 标签：`在 Composer 中打开`；
- 位置：Markdown 内容区域右上侧，不覆盖 Obsidian 原生工具栏；
- 行为：保存当前 Markdown buffer 后，在同一 leaf 转换到 Composer；
- 失败：恢复原 Markdown ViewState，并显示一次明确错误；
- 生命周期：leaf/file 变化时更新，leaf 关闭或 plugin unload 时清理。

实现应挂载在 Markdown leaf 容器，而不是插入 CodeMirror 文档内容，也不新增 production
Command Palette 命令。现有 file menu 入口继续保留作为辅助路径。

### 6.3 Intelligence 上下文栏

Copilot 顶部使用一条紧凑栏承载：

- `范围 · 当前文档 / 当前工作段 / 固定范围`；
- `建议更新 · 停笔后 / 手动`。

Scope 下拉继续承载：

- 选择当前文档；
- 选择当前工作段；
- 选择固定范围；
- 开始新工作段；
- 结束当前工作段。

History 不显示这条上下文栏。打开来源不放在这条栏里。

### 6.4 动画

- 初次 mount：无位移、无渐入。
- 按 workspace preference 恢复为打开：直接显示最终宽度，无动画。
- 用户点击 Intelligence 从关闭变为打开：播放一次 180ms sidecar transition。
- 用户明确关闭：允许对应的关闭 transition。
- `prefers-reduced-motion`：全部 transition 关闭。

当前 `.pk-sidecar-body > *` 的自动 content-enter 动画也必须避免在初次 mount 或恢复打开时
制造右移效果。

## 7. 实施任务

### Task 0：补 characterization tests

先锁定当前已工作的行为：

- 多 Composer tab；
- 默认打开策略；
- 同 leaf 转换和失败恢复；
- AI candidate 生命周期；
- Scope / Work Segment persistence；
- narrow drawer 和 source guards。

此任务不修改产品行为。

### Task 1：建立可见性 preference 与 presentation intent

修改范围：

- `src/core/config/settingsTypes.ts`
- `main.ts`
- `src/app/composer/DocumentComposerRuntime.ts`
- `src/app/composer/composeDocumentComposerRuntime.ts`
- `src/ui/view/composer/ComposerRoot.tsx`

完成条件：

- 新增默认值为 `false` 的 Intelligence 明确可见性 preference；
- runtime 通过 app composition 读写 preference；
- 明确打开和上下文打开走不同 intent；
- 不增加 service singleton 或第二套状态 store。

### Task 2：评论默认关闭

修改范围：

- `src/ui/view/composer/ComposerRoot.tsx`
- `src/ui/view/composer/chrome/CommentPanel.tsx`
- 相关 Composer UI tests

完成条件：

- 新 leaf、workspace restore 和 plugin reload 后评论不自动占宽；
- 点击评论总按钮、块评论数量或新建评论可打开；
- 关闭时清理 draft 和 active comment；
- 评论数据和高亮不被删除。

### Task 3：修正 Intelligence mount 与 motion

修改范围：

- `src/ui/view/composer/ComposerRoot.tsx`
- `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`
- `src/styles/composer-sidecar.css`

完成条件：

- 初始状态来自 app-owned preference；
- restore-open 不播放进入动画；
- 只有显式 closed-to-open transition 添加 motion class；
- desktop 与 narrow drawer 使用同一语义；
- reduced-motion 仍有效。

### Task 4：接入来源上下文

修改范围：

- `src/service/composer/intelligence/runSession.ts`
- `src/service/composer/intelligence/workspaceIntelligence.ts`
- `src/ui/view/composer/sidecar/SidecarContext.tsx`
- `src/ui/view/composer/sidecar/BriefView.tsx`
- 自动建议、“问 Copilot”、评论和 History 的调用入口
- `templates/config/composer.json`

完成条件：

- 所有 contextual open 通过一个统一 API；
- focus card 根据来源自然解释当前上下文；
- run receipt 和 Frozen Run 保存稳定来源及引用 ID；
- toolbar open 没有来源标签；
- 用户可见文案来自 config，不在逻辑文件硬编码。

### Task 5：合并 Scope 与更新策略

修改范围：

- `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`
- `src/ui/view/composer/sidecar/BriefView.tsx`
- `src/styles/composer-sidecar.css`
- `templates/config/composer.json`

完成条件：

- Scope 与更新策略位于同一行；
- 右侧不再留下大块无意义空白；
- History 不显示；
- 下拉能力和现有 Work Segment runtime 不变；
- 430px sidecar 与窄 drawer 无横向溢出。

### Task 6：分离当前 leaf 切换与 future-open preference

修改范围：

- `src/app/composer/DocumentComposerView.ts`
- `src/app/composer/ComposerDocumentRouter.ts`
- `src/ui/view/composer/chrome/UndoRedoBar.tsx`
- 新的 Native Markdown leaf-local affordance host
- `src/styles/composer.css`

完成条件：

- Composer 可见按钮立即切到当前 leaf 的原生 Markdown；
- Native Markdown 可见按钮立即切到当前 leaf 的 Composer；
- 两侧转换都验证 leaf identity 和 file binding；
- Markdown 转换前 flush 未保存 buffer；
- preference 控件只影响后续普通打开；
- 两种动作的标签、位置和视觉层级明显不同。

### Task 7：集成验证

自动验证：

```bash
npm run test -- test/composer-open-policy.test.ts
npm run test -- test/composer-owner-feedback-contract.test.ts
npm run test -- test/composer-workspace-intelligence.test.ts
npm run test -- test/composer-review-reload.test.ts
npm run test -- test/composer-view-lifecycle.test.ts
npm run test -- test/composer-sidecar-visual-contract.test.ts
npm run test -- test/shared-button-reset-defense.test.ts
npm run build
```

如新建测试，至少覆盖：

- manual preference 与 contextual open 的隔离；
- provenance JSONL round-trip；
- 初始无 motion 与显式 open 有 motion；
- comments default closed；
- visible current-leaf conversion actions。

## 8. 真实 Obsidian 验收

必须使用 CDP 确认以下场景：

| 场景 | 预期结果 |
| --- | --- |
| 第一次打开 Composer | 评论关闭，Intelligence 关闭，无横向布局动画 |
| 明确打开 Intelligence | 当前 leaf 播放一次进入动画，preference 变为打开 |
| 再打开另一个 Composer 文档 | Intelligence 直接处于打开状态，不播放进入动画 |
| 明确关闭 Intelligence | preference 变为关闭；新文档保持关闭 |
| preference 关闭时点自动建议 | 当前 leaf 临时打开并显示“来自自动建议”；新文档仍关闭 |
| 从评论点“问 Copilot” | 当前评论和正文 anchor 可定位；run receipt 保存来源 |
| 普通工具栏打开 | 不出现“入口”或“来源”常驻标签 |
| Composer 点“切到原生 Markdown” | 同一 leaf、同一文件立即切换；默认设置不变 |
| Native Markdown 点“在 Composer 中打开” | 未保存内容先保存；同一 leaf、同一文件切换 |
| 修改“以后打开” | 当前 leaf 不动；下一次普通打开采用新默认值 |
| 多 Composer tab | 文件绑定、标题和 Intelligence preference 都不串 leaf |
| 430px / narrow drawer | 无横向溢出；Scope 与更新策略可操作 |
| reduced motion | 不播放进入或关闭动画 |

实机证据至少记录：

- 当前 active leaf 类型与绑定文件；
- Intelligence 的 `data-open`、motion state 和 computed transform；
- 评论 rail 的 open state；
- workspace preference；
- contextual origin；
- 当前与下一次打开采用的 View 类型；
- console error。

## 9. 保护范围与停止条件

实施时不得：

- 重建 document/session registry；
- 改写 AI provider 或候选 materializer；
- 建立第二套 Intelligence runtime；
- 用 localStorage 代替 app-owned settings / runtime；
- 把来源做成永久工具栏 chip；
- 把 Native Markdown 按钮插入 CodeMirror 文档内容；
- 新增生产 Command Palette 入口；
- 修改 `src/ui/view/chat-view/components/Composer.tsx`；
- 用 fixture 或静态 mock 代替真实 Obsidian 验收。

若 Obsidian 公共 API 无法稳定支持同 leaf 可见按钮，保留 router 与 file-menu 的正确行为，
把 visible affordance 标记为 `PARTIAL`，记录宿主限制；不要通过脆弱的全局 DOM selector
或覆盖原生 view actions 假装完成。

## 10. 完成合同

只有满足以下条件才可标记 `COMPLETE`：

- Task 1–6 均已实现；
- focused tests 与 build 完成；
- 真实 Obsidian 的核心状态和同 leaf 切换完成 CDP 验收；
- 没有常驻“入口”标签；
- 旧的硬编码 `intelligenceOpen = true` 与 `commentRailOpen = true` 不再存在；
- implementation note 更新为最终状态。

若代码完成但缺少真实 Obsidian 证据，交付状态必须是：

```text
PARTIAL · INTERACTION NOT VERIFIED
```

## 11. 2026-07-30 实施结果

Task 1–6 已写入原工作区：

- 评论 rail 对每个新绑定文档默认关闭；
- Intelligence 明确偏好默认关闭，只有工具栏/关闭按钮会持久化；
- 自动建议、问 Copilot、评论交接、History 恢复和 Native Markdown companion
  使用 leaf-local presentation origin，不覆盖明确偏好；
- origin 冻结进 Copilot `FrozenRunContext`、`RunReceipt` 和 workspace
  `FrozenComposerRunEnvelope`，并随 JSONL replay 恢复；
- 初始 mount / preference restore 不带 sidecar transition，显式用户切换才添加 motion class；
- Scope 和建议更新策略已合并到 Copilot 的一条紧凑上下文栏；
- future-open preference 显示为“以后打开”，当前 Composer leaf 另有
  “切到原生 Markdown”动作；
- 每个原生 Markdown leaf 挂载 app-owned “在 Composer 中打开”按钮，同 leaf 转换仍由
  `ComposerDocumentRouter` 负责校验与失败恢复；
- 未新增 Command Palette 命令，也未修改 Chat Composer / CodeMirror。

自动验证：

- 本轮 16 项 Composer focused regression 全部通过；
- `composer-brief-design-contract` 已按新的紧凑上下文栏合同更新并通过；
- `npm run build` 通过；
- 全量测试 `366 passed / 370 total`，剩余 4 项与本轮前记录的既有基线一致：
  `chat-studio-message-state-ui`、`code-block-theme-settings`、
  `composer-architecture-source-guards`、`composer-frontmatter-inline-tag-candidate`。

真实交互尚未验收：当前 Obsidian 没有 CDP listener，且 owner 要求由其本人录屏。因此本轮
保持 `PARTIAL · INTERACTION NOT VERIFIED`，收到录屏后再对照第 8 节逐项确认。
