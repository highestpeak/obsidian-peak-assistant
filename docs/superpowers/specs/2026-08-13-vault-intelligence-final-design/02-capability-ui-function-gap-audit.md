# Vault Intelligence 能力 / UI / 功能缺口审计

> 审计目标：把“源码里已有能力”“现有 UI 已可达”“V2 Mock 画出来的能力”“最终设计需要的能力”拆开。  
> 结论只代表当前仓库静态证据；未经过本轮真实 Obsidian 交互验收。
>
> Maintenance review 的目标合同见[《Scan maintenance review 共享规则》](../2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules)；审计“相邻能力待接”时，canonical identity、projection、owner correction、Apply / Verify 也属于必须补齐的功能，不是纯 UI 细节。

## 1. 状态定义

| 状态 | 含义 |
| --- | --- |
| 已具备 | 当前已有可调用能力和可达 UI；不等于已经符合最终设计 |
| 功能已有，UI 未接 | runtime / service 已存在，但最终 Vault Intelligence 没有合适入口或展示 |
| 相邻能力待接 | 另一个产品面或基础设施已有能力，需要 adapter / contract 后接入 |
| 仅 Mock | V2 HTML 表达了交互，但生产 runtime、持久化或页面没有实现 |
| UI 与功能都没有 | 最终设计需要，但没有正式 UI，也没有完整 domain capability |
| Future / no-op | 有研究、类型或空 detector 壳，但当前不能向用户声称可用 |

“功能已有”只表示底层能力存在，不表示它已经具备统一 Run、进度、失败恢复、权限、receipt 和最终 UI。

## 2. 当前生产真相

当前可达 Vault Intelligence 仍在 Quick Search 的 `VaultIntelligenceWorkspace.tsx` 中。它目前能够：

- 从本地索引构建 Vault digest；
- 展示 note、community、hub、orphan、bridge gap、stale hub 与活动摘要；
- 读取近期 Vault Review 记录；
- 打开 Top hub、部分 stale hub 文件；
- 触发 Quick check 与完整 AI Vault Review；
- 用手工 SVG 坐标展示一个简化 Community map。

它目前不是本设计所描述的 standalone View，也没有 Overview / Vault map / Work queue / Runs 四页闭环。

### 2.1 已存在的底层能力

| 能力 | 当前证据 | 重要边界 |
| --- | --- | --- |
| Vault digest / review | `VaultReviewRuntimeImpl`、Quick Search Workspace | 可复用事实；UI 与最终 IA 不同 |
| 19 个确定性 detector | `src/service/lint/signals/`、`VaultLintRun.ts` | 能产出 Finding / event trace；未统一进入新 Run UI |
| Vault Lint RunEnvelope | `runVaultLintManualScan` | 每次运行隔离；不等于完整 VI scan orchestration |
| Search / vector / Summary / AI Tags | `IndexService`、`runPendingLlmIndexEnrichment` | 当前是索引维护能力，未统一成 VI 结果模型 |
| AI Vault Review | `VaultReviewRuntimeImpl` | 能运行、保存、读取报告；旧结果形态需重构 |
| Community / Hub 数据 | `IndexService`、Community / Hub services | 可用作真实图基础，需统一 projection 与 evidence |
| 共享 Cytoscape Graph | `AtlasGraphCanvas`、Graph Workspace | 生产能力已存在；VI 不能再画静态 SVG |
| Proposal / Change Set 基础 | Composer、Frontmatter / permission / revision guard 等相邻能力 | 需形成 VI 专用 proposal contract 与闭环 |
| Chat / Project / Composer / AI Graph 状态 | 各 Owner surface 和 canonical storage | 需定义只读 aggregate port，不复制其编辑器 |

## 3. 页面与导航缺口

| 最终能力 | 当前 UI | 当前功能 | 状态 | 缺少什么 |
| --- | --- | --- | --- | --- |
| Standalone Vault Intelligence View | Quick Search 内 mode | digest / review 可用 | 相邻能力待接 | 新 View lifecycle、状态恢复、command、deep link |
| 四个顶层页面 | 无 | 无统一 page state | 仅 Mock | 生产 IA、routing、loading / empty / error state |
| 一个稳定 Command | 旧入口依赖 Search workspace | 打开旧 surface 的能力存在 | 相邻能力待接 | `Open Vault Intelligence`；遵守 command palette governance |
| 状态化单一主动作 | Quick check + Run review 两个按钮 | 两条分裂运行路径 | 仅 Mock | 主动作状态机与同一运行身份 |
| Header 内 last scan + changes ready | Mock 有 | 可取得部分时间与变化 | 相邻能力待接 | 统一 snapshot freshness / changed input contract |
| My Content 跳转 / 集成 | VI 无 | My Content 单独存在 | UI 与功能都没有 | Owner 决策、deep link、数量与筛选 contract |

## 4. Overview 与对象清单缺口

| 最终能力 | 可复用事实 | V2 Mock | 状态 | 缺少什么 |
| --- | --- | --- | --- | --- |
| Files / Chats / Projects / Composer 摘要 | 各 storage 有局部数据 | 有四个摘要 | 相邻能力待接 | 统一只读 inventory port、真实计数、freshness |
| 文件实际类型 Pie | File Atlas / loader 有类型信息 | 有 Pie 与 16 类示例 | 相邻能力待接 | 真实全 Vault 聚合、policy / capability 映射、键盘交互 |
| AI Graph / Peak Sheet 归 Files | Peak Sheet 已生产；AI Graph artifact 已有，但 `.peakaigraph` 文件型未来 | Mock 有 | 部分已有 | 统一 file-kind registry 与 inventory adapter |
| Chats Popover | Chat canonical storage | Mock 有 | 仅 Mock | pending / saved context 语义、Owner deep link |
| Projects Popover | Project storage | Mock 有 | 仅 Mock | blocked / decisions / updated 语义、Owner deep link |
| Composer Popover | Composer session / Change Set | Mock 有 | 仅 Mock | durable sessions、pending review 聚合与正确 CTA |
| Compact Continue work | 局部 owner states 存在 | Mock 有 7 / 24 | 仅 Mock | 统一 WorkItem store、排序、去重、owner labels |
| What changed | 文件/index/review 各有局部时间 | Mock 有 | UI 与功能都没有 | 统一 snapshot diff publisher |
| Priority work | finding / review 可局部排序 | Mock 有 | 仅 Mock | 跨来源优先级解释、稳定排序与 evidence |
| Search & machine knowledge 摘要 | index 有 readiness / pending | Mock 有 | 功能已有，UI 未接 | 分母 / eligibility / failure 原因聚合 |

## 5. Vault contents 与 Graph 缺口

| 最终能力 | 当前能力 | 状态 | 关键缺口 |
| --- | --- | --- | --- |
| 文件类型选择投影到知识图 | 类型清单与 Graph 分别存在 | UI 与功能都没有 | selected type → eligible files → community projection contract |
| Community / Topic / Hub / Bridge 真实图 | digest 有 Community / Hub；共享 Cytoscape 已有 | 相邻能力待接 | 统一 graph projection、typed relation、真实 bridge evidence |
| Constellation / Flow → / ↓ / Orbit | Graph Workspace 已生产 | 功能已有，UI 未接 | 在 VI manifest 中选择适用 presets 并保持共享控件一致 |
| Hover 高亮一跳 | AtlasGraphCanvas 有基础 interaction | 功能已有，UI 未接 | VI graph model 的 selection / dimming 样式与 evidence |
| Click Community 原图内展开 Topics / Hubs | current Mock 已表达，但当前生产 VI 没有 | 仅 Mock | progressive graph expansion、layout stability、Esc / pin 状态 |
| Selection 相关背景分级淡化 | Graph canvas 有选择机制 | 相邻能力待接 | focused / related / unrelated 三层样式和可读性测试 |
| 图下 Community summary | Community 数据存在 | Mock 有 | 相邻能力待接 | 同一 selection store、Topics / Hubs / bridge summary |
| 图下 AI insight | Review / explanation service 存在 | Mock 有 | 相邻能力待接 | selection-scoped prompt、citations、生成状态与缓存 |
| Pie / Graph / Summary 同步 | 无统一 contract | Mock 部分表达 | UI 与功能都没有 | 一个 source-of-truth selection state |
| 具体文件清单只在明确筛选后出现 | 文件 inventory 可查询 | Mock 有无动作大表 | 仅 Mock | action model、分页、open / retry / policy / scan actions |

### 5.1 旧 SVG Graph 的问题

当前 `VaultIntelligenceWorkspace.tsx` 的 map 是固定坐标 SVG。它不能满足：

- 复杂 Vault 的布局与避让；
- zoom / pan / minimap / shared toolbar；
- progressive expansion；
- selection 与 evidence；
- 真实 layout preset；
- 与 File Atlas、Search、Composer Graph 保持一致。

因此它只能作为 current surface 事实，不能继续扩展。

## 6. Activity 缺口

| 最终能力 | 当前事实 | V2 Mock | 状态 | 缺少什么 |
| --- | --- | --- | --- | --- |
| 跨 File / Chat / Project / Composer / AI Graph 的统一 ActivityRecord | 各处有独立事件或时间戳 | Heatmap 有示例 | UI 与功能都没有 | canonical schema、source id、owner deep link、retention |
| 一年 GitHub Heatmap | 无生产 VI UI | Mock 有 | 仅 Mock | 数据聚合、timezone、range、hover / click、虚拟列表 |
| 每日活动 List | 无统一列表 | Mock 有示例 | UI 与功能都没有 | 查询 API、分页、对象标题、动作、打开目标 |
| Date range picker | 无 | Mock 迭代过多种方案 | UI 与功能都没有 | 采用正式 picker / presets，不做自制 slider |
| AI event clustering | 无统一 runtime | Mock 有主题事件 | UI 与功能都没有 | explicit records → cluster、置信度、provenance、version |
| AI maintained themes | 无 | Mock 有 Topics / Focus | UI 与功能都没有 | theme catalog、归因规则、Not analyzed、Top N / Other |
| 历史主题补全 | 无 | Mock 暗示全部存在 | Future / no-op | backfill job、费用、范围、撤销 / 重新分析策略 |
| Current focus / direction change | 无可靠统一计算 | Mock 有百分比 | UI 与功能都没有 | 只基于已归因记录，禁止用 inactivity 推断 |

结论：Activity 是当前最终设计中缺口最大的一条产品线。Heatmap 可以先做真实事实层；AI 主题必须作为后续 enrichment，不能与首版绑死。

## 7. Work queue 与动作缺口

| 最终能力 | 当前事实 | 状态 | 缺少什么 |
| --- | --- | --- | --- |
| 统一 WorkItem canonical model | Project / Composer / Review 各有自己的状态 | UI 与功能都没有 | ID、source refs、owner、reason、evidence、status、exit、receipt |
| Finding 聚合为可执行任务 | Vault Review 能输出报告；lint 有 findings | 相邻能力待接 | deterministic grouping + optional AI clustering + stable fingerprint |
| 行内展开详情 | 无新 UI | 仅 Mock | expanded row component、deep-linkable selection、keyboard / focus |
| Action-specific detail | 各 Owner surface 有零散动作 | UI 与功能都没有 | action renderer registry，而不是一个通用真值 modal |
| Dismiss / expected / owner decision | review / lint 有部分 dismissal | 相邻能力待接 | 统一 decision receipt、scope、expiry、reopen rules |
| Snooze / waiting external state | 无统一能力 | UI 与功能都没有 | wake condition、scheduled reevaluation、owner |
| Work item 与 Run 双向关联 | review report 有运行记录 | UI 与功能都没有 | runId / finding ids / proposal ids / resolution receipt |
| 直接完成 Peak-owned task | Hub / profile 有局部 accept / curate 能力 | 相邻能力待接 | Work item action port 与 publish / verify |
| Open owner surface with context | 多产品已有 open 方法 | 相邻能力待接 | typed destination + context envelope + return receipt |
| Post-action closure verification | lint 可重新扫 | UI 与功能都没有 | Apply / handoff 后局部 recheck，自动关闭或重开 |

## 8. Scan 与 Runs 缺口

| 最终能力 | 当前能力 | V2 Mock | 状态 | 缺少什么 |
| --- | --- | --- | --- | --- |
| Runs-owned standalone Setup | 无 | 有 | 仅 Mock | route、initial / changed / resume 三种入口状态 |
| Scope compiler | lint 与 index 可各自接收范围 | 有三种 scope | UI 与功能都没有 | 文件 + dependency closure + Peak work records 的统一 frozen input |
| 四组 detector 选择 | detector registry 有组 | Mock 未完全实现 | 功能已有，UI 未接 | per-run config、All defaults、Advanced UI、receipt |
| Optional AI / enrichment 选择 | review 与 index enrichment 分裂存在 | 有 toggle | 相邻能力待接 | plan compiler、dependency、budget、provider availability |
| 六阶段统一 Run | lint、index、review 各自运行 | 有 active run | UI 与功能都没有 | app-owned orchestrator、stage contract、partial results |
| 真实连续进度 | lint events / index progress 局部存在 | 有详细 UI | 相邻能力待接 | unified event stream、processed / total 定义、ETA |
| 当前对象与对象步骤 | index 有文档级处理；lint 多为批量 | 有 | UI 与功能都没有 | object work graph、per-object events、skip / retry |
| Pause / Resume | 无完整 durable checkpoint | Mock 有 | UI 与功能都没有 | checkpoint、idempotency、input freeze、resume guard |
| Stop + retained partial results | 局部 RunEnvelope 可记录 failure | Mock 有 | UI 与功能都没有 | stop semantics、publish partial、resume / discard |
| Live events | lint 有 event trace | Mock 有 | 功能已有，UI 未接 | merge index / review / provider events，降噪与持久化 |
| Background continuation | index 可后台运行部分任务 | Mock 文案宣称 | UI 与功能都没有 | worker ownership、app restart recovery、notification |
| Completed result publisher | review 报告和 index result 分裂 | 有完成页 | UI 与功能都没有 | 一个 outcome model 合并 facts / insight / action / machine updates |
| Run compare | review 历史可读 | Mock 有 Compare button | UI 与功能都没有 | comparable metrics、scope / policy difference、trend semantics |

### 8.1 Mock-only 控件

以下只能用于演示，生产实现前不得保留同名假动作：

- `Finish demo run`；
- 只改变按钮状态、不驱动 runtime 的 Pause / Resume；
- 只弹 Toast、不打开真实目标的 Inspect；
- 静态百分比、速度、成本与 ETA；
- 假 Completed run / mock state switcher。

## 9. Finding、AI 与 detectors 缺口

### 9.1 19 个确定性 detector

当前 registry 中有 19 个不需要 LLM 的 detector：

| Connections（6） | Content（6） | Tags（2） | Aging（5） |
| --- | --- | --- | --- |
| island cluster | empty | tag explosion | abandoned folder |
| fragile bridge | oversized | untagged | abandoned cluster |
| missing backlink | frontmatter missing |  | recent drift |
| soft orphan | naming violation |  | decaying bridge |
| hard orphan | duplicate |  | stale hub |
| broken link | stub |  |  |

它们的能力状态是“功能已存在但未进入最终 UI 与运行闭环”，不是“Vault Intelligence 已完成 19 项维护”。还缺：

- 每组适用范围与文件类型说明；
- Scan plan 选择与运行 receipt；
- Finding aggregation；
- evidence inspector；
- Work item / Proposal / Dismiss 路由；
- 局部 recheck 与 closure。

### 9.2 6 个 Semantic detector

以下 ID 当前是需要 LLM 的注册壳 / no-op，不能显示成“已检查且无问题”：

- Coverage gap；
- Low cohesion；
- Contradiction；
- Phantom node；
- Semantic isolation；
- Redundant hubs。

它们属于 `Future / no-op`。要进入产品至少需要：真实 analyzer、输入范围、模型 / 成本、evidence、评估集、误报处理、UI 结果与 run receipt。

### 9.3 AI Review

Vault Review runtime 当前可产生和保存 AI 报告，这是重要的现有能力。但最终产品仍缺：

- 将 AI 结论稳定关联到 Finding cluster；
- 对历史 run 做可解释比较；
- citation validation 状态；
- result card 内直接呈现 action；
- AI 已生成时不再出现 `Review AI explanation` 的重复动作；
- failure / partial / provider unavailable 状态；
- 工作项关闭后重新验证 AI 结论是否仍适用。

## 10. Search、Summary、AI Tags、Vectors 与文件类型缺口

| 能力 | 当前功能 | 当前 UI | 状态 | 缺口 |
| --- | --- | --- | --- | --- |
| Search-ready | 已有索引与 readiness | VI 最终 UI 无 | 功能已有，UI 未接 | eligibility 分母、按类型 / 路径 drill-down |
| Vectors | 已有 pending / rebuild | VI 最终 UI 无 | 功能已有，UI 未接 | 只在必要时计划、失败原因、成本 |
| Summary | 已有本地 machine knowledge enrichment | VI 最终 UI 无 | 功能已有，UI 未接 | missing / stale / policy / source hash 状态 |
| AI Tags | 已有本地 machine tags | VI 最终 UI 无 | 功能已有，UI 未接 | 与用户 tags 分开解释、source hash、eligible files |
| Frontmatter proposal | 相邻 writer / Composer 能力存在 | V2 Mock 有 | 相邻能力待接 | batch proposal、per-file diff、partial accept、verify |
| Office / media / structured file readiness | loader / file surfaces 有部分支持 | V2 Mock 画了 capability pills | 相邻能力待接 | 单一 file policy / capability registry，禁止硬编码 Mock |
| `.peaksheet` | 已生产 | VI 未接 | 相邻能力待接 | inventory、changed / review 状态、Owner deep link |
| `.peakaigraph` | 当前设计方向，不是确认生产文件类型 | Mock 有 | Future / no-op | 文件 schema、registry、loader、owner view、storage governance |

`Summary ready 2,918 / 3,240` 这类数字只有同时解释“为什么分母是 3,240、哪些被排除、哪些失败”才有意义。它们不能再被揉成一个 Maintenance coverage 总百分比。

## 11. Peak-owned generated knowledge 缺口

用户特别指出，维护结果不只包括文件修复，还包括 Peak 自己生成的知识：Community 名称、描述、recurring topics、Hub description、bridge explanation、Activity themes。

当前 Community / Hub / explanation 有相邻服务与数据，但缺少统一产品任务：

| 维护对象 | 最终动作 | 当前状态 | 缺口 |
| --- | --- | --- | --- |
| Community name / summary | Accept、Regenerate、Keep current | 相邻能力待接 | candidate/current diff、evidence、publish receipt |
| Recurring topics | Review topics、merge / hide / regenerate | UI 与功能都没有 | topic identity、membership evidence、version |
| Hub descriptions | Accept / regenerate stale descriptions | 相邻能力待接 | Hub owner surface、staleness、citation |
| Bridge explanation | Review / update generated explanation | UI 与功能都没有 | source change tracking、owner / exit condition |
| Activity themes | Analyze / regenerate period | UI 与功能都没有 | ActivityRecord、period scope、cost、provenance |

旧 Mock 的 `Review Community profiles` 页面让用户同时审阅三张巨大 Profile 卡，但没有清楚说明它们如何生成、为何变化、接受后影响什么。最终应把每个 changed candidate 作为 Completed result / Work item，展示 Current ↔ Candidate 差异和 cited member files；不需要再造一个脱离 Run 的大页面。

## 12. Proposal 与安全闭环缺口

| 最终要求 | 当前基础 | 状态 | 缺少什么 |
| --- | --- | --- | --- |
| 多文件 Proposal | Composer Change Set / revision guard 可借鉴 | 相邻能力待接 | VI proposal schema、source findings、owner |
| 逐文件 diff | 有相邻 UI | 相邻能力待接 | frontmatter / content 类型化 diff |
| Partial accept | Composer 有相关审阅概念 | 相邻能力待接 | batch selection 与重新计算 |
| Apply receipt | canonical receipts 基础存在 | 相邻能力待接 | VI result / work item linkage |
| Re-index / recheck | index / lint 可运行 | UI 与功能都没有 | apply 后局部验证与 closure |
| Conflict / source revision | revision guard 模式存在 | 相邻能力待接 | stale proposal UI、rebase / regenerate |

## 13. “UI 与功能都没有”汇总

这是本次最重要的空白清单。以下内容不是“换个 UI 就完成”，而是需要新的产品能力：

1. 跨 Files / Chats / Projects / Composer / AI Graph 的统一 ActivityRecord 与查询。
2. Activity 一年 Heatmap 的真实聚合、日期范围、每日活动列表。
3. AI event clustering、maintained themes、历史 `Not analyzed` 与 provenance。
4. 统一 WorkItem canonical model、lifecycle、owner、exit condition 与 receipt。
5. 跨来源 Finding → Work item 聚合与稳定 fingerprint。
6. 统一 Scan plan compiler：scope freeze、dependency closure、stage / option dependencies、预算。
7. 可 Pause / Resume / restart recovery 的 Vault Intelligence orchestrator。
8. Object-level active run events 与 current object work graph。
9. 统一 CompletedRunResult publisher。
10. Run compare 的 scope-aware / policy-aware 差异模型。
11. Overview `What changed` 的统一 snapshot diff。
12. 文件类型选择与 Community graph 的同一 selection / projection contract。
13. Pie、Graph、Community summary、Selection insight 的同步状态。
14. Work item action renderer 与 typed Owner destination envelope。
15. Work item / Proposal 处理后的局部 recheck 与自动 closure。
16. Recurring topic、Bridge explanation、Activity theme 的可审阅 generated knowledge contract。
17. My Content 与 Vault Intelligence 的产品边界和 deep link contract。
18. `.peakaigraph` 作为正式原生文件类型的完整实现。
19. 6 个 Semantic detector 的真实 analyzer、评估与结果体验。
20. 定时 / 后台增量 VI Scan、重启恢复与完成通知。

## 14. 仅 Mock、不能当作生产能力的部分

- Overview / Vault map / Work queue / Runs 新 IA；
- Files / Chats / Projects / Composer hover cards；
- 文件类型 Pie 驱动 Graph；
- Community 原图内展开；
- Activity Heatmap、日期范围、每日活动 List；
- AI theme timeline；
- Work queue 行内展开与通用 Action；
- Scan setup 独立页；
- Active run 的连续阶段、当前对象、Pause / Resume；
- Completed run 的统一结果页；
- Community profile review；
- frontmatter Proposal review；
- Compare runs；
- 所有 mock-only finish / toast / fake progress 行为。

## 15. 现状结论

Vault Intelligence 不是从零开始：digest、review、19 detectors、index enrichment、Community / Hub、shared Cytoscape、proposal / owner surfaces 都提供了重要基础。

但最终设计的主要难点不是“把旧卡片重新排版”，而是补上三条新的统一 contract：

1. **Run contract**：不同维护能力怎样形成一个真实、可追踪、可恢复的运行；
2. **Result / Work contract**：事实、AI 解释、动作、Proposal 和 closure 怎样保持在一起；
3. **Projection contract**：Files、Community graph、Activity 与 Owner surfaces 怎样共享选择、证据与 freshness。

在这三个 contract 完成前，V2 Mock 只能作为方向参考，不能称为产品已实现。

## 16. 本轮静态证据入口

- `src/ui/view/quick-search/VaultIntelligenceWorkspace.tsx`
- `src/service/copilot/vault/VaultReviewRuntimeImpl.ts`
- `src/service/lint/VaultLintRun.ts`
- `src/service/lint/signals/`
- `src/service/search/index/indexService.ts`
- `src/ui/component/graph/AtlasGraphCanvasImpl.tsx`
- `src/ui/component/graph-workspace/`
- `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html`

本轮没有通过真实 Obsidian CDP 验证这些现有入口的行为，因此所有真实交互结论仍为 `INTERACTION NOT VERIFIED`。
