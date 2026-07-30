# Peak Command Center：策展启动器与 Home 导航页研究

> 日期：2026-07-30
>
> 视觉方向修订：2026-07-31
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
- 默认态是“分组轨道 + 单组图标网格”，不是另一条无限长列表。
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

V2 将纠偏转成明确约束：

1. Modal 顶栏只保留搜索和关闭。
2. 一次只显示一个分组。
3. 分组在窄轨道切换，动作在无常驻边框的四列网格里定位。
4. Search 继续使用二维结果，不退回一维长列表。
5. Customize 在当前轨道和网格里原位发生；完整目录只在 Add action 后临时出现。
6. Home 是稀疏的导航起点；Pinned pages 沿纵向阅读路径出现，不是自由拼装 dashboard。

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

这证明“分类 + 网格 + 搜索”可以共存。Peak 不需要同时展开所有分类；左侧组轨道足以维持上下文。

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

Start.me 的 Bookmark Groups 支持 tab 或 collapsible list。它说明“二维 board”和“搜索态列表”不冲突：默认用空间组织，规模变大后再进入聚合筛选。

来源：[Bookmark Groups](https://support.start.me/en/articles/9182820-bookmark-groups)。

## 竞品能力矩阵

| 产品 / 模式 | 强项 | 对 Peak 的启示 | 不直接照搬 |
| --- | --- | --- | --- |
| Obsidian Command Palette | 全生态、键盘快、原生 hotkey | 保留为兜底全集 | 一维长列表 |
| Better Command Palette | recent、pin、hide、macro | 搜索可有 escape hatch | 仍以列表为中心 |
| Commander / Buttons Panel | 用户自定义按钮与分组 | 组和 tile 是核心配置对象 | 不复制所有脚本和动画选项 |
| Homepage / Hearth | 固定 Home、嵌入内容、最近文件 | 保留入口与继续工作 | 不重建万能 dashboard builder |
| Raycast / Apple Apps | 搜索、分类、网格、键盘导航 | 单组可见；网格形成空间记忆 | 不做系统级 launcher |
| Arc Command Bar | 同一入口切换页面、空间和 action | 入口先于说明 | 不照搬一维结果 |
| Bonjourr | 安静、稀疏的 New Tab | Home 保留搜索与 Quick access | 不复制天气、时钟和装饰背景 |
| OneTab / Start.me | group、quick list、可重排 | 空 query 保留空间记忆 | 不把所有 Vault 内容收成收藏夹 |

## 产品判断

### 要做

1. 一个 owner-approved 的 `Open Peak Command Center` 全局命令，快捷键由用户在 Obsidian Hotkeys 中设置。
2. 空 query 显示组轨道和当前组的二维动作网格。
3. 运行态搜索只过滤已策展内容。
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
8. 不让多个分组卡同时占满首屏。

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
