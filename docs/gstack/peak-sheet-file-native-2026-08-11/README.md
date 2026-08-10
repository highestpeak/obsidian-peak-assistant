# Peak Sheet · File-native V3 设计稿

这是一份独立于 Editorial V2 的交互设计稿，用于确认 Peak Sheet 的新产品模型。它只修改设计资产，不修改生产插件。

## 这版解决的问题

- 删除 Peak Sheet 自己的 `Find a sheet / New sheet / sheet list` 侧栏。
- Obsidian 文件目录成为唯一 Sheet 导航；每个 `.peaksheet` 文件就是一张 Sheet。
- 页面只显示当前文件的完整编辑面，不再同时管理全部 Dataset。
- 表尾常驻 `New record`，新增行默认落在最下面。
- 最后一列表头右侧常驻 `+`，直接新增字段。
- 单列表头支持左键菜单和右键菜单；新增、编辑、插入、复制、隐藏、删除都就近完成。
- 行号支持右键菜单；不再让每一行常驻复制、删除图标。
- Table / Board / Calendar / Chart 共享同一文件内的数据。
- 文件标题、Vault 路径、保存位置和 canonical carrier 在页面中可见但不抢占注意力。

## 建议体验路径

1. 在左侧 Obsidian 文件目录切换三份 `.peaksheet` 文件。
2. 点击表格最下方 `New record`。
3. 点击最后一列表头右侧的 `+`，输入名称并新增字段。
4. 点击任意字段标题的下拉箭头，或右键字段标题。
5. 右键任意行号，尝试插入、复制或删除行。
6. 双击普通单元格编辑；点击复选框字段直接切换。
7. 切换 Board / Calendar / Chart，确认它们仍是同一个文件的投影。
8. 点击标题右侧 `Show location`，查看文件承载说明。

## 存储表达

- 设计稿采用 `.peaksheet` 作为用户可见的自定义扩展名。
- 文件内部建议使用结构化 JSON，保存 Dataset ID、revision、fields、rows 和 views。
- CSV / XLSX 是导入导出格式，不作为 canonical store。
- JSONL 事件历史可以保留为隐藏恢复记录，但不能替代 `.peaksheet` 文件成为数据真值。
- SQLite 如果未来加入，只能作为可重建查询投影。

## 视觉方向

保留 Editorial V2 的纸面层级、克制配色、42px 数据行、轻量工具栏与紫色焦点；不增加新的 Dashboard 风格卡片系统。模拟的 Obsidian 文件目录仅用于解释文件归属，不属于 Peak Sheet 内部 UI。

## 验证

```bash
node docs/gstack/peak-sheet-file-native-2026-08-11/validate.mjs
```
