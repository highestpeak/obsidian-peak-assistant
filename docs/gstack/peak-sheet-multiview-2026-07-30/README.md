# Peak Sheet 数据决策工作台 Mock

**Status:** Design mock only · research candidate · implementation pending
**Created:** 2026-07-30
**Redesigned:** 2026-07-31
**需求真值:** [Peak Sheet 产品与架构评估](../../research/2026-07-22-peak-sheet-compute/README.md)
**打开:** [交互 Mock](./index.html)

## 这次重做解决什么

旧稿把 Table、Chart、未来视图和 Ask Peak 同时铺在画布上，更像功能陈列页，缺少数据产品的工作层级。本版不做表面润色，重新建立：

```text
工作区
└── 数据表（申请记录 / 目标公司 / 人脉跟进 / 面试复盘）
    └── 视图（Table / Board / Calendar / Dashboard）
        ├── 字段配置、筛选、分组、排序
        └── 记录与聚合结果
```

借鉴分两层：

- “门”表格示例：高信息密度、紧凑网格、字段内微型数据图形、深色数据工作台气质；
- 飞书多维表格：`数据表 → 视图 → 字段 → 记录` 的层级、视图标签、字段配置入口，以及数据表级独立仪表盘。

参考资料：[飞书——多维表格产品分析](https://www.woshipm.com/evaluating/5935411.html)。本 Mock 借鉴产品结构与交互原则，不复刻品牌视觉或完整功能范围。

## 视觉与交互原则

- **表格是主角：** 默认首屏直接进入密集数据区，冻结首列，使用分组汇总、单选标签、匹配度环和等待时间条表达数据。
- **视图是投影：** Table、Board、Calendar 和 Dashboard 共用 Dataset revision 12，不复制记录。
- **仪表盘是独立分析页：** 使用统一筛选驱动 KPI、趋势、漏斗、渠道回复率与机会优先级。
- **AI 退到辅助层：** 默认隐藏；打开后先生成受限 ComputePlan，用户接受后才改变当前视图。
- **字段配置是真正的结构操作：** 展示字段列表、类型与单选选项，而不是装饰性说明弹窗。
- **移动端用于消费：** 查看指标、行动窗口与审批；不承诺完整 grid 编辑。

## 可操作路径

1. 在顶部切换“全部记录 / 求职看板 / 面试日历 / 决策仪表盘”。
2. 点击“字段配置”查看字段结构与阶段选项。
3. 点击“分组”切换表格的阶段分组。
4. 点击“分析”生成计划，并应用“高价值待跟进”临时视图。
5. 点击 revision 左侧的 Dataset 图标查看数据边界。
6. 点击手机图标查看移动端只读仪表盘。

## 范围边界

- 首版产品闭环仍是 editable Table + read-only analysis view + ComputePlan preview/accept + manual refresh。
- Board、Calendar 和更远视图在 Mock 中用于验证 View adapter 与信息架构，不等于进入首版承诺。
- 没有生产 Dataset runtime、稳定 record ID、ComputePlan executor、真实计算、同步或写回。
- 页面记录、revision、图表与计划结果均为静态 fixture。

## 验证

```bash
node docs/gstack/peak-sheet-multiview-2026-07-30/validate.mjs
```

验证脚本检查 Table、Board、Calendar、Dashboard、字段配置、AI 计划、数据边界、移动预览、本地链接、控制台错误和桌面布局，并生成：

- `preview.png`：数据表首屏；
- `preview-dashboard.png`：决策仪表盘；
- `preview-fields.png`：字段配置；
- `preview-plan.png`：ComputePlan 审阅；
- `preview-mobile.png`：移动端消费模式。
