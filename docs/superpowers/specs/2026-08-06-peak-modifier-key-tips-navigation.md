# Peak Modifier Key Tips Navigation

日期：2026-08-06
状态：Owner-approved implementation contract（视频复核修订）
范围：Vault Search、AI Search、File Atlas、Chat Studio
不在范围：Composer、全局 Obsidian 页面、Windows 键、可搜索快捷键 modal

## 1. Owner correction

本规格取代 `2026-07-24-peak-keyboard-navigation-system.md` 中面向用户的
`?` keyboard map、`F6 / Shift+F6` Zone 循环和 `Focus next/previous zone`
语言。内部仍可使用焦点分组、书签和顺序来实现恢复与 roving focus，但不得把
`Zone` 暴露为用户心智模型。

## 2. 激活契约

- macOS：按下 `Option`；Windows / Linux：按下 `Alt`。
- 按住超过 180ms 时直接显示 Key Tips，不再等待松键；快速轻按则在松键时显示。
- 按住显示后，松键保留 Key Tips，等待下一次普通字母选择。
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
| Vault Search | `V` Vault Search；`A` AI Search；`Q` Search；`F` Filters and view；`R` Results；`D` Details |
| AI Search | `V` Vault Search；`A` AI Search；`Q` Ask AI；`S` Suggestions and history；`L` Activity and sources；`R` Result；`O` Outline；`C` Result actions |
| File Atlas | `F` Files；`V` View and filters；始终同时显示 `T` Tree 与 `G` Graph；`I` Inspector；`S` Selection tray |
| Chat Studio | `C` Conversations；`M` Messages / Chat content；`Q` Chat input；`I` Conversation index |

按提示键后：

1. Key Tips 立即关闭；
2. 动作型目标先切换/打开对应标签，再把焦点送入目标；普通目标进入上次使用的
   位置；没有书签时进入该目标的活动行、文本框或首个
   可操作元素；
3. 屏幕阅读器 live region 宣读 Surface 和目标名称；
4. 后续继续遵守原生 `Tab`、方向键、`Enter`、`Space`、`Shift+F10` 和 `Escape`
   语义。

未知字母被 Key Tips 模式消费并通过 live region 报告，不插入当前编辑器；带
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
- Composer 不注册到 `PeakKeyboardSurfaceId`，本任务不修改任何 Composer 文件。
- Windows `Alt` 可能与 Electron 菜单激活冲突，必须在真实 Windows Obsidian 中
  验证 keyup preventDefault 是否足够；验证前不得宣称 Windows host acceptance。

## 5. 验收

- 在四个 Surface 的编辑区和非编辑区轻按修饰键都能显示 viewport 提示；焦点保持不变。
- 按住修饰键 180ms 后在松键前显示；快速轻按仍在松键时显示。
- 从命令/快捷键打开 Search、Atlas、Studio 后，不点击鼠标即可显示提示。
- Vault Search / AI Search 和 Atlas Tree / Graph 均可连续双向往返。
- Search 结果 `ArrowRight` 进入 Inspector，Inspector `ArrowLeft` 返回准确来源行，
  `Escape` 关闭并恢复来源行。
- 每个可见提示键把 `activeElement` 移到对应目标。
- 修饰键组合、AltGraph、IME 不误触发。
- `Escape`、点击和窗口失焦清理所有提示节点与临时 class。
- 源码、命令清单和模板中不存在生产 `?` map 或 F6 Zone 循环入口。
- focused keyboard contracts、Command Gateway contract 和 production build 通过。
