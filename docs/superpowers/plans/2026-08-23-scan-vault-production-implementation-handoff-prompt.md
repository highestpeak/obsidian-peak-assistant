# Scan Vault 完整生产实现任务 Prompt

> 用法：把本文件从“任务开始”到“任务结束”的内容完整复制到新的 Codex session。  
> 性质：已批准设计的生产实现，不是重新做产品设计，不是 Mock-only 任务。  
> 基线文档提交：`206c9d87`（只用于定位设计文档；开始实现前必须重新检查当前 HEAD 和工作树）。

---

## 任务开始

你现在要在 Peak Assistant 主工作目录中，完整实现 Vault Intelligence 的 Scan Vault 生产流程。

工作目录：

```text
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant
```

这不是设计讨论，也不是再做一个 HTML Mock。产品 UI、运行语义、Agent Harness、进度、持久化和写入边界已经确定。你的任务是先审计当前代码与工作树，然后把批准合同一比一落到生产代码、测试和真实 Obsidian 验收中。

除非发现会改变产品结果或造成数据安全风险的真实矛盾，否则不要停下来向 owner 提很多小问题。先做只读 preflight，建立当前事实和实施矩阵，然后在同一个 session 内直接开始实现所有安全、可确定的 required tracks。

### 1. 必须先读

按以下顺序完整阅读，不要只看摘要：

1. `AGENTS.md`
2. `docs/progress.md`
3. `docs/superpowers/specs/2026-08-23-scan-vault-frontend-backend-runtime-atlas.md`
4. `docs/superpowers/specs/2026-08-23-scan-vault-end-to-end-runtime-design.md`
5. `docs/superpowers/specs/2026-08-23-vault-wide-discovery-harness-design.md`
6. `docs/superpowers/specs/2026-08-23-vault-scan-review-preparation-design.md`
7. `docs/superpowers/plans/2026-08-23-scan-vault-production-implementation-scope.md`
8. `docs/conventions/generated-artifact-registry.md`
9. `docs/conventions/obsidian-real-ui-qa.md`

视觉与交互合同：

```text
docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html
docs/gstack/vault-scan-build-index-flow-2026-08-23/index.html
docs/gstack/vault-scan-vault-wide-discovery-2026-08-23/index.html
docs/gstack/vault-scan-review-preparation-2026-08-23/index.html
docs/gstack/vault-scan-runtime-atlas-2026-08-23/index.html
```

证据优先级：已批准 runtime/spec → 聚焦 Mock 的 render/interaction 合同 → 当前生产代码事实。当前临时实现不能反向删掉目标合同中的阶段或能力。

### 2. 首先锁定工作树，不要覆盖别人的修改

开始时执行并记录：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git diff --stat
git diff -- src/app/vault-intelligence/VaultIntelligenceRuntime.ts \
  src/core/types/vault-intelligence.ts \
  src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx \
  templates/config/vault-intelligence.json
```

当前主工作树可能已经包含 owner 或其他 session 的未提交代码，尤其可能覆盖 Vault Intelligence、Index、provider、model routing 和 tests。必须逐文件判断这些修改是可复用实现、并行工作还是无关变更。

禁止：

- `git reset --hard`、`git checkout --` 或任何清除现有修改的操作；
- 广泛 `git add -A`；
- 把已有修改当成自己完成的工作提交；
- 因为工作树不干净就悄悄切到旧版本实现；
- 为绕开重叠而创建第二套 runtime。

若目标文件存在无法安全分离的并行修改，先完成所有不冲突 tracks，并在真正无法继续时用精确文件和 diff 说明阻塞。

### 3. 产品心智不能改

用户流程固定为：

```text
Scan setup
→ Discover
→ Build Index
→ Vault-wide discovery
→ Prepare review
→ Publish
→ Completed / Work queue
→ owner choice
→ Proposal
→ Apply
→ Re-index
→ Verify
```

Setup 有三步：

1. 选择 scope；
2. 选择 scan tasks 和本次 Index outputs；
3. 为每种 AI operation 审核 model route policy。

Run progress 有五个用户可理解阶段：

1. `discover`
2. `index`
3. `ai` / Vault-wide discovery
4. `prepare-review`
5. `publish`

UI 的五阶段是用户心智，不代表后端五个同步函数。后端必须是一张有依赖、并行、回压、checkpoint 和完成门的 DAG。

Scan 从开始到 Completed **不得修改用户文件**。用户文件只有在 Completed 后显式 owner choice → Proposal → Apply 中才允许改变，并且必须经过 revision guard、re-index 和 Verify。

### 4. Impact Contract

#### Primary metric

生产路径中以下旧结构必须降为零：

- `VaultScanStageId` 缺失 `prepare-review`；
- `operationExecutionGroup()` 把 Vault-wide operations 合并为 shared execution；
- `performPublish()` 现场 derive maintenance tasks；
- `runMobiusGlobalMaintenance()` 到 Publish 才运行；
- React、fake timer 或混合 operation count 计算业务进度；
- 成功 AI/Index receipt 在 pause/restart 后重复执行；
- Approved Mock 依赖独立 demo state，而不是 production projector。

#### Required tracks

以下九个 track 全部必做，skip budget 为 0：

1. Parent ScanRun aggregate、event store、checkpoint、reducer、projector；
2. Discover 冻结 scope/revisions/routes/DAG/ProgressPlan；
3. Build Index 三 lane、route-aware scheduler、backpressure、receipts；
4. deterministic evidence assembly；
5. VaultDiscoveryController + Agent Harness + tools + findings + completion gate；
6. ReviewPreparationController + ReviewPreparationAgent + artifacts + validator/revision；
7. deterministic Publish + Completed handoff；
8. Approved Mock 一比一 production UI port；
9. pause/resume/stop/retry/stale/replay/rebuild、tests、build、真实 Obsidian QA。

任何 required track 未完成，最终只能称为 `partial progress`，不能称为完整实现。

#### Forbidden scope

- 不重做已批准 UI；
- 不修改 Scan 外 Chat、Composer、Search、Graph 的产品 IA；
- 不自动写 Markdown/frontmatter/link；
- 不新增 service-owned singleton 或 service → app/ui 反向依赖；
- 不新增第二套 Agent Harness、permission、trace 或 persistence runtime；
- 不在 Run progress 增加 model picker；
- 不用 token 数、reasoning 字数、finding 数或 Agent 自报驱动百分比；
- 不把 Relationships、Communities、Hubs、Bridges 设计成四个固定 Agents；
- 不把 task kinds 设计成十一套 Prepare review Agents；
- 不在 Publish 调模型或生成新 task；
- 不删除 legacy data；迁移只能 copy/import/read adapter；
- 不以“先做 MVP”为理由省略 Prepare review、stream/work 因果、stage inspection 或 durable recovery。

### 5. 开始实现前的只读 preflight

先扫描而不是猜测。至少检查：

```text
src/core/types/vault-intelligence.ts
src/app/vault-intelligence/VaultIntelligenceRuntime.ts
src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx
src/ui/view/vault-intelligence/VaultIntelligenceModel.ts
src/ui/view/vault-intelligence/VaultIntelligenceDefaults.ts
templates/config/vault-intelligence.json
src/service/search/index/indexService.ts
src/core/ports/IndexMaintenancePort.ts
src/service/copilot/vault/VaultReviewRuntime.ts
src/service/copilot/vault/VaultReviewSession.ts
src/service/agents/core/
src/core/storage/generated-output/
src/app/context/AppContext.ts
main.ts
test/vault-intelligence-*.test.ts
test/index-maintenance-port.test.ts
```

输出一个简短 preflight matrix：

| Track | 当前可复用资产 | 当前错误/缺口 | 预计修改文件 | 验证 |
|---|---|---|---|---|

这份 matrix 是实施前检查，不是第二轮产品设计。若当前代码已经实现某项，必须用源码和测试证明，然后跳过重复实现；若只是 Mock、类型占位或 timer，不算实现。

本 handoff 明确允许在 preflight 后立即开始实现，不需要再等待 owner 审核一次相同设计。

### 6. 内部执行 DAG

按以下依赖执行，可以在合同稳定后并行独立 tracks，但最终必须合到一条生产路径：

```text
T0 Characterize current path
  ↓
T1 Core schemas + event/artifact stores + reducer/projector
  ├─→ T2 Discover + FrozenScanPlan + ProgressPlan
  ├─→ T3 Build Index three lanes
  └─→ T8 Recovery foundations

T2 + T3
  ↓
T4 Evidence assembly + Vault-wide discovery Agent
  ↓
T5 Prepare review Agent + artifact validation
  ↓
T6 Atomic Publish + Completed

T2/T3/T4/T5/T6 projections
  ↓
T7 Production UI exact port
  ↓
T8 Recovery/observability closure
  ↓
T9 Tests + migration + real Obsidian QA + legacy retirement
```

At most one canonical writer per domain session。Provider callbacks、workers 和 Agent tools 只能返回 typed events/proposals，不能直接改 canonical session。

### 7. Track 1 — Core state、store、projector

建立独立 Scan domain types，不要继续把所有 internals 堆进 `vault-intelligence.ts`。

至少需要：

```text
FrozenScanPlan
FrozenScopeManifest
WorkGraphManifest
ProgressPlan
ScanRunState / ScanRunStatus
BuildIndexSession
VaultDiscoverySession
ReviewPreparationSession
VaultScanDomainEvent
WorkUnitReceipt / AttemptReceipt
ReviewWorkArtifact
ReviewPreparationPackage
CompletedPackage
VaultScanRunProjection
```

实现：

- `scanRunId`、`snapshotId`、`stageSessionId`、`investigationId`、`attemptId`、`executionId`、`artifactId`、`workKey` 的正确身份边界；
- per-run monotonic event sequence 和 idempotency key；
- event-first → snapshot/pointer → UI projection；
- immutable large artifacts + small active pointer/checkpoint；
- legacy persisted version 1–4 幂等迁移；
- SQLite projection 可删除重建，不重跑模型；
- React 只消费 projector，不计算业务进度。

持久 writer 必须先更新 generated artifact registry。不得用 SQLite 作为 AI findings/review artifacts 的唯一事实源。

### 8. Track 2 — Discover

Discover 是确定性 controller，不是自由 Agent。必须完成四个 durable gates：

1. `scope-frozen`
2. `evidence-snapshot-pinned`
3. `execution-plan-resolved`
4. `work-graph-published`

输出 FrozenScanPlan、scope/source revisions、route pools、DAG、budget、ProgressPlan 和首个 checkpoint。

`plan-scan` 模型只能给建议。它失败时，只要确定性 plan 可构建，Scan 继续并写 warning；模型不得拥有 FrozenScanPlan 或 stage completion。

Setup 的 route policy 可以包含本地和多个远端候选、fallback、max concurrency、local max concurrency 和 retry。Run 中只能使用已冻结候选，每次 receipt 记录 planned/actual route。

### 9. Track 3 — Build Index

实现三个独立、持久、逐文件 lane：

#### Full-text search

- 本地读取、解析、切块、关键词/passages、FTS；
- 完成一个文件立即发布 `document.search-ready`；
- 显示文件/字节吞吐；
- read/parse failure 也有 terminal receipt。

#### Embeddings

- 订阅 search-ready；
- route-aware batch pool；
- local 默认串行，remote 有界 sliding window；
- actual model route 按文件记录；
- already-current identity 幂等。

#### AI enrichment

- 订阅 search-ready；
- 为单文件生成启用的 summary、AI tags、entities、file signals；
- 同 route 可合并请求，不同 route/files 可并行；
- 它不是 Vault-wide reasoning，不决定 Community。

work unit identity 至少包含：

```text
snapshotId + normalizedPath + sourceRevision
+ layerId + routeFingerprint + schemaVersion
```

Build Index progress：

```text
terminal enabled document-layer passes
/
frozen enabled document-layer passes
```

146 文件 × 3 层的测试分母必须是 438。失败、skipped、unavailable 都必须有明确 terminal disposition；它们产生 attention，但不会撤销已完成 Search ready。

### 10. Track 4 — Evidence assembly 与 Vault-wide Discovery Agent

先把以下系统 facts 组装成 versioned EvidenceManifest：

- content-health/lint findings；
- broken-reference facts；
- explicit link/tag/folder facts；
- Index failures/unavailable receipts；
- graph revision、centrality、cluster candidates、path facts；
- historical finding/Community/workKey；
- source revision refs。

把 `runMobiusGlobalMaintenance()` 从 Publish 前移到 Evidence assembly。Vault-wide Agent 必须分析已经更新并冻结的 graph snapshot。

Evidence floor 达标后才能启动 Agent。默认至少要求全文终态、graph snapshot 固定、强依赖 ready 或明确 unavailable。

#### Discovery 运行方式

这是第一个用户可理解的 Agent session。一个 session 包含 0..N bounded attempts：

```text
controller 选择 frontier item
→ Agent 用 typed tools 调查
→ Agent 提出 finding/transition
→ controller 校验证据、版本、schema、confidence
→ create/revise/merge/reject
→ reprioritize frontier
→ 下一轮
```

Relationship、Community、Hub、Bridge 是 finding kinds，不是执行顺序。必须覆盖反复顺序，例如：

```text
relationship → community → relationship → bridge
→ counter-evidence → hub → relationship revision
```

#### 必须提供的工具

```text
discovery_get_state
discovery_inspect_evidence
discovery_search_evidence
discovery_expand_graph
discovery_rank_relationships
discovery_compare_community_boundary
discovery_measure_node_roles
discovery_trace_bridge_paths
discovery_open_investigation
discovery_update_investigation
discovery_propose_finding
discovery_propose_finding_transition
discovery_request_completion_check
```

所有工具必须有 typed schema、scope/revision/limit、permission、trace 和 idempotency。不得提供任意 Vault write、shell 或直接 complete stage 工具。

#### Completion gate

Agent 只能请求 completion。Controller 检查：

- eligible evidence accounted；
- enabled objectives 完成 required probes；
- high-priority frontier 为空；
- retained findings 有 citations/source revision/validation；
- configured convergence window 内无高价值新增；
- 无运行中 tool/attempt；
- budget 已结算，blockers 有明确 disposition。

finding 数、token 数、文本长度和 tool count 都不直接加进度。

### 11. Track 5 — Prepare review Agent

这是第二个用户可理解的 Agent session，不能再混入 Publish。

必须等：

- selected Build Index layers terminal；
- Vault-wide Discovery completion receipt；
- deterministic findings/Index failures/stale conditions 可冻结。

运行管线固定为：

```text
Normalize atoms
→ Provisional work graph
→ Conflict-aware job partition
→ ReviewPreparationAgent jobs
→ Artifact validation and revision
→ Freeze stable workKey/task plan/package
```

一个 Scan 使用一个统一 ReviewPreparationAgent session、0..N bounded jobs。不要按 task kind 创建十一套 Agents。

普通 reviewable work 必须有 Agent-produced `ReviewWorkArtifact`。Deterministic-only 项目必须有 explicit skipped-terminal receipt，不能悄悄绕过 Agent credits。

#### 必须提供的工具

```text
review_get_state
review_inspect_finding_bundle
review_compare_existing_work
review_search_evidence
review_propose_task_group
review_propose_task_transition
review_draft_artifact
review_request_publish_check
review_submit_validated_artifact
```

每个 ReviewWorkArtifact 至少包含：

- stable identity/canonical anchors；
- owner-facing title 与 explanation；
- evidence citations + source revisions；
- owner question/options 或 review action；
- write boundary；
- impact/risk；
- verification kind 与 exit condition；
- producing route/attempt/usage refs；
- validator receipt。

Validator 必须确定性检查 schema、citation、identity、boundary、atom accounting 和 exit condition。失败返回 structured feedback，Agent 修订；只有 validator 通过并由 Controller commit 后，对应 UI work row 才能前进。

UI 必须体现真实因果：Prepare review 的 session stream job 未完成/未验证时，上方 Review work 行不得提前显示 Ready。

`Ready for review` 在 Completed 中表示 validated ReviewWorkArtifact 已存在，不表示 source diff 已存在。具体 Proposal 仍在 owner choice 后生成。

### 12. Track 6 — Publish 与 Completed

Publish 只接受已冻结：

- Build Index summary/receipts；
- Discovery artifacts/summary；
- ReviewPreparationPackage；
- usage、planned/actual routes、warnings、blockers。

提交顺序固定：

```text
stage immutable Completed body
→ append run.publish-prepared
→ atomic current pointer update
→ append run.completed
→ read-back checksum/count/workKey/artifact reachability
```

Publish 禁止：

- 调模型；
- 调 Vault-wide review；
- 运行 graph maintenance；
- 调 `deriveVaultMaintenanceTasks()`；
- 现场补齐缺失 review artifact。

失败进入 `recoverable`，重试同一 package。不得重新跑 Discovery/Prepare review 或重复收费。

Completed 页面只读取 published snapshot，不在 render 时派生 tasks。

### 13. Track 7 — Progress 与 ETA

Discover 冻结 versioned ProgressPlan。默认全局 credits：

```text
Discover 15
Build Index 40
Vault-wide discovery 33
Prepare review 10
Publish 2
```

配置必须进入 `templates/config/`，代码只可有明确镜像 fallback，不得散落 magic numbers。

阶段进度：

- Discover：四个 durable gates；
- Build Index：terminal document-layer units；
- Discovery：evidence boundary、objective sweep、coverage、candidate dispositions、convergence、completion receipt；
- Prepare review：Normalize 20、Provisional plan 15、Agent preparation 30、Artifact validation 25、Package freeze 10；
- Publish：atomic pointer + read-back。

Overall percent 只由 durable receipts 计算、单调不倒退。Agent 未知总量通过 earned gates 和 denominator freeze 解决，不预测 finding 总数。

ETA 与 percent 分离：全文用 files/bytes EMA；Embedding 用 route chunks/sec、batch wait、queue；enrichment 用 route docs/min；Discovery 用 investigation duration/frontier pressure；Prepare review 用 job/revision distribution；全局取 DAG critical path。

### 14. Track 8 — Pause、Resume、Stop、stale 与 recovery

Safe checkpoints：

- Full-text document receipt；
- Embedding/enrichment provider receipt；
- Agent tool result/attempt；
- finding commit；
- Review job/artifact commit；
- Publish pointer 更新之前。

Pause：停止派发新 work，状态 `pausing → paused`，保存 queue/frontier/budget/sequence/percent。

Resume：验证 FrozenScanPlan fingerprint 和 source revisions；复用成功 receipts；无 terminal receipt 的调用创建新 attempt。

Stop：产生 `stopped-partial`，保留成功 Index/机器事实，但不自动生成正常 Completed tasks。

Source revision 变化必须 fail closed 或进入 recovery；不得悄悄换 snapshot。

SQLite 删除后必须能从 canonical events/artifacts 重建 projection，不重新调用模型。

### 15. Track 9 — Production UI exact port

UI 不是重新设计。必须以批准 Mock 为 reference implementation，对齐：

- render tree；
- state/data contract；
- interaction；
- host CSS 与 icon；
- error/empty/paused/completed states。

必须保留：

- 顶部一个 overall progress；
- 当前 stage 的长标题、elapsed/remaining、usage、Pause/Resume/Stop；
- `View 5 stages` 的 hover/focus surface；
- hover 每个 stage 看 tooltip；
- 点击 stage 只切 inspection，不改变真实执行；
- Build Index 自己的 progress 和三 lane；
- 三个一致的竖向 Current files 列表；
- 每个 Embedding/AI enrichment 文件显示实际 model route；
- Discovery 的 discoveries projection + session streaming；
- Prepare review stream 与 Review work 的真实依赖；
- Completed task list/detail；
- 无自动滚动追踪、无闪烁、无大量二级小字、无 decorative uppercase。

使用 Lucide React icons 和项目 shadcn `Button`。遵守 Obsidian button geometry rule，并为新增固定尺寸 primitive 添加 reset-defense test。

删除 production path 上的 fake timer、random progress、mock-only state adapter 和双数据源。

### 16. Scan 后写入链必须保留

不要把 Proposal 提前到 Scan。Completed 后：

```text
owner choice
→ prepareProposal(taskId)
→ deterministic exact patch 或独立 Proposal capability
→ revision-guarded before/after diff
→ accept/reject
→ Apply selected changes
→ write receipt
→ re-index affected files
→ fresh detector/verifier
→ verified
```

Apply 前重新检查 source SHA-256/revision。Stale 或 ambiguous match 必须 fail closed。只写用户接受的 changes。

### 17. 实施切片与提交纪律

建议提交切片：

1. characterization tests；
2. schema/store/reducer/projector；
3. Discover/ProgressPlan；
4. Build Index lanes；
5. Evidence assembly/Discovery；
6. Prepare review；
7. Publish/Completed；
8. UI exact port；
9. recovery/migration/legacy retirement；
10. closure tests/QA note。

每个 slice：

- test-first 或 test-near；
- focused tests 通过再提交；
- commit message 用英文；
- 只 `git add` 该 slice 自有文件；
- 不提交其他 session 或 owner 的无关修改；
- 若无法安全分离，停止该 slice 并报告 overlap，不混提。

不要为了“容易回滚”长期保留双 runtime。允许一个 app-owned、默认关闭、短期 migration switch；新 runtime 成为唯一 writer 且验证后必须删除 legacy writer/switch。

### 18. 测试矩阵

至少覆盖：

- empty、small、146-file、large Vault；
- entire、changed、selected scope；
- Search only、Search + Embedding、三层全开；
- local serial、remote、mixed route pool；
- provider retry/fallback/rate limit/lost receipt；
- mid-index pause、mid-tool pause、mid-review pause、app restart；
- stale source、unreadable file、partial Index；
- zero findings、frontier expansion、budget exhausted、completed-with-attention；
- zero review jobs、ambiguous merge/split、conflict graph、validation revision、needs recovery；
- publish failure at each atomic boundary；
- version 1–4 state migration；
- SQLite projection deletion/rebuild；
- duplicate/replayed events；
- Scan 前后用户文件 byte hashes 完全一致。

必须证明的关键断言：

- 146 × 3 = 438；
- Full-text ready 后 Search 可用，慢层仍可继续；
- Relationship/Community/Bridge/Hubs 不是固定顺序；
- reasoning 大量输出但无 validated finding 时 discoveries 不增加；
- Prepare review job 未验证时 work row 不 Ready；
- Publish retry 不重复 AI、不重复 workKey；
- Resume 不重复成功 receipt；
- Stop 不自动生成正常 Completed tasks。

Closure 至少运行：

```bash
npm run test
npm run build
```

全量测试若存在基线失败，必须区分本任务新增失败与已有失败，给出精确 test 名和证据，不能笼统说“测试基本通过”。

### 19. 真实 Obsidian 验收

按 `docs/conventions/obsidian-real-ui-qa.md`：

1. 查找真实 Obsidian CDP port；
2. 连接 `app://obsidian.md/index.html`；
3. production build 后 plugin-only reload；
4. 打开 Vault Intelligence；
5. 使用真实 fixture 启动 Scan；
6. 验证 Setup 三步和 route selection；
7. 验证顶部 stage hover/focus/click inspection；
8. 验证 Build Index 三 lane、实际文件/model route；
9. 验证 Discovery stream 与 validated discoveries；
10. 验证 Prepare review stream/work row 因果；
11. 验证 Pause → checkpoint → Resume；
12. 验证 Completed handoff 与用户文件未变化；
13. 用 Computer Use 留一张人类可见的真实宿主最终证据。

若 CDP 不可用，保持具体交互 `INTERACTION NOT VERIFIED`。HTML Mock、source tests、build 或 harness 截图都不能替代真实 Obsidian 验收。

### 20. Legacy retirement gate

实现完成后用 repo search 证明生产入口中以下内容为零：

```text
旧四阶段 Scan reducer/type path
operationExecutionGroup shared Vault-wide branch
performPublish-time task derivation
Publish-time graph maintenance
React/fake timer progress
mock-state production adapter
长期 dual runtime/writer
```

Legacy readers 可以只为持久化迁移保留，但必须命名和注释为 migration-only，不能被新运行写入。

### 21. 完成定义

只有以下条件全部满足，才能说“完整实现”：

1. 五阶段父状态机位于生产路径；
2. Build Index 三 lane 有真实 queues/receipts/progress；
3. Vault-wide Discovery 是受控、非线性的 Agent Harness；
4. Prepare review 是独立 Agent artifact pipeline；
5. Completed tasks 在 Publish 前已生成并验证；
6. Publish 不调用模型、不派生任务；
7. pause/resume/restart 不重复成功工作；
8. progress/ETA 来自真实 controller data；
9. Approved Mock 只消费 production projector；
10. Scan 前后用户文件不变；
11. owner choice → Proposal → Apply → Re-index → Verify 边界保持；
12. legacy shared AI、publish-time derivation、fake progress 和长期双 runtime 已退出生产路径；
13. focused/full tests、build、migration/replay 通过；
14. 真实 Obsidian 验收通过，或具体未验证项被诚实列出。

缺一项就报告 `partial progress`，同时说明已完成 tracks、未完成 tracks、阻塞、现有安全状态和下一步。不要用“代码已经存在”“build 通过”或“Mock 看起来一致”代替完成定义。

### 22. 最终交付

最终必须给 owner：

1. 一段人话说明：点击 Start 后现在真实发生什么；
2. 当前生产运行图与关键状态/数据变化；
3. 实现文件和每个 controller/Agent/port 的责任；
4. 当前 Agent 数量、jobs、tools、completion gate；
5. progress/ETA 的真实计算；
6. persistence、pause/recovery、migration、rollback；
7. 测试命令与结果；
8. 真实 Obsidian 证据或精确 `INTERACTION NOT VERIFIED`；
9. legacy retirement 搜索结果；
10. 用户文件未变化的证据；
11. 每个 commit SHA；
12. 一个项目内 implementation note，保存最终代码路径、数据流、验证、遗留项和继续工作入口。

不要只给“完成了哪些文件”的列表。最终说明必须让产品设计者能确认用户心智没有被改，让程序员能从 UI 一路追到 controller、Agent tool、artifact、Completed 和 post-Scan apply/verify。

## 任务结束

