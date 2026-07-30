# Peak Sheet 多视图工作流 Mock

**Status:** Design mock only · research candidate · implementation pending
**Date:** 2026-07-30
**需求真值:** [Peak Sheet 产品与架构评估](../../research/2026-07-22-peak-sheet-compute/README.md)
**打开:** [交互 Mock](./index.html)

## 设计目标

这套 Mock 验证的不是“能放多少种视图”，而是一个更窄的产品判断：

> 同一份本地 Dataset 可以按工作任务切换视图；Table 与 Chart 先形成真实闭环，后续视图都通过 adapter 消费同一份 records、schema 和 revision。

Fixture 选择“求职追踪”，因为它能同时覆盖记录编辑、阶段变化、日期、位置、统计与移动查看，不需要虚构企业 BI 场景。

## 可操作路径

1. 在左侧切换 Table、Chart、Board、Gallery、Calendar 和 Map。
2. 点击“添加视图”查看 3D globe 等 adapter 候选。
3. 点击保存筛选“远程岗位”或 Table 工具栏的“筛选”。
4. 在 Ask Peak 中生成计划，审阅后接受并保存 recipe。
5. 切到 Run details 查看 receipt。
6. 点击页面右上角“移动消费模式”查看只读、刷新与审批边界。

## 范围标签

- **首版闭环：** editable Table、read-only Chart、同一 Dataset revision、Ask Peak plan preview。
- **后续 adapter：** Board、Gallery、Calendar、Map。
- **实验：** 3D globe，只作为 spatial adapter，不进入核心视图清单。
- **移动端：** 查看、筛选、刷新和审批；不展示完整 grid 录入。

## 非实现声明

这是静态 HTML 交互 Mock，不是 Obsidian 生产界面，也没有 Dataset runtime、稳定 record ID、ComputePlan executor 或真实写回。Mock 中的 records、revision、receipt 和刷新结果都是用于评审信息架构的固定 fixture。

## 验证

```bash
node docs/gstack/peak-sheet-multiview-2026-07-30/validate.mjs
```

验证脚本检查全部视图切换、计划接受、移动预览、本地链接、控制台错误与桌面布局，并生成：

- `preview.png`：Table 首屏；
- `preview-chart.png`：Chart 首版投影；
- `preview-plan.png`：ComputePlan 审阅；
- `preview-mobile.png`：移动消费模式。
