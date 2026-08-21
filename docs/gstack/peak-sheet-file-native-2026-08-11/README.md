# Peak Sheet · Local AI Spreadsheet V5 设计稿

这是一份只修改设计资产、不修改生产插件的交互稿。V5 把 Peak Sheet 收敛成一条产品路线：

> **像 Excel 一样直接开始填，像飞书一样自然地结构化，再让 AI Formula 和 Script 接管复杂操作。**

Peak Sheet 默认 local-first；分享、多人协作、云端执行和 Schedule 只在用户主动进入 PeakShare 后发生。

## V5 的核心决定

- **文件原生**：Obsidian 文件目录仍是唯一 Sheet 导航；一个 `.peaksheet` 文件就是一张 Sheet，页面不再维护内部 Sheet Finder。
- **Grid Core 优先**：统一成 `GridState = active cell + anchor + range + navigation/selecting/editing mode`。单击、拖选、Shift 扩展、方向键、Enter / F2、直接输入、Tab、Esc、Delete、复制/剪切/粘贴都围绕同一状态工作。
- **默认就是大网格**：每张 Sheet 至少渲染 30 个虚拟列和 64 个虚拟行；`Blank Sheet.peaksheet` 用于直接体验空白工作面。虚拟区域不写入数据模型。
- **按使用 materialize**：在虚拟单元格输入、粘贴一个矩形范围、双击虚拟表头命名，才创建对应 row 和 General/Text field。用户不需要先 Add Row / Add Column。
- **Typed Field 是按需增强**：空列默认 General；`+` 和 `Typed field` 是 Select、Date、File、Formula、Script output 等高级字段入口，而不是开始输入前的必经步骤。
- **一级 Views 收敛**：只保留 Table / Board / Calendar。Chart 仍可由 AI 生成分析产物，但不占一级 View；Pivot 暂不进入网格。
- **Data Ops 够用即可**：Filter / Sort / Group 保留；Group 面板直接提供 Count / Sum / Average / Min / Max，用轻量汇总覆盖常见 Pivot 需求。
- **AI Formula 不膨胀**：自然语言生成、逐字公式反馈、Preview、类型检查、Explain、Fix 都在 Ask AI 侧栏完成。用户无需记忆大量函数。
- **Scripts 不是 View**：顶部 `Scripts` 打开独立 Sidecar，首版只表达 Save → Preview → Run locally → Progress → History；没有 Trigger、Cron 或 Workflow Builder。
- **Local / PeakShare 严格分层**：页面明确显示 Local。只有点 `Share via PeakShare` 才看到 Upload、Permissions、Collaboration、Cloud Scripts 和 Schedule 的边界说明；本地界面没有协作头像、在线状态和权限菜单。

## 建议体验路径

1. 点击左侧 `Blank Sheet.peaksheet`，观察 A–AD 虚拟列和 64 个虚拟行；它们尚未进入 Dataset。
2. 选中虚拟单元格直接输入字符；按 Enter 保存并向下，Tab 保存并向右，Esc 取消。
3. 在空白区域粘贴 TSV 矩形；对应 rows 和 General fields 自动 materialize。
4. 拖选范围，尝试 Shift + Click / Arrow、Delete、Cmd/Ctrl + C / V / X；左下角同步显示范围和统计。
5. 双击 `General` 虚拟表头直接命名；需要 Select、File、Formula 时再点右侧 `+` 或工具栏 `Typed field`。
6. 打开 Group，查看按 Status 的 Count 汇总；不进入复杂 Pivot 工作面。
7. 选择 Launch Tracker 的 Status / Due date 数据，打开 Ask AI：生成公式、查看类型检查、Explain / Fix，再 Preview 后 Insert。
8. 点击顶部 `Scripts`，依次体验 Save、Preview、Run locally、Progress 和 History。
9. 点击 `Share via PeakShare`，确认本地文件在主动继续前不会上传。
10. 切换 Table / Board / Calendar，确认它们仍是同一个 `.peaksheet` Dataset 的投影。

## 数据与执行边界

- `.peaksheet` 内部使用结构化 JSON 保存 Dataset ID、revision、materialized fields、rows、views 和 saved scripts。
- 虚拟空行空列只属于 Grid projection，不写入 canonical file。
- CSV / XLSX 是导入导出格式，不作为 canonical store。
- JSONL 事件历史用于恢复、Undo / Redo 和 Script run history，但不能替代 `.peaksheet` 文件真值。
- SQLite 如果加入，只能作为可重建查询投影。
- Formula 持续计算；Script 是用户主动 Preview / Run 的有界本地批处理。
- PeakShare 上传的是用户主动选择的版本化副本；本地版不隐式同步或静默开启云端执行。

## 明确不进入当前主界面

- 条件格式、完整 Pivot、巨量 Excel 函数、VBA、Power Query。
- Trigger / Action / Cron、通用 Workflow Builder。
- 协作头像、在线状态、权限菜单、实时多人编辑。
- Relation / Lookup 保持 P1，等 Grid Core、Typed Field、AI Formula 和 Scripts 手感稳定后再进入。

## 视觉方向

继续使用克制的白灰纸面、单一紫色焦点和 31px 紧凑数据行。虚拟列用较淡的 `General` 表达“随时可填但尚未结构化”；AI 与 Scripts 都使用编辑器右侧临时工作面，不变成 Dashboard，也不与 Table / Board / Calendar 混成同级 View。

## 布局契约（V5.1）

这份 mock 不把“能放下”当成布局完成。每个高频区域都遵守固定槽位、可截断文字和受控滚动的合同，避免 hover、选中或长内容改变几何。

- **文档头部**：`identity | save/share` 两个稳定分区；标题与文件路径可以收缩、截断，保存状态和操作始终不换行。窄屏先折叠说明文字，再保留图标入口。
- **视图与数据工具栏**：View、Scripts、AI 是固定宽度操作；搜索是可收缩区；Filter / Sort / Group / Fields 位于可横向取用但不挤压 AI 的操作带。不会再用一个无规则 spacer 或 `overflow: hidden` 静默吃掉按钮。
- **表格**：表头、行号、虚拟列、单元格均是固定行高；hover、range、active 都通过背景、outline 或绝对定位的伪元素表达，绝不增加 border 尺寸或推动相邻格子。字段、tag、状态和值默认单行截断。
- **状态栏**：选择状态与文件路径是可收缩文本槽；帮助、格式和 revision 是固定槽。窄宽度时先隐藏帮助和路径，不让 revision 被挤出。
- **AI / Scripts sidecar**：抽屉只允许作为临时工作面使用绝对定位；内部固定 `header + context + minmax(0, scroll body) + footer`。列表标题、摘要、时间与底部 CTA 都预留独立槽位并截断，滚动只发生在 body。
- **响应策略**：1100px 先收起辅助文字和 Typed field，860px 再隐藏 vault 与次级 data ops；核心的 Table、Group、Ask AI、单元格编辑和选中信息不改位置。

## 信息宽度与 Overlay 契约（V5.2）

本次不再把所有文本都当作同一种“需要省略”的内容。字段有语义宽度；overlay 有唯一开关状态。

- **表格字段**：Primary text 默认 220px（160–520px）；Link 200px（144–520px）；Select 112px（104–220px）；Date 108px（96–180px）；Number 96px（84–180px）；Checkbox 104px（96–152px）。虚拟 General 列为稳定的 160px。空间不足时保持这些语义最小宽度，让 grid 横向滚动，不把 Status、Due date 或列名压成不可识别的缩写。
- **字段头**：列字母是固定内容，字段名才是唯一可收缩槽；配置槽固定 24px，resize handle 置于列边缘且不参与宽度分配。拖动或键盘 Arrow/Home/End 调整列宽，不改变行高、内容位置或其他字段的宽度合同。
- **文字策略**：标题、文件路径、自由文本可以截断；状态、badge、日期、计数、按钮和菜单项保持单行且拥有语义最小宽度。文件路径已在标题上方直接可见，不再提供冗余的 Show location 浮层。
- **Overlay 状态机**：全部 transient surface 共用 `closed | open(id, trigger)`：同一 trigger 再次点击会关闭；另一个 trigger 会切换；外部 pointerdown 和 Escape 会关闭；关闭后返回 trigger 焦点。Field menu、field editor、row menu、Group、location card、Ask AI、Scripts 和 PeakShare 同时只会打开一个。
- **Ask AI viewport 保持**：打开 AI 不会自动 focus composer，也不会要求浏览器把输入框滚进视口；workspace / document 明确收紧为 `min-height: 0 + overflow: hidden`，只有 grid body 与 AI thread 自己拥有滚动。用户点击 composer 后才开始输入。
- **滚动 ownership**：Scripts 与 Ask AI 都是 `header + context + minmax(0, scroll body) + footer`；body 有末端安全内边距和 `overscroll-behavior: contain`，footer 不会覆盖最后一个操作或历史条目。
- **宿主隔离**：`.peak-sheet-root` 在根边界固定 box sizing、字体、line-height 和 form control 继承，避免嵌入 Obsidian 时的 button/input 默认几何污染。

### 极端 fixture 检查表

每次视觉验收都至少覆盖：短/超长中英文标题、无空格长路径、空标题、0 与大 count、空数据、hover/focus/range selected、拖出 resize handle、Popover 重复触发与切换、外部点击、Escape、窄/宽容器、横向滚动以及 125% / 150% zoom。当前文件浏览器自动化受 `file://` 策略限制，因此这些属于 owner-visible mock 验收；脚本只验证布局/状态机契约存在，不能替代真实渲染证据。

## 同一 Dataset 的多视图（V5.3）

Table、Board、Calendar 不是三个独立页面，而是同一个 `.peaksheet` 的 layout：同一行记录、字段、筛选/排序语义、revision 和 `New` 操作都保持一致。这个心智与 Notion database views 一致：Board 按 `Status` 字段分组，并将卡片拖入另一列直接改写该字段；Calendar 按选定 Date 字段放置相同行，点击卡片回到 Table 的同一记录，月份导航只改变当前 view 的窗口。Notion 也将 Board 定义为按属性分组、Calendar 定义为按 Date 属性显示的同一数据库视图。[Notion database views](https://www.notion.com/help/views-filters-and-sorts)

## 验证

```bash
node docs/gstack/peak-sheet-file-native-2026-08-11/validate.mjs
```
