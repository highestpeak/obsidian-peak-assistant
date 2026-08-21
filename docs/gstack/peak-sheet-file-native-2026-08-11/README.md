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

## 验证

```bash
node docs/gstack/peak-sheet-file-native-2026-08-11/validate.mjs
```
