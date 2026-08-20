# Vault Intelligence：Overview 与 Vault map 设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文定义 Overview、Vault map 和对象详情之间的关系。核心判断是：**Overview 是 Vault map 的摘要，不是另一套数据模型；Vault map 是整个 Vault 全局状态的完整去处。**

## 1. 三个页面各自回答什么

| 页面 | 用户问题 | 主要输出 |
|---|---|---|
| Overview | 整个 Vault 现在怎么样，最值得看什么？ | 全局摘要、主要知识区域、当前关注方向、少量待继续事项、活动运行 |
| Vault map | Vault 里有什么、这些内容如何组织？我的工作关注如何随时间移动？ | Vault contents 与 Activity 两个并列视图 |
| Object detail | 这个对象为什么重要，证据是什么，下一步去哪？ | 状态、关系、证据、历史和 owner surface 入口 |

Overview 与 Vault map 读取同一份可重建 projection。Overview 只压缩信息，不单独计算另一套“健康度”。

## 2. Vault map 使用哪些事实

Vault map 不把所有可计数对象都画成节点。它使用两类事实回答“文档如何组织”和“用户近期在关注什么”。

### 2.1 Vault contents

- 所有被发现的文件与文件类型；
- Folder、Community、Hub、Orphan、Gap、Bridge；
- resolved / unresolved link 与其他可解释关系；
- Search、结构分析和 enrichment 的状态覆盖层。

### 2.2 工作活动证据

- 被编辑、创建、移动或引用的文件；
- Chat 中显式选入的文件上下文与所属主题；
- Project 中有明确状态或范围的变动；
- Composer 已保存的编辑活动与 Change Set；
- AI Graph source revision 与 Peak Sheet 等文件活动；
- Run、Review 和 Proposal 对知识结构造成的可解释变化。

Chat、Project、Composer 不是与 Community 并列的知识节点。它们只是解释“用户最近围绕什么主题做了什么”的证据来源；对象详情仍交给 Chat Studio、Project Home、Composer、AI Graph 或 Peak Sheet 等 owner surface。

## 3. 什么才算需要继续

对象存在不等于任务未完成。`Continue work` 只能来自可追溯状态，例如：

- Project Plan 为 `planned`、`active` 或 `blocked`；
- Composer session 为 `pending-review`、`failed` 或 `stale`；
- AI Graph 有 changed source、failed run 或 needs review；
- Proposal 等待 review、apply 或 verify；
- Run 为 paused、failed 或需要恢复。

不能因为 Chat 很久没打开、文件标题像 TODO，或者对象创建后没有近期活动，就猜测它“未完成”。

## 4. Overview 第一屏

```text
┌──────────────────────────────────────────────────────────────┐
│ Vault Intelligence                     Last scan · Scan Vault│
├──────────────────────────────────────────────────────────────┤
│ 4,860 files · 128 chats · 12 projects · 8 AI graphs          │
├─────────────────────────────────┬────────────────────────────┤
│ Structure graph preview         │ Continue work              │
│ Community / Topic / Bridge      │ 状态 · 原因 · 下一步        │
├─────────────────────────────────┼────────────────────────────┤
│ Activity timeline preview       │ What changed               │
│ 主题强度 · 方向移动 · 关键事件    │ 对象、关系和状态变化         │
├─────────────────────────────────┼────────────────────────────┤
│ Search & machine knowledge      │ Priority work              │
│ Ready / Missing / Not used      │ 有证据的待处理项             │
├─────────────────────────────────┴────────────────────────────┤
│ Active run strip（仅在运行、暂停或失败待恢复时出现）            │
└──────────────────────────────────────────────────────────────┘
```

第一屏不展示综合 Health score，也不展示 Maintenance coverage。用户应直接看到具体对象、具体变化和具体待处理事项。

## 5. Vault map 页面

### 5.1 Vault map 不是一张万能关系图

Vault map 不把全部文件和工作对象塞入一张 force-directed graph，也不依靠没有定义的节点位置表达意义。一张同时混合文件、Community、Chat、Project、Composer、Hub、Orphan 和 Run 的通用图无法回答清楚的问题，只会制造“看起来像 Graph”的装饰性复杂度。

页面围绕两个连续问题组织：文档形成了什么结构，以及用户的工作如何在这个结构上移动。所有可点击切换都必须真实改变主视图、摘要、解释和证据；不允许只修改标签或显示无效筛选。

### 5.2 两个并列局部视图

| 局部视图 | 回答的问题 | 合适的表达 | 必须展示 |
|---|---|---|---|
| Vault contents | Vault 中有哪些实际文件类型，它们形成了哪些 Community 与 Topic，社区之间凭什么相连，Search / AI 能对它们做什么？ | 文件类型 Pie 作为选择器；`Community → Topic → File` 结构图；图下解释列表与 AI 解读 | 实际类型、数量/比例、Community 分布、Hub、Orphan、Bridge 证据、适用能力、排除或失败原因 |
| Activity | 用户在什么主题上做了什么，关注点如何随时间移动？ | 长周期密度概览、选定范围内的主题流图、聚合事件簇和证据列表 | 时间范围、主题构成、活动总量、方向变化、文件/Chat/Project/Composer 证据、推断边界 |

Structure 不再作为独立视图。文件类型、文件、Topic、Community、Hub、Orphan 与 Bridge 本来就是同一个 Vault contents 模型；拆开只会让用户在两个页面之间重复理解同一张图。顶层 Overview 只各取 Vault contents 和 Activity 的一个小预览用于定向。

### 5.3 图形语义与交互规则

- Vault contents 的结构图首先显示 Community 内部的 Topic，而不是只画几个大圆；
- 跨 Community 连接必须经过一个真实、可点击、可检查来源的 Bridge document；没有 Bridge document 就不画直接连接；
- 结构图下必须紧接一份与图一致的 Community / Topic 解释列表，以及引用具体 Bridge、Orphan、Hub 或 Activity 证据的 AI interpretation；这两部分共同解释图；
- 图中空间距离本身没有含义，布局只服务于阅读；
- warning 颜色只标记有 evidence 的异常，不表示普通对象类别；
- 切换视图后，右侧 summary、解释和入口必须同步更新；
- Object detail 返回后保留问题视图和用户位置；
- `Vault contents / Activity` 使用同一条固定、左对齐的局部导航；右侧只保留页面动作；
- Vault contents 中选择文件类型后，必须改变下方结构图、数量、关系说明、能力状态和 AI 解释，而不是只高亮一行列表。

### 5.4 Activity 的推断边界

- Activity 只使用本地、可解释的信号：文件修改、显式 Chat context、Project 状态变动、Composer 活动和文件型产物 revision；
- 同一事件按其影响的 Topic 归属，而不是按“来自哪个 Peak 功能”分栏；
- 不根据长时间未打开、停留时长或消息数量猜测用户效率；
- 不生成 productivity score，也不把一般文件变化自动包装成 insight；
- 只有能够解释关注点、方向或结构变化的 raw change 才进入 Activity。

### 5.5 Vault contents 与 Work queue 的边界

Orphan、Gap、stale bridge 等问题可以在 Vault contents 的结构图上作为注释出现，因为它们影响用户对内容结构的理解；但完整 finding、AI Review、处理动作、exit condition 和验证历史都属于 Work queue。`Needs attention` 不再作为 Map 内的独立视图。

Project blocked、Composer pending review、Proposal awaiting apply 等继续事项也属于 Work queue，而不是另一张“Peak work map”。Map 只在 Activity 中把相应动作作为主题证据。

### 5.6 结构对象的用户含义

| 对象 | 用户看到的解释 |
|---|---|
| Community | 彼此连接更紧密的一组内容，不等于文件夹 |
| Hub | 在局部或全局连接很多、经常作为入口的对象 |
| Peak Hub | 用户或 Peak 明确维护的 Hub，必须与 computed hub 区分 |
| Orphan | 完全没有连接或连接非常弱的内容 |
| Structural hole / Gap | 两组内容之间缺少有效连接的位置 |
| Bridge | 实际连接两个区域的对象或候选连接 |
| Broken reference | 指向不存在目标的引用 |
| Stale / dormant | 结构仍存在，但长期没有随内容变化而更新 |

每种结构对象都必须显示定义、阈值或证据来源，不能只显示一个抽象数量。

## 6. Object detail

对象详情至少显示：

- 对象类型、owner surface 和当前状态；
- 与文件、Project、source、run、proposal 或其他对象的关系；
- 关系来源和更新时间；
- 为什么出现在当前筛选或 Work queue；
- 可以执行的下一步；
- 返回 Vault map 后保留的筛选和位置。

Vault Intelligence 只负责全局理解和 handoff。对象正文编辑、Chat 消息、Composer 历史、AI Graph version 和 Peak Sheet 数据仍由各自工作面负责。

### 6.1 Composer handoff 的定位契约

Composer 的总量、Pie 和结果分布只是活动摘要。`7 个活动、1 个待审` 并不能告诉系统要打开哪个文件、Composer session 或 Change Set，因此汇总卡不得直接显示 `Open Composer`。

只有一条具体 continuation item 同时保留以下定位信息时，才可显示 `Open saved review`：

| 定位信息 | 作用 |
|---|---|
| `composerSessionId` | 恢复已存在的 Composer session，不创建新 session |
| `changeSetId` | 选中确切的待审 Change Set |
| 允许写入的文件范围 | 区分“作为上下文”与“可被修改”的文件 |
| 每个文件的冻结 source revision | 进入审阅前检测内容是否已漂移 |

用户点击后的路径是：`Vault Intelligence 具体待审项 → 恢复 composerSessionId → 选中 changeSetId → 验证文件 revision → 显示 Pending review`。如果 session 不存在、Change Set 无法恢复或 source revision 已过期，就留在 Vault Intelligence 显示恢复或冲突说明；不打开空白 Composer，也不根据“1 个待审”猜测目标。

之所以最终交给 Composer，不是因为 Vault Intelligence 看不到这条记录，而是因为真正的审阅需要文件级 diff、多文件切换、写入授权、revision conflict、accept / reject 和 History，这些属于 Composer 的编辑事务。用户只是查看“有什么待审”时留在 Vault Intelligence；只有决定审阅具体文件变更时才 handoff。

## 7. 页面状态

| 状态 | Overview | Vault map |
|---|---|---|
| 首次使用 | 说明尚未建立可用 projection，主动作显示 `Prepare Vault` | 显示将被发现的对象家族，不伪造数量 |
| 数据新鲜 | 显示上次成功扫描摘要 | 可浏览完整 map 和历史变化 |
| 数据过期 | 标记变更数量与时间，主动作显示 `Scan Vault` | 旧结果仍可读，但明确标注 freshness |
| 正在运行 | 显示 persistent run strip | 保留浏览，并允许返回 Active run |
| 部分失败 | 显示 facts 可用与失败范围 | 只对受影响区域标记 partial / stale |

## 8. 本文不定义什么

- Activity 的图形选择、大数据聚合与组件建议见[《Activity 时间可视化调研与设计》](./2026-08-12-vault-intelligence-activity-visualization-research.md)；
- Scan Vault 的阶段、速度和恢复规则见[《Scan Vault 与 Runs 设计》](./2026-08-12-vault-intelligence-scan-and-runs-design.md)；
- 完整队列和 detector 见[《Work queue 与 Findings 设计》](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md)；
- 当前实现与 typed projection 最小契约见[《技术产物与交付边界》](./2026-08-12-vault-intelligence-technical-and-delivery-reference.md)。
