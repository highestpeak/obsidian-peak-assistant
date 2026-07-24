# Peak Assistant 全键盘导航系统设计规格

日期：2026-07-24  
状态：**Review-ready design proposal / implementation pending**  
类型：Cross-surface interaction and accessibility contract  
范围：Vault Search、AI Analysis、File Atlas、Composer View、Chat Studio  
不在范围：Usage Dashboard、Setup Wizard、Settings

研究依据：

- [学术、产业与公开用户反馈研究](../../research/2026-07-24-peak-keyboard-navigation/README.md)
- [可视化导航报告](../../gstack/keyboard-navigation-system-2026-07-24/index.html)

> 本文只定义目标行为，不代表生产代码已经实现。当前局部 keyboard handler、ARIA 和 Tab 顺序仍以源码为准。

## 1. 设计目标

用户只学习一套键盘语法，就能在五个工作区完成主要任务；界面中几乎所有可操作元素都可以到达、理解和操作，但不要求每个元素拥有独立快捷键。

目标体验：

1. 用户始终知道当前焦点在哪里；
2. 用户能预测下一次按键会去哪里；
3. 用户从任何区域都能用少量按键进入相邻区域；
4. 列表、树、tabs、toolbars、grids 和图谱使用一致的组件内语法；
5. 文本编辑、中文输入法、屏幕阅读器、Obsidian 宿主和 detached window 不被破坏；
6. 首次使用者不看文档也能完成任务，熟练用户可以逐步使用加速键。

## 2. 非目标

- 不给每个按钮或 row 分配一个直接字母快捷键；
- 不建立一套与 Obsidian Hotkeys 分离的全局键位配置系统；
- 不要求 Usage Dashboard、Setup Wizard、Settings 支持同等级的区域式导航；
- 不设计 Vim mode；它可以在未来成为可选 keymap；
- 不改变各工作区的数据、AI runtime、持久化或业务能力；
- 不在本轮修改生产代码。

## 3. 核心心智模型

### 3.1 三个导航尺度

| 尺度 | 默认按键 | 用户问题 | 行为 |
|---|---|---|---|
| 工作区区域 Zone | `F6` / `Shift+F6` | “我要去另一栏/另一大块” | 在当前 Peak surface 的稳定区域间前进/后退 |
| 组件 Component | `Tab` / `Shift+Tab` | “我要去这个区域的下一个控件组” | 在当前区域内的 input、toolbar、list、tree、button group 等组件间移动 |
| 元素 Item | 方向键 | “我要去这个列表/树/toolbar 的下一项” | 按组件方向和 APG 模式移动活动项 |

一句话版本：

> `F6` 换区域，`Tab` 换组件，方向键换元素。

### 3.2 稳定动作词汇

| 动作 | 默认按键 | 语义 |
|---|---|---|
| 打开 / 主动作 | `Enter` | 打开当前文件、跳转消息、激活按钮、进入编辑 |
| 选择 / 切换 | `Space` | 选择项目、切换开关、勾选、固定图节点 |
| 上下文动作 | `Shift+F10` / Menu key | 打开当前元素的完整动作菜单 |
| 退一层 | `Escape` | 关闭最内层 popup、退出子模式或回到触发点 |
| 第一 / 最后一项 | `Home` / `End` | 在当前 composite 内定位边界 |
| 快速翻页 | `PageUp` / `PageDown` | 在长 list/grid/report navigator 中移动一个 viewport |
| 键盘地图 | `?` | 在非文本输入状态打开当前上下文的 searchable keyboard map |

`Enter` 和 `Space` 不强行在所有控件上做完全相同的事；它们遵守控件类型的原生语义。文本框中的 `Enter`、`Space`、方向键和字符永远优先属于文本输入。

### 3.3 可达性不是快捷键记忆测试

任何可见动作必须至少满足一种标准导航路径：

```text
F6 到区域 → Tab 到组件 → 方向键到元素 → Enter / Space / Shift+F10
```

直接快捷键只是加速层。忘记全部直接快捷键后，用户仍能完成所有核心任务。

## 4. 焦点模型

### 4.1 三种状态必须分开

| 状态 | 含义 | 视觉要求 |
|---|---|---|
| Focus | 下一次键盘动作的目标 | 高对比 outline，任何主题和高对比模式都清晰 |
| Selection | 已加入集合、tray 或 multi-select | 持久填色/checkbox，不冒充 focus ring |
| Active / Preview | 当前打开、当前 tab、Inspector 正在预览 | 侧边标记或背景，离开焦点后仍可辨认 |

同一个元素可以同时 active、selected 和 focused，但三种状态不得只依赖一份同色背景。

### 4.2 Composite widget

以下组件只给一个元素进入 Tab 顺序：

- result list / source list / message list；
- tree / treegrid；
- tablist；
- toolbar / action rail；
- file rail / project rail；
- graph；
- table/grid；
- selection tray。

实现策略未来可选择 roving `tabIndex` 或 `aria-activedescendant`。要求是：

- 只有活动项为 `tabIndex=0`，其余项为 `-1`；或 DOM focus 留在 container；
- pointer 点击后同步更新 keyboard active item；
- 离开再返回时恢复最后活动项；
- item 进入视口并有可见焦点；
- virtualization 不得使 active descendant 指向不存在的 DOM。

### 4.3 区域记忆

每个 surface 为每个 zone 保留一个 session 级 focus bookmark：

1. 优先恢复上次焦点元素；
2. 元素已删除时恢复逻辑邻居；
3. 没有历史时恢复 selected / active item；
4. 都没有时恢复第一个 enabled item；
5. 空区域聚焦其 empty-state 主动作或区域容器。

不跨重启持久化 DOM id。需要持久化时只能保存稳定领域标识，例如 file path、conversation id、block id 和 message id。

### 4.4 异步更新不得偷焦点

以下事件只能更新 live region、状态文本和 active/preview，不得移动 DOM focus：

- 搜索结果刷新；
- AI Analysis 从 Process 进入 Report；
- File Atlas 重新解析；
- Composer Intelligence 建议到达；
- Chat 新消息或流式 token 到达；
- Inspector 自动预览更新。

只有用户触发导航、显式打开 modal，或当前 focused element 被删除时才能移动焦点。

### 4.5 Popup / modal / drawer 恢复

- modal/dialog 打开后 focus trap 只覆盖 dialog；
- `Escape` 关闭最内层 popup，并回到打开它的 trigger；
- drawer 关闭后回到 drawer trigger；重新打开回到上次 drawer 焦点；
- destructive action 删除当前 item 后，焦点落到下一项；没有下一项则上一项；列表为空则 empty state；
- 不允许关闭后焦点落到 `body`。

## 5. 按键所有权与冲突规则

### 5.1 Dispatch 优先级

按键只由最高优先级且当前激活的层处理：

```text
IME composition
  > modal / popup / menu
  > text editor / input / contenteditable
  > focused composite
  > current surface
  > Obsidian host
  > operating system
```

命中某层后才允许 `preventDefault`。未命中必须自然冒泡给宿主。

### 5.2 Editor-first guard

当 focus 位于 input、textarea、contenteditable、CodeMirror、ProseMirror、表格 cell editor 或 PromptInput 时：

- 裸字符、`?`、`/`、`Space`、方向键、`Home / End` 属于编辑器；
- `Tab` 是否插入/缩进/移动 cell 由该编辑器当前模式决定；
- `Escape` 先关闭 editor 内部 popup，再退出局部编辑模式；
- application shortcut 必须使用明确 modifier 或 `F6`；
- `compositionstart` 到 `compositionend` 期间不得提交、关闭或导航；
- screen reader browse/focus mode 的原生键不得被拦截。

### 5.3 平台与 detached window

- 所有全局监听挂到 surface 的 `ownerDocument` / `defaultView`，不能假设主 `window`；
- macOS 显示 `⌘ / ⌥ / ⇧`，Windows/Linux 显示 `Ctrl / Alt / Shift`；
- `event.key` 用于语义键，`event.code` 只用于明确的物理布局 preset；
- Obsidian Hotkeys 是全局键位 source of truth；
- 命令注册不得覆盖已有绑定，preset 应先显示冲突并允许逐项跳过。

## 6. 进入工作区与键位发现

### 6.1 必须注册的 Obsidian commands

这些命令必须可在 Obsidian Command Palette 中搜索和绑定，但默认不抢占全局组合键：

- `Peak: Focus Vault Search`
- `Peak: Focus AI Analysis`
- `Peak: Focus File Atlas`
- `Peak: Focus Composer View`
- `Peak: Focus Chat Studio`
- `Peak: Focus next zone`
- `Peak: Focus previous zone`
- `Peak: Return to last Peak focus`
- `Peak: Show keyboard map`

这些是稳定、owner-facing 的全局入口；feature-local 动作仍留在各自 surface 和上下文菜单中。

### 6.2 可选 Peak Workspace preset

用户可以显式安装一组可撤销、冲突检查后的 direct-focus preset：

| 工作流顺序 | macOS | Windows / Linux | Surface |
|---:|---|---|---|
| 1 | `⌥⌘1` | `Alt+Ctrl+1` | Vault Search |
| 2 | `⌥⌘2` | `Alt+Ctrl+2` | AI Analysis |
| 3 | `⌥⌘3` | `Alt+Ctrl+3` | File Atlas |
| 4 | `⌥⌘4` | `Alt+Ctrl+4` | Composer View |
| 5 | `⌥⌘5` | `Alt+Ctrl+5` | Chat Studio |

排序表达“找 → 理解 → 看结构 → 编辑 → 对话”。此 preset：

- 默认关闭；
- 安装前列出 Obsidian/OS 冲突；
- 可以只安装部分；
- 后续在 Obsidian Hotkeys 中正常编辑；
- 不作为基本可达性的依赖。

### 6.3 Searchable keyboard map

`?` 在非文本输入状态打开 keyboard map。它不是一张静态表，必须：

- 默认过滤到当前 surface 和当前 zone；
- 可搜索动作名、控件名和按键；
- 显示当前实际绑定，不显示假定默认；
- 区分 Navigation、Action、Editing、Surface-specific；
- 标出冲突、未绑定和仅在何种上下文生效；
- 每一行可以跳到 Obsidian Hotkeys 对应 command；
- `Escape` 关闭并恢复原焦点。

### 6.4 渐进学习

- menu item、tooltip、empty state action 显示当前绑定；
- pointer 完成高频动作后，可在不阻塞的 toast/footer hint 中提示一次对应键位；
- 同一提示最多出现三次，用户可以永久关闭；
- 不延迟 pointer action，不要求“先按快捷键才能继续”；
- telemetry 若未来存在，必须 opt-in，只记录匿名 action class，不记录 query、file、message 或文档内容。

## 7. 通用组件键盘契约

### 7.1 List / rail

- `Up / Down`：上一/下一项；
- `Home / End`：第一/最后；
- `PageUp / PageDown`：移动一个可视页；
- `Enter`：打开 active item；
- `Space`：仅在该列表支持 selection 时切换 selection；
- `Shift+F10`：item actions；
- typeahead 只在非编辑状态启用，并支持超时重置。

### 7.2 Tabs

- tablist 只占一个 Tab stop；
- `Left / Right`：上一/下一 tab，必要时循环；
- `Home / End`：首/末 tab；
- 即时本地 panel 可以 selection follows focus；
- 会触发 AI、网络或昂贵计算的 panel 只移动 focus，`Enter / Space` 后激活；
- Tab panel 加载后 focus 仍留在 tab，不跳入 panel。

### 7.3 Toolbar / action rail

- toolbar 只占一个 Tab stop；
- 水平 toolbar 用 `Left / Right`，垂直 toolbar 用 `Up / Down`；
- `Home / End` 到边界；
- `Enter / Space` 激活动作；
- disabled action 若需要解释可发现，使用 `aria-disabled` 并保留 tooltip；否则跳过。

### 7.4 Tree

- `Up / Down`：可见上一/下一节点；
- `Right`：展开 collapsed node；已展开则进入第一个 child；
- `Left`：折叠 expanded node；已折叠则回 parent；
- `Home / End`：第一/最后可见节点；
- `Enter`：打开/跳转节点；
- `Space`：仅在支持 selection/tray 时切换选择；
- `*` 等非核心扩展不作为第一版要求。

### 7.5 Grid / table

分成 navigation mode 与 edit mode：

- navigation mode：方向键移动 cell，`Home / End` 移行边界，`Ctrl/⌘+Home / End` 移 grid 边界；
- `Enter` 或可打印字符进入 edit mode；
- edit mode：编辑器拥有字符和方向键，`Escape` 回 navigation mode；
- `Tab / Shift+Tab` 在 cell 编辑时遵守表格的下一/上一 cell 习惯；
- grid 退出必须有明确路径：`F6` 切 zone，或编辑外 `Tab` 移到下一 component。

### 7.6 Graph

Graph 不能只提供画布和 pointer hit target。它作为 spatial composite：

- `Up / Down / Left / Right`：按屏幕几何关系移动到该方向最近节点；
- `Home`：query/root node；`End`：最后访问节点；
- `Enter`：打开节点或进入其 Inspector；
- `Space`：固定/取消固定或加入 selection，具体语义由 surface label 明示；
- `+ / -`：zoom in/out；
- `0`：fit graph；
- `Escape`：退出 node substate / selection，但不关闭整个 surface；
- 屏幕阅读器可切换为等价的结构化 node list/tree。

若图谱无法提供可达节点、位置播报和等价 list，产品不得声称该 Graph 支持完整键盘导航。

### 7.7 Splitter

- `Left / Right` 或 `Up / Down`：按 4px 调整；
- `Shift` 加方向键：按较大步长调整；
- `Home / End`：最小/最大；
- `Enter / Space`：恢复 baseline；
- `aria-valuemin/max/now` 和明确 label；
- splitter 通过区域内 `Tab` 到达，不单独成为 `F6` zone。

## 8. Vault Search

### 8.1 Zone 顺序

```text
VS1 Search mode tabs
  → VS2 Query
  → VS3 View / scope toolbar
  → VS4 Results
  → VS5 Inspector
```

如果 Inspector 关闭，`F6` 跳过 VS5。Footer 只有出现可操作控件时才进入 VS3 或 VS5，不单独制造空 zone。

### 8.2 行为

| 区域 | 内部行为 |
|---|---|
| Mode tabs | `Left / Right` 在 Vault Search / AI Analysis 间移动；只在本地瞬时切换时自动激活，否则 `Enter / Space` 激活 |
| Query | surface 首次进入时可聚焦；`Down` 从单行 query 进入当前/第一条结果；`Escape` 先关 suggestions，再清 query，再关闭 modal |
| View / scope | `Left / Right` 浏览 List / Tree / Graph 与 scope 控件；`Enter / Space` 激活 |
| Result list | `Up / Down` 移动；focus 更新 preview 但不跳焦点；`Enter` 当前 tab 打开；`Cmd/Ctrl+Enter` 新 tab 打开；`Right` 进入 Inspector |
| Result tree | 使用通用 tree 语法；heading 和 section 是真实层级 |
| Result graph | 使用通用 graph 语法；屏幕阅读器提供等价 node list |
| Inspector | `Up / Down` 在 section/link composite 中移动；`Enter` 打开链接；`Left` 回到 Results |

### 8.3 当前行为校正

- `Tab` 不再直接切 Vault Search / AI Analysis；
- 结果中的每一行不进入 Tab 顺序；
- 高层 `window` keydown 不得在 query 正在编辑时吞掉方向键；
- 列表、树、图谱共享 active result bookmark；
- view 切换后 focus 留在等价 result；没有等价项才回到 query/root。

## 9. AI Analysis

### 9.1 Zone 顺序

```text
AA1 Query / mode
  → AA2 Lifecycle tabs
  → AA3 Primary canvas
  → AA4 Outline / section navigator
  → AA5 Actions
```

没有 Outline 时跳过 AA4；确认 dialog 作为临时最内层，不加入 F6 环。

### 9.2 行为

| 区域 | 内部行为 |
|---|---|
| Query / mode | input 保留编辑语义；mode picker 按 tabs/listbox 模式 |
| Lifecycle tabs | Process / Report / Sources 使用 tablist；AI 未完成的 panel 可 focus 但不伪装可用 |
| Process | `Up / Down` 在步骤/工具运行间移动；`Enter` 展开详情；运行状态用 live region 播报 |
| Report | heading navigator 与正文分离；navigator `Up / Down`，`Enter` 跳 heading；正文保留选择、复制和 screen-reader reading |
| Sources | source list 使用 list composite；`Enter` 打开/预览；`Shift+F10` 提供复制引用、打开源等动作 |
| Actions | Continue、Save、Export 等按 toolbar；高风险批准必须聚焦具体按钮后激活 |

### 9.3 AI 特殊规则

- Process 自动完成进入 Report 时只更新 selected tab 和状态播报，不偷 focus；
- report streaming 不重置 heading navigator 的 active item；
- 文本选中后使用 `Shift+F10` 暴露“Annotate selection”等动作；
- plan approval、continue 和 destructive retry 不拥有裸全局快捷键；
- `Alt+Up / Down` 的既有 mode cycling 可以保留为 secondary shortcut，但 keyboard map 必须标注，且不能在编辑器中生效。

## 10. File Atlas

### 10.1 Zone 顺序

```text
FA1 File rail
  → FA2 View tabs and filters
  → FA3 Atlas tree / graph
  → FA4 Inspector
  → FA5 Selection tray
```

未打开 Inspector 或 Selection Tray 时跳过对应 zone。

### 10.2 行为

| 区域 | 内部行为 |
|---|---|
| File rail | `Up / Down` 切文件焦点；`Enter` 激活文件；关闭/移除通过 `Shift+F10`，不把 `Delete` 设为默认 destructive key |
| View / filter | Tree / Graph 使用 tabs；filter 和 preset 使用 toolbar/combobox |
| Atlas tree | 通用 tree 语法；`Enter` reveal source block；`Space` 加入/移出 Selection Tray；`Shift+F10` 打开 reveal/copy/add actions |
| Atlas graph | 通用 graph 语法；`Space` 加入/移出 Selection Tray；结构化 list 是等价替代 |
| Inspector | headings、relations、actions 分为 components；`Left` 回 Atlas |
| Selection tray | `Left / Right` 移 item；`Delete / Backspace` 只删除 tray 引用，不删除 Vault 内容；`Enter` reveal；Send to Copilot 必须聚焦按钮确认 |

### 10.3 当前行为校正

- Tree node 与 File Rail row 改为 composite，不再全部 `tabIndex=0`；
- Tree focus、active document 与 tray selection 分开；
- 切换文件后恢复该文件上次 Atlas focus；
- 解析刷新后按稳定 block id 恢复焦点，找不到时落到最近可见 parent；
- Graph 与 Tree 共享 block selection，不共享临时几何 focus。

## 11. Composer View

### 11.1 Zone 顺序

```text
CV1 Document header
  → CV2 Document canvas
  → CV3 Contextual block controls
  → CV4 Intelligence sidecar
  → CV5 Source / status bar
```

CV3 只在 block toolbar、table toolbar、image controls 或 selection action rail 可见时存在。Sidecar 关闭时跳过 CV4。

### 11.2 Canvas 双模式

Composer canvas 必须区分：

#### Text edit mode

- caret、selection、输入法、slash menu、link、undo/redo 和 editor keys 保持原行为；
- `F6` 是离开 canvas 的稳定路径；
- `Escape` 先关 autocomplete/menu，再进入 block navigation；
- `Tab` 由当前 block 决定：文本缩进、table next cell 或嵌套 list。

#### Block navigation mode

- 可见 block 有单一活动焦点；
- `Up / Down` 移动 block；
- `Left / Right` 对可折叠/嵌套 block 执行 collapse/parent 与 expand/child；
- `Enter` 进入该 block 的 text edit mode；
- `Space` 切 block selection；
- `Shift+F10` 打开 block actions；
- `Escape` 清多选，再退到 canvas component；
- 图片、embed、table 和生成产物暴露明确 role、label 与状态。

### 11.3 Table

- `Enter` 从 block navigation 进入 table navigation；
- 方向键在 cell 间移动；
- `Enter` 进入 cell edit，`Escape` 回 table navigation；
- 第二次 `Escape` 回 table block；
- `Tab / Shift+Tab` 在 cell edit 中移下一/上一 cell；
- 行列操作从 `Shift+F10` 或 contextual toolbar 到达；
- selection、active cell 与 text caret 视觉分开。

### 11.4 Selection contextual toolbar

选中非折叠、可编辑的文本范围后，会出现用户截图中的组合工具栏：

```text
格式：加粗 / 斜体 / 下划线 / 删除线 / 链接
标记：文字颜色 / Highlightr / Easy Copy
协作：评论
AI：润色 / 精简 / 扩写 / 问 AI
```

它属于 `CV3 Contextual block controls`，遵守标准 horizontal toolbar 模式，而不是把每个按钮加入 canvas 的普通 Tab 顺序。

#### 进入与返回

- 文本选区出现时，工具栏可以视觉显示，但**不得自动取得焦点**，caret/selection 继续由 editor 拥有；
- `Alt+F10`（macOS 显示 `⌥F10`，部分键盘需要 `Fn`）从 editor 进入当前 contextual toolbar；
- `F6` 从 `CV2 Document canvas` 前进时，如果 selection toolbar 可用，也进入 CV3；
- 同时存在 selection、block、table 或 image toolbar 时，`Alt+F10` 优先进入与当前 selection 最直接相关的 toolbar；再次按下在当前可用 editor toolbars 间循环；
- toolbar 第一次进入时落到与当前 selection 状态最相关的第一项；之后恢复上次 focused control；
- toolbar 内无 popup 时按 `Escape`，恢复原 editor selection/caret，并隐藏 toolbar，直到 selection 改变或用户再次按 `Alt+F10`；
- `Shift+Tab` / `Tab` 从 toolbar 离开时进入前/后一个 CV3 component；不穿过每个 toolbar button；
- editor selection 必须保存为稳定 bookmark。DOM focus 离开 editor 后，即使原生 selection 被浏览器折叠，视觉 highlight、block ids、semantic-unit ranges 和 source offsets 仍保持可审阅、可撤销。

#### Toolbar 内部导航

- 整个 toolbar 只有一个 Tab stop，使用 roving `tabIndex`；
- `Left / Right`：上一/下一 control，并允许首尾循环；
- `Home / End`：第一/最后 control；
- `Enter / Space`：激活 button 或 toggle；
- 分隔线只是视觉/语义 group boundary，不接受焦点；
- icon-only controls 必须在 hover 和 focus 时显示 label、当前真实 shortcut 和作用域；
- Bold、Italic、Underline、Strikethrough 使用 toggle button 语义和 `aria-pressed`；
- toolbar 使用 `role="toolbar"`、可访问名称“选区操作”，并通过 `aria-controls` 指向 document canvas；
- 进入时播报选区摘要，例如“选中 48 个字符，跨 2 个段落；选区操作工具栏，1/13”。

#### Menu / popover

- Link、文字颜色、Highlightr、Easy Copy 是 menu buttons；
- `Enter / Space / Down` 打开 menu；`Up / Down` 移 menu item；`Home / End` 到边界；
- menu 内 `Enter / Space` 应用并回 trigger；`Escape` 只关当前 menu 并回 trigger；
- 链接 input 打开后获得焦点；`Enter` 应用，`Escape` 取消并回 Link；
- Comment 打开 anchored editor；有未保存内容时 `Escape` 不得静默丢弃；
- Easy Copy 的成功/下载 fallback 通过 polite live region 播报，焦点留在 Easy Copy trigger。

#### 格式与已存在快捷键

- 继续尊重编辑器/Obsidian 已存在的 Bold、Italic、Link 等绑定，并在 tooltip 显示**实际绑定**；
- 不为 Underline、Strikethrough、颜色、Highlightr、评论和每个 AI 动作新增不可配置的全局默认键；
- toolbar 的标准导航路径已经保证所有动作可达；direct shortcut 只是 Obsidian Hotkeys 中可选的 secondary accelerator；
- code selection 不打开 rich-text selection toolbar；code-specific actions 留在 Code Block toolbar。

#### AI actions

- `润色 / 精简 / 扩写` 的 `Enter / Space` 只创建 selection-scoped candidate，不直接覆盖 Markdown；
- 用户激活动作后可以把 focus 移到该 selection review 的 running shell；AI 异步完成只更新同一 shell 和 live status，不再次移动焦点；
- review 必须提供 `接受 / 还原 / 重试` 的标准 toolbar/button 导航；
- `问 AI` 打开 anchored prompt；focus 进入 input，`Cmd/Ctrl+Enter` 提交，`Escape` 返回“问 AI”按钮并保留 selection bookmark；
- 运行时冻结 selection snapshot；若正文在结果返回前发生无法安全 rebase 的变更，Accept 变为不可用并播报“选区已变化，请重新选择”，不得把旧 patch 写到新范围；
- AI 候选被接受后焦点回到被修改范围的逻辑起点，selection 变成 accepted range，History 记录同一 transaction。

W3C Toolbar Pattern 是本契约的规范底座；行业快捷入口参考 CKEditor 的 `Alt+F10 → toolbar / Escape → origin` 模式。研究证据见[选区工具栏专项补充](../../research/2026-07-24-peak-keyboard-navigation/README.md#55-富文本选区工具栏)。

### 11.5 Intelligence sidecar

- suggestion、history、source 和 diff 使用 composite；
- `Up / Down` 移建议；
- `Enter` 预览建议；
- `Space` 选择建议；
- `Shift+F10` 提供 compare、accept draft、dismiss 等动作；
- Apply / Accept 必须进入 review boundary，不允许仅因 focus 移动而改正文；
- 从 canvas `F6` 进入 sidecar 时保留文档 selection、caret 和 scroll；
- 返回 canvas 恢复原 caret/selection；
- sidecar 折叠/窄屏 drawer 关闭时恢复 trigger。

### 11.6 编辑器冲突

- `Cmd/Ctrl+K` 保留 editor link/既有语义，不作为 surface navigation；
- `/` 保留 slash command；
- `?` 在编辑状态输入字符；只有 block navigation 或非文本区域才打开 keyboard map；
- AI draft 的 Run/Apply modified shortcuts 可以作为 surface-specific secondary shortcut，但必须显示在具体按钮旁，不能覆盖 Chat Composer 的语义。

## 12. Chat Studio

### 12.1 Zone 顺序

活跃会话：

```text
CS1 Left navigation
  → CS2 Message timeline
  → CS3 Composer
  → CS4 Outline / Resources
```

新对话或项目主页：

```text
CS1 Left navigation
  → CS2 Centre content
  → CS3 Composer
```

Header actions 和 splitters 通过对应区域的 `Tab` 到达，不制造额外 F6 stops。

### 12.2 行为

| 区域 | 内部行为 |
|---|---|
| Left navigation | Pinned / Projects / Recent 是一个层级 tree/list；`Up / Down` 移 row，`Left / Right` collapse/expand，`Enter` 打开，`Shift+F10` row actions |
| Message timeline | `Up / Down` 在 message group 间移动；`PageUp / PageDown` 滚动；`Enter` 进入当前消息 primary disclosure；`Shift+F10` 打开 Copy/Retry/Star/Branch/Trace 等动作 |
| Composer | `Cmd/Ctrl+K` 聚焦 Composer 的既有行为保留；`Enter` 发送；`Shift+Enter` 和既有 `Cmd/Ctrl+Enter` newline 行为在 keyboard map 中明确；suggestion popup 拥有方向键和 `Escape` |
| Right index | Outline / Resources 使用 tablist；内部 list `Up / Down`；`Enter` 跳消息或打开资源；关闭后焦点回 trigger |
| Splitter | 复用通用 splitter contract |

### 12.3 消息焦点

- Message group 是复合阅读单元，而不是让每个链接/按钮都进入全局 Tab 链；
- `Enter` 进入 message content 后，`Tab` 可到达正文中的 links、code actions 和 inline controls；
- `Escape` 从 message content 回 message group；
- streamed answer append 不改变 focused message；
- focused message 被删除/branch 替换时落到最接近的新 message；
- Outline jump 后 focus 落到对应 message group，不直接落到正文中的随机 child。

### 12.4 Lightbox / trace / tool disclosure

- lightbox 作为 dialog，`Left / Right` 上一/下一媒体，`Escape` 关闭并回缩略图；
- tool disclosure 使用 disclosure pattern，`Enter / Space` 展开；
- Trace / raw / resource detail 打开后形成临时 layer，关闭恢复消息动作；
- 权限请求必须进入可聚焦 dialog，并把批准/拒绝明确成按钮，不依赖字母键。

## 13. Escape 的逐层退栈

`Escape` 只退一层，优先顺序：

```text
autocomplete / tooltip / menu
  → modal / lightbox / temporary drawer
  → multi-selection
  → cell/text sub-edit mode
  → message/block content mode
  → inspector substate
  → surface-owned transient panel
  → host modal close
```

规则：

- 不静默丢 draft；
- 不把 `Escape` 同时解释为“清 query + 关 inspector + 关 modal”；
- 如果下一步会丢内容，先聚焦明确的 confirmation dialog；
- 每退一层都恢复到逻辑 trigger 或 parent。

## 14. 可访问性语义

每个 surface 必须有可辨识 landmarks / accessible names：

- Vault Search：Search controls、Results、Inspector；
- AI Analysis：Analysis controls、Process/Report/Sources、Outline、Actions；
- File Atlas：Files、Atlas、Inspector、Selection tray；
- Composer：Document、Block controls、Intelligence、Status；
- Chat Studio：Conversations、Messages、Composer、Conversation index。

屏幕阅读器播报至少包含：

- 进入 zone 时：区域名；
- 进入 item 时：名称、role、位置、selected/expanded/active 状态；
- 异步状态：开始、完成、失败、取消、结果数变化；
- Graph：节点名、类型、连接数/方向和当前位置；
- splitter：当前值与最小/最大；
- shortcut conflict：命令、当前绑定、冲突来源。

Focus indicator 必须满足当前 WCAG Focus Visible / Focus Appearance 要求，且不能只依赖颜色。高对比模式不得丢失 outline。

## 15. 响应式与窄屏

- zone 顺序以逻辑任务流为准，不以 DOM 偶然顺序为准；
- 桌面三栏折叠为 drawer 后，`F6` 仍按同一逻辑顺序，隐藏 zone 被跳过；
- 打开 drawer 时记录 trigger，关闭后恢复；
- drawer 完全出视口且不得产生 horizontal overflow；
- CSS reorder 不能制造和 screen-reader order 不同的 Tab 顺序；
- mobile/touch 不是本设计的主要验收 viewport，但外接键盘仍不得产生 trap。

## 16. 设计验收标准

未来实现只有同时满足以下条件才能声称“全键盘导航完成”：

### 16.1 全局

- 五个 in-scope surface 的所有可见动作都能从标准导航路径到达；
- 没有超过一个 item 的 composite 进入 Tab 顺序；
- `F6 / Shift+F6` zone 顺序与视觉/阅读顺序一致；
- focus、selection、active/preview 可区分；
- popup/dialog/drawer 关闭后焦点恢复；
- 异步更新不偷焦点；
- IME、screen reader、detached window 通过；
- keyboard map 显示真实当前绑定和上下文。

### 16.2 任务

1. Vault Search：query → result → Inspector → open，不使用 pointer；
2. AI Analysis：Process → Report heading → Source → Save，不使用 pointer；
3. File Atlas：file → block tree/graph → Inspector → tray → Copilot，不使用 pointer；
4. Composer：正文 → block/table/image → Intelligence review → 正文，不使用 pointer；
5. Chat Studio：left nav → message → outline/resource → Composer → send，不使用 pointer。

### 16.3 失败即阻塞

- keyboard trap；
- invisible focus；
- focus 落 `body`；
- 编辑输入被 surface shortcut 抢走；
- draft 或 selection 意外丢失；
- 图谱无 keyboard-equivalent list；
- detached window 无效；
- 生产仅增加快捷键表，但元素本身仍不可通过导航到达。

## 17. 未来实施边界

这不是实施计划，但实现时必须遵守：

- app layer 组合并拥有 keyboard runtime；不得新建 service-layer singleton；
- command palette 只注册 §6.1 的稳定全局入口；
- feature-local handler 通过明确 context/port 接入，不散布新的 `window.addEventListener`；
- key maps、labels、platform display、coach thresholds 进入 template/config 或明确 defaults；
- 先补 shared focus/composite primitives 与 contract tests，再逐 surface 迁移；
- 保留现有正确行为，例如 Chat splitter 和 Conversation Index roving tabs；
- 对现有行为改变要提供 migration note，尤其是 Vault Search 的 `Tab` 切 mode；
- 任何 implementation wave 都必须带 keyboard-only browser/Obsidian QA，不以 unit test 和 build 代替真实焦点验证。

## 18. 最终决策

Peak Assistant 的全键盘系统采用：

```text
进入工作区：Obsidian command / optional direct-focus preset
切区域：F6 / Shift+F6
切组件：Tab / Shift+Tab
切元素：方向键
主动作：Enter
选择/切换：Space
完整动作：Shift+F10
退一层：Escape
发现：?
```

这是一套导航架构，不是一张快捷键清单。它用少量稳定语法覆盖五个复杂 surface，同时把文本编辑、可访问性、宿主冲突和焦点恢复放在同等优先级。
