# Chat Studio 对话 Composer 输入框重设计范围锁定

> 状态：**设计与实施边界已整理，尚未授权编写生产代码**
>
> 日期：2026-08-06
>
> 面向：产品 owner、后续实现者、reviewer
>
> 核心决定：**只重新设计已有对话底部的 Composer 输入框，不改 Chat Studio 的任何其他区域。**

## 1. 一句话结论

这次工作的唯一产品对象，是用户打开一条已有对话后，中央消息时间线底部的那个输入框。

要做的是把它从当前偏生硬、占高不协调的输入区域，改成一个会根据阅读位置自适应、能看清下一条消息上下文、菜单和长内容检查都更顺滑的现代 Composer。Chat Studio 的外壳、导航、消息、项目页、右侧索引、数据和运行时语义全部冻结。

如果未来实现 diff 里出现了消息卡片、Chat header、左侧栏、右侧 Outline/Resources、Project Home、Chat 起始页或 Chat 数据结构的视觉/行为变化，该实现即视为越界，不能以“顺便统一风格”为理由合入。

## 2. 本文的权威范围

对于本次输入框重设计，冲突时按以下顺序判断：

1. owner 在 2026-08-05 至 2026-08-06 对“只改输入框”的最新反馈；
2. 本范围锁定文档；
3. 当前生产源码和运行时真值；
4. `2026-07-15-chat-studio-complete-implementation-spec.md` 中既有 Composer 行为合同；
5. `docs/gstack/chat-studio-adaptive-composer-2026-08-05/`，但**只可参考输入框自身的视觉与交互**；
6. 更早的 Chat Studio mock、spec 与 `docs/progress.md` 仅作历史背景。

特别说明：adaptive mock 里的对话消息、左栏、右栏、标题、演示控制器和为制造滚动范围补充的历史内容，全部只是演示脚手架，不是 Chat Studio 改版提案。

## 3. 当前事实与本次建议

### 3.1 已确认的生产事实

- 生产 Chat 输入器是 `src/ui/view/chat-view/components/Composer.tsx`，不是 Document Composer，也不是 `docs/gstack/` 里的静态 fixture。
- 同一个 `Composer` 当前被三个位置复用：已有对话底部、新对话起始态、Project Home 起始态。
- 已有对话的消息时间线由 `.pkchat-body` 独立滚动，并已有自动滚动、切换对话后滚到底部等行为。
- Composer 已有单一 draft owner、附件、显式引用、回复锚点、workflow、Sources、Assistant、Model、Send/Stop、IME 与流式状态行为。
- Chat context 由 `ChatProfile` 和 `ContextPipeline` 装配；Composer UI 不是 prompt 拼接器。
- 当前 turn receipt 能区分 requested sources 与 actual sources，但不能自动证明每一个 context slot 都被模型“使用”了。

### 3.2 本次设计建议

- 自适应行为只启用在**已有对话底部**；新对话和 Project Home 的 Composer placement 保持当前布局和行为。
- 使用同一个 Composer shell 在 compact / expanded 间变形，不渲染两套输入框，也不迁移 draft owner。
- 增加“下一条消息 Context stack”的只读投影与检查器，但不改变 context pipeline 的 slot、顺序、预算、压缩或选择规则。
- 所有新视觉样式必须限制在 active-conversation Composer 根节点内，不能依赖或修改全局 Chat token 来连带改变其他区域。

### 3.3 仍需在实现前确认的事实

- 生产运行时目前是否能提供一个稳定、用户可读的 pre-send slot preview，而不重复执行或旁路 `ContextPipeline`。
- 发送后若要逐 slot 展示“实际装配 / 被压缩 / 被丢弃”，应该从哪一个 app/service read port 读取；不能直接把内部 debug trace 当成稳定用户合同。
- 最终高度、padding 和动画曲线要在真实 Obsidian 主题、缩放和窗口宽度下确定，不能只按 HTML mock 截图定数值。

## 4. 允许改动的产品区域

唯一允许出现用户可见变化的区域：

```text
Chat Studio
└── 中央已有对话
    ├── Header                         冻结
    ├── Message timeline               冻结
    ├── Convert-to-project suggestion  冻结
    └── Active conversation Composer   本次唯一改动面
        ├── Context summary rail
        ├── Message editor
        ├── Attachments / status
        ├── Add / Sources / Assistant / Model
        ├── Send / Stop
        └── Composer-owned popovers and context reader
```

为了读取“是否在时间线底部”，未来实现可在 `view-Messages.tsx` 增加一个最小的只读 bridge，把现有 scroll container 的 bottom-distance / reading-state 传给 Composer。这个例外只允许传信号：

- 不改 `.pkchat-body` DOM 结构；
- 不改消息数量、消息内容、消息间距或滚动高度；
- 不替换现有 `useScrollManager` / `useAutoScroll`；
- 不改变切换对话、流式输出和用户手动滚动的 anchoring；
- 不在 Chat store 新增第二套滚动事实源。

## 5. 明确冻结的区域

以下区域不属于本次任务，即使实现者认为它们“不够协调”也不得修改：

- Chat Studio shell、中央栏宽度和整体页面背景；
- 左侧 projects / conversations 导航；
- Chat header、标题、Open source、刷新等动作；
- 所有 user / assistant message 的排版、卡片、附件、tool、trace、actions、suggested next；
- Message timeline 的内容、空态、自动滚动和滚动条样式；
- Convert to Project suggestion；
- Project Home 的 hero、stats、tabs、列表和其中的 Composer placement；
- 新对话起始页的 greeting、starters 和居中布局；
- 右侧 Conversation Outline / Resources 以及 Obsidian sidebar；
- Chat 路由、conversation/project storage、receipt schema 与消息持久化；
- Assistant、Model、Sources、workflow、permission 和 send/stop 的业务语义；
- `ChatProfile` 的 slot 顺序、required/optional、priority、token budget、compression 和 drop 规则；
- 全局 button/input 样式、全局 design token 和 Document Composer。

## 6. Composer 目标交互

### 6.1 状态模型

| 状态 | 触发条件 | 输入框表现 | 不得发生 |
|---|---|---|---|
| Reading history | 用户离开消息时间线底部，且无 draft、焦点、附件、菜单或 active run | 收成一行、悬浮感较强的 compact Composer；仍可一击聚焦 | 不能隐藏输入能力，不能清 draft，不能移动消息 |
| Latest idle | 用户位于最新消息处 | 默认展开，但高度紧贴内容；展示 Context rail、编辑区和 footer | 不能保留大块无功能空白 |
| Editing | 有焦点、文本、附件、reply/revision、显式引用或生成面板 | 保持展开；编辑区随内容平滑增长，到上限后内部滚动 | 不能因时间线滚动突然折叠，不能丢 selection/IME |
| Menu / inspector open | Add、Sources、Assistant、Model 或 Context 检查器打开 | Composer 保持展开，popover 与输入框使用统一宽度和锚点逻辑 | 不能因 hover 离开一小段就抖动关闭 |
| Running | sending / streaming / waiting-permission / queued next draft | 保留现有进度、Stop 和排队语义，Composer 不折叠 | 不能把运行态只做成装饰动画，不能改变取消行为 |

compact 与 expanded 必须是同一个可编辑 surface 的视觉状态，不得通过卸载并重建输入框来完成。动画应短、连续、可被 reduced-motion 降级；不能让消息时间线产生肉眼可见的跳动。

### 6.2 高度与空白规则

当前设计最需要修正的是“控件下面还有一大段空白”。目标不是把输入框做得越大越高级，而是让高度由真实内容决定：

- Latest idle 只容纳 Context rail、一个短编辑区域和一行 footer；
- footer 下方只能保留正常触控/视觉 padding，不能再有一整行以上的无功能空腔；
- 短文本时不预留长文本高度；长文本增长到 viewport 相关上限后，只有编辑区滚动；
- 附件、运行状态或 context preview 出现时按内容增高，关闭后平滑回到基础高度；
- wrapper 的底部留白与 Composer 内部留白必须分开检查，不能用增大外部 padding 掩盖内部高度问题。

数字不在本文件里硬编码。实现前应以真实 Obsidian 中 footer 底边到 Composer 边框的视觉间距为基准，确保 compact、Latest idle、两行文本、长文本和 streaming 五种状态都没有死空间。

### 6.3 Context summary rail

展开态顶部增加一条轻量 Context rail，让用户在发送前知道“下一条消息会带什么上下文”。默认只显示人可读摘要，例如：

```text
Context stack · Recent history · Summary · Working context · User profile · 6 resources
```

右侧状态不能一律写成 `9 layers ready`。它必须诚实反映 empty、optional、excluded、compressed 或 unavailable，例如 `6 included · 2 empty · 1 optional`。

rail 的几何合同：

- 静止态服从 Composer 外壳；
- hover / active 背景的左上角和右上角必须与外层输入框同心拟合；
- hover / active 背景的两个下角为直角，与下面编辑区域连续连接；
- 不允许左右各自出现一个独立圆角方块，看起来像两个按钮贴在输入框上；
- rail 不得凭空增加 Composer 下方空白。

### 6.4 Context inspector

点击 Context rail 后，打开与 Composer **同宽、同水平边界**的检查器。它不是一个窄小 tooltip，也不是新的右侧栏。

默认层级来自当前生产 `ChatProfile`：

1. `system-prompt` — required；
2. `assistant` — optional；
3. `recent-messages` — required，当前最多 20 条再受压缩规则影响；
4. `working-context` — optional；
5. `conv-summary` — optional；
6. `activity-index` — optional；
7. `user-profile` — optional；
8. `prev-analysis` — optional；
9. `resource-index` — optional。

当前 user draft 是“本轮消息”，不应伪装成第十个 `ChatProfile` slot。Project lock、Vault/Web toggle、显式 refs、reply/revision 与 workflow 是 request scope / explicit context，也应单独说明其来源与去向，不应全部硬塞进 `resource-index`。

每个 item 都可以展开，至少显示：

- 具体内容的可读预览；
- 来源和为何会进入下一条消息；
- required / optional / empty / unavailable；
- token 上限或估算（放在 Technical details，不压过正文）；
- 预计、已冻结、已装配、压缩、丢弃或未记录状态；
- 内容不完整时的明确说明。

下列内容应显示在 `Not included` / `Excluded` 区，而不是让用户误以为它们会自动进入模型：

- 整个 Vault；
- 未被选择或检索的文档；
- 未实际运行查询的 Web 结果；
- inactive message variants；
- parent branch 中不属于当前 active history 的消息；
- unavailable source、被用户关闭的 source 和被预算 drop 的 optional slot。

### 6.5 长内容处理

单个 stack item 很长时，不能无限撑高 popover，也不能嵌套多个难以控制的小滚动区：

- inline preview 使用有限高度，并显示 `正在显示 N / M 字符`；
- 展示清晰的 `打开完整内容` 动作；
- full reader 在同宽检查器内临时替换 stack 列表，形成一个主要滚动区域；
- full reader 提供 Back、搜索、复制、自动换行、字符数、token estimate 与完整性状态；
- Escape 先退回 stack，再关闭整个检查器；返回后恢复原来展开的 item 和滚动位置；
- 如果生产端只有摘要或脱敏 excerpt，必须标记 `Preview only`，不能称为 exact/full content。

### 6.6 Context 生命周期与诚实标签

Context UI 要区分四种不同事实，不能用一个 “Evidence” 标签混在一起：

| 时点 | 可以展示的真值 | 推荐标签 |
|---|---|---|
| 发送前 | 基于当前 draft、conversation、profile 和可用能力的预测；optional slot 仍可能被压缩/drop | `预计包含` |
| 发送开始 | 用户允许的 sources、显式 refs、Assistant、Model、workflow 与本轮关系被冻结 | `请求范围已冻结` |
| ContextPipeline 完成装配 | 哪些 slot survived、被压缩或被 drop；只有运行时提供稳定证据时才展示 | `实际装配` |
| 回答完成 | persisted receipt 证明的 model、assistant、workflow、actual sources 和结果状态 | `实际使用 / 回执` |

现有 `TurnExecutionReceipt.actualSources` 能证明 consulted sources，不等于证明某段 context 文本被模型在认知意义上“使用”。没有 slot-level 稳定证据时，UI 必须显示 `未记录`，不能从注册表、toggle 或预览推断成 `Actually used`。

### 6.7 菜单与滚轮行为

- Add、Context、Sources、Assistant、Model 使用同一 popover 视觉家族和对齐规则；菜单内容和业务动作保持现有语义。
- `+` 仍只负责资源；`/` 仍负责 workflow / generate；`[[` 与 `@` 的显式 context 行为保持现状。
- 鼠标位于非滚动的 Composer chrome 上时，wheel/trackpad 可以把滚动意图转交给消息时间线，以便用户看到 compact/expanded 变化。
- 当长文本编辑区、附件列表或 full reader 自己还能沿该方向滚动时，必须优先消费自己的滚动；只有到达边缘后才允许向时间线传递。
- 这个手势桥不能改变消息时间线已有 auto-scroll 判断，也不能靠向生产对话填充假消息来制造可滚动距离。

## 7. 现有行为不变量

视觉重设计完成后，下列能力必须与现在一致：

- 任一时刻只有一个 live Composer 和一个 draft owner；
- new / project-home / active draft 仍按现有 key 隔离；
- 切换 compact / expanded 不丢文本、光标、selection、IME composition、附件或 explicit refs；
- Enter、Shift+Enter、中文 IME submit guard 保持原语义；
- reply、revision、workflow、attachment remove、send、stop、retry 与 permission 状态保持原语义；
- Model 的 Auto/fixed 真值和 Assistant selection 仍由现有持久化与 resolver 决定；
- Sources toggle 的 requested truth 与 runtime actual receipt 继续分离；
- streaming 时可继续编辑 queued next draft 的既有能力不变；
- Project Home 和新对话起始态不出现 active-conversation 的折叠联动或 Context popover布局泄漏；
- Obsidian detached window、keyboard zone、focus restore 和 fixed-size button geometry 合同继续成立。

## 8. 文件边界

### 8.1 主要允许区

后续实现优先限制在这些 Chat Composer 自有文件：

- `src/ui/view/chat-view/components/Composer.tsx`
- `src/ui/view/chat-view/components/composer/ComposerContextShelf.tsx`
- `src/ui/view/chat-view/components/composer/ComposerPlusMenu.tsx`
- `src/ui/view/chat-view/components/composer/ComposerSourcesPopover.tsx`
- `src/ui/view/chat-view/components/composer/ComposerAssistantSelector.tsx`
- `src/ui/view/chat-view/components/composer/ComposerModelSelector.tsx`
- 新增的 Composer-local context summary / inspector / full-reader 组件
- `src/styles/peak-components.css` 中只命中 active-conversation Composer root 的选择器
- Chat Composer 自有 focused tests

“允许”不代表这些文件内的所有逻辑都可重写；Model、Assistant、Sources、menu action 和 submit 逻辑仍受上一节不变量约束。

### 8.2 条件允许区

只有为输入框提供现有真值且无法在 Composer 内取得时，才可最小触碰：

- `src/ui/view/chat-view/view-Messages.tsx`：只传已有 message scroll state；
- app/service 的只读 context projection port：只读当前 pipeline/receipt 真值；
- template-backed strings/config：只承载新文案和展示阈值。

若条件区发生 DOM 重排、状态 owner 迁移、持久化 schema 变化或 context assembly 行为变化，必须停止并重新征得 owner 批准。

### 8.3 禁止区

以下文件族默认不得因本任务出现 diff：

- `src/ui/view/chat-studio-view/`
- `src/ui/view/chat-view/ChatViewComponent.tsx`
- `src/ui/view/chat-view/components/Header.tsx`
- `src/ui/view/chat-view/components/messages/`
- `src/ui/view/chat-view/components/ConversationIndex.tsx`
- `src/ui/view/chat-view/view-ProjectOverview.tsx`
- project-home、ChatStartState、ChatStarters 相关组件
- `src/service/chat/context/profiles/ChatProfile.ts`
- `src/service/chat/context/slots/`
- `src/service/chat/context/ContextPipeline.ts`
- Chat persistence、message schema、conversation/project store
- Document Composer 的 `src/ui/view/composer/` 与 `src/app/composer/`

## 9. CSS 隔离合同

未来样式必须能从选择器上证明“只影响 active conversation Composer”：

- 根节点需要一个明确的 placement/state 标识；
- 不使用裸 `button`、`input`、`textarea`、`.popover` 等全局选择器；
- 不改 `.pkchat-shell`、`.pkchat-center`、`.pkchat-body`、`.pkchat-header` 或 message selectors；
- 不通过修改共享 radius、spacing、shadow token 让整个 Chat 被动换肤；
- 固定尺寸 icon button 继续防御 Obsidian 的 button geometry reset；
- narrow window 和 detached window 用 Composer-local responsive rule，不改 Chat 整体断点。

## 10. 实施前后的审查门槛

### 10.1 开始写代码前

- 锁定真实 Obsidian 中现有 Chat Studio 的 source revision、主题、zoom、viewport 和 active conversation；
- 保存 active conversation 的 Latest idle、两行 draft、长 draft、menu、streaming 五种基线；
- 列出计划修改的 exact files；凡超出“主要允许区 / 条件允许区”必须先停手；
- 明确 Context UI 每个字段来自哪个现有真值，不能先画 `Actually used` 再倒推数据。

### 10.2 实现 review

- diff review 首先检查禁止区是否为零；
- 对 Project Home 和新对话起始态做视觉/行为回归，证明共享 Composer 没有泄漏；
- 对 message timeline 做像素与滚动行为回归，证明没有为适配输入框重排消息；
- 验证 compact → expanded → menu → long reader → Escape → send → streaming → stop 的完整状态链；
- 验证 textarea/full reader 边缘滚动与 timeline 转交；
- 验证中文 IME、键盘导航、focus restore、reduced motion 和 detached window；
- production build 与 focused tests 通过后，再用 Obsidian CDP 检查实际 DOM、computed geometry、scrollTop 和 activeElement；
- 若无法完成真实交互验证，必须标记 `INTERACTION NOT VERIFIED`，不能用 HTML mock 代替。

### 10.3 Stop rule

出现任一情况立即停止，不继续“顺手修好”：

- 必须调整 Chat shell、消息或左右栏才能让 Composer 看起来正确；
- 必须改变 context slot / prompt assembly 才能填充检查器；
- 必须新增第二个 Composer store、context pipeline 或 receipt owner；
- 共享 CSS 导致新对话、Project Home、Document Composer 或其他 Chat 控件变化；
- scroll bridge 改变了消息 auto-scroll 或用户阅读位置；
- 当前 worktree 的并行改动与本任务 diff 无法安全分离。

## 11. 完成定义

只有同时满足以下条件，才能称为“Chat Studio Composer 输入框重设计完成”：

- 用户可见变化严格限制在已有对话底部 Composer；
- 阅读历史时紧凑、回到底部时展开，转场顺滑且 draft/focus 不丢；
- Latest idle 不再有控件下方的大块空白；
- Context stack 可见、同宽、逐项可展开，长内容可进入单一 full reader；
- hover rail 上两角与外框拟合、下两角为直角；
- 预计范围、冻结请求、实际装配与实际回执标签不撒谎；
- 所有既有输入、source、model、assistant、send/stop 和 scroll 行为不退化；
- Chat Studio 其他区域与改动前保持视觉和行为等价；
- 禁止区没有本任务 diff，验证证据和未验证项被如实记录。

这份完成定义不授权立即实现。它的作用是让下一次真正动代码时，任何人都能清楚知道：**要现代化的是输入框，不是重新装修 Chat Studio。**
