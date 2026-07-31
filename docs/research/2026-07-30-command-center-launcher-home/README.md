# Peak Command Center：策展启动器与 Home 导航页研究

> 日期：2026-07-30
>
> 视觉方向修订：2026-07-31 · V11 quiet branded command surface
>
> 状态：Research complete；产品边界已进入正式设计，尚未实现
>
> 输入证据：`/Users/zhangjike/Downloads/iShot_2026-07-30_22.02.35.mp4`

## 结论

这个需求已经在仓库里出现过，但历史上混进了两种完全不同的产品：

1. `CopilotCommandCenterModal` 是 AI capability planner：用户写目标，AI 起草步骤，再交给 Command Gateway 执行。
2. 用户本次描述的是日常导航器：把常用命令、插件能力、文件、Workspace 和 Home 内容组织成二维入口。

后者值得做，但不应继续复用前者的名字、交互或运行时。正式方向是：

- 原生 `Cmd/Ctrl + P` 保留，继续承担“全生态兜底搜索”。
- Peak Command Center 使用用户自己在 Obsidian 中绑定的快捷键打开。
- 默认态是“两排过滤 + 二维 action grid”：第一排切用户分组 scope，第二排切能力类型；只显示用户策展的动作，不是原生命令全集。
- Modal 与 Home 共享 action identity 和呈现元数据，但不复制同一套页面布局。
- Home 使用 Search、Quick access、Continue 和可选 Pinned pages 的固定阅读路径，不另造 Todo、日历、统计或 widget 数据系统。
- 外部插件命令只通过集中兼容层读取和执行；不拦截、不修改原生 Command Palette。

正式设计见：

- [Command Center Launcher + Home design](../../superpowers/specs/2026-07-30-command-center-launcher-home-design.md)
- [可交互视觉原型](../../gstack/command-center-launcher-home-2026-07-30/index.html)

## 2026-07-31 视觉纠偏

第一版原型的产品边界基本正确，但视觉模型错误。它把 Modal、Home 和管理态都套成了 dashboard：

- Modal 顶部放了标题、当前文档、能力可用性、Home 和编辑按钮，启动前先要求用户读取说明。
- 四个分组同时展开，每个分组又是一张卡，tile 继续嵌套在卡里。
- Home 把最近文件、Workspace、嵌入文档和 Todo 作为平行组件竞争注意力。
- 管理态同时展示分组表和完整命令目录，像后台配置页，不像对当前空间布局的直接编辑。

V3 将纠偏转成明确约束：

1. Modal 顶栏只保留搜索和关闭。
2. 不设置常驻分组侧栏，分组直接铺在共享画布上。
3. 画布分成左右两列，各列独立向下生长；分组内部按内容选择两列或三列动作。
4. 分组只用标题、留白和细分隔线建立层级，不再嵌套外层卡片。
5. Search 保持同一套分组瀑布流，不退回一维长列表。
6. Customize 复用同一画布原位编辑；完整目录只在 Add action 后临时出现。
7. Home 是稀疏的导航起点；Pinned pages 沿纵向阅读路径出现，不是自由拼装 dashboard。

V4 保留上述结构，只收紧视觉密度：

- Modal 从 `920 × 590` 收敛到约 `860 × 480`。
- 动作 tile 从 `100px` 收敛到约 `78px`，图标容器从 `34px` 收敛到 `28px`。
- 组间只保留一套 `margin + separator + padding` 节奏，不再叠加 grid gap。
- 删除组标题右侧的动作数量；数量不会帮助用户决定下一步。
- Search 每个分组使用一列紧凑结果，两个分组仍在左右 lane 中并排出现。

V5 把 Customize 从静态示意图补成可操作原型：

- Add group 直接创建可改名分组，Add action 打开临时 catalog。
- 分组和 action 都可拖动；分组可在左右 lane 间移动或切成全宽。
- 每个 action 独立选择“图标 + 文字”“仅图标”或“仅文字”。
- Pin / Unpin 直接更新 Home Quick access，Modal 与 Home 不复制 action 定义。
- 默认图标容器进一步缩到约 `24px`；Home Quick access 图标从 `44px` 缩到约 `30px`。

V6 保留这些操作能力，但撤掉 V5 暴露过量编辑 chrome 的视觉模型：

- Action 不再是高卡片，也不再被锁进二列、三列或六列小网格；统一为 `32px` 高、自然宽度、横向换行的紧凑按钮。
- 图标统一约 `15px`，默认直接落在按钮里，不再套彩色方块；Peak 紫只负责 focus、selection 和主入口。
- 图标 + 文字、仅图标、仅文字共享同一高度；仅图标保持方形，其余按内容宽度展开。
- 分组拖拽点和 Add action / 全宽工具只在 hover 或 focus 时出现。
- Action 的显示方式和 Pin 只在选中后通过一个浮动上下文条出现；未选中时 Customize 与普通画布几乎一致。
- Add group 收成低强调文字动作，不再伪装成一张横跨画布的空卡片。
- Home Quick access 使用同一套紧凑按钮语法，并移除无必要的右上角工具和大号品牌图标。

V7 进一步撤掉横向并列：

- Modal 从左右 lane 改成唯一一条纵向分组路径；Search 与 Customize 使用同一顺序。
- 组内 action 也不再横向换行，而是每个 action 独占一行，从上到下排列。
- Modal 收窄到约 `640px`，通过约 `520px` 高的可滚动区域承载分组，不再用宽度换取信息密度。
- 全宽分组在单列结构中没有意义，因此删除该开关；Add group、分组/action 拖动、三种显示方式和 Pin 仍保留。
- 键盘主导航简化为 Up / Down，搜索结果继续保留分组边界和用户顺序。
- Home Quick access 同步改成纵向列表，避免另一个横向按钮集合重新制造视觉噪音。

V8 对“横向并列”做了更准确的边界修正：

- 禁止的是 group 与 group 左右并列；所有 group 继续沿一条纵向路径堆叠。
- 每个 group 内部仍是横向 action block，例如 Peak Assistant 的全部入口横向排列，并只在组内按空间换行。
- Search 的结果也按“分组纵向、组内结果横向”组织；不是把所有命令重新压成单列。
- Modal 高度从 V7 的约 `520px` 收回到约 `400px`，因为横向 block 已经恢复信息密度。
- Home Quick access 恢复横向 block；它属于一个明确分组，不会和其他 Home section 并排竞争。
- 全宽切换仍不恢复：单列 group stack 中，每个 group 天然占满可用宽度。

V9 用新的参考设计解决了 V8 仍然“需要一次扫完所有组”的问题：

- [Command Menu](https://dribbble.com/shots/26707604-Command-Menu) 顶部把平台 / scope 与内容类型做成两排紧凑可点对象，切换成本低，也符合“先选范围、再选类型”的用户心智。
- Peak 借用的是上方两层扁平切换语法，不复制参考图下方的纵向结果 list；后者与原生 Command Palette 的检索负担没有本质区别。
- 第一排将 `All` 与用户自定义 group 映射为 scope tabs；尾部 `+` 直接进入 Customize。
- 第二排提供 `AI / Create / Navigate / Visual` 等正交 facet。scope 与 facet 可以组合，用户不必输入完整命令名。
- 内容区固定为四列 action tile grid；搜索结果仍留在同一 grid，不因输入 query 退化成一维列表。
- 图标 + 文字、仅图标、仅文字共享同一个 cell 几何，因此个别显示模式不会打散整个版面。
- V9 仍保留 Add group、分组 / action 拖动、Pin 与 Home 同步；V8 的纵向 group stack 只保留在 Customize 编辑态。

V10 纠正 V9 “信息结构接近、视觉仍像后台卡片墙”的落差：

- Modal 从 `680 × 430px` 收到约 `620 × 372px`，重阴影和深色 scrim 改成参考图式的浅色 wash、细边界和轻阴影。
- Search、scope tabs、facet chips 组成一块连续的白色 command surface；搜索栏与第一排 tabs 之间不再人为加分隔线。
- scope 激活态使用黑色细下划线，不再使用紫色描边和填充；不同 scope 仅靠小型彩色图标建立识别。
- 内容区从四列有边框 tile 改成三列无边框 action cells。默认透明，hover / selection 只出现极浅的中性底色。
- 删除 `All commands`、action count 和 Search summary；过滤栏之后立即进入动作，不要求用户先读界面说明。
- footer 对齐参考图的轻量快捷键提示，并将 Customize 收成右下角齿轮。

V11 根据真实渲染截图继续纠偏廉价感：

- V10 的马卡龙小方块仍然是假品牌感；V11 为 Peak Assistant、Workspaces、Quick create、Visual 绘制独立 source mark，并让 action 默认继承所属来源标志。
- 第二排删除重复的 `All` 和所有描边 pill，改成带 4px 色点的无边框 toggle；再次点击当前类型即可清除过滤。
- 首屏不再预设混合 `icon-only / text-only`，所有 action 先以完整模式形成连续三列。三种模式仍能在 Customize 中逐项设置。
- resting state 不自动选中 Composer；只有真实 hover / keyboard focus 才出现极浅反馈，离开后恢复白色。
- 内容区裸图标不再使用 pastel well；颜色只编码来源，不把每个命令包装成一张小卡片。

## 录屏观察

录屏时长约 8.1 秒，画面为 `2114 × 1822`，展示了原生 Obsidian Command Palette 的三个典型状态。

### 未输入时

命令来自 Obsidian 核心和多个插件，全部进入同一条纵向结果流。关闭 tab、Code Editor Shortcuts、Excalidraw、File recovery 等不同心智的动作没有空间层级。

### 输入 `exca` 时

结果虽然收敛到 Excalidraw，但仍出现多个几乎同名的窗口变体：

- New tab
- New pane
- Popout window
- Adjacent window
- Current active window

用户必须逐行读完整句子，才能判断目标动作。搜索只是减少了候选数量，没有解决同插件内部的辨认成本。

### 输入 `peak` 时

Peak Assistant 的入口能被过滤出来，但仍与其他模糊匹配结果混排。已有快捷键只在行尾作为补充信息出现，不能形成“我平时在哪一块启动什么”的空间记忆。

因此，根因不是 fuzzy search 不够强，而是：

- 全生态命令被压成一个一维空间；
- 高频与低频动作没有稳定位置；
- 同插件的变体只有长文本差异；
- 用户不能用自己的工作分组来组织入口。

## 当前仓库事实

### 原生 Palette 已有严格治理

`src/app/commands/gateway/manifests.ts` 当前实际注册 7 个 Peak 入口：

- Settings
- Setup Wizard
- Quick Search
- File Atlas
- Usage Dashboard
- Chat Studio
- Document Composer

`docs/conventions/command-palette-governance.md` 原先只写 6 个，遗漏了后加入的 Document Composer；本次已把文档修正为 7 个。治理原则不变：原生 Palette 是稳定的全局入口，不应重新塞回 feature-local、QA 或临时命令。

### 旧 Command Center 是另一个产品

`src/app/ui-host/modals/CopilotCommandCenterModal.ts` 是一个 `640px` 的两阶段 planner：

1. 收集自然语言目标；
2. 展示 AI 生成的 capability plan 并执行。

`openCopilotCommandCenter()` 仍在 `PeakCommandActions.ts`，但没有进入当前生产 Command Palette bindings。它不能作为本次启动器的 UI 或配置基础。

### 任意第三方命令发现存在兼容风险

本仓库安装的 Obsidian TypeScript 公共声明没有暴露 `App.commands` 的命令枚举和执行接口。社区插件通常依赖运行时内部对象读取 command catalog。

因此，设计不能把私有 API 散落进 UI：

- app 层集中一个 `ObsidianCommandCatalogPort` 兼容适配器；
- 运行时不可用时降级到 Peak allowlist 和显式插件 adapter；
- 已配置但失效的 command ID 显示“插件未安装或命令已变化”，不静默执行别的命令。

## 用户需求证据

以下证据不是一份正式访谈样本，而是对公开使用模式的快速验证。

### 命令过多是真问题

- Obsidian 官方说明 Command Palette 会对所有可用命令做 fuzzy matching，也支持 recent 和 pinned；这仍然是一维结果模型：[Command palette](https://obsidian.md/help/plugins/command-palette)。
- 一位 Excalidraw 用户报告同插件命令太多，以至于只输入插件名时看不到目标动作；社区建议继续输入更长的动作词：[Command palette not showing all commands](https://www.reddit.com/r/ObsidianMD/comments/1ajs92t)。
- Better Command Palette 的主要价值之一就是 recent、pin、hide 和前缀 mode，说明“对原始全集做更聪明的列表搜索”有真实需求，但它仍没有解决二维策展：[Better Command Palette](https://community.obsidian.md/plugins/obsidian-better-command-palette)。

### 用户会主动把动作做成按钮和组

- Commander 允许把命令加到不同 UI 位置并重新排序或隐藏：[Commander](https://community.obsidian.md/plugins/cmdr)。
- Buttons Panel 直接提供 category、tab、folder 和 grid，并允许把 file、command、link、script 变成按钮：[Buttons Panel](https://community.obsidian.md/plugins/buttons-panel)。
- QuickAdd 的 Multi choice 本质上是“其他 choice 的文件夹”，Macro 则把多步命令串起来：[QuickAdd](https://community.obsidian.md/plugins/quickadd)。
- 社区用户明确提出只想要 1–6 个自选的浮动快捷命令，而不是每次滚动和搜索完整 Palette：[Need for a Floating Quick Commands](https://www.reddit.com/r/ObsidianMD/comments/1biqqvf)。

### Home / New Tab 是另一个稳定需求

- Obsidian Homepage 可把 Note、Base、Workspace 或其他 view 设为启动首页，并能在打开时运行命令：[Homepage](https://community.obsidian.md/plugins/homepage)。
- Hearth 把搜索、launchpad、命令 tile、嵌入 Note/Base/Canvas、Tasks 和多 dashboard 合成完整首页：[Hearth](https://community.obsidian.md/plugins/hearth)。
- Homepage Blocks 提供 17 种可拖拽 block，包括 quick links、button grid、embedded note、bookmarks 和 recent files：[Homepage Blocks](https://community.obsidian.md/plugins/homepage-blocks)。
- Obsidian 自带的 Bookmarks 已支持文件、文件夹、搜索、heading、block 和 link，并可以分组：[Bookmarks](https://obsidian.md/help/plugins/bookmarks)。
- Obsidian Workspaces 已能保存 open files、tabs 和 sidebar 布局：[Workspaces](https://obsidian.md/help/plugins/workspaces)。

这些产品说明 Home 的核心不是“再看一组漂亮 KPI”，而是把经常返回的内容和工作状态放到稳定位置。

## 跨产品模式

### Raycast

Raycast Quicklinks 可以保存 URL、文件、文件夹和 deeplink，支持 tag、pin、alias 和独立 hotkey。它的关键不是搜索全世界，而是让用户把高频目的地变成自己的有限集合：

- [Quicklinks](https://manual.raycast.com/quicklinks)
- [Command aliases and hotkeys](https://manual.raycast.com/command-aliases-and-hotkeys)
- [Grid](https://developers.raycast.com/api-reference/user-interface/grid)

Raycast 的 Grid 把图标或图像作为对象的第一识别信号，同时仍保留搜索入口。对 Peak 的启示不是复制 Raycast 外观，而是让高频动作在空间里有固定位置。

### Apple Spotlight Apps

Apple 当前把 Spotlight 描述为搜索、浏览和打开 app 的中心位置。应用浏览支持分类过滤、Grid / List 切换、方向键导航和 `Esc` 关闭。

来源：[View and open apps on Mac](https://support.apple.com/guide/mac-help/mh35840/mac)。

这证明“分类 + 网格 + 搜索”可以共存。Peak 把有限的高频分组直接放进内容画布，不再额外建设一层分类导航。

### Arc Command Bar

Arc 把打开页面、切换 Space 和执行 action 汇入 Command Bar。用户可以输入 `/` 过滤 actions，也能直接输入 Space 名称切换上下文。

来源：

- [Arc 2022 release notes](https://resources.arc.net/hc/en-us/articles/20498417809815-Arc-for-macOS-2022-Release-Notes)
- [Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas)

Peak 采用它的“入口先于说明”原则，不采用其一维结果结构。

### Bonjourr

Bonjourr 把 New Tab 定义为 refined、minimal 和 calm 的 start page，核心能力是 search bar 与 favorites quick access。

来源：[Bonjourr](https://bonjourr.fr/)。

对 Peak Home 的启示是保留大面积留白。默认首页先呈现少量固定入口和 Continue；用户固定的页面在后续纵向区域展开，不预装一套工作台组件。

### OneTab

OneTab 把大量浏览器 tab 收进可重排 group，并额外提供 quick list。它说明用户面对高基数对象时，最需要的不是一条更长的排序列表，而是：

- 收集；
- 分组；
- 固定；
- 按需搜索。

来源：[OneTab Help](https://www.one-tab.com/help)。

### Start.me

Start.me 的 Bookmark Groups 支持 tab 或 collapsible list。它说明 tab 可以承载稳定上下文切换；Peak 进一步要求默认态与搜索态都保留二维空间，不重新落回结果列表。

来源：[Bookmark Groups](https://support.start.me/en/articles/9182820-bookmark-groups)。

## 竞品能力矩阵

| 产品 / 模式 | 强项 | 对 Peak 的启示 | 不直接照搬 |
| --- | --- | --- | --- |
| Obsidian Command Palette | 全生态、键盘快、原生 hotkey | 保留为兜底全集 | 一维长列表 |
| Better Command Palette | recent、pin、hide、macro | 搜索可有 escape hatch | 仍以列表为中心 |
| Commander / Buttons Panel | 用户自定义按钮与分组 | 组和 tile 是核心配置对象 | 不复制所有脚本和动画选项 |
| Homepage / Hearth | 固定 Home、嵌入内容、最近文件 | 保留入口与继续工作 | 不重建万能 dashboard builder |
| Raycast / Apple Apps / Command Menu | 搜索、scope、类型筛选、网格、键盘导航 | 两排过滤缩小上下文；网格形成空间记忆 | 不复制纵向结果 list，不做系统级 launcher |
| Arc Command Bar | 同一入口切换页面、空间和 action | 入口先于说明 | 不照搬一维结果 |
| Bonjourr | 安静、稀疏的 New Tab | Home 保留搜索与 Quick access | 不复制天气、时钟和装饰背景 |
| OneTab / Start.me | group、quick list、可重排 | 空 query 保留空间记忆 | 不把所有 Vault 内容收成收藏夹 |

## 产品判断

### 要做

1. 一个 owner-approved 的 `Open Peak Command Center` 全局命令，快捷键由用户在 Obsidian Hotkeys 中设置。
2. 空 query 显示两排过滤与二维 action grid；第一排切用户 group，第二排切能力类型。
3. 运行态搜索只过滤已策展内容，并保持相同的 scope / facet / grid 结构。
4. 编辑态才允许搜索全部已注册命令并加入组。
5. 每个 tile 显示图标、短标题、来源组和实际快捷键。
6. 同一 action 配置可被 full-tab Home View 的 Quick access 引用。
7. Home 支持 Search、Quick access、Continue 和可选 Pinned pages，并把 Note、Base、Canvas、Bookmark 或 Workspace 的内容所有权留给原 owner。

### 不做

1. 不拦截 `Cmd/Ctrl + P`。
2. 不隐藏或删除 Obsidian / 第三方插件的原生命令。
3. 不把旧 AI capability planner 当成启动器。
4. 不在第一版引入脚本运行、任意 HTML、远程 widget 或复杂 macro。
5. 不内建新的 Todo、Calendar、Pomodoro、Stats 数据系统。
6. 不使用 AI 生成小图标。
7. 不在 Modal 顶部展示当前文档、能力可用性或产品解释。
8. 不用侧栏、纵向 group stack 或分组外层卡片分割有限的高频入口。

## 为什么图标不用 AI 生成

20–24px 的功能图标需要稳定笔画、可预测语义、主题适配和长期一致性。AI 生成位图不适合这种任务。

图标策略：

1. 通用动作使用项目已采用的 Lucide React。
2. Peak surface 使用已有产品 icon mapping。
3. 第三方插件默认使用用户为“组”选择的 Lucide icon。
4. 单个动作没有明确 icon 时，继承组 icon；仍无法表达时才显示两字符 monogram。
5. 后续可允许用户导入受限 SVG，但不作为默认能力。

## Build / integrate 判断

如果目标只是“做一个漂亮 dashboard”，安装 Hearth 或 Homepage Blocks 的成本更低。Peak 自建的理由只有两个：

- 它需要与 Peak Command Gateway、可用性、真实 hotkey 和产品入口治理保持一致；
- 它需要让 Modal 与 Home 共享一份策展配置，而不是把用户分散到另一个插件设置体系。

因此，范围必须克制。凡是 Hearth、Buttons Panel 已经成熟覆盖的通用 widget 和脚本能力，默认不进入 Peak 主线。

## 验证假设

实现前需要用真实 Obsidian 完成以下可用性走查：

1. 用户能在 30 秒内把一个 Excalidraw command 加入新组。
2. 用户能不搜索，在二维 board 中找到 Composer、Chat Studio 和 File Atlas。
3. 输入 `drawing` 后只出现已策展的 2–4 个动作，不出现几十个全生态结果。
4. 未安装插件的 tile 明确不可用，并提供重新选择或移除入口。
5. Modal 关闭后焦点回到原编辑位置。
6. Home 打开和返回原文档不改变用户已有 Workspace，除非用户显式选择加载 Workspace。
