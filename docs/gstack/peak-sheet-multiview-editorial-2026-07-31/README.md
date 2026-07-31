# Peak Sheet · Editorial 完整工作台 V2

这是完整多视图 Mock 的**独立视觉重写稿**：

- V1 完整稿继续保留在
  [`../peak-sheet-multiview-2026-07-30/index.html`](../peak-sheet-multiview-2026-07-30/index.html)；
- 简单表格视觉基准继续保留在
  [`../peak-sheet-table-baseline-2026-07-31/index.html`](../peak-sheet-table-baseline-2026-07-31/index.html)；
- V2 在独立目录中复制交互 fixture，并通过本目录 `mock.css` 引入 V1
  基础样式后覆盖为 Editorial 视觉系统。V1 文件没有被修改。

## V2 设计方向

简单基准稿获得确认后，V2 将同一套规则带回完整工作台：

- 主记录 14.5px，普通字段 13.5px，辅助信息 12px；
- 默认数据行 42px；
- Stage Tag 24px 高、12px 字号、无边框；
- 普通单元格只保留 1px 横线，不再形成纵向笼子；
- 表头使用 2px 权威横线，字段类型图标默认隐藏；
- 数字、日期、金额和公式元数据使用等宽字体；
- 匹配度以明确数字为主体，不再常驻环形图；
- 进度条和等待条退到 2px 辅助线；
- 工作模式、普通优先级和空值使用文本，不强制套 Tag；
- 选区和活动单元格只使用 1.5px 紫色焦点；
- 工具栏、View、公式栏和筛选栏保留完整能力，但统一为轻量纸面层级。
- 文档头、视图栏、工具栏、公式栏和筛选栏收敛到
  `52 / 38 / 38 / 32 / 28px` 的连续节奏，并只使用单线分隔；
- 字段表头与列内容共享阅读轴：文本左对齐、数值右对齐、复选框居中。

## Motion 与编辑

- 交互反馈统一使用 `120 / 180 / 260ms`，不使用弹跳、漂浮或大幅位移；
- 视图切换使用 4px 淡入，浮层和对话框使用小幅位移与透明度过渡；
- 明暗主题、Hover、活动选区、提交反馈和进度值共享同一套 easing；
- `prefers-reduced-motion: reduce` 会把动画与过渡降到近乎即时；
- 普通单元格支持双击、`Enter` 或 `F2` 进入编辑；
- `Enter` 提交，`Tab / Shift+Tab` 提交并移动，`Esc` 取消；
- 文本、日期、数字、单选、复选框和链接使用匹配字段类型的编辑器；
- 公式与附件列保持只读，并在公式栏说明字段所有权；
- 编辑过程实时镜像到公式栏，提交后重新计算选区统计。

## 保留的完整交互

- 17 个字段与 A–Q 列标；
- 字段类型配置；
- 基础公式库；
- 数字格式和条件格式；
- 单元格选区统计；
- 单行截断、全文查看器和三行自动换行；
- Table、Board、Calendar、Gallery、Dashboard；
- AI ComputePlan、来源边界和移动预览；
- Paper / Graphite 主题切换。

## 范围

- 设计 Mock，不是 production Dataset runtime。
- V2 的交互 fixture 是 V1 的独立快照；基础 CSS 通过显式 `@import`
  复用，Editorial override 只存在于本目录。
- 没有修改 roadmap 或现有产品代码。
- Relation、Lookup、Rollup、实时同步、自动化和写回继续不在本稿承诺中。

## 验证

```bash
node docs/gstack/peak-sheet-multiview-editorial-2026-07-31/validate.mjs
```

验证继承完整 V1 流程，并额外检查：

- 默认 Paper 主题；
- 42px 数据行；
- 14.5 / 13.5 / 12px 字体层级；
- 24px 无边框 Stage Tag；
- 普通纵向格线为 0；
- 表头结构线为 2px；
- 字段表头与首行内容按列语义对齐；
- Header 五层共享纸面背景且不使用竖向分隔笼；
- 单一 1.5px 活动焦点；
- 表格无斜纹和斑马纹。
- 类型化单元格编辑、提交、取消、键盘移动和公式只读；
- Motion token、视图切换以及 reduced-motion 降级。
