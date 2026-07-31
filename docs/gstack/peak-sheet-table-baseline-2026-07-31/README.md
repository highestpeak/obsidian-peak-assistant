# Peak Sheet · 简单表格视觉基准

这是一个**独立于完整多视图 Mock 的设计基准稿**。原稿
[`../peak-sheet-multiview-2026-07-30/index.html`](../peak-sheet-multiview-2026-07-30/index.html)
继续保留；本稿不承载字段配置、公式库、AI 分析、看板或长文本编辑器，只回答：

> Peak Sheet 的字体、字重、行高、横线、数字对齐、Tag 和留白，在没有功能堆叠时是否已经成立？

## 基准约束

| 项目 | 当前基准 |
|---|---|
| 主记录 | 14.5px / 570，辅助职位 12px / 420 |
| 普通字段 | 13.5px / 450 |
| 数字 | 13.5–14px / 570–650，等宽字体、右对齐、tabular numerals |
| 字段表头 | 11.5px / 590，等宽字体 |
| 默认行高 | 42px |
| 字段表头高度 | 38px |
| Tag | 24px 高、12px 字号、无边框、4px 圆角 |
| 普通分隔线 | 1px 低对比横线；不显示普通纵向格线 |
| 结构分隔线 | 表头和总计使用 2px 墨色横线 |
| 活动单元格 | 1.5px 单一强调色，不叠加阴影和第二焦点 |
| 背景 | 无渐变、无斜纹、无斑马纹 |

## 内容约束

- 只显示 7 个业务字段和 1 个行号列，避免在基准阶段用 17 列掩盖排版问题。
- Stage 是唯一常驻 Tag 字段；Mode、地点、日期和行动继续使用普通文本。
- 公司与职位共用一条阅读基线；职位过长时只截断辅助文本。
- 数字和单位拆分层级，金额与 Fit 右对齐。
- 下一步行动允许长文本，但保持单行省略；本稿不重新设计长文本编辑态。
- 分组标签承担章节作用，行内 Tag 不复制章节样式。

## 范围

- 设计 Mock，不是 production Sheet runtime。
- 不改变原多视图稿，不修改 roadmap 状态。
- 不承诺 Board、Calendar、Relation、Lookup、Rollup 或分享导出。
- 若本基准获得认可，再将同一套 tokens 逐层应用到完整编辑表。

## 验证

```bash
node docs/gstack/peak-sheet-table-baseline-2026-07-31/validate.mjs
```

生成：

- `preview-baseline.png`：完整基准稿；
- `preview-table.png`：只聚焦表格排版。
