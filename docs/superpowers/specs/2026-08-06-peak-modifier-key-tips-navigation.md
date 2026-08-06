# Peak Modifier Key Tips Navigation

日期：2026-08-06
状态：Owner-approved implementation contract
范围：Vault Search、AI Search、File Atlas、Chat Studio
不在范围：Composer、全局 Obsidian 页面、Windows 键、可搜索快捷键 modal

## 1. Owner correction

本规格取代 `2026-07-24-peak-keyboard-navigation-system.md` 中面向用户的
`?` keyboard map、`F6 / Shift+F6` Zone 循环和 `Focus next/previous zone`
语言。内部仍可使用焦点分组、书签和顺序来实现恢复与 roving focus，但不得把
`Zone` 暴露为用户心智模型。

## 2. 激活契约

- macOS：单独轻按并松开 `Option`。
- Windows / Linux：单独轻按并松开 `Alt`。
- 修饰键按下到松开之间如果出现其他按键，本次手势视为普通组合键，不显示
  Key Tips，也不得吞掉字符或宿主快捷键。
- `AltGraph`、按键重复、IME composition 和 `Process` 事件不激活 Key Tips。
- 激活在搜索框、聊天输入框和其他编辑控件中同样有效；它不输入字符，也不移动
  当前焦点。
- 再次轻按修饰键、按 `Escape`、点击、窗口失焦或开始 IME composition 都关闭
  Key Tips。

## 3. 展示与导航契约

Key Tips 是附着在当前 Surface 真实目标上的非交互原位提示，不是 modal、drawer
或独立焦点层。只展示当前可见目标；隐藏的 Inspector、Outline、Selection tray
不产生空提示。

| Surface | Key Tips |
|---|---|
| Vault Search | `M` Search mode；`Q` Search；`F` Filters and view；`R` Results；`D` Details |
| AI Search | `Q` Ask AI；`S` Suggestions and history；`A` Activity and sources；`R` Result；`O` Outline；`C` Result actions |
| File Atlas | `F` Files；`V` View and filters；当前 Tree 显示 `T`，当前 Graph 显示 `G`；`I` Inspector；`S` Selection tray |
| Chat Studio | `C` Conversations；`M` Messages / Chat content；`Q` Chat input；`I` Conversation index |

按提示键后：

1. Key Tips 立即关闭；
2. 焦点进入目标内上次使用的位置；没有书签时进入该目标的活动行、文本框或首个
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
- `Peak: Show keyboard map` 不再注册到 Command Palette。
- Composer 不注册到 `PeakKeyboardSurfaceId`，本任务不修改任何 Composer 文件。
- Windows `Alt` 可能与 Electron 菜单激活冲突，必须在真实 Windows Obsidian 中
  验证 keyup preventDefault 是否足够；验证前不得宣称 Windows host acceptance。

## 5. 验收

- 在四个 Surface 的编辑区和非编辑区轻按修饰键都能显示原位提示；焦点保持不变。
- 每个可见提示键把 `activeElement` 移到对应目标。
- 修饰键组合、AltGraph、IME 不误触发。
- `Escape`、点击和窗口失焦清理所有提示节点与临时 class。
- 源码、命令清单和模板中不存在生产 `?` map 或 F6 Zone 循环入口。
- focused keyboard contracts、Command Gateway contract 和 production build 通过。
