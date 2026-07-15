# Obsidian 编辑视图 UI 改造插件调研

调研日期：2026-07-09  
目标：判断 Obsidian 生态里已有多少“把编辑器变得更像飞书 / Google Docs / Notion”的插件与主题方案，并提炼 Peak Assistant 可以做的自有编辑视图方向。

## 结论

Obsidian 现在的核心编辑体验是 Live Preview + Source mode 的折中：Live Preview 会隐藏多数 Markdown 语法，但光标进入格式化内容时又把底层语法露出来。这个机制保留了 Markdown 可控性，但正是用户觉得“代码化”“跳来跳去”“表格/图片/Callout 不像文档编辑器”的根源。

市场上已经有不少插件在补这个洞，但都比较碎：

- 最成熟的大众需求是表格：Advanced Tables 官方市场约 300 万下载，说明“Markdown 表格不好写”是 Obsidian 长期第一痛点。
- 第二层是格式工具栏：Editing Toolbar 约 159 万下载，cMenu/mdMenu/Note Toolbar/Slash Commander 证明大量用户不想背 Markdown 或快捷键。
- 第三层是 Notion-like 操作：make.md、Dragger、GoodBases、Rich Table 代表“块级直接操作 + 数据库/表格美化”的新方向。
- 第四层是图片/视觉块：Image Converter、Image Captions、Image Layouts、Scalosaurus、Rin Image Toolbar 等集中解决图片插入、缩放、裁剪、标题、排版。
- 中文内容和小红书同类内容更偏“主题美化 + 成套配置”：Blue Topaz / Minimal / Style Settings / CSS snippets / Advanced Tables / Hover Editor 被反复组合推荐。

机会不是再做一个主题，也不是强行做完整富文本编辑器。更稳的切入是做一个可切换的 **Document Editing View**：Markdown 仍是 source of truth，但对表格、图片、Callout、链接卡片、标题区、块操作提供更舒服的 Live Preview 交互层。

## 调研方法

本次使用的主要来源：

- 官方 Obsidian Community 插件页与主题页：https://community.obsidian.md/
- 官方插件 registry/stats：`obsidianmd/obsidian-releases` 的 `community-plugins.json`、`community-plugin-stats.json`、`community-css-themes.json`
- GitHub repo 与 GitHub API：下载量用官方 stats，stars/issues 用 GitHub API 辅助看维护状态
- Obsidian Forum / 中文论坛：看真实需求、抱怨和产品边界
- Reddit / YouTube / PKMer / 少数派 / 即刻 / CSDN：看社区组合与中文内容倾向
- 小红书：直接 Web 搜索页可打开 SPA shell，但无登录/无 JS 渲染时不能可靠读到搜索结果；本轮采用站外索引 + 中文平台相邻内容做间接判断。后续若要严谨验证，需要人工在小红书 App 内搜关键词并采样截图。

## 用户需求画像

用户想要的不是单纯“隐藏 Markdown”，而是几类编辑时的摩擦下降：

1. 文字格式不要靠记语法：加粗、标题、列表、颜色、链接、Callout 等要像文档编辑器一样点选或 slash 插入。
2. 表格不要像代码：最好能单元格编辑、Tab/Enter 导航、拖拽列宽、合并单元格、公式、排序、CSV/Excel 互通。
3. 图片不要像裸链接：粘贴后能拖拽缩放、对齐、裁剪、加标题、做画廊/多图排版。
4. Callout / 引用块不要一编辑就坍缩成源码：外壳保持可视，内部内容可编辑。
5. 链接/网页卡片更像 Notion：URL 可以变成有标题、描述、favicon、封面的卡片。
6. 仍然保留 Obsidian 的 Markdown 舒服感：源文件可读、可迁移、可用快捷键，不要变成锁死在插件私有格式里的富文本。

## 竞品地图

### A. 格式工具栏 / Slash / 块操作

| 插件 | 市场信号 | 做了什么 | 对我们的启发 |
| --- | ---: | --- | --- |
| [Editing Toolbar](https://community.obsidian.md/plugins/editing-toolbar) | 约 1.59M 下载，2026-07 仍更新 | MS Word-like toolbar、顶部/跟随光标、颜色/列表/undo/标题等命令 | 用户愿意为“少记 Markdown 和快捷键”安装插件；但它偏命令面板，不是完整文档视图 |
| [cMenu](https://github.com/chetachiezikeuzor/cMenu-Plugin) | 约 232k 下载，老插件 | 选区附近最小格式工具条 | 老需求稳定，但维护老化；可以借鉴轻量浮动菜单 |
| [mdMenu](https://community.obsidian.md/plugins/mdmenu) | 新插件，约 160 下载 | clean-room WYSIWYG-style Markdown toolbar，保留 plain Markdown | 新进入者仍在做 toolbar，说明这类需求未结束 |
| [Slash Commander](https://community.obsidian.md/plugins/slash-commander) | 约 58k 下载，2026-06 更新 | 自定义 slash command 列表、图标、分组、触发规则 | Slash 是 Notion-like 入口，但它本身不解决块渲染质量 |
| [SlashComplete](https://community.obsidian.md/plugins/slash-complete) | 约 3k 下载 | `/` 触发 Markdown block / formatting / command autocomplete | 可作为“输入入口”参考，产品重点仍应在插入后的块体验 |
| [Dragger](https://community.obsidian.md/plugins/dragger) | 约 56k 下载，创建 5 个月内增长快 | 段落、标题、列表、表格、代码块等可拖拽重排，像 Notion | 这是强信号：Obsidian 用户不只要 toolbar，而是要块级直接操作 |
| [Note Toolbar](https://community.obsidian.md/plugins/note-toolbar) | 约 232k 下载，更新非常频繁 | 上方/选区/context-aware toolbar，可放命令、链接、脚本 | 如果我们做 editor view，toolbar 应该是上下文动作，不是全局杂物架 |

### B. 表格 / 数据库 / Bases

| 插件/功能 | 市场信号 | 做了什么 | 风险/机会 |
| --- | ---: | --- | --- |
| [Advanced Tables](https://community.obsidian.md/plugins/table-editor-obsidian) | 约 3M 下载，官方 review passed | Markdown 表格自动格式化、Tab/Enter 导航、公式、行列操作、CSV | 这是最强刚需。我们的表格体验至少不能比它差；但可以进一步做“可视块 + Markdown 回写” |
| [Markdown Table Editor](https://github.com/ganesshkumar/obsidian-table-editor) | 约 115k 下载 | Markdown 表格编辑器、CSV/Excel/Sheets 数据导入 | 说明单表编辑长期有需求 |
| [Table Generator](https://github.com/quorafind/Obsidian-Table-Generator) | 约 61k 下载 | 像 Typora 一样快速生成表格 | 更偏生成入口，不是深编辑 |
| [Sheet Plus](https://community.obsidian.md/plugins/sheet-plus) | 约 165k 下载，2026-07 更新 | 基于 Univer 的 Excel-like spreadsheets、charts、xlsx、REST/MCP | 更像内嵌 spreadsheet 应用，强但重；我们要避免把轻文档表格都推向 spreadsheet |
| [Rich Table](https://community.obsidian.md/plugins/rich-table) | 新插件，数百下载，2026-07 创建 | fenced `rich-table`，合并、样式、typed columns、inline edit、wikilink autocomplete | 很接近机会点，但用私有 fenced block，Markdown 通用性下降；可以作为高级表格模式参考 |
| [Spreadsheet Table](https://community.obsidian.md/plugins/spreadsheet-table) | 新插件，几十下载 | Plain Markdown 表格 + Live Preview 公式结果、行列号、toolbar | 方向更贴近“保持 Markdown 源文件” |
| [HTML Tables](https://community.obsidian.md/plugins/html-tables) | 新插件，几十下载 | 表头、合并、列宽、公式、caption、HTML/Markdown 转换 | 解决 Markdown 表格限制，但 HTML 会降低源码可读性 |
| [Bases](https://obsidian.md/help/bases) | Obsidian core plugin | 文件/属性的数据库视图，支持 table/list/cards/map，插件可加 layout | 2025-2026 后 Notion-like 数据库需求会更多转向 Bases 扩展 |
| [GoodBases](https://community.obsidian.md/plugins/good-bases) | 新插件，约 1k 下载 | 把 Bases 渲染成 Notion-style table，彩色 pills、inline edit、hover open | 强信号：用户要的是“原生数据 + Notion 质感”，不一定要另起数据库 |

表格方向的关键判断：普通 Markdown table、Rich Table block、Sheet Plus spreadsheet、Bases database 是四种不同对象，不能混成一个。我们的 Document View 应该先处理“文档内轻表格”，再给高级场景一个清晰升级路径。

### C. 图片 / 附件 / 多图布局

| 插件 | 市场信号 | 做了什么 | 对我们的启发 |
| --- | ---: | --- | --- |
| [Image Converter](https://community.obsidian.md/plugins/image-converter) | 约 456k 下载，2026-06 更新 | 粘贴/拖放后转换、压缩、缩放、拖拽 resize、对齐、环绕、标注、裁剪 | 图片是第二强视觉痛点；它做得很全，但更像图片管理工具 |
| [Image Captions](https://community.obsidian.md/plugins/image-captions) | 约 59k 下载 | 用 wikilink/Markdown alt 写 caption、支持尺寸、对齐、caption Markdown | caption 是刚需；但外部图在 Editing/Live Preview 有限制 |
| [Better Figures](https://community.obsidian.md/plugins/better-figures) | 新插件，几十下载 | 标准 Markdown alt 文本在 Reading/Live Preview 渲染成 caption | 值得参考：用标准语义做最小增强，而不是私有语法 |
| [Image Layouts](https://community.obsidian.md/plugins/obsidian-image-layouts) | 约 32k 下载，2026-07 更新 | 画廊、masonry、carousel、自定义 ASCII grid、多图故事排版 | 文档美化不只是单图 resize，还包括多图布局 |
| [Pixel Perfect Image](https://community.obsidian.md/plugins/pixel-perfect-image) | 约 20k 下载 | 精确像素缩放、鼠标滚轮、文件操作、外部编辑器 | 对“图片上下文菜单”有参考价值 |
| [Scalosaurus](https://community.obsidian.md/plugins/scalosaurus) | 新插件，几十下载 | Live Preview/Reading 中拖拽 resize，并回写 wikilink size；支持 snap-to-column | 很贴近我们的机会：所见即操作，同时保持 Markdown source |
| [Rin Image Toolbar](https://community.obsidian.md/plugins/image-toolbar) | 新插件，几十下载 | Live Preview 图片 hover toolbar：复制、裁剪、全屏，裁剪后更新引用 | 说明“图片上直接浮动工具条”是新方向 |
| [Banners](https://community.obsidian.md/plugins/obsidian-banners) | 约 333k 下载 | Notion-like note banner / icon，用 frontmatter 存储 | 标题区/封面图对“像 Notion”很重要，但老插件更新较少 |

### D. 链接卡片 / Callout / 文档视觉块

| 插件 | 市场信号 | 做了什么 | 对我们的启发 |
| --- | ---: | --- | --- |
| [Rich Links](https://community.obsidian.md/plugins/obsidian-rich-links) | 约 31k 下载，老插件 | URL 转 Notion-like rich preview | 早期 proof-of-concept，维护弱，但需求明确 |
| [Auto Card Link](https://community.obsidian.md/plugins/auto-card-link) | 约 76k 下载 | URL metadata -> `cardlink` YAML code block，可带 favicon/image | 卡片语法保守但私有；适合我们做 import/export 兼容 |
| [Callout Manager](https://community.obsidian.md/plugins/callout-manager) | 约 175k 下载 | 浏览/自定义 callout 颜色、icon、类型，移动端可用 | Callout 美化生态成熟；真正缺的是“编辑时外壳不坍缩” |
| [Highlightr](https://github.com/chetachiezikeuzor/Highlightr-Plugin) | 约 676k 下载 | 选区高亮颜色菜单 | 文字视觉增强常见，但不是块编辑核心 |

### E. 主题 / CSS / 中文社区常见组合

| 生态项 | 信号 | 说明 |
| --- | --- | --- |
| [Style Settings](https://community.obsidian.md/plugins/obsidian-style-settings) | 约 2.47M 下载 | 主题、插件、snippet 用 CSS 注释暴露配置项；这是美化生态地基 |
| [Minimal](https://github.com/kepano/obsidian-minimal) | 官方社区热门主题 | 国际社区常见“干净、功能化、可配置”选择 |
| [Blue Topaz](https://github.com/PKM-er/Blue-Topaz_Obsidian-css) | GitHub 约 1.6k stars；中文论坛长期热门 | 中文社区特别强，README 和中文论坛都强烈建议配 Style Settings |
| AnuPpuccin / Border / ITS / Things / Cupertino / Wasp | 官方热门主题列表可见 | 说明“换皮肤”已很卷；新产品若只做主题，很难形成壁垒 |

中文社区信号：公开可索引内容中，很多人把 Obsidian 描述成“配置前像毛坯房，配置后像另一款软件”。常见组合不是单插件，而是主题 + Style Settings + CSS snippets + Advanced Tables + Hover Editor + Hider/Focus Mode + Outliner/Dataview/QuickAdd。

## Obsidian Forum 里的真实痛点

Forum 里长期存在“全可视编辑模式 / WYSIWYG”讨论。核心分歧不是有没有需求，而是 Obsidian 是否应该背离 Markdown/plain text 哲学：

- 官方帮助文档明确 Live Preview 是格式化内联展示，但进入内容时仍显示底层语法。
- 表格请求非常典型：用户希望 Live Preview 支持逐单元格编辑，而不是点进表格后整张表变成源码。
- Callout 请求也类似：用户希望编辑 callout 内部时保持外壳/布局，不要退回 Source Mode。
- 一部分用户坚持 Markdown 暴露是 Obsidian 的优点，担心富文本编辑器写出“看起来好但源码乱”的文件。

这给我们的产品边界很清楚：不要宣传成“彻底 WYSIWYG”。更好的表述是 **clean editing layer over Markdown**，强调可切换、可回退、源码干净。

## 小红书调研办法与本轮判断

小红书的 Web 搜索页面在无登录/无 JS 执行环境下只能拿到 SPA shell，无法可靠提取搜索结果。本轮使用了三种替代方法：

1. 站外搜索：`site:xiaohongshu.com Obsidian 美化 / 插件 / Blue Topaz / Minimal`，直接命中很少。
2. 相邻中文平台交叉验证：Bilibili、知乎、少数派、即刻、CSDN、Obsidian 中文论坛。
3. 中文关键词聚类：`Obsidian 美化`、`Obsidian 主题美化`、`Obsidian 插件推荐`、`Blue Topaz`、`Minimal`、`Style Settings`、`Advanced Tables`、`Notion 替代`、`飞书 Obsidian`。

本轮可保守判断：

- 小红书/中文内容更可能以“好看配置”“主题美化”“笔记软件对比”“Notion/飞书/Obsidian 怎么选”为入口。
- 中文用户对 Blue Topaz、Minimal、Style Settings、CSS snippets 的接受度很高。
- 编辑器增强插件在中文内容里通常以“必装插件”出现，如 Advanced Tables、Hover Editor、Editing Toolbar、Outliner、Hider、Focus Mode。
- 如果要验证小红书本身，下一步应人工在 App 内采样前 50 条搜索结果，记录封面主题、互动数、评论诉求、是否出现具体插件名；不能依赖普通爬虫。

## Peak Assistant 自有 View 的机会

建议做一个独立但可渐进启用的 **Document Editing View / Beautiful Editor View**。定位不是“替代 Obsidian 编辑器”，而是“给 Markdown 文档加一个更舒服的编辑皮肤和块级操作层”。

### 产品原则

1. Markdown 是 source of truth：默认写回标准 Markdown / Obsidian wikilink / frontmatter；只有高级表格这类场景才考虑 fenced block。
2. 不抢 Obsidian 用户的控制感：用户可随时切 Source mode / Live Preview / Document View。
3. 先做块级痛点，不做整页富文本编辑器：表格、图片、Callout、链接卡片、标题/封面、slash insert。
4. Theme-safe：尊重当前 theme tokens，不全局覆盖 Obsidian core UI；提供 Style Settings/配置 JSON。
5. Agent-friendly：内部 block model 要能被 AI/agent 操作，比如“把这段转成表格”“给图片加 caption”“把链接转卡片”。
6. 源码可读：用户卸载插件后，内容仍尽量可读、可迁移。

### MVP 候选

第一阶段不要一口吃成完整 Notion。建议从三个高价值块开始：

1. **Image Block**
   - 粘贴/拖放后显示为干净图片块。
   - hover toolbar：resize、align、caption、open、copy、replace。
   - 拖拽 resize 后回写 `![[image.png|caption|480]]` 或标准 Markdown alt/width 约定。
   - 多图自动提供 2/3/4 grid、masonry-lite、carousel-lite。

2. **Table Block**
   - 对普通 Markdown table 提供 cell focus、Tab/Enter 导航、行列增删、排序、列宽、CSV paste。
   - 源文件仍是 Markdown table。
   - 对合并单元格 / typed columns / rich style，提示升级为 `rich-table`-like block，并明确这是高级模式。

3. **Callout Block**
   - 外壳保持视觉样式，内部可以直接编辑。
   - block toolbar 支持类型、颜色、折叠、icon、标题。
   - 写回标准 Obsidian callout 语法。

第二阶段再补：

- 选区 mini toolbar：bold/italic/link/highlight/code/comment/callout。
- Slash block menu：image/table/callout/link card/code/math/AI rewrite。
- Link card：URL paste 后可转换为卡片，保留原 URL，metadata 可缓存到 fenced YAML 或 frontmatter sidecar。
- Header area：note icon/cover/banner，但不要强依赖 emoji；支持 Lucide/icon set。
- Bases bridge：对 `.base` 嵌入提供 GoodBases-like clean skin，而不是另造数据库。

### 与现有插件的差异化

- 比 Editing Toolbar 更深：不是只提供命令，而是提供块级编辑状态和视觉块。
- 比 Advanced Tables 更广：表格只是 Document View 的一个块类型。
- 比 make.md 更轻：不接管整个 workspace，不引入独立元数据系统。
- 比 Image Converter 更文档化：重点是写作中的图片块体验，而不是图片文件处理大全。
- 比 Rich Table 更保守：默认保持 plain Markdown，只有高级表格才进入私有 block。
- 比主题更有功能：主题负责好看，Document View 负责“好编辑”。

## 技术风险

1. Obsidian 编辑器基于 CodeMirror 6，很多插件通过 decorations/widgets/view plugins 做视觉增强；如果直接替换为 contenteditable，会和 Obsidian 原生编辑、快捷键、移动端、插件兼容性冲突。
2. Live Preview 的 block widget 要精确维护 line/position 映射，否则图片/表格拖拽回写容易错位。
3. 过度使用私有 fenced block 会牺牲 Markdown 可迁移性。
4. 全局 CSS 改 Obsidian core UI 容易和主题冲突；GoodBases 后续把 toolbar restyle 改成可选 snippet，是一个值得参考的边界。
5. 移动端要单独设计：hover toolbar 在移动端必须变成 tap/long-press/bottom sheet。
6. 大文档性能：每个 block 都装 React 组件会有明显成本，应优先用 CM decorations + 按需挂载。

## 建议下一步

1. 做一个 read-only feasibility spike：调研当前 Obsidian/CM6 能否稳定在 Live Preview 中识别 table/image/callout block 并挂载 widget，同时保留原编辑行为。
2. 做两张 mock：一张 Image Block，一张 Table Block。不要先画整页 Notion；先证明最痛的块能好用。
3. 写一个最小 spec：`DocumentView` 的 source-of-truth、block grammar、fallback、uninstall 后可读性、mobile behavior。
4. 如果进入实现，第一版只做 Image Block + Table Block 的视觉增强，不碰 workspace、数据库和全局主题。

## 关键来源

- Obsidian Help: [Views and editing mode](https://obsidian.md/help/edit-and-read)
- Obsidian Help: [Bases](https://obsidian.md/help/bases), [Bases views](https://obsidian.md/help/bases/views)
- Obsidian Community: [home / marketplace](https://community.obsidian.md/)
- Registry: [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
- Forum: [Fully visual editor mode](https://forum.obsidian.md/t/fully-visual-editor-mode-wysiwyg-wyswyg/41517)
- Forum: [Live Preview table cell-by-cell](https://forum.obsidian.md/t/live-preview-support-editing-a-table-cell-by-cell/34110)
- Forum: [Live Preview while editing callout](https://forum.obsidian.md/t/have-live-preview-while-editing-a-callout-edit-callouts-progressively-and-maintain-live-preview-of-items-not-being-edited/84231)
- Forum: [Upgrade tables to be like Bases](https://forum.obsidian.md/t/upgrade-tables-to-be-like-bases-single-file-base-view/104221)
- Plugins: [Editing Toolbar](https://community.obsidian.md/plugins/editing-toolbar), [Advanced Tables](https://community.obsidian.md/plugins/table-editor-obsidian), [Dragger](https://community.obsidian.md/plugins/dragger), [GoodBases](https://community.obsidian.md/plugins/good-bases), [Image Converter](https://community.obsidian.md/plugins/image-converter), [Image Layouts](https://community.obsidian.md/plugins/obsidian-image-layouts), [Scalosaurus](https://community.obsidian.md/plugins/scalosaurus), [Rich Table](https://community.obsidian.md/plugins/rich-table), [Sheet Plus](https://community.obsidian.md/plugins/sheet-plus)
- 中文社区: [Blue Topaz GitHub](https://github.com/PKM-er/Blue-Topaz_Obsidian-css), [Blue Topaz 中文论坛介绍](https://forum-zh.obsidian.md/t/topic/1664), [即刻 Obsidian 配置长帖](https://m.okjike.com/originalPosts/6317dd9989e1f3feb56f30b2)
