# Peak Sheet / Peak Dataset / Peak Compute 产品与架构评估

**Status:** 调研完成，建议进入 roadmap 的“调研候选”；尚未接受为实施项目  
**Date:** 2026-07-22  
**Updated:** 2026-07-30 · 多视图工作流、View adapter 与移动消费模式需求调整
**读者:** Peak Assistant owner、产品规划者和后续 spec / 原型负责人  
**关联:** [Roadmap · 调研候选](../../roadmap.html#researching) · [多视图交互 Mock](../../gstack/peak-sheet-multiview-2026-07-30/index.html) · [Composer Block AI Contract](../../superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md) · [Peak Share / Portal 调研](../2026-07-22-obsidian-one-click-sharing/README.md)

## 结论先行

这个方向值得进入 roadmap，而且与 Peak Assistant 的长期定位高度一致。最有价值的不是“在 Obsidian 里再做一个小 Excel”，而是把 Peak 已有的 Vault 理解、自然语言操作、可审阅写回和运行记录组合成一种新能力：

> 用户把笔记或表格交给 Peak，描述想要的结果；Peak 生成一个可解释、可审阅、可重复运行的数据处理计划，并把结果继续留在 Vault 中。

新增的“多维表格能力”提案补出了上一版缺失的结构化数据层。完整能力应分成四层，但对用户仍只有一个入口：

1. **Peak Sheet**：用户直接操作的表格、图表和 AI 指令界面。
2. **Peak Dataset**：稳定记录、字段 Schema、数据源适配、视图定义，以及后续的 Relation / Lookup / Rollup。
3. **Peak Compute Engine**：计算计划、执行、安全、依赖和刷新底座。
4. **Peak Portal Data Apps**：在线发布、身份、权限、评论、表单和同步产品。

这四层不是四个用户产品，也不能整包作为 MVP。否则会同时制造第二套表格编辑器、数据库、脚本 runtime、权限系统、任务记录和发布系统。建议保留愿景，但先只验证一个渐进式闭环：

> 选中当前 Markdown 表格 → 先作为自由 Sheet 计算 → 用户主动转换为结构化 Dataset → 生成稳定 ID、基础 Schema 和 Table view → 预览并接受 → 保存为可手动刷新的数据工具。

第一版不加入 Relation、Kanban、Calendar、Python、Portal、定时刷新、任意网络请求或任意 AI 生成 JavaScript。先证明“自由数据可以渐进变成长期维护的 Dataset”，并且“保存 Schema / recipe + 刷新”真的比一次性 Chat 输出更有价值。

2026-07-30 的代码复核确认，Composer 已具备可写回的 `TableModel`、CSV 导入导出、表格选择与操作，以及独立的 table → chart 生成能力。这降低了首个交互原型的成本，但没有改变核心缺口：当前仍不存在 Dataset runtime、稳定 record ID、versioned schema、view registry、ComputePlan 或 refresh contract。

## Roadmap 判断

| 维度 | 判断 | 原因 |
| --- | --- | --- |
| 产品匹配 | 高 | 把 Chat / Composer 的理解能力变成可持续使用的本地工具，而不是一次性回答 |
| 差异化 | 高 | 自然语言、Vault 上下文、可重复计算、可审阅写回和本地文件边界组合在一起，比单一表格组件更难复制 |
| 现有复用度 | 中 | RunEnvelope、PermissionGuard、Artifact receipt、Composer 表格合同、CSV loader 和 Bases 生成能复用；Dataset model / store / views 本身尚不存在 |
| 工程风险 | 高 | 真正缺少的是 Dataset 真值、稳定 ID、计算计划、隔离执行、依赖追踪和可恢复写回；这些都是底座，不是几个 UI 按钮 |
| 范围风险 | 很高 | 新提案横跨表格、数据库、多视图、BI、脚本平台、自动化和 Portal，容易演变成另一个产品宇宙 |
| 商业潜力 | 中高但未验证 | Portal 数据应用与模板可能收费，但本地 Sheet 本身是否足以形成独立付费理由仍需用户验证 |

**建议状态：** `research candidate`，战略价值高，但不是紧接当前 Composer / runtime 主线之后就可直接实施的完整大波。先完成 Dataset + Compute spike 和渐进式转换交互验证，再决定是否升到“已决策待建”。

## 2026-07-30 需求调整：从“表格功能”转向“同一数据，多种工作视图”

### 外部产品信号

一条 2026-07-30 抓取的[小红书产品预告](https://www.xiaohongshu.com/explore/6a6b235f00000000280315ea)把多维表、画廊、看板、日历、地图、3D 地球和数据仪表盘放进 Obsidian，并用旅行、项目、内容排期、客户、收藏和资产管理解释用途。作者还明确提出，移动端更适合查看数据与报表，不适合高密度录入。

这条材料没有媒体资源、产品名、数据模型或可操作版本；抓取时只有 12 赞、7 收藏和 2 条期待型评论。它只能作为产品表达与工作流方向的信号，不能作为需求规模、实现质量或技术路线的证明。

### 吸收后的产品判断

Peak Sheet 的用户价值应表达为：

> 同一份本地 Dataset，可以按当前任务切换成表格、图表或其他视图；AI 帮用户生成可审阅、可重复运行的数据处理计划，而不是替每个视图维护一份数据副本。

这次调整吸收三个方向：

- **工作流先于功能清单。** 用求职追踪、内容排期和旅行计划等完整任务验证价值，不按“已有多少字段和视图”验收。
- **View adapter 成为早期合同。** 第一版只交付 Table 与只读 Chart，但底层合同要能容纳后续 Gallery、Calendar、Board、Map 和第三方视图。
- **移动端按消费模式设计。** 移动端先支持查看、筛选、刷新和审批；完整 grid 录入不是首版门槛。

### 调整后的产品需求

| 需求 | 首个可验证版本 | 边界 |
| --- | --- | --- |
| 一个 Dataset，多种投影 | Table 可编辑；Chart 只读且与 Table 使用同一 revision | View 不复制或拥有 records |
| 工作流入口 | 用求职追踪 fixture 完成导入、建模、筛选、计算和刷新 | 模板不是独立数据格式 |
| 可审阅 AI 计算 | 自然语言生成 ComputePlan；先展示步骤、受影响记录和输出 | 不执行任意 AI 脚本 |
| View 能力声明 | 每种 View 声明 read / edit / group / spatial 等能力 | 不让 View 静默获得写权限 |
| 渐进式多视图 | Gallery / Calendar / Board / Map 只进入 adapter 原型或概念验证 | 不把七种视图塞入 MVP |
| 移动消费模式 | 查看、筛选、手动刷新、接受或拒绝待审阅结果 | 不承诺复杂录入与批量编辑 |
| 本地真值 | records、schema、recipe 与最后结果均可由用户读取和导出 | SQLite 仍是可重建投影 |

### Mock 的屏幕与状态范围

[多视图交互 Mock](../../gstack/peak-sheet-multiview-2026-07-30/index.html) 使用“求职追踪”作为真实 fixture，展示以下状态：

1. Dataset workspace：来源、记录数、revision、刷新状态和主要动作同屏可见。
2. Table / Chart：首个交付闭环中的可编辑主视图与只读派生视图。
3. Board / Gallery / Calendar / Map：验证同一 Dataset 的 View adapter 方向，并明确标为后续阶段。
4. Ask Peak：自然语言请求先进入 plan preview，再由用户接受写回。
5. Mobile consumption：只展示查看、筛选、刷新和审批，不伪装完整编辑能力。

Mock 是设计探索，不代表这些视图已经实现，也不把 Peak Sheet 从 `research candidate` 升为已决策项目。

## 对新增多维表格提案的判断

### 应直接吸收的部分

- **自由 Sheet 与结构化 Dataset 并存。** 临时计算不应被迫建模，长期维护的数据才升级为稳定 Schema。
- **渐进式结构化。** AI 可以建议转换、推断字段和生成默认视图，但转换必须由用户确认。
- **一个用户入口。** 对外只叫 Peak Sheet；Dataset 与 Compute Engine 是内部能力层。
- **稳定 Record ID 从第一版开始。** Relation 可以后做，但如果先用行号、文件名或显示值充当身份，后续关系、历史和 Portal 都会发生破坏性迁移。
- **视图只是投影。** Table、Kanban、Calendar、Chart 不能各自保存一份数据。
- **Bases 是 note-backed adapter。** Peak 不替代 Obsidian 对“每行一篇笔记”的原生数据模型。
- **Relation 延后且默认不级联删除。** 这是正确的风险边界。

### 仍需收紧的部分

提案中的“MVP”仍同时包含七类数据源、四类视图、十余字段类型、批量编辑、AI 建模、清洗、导入导出和写回。它已经接近一套多维表格产品，而不是可验证的首版。

首版应继续删除：

- Kanban 与 Calendar native view；
- JSON、指定文件夹、Base 当前结果等多来源同时接入；
- 多选、文件、图片、电话、邮箱等低优先级字段；
- 自动创建“最适合的多个视图”；
- Relation / Lookup / Rollup；
- AI 字段、按钮字段、Form / Dashboard；
- 任意 JavaScript / Python；
- Portal 评论、表单与双向同步。

这些能力可以保留在长期愿景，但不能成为判断第一版是否成功的条件。

## 为什么它适合 Peak Assistant

### 1. 它把“理解 Vault”变成可执行结果

普通数据助手通常从一次上传开始，也在一次回答后结束。Peak 的优势是已经处于用户的笔记上下文中，能知道当前文档、选区、Vault 搜索结果和已有产物。Compute 可以把这些上下文转成一个长期存在的计算计划，而不是重复上传、重复解释。

### 2. 它补上 Chat 与文档之间的中间层

当前 Chat 可以生成 Dataview、Excalidraw、draw.io、Extract 和 Reminder 等结构化产物；Composer 合同也已经定义表格的 cell / row / column / formula 级 review。Peak Sheet 可以成为两者之间的“可运行文档对象”：既能从对话创建，也能在文档里直接修改和刷新。

### 3. 本地优先不是口号，而是产品结构

原始 Markdown、CSV 和 frontmatter 继续属于用户；计算规则是可迁移的用户配置；运行记录是机器记录；输出是可导出的衍生产物。只要这四类真值分开，用户停用插件后仍能读取原始数据和最后一次结果。

### 4. 它能自然连接 Peak Portal，但不依赖 Portal 才成立

本地计算块可以以后发布成只读表格、图表或表单，但发布是单独的安全边界和商业验证。Compute 先在本地证明价值；Portal 再复用其 schema、输出和刷新结果。不要为了远期发布需求污染第一个本地 MVP。

## 当前代码事实：已经有什么，还缺什么

| 能力 | 当前事实 | 对 Peak Sheet 的意义 |
| --- | --- | --- |
| Peak Dataset runtime | 代码中只有 Chat artifact 的 `dataset` kind / table 映射；没有 production Dataset schema、record store、view registry 或 relation engine | 多维表格不是已有能力的 UI 包装，需要独立底座 spike |
| 表格编辑与 AI review | Composer 已有 typed [`TableModel`](../../../src/service/composer/packs/table/tableModel.ts)、cell range selection、merge / sort / transpose、CSV 导入导出、Markdown / HTML serialization，以及 transaction writeback；AI table patch 也已接入 capability pack | 可直接复用首个 Table projection 的解析、选择和写回底座，但它仍是文档块模型，不是 Dataset runtime |
| 结构化产物 | [`artifact_create`](../../../src/core/schemas/tools/artifactCreate.ts) 目前支持 Dataview、Excalidraw、draw.io、Extract、Reminder；producer 已有 validate → Vault write → receipt 闭环 | 可扩展为 compute recipe / table result，但现在没有 table 或 compute 类型 |
| 运行生命周期 | [`RunEnvelope`](../../../src/service/run-envelope/types.ts) 已有 run status、progress、artifact、error、log，且支持 manual / scheduled / agent trigger | 可作为 Compute run 的统一运行记录，但尚无数据依赖、资源预算或 refresh contract |
| 权限 | [`PermissionGuard`](../../../src/service/agents/harness/permission/PermissionGuard.ts) 支持 read / edit / destructive 分类、deny-first 和 ask | 可复用确认机制，但对脚本执行仍太粗；缺文件 allowlist、网络域名、CPU / memory / time / row limit 等能力级限制 |
| CSV / XLSX | [`TableDocumentLoader`](../../../src/core/document/loader/TableDocumentLoader.ts) 能读取 CSV 供索引；XLSX 分支当前明确返回“不支持” | CSV 可作为首批来源；XLSX 不能列入已具备能力 |
| Obsidian Bases | Chat 已能生成 `.base` YAML 并 Save & Open；官方 Bases 也支持对 note properties 查看、编辑、排序、筛选、分组、公式和 CSV 导出 | 对“每行是一篇笔记”的数据，应优先扩展 Bases；它不等同于任意 CSV / Markdown table 的计算引擎 |
| 图表 | Composer 已有 table → [`ChartSpec`](../../../src/service/composer/packs/chart/chartModel.ts)、bar / line / pie 渲染和独立 fenced chart writeback；chart 与源表当前不会互相刷新 | 可复用 Chart projection 的 spec 与 renderer，但仍需 dataset revision、refresh 和 derived-view ownership 合同 |
| Portal | [Peak Share / Portal](../2026-07-22-obsidian-one-click-sharing/README.md) 已作为独立调研候选，身份、审计、同步和安全仍待验证 | Compute 只提供可发布输出；不要在同一 MVP 内重做 Portal |

补充官方边界：

- [Obsidian Bases](https://obsidian.md/help/bases) 的数据仍存放在本地 Markdown 文件及其 properties 中，适合 note-as-row 的本地数据库视图。
- [Bases views](https://obsidian.md/help/bases/views) 已提供 table / list / cards、筛选、排序、分组、搜索和 CSV 导出；Peak 不应重复实现这些原生能力。
- Obsidian 允许插件通过 [`registerBasesView`](https://docs.obsidian.md/plugins/guides/bases-view) 增加自定义视图，因此 Peak 可以把 Chart 或其他展示作为 Bases adapter，而不是 fork 一套 note-properties 数据库。

## Peak Dataset 的建议边界

### 自由 Sheet 与结构化 Dataset

| 形态 | 身份与 Schema | 适用任务 | 持久化要求 |
| --- | --- | --- | --- |
| 自由 Sheet | 可推断但不强制；行不承诺长期身份 | 临时计算、清洗、粘贴分析、一次性图表 | 原始 Markdown / CSV + 可选临时 ComputePlan |
| 结构化 Dataset | 稳定 record ID + versioned schema | 求职、项目、客户、阅读、研究、库存等长期系统 | 用户拥有的 Dataset definition + 开放 record store |

转换不是静默类型升级。Peak 必须预览：

- 将创建哪些字段和 ID；
- 哪些值无法转换；
- 哪些重复记录需要处理；
- 原始表格会保留、替换还是只作为导入源；
- 后续由哪个文件或目录拥有数据真值。

### 两种 source-of-truth 模式

| 模式 | Canonical data | Peak 负责 | 不应做 |
| --- | --- | --- | --- |
| Note-backed Dataset | Markdown 文件 + frontmatter；一条记录对应一篇笔记 | Dataset adapter、AI 建模、ComputePlan、图表和跨数据集分析 | 复制一份 records JSON 与笔记双向同步 |
| File-backed Dataset | 一个公开、可导出的 record format + Dataset definition；一条记录不必成为笔记 | Grid 编辑、Schema、稳定 ID、计算和导出 | 把 SQLite 当用户唯一数据源 |

导入的 CSV / JSON 在用户确认前只是 source snapshot。Portal 只是发布投影；run history 使用机器记录；SQLite 只做可重建索引和查询投影。它们都不能反向成为 Dataset 的隐藏真值。

### 最小内部合同

```ts
// illustrative — 不是已接受接口
interface DatasetDefinition {
  id: string;
  name: string;
  mode: 'note-backed' | 'file-backed';
  source: DatasetSource;
  schema: DatasetSchema;
  views: DatasetViewDefinition[];
  computations: ComputePlanRef[];
}

interface DatasetRecord {
  id: string;
  revision: string;
  values: Record<string, DatasetValue>;
  sourceRef?: string;
}
```

`views` 保存 projection 定义，不保存复制数据；`computations` 引用可重放的 ComputePlan，不保存 AI 每次临时生成的脚本；每次执行结果进入 RunReceipt，而不是覆盖 Dataset definition。

## 必须先纠正的六个架构假设

### 1. “支持多种存储方式”不能变成多套真值

JSON、JSONL、SQLite 和“Peak 自有格式”不能都作为同等 canonical store 留给实现阶段自由选择。Spike 必须先选定一个开放的 file-backed format，并定义 schema migration、原子写入、冲突和恢复。SQLite 继续是 rebuildable index，不应成为用户无法脱离插件读取的唯一数据源。

### 2. AI 生成的 JavaScript 不能成为真值

自然语言首先应编译为受限、可验证的 `ComputePlan`，例如：

```ts
// illustrative — 不是已接受接口
type ComputeStep =
  | { op: 'filter'; expression: Predicate }
  | { op: 'sort'; by: string; direction: 'asc' | 'desc' }
  | { op: 'derive'; field: string; expression: ScalarExpression }
  | { op: 'group'; by: string[] }
  | { op: 'aggregate'; metrics: AggregateMetric[] }
  | { op: 'dedupe'; keys: string[] }
  | { op: 'cast'; field: string; to: DataType };
```

这个中间表示可以做 schema 校验、解释、diff、测试、版本化和重放。AI 生成脚本只能是后续 escape hatch，不能替代产品的数据操作合同。

### 3. “Obsidian 运行在 Electron”不等于“生成的 JS 可以安全执行”

Compute 代码不能和插件主进程共享 `window`、DOM、Node、Obsidian API 或任意网络能力。真正的 sandbox 至少需要：

- 独立 Worker / isolate；
- 结构化克隆后的 dataset 输入输出；
- 默认无文件、网络和宿主 API；
- 明确的 capability ports 和逐项授权；
- 超时、内存、输出大小与取消；
- 运行前计划预览和运行后写回 diff。

在威胁模型和隔离 PoC 通过前，不应把“任意 JavaScript”写进 MVP 承诺。

### 4. 先定义数据合同，再选表格组件

至少要区分以下对象：

```text
DataSource      原始 Markdown / CSV / frontmatter / pasted grid
Dataset         规范化后的 rows + schema + source revision
ComputePlan     用户意图编译出的受限、版本化操作序列
ComputeOutput   table / chart / summary / patch
RefreshPolicy   manual（首版）及后续触发方式
RunReceipt      本次输入版本、步骤、结果、错误、耗时和产物引用
```

如果没有这层合同，Markdown table、Bases、CSV、Dataview 和 Portal 会各自长出一套字段、刷新和写回语义。

### 5. Bases 与任意表格是两种数据模型

Bases 的一行天然对应一篇文件，适合项目、阅读记录、客户、任务等 note-as-row 数据。Markdown table / CSV 的一行只是普通 record，适合支出、测量值、导入数据和临时分析。推荐通过 adapter 统一进入 Dataset，不强迫其中一种伪装成另一种：

```text
note properties ──> Bases adapter ──┐
Markdown table ──> table adapter ───┼─> Dataset -> ComputePlan -> Output
CSV / clipboard ─> grid adapter ────┘
```

### 6. 计算规则、运行记录和结果不能混成一个文件

推荐在后续 spec 中明确：

- 原始数据仍由 Markdown / CSV / frontmatter 拥有；
- Compute recipe 是用户拥有、可迁移、可版本化的声明式配置；
- 每次 run 是 machine record，遵循已接受的 JSONL 方向；
- SQLite 只做可重建索引和查询投影；
- 结果是衍生产物，覆盖写回必须经过 preview / accept / undo。

## 建议的第一条产品闭环

### 用户任务

用户在当前文档选中一张 Markdown 表格，输入：

> 增加总价列，按月份汇总，并画一张趋势图。

### 系统行为

1. 锁定当前 table source range 和 source revision。
2. 解析字段类型，并展示不确定字段。
3. AI 生成受限 `ComputePlan`，不是任意脚本。
4. 本地 deterministic engine 执行并校验输出 schema。
5. 在真实表格位置显示 cell / row / column 级 preview；图表作为相邻衍生对象预览。
6. 用户接受后写回 Markdown，并保存可手动刷新的 recipe。
7. 后续刷新直接执行已保存 plan；source schema 漂移时停止并请求修复，不静默重写规则。

### 第一条验证闭环包含

- 当前 Markdown 表格一种输入；
- 自由 Sheet 与“转换为 Dataset”两个明确状态；
- 转换预览、稳定 record ID 和 versioned basic schema；
- text、number、date、boolean、single-select、note-link、computed 七类字段；
- 一个开放的 file-backed record format；
- Table view 一个编辑投影；
- Chart view 一个只读投影，与 Table 使用同一 Dataset revision；
- filter、sort、derive、group、aggregate、dedupe、cast、日期与文本标准化；
- Markdown / CSV 导出；
- schema / step preview、显式接受、撤销、手动刷新；
- RunEnvelope 运行状态、receipt、错误与可重试失败；
- 纯 TypeScript deterministic engine。

### 第一条验证闭环不包含

- CSV / JSON live source、指定文件夹和 Base 当前结果；
- Kanban、Calendar、Gallery、Board、Map、3D globe、Form 或 Dashboard builder；
- Relation、Lookup、Rollup 和跨 Dataset query；
- 多选、文件、图片、电话、邮箱、AI 或按钮字段；
- 自动推荐并创建多套视图；
- 自由布局的 Chart builder；首版只提供从 Dataset 字段生成的受限 Chart projection；
- 任意 AI 生成 JavaScript；
- Python、Pyodide、本地 Python bridge 或云端计算；
- XLSX 高保真编辑；
- API / 数据库 / Google Sheets / Notion connector；
- 定时、打开文件时或数据变化自动刷新；
- Portal 发布、评论、表单或双向同步；
- 完整移动端录入；首版只验证移动消费模式。

## 分阶段建议

### Phase 0 · Dataset + Compute Engine spike

在没有新 UI 的纯 TypeScript 模块中完成：

- `DatasetDefinition` / `Record` / `Schema` / `ComputePlan` / `ComputeOutput` 草案；
- note-backed / file-backed 两种 source-of-truth 模式；
- file-backed format 的可读性、原子写入、冲突恢复和 migration 比较；
- 至少覆盖支出汇总、求职回复率、跨记录去重这三类真实 fixture；
- deterministic executor、输出校验、错误定位和 plan serialization；
- 大小数据集基准，用实测决定行数、内存和执行时间上限；
- stable record ID、schema revision 与 source revision；
- Bases adapter 与独立 grid 的职责验证。

**升阶条件：** 同一 plan 在数据变化后可重复执行；错误能定位到 step；结果不依赖再次调用 LLM。

### Phase 1 · Composer 中的自由 Sheet 闭环

- 只接当前 Markdown table；
- 自然语言生成 plan；
- cell / row / column anchored preview；
- accept / undo；
- 保存 recipe + manual refresh；
- RunEnvelope + Artifact receipt 贯通。

这一步复用已经落地的 Composer Table / Chart 解析、选择、渲染与 transaction writeback，不新建第二套 review UI。Chart 在这一阶段仍是相邻衍生块，不冒充 live Dataset view。

### Phase 2 · 结构化 Dataset 基础

- Markdown table → Dataset 的显式转换；
- stable record ID + basic schema + validation；
- file-backed store + View adapter contract；
- 同一 Dataset revision 上的 editable Table + read-only Chart；
- schema drift、记录冲突和恢复；
- 导出 Markdown / CSV。

### Phase 3 · Bases adapter 与派生输出

- note-backed Dataset / Bases adapter；
- CSV / clipboard import；
- chart output contract；
- 从 Gallery / Calendar / Board / Map 中选择一个真实工作流需要的 projection PoC；
- 移动消费模式：查看、筛选、手动刷新和审批；
- 不在这一阶段引入 Relation。

### Phase 4 · Relation 与多视图

- Relation / reverse relation；
- Lookup / Rollup / Count；
- 删除、合并、移动和 ID 冲突语义；
- 只在真实 workflow 证明需要时增加 Gallery / Calendar / Board / Map native view；
- 3D globe 只作为可插拔 spatial adapter 实验，不进入核心 view 清单。

### Phase 5 · 受控脚本 escape hatch

只有在内置 plan 无法覆盖真实高价值任务时再启动。进入前必须单独完成 threat model、isolate PoC、资源限制、权限预览、审计和失败恢复 spec。Python 仍不自动进入这一阶段。

### Phase 6 · Portal data app

复用已验证的 ComputeOutput / schema 发布静态快照或手动同步版本。身份、评论、表单、双向回写和计费继续由 Peak Share / Portal 产品线拥有。

## 升到“已决策待建”前的门槛

1. Owner 用真实数据完成自由 Sheet → Dataset 转换，并确认稳定 ID / Schema 带来持续维护价值。
2. 明确 note-backed 与 file-backed Dataset 的 source-of-truth、recipe、run record 和 output artifact 边界。
3. file-backed format 通过可读性、原子写入、冲突恢复和 schema migration spike。
4. ComputePlan spike 证明基础任务不需要任意代码执行。
5. Composer table preview / accept / undo 的交互原型通过审阅。
6. Table 与 Chart 能从同一 Dataset revision 重建，刷新不会产生两份数据真值。
7. Table-only Dataset 已有价值；Gallery / Calendar / Board / Map 不再是首版成立条件。
8. Bases custom view 与独立 grid 的职责有明确结论。
9. 移动消费模式原型证明查看和审批有独立价值，不依赖完整录入。
10. 若仍要开放脚本，sandbox threat model 和隔离 PoC 先通过。
11. Portal 保持独立 scope，不作为本地 MVP 的完成条件。

## Stop conditions

出现以下任一情况，应暂停扩张并重新评估：

- 用户真正要的是完整 Excel 兼容，而不是自然语言驱动的轻量数据工具；
- 主要场景都能由 Obsidian Bases + AI 生成配置完成，自建 grid 没有足够增量价值；
- file-backed Dataset 需要专有、不可独立读取的格式才能工作；
- 自由 Sheet 转换后无法清楚解释数据真值、ID、Schema 和原始表格的关系；
- ComputePlan 覆盖率不足，产品很快退化成“默认执行任意 AI 代码”；
- 隔离环境无法证明不访问宿主、Vault 或网络；
- 每种数据源都需要特殊 UI 和特殊运行语义，无法收敛为共享 Dataset 合同；
- Portal 需求反向绑架本地优先的数据与 recipe 设计。

## 命名建议

新增提案把命名边界补完整了：

- **Peak Sheet**：唯一的用户功能名，包含自由 Sheet 与结构化 Dataset 两种状态。
- **Peak Dataset**：内部结构化数据层，承载 record、schema、source adapter 和 view definition。
- **Peak Compute Engine**：内部执行层，承载数据计划、执行、校验和运行记录。

不新增 Peak Base、Peak Database 或 Peak Records 等平行用户入口。也不把用户入口叫 Peak Compute；它对普通用户过于抽象。

## 最终判断

**做，但先做窄。**

Peak Sheet 有资格成为 Peak Assistant 在 Chat、Composer、Vault Intelligence 之后的一条重要产品线，因为它让“理解”真正变成“可重复使用的工具”。它也有资格连接 Peak Portal，形成本地数据到外部交付的闭环。

真正需要保护的不是功能清单，而是五条边界：

1. 用户只理解 Peak Sheet，Dataset / Compute 是内部层；
2. Dataset 有唯一、可迁移的 source of truth；
3. `ComputePlan` 优先于任意脚本；
4. 预览和接受优先于直接写回，本地 Dataset 先于 Portal；
5. 共享 RunEnvelope / Permission / Artifact / Composer contracts，不建立第二套系统。

下一份正式产物应是 **Peak Dataset + Compute Engine 技术 spike spec**。交互基线采用 [多视图交互 Mock](../../gstack/peak-sheet-multiview-2026-07-30/index.html)，但实现仍从自由 Sheet → Dataset → Table + Chart 的窄闭环开始，不把当前完整愿景直接翻译成实施任务。
