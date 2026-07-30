# Peak Sheet 数据决策工作台 Mock

**Status:** Design mock only · research candidate · implementation pending
**Created:** 2026-07-30
**Redesigned:** 2026-07-31
**需求真值:** [Peak Sheet 产品与架构评估](../../research/2026-07-22-peak-sheet-compute/README.md)
**打开:** [交互 Mock](./index.html)

## 这次重做解决什么

旧稿把 Table、Chart、未来视图和 Ask Peak 同时铺在画布上，更像功能陈列页，缺少数据产品的工作层级。本版不做表面润色，重新建立数据语言优先级：

```text
字段类型
└── 视图类型（Table / Board / Calendar / Gallery / Dashboard）
    └── 简单公式和统计
        └── AI 辅助（解释、生成受限计划）
```

工作区里的数据表仍是容器，但产品价值不从“有几个页面”开始，而是从字段能否定义数据、视图能否重组数据、公式与统计能否回答问题开始。

借鉴分两层：

- “门”表格示例：高信息密度、紧凑网格和字段内微型数据图形；不把深色主题本身当成设计要求；
- 飞书多维表格：`数据表 → 视图 → 字段 → 记录` 的层级、视图标签、字段配置入口，以及数据表级独立仪表盘。

参考资料：[飞书——多维表格产品分析](https://www.woshipm.com/evaluating/5935411.html)。本 Mock 借鉴产品结构与交互原则，不复刻品牌视觉或完整功能范围。

## 视觉与交互原则

- **字段类型是地基：** Mock 明确展示文本、数字、单选、多选、日期、复选框、链接与公式；不同类型决定输入、校验、排序和显示。
- **表格是主编辑面：** 默认首屏直接进入密集数据区，冻结首列，使用分组、单选标签和计算字段表达数据。
- **视图是投影：** Table、Board、Calendar、Gallery 和 Dashboard 共用 Dataset revision 12，不复制记录。
- **公式是受限数据能力：** 支持字段引用、算术、比较、`IF / AND / OR / ROUND / DATE_DIFF` 等简单函数，不开放任意 JavaScript、Python、网络或文件 I/O。
- **统计贴近数据：** 表格底部直接显示记录数、去重计数、中位数、平均值和条件计数；仪表盘只是这些统计结果的进一步消费层。
- **仪表盘是次级分析页：** 使用统一筛选驱动 KPI、趋势、漏斗、渠道回复率与机会优先级。
- **AI 退到辅助层：** 默认隐藏；打开后先生成受限 ComputePlan，用户接受后才改变当前视图。
- **字段配置是真正的结构操作：** 展示字段列表、类型与单选选项，而不是装饰性说明弹窗。
- **移动端用于消费：** 查看指标、行动窗口与审批；不承诺完整 grid 编辑。
- **主题不承担设计感：** 默认使用中性浅色工作台，同时提供深色切换；两种主题保持相同的信息层级、密度和数据表达。

## 可操作路径

1. 点击“字段配置”，再打开“字段类型”选择器，查看基础类型与计算类型。
2. 点击“公式”查看字段引用、受限函数、类型检查和逐记录结果预览。
3. 点击“统计”显示或隐藏表格底部的列统计。
4. 在顶部切换“全部记录 / 求职看板 / 面试日历 / 岗位画册 / 决策仪表盘”。
5. 点击“分组”切换表格的阶段分组。
6. 点击“分析”生成计划，并应用“高价值待跟进”临时视图。
7. 点击 revision 左侧的 Dataset 图标查看数据边界。
8. 点击手机图标查看移动端只读仪表盘。
9. 点击月亮 / 太阳图标切换浅色与深色主题。

## 范围边界

- 首版能力顺序是 field schema → editable Table → simple formula/statistics → read-only analysis view；AI ComputePlan 在这些能力之后。
- Board、Calendar、Gallery 和 Dashboard 在 Mock 中用于验证 View adapter 与信息架构，不等于同时进入首版承诺。
- 公式只覆盖确定性的受限表达式；Relation、Lookup、Rollup 和任意脚本计算均为后续能力。
- 没有生产 Dataset runtime、稳定 record ID、formula evaluator、ComputePlan executor、真实计算、同步或写回。
- 页面记录、revision、图表与计划结果均为静态 fixture。

## 验证

```bash
node docs/gstack/peak-sheet-multiview-2026-07-30/validate.mjs
```

验证脚本检查字段类型、公式预览、表尾统计、Table、Board、Calendar、Gallery、Dashboard、AI 计划、数据边界、移动预览、本地链接、控制台错误和桌面布局，并生成：

- `preview.png`：数据表首屏；
- `preview-fields.png`：字段类型选择器；
- `preview-formula.png`：简单公式与结果预览；
- `preview-gallery.png`：画册视图；
- `preview-dashboard.png`：次级决策仪表盘；
- `preview-plan.png`：ComputePlan 审阅；
- `preview-mobile.png`：移动端消费模式。
