# Peak Modifier Key Tips Navigation

日期：2026-08-06（2026-08-10 direct-action revision）
状态：Owner-approved implementation contract（视频复核修订）
范围：Vault Search、AI Search、File Atlas、Chat Studio、Composer
不在范围：全局 Obsidian 页面、Windows 键、可搜索快捷键 modal

## 1. Owner correction

本规格取代 `2026-07-24-peak-keyboard-navigation-system.md` 中面向用户的
`?` keyboard map、`F6 / Shift+F6` Zone 循环和 `Focus next/previous zone`
语言。内部仍可使用焦点分组、书签和顺序来实现恢复与 roving focus，但不得把
`Zone` 暴露为用户心智模型。

2026-08-10 owner correction：贴在真实按钮、tab、toggle、menu trigger 或 action
上的 Key Tip 必须直接执行该控件，不能只把焦点送过去再要求一次 `Enter`。只有输入框、
正文、结果区、列表和其他“进入这里继续导航”的目的地保持 focus-only。稳定的分段模式
必须每项拥有独立 Key Tip；大量重复的结果行、消息和图节点继续使用方向键/Tab，不为
每条动态数据生成提示。

## 2. 激活契约

- macOS：按下 `Option`；Windows / Linux：按下 `Alt`。
- 按住超过 180ms 时直接显示 Key Tips，不再等待松键；快速轻按则在松键时显示。
- 按住显示后，松键保留 Key Tips，等待下一次普通字母或数字键选择。
- 修饰键按下到松开之间如果出现其他按键，本次手势视为普通组合键，不显示
  Key Tips；若提示刚刚因长按显示则立即清理。不得吞掉字符或宿主快捷键。
- `AltGraph`、按键重复、IME composition 和 `Process` 事件不激活 Key Tips。
- 激活在搜索框、聊天输入框和其他编辑控件中同样有效；它不输入字符，也不移动
  当前焦点。
- 再次轻按修饰键、按 `Escape`、点击、窗口失焦或开始 IME composition 都关闭
  Key Tips。

## 3. 展示与导航契约

Key Tips 是定位到当前 Surface 真实目标的非交互 viewport overlay，不是 modal、
drawer 或独立焦点层。overlay 不进入焦点顺序，并在目标滚动、resize 或动态挂载时
重算。标签页目的地即使当前内容没有挂载也必须显示；隐藏且没有可执行打开动作的
Inspector、Outline、Selection tray 不产生空提示。

| Surface | Key Tips |
|---|---|
| Vault Search | Surface、query、view、density、Inspector；Graph 的 5 个布局、Semantic 和 3 个画布动作分别显示独立键位 |
| AI Search | Surface、query、lifecycle、result actions；Sources 的 view、scope、5 个布局、Semantic、复制和画布动作分别显示独立键位。控件超过可用字母时使用单个数字键，不能静默丢弃提示 |
| File Atlas | Files、Tree/Graph、Inspector、tray；Tree 的 5 个 layer preset 与 Graph 的 3 个 scope、5 个布局、Semantic 和 3 个画布动作分别显示独立键位 |
| Chat Studio | `C` Conversations；`M` Messages / Chat content；`Q` Chat input；`I` Conversation index |
| Composer | 文档入口保持 focus-only；display、review、comments、Intelligence、undo/redo、sidecar tab/action 和 modal action 直接执行 |

按提示键后：

1. Key Tips 立即关闭；
2. 精确控件先获得可见焦点并立即执行一次真实 click 语义；打开 popup/dialog 的控件
   允许新 layer 接管焦点。focus-only 目的地进入上次使用的位置；没有书签时进入活动行、
   文本框或首个可操作元素；
3. 屏幕阅读器 live region 宣读 Surface 和目标名称；
4. 后续继续遵守原生 `Tab`、方向键、`Enter`、`Space`、`Shift+F10` 和 `Escape`
   语义。

未知字母/数字被 Key Tips 模式消费并通过 live region 报告，不插入当前编辑器；带
`Cmd/Ctrl/Alt` 的组合键关闭提示后交还宿主。

## 4. Runtime 与边界

- runtime 由 app layer 组合并通过 `AppRuntimeRegistry` 拥有；不得增加 service
  singleton。
- 每个 detached window 使用自己的 `ownerDocument` 键盘、pointer、composition
  和 blur listener。
- runtime 记录每个 `ownerDocument` 当前最前且可见的 Peak Surface。通过命令或
  快捷键打开 Surface 后，即使 `activeElement` 仍在旧触发器或 `body`，Option/Alt
  也必须解析到新 Surface，不得要求先鼠标点击。
- `Peak: Show keyboard map` 不再注册到 Command Palette。
- Composer phase 2 复用同一个 `PeakKeyboardRuntime` 和 `ownerDocument` 契约；不得建立
  第二套 runtime。
- Windows `Alt` 可能与 Electron 菜单激活冲突，必须在真实 Windows Obsidian 中
  验证 keyup preventDefault 是否足够；验证前不得宣称 Windows host acceptance。

## 5. 验收

- 在五个 Surface 的编辑区和非编辑区轻按修饰键都能显示 viewport 提示；焦点保持不变。
- 按住修饰键 180ms 后在松键前显示；快速轻按仍在松键时显示。
- 从命令/快捷键打开 Search、Atlas、Studio 后，不点击鼠标即可显示提示。
- Vault Search / AI Search 和 Atlas Tree / Graph 均可连续双向往返。
- Search 结果 `ArrowRight` 打开并进入 Inspector；Inspector `ArrowLeft` 和 `Escape`
  均关闭 Inspector，并恢复到准确来源行。Inspector 打开时 footer 必须把提示从
  `→ inspector` 切换为 `← close inspector`。
- 每个可见精确控件提示键立即执行一次目标动作，不需要补按 `Enter`；输入框和区域入口
  只移动 `activeElement`，不得误执行。
- 同一可见上下文内键位必须唯一；不得因为重复键位让后出现的按钮静默失去提示。
- 修饰键组合、AltGraph、IME 不误触发。
- `Escape`、点击和窗口失焦清理所有提示节点与临时 class。
- 源码、命令清单和模板中不存在生产 `?` map 或 F6 Zone 循环入口。
- focused keyboard contracts、Command Gateway contract 和 production build 通过。
