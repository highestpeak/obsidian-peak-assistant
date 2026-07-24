# Peak Assistant 全键盘导航研究

日期：2026-07-24  
状态：**Research complete / design input only**  
覆盖：Vault Search、AI Analysis、File Atlas、Composer View、Chat Studio  
明确不覆盖：Usage Dashboard、Setup Wizard、Settings

> 这不是实现完成证明，也不是一张要逐项照抄的快捷键表。本文负责说明：什么规律值得进入 Peak Assistant，什么做法不应采用，以及为什么最后选择一套分层导航语法。

## 1. 研究问题与结论

研究问题不是“还能加哪些快捷键”，而是：

> 怎样让五个结构完全不同的工作区都可以只用键盘完成主任务，同时让用户只需学习一套心智模型？

结论是：

1. **可达性不能依赖记住快捷键。** 所有动作首先要能通过焦点导航到达；快捷键只负责加速高频路径。
2. **用三个尺度消除长 Tab 链。** `F6 / Shift+F6` 切工作区区域，`Tab / Shift+Tab` 切区域内组件，方向键切组件内元素。
3. **一组稳定动词比大量字母键更容易迁移。** 方向键移动，`Enter` 打开/执行，`Space` 选择/切换，`Shift+F10` 打开上下文动作，`Escape` 退一层。
4. **编辑器必须优先拥有输入键。** 在输入框、Composer、表格单元格和内容编辑器里，字符、方向键、`Tab`、`/`、`?` 默认属于编辑行为；应用级导航不能偷走它们。
5. **几乎所有元素可达，不等于每个元素都是 Tab stop。** 列表、树、tablist、toolbar、grid 和图谱都应作为 composite widget，只给当前活动项一个 Tab stop。
6. **学习机制是系统的一部分。** 搜索式快捷键地图、菜单/tooltip 的键位提示、上下文提示和可自定义键位，比额外增加几十个默认快捷键更重要。

正式契约见：

- [Peak Keyboard Navigation System](../../superpowers/specs/2026-07-24-peak-keyboard-navigation-system.md)
- [视觉导航报告](../../gstack/keyboard-navigation-system-2026-07-24/index.html)

## 2. 方法与证据边界

本轮使用四类证据：

1. **当前产品源审计**：阅读五个工作区的生产组件、现有 keyboard handler、a11y tests 和已接受设计文档。
2. **学术研究**：关注快捷键熟练度、学习成本、记忆映射和渐进教学。
3. **产业模式**：比较 VS Code、Linear 和 Obsidian 如何处理区域跳转、composite widget、命令发现和键位定制。
4. **公开用户反馈与无障碍调查**：WebAIM 调查、Obsidian 论坛与社区讨论。

“用户调研”在本轮是**二手定性研究**，不是 Peak Assistant 用户访谈，也不是代表性统计研究。社区帖子只用于识别反复出现的摩擦点；不能拿它们宣称“用户都希望这样”。正式上线前仍需要一轮一手可用性测试，见 §9。

## 3. 当前产品审计：问题不是没有快捷键，而是没有统一层级

### 3.1 Vault Search / AI Analysis

当前已经有结果上下移动、打开结果、打开 Inspector、切换分析模式等局部操作，但事件分散在 modal、input 和结果组件里。特别是：

- Search 输入区域用 `Tab` 直接切 Vault Search / AI Analysis，导致 `Tab` 无法稳定承担“下一个组件”；
- 结果列表的方向键行为由较高层监听，输入状态与结果导航容易相互争用；
- AI Analysis 中仍有可点击 `div` 和没有清晰 composite 语义的报告/来源元素；
- 当前局部快捷键需要用户分别学习，无法迁移到 File Atlas 或 Chat Studio。

### 3.2 File Atlas

树节点和文件行已有 `Enter / Space` 行为，但大量行都进入 Tab 顺序。长文档会形成非常长的 Tab 链，和树的标准方向键心智不一致。Tree、Graph、Inspector、Selection Tray 也还没有同一套区域跳转方式。

### 3.3 Composer View

这是冲突风险最高的工作区。文档文本、slash menu、表格、图片、block 操作和 Intelligence sidecar 都需要键盘，但文本编辑器必须保留原生编辑语义。仅靠全局 hotkey 会破坏输入法、文本选择、表格编辑和 Obsidian/CodeMirror 既有键位。

### 3.4 Chat Studio

Conversation Index 的 tablist 已经采用 roving `tabIndex` 和左右方向键；splitter 也已有方向键、`Home / End` 与重置行为。这两处应成为共享模式的起点。

左栏会话/项目行目前仍各自进入 Tab 顺序；中栏消息、Composer、右栏 Outline / Resources 之间缺少一个跨栏心智模型。新消息到达、drawer 关闭和 detached window 还要求严格的焦点保持与恢复。

### 3.5 审计判断

现有代码不是“键盘完全不可用”，而是**局部可用、整体不可预测**。设计不应推倒已有正确行为，而应：

- 保留已经符合平台习惯的局部行为；
- 把列表、树、tabs、toolbar、grid 统一成 composite；
- 在其上增加稳定的区域层和上下文 dispatch 规则；
- 移除同一按键在相同焦点状态下的竞争所有权。

## 4. 学术研究

### 4.1 熟练后快捷键更快，但早期存在 crossover

Lane 等人的实验表明，菜单和快捷键的优势会随练习发生交叉：用户需要经过相当数量的重复后，快捷键才稳定快于菜单。研究也指出，快捷键能否被顺利提取与采用有关。

产品含义：

- 不能因为快捷键最终更快，就强迫新用户立即放弃按钮和菜单；
- 必须保留 pointer 路径和命令搜索；
- 教学应嵌入真实动作附近，而不是只放一份文档。

来源：[With practice, keyboard shortcuts become faster than menu selection: A crossover interaction](https://pubmed.ncbi.nlm.nih.gov/26651347/)

### 4.2 快捷键学习需要 discovery、rehearsal 与 feedback

Grossman、Dragicevic 和 Balakrishnan 的 Hotkey 研究指出，快捷键学习很慢；在菜单使用过程中提供快捷键提示、反馈和过渡机制，可以提高学习。它支持“继续允许点菜单，但在菜单旁暴露键位”的渐进路径。

产品含义：

- 菜单项、command palette、tooltip 和空状态应显示当前绑定；
- 第一次使用鼠标动作后可以给安静的键位提示；
- 提示不能延迟点击或制造 productivity dip。

来源：[Strategies for Accelerating On-line Learning of Hotkeys](https://doi.org/10.1145/1240624.1240865)

### 4.3 空间/逻辑映射能提高记忆

Lewis 等人的 KeyMap 研究把快捷键映射到键盘空间，在 98 人研究中改善即时与 24 小时后的回忆。论文同时把采用过程概括为动机、发现、练习和记忆几个阶段。

产品含义：

- 五个工作区的可选数字 preset 应按稳定工作流排列：搜索 → 分析 → 文件结构 → 编辑 → 对话；
- 核心导航优先使用方向性明确的 `F6`、方向键和 `Escape`，少用任意字母；
- 快捷键地图必须按工作区与区域组织，而不是按字母排序。

来源：[KeyMap: Improving Keyboard Shortcut Vocabulary Using Norman’s Mapping](https://blainelewis.ca/static/402184a0e0a48316455cbd92cdec9c83/keymap.pdf)

### 4.4 研究综合

学术证据支持的不是“快捷键越多越好”，而是：

```text
可以只用导航完成
        ↓
动作旁能发现键位
        ↓
反复使用得到反馈
        ↓
少量稳定键位进入记忆
```

因此正式设计把“大量直接 hotkey”降为可选加速层，把三层导航与发现机制放在核心层。

## 5. 产业研究

### 5.1 W3C APG：Tab 在组件间，方向键在组件内

W3C ARIA Authoring Practices 明确区分：

- `Tab / Shift+Tab`：在组件之间移动；
- 方向键：在 radio group、tabs、menu、grid、tree 等 composite 内移动；
- composite 通常只有一个元素进入 Tab 顺序；
- 重回 composite 时落到上次焦点、选中项或第一个元素；
- 焦点与选择是两个不同状态；
- 加载代价高的 tabs 不应随着焦点自动激活；
- 快捷键不能替代基本键盘导航。

这成为 Peak 统一语法的规范底座。

来源：[W3C APG — Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

### 5.2 VS Code：F6 负责跨区，Tab 负责组件，箭头负责内部

VS Code 的工作台提供：

- `F6 / Shift+F6` 在 workbench parts 之间移动；
- toolbar 和 tablist 各只占一个 Tab stop，进入后用方向键；
- Command Palette 提供完整命令发现；
- 编辑器中 `Tab` 默认继续输入缩进，并允许显式切换 “Tab moves focus”。

这与 Peak 的多栏、编辑器和 Obsidian 宿主非常接近。Peak 不应造一套陌生的 pane-cycle 字母键。

来源：[VS Code Accessibility — Keyboard navigation](https://code.visualstudio.com/docs/configure/accessibility/accessibility)

### 5.3 Linear：高频列表有直接键，但仍保留上下文动作入口

Linear 在 issue 列表中使用上下方向键或 `J / K` 移动，高亮与选择分开，`Escape` 清除选择，`Cmd/Ctrl+K` 打开上下文动作。它说明高频列表可以有加速键，但这些键应建立在明确的 focus / highlight / selection 模型上。

Peak 的取舍：

- 采用方向键、选择和上下文动作的结构；
- 不把 `J / K` 设为全局核心，因为 Composer 与文本输入需要字符所有权；
- 将 Vim-style 键位保留为未来可选 preset。

来源：[Linear — Select issues](https://linear.app/docs/select-issues)

### 5.4 Obsidian：宿主负责全局键位，插件应提供可绑定命令

Obsidian 允许用户在 Hotkeys 中查看、搜索和自定义命令键位。Peak 因此不应静默抢占一组全局组合键，而应：

- 注册稳定的“聚焦某工作区 / 显示键盘地图”命令；
- 默认不强绑高冲突全局键；
- 提供一次性、可撤销、先检测冲突的 Peak Workspace preset；
- 在 detached window 中使用当前 surface 的 `ownerDocument / defaultView`。

来源：[Obsidian Help — Hotkeys](https://obsidian.md/help/hotkeys)

### 5.5 富文本选区工具栏

用户提供的 Composer 参考图包含一条 selection-scoped floating toolbar：格式、链接/标记、复制、评论以及润色/精简/扩写/问 AI。它不能只靠选中文本后用鼠标点击。

[W3C Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) 建议：

- toolbar 作为一个 composite，只占一个 Tab stop；
- horizontal toolbar 用 `Left / Right` 移 control；
- `Home / End` 到边界；
- `Enter / Space` 激活；
- 从 editor text area 快速进入 toolbar 时，应提供一枚有文档说明的 focus shortcut。

[CKEditor 5 Accessibility](https://ckeditor.com/docs/ckeditor5/latest/features/accessibility.html) 把这枚快捷键具体化为 `Alt+F10`（macOS `⌥F10`），用方向键在 toolbar 内移动、`Enter / Space` 执行、`Escape` 返回 editor。它还把 keyboard help 作为可发现能力，而不是假定用户记住全部键位。

Peak 的转译：

- selection toolbar 属于 Composer 的 `CV3 Contextual controls`；
- 选区形成时 toolbar 视觉出现但不抢 focus；
- `Alt/⌥+F10` 是从 editor selection 进入 toolbar 的快速路径，`F6` 仍是跨 Zone 路径；
- toolbar 内使用 roving focus、左右键、`Home / End`、`Enter / Space`；
- `Escape` 返回原 selection/caret；
- AI 动作生成候选与 review，不直接覆盖 Markdown；
- 已存在的 Bold / Italic / Link editor shortcut 显示实际绑定，但不再为每个按钮制造全局默认键。

## 6. 用户研究

### 6.1 WebAIM 屏幕阅读器调查

WebAIM 的调查中，76% 受访者在有 headings 时总是或经常使用 heading navigation；专家用户比例为 90.7%。超过一半受访者总是或经常使用搜索；熟练用户更常直接跳到 form 或 text field，而不是逐项 Tab。

产品含义：

- AI Analysis 报告、Chat Outline 和长文档需要真实 heading / landmark 结构；
- Vault Search 的 query input 必须能通过 surface command 和区域导航快速聚焦；
- “所有东西都塞进 Tab 链”对熟练辅助技术用户并不高效。

来源：[WebAIM — Survey of Preferences of Screen Readers Users](https://webaim.org/projects/screenreadersurvey/)

### 6.2 Obsidian 社区定性样本

公开讨论反复出现三类需求：

1. 在 editor、sidebars、panes 之间可靠切换焦点；
2. 列表、表格和 Bases 中使用方向键导航并用 `Enter` 打开/编辑；
3. 在不同软件之间尽量保持相同的切换与折叠键位。

参考样本：

- [Obsidian Forum — request for F6-style controls](https://forum.obsidian.md/t/add-ability-to-use-keyboard-controls-for-settings-and-f6-to-switch-between-them/98461)
- [Obsidian Forum — keyboard navigation in menus](https://forum.obsidian.md/t/keyboard-navigation-in-settings-menu-plugin-menu/25787)
- [Obsidian Reddit — pane focus discussion](https://www.reddit.com/r/ObsidianMD/comments/14zdaha/)
- [Obsidian Reddit — full keyboard control for Bases](https://www.reddit.com/r/ObsidianMD/comments/1m3ok8w/)

这些帖子用于识别需求形状，不代表样本统计。它们与 W3C、VS Code 和当前产品审计共同指向同一问题：**用户最缺的是可预测的焦点路径，不是再多十个隐藏 hotkey。**

## 7. 研究转译：Peak 应采用什么

| 研究信号 | 设计转译 |
|---|---|
| Tab 链太长会让复杂 UI 低效 | composite 只给一个 Tab stop |
| 多栏工具需要快速跨区 | `F6 / Shift+F6` 切区域 |
| 方向键心智已经跨平台稳定 | list/tree/tab/grid 按 APG 使用方向键 |
| 焦点与选择容易混淆 | focus、selection、active/preview 三种视觉状态分开 |
| 快捷键采用需要发现与练习 | `?` 搜索式键盘地图 + 菜单/tooltip 显示当前绑定 |
| 编辑器快捷键冲突最危险 | editor-first dispatch；字符和输入键不被 surface 抢占 |
| 全局键位受宿主和 OS 影响 | Obsidian command 可绑定；preset opt-in 且先查冲突 |
| 屏幕阅读器用户依赖结构跳转 | 五个工作区定义 landmarks、headings、lists、trees 与状态播报 |
| 自动加载会使 selection follows focus 变慢 | 高代价 tab/report 只移动焦点，`Enter / Space` 后才激活 |

## 8. 明确不采用

1. **不给每个按钮分配字母键。** 记忆量和冲突都会失控。
2. **不把所有行都设成 `tabIndex=0`。** 长列表和树必须使用 roving focus。
3. **不在输入框中监听裸 `?`、`/`、字母或方向键作为全局命令。**
4. **不让 AI 完成、搜索刷新或新消息到达时偷走焦点。**
5. **不把 hover 状态当 keyboard focus，也不让 selection 冒充 focus。**
6. **不默认启用 Vim 模式。** 可作为未来 opt-in preset，但不是基础可达性。
7. **不声称已经做过 Peak 用户测试。** 本轮只完成研究与设计。

## 9. 一手用户验证计划

### 9.1 最小样本

- 2 位 keyboard-first Obsidian power users；
- 2 位键盘依赖、低视力或屏幕阅读器用户；
- 1 位熟悉 IDE / 高级编辑器的知识工作者。

五人足以发现主要交互断点，但不用于统计性结论。

### 9.2 核心任务

1. 从 Chat Studio 切到 Vault Search，搜索文件，进入 Inspector，再打开结果；
2. 在 AI Analysis 的 Process、Report、Sources 间移动，跳到一个报告 heading；
3. 在 File Atlas 找到一个表格 block，加入 Selection Tray，再进入 Copilot；
4. 在 Composer View 从正文进入 block navigation，移动到表格/图片，再进入 Intelligence sidecar 审阅建议；
5. 在 Chat Studio 从左栏项目进入消息、右栏 Outline，再回到 Composer，全程不用鼠标。

### 9.3 测量

- 无 pointer 任务成功率；
- 错层按键、快捷键冲突和焦点丢失次数；
- 每个任务的 `Tab` 次数与总按键数；
- `?` 键盘地图的首次发现时间；
- 核心键位的即时与 24 小时后回忆；
- 屏幕阅读器播报是否包含区域、控件、位置和状态；
- detached window、中文输入法和窄屏 drawer 的回归结果。

### 9.4 零容忍失败

- 任意 keyboard trap；
- focus indicator 不可见；
- 关闭 popup 后焦点回到 `body`；
- 导航键误改或丢失 draft；
- IME composition 被提交或截断；
- detached window 快捷键只在主窗口生效；
- AI 更新或新消息到达时焦点被异步抢走。

## 10. 最终研究判断

Peak Assistant 需要的不是“一个巨大的快捷键集合”，而是一套可组合的键盘接口：

```text
全局命令：进入工作区
F6：切区域
Tab：切组件
方向键：切元素
Enter / Space：行动
Shift+F10：更多动作
Escape：退一层
?：发现当前上下文的全部键位
```

这套语法能够覆盖用户要求的“界面上几乎所有元素都可以快捷键切换”，同时不会把五个工作区变成五套互不相干的记忆负担。
