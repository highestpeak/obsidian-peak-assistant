# Peak Sheet · Grid-native V4 设计稿

这是一份独立于 Editorial V2 的交互设计稿，用于确认 Peak Sheet 的新产品模型。它只修改设计资产，不修改生产插件。

## 这版解决的问题

- 删除 Peak Sheet 自己的 `Find a sheet / New sheet / sheet list` 侧栏。
- Obsidian 文件目录成为唯一 Sheet 导航；每个 `.peaksheet` 文件就是一张 Sheet。
- 页面只显示当前文件的完整编辑面，不再同时管理全部 Dataset。
- 打开就是 32 行连续网格；已填写记录之后仍保留可直接选择、编辑的空白行，不再像数据库列表只显示少量记录。
- 顶部 `+ Row` 和表底吸附的 `+ Add row` 都是一次点击立即在数据末尾新增，不再经过二级菜单。
- 最后一列表头右侧常驻 `+`：一次点击立即创建文本列，并在表头原位选中名称；不先打开字段配置表单。
- 列头左键选择整列，拖拽、Shift-click、Shift + 方向键选择连续单元格范围；左下角即时显示范围、非空值数量以及数字 Sum / Avg。
- 字段配置从选择动作中分离：右键列头或点击列头右侧小箭头，才打开编辑、插入、复制、隐藏、删除菜单。
- 行号左键选择整行、右键配置；不让每一行常驻复制、删除图标。
- Table / Board / Calendar / Chart 共享同一文件内的数据。
- 文件标题、Vault 路径、保存位置和 canonical carrier 在页面中可见但不抢占注意力。
- `Ask AI` 是可交互侧栏：读取当前选区 → 规划 → 检查三段动画清晰可见；公式逐字生成、结果预览后才允许插入 Sheet，并提供基于真实行的 blocker 总结示例。

## 建议体验路径

1. 在左侧 Obsidian 文件目录切换三份 `.peaksheet` 文件。
2. 观察已有记录下面连续存在的空白网格；点击顶部 `+ Row` 或底部吸附的 `+ Add row`，新行直接出现并获得焦点。
3. 点击最后一列表头右侧的 `+`；列立即创建，直接输入名称后按 Enter，不出现二级字段菜单。
4. 从任意单元格拖到另一单元格，或先点一个单元格再 Shift-click；观察选区边框和左下角统计。
5. 点击列头选择整列；右键列头或点击小箭头再配置字段。双击列名可原位重命名。
6. 点击行号选择整行；右键行号尝试插入、复制或删除。双击普通单元格直接编辑。
7. 先拖选 Status / Due date 的一段数据，再点 `Ask AI` → `Generate formula column`；观察读取、规划、校验和逐字公式动画，最后点 `Insert formula column`。
8. 在 `Ask AI` 中点 `Summarize selection`，查看基于源行的 release blocker 分析。
9. 切换 Board / Calendar / Chart，确认它们仍是同一个文件的投影。
10. 点击标题右侧 `Show location`，查看文件承载说明。

## 存储表达

- 设计稿采用 `.peaksheet` 作为用户可见的自定义扩展名。
- 文件内部建议使用结构化 JSON，保存 Dataset ID、revision、fields、rows 和 views。
- CSV / XLSX 是导入导出格式，不作为 canonical store。
- JSONL 事件历史可以保留为隐藏恢复记录，但不能替代 `.peaksheet` 文件成为数据真值。
- SQLite 如果未来加入，只能作为可重建查询投影。

## 视觉方向

保留 Editorial V2 的纸面层级、克制配色、轻量工具栏与单一紫色焦点；数据行收紧到 31px，让首屏更接近 Excel / Google Sheets 的连续工作网格。AI 侧栏仍是编辑器内的临时工作面，不增加新的 Dashboard 卡片系统。模拟的 Obsidian 文件目录仅用于解释文件归属，不属于 Peak Sheet 内部 UI。

## 验证

```bash
node docs/gstack/peak-sheet-file-native-2026-08-11/validate.mjs
```
