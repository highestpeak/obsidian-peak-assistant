# Vault Intelligence：Activity 时间可视化调研与设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Overview 与 Vault map](./2026-08-12-vault-intelligence-overview-and-vault-map-design.md)

本文记录 Activity 图为什么需要重做、成熟产品与组件采用了什么模式，以及当用户有数百、数千甚至更长期活动时页面如何保持可读。它是 Activity 的专项设计，不把组件细节塞回产品 Overview。

## 1. 结论

Activity 不应是一张固定“主题行 × 六周列”的强度表。那种表只能容纳极少主题，没有连续时间形状，也无法解释大量事件如何聚合。

推荐的 Activity 是一个三层时间探索器：

```text
长周期密度概览 / Navigator
          ↓ 选择时间范围
主题流图：这段时间活动量与主题构成如何变化
          ↓ 选择主题、峰值或事件簇
具体证据：文件、Chat context、Project、Composer、AI Graph revision
```

它不是 productivity dashboard。面积或颜色只代表能够追溯到本地 evidence 的活动量，不代表工作质量、投入时间或效率。

## 2. 外部模式与可借鉴部分

| 模式或组件 | 它解决什么 | 对 Vault Intelligence 的启发 | 不直接照搬什么 |
|---|---|---|---|
| [GitHub Contributions](https://docs.github.com/en/account-and-profile/concepts/contributions-on-your-profile) | 一年活动先压缩成 Calendar heatmap，再提供 activity overview、筛选和详细 timeline | 长周期先看密度和异常日期；详情按需展开，不把全部事件同时画出来 | GitHub 的单色贡献数不能解释主题构成，也不能成为生产力评分 |
| [Apache ECharts Calendar heatmap](https://echarts.apache.org/examples/en/editor.html?c=calendar-heatmap) | 在日/周/月坐标中展示长期密度，结合 `visualMap` 表达量级 | 适合 Activity 的 3–12 个月 overview，以及点击某天缩小范围 | Calendar 只回答“什么时候多”，不能独立回答“在做什么” |
| [Apache ECharts themeRiver 与交互组件](https://echarts.apache.org/en/option.html) | ThemeRiver / stacked area 表达主题构成随时间变化；`dataZoom`、tooltip、brush、legend 支持探索 | 主图用平滑 stacked area 或受约束的 theme river，主题图例可筛选，range brush 控制可见范围 | 居中式 streamgraph 容易让绝对量难读；需要零基线或同时保留总量参考 |
| [vis-timeline](https://visjs.github.io/vis-timeline/docs/timeline/index.html) | Point / range event、groups、nested groups、zoom、horizontal scroll 与大量重叠事件 clustering | 适合作为选定范围后的精确事件 lane；cluster 随 zoom 解散，点击查看原始 evidence | 它用 DOM 渲染 items；官方也提醒 custom ordering 不适合大量 item，因此不作为全量主图 |
| [Highcharts Stock data grouping](https://www.highcharts.com/docs/stock/data-grouping) 与 [Navigator](https://www.highcharts.com/docs/stock/navigator) | 按像素宽度自动聚合大量时间点，并用小型 overview 控制主视图范围 | 聚合粒度应由可见范围决定，而不是一次把所有 raw events 画出来；Navigator 与主图必须联动 | 当前仓库没有 Highcharts；许可、体积和现有技术栈需要单独评估，不因 Demo 漂亮直接引入 |
| [Observable Plot Calendar](https://observablehq.com/@observablehq/plot-calendar) | 用 layered marks、facet、transform 快速构造 Calendar、heatmap 和 small multiples | 适合原型研究和验证不同聚合方式，也说明一个 Activity 页面可以由多层 marks 组合而成 | 不把探索 notebook 的控制密度直接搬进产品 UI |

## 3. 推荐页面结构

### 3.1 顶部：解释与控制

- 一句 AI 总结：哪一类关注变强、变弱或发生交叉；
- 当前时间范围和聚合粒度；
- Topic legend，可选择一个主题或恢复 All topics；
- 活动总量明确写成 `attributed activities`，不使用 `productivity`、`engagement` 或 `time spent`。

### 3.2 长周期 Navigator

- 默认保留 6–12 个月密度；
- 每个 cell / bar 表示一天或一周的 evidence 数量；
- brush 选择主图时间范围；
- 当范围扩大时自动从 day 聚合到 week / month；
- hover 显示总数和主要主题，click 锁定范围。

### 3.3 主图：主题活动流

- X 轴是连续时间；
- 总厚度表达当前 bin 的活动总量；
- 分层颜色表达 Topic 构成；
- 重要事件用可点击 marker 标注，例如 Research import、AI Graph revision 或大批 Composer apply；
- 点击 legend 只突出目标主题，不删除原始数据；
- tooltip 同时显示 total、topic breakdown、聚合粒度和 evidence 数。

第一版推荐零基线 stacked area，而不是完全居中的 streamgraph。它仍然有平滑流动的视觉效果，但更容易比较绝对活动量。只有用户问题明确是“关注构成如何移动”而不是“活动量有多少”时，才切换到 ThemeRiver 表达。

### 3.4 下方：事件簇与具体证据

- 主图默认不绘制每个原始事件；
- 同一时间附近、同一 Topic、同一来源的事件先形成 cluster；
- cluster 显示时间、数量、主要来源和一行摘要；
- 点击 cluster 后显示具体文件、Chat context、Project change、Composer activity 和 AI Graph revision；
- 只有 selected range 的证据进入列表，列表可以分页或虚拟化。

## 4. 大量活动时的聚合规则

| 可见范围 | 主图 bin | 事件层默认表达 |
|---|---|---|
| 1–14 天 | 小时或天 | 可显示单个高影响事件，其余按日聚合 |
| 2–12 周 | 天 | 按 Topic 的 daily stack；相邻事件形成 cluster |
| 3–12 月 | 周 | 周级 Topic stack；只显示重大方向变化 marker |
| 超过 1 年 | 月 | Calendar / density overview；选中范围后再进入周或日 |

聚合必须是确定性的，并保留 `bucketStart`、`bucketEnd`、`count`、`topicBreakdown` 和 `evidenceIds`。缩放只是改变 projection，不丢失原始 event record。

## 5. 组件建议

### 5.1 推荐方向：Apache ECharts

如果进入产品实现，优先评估 Apache ECharts：

- Canvas 对大量时间点更合适；
- Calendar、heatmap、stacked area、ThemeRiver、tooltip、legend、`dataZoom` 和 brush 可以在同一组件模型中组合；
- SVG renderer 可用于较小数据与清晰导出；
- 可以用同一 range state 同步 Navigator、主图和事件列表。

当前仓库没有 ECharts，本文只做产品与技术方向记录，不授权新增依赖。

### 5.2 可选方向

- 现有 D3 依赖可完成完全定制的 stacked area、brush 和 axes，但需要自己承担 tooltip、keyboard、resize、hit testing 和无障碍；
- vis-timeline 适合独立的 exact-event inspector，而不是整页主图；
- Observable Plot 适合快速验证 Calendar / small multiples；
- Highcharts Stock 的 grouping 与 Navigator 很成熟，但需先评估许可、包体和设计系统适配。

## 6. 交互与无障碍契约

- legend、marker、cluster 和 range control 必须支持 keyboard focus；
- 颜色之外还要使用标签、顺序和数值；
- tooltip 信息必须能够通过 focus 获得；
- 选择主题或范围后，下面的文字摘要和 evidence list 同步变化；
- `Reduce motion` 下关闭面积 morph，只做即时更新；
- 任何 AI 方向判断都必须显示时间范围、归因规则和 evidence 链接。

## 7. Mock 与实现边界

当前 V2 Mock 用静态 SVG 表达推荐的 stream + navigator，并实现 Topic legend 的真实高亮联动。它用于 owner review，不代表 ECharts、数据聚合、range brush、virtualized event list 或真实 Activity projection 已经进入产品代码。
