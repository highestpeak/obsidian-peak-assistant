# Vault Intelligence：技术产物与交付边界

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) · [File Property review 合同](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#file-property-review-contract) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文供设计评审和实现准备使用。它集中保存输入、产物、持久化、当前能力、规划边界、Mock 验收和源码证据，不占用产品 Overview 的主阅读路径。

实现 maintenance review 时，canonical atom、stable identity、projection、scope action、suggestion revision、owner choice、final change set 与 verification receipt 都以共享规则为规范；UI projection 不得成为第二份可变真值。

## 1. 状态标签

| 标签 | 含义 |
|---|---|
| Current surface | 当前 Vault Intelligence 页面已经可以操作的能力 |
| Current source | 源码中已有，但尚未接入新 Vault Intelligence View 的能力 |
| Planned | 本次产品模型建议纳入，但尚未实现 |
| Future | 有价值，但不应阻塞当前主循环 |

这些标签只说明交付状态，不代表重要性排序。

## 2. 输入

- Vault inventory：path、type、mtime、size、content hash；
- 可读取的文本、结构或 multimodal context；
- Obsidian resolved / unresolved links；
- Search Index：chunks、vectors、tags、summary、node 和 edge；
- Community、PageRank、structural holes 与 Hub records；
- file policy、metadata policy 和 ignore scope；
- Chat、Project Plan、Composer、AI Graph、Peak Sheet、Review、Reminder 与 media job 的 durable record 或 read model；
- 历史 run、finding snapshot、dismissal、proposal 和 verification result。

## 3. 分析

- 变化检测和 freshness；
- Search 与 vector readiness；
- Community、Hub、Orphan、Gap、Bridge 和 broken reference；
- 19 个确定性 Vault Lint detector；
- Summary、AI Tags 和 vectors 的缺失或过期；
- Peak work 的 inventory 与 continuation-state normalization；
- Vault contents 与 Peak work 的 typed relations；
- AI Review 对 findings 的聚类、根因、趋势和优先级分析；
- 处理前后 delta 与 verification。

## 4. 本地可重建产物

- full-text index 与 chunks；
- vector embeddings；
- indexed Summary 与 AI Tags；
- node / edge、Community、Hub candidate 和 structural-hole projection；
- lint findings 与 finding snapshot；
- aggregated Work item projection；
- Vault object、typed relation 与 continuation projection；
- Overview、Vault map、Work queue、Runs 和 Vault contents detail 所读的统计 projection。

这些产物可以重建，不应自动写入用户文件。

## 5. 需要保留的运行记录

```text
run identity / type / scope / status
stage / processed / total / work-unit type
current item or batch / throughput / elapsed / ETA samples
lastEventAt / wait reason / retry attempt
checkpoint / pause-resume position
per-item result / warning / failure / skip
model / provider / token / cost
finding snapshot / AI Review result
proposal / accept-reject / apply receipt
source revision / before-after delta / verification
```

UI 订阅这些事件形成的 live projection。刷新 View 或重启后，必须从同一 run identity 恢复，不能依赖 React component 内部计时器制造不可恢复的进度。

## 6. 用户文件写入

只有明确接受的 proposal 才能写用户文件。Frontmatter、tag、link、Bridge note 或 materialized Hub 等写入必须：

1. 展示 candidate；
2. 展示 evidence；
3. 展示逐文件 diff；
4. 校验 source hash / revision；
5. 只 Apply 用户接受的部分；
6. 记录 receipt；
7. 重新索引受影响文件；
8. 回到 Vault Intelligence 验证。

## 7. Vault map 的最小对象契约

```text
objectType / objectId / title
ownerSurface / openTarget
inventoryState / updatedAt
continuationState / statusSource
nextAction / exitCondition
relations[]: relationType / targetType / targetId / evidenceSource
```

`continuationState` 只能来自已注册状态，不从标题、内容或 inactivity 猜测。`relations[]` 必须来自 durable reference、明确绑定或可解释 read model。各对象 canonical truth 仍由 owner surface 持有。

## 8. 当前能力

### 8.1 Current surface

- 当前页面能读取 Vault digest；
- digest 可显示 notes、words、Community、computed Hub、Orphan、dangling reference、structural hole、stale Hub、recent activity、tags 和最近 lint health；
- 页面能打开部分 Hub 文件和历史 Vault Review；
- 已保存 Vault Review 可以重开。

### 8.2 Current source

- Index pipeline 已有全文、vectors、Summary、AI Tags 和 maintenance 阶段；
- Index progress 已有 processed / total、elapsed 和 remaining estimate；
- LLM enrichment progress 已有 path、speed、ETA、token 和 cost estimate；
- 源码存在 19 个 non-LLM detector；
- Vault Review runtime 已能形成 clusters、gaps、actions 和 sources；
- Project Plan、Composer session、AI Graph、Review、RunEnvelope、Proposal 等已有明确状态；
- `.peaksheet` 已作为文件原生类型交付。

## 9. 尚未接入新 View

- 当前页面不能发起新的 Vault Lint scan；
- `runVaultLintManualScan` 在生产 UI 中没有调用者；
- per-file Summary、AI Tags 和 vector 状态没有进入 Vault Intelligence；
- Index、Lint、AI Review、Proposal 和 Verification 没有组成同一 Runs 模型；
- progress 信号尚未统一为可暂停、恢复和后台继续的 Active run projection；
- 19 个 detector 没有完整 finding queue 与详情流程；
- finding snapshot 尚未自动进入 AI Review；
- Metadata proposal 仍以单文件能力为主；
- 全文件类型 inventory 与 capability policy 尚未接入；
- Peak work 尚未作为 typed nodes 进入统一 Vault map；
- Work queue 尚未归一各 owner surface 的 continuation items。

## 10. Planned 与 Future

### 10.1 Planned

- 独立 Vault Intelligence View 和稳定打开命令；
- Overview、Vault map、Work queue、Runs；
- `Vault contents detail` 二级工作区；
- 单一 `Scan Vault` 主动作与完整 Active run；
- scan、Index、detectors、AI Review、enrichment 的依赖规划；
- 全文件类型 inventory 与定向处理；
- finding queue、AI insights 和 batch proposal review；
- typed Vault object / relation projection 与 owner handoff。

### 10.2 Future

- 六个 `M-*` semantic detector 的真实 LLM 执行；
- 自动定时全 Vault 扫描；
- `.peakaigraph` 文件类型的正式交付；
- 所有媒体和文件类型达到相同 enrichment 深度。

自动 Apply 用户文件变更不是 Future 目标，仍然属于明确禁止的安全边界。

## 11. Mock 验收

下一版 Mock 至少必须证明：

- 第一屏能看懂 Vault map、Search status、Continue work 和 What changed；
- Chat、Project、Composer、AI Graph 和 Peak Sheet 是 Vault map 对象，不是孤立统计卡；
- 点击主动作后先看到 Preflight，确认后自动进入 Active run；
- 运行中有真实 processed / total、阶段、当前 item、速度、ETA、warning 和 failure；
- 确定性 facts 完成后立即可查看；
- AI Review 展示证据读取、聚类、insight、根因、趋势和优先级；
- raw finding、AI inference 和 suggested action 始终分层；
- Work queue 能进入全部来源；
- 所有文件类型都有明确状态和不处理原因；
- 用户能区分本地可重建更新、proposal 和真正文件写入。

Mock 只能证明设计路径，不代表真实 Obsidian 交互已经验收。

## 12. 已确定与开放决定

### 12.1 已确定

- 使用独立 View，并注册一个稳定的 `Open Vault Intelligence` 命令；
- 顶层页面是 Overview、Vault map、Work queue 和 Runs；
- Peak work 属于 Vault map，不建立单独 Peak work tab；
- `Files & index` 不作为顶层页面；
- 不设计 Maintenance coverage 或综合 Health score；
- 运行开始后必须自动显示完整 Active run；
- 确定性 detector 和 AI Review 是同一主链路的事实层与理解层；
- AI 不得覆盖 raw finding；
- 未经 proposal review 不修改用户文件。

### 12.2 开放决定

- 主动作最终文案；
- 默认扫描范围；
- AI Review 默认触发、batch 和预算策略；
- computed Hub 与 Peak Hub 的 UI 区分；
- 第一批 metadata policy 和 proposal 类型；
- Overview 首批对象家族；
- `.peakaigraph` 交付前 AI Graph 节点的状态说明。

## 13. 主要源码证据

| 主题 | 证据 |
|---|---|
| 当前 Vault Intelligence 页面 | `src/ui/view/quick-search/VaultIntelligenceWorkspace.tsx` |
| Vault digest | `src/service/copilot/vault/VaultDigestService.ts`、`VaultDigestBuilder.ts` |
| Vault Review | `src/service/copilot/vault/VaultReviewRuntime.ts`、`VaultReviewReportService.ts` |
| Detector registry | `src/service/lint/runtime/InMemoryDetectorRegistry.ts` |
| Structural / content / tags / temporal | `src/service/lint/signals/` |
| Semantic no-op detectors | `src/service/lint/signals/semantic.ts` |
| Manual lint run | `src/service/lint/VaultLintRun.ts` |
| Index pipeline | `src/service/search/index/indexInitializer.ts` |
| Summary / AI Tags / vectors | `src/service/search/index/indexService.ts` |
| Index progress | `src/service/search/support/progress-tracker.ts`、`llm-enrichment-progress-tracker.ts` |
| Current progress UI | `src/app/ui-host/modals/IndexingProgressModal.tsx`、`src/ui/view/modals/IndexingProgressContent.tsx` |
| Composer status | `src/service/composer/historyActivity.ts`、`src/service/composer/intelligence/runSession.ts` |
| AI Graph status | `src/service/ai-graph/domain.ts` |
| RunEnvelope | `src/service/run-envelope/types.ts` |
| Generated artifact governance | `docs/conventions/generated-artifact-registry.md` |
| File capability model | `docs/superpowers/specs/2026-08-09-file-surface-ai-capability-model.md` |

## 14. 交付验证边界

设计完成不等于实现完成。需要分别报告：

- 文档和 Mock 的静态验证；
- focused tests 与 production build；
- 真正 Obsidian 中的 DOM / interaction evidence；
- owner review 与产品决定。

在真实 Obsidian 交互完成前，相关体验保持 `INTERACTION NOT VERIFIED`。
