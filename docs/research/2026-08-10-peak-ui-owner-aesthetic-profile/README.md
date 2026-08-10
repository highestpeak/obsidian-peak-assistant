# Peak UI Owner Aesthetic Profile

> 从 Codex 历史对话中挖掘出的 Peak Assistant UI 审美偏好、设计边界与评审规则

- 状态：research synthesis · design input · no implementation
- 语料窗口：2026-04-11 → 2026-08-10
- 最后更新：2026-08-10
- 阅读量：约 1.9 万字符 · 约 40 分钟（含证据表与 checklist）
- 主要读者：Peak owner、Design System 维护者、Theme 设计者、后续 Codex / Claude Code 设计与评审任务
- 用途：指导 Peak Theme、共享组件、Composer、Search、Graph、File Atlas、Chat / Intelligence、Settings 等界面的设计与验收

## 结论先行

你的核心审美不是“极简”“圆润”“紫色 AI 风格”或“完全照抄设计稿”，而是：

> **在高信息密度的知识工作界面里，用尽量少的视觉噪声，建立足够清楚的结构、状态与操作线索。**

本文把它简称为“低噪声的高密度清晰性”。这是对历史反馈的综合推断，不是你曾经使用过的产品术语。

它包含五个稳定要求：

1. **真实**：先尊重 Peak 已有产品结构、真实数据和真实交互状态，再讨论主题风格。
2. **克制**：边框、卡片、图标、颜色、圆角、阴影和动画都要有明确角色，不能为了“像 UI”而堆叠。
3. **紧凑但不拥挤**：减少无意义空白、缩进和重复标题，同时保留可点击尺寸与阅读节奏。
4. **近场交互**：动作应贴近当前文档、当前 block、当前结果或当前输入，而不是把用户带到远处的第二套面板。
5. **系统一致**：同一角色的输入框、按钮组、菜单、hover、selected、radius 和 motion 应共享语言；不同工作面的信息架构仍可以不同。

最容易误读的一点是：你并不主张“全部扁平化”。你既反复批评“边框太多、堆叠很烦”，也明确指出“全部去掉边框后文字堆在一起没有层级”“没有目录层级线也很怪”。因此正确规则不是少边框，而是：

> **只保留承担分组、层级、选择、浮层或交互边界的线和 surface。**

## 这份文档解决什么

历史上很多 UI 偏差并不是缺少 CSS 技巧，而是缺少一份能回答以下问题的 owner-level 判断基准：

- 什么样的“简洁”才是 Peak 的简洁？
- 什么时候应该有边框、卡片、圆角和阴影？
- 什么时候应该隐藏动作，什么时候又必须让用户看出可点击？
- Theme 可以改变什么，不能改变什么？
- Composer、Graph、Search、Dashboard 为什么不能用同一张 generic mock 代替？
- Theme Lab 需要多真实，生产界面验收又需要多真实？
- Obsidian 宿主样式应该参与多少？

本文不定义最终色值、字号、radius 数值或组件 API。那些属于 Design System / Theme Schema 的后续设计。本文定义它们必须服从的审美意图与验收边界。

## 语料范围与方法

### 覆盖范围

本轮扫描了本机当前可访问的 Codex rollout 归档，并用 Codex task 列表与重点 task 回读做交叉确认。

| 指标 | 数量 | 说明 |
| --- | ---: | --- |
| 本机 rollout 文件 | 353 | 当前可访问的全部本机 Codex 归档文件 |
| Peak 相关 task | 279 | 272 个直接位于插件 cwd；7 个位于上层 repo 且正文含 Peak surface 语义 |
| 清洗后的用户 turns | 3,918 | 移除 AGENTS、内部 goal continuation、ambient browser state 等注入文本后 |
| UI / 视觉 / 交互候选 turns | 804 | 自动召回后按 task + 原文去重；一个 turn 可进入多个类别 |
| 明确纠偏 turns | 494 | 包含“不对、太多、错位、丑、廉价、不需要”等直接负向判断 |
| 明确方向 turns | 412 | 包含“应该、希望、需要、保持一致、默认、原地”等期望表达 |

“明确纠偏”和“明确方向”可以出现在同一个 turn 中，因此两者相加会大于候选 turns 总数。

语料集中度：804 个候选 turns 中，2026 年 7 月为 330 个，8 月截至 10 日为 206 个；约 67% 来自最近两个月的密集 UI 设计与回归审查。

### 清洗与编码

1. 只读取用户消息，不把 assistant 的解释当成 owner 偏好。
2. 排除被记录为 user role 的 AGENTS、内部 goal continuation 和工具注入上下文。
3. 对 browser annotation 只保留 `Comment` 中的实际用户意见，尽量去掉 selector、坐标和附近页面文本。
4. 同一条消息可以同时编码为密度、层级、交互和验收方法，因此各类别数量不能相加为总数。
5. 频次用于识别反复出现的主题，不把单次情绪强度当成权重。
6. 最终原则还要通过反例校验：如果历史中存在相反意见，就改写成带条件的规则，而不是挑一边写成绝对偏好。

### 覆盖限制

- 这里的“全部”指 2026-08-10 本机仍可访问的 Codex 归档；已删除、仅在其他设备、未同步或云端不可读取的 task 不在统计中。
- 有些 turn 会粘贴旧 handoff 或 assistant 输出。量化统计保留其检索价值；定性结论优先采用第一人称纠偏、browser comment、录屏说明和反复出现的短句。
- “出现次数”不是严格语言学计数。长消息只要命中一次某类别，就按该类别一个 turn 计算。

## 定量画像

### 主要反馈类别

| 类别 | turns | tasks | 读出的稳定信号 |
| --- | ---: | ---: | --- |
| 交互与状态可见性 | 411 | 111 | 可点击、hover、menu、selected、fold、focus、drag 等必须有真实反馈 |
| 克制与信息层级 | 214 | 69 | 反对重复、平铺、大杂烩、卡片墙和同时争抢注意力的控件 |
| 密度、间距与布局 | 201 | 69 | 反对大片空白、错位、过深缩进、无意义 padding 和遮挡 |
| 验收与来源真实性 | 201 | 90 | 设计稿、真实 UI、截图、录屏和 real Obsidian 状态是重要依据 |
| 产品还原与场景真实性 | 152 | 66 | 不接受拿 generic component 重新想象 Composer / Graph / Search |
| 导航与工作面构成 | 114 | 62 | 入口、toolbar、sidecar、drawer、sticky 与 viewport 层级需服从工作流 |
| 颜色与 Theme | 69 | 33 | 主题要可变、颜色要可分辨，语义不能只靠颜色表达 |
| 边框、卡片与阴影 | 49 | 30 | 反对多层嵌套和重复描边，但保留必要结构线与浮层边界 |
| Motion | 27 | 17 | 反对生硬切换和无反馈等待；motion 应解释状态而非充当 AI 装饰 |
| Radius 与形状 | 20 | 13 | 关注同类控件的一致性，也反对结构面板被过度圆角化 |
| Typography | 20 | 15 | 字体、字号、行高和文字长度共同决定“成品感”或“草稿感” |
| Obsidian 样式隔离 | 9 | 7 | 数量较少但指令强度高：Peak-owned DOM 应拒绝宿主视觉继承 |

类别频次表明：最常出现的并不是“颜色不好看”，而是**交互状态、信息层级、空间组织和真实来源**。因此只换 palette 不会让 Peak 看起来更高级。

### 高频原词

以下是清洗后候选语料中的直接词组计数。它们不是独立原则，但能显示哪些问题不断重现。

| 原词 / 词组 | 提及次数 | 涉及 tasks |
| --- | ---: | ---: |
| “太多” | 92 | 31 |
| “悬浮” | 84 | 29 |
| “设计稿” | 71 | 19 |
| “统一” | 63 | 27 |
| “真实” | 56 | 25 |
| “颜色” | 42 | 16 |
| “动画” | 25 | 13 |
| “错位” | 24 | 15 |
| “空白” | 22 | 12 |
| “圆角” | 20 | 9 |
| “字体” | 17 | 6 |
| “不一致” | 11 | 8 |
| “廉价感” | 9 | 5 |

“廉价感”虽然只有 9 次，但语义非常集中：它通常与小而随意的图标、生硬切换、错误 tab 分区、字体、间距和边框组合在一起，而不是单指某个色值。

## 你的审美原则

下面每条都区分三层：

- **事实**：历史对话中反复出现的直接反馈。
- **解释**：从事实推断出的审美需求。
- **约束**：Design System / Theme / 产品 UI 后续应执行的规则。

### P01 · 产品真实优先于 generic polish

**事实**

- 你多次用“和设计稿差距很大”“买家秀和商品介绍的区别”描述实现偏差。
- Composer 需要真实 Markdown 长文、图片、表格、公式、Canvas / Base / Excalidraw 等真实材料，而不是空壳占位。
- Search、File Atlas、Graph、Composer 的 Theme 试件如果缺数据、缺 graph、缺超长 list 或错位，就无法判断主题是否真的成立。

**解释**

你对“高级感”的判断首先来自产品结构是否可信。组件即使精致，只要数据密度、元素数量、交互状态或工作流与真实产品不同，整体仍然像概念图。

**约束**

- 新设计先建立 `reference → source component / approved mock → representative fixture` 的来源链。
- 不允许凭通用 dashboard、聊天框或节点图重新发明 Peak surface。
- Theme Lab 不必像素级复制完整产品，但必须覆盖真实的结构压力、内容密度和关键状态。
- Production parity 与 Theme feel 是两个验收模式，不能混成一个模糊的“看起来差不多”。

### P02 · 高密度，但低噪声

**事实**

- “太多”“太乱”“一堆罗列”“卡片堆叠”“字还是太多”在多个 surface 重复出现。
- 你不喜欢 Intelligence 变成企业后台式卡片墙，也不喜欢 Chat input、Command Center 和 File Atlas 同时摊开过多动作。
- 你又要求 Composer 具有丰富长文、Graph 有真实节点与关系、Theme Lab 覆盖超长 list 和 dashboard 压力。

**解释**

你不是追求低信息量，而是反对**低价值 UI chrome 占据与内容同等的视觉权重**。Peak 可以复杂，但复杂性应来自用户的资料、关系和任务，而不是装饰层。

**约束**

- 内容密度可以高；长期常驻的控件密度必须低。
- 默认只展示当前上下文最相关的 2–3 个动作，其余进入可搜索 menu / capability picker。
- 重复标题、重复摘要、重复 icon、重复统计和重复容器只保留一个最有用表达。
- 不把所有能力做成等权卡片、等权大图标或永久 action row。

### P03 · 边界按角色存在，不按习惯存在

**事实**

- 你多次说“边框太多了”“内部为什么还有个边框”“message 不喜欢那么多边框”。
- 你也明确说过，边框全去掉后“有点堆叠字”“没有目录层级线又很怪”。
- 对输入、dialog、popover、selected block、层级树和浮层，你仍然会要求清楚边界。

**解释**

你反对的不是 border 本身，而是**同一信息被外层 card、内层 card、row、input 再描四次**。没有作用的线会增加视觉熵；承担结构的线则不可省。

**约束**

- 页面分区优先靠空间、排版和背景层级；不要默认套 card。
- 分隔线用于连续内容中的层级或 row 边界。
- 完整 border 用于独立浮层、输入、明确选区、拖拽边界和需要从背景中脱离的对象。
- shadow 只表达 elevation，不替代普通分组，也不与重 border 同时堆叠。
- 禁止 `surface → card → card → bordered row → bordered input` 的多重套娃。

### P04 · 留白必须解释信息关系

**事实**

- 历史里反复出现顶部大片空白、Graph 画布空白、link 左侧空白、block 间距太大、list 缩进太深、侧栏输入离内容太远等纠偏。
- 你也会指出按钮过小会难点击、内容过密会遮挡。
- Folder Tree 的右侧空白可以放 Hub，但前提是 Hub 本来就不是目录层级的一部分。

**解释**

你接受“让内容呼吸”的留白，但不接受无法说明分组、节奏或未来内容的空洞区域。空间应编码关系，而不是填版面。

**约束**

- 每个大于常规 section gap 的空白都必须回答：它在分组、对齐、预留状态，还是浪费空间？
- 紧凑指减少视觉占位，不等于缩小 hit target。
- 缩进只表示真实层级；换行不能制造假层级。
- 右侧 / 下方剩余空间只有在语义相邻且不会破坏扫描顺序时才承载辅助内容。
- responsive 变化不能把 sidecar 掉到正文下面或让 drawer / sticky 互相遮挡。

### P05 · 统一的是角色语言，不是所有页面长得一样

**事实**

- 你要求 Chat 与 Intelligence input 保持一致，block actions 的 radius / background 保持一致，List / Tree / Graph 的 segmented control 保持一致。
- 你又明确区分 Copilot、Ambient、History：视觉语言一致，但信息架构与工作不同。
- 你反对把所有不同 surface 做成同一种 card dashboard。

**解释**

你要的是“系统感”，不是“模板感”。同一 role 应有同一视觉合同；不同任务仍需要自己的信息形态。

**约束**

- Button、IconButton、Input、Segmented、Tabs、Menu、Popover、Dialog、ListRow、Chip、SelectionSurface 先按 role 统一。
- 组件复用不应改变场景结构；Graph canvas、Markdown document 和 Settings rows 不强制共用同一 layout。
- 同一状态使用同一 hover / selected / focus / disabled / loading 语义。
- 不按“外形差不多”复用组件，按交互承诺和语义角色复用。

### P06 · 圆角用于局部控制与可触对象，不用于抹平结构

**事实**

- 你持续关注 button group、AI action panel、输入框和 sibling actions 的圆角是否一致。
- 你对 docked Intelligence 顶部提出“不要用这种圆角”“方框和左侧贴合起来”。
- 你不满意多个大圆角容器层层包裹产生的“廉价 UI”感。

**解释**

你对圆角的偏好是结构化的：局部、独立、可点击对象可以柔和；与 viewport、sidebar、document edge 贴合的结构面不该像漂浮气泡。

**约束**

- chip、compact control、segmented selection、独立 popover 可使用较明显圆角。
- input、small card、dialog 使用分级 radius，不能全部 pill 化。
- docked panel、full-width section、连续 list 和贴边结构应使用较小 radius 或按相邻边清零。
- 同一 control family 的 radius、height、padding 和 selected geometry 必须共同定义。

### P07 · Theme 是语义替换，不是 accent 换皮

**事实**

- 你明确要求 Peak 可以定义和切换自己的 Theme，支持 Light / Dark、density、radius 等参数。
- 你指出紫色与蓝色难区分、颜色不能单独承担区分、没有 show 时不应只换颜色而应直接移除 check。
- 你希望复制 Theme JSON 后由 Codex / LLM 对固定 scene atlas 做主题替换，而不是单独生成一张脱离系统的图。

**解释**

你把 Theme 当成全局视觉规则的可替换实现，而不是品牌色选择器。一个主题必须在不改变结构和行为的情况下，让所有真实 fixture 同步变化。

**约束**

- Theme 只提供语义 token：canvas、surface、text、border、accent、status、focus、shadow、motion、radius、density、typography family 等。
- color 不能是状态的唯一编码；同时使用形状、icon、文字、位置或显隐。
- Theme 不得增加、删除或重排产品元素，不得重写组件行为。
- Light / Dark 都必须在相同 fixture 与状态上验收；高对比与 reduced motion 是独立维度。
- Theme JSON 缺失或非法时回退 Peak Default，不回退 Obsidian theme。

### P08 · 可交互必须看得出，低频动作不必一直摊开

**事实**

- “为什么不可以点击”“看不出来可以点击”“折叠之后还要能点击”“点了不知道是啥”反复出现。
- 你要求 hover 提示、selected state、小菜单、展开 / 折叠、固定 / 取消固定、loading 和流式状态真实可用。
- 你也多次要求隐藏无用常驻按钮，使用 hover 或 selection 后再出现。

**解释**

你不是要求所有动作永久可见，而是要求**用户在需要动作的那个时刻能立刻发现、理解并验证动作**。

**约束**

- 主动作常驻；上下文动作在 hover、focus、selection 或 active block 时出现。
- hover-only 动作同时提供 keyboard focus 路径；不能只服务鼠标。
- icon-only 控件必须有熟悉图形、tooltip、`aria-label` 和明确 active state。
- 点击设置类 icon 时就地打开小 menu / popover，不能只暗改状态。
- collapsed state 可缩为 icon rail，但必须保持可操作、可识别、可展开。
- loading、streaming、success、error、empty、disabled 都是组件合同，不是后来补的样式。

### P09 · Motion 解释连续性，不制造“AI 感”

**事实**

- 你批评过 tab / view 切换生硬、指令输入出现没有淡入过渡、扫描和生成让用户干等。
- 你要求 streaming、处理中、关系流动等状态具有可见反馈。
- 你也接受这样的判断：AI 感来自知道当前对象、自动带上下文、结果回到原位，而不是装饰性渐变。

**解释**

你偏好功能性 motion：它说明对象从哪里来、状态如何变化、任务是否还在进行。与工作流无关的大幅位移、弹跳或渐变只会增加噪声。

**约束**

- hover / press 使用短反馈；popover / drawer 使用可追踪来源的淡入或位移；layout 变化保持对象连续性。
- streaming / scan / generation 明确展示进行状态、稳定前缀或阶段变化。
- 不用 motion 掩盖慢操作，也不让无限 shimmer 代替真实进度。
- reduced motion 下取消弹簧、大位移和循环装饰，保留必要状态变化。

### P10 · Composer 是文档，不是 dashboard 或 page builder

**事实**

- 你希望 Composer 保留 Markdown 的自然写作感，并真实展示长文、block、图片、表格、公式和附件。
- 你反对把多个文件预览挤成三列、给每段永久放同样的 AI 卡片，或再造与 Markdown 快捷键重复的字体大小控件。
- 你要求 AI 动作贴在当前 block 附近，结果回到正文原位；Intelligence 是贴着文档的 sidecar。

**解释**

Composer 的高级感来自“内容是第一层、工具懂当前内容、动作不打断阅读”。它不应看起来像拼装组件的后台编辑器。

**约束**

- 正文排版和内容宽度是第一优先级；工具栏、rail 和 sidecar 都不能抢正文层级。
- block chrome 默认安静，active / hover 后显露必要动作。
- AI action 必须针对 block kind 和当前语义推荐，不能所有 block 复制同一组按钮。
- 编辑、建议、diff、接受、拒绝尽量原地完成，并保留来源与回退。
- Theme fixture 必须包含真实 Markdown 压力：长段落、标题层级、列表、引用、code、table、media、selection、inline AI state。

### P11 · Graph 的美感来自关系可读，不是节点装饰

**事实**

- 你要求 Folder Tree 保留目录层级线，Graph 的箭头、曲线、长标签遮挡和 Hub 位置都能被理解。
- 你不接受用相近颜色单独区分社区、状态或 link type。
- 你质疑 Flow 等 layout 是否语义可靠，并认为不同布局会影响理解，不能为了选项多而全放出来。

**解释**

你把 Graph 看成解释关系的工作面，不是展示“有图谱能力”的视觉素材。结构、路径和选择反馈比节点皮肤重要。

**约束**

- List 用于找、比较、打开；Tree 用于层级；Graph 用于关系理解。切换共享 snapshot，但不混淆任务。
- edge 必须可追踪：方向、端点、selected path、弱 / 强关系和遮挡策略清楚。
- 层级线、link、community、hub 使用多通道编码，不只依靠颜色。
- layout 只有在语义稳定、标签可读、不会制造错误暗示时才开放。
- Graph fixture 必须覆盖长文件名、密集边、孤立节点、hub、community、hover card、selected path 和空结果。

### P12 · Peak 视觉系统必须独立于 Obsidian

**事实**

- 你明确说“obsidian 宿主的应该全部拒绝进入吧”。
- 你把历史样式回归归因于 Obsidian CSS 继承与东补一块西补一块的局部修复。
- 你要求 Peak 自己能设置 Theme，而不是受当前 Obsidian theme 摆动。

**解释**

Theme 稳定性是产品边界问题，不只是审美问题。只要宿主变量、reset、button geometry 或 portal style 仍能无登记地进入，任何主题截图都不是可靠承诺。

**约束**

- Peak-owned DOM 的颜色、字体、字号、行高、radius、shadow、control geometry、focus 和 motion 只来自 Peak resolved theme。
- Obsidian 只提供挂载、窗口 / viewport、明暗偏好和辅助功能等环境信号。
- 普通 root、portal、popover、dialog、popout 必须处在同一 Theme Boundary。
- light DOM 兼容区必须登记、可测试、可退休；不能继续无限添加局部 reset。
- hostile host theme 的 computed-style 验证属于 Design System 完成条件。

### P13 · 视觉验收必须匹配任务类型

**事实**

- 你经常要求看设计稿、真实 UI、截图或录屏，并追问哪个 session / commit 造成回归。
- 你也在 Theme Lab 迭代中修正：主题试件“不需要完全对应”，重点是看到整体感觉和覆盖足够多组件 / scene。

**解释**

你不是要求每个概念 mock 都像素级复制，而是反对用低保真假结构冒充产品验收。不同产物需要不同 fidelity contract。

**约束**

| 产物 | 必须真实到什么程度 | 不能声称什么 |
| --- | --- | --- |
| Theme Lab / scene atlas | 真实结构压力、元素角色、状态和内容密度；可使用受控 representative fixture | 不能声称与生产页面像素一致 |
| Component inventory | 真实 shared primitive、真实 states、真实 token 响应 | 不能代表完整 workflow |
| Product mock | approved design source、真实数据形态、关键交互可走通 | 不能替代 real Obsidian acceptance |
| Production regression QA | 同 source revision、viewport、theme、scroll anchor、interaction state；真实 DOM / screenshot / video | 不能用静态 build 或单张终态图证明 hover、focus、drag、streaming |

## 看似矛盾的反馈，正确边界是什么

| 表面矛盾 | 机械执行会怎样 | 实际规则 |
| --- | --- | --- |
| “边框太多” vs “全去掉也很怪” | 全卡片或全扁平 | 只保留承担结构、选择、输入和 elevation 的边界 |
| “必须对应设计稿” vs “Theme 只看整体感觉” | Theme Lab 变成重复实现整个产品 | 生产验收追求 parity；主题试件追求结构与状态代表性 |
| “更紧凑” vs “按钮太小不好点” | 把字号、icon 和 hit target 一起缩小 | 缩视觉占位，不缩有效 hit target |
| “隐藏低频动作” vs “看不出来可以点击” | 控件消失或全常驻 | progressive disclosure + 清楚 hover / focus / selected / menu |
| “整体统一” vs “各页面不能长一样” | generic dashboard template | primitives 与 states 统一，scene 信息架构保持专属 |
| “需要动画” vs “不要装饰性 AI 渐变” | 无意义 shimmer / spring | motion 只解释连续性、进度与状态 |
| “少文字” vs “真实内容不够” | 只剩 icon 或 lorem ipsum | 少 UI 解释文字，保留丰富真实内容 |
| “颜色要区分” vs “不能只靠颜色” | 用更多高饱和色抢层级 | 颜色与形状、icon、文字、位置、显隐共同编码 |

## 为什么会形成这些偏好

以下是基于语料的解释，不是直接事实。

### 1. Peak 是高密度知识工作环境

Composer、Search、Graph、File Atlas 和 Intelligence 都承载大量真实内容。用户注意力应该用于文字、关系、来源、选择和任务状态。每增加一层 card、永久 toolbar 或装饰色，就在与内容争夺工作记忆。

置信度：高。它同时被 Composer、File Atlas、Graph、Chat 和 Settings 反馈支持。

### 2. Obsidian 已经提供一层宿主 chrome

Peak 再复制一套 header、sidebar、outline、navigation 或 Markdown 能力，会形成第二层外壳和重复入口。因此你经常要求删掉“已经有原生位置”的 UI，同时又要求 Peak-owned surface 视觉独立。

置信度：高。

### 3. 你把 AI 理解为贴近对象的协作，不是独立 dashboard

你反复要求 AI 知道当前 block、当前文档和当前范围，动作在原地出现，结果回到正文，sidecar input 固定底部。AI 的视觉价值来自上下文与状态连续性，不来自更多渐变、卡片或“Intelligence”标签。

置信度：高。

### 4. “廉价感”来自微观规则漂移的累积

单个颜色或图标未必致命；字体、间距、边框、radius、icon size、tab 分区、motion 和 alignment 各自差一点，就会共同形成“草稿态”。这也是为什么点状 CSS 修复不能解决整体问题。

置信度：高。

### 5. 你需要一个可被 LLM 操作、但不被 LLM 重画产品的 Theme 系统

固定 scene、语义 token、Theme JSON、统一 fixture 与全局切换，使 Codex 可以有边界地替换风格；如果每次让模型重新画 Composer / Graph，结构就会漂移。

置信度：中高。它在最新 Theme Lab 对话中被明确提出，但完整工作流仍需后续落成正式 Theme Schema。

## 对 Peak Design System 的直接要求

### Foundations

1. **Color**：从 semantic role 出发；accent 不能承担全部品牌与状态表达。
2. **Typography**：建立稳定文档排版和 UI 排版层级；Theme 可以换 family，不能随意改变层级关系。
3. **Spacing / Density**：spacing 形成一致节奏；density 优先改变间距和 row 高度，不应让正文主题随意缩字号。
4. **Radius**：按 chip / control / card / dialog / docked surface 分级，并支持相邻边清零。
5. **Elevation**：只区分 canvas、surface、popover、dialog 等真实层级，不把每张 card 都抬起来。
6. **Motion**：定义 hover、press、popover、drawer、layout、streaming 和 reduced-motion 合同。
7. **Focus / Selection**：独立于 accent 的可见焦点与选中语义。
8. **Theme Boundary**：resolved theme 是 Peak visual truth；普通 DOM、portal 与 popout 同源。

### Shared components

优先统一以下角色，不按页面重复发明：

- Button / IconButton / split action；
- Input / Composer input / Search input；
- Segmented / Tabs / Button Group；
- Menu / Popover / Tooltip / Dialog / Drawer；
- Chip / Badge / FilterPill / status indicator；
- ListRow / TreeRow / ResultRow / long-list states；
- Card / Section / SelectionSurface / InlinePanel；
- Loading / streaming / empty / error / disabled；
- Graph toolbar shell、scope / layout / layer controls；
- Block hover rail、inline action bar、selection toolbar。

### Representative scene atlas

Theme 的整体感觉至少要在以下固定试件中同时成立：

1. **Composer rich document**：长文、层级标题、list、quote、code、table、media、active block、selection、inline AI。
2. **Composer sidecar**：Copilot / Ambient / History、bottom input、streaming、diff、collapsed icon rail。
3. **Vault Search / AI Search**：search input、List / Tree / Graph、Compact / Detailed、long result、selected row、empty / loading。
4. **File Atlas**：超长 outline、nested rows、Inspector、hover、selection、preview、long title、overflow。
5. **Graph**：hub、community、长标签、dense edges、selected path、hover card、empty canvas。
6. **Dashboard / Vault Intelligence**：metric、row、chart、status、action，但避免等权 card wall。
7. **Settings / Onboarding**：section、form、provider picker、validation、readiness、repair、wizard state。
8. **Chat Studio**：message、source、tool state、input、context chips、streaming / stopped / error。

这些试件共享 Theme，但不共享同一页面布局。它们的作用是暴露 Theme 在不同信息密度、交互状态和 surface 层级下的问题。

## Theme 设计 brief

下面这段可作为未来 Codex / LLM 生成或修改 Peak Theme 时的 owner brief：

> 为 Peak Assistant 设计 Theme 时，保持产品结构、内容、组件角色和交互状态不变，并遵守以下要求：
>
> - 安静、专业、现代；高信息密度，但低视觉噪声。
> - 正文和真实数据优先。
> - border 与 shadow 只承担结构和 elevation。
> - 大圆角与 pill 只用于合适的局部控制。
> - 颜色有层级且可分辨，但不是状态的唯一编码。
> - hover、focus、selected、loading、streaming 和 error 必须清楚。
> - 切换与浮层 motion 平滑但克制。
> - Composer 像可深度编辑的文档；Graph 先保证关系可读。
> - Search / File Atlas 能承受超长列表和长标题。
> - Dashboard 不得退化成等权卡片墙。
> - Peak-owned UI 不继承 Obsidian 视觉值。
> - Light、Dark 和 reduced motion 在同一组固定 scene 中验收。

## Owner review checklist

### 第一眼

- 是否先看到内容和当前任务，而不是 card、border、icon 和品牌色？
- 是否存在大片无法解释的空白、过深缩进或孤立控件？
- 是否有多个容器在表达同一个分组？
- 是否有一个明显 primary action，而不是一排等权按钮？

### 结构

- 每条 border、separator、background 和 shadow 分别承担什么角色？
- docked surface 是否仍被画成漂浮的大圆角 card？
- list / tree / graph 的层级、关系和 selected state 是否一眼可见？
- 长文字、长列表、窄宽度和真实数据下是否仍成立？

### 交互

- 每个可点击对象是否在 resting、hover、focus、pressed、selected、disabled 中有正确反馈？
- 低频动作是否按上下文显露，而不是永久占位或彻底隐藏？
- 点击 icon 设置后是否出现可理解的小 menu / popover？
- motion 是否解释对象来源、进度或状态，而不是单纯装饰？

### Theme

- 换 accent 后，层级是否仍成立？
- Light / Dark 下边界和文字对比是否都清楚？
- 不看颜色时，用户是否仍能理解 selected、status 和 link type？
- density 改变后，hit target、正文阅读和 layout 是否仍稳定？
- reduced motion 下是否保留必要的状态反馈？

### 场景真实性

- 这个试件来自真实 component、approved mock 或明确登记的 representative fixture 吗？
- 元素数量、内容密度和交互状态是否足以暴露问题？
- 如果声称 production parity，是否使用相同 revision、viewport、theme、scroll anchor 和 interaction state？
- 如果只是 Theme feel，是否明确没有声称像素级生产一致？

### 宿主边界

- Peak root、portal、dialog、popover、popout 是否获得同一 resolved theme？
- hostile Obsidian theme 是否能改变 Peak 的字体、按钮尺寸、radius、shadow 或 focus？
- 是否又通过局部 reset 修一个点，却没有把例外登记到 Boundary / enforcement？

## 证据索引

### 重点 Codex tasks

| Task ID | 标题 / 时间 | 主要审美信号 |
| --- | --- | --- |
| `019e2533-c647-7042-951b-0e7fd0631767` | 分析 Copilot 与 Command Center · 2026-05 | Chat input 太乱、message 边框太多、header 应更干净、分元素评审 |
| `019f451b-99e7-75c0-a390-4b50ad8f34bf` | 调研 Obsidian 编辑美化插件 · 2026-07 | Composer 文档性、真实材料、block hover、原地编辑、字体统一 |
| `019f659b-09b5-70c3-b3a0-9d2a15345416` | 重设计 Intelligence 侧栏 · 2026-07 | 反企业后台卡片墙、bottom input、近场 AI、视觉克制、drawer |
| `019fa7cf-e19d-7722-9ce3-d29d9fafbe38` | 修复文字过多导致错位 · 2026-07 | 文本压力、popover layering、hover 一致性、可点击尺寸 |
| `019fb279-4388-7220-ac26-023bb9efc641` | 设计 Command Center Modal · 2026-07/08 | 廉价感、字体 / 间距 / 边框、图标大小、切换 motion、mixed display |
| `019fcb47-5a11-7631-9130-036a1fb35ba7` | File Atlas UI regression · 2026-08 | duplicate content、错位、大片空白、缩进、按钮消失、真实录屏验收 |
| `019fd478-6644-7102-b129-da5f3c71b18f` | 梳理 Composer 导航与圆角问题 · 2026-08 | back / forward、Button Group、List / Tree / Graph control 一致性 |
| `019fd4d3-5106-7851-9968-c982450d40ce` | 梳理全项目统一设计系统 · 2026-08 | Theme、scene atlas、真实组件、全局切换、折叠 state、宿主隔离 |
| `019fd6b1-ae88-74d1-98dc-b8cbb4e5dfb1` | 分析 Onboarding 与 Settings 流程 · 2026-08 | 样式丑陋、功能与状态真相缺失、选项过多、用户心智模型 |
| `019fe6e8-6282-7880-8678-2c77c8da47b8` | 设计 Graph Folder Tree Mock · 2026-08 | 边框张力、层级线、edge 遮挡、颜色非唯一编码、Hub 空间 |
| `019fea3c-d491-7353-90ff-587166a17e66` | 分析 Intelligence 范围心智模型 · 2026-08 | attached panel、tab 数量、去掉结构面大圆角、减少内部术语 |

### 代表性原话

> “message 这个我不喜欢那么多边框，我觉得我的原来的隐藏和展示，都是文字等就很好。”
>
> — `019e2533…`, 2026-05-29

> “让 Intelligence 侧栏真正成为贴着正文工作的 AI sidecar，而不是企业后台式卡片堆叠。”
>
> — `019f659b…`, 2026-07-15

> “人家设计的就是字体啊，尤其是字体、间距、边框都非常合适，我们这个就感觉还是草稿态。”
>
> — `019fb279…`, 2026-07-31

> “Graph 这个东西之后，就这么大的空白……各种 UI 各种错位。”
>
> — `019fcb47…`, 2026-08-04

> “边框太多了这样？堆叠的很烦……去掉各种边框后又有点堆叠字的感觉。”
>
> — `019fe6e8…`, 2026-08-09

> “我感觉不能单单靠颜色来区分。”
>
> — `019fe6e8…`, 2026-08-09

> “元素要么多了、要么少了、要么错位……但 Theme 只需要看一个整体感觉。”
>
> — `019fd4d3…`, 2026-08-10

> “点击得跟颜色一样弹出来小菜单给我看，不是现在这样点了不知道是啥。”
>
> — `019fd4d3…`, 2026-08-10

## 后续使用方式

这份文档应该作为三个后续产物的共同输入，而不是替代它们：

1. **Peak Design System specification**：把原则转成 tokens、role contracts、component states、radius / elevation / motion 规则。
2. **Peak Theme Schema**：把可变值、验证、preview、fallback、Light / Dark、density、accessibility 定义成可导入 JSON。
3. **Theme / Component scene atlas**：固定代表性内容和状态，让 Theme 全局切换可被同屏或逐 scene 评审。

如果后续设计与本文冲突，应先判断：

- 是新的 owner 决策改变了原则；
- 是具体场景需要登记例外；
- 还是设计再次退化成 generic UI、局部 CSS 修补或缺少真实来源。

不要把新的单次纠偏直接加成全局禁令。只有跨 surface 重复出现、或 owner 明确声明为系统级规则时，才升级这份 profile。
