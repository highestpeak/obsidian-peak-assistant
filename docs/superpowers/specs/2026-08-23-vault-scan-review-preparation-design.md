# Vault Scan：Prepare review 与 Maintenance task 生成设计

> 状态：Owner design · implementation-ready contract
>
> 范围：Vault-wide Discovery 结束后，到 Completed / Work queue 发布前
>
> 配套设计：[Vault-wide Discovery Harness 技术设计](./2026-08-23-vault-wide-discovery-harness-design.md)
>
> 不包含：Build Index、Discovery 内部调查、Proposal Apply、用户文件写入、视觉 Mock 实现

## 1. 结论

Vault-wide Discovery 之后确实缺少一个独立步骤：

```text
Build Index
→ Vault-wide Discovery
→ Prepare review
→ Completed
→ Owner review / choice
→ Proposal / Apply / Verify（仅在需要时）
```

`Prepare review` 的工作不是“继续发现”，也不是“提前生成所有文件 diff”。它负责把已经冻结的事实、finding、错误和历史未结工作整理成三类结果：

1. Peak 已安全完成的事项和 receipt；
2. 真正需要 owner 处理的 maintenance task；
3. 无法安全形成任务、需要注意或重试的 blocked result。

它应该有独立进度，但仍属于同一个 Scan run 和同一个 Run progress 页面，不应增加新的顶层导航页。

Agent 数量也不等于任务数量。生产结构固定为：

- **一个确定性的 `ReviewPreparationController`**，拥有状态、进度、去重、发布和完成条件；
- **一个可复用的 `ReviewPreparationAgent` capability**，反复执行 work shaping、review artifact drafting、validator-driven revision 三类 bounded jobs；
- **零个“每种任务一个 Agent”**；
- 后续生成真实 diff 的 `ProposalDraftAgent` 属于 owner 做出选择后的 Proposal 阶段，不属于本步骤。

所以一次 Scan 可以得到 0、3、11 或 30 个 maintenance tasks，但运行时仍只有一个 Prepare review Agent capability。只要存在需要 owner 理解、比较或选择的 reviewable work，就必须生成经过验证的 Agent review artifact；只有 0 项 reviewable work，或 catalog 明确声明为 deterministic-only 的 recovery/receipt，才允许 0 次 Agent job。当前 Mock 中的 11 行只是评审数据，不能成为 Agent 数量或生产任务数量的合同。

## 2. 先区分五种东西

当前最容易混淆的是把 finding、task、review artifact、suggestion 和 proposal 都叫作“可 review 信息”。它们必须分开：

| 对象 | 含义 | 谁生成 | 是否可写用户文件 |
|---|---|---|---|
| `Finding` | 有证据支持的异常、关系、结构变化或风险 | detector / Discovery Harness | 否 |
| `Maintenance task` | owner 可以执行并关闭的一项工作容器；稳定身份与状态不来自模型 | ReviewPreparationController | 否 |
| `Review artifact` | 用户实际阅读的证据摘要、影响、选项、建议和注意事项 | ReviewPreparationAgent，Controller 验证后接纳 | 否 |
| `Suggestion` | Review artifact 中对 task 的建议选择、解释或排序 | ReviewPreparationAgent 或 catalog 声明的 deterministic producer | 否 |
| `Proposal` | 具体、可审核、带 revision guard 的 source diff | owner 选择后的 Proposal 阶段 | 只有显式 Apply 后才写 |

一个 finding 不一定产生 task：

- 已自动安全处理的 finding 变成 receipt；
- 重复或被替代的 finding 不再生成新任务；
- 仅供 Vault map 展示、没有 owner action 的 finding 留在 Discovery 结果中；
- 多个 finding 可以合并成一项 owner work；
- 一个 finding 也可能因 owner surface 或退出条件不同而拆成多项 work。

Completed 列表里的 `Ready for review` 不能表示“AI 已经说了几句话”。只有结构化 review artifact 已 durable、citation 可达、validator 通过时，task preparation status 才能成为 `prepared`，UI 才显示该 badge。Agent stream 是生成过程，不是最终产物本身；proposal workflow 中的 `ready-review` 则仍专指已经存在具体 source diff 的更晚状态。

## 3. 当前实现为什么不够

当前代码已经有重要的安全边界，但生成过程仍然是隐藏的。

### 3.1 已有的正确边界

- [`VaultMaintenanceTask`](../../../src/core/types/vault-intelligence.ts) 已保存 atomic items、evidence、owner choice、workflow 和 suggestion receipt。
- [`prepareProposal`](../../../src/app/vault-intelligence/VaultIntelligenceRuntime.ts) 只在 owner 已选择 proposal-boundary outcome，并且 detector 提供精确 patch、source revision 仍匹配时，才生成 `ready-review` diff。
- AI Tags、Summary、Embedding 和 graph machine facts 是 Peak-owned knowledge，不应被包装成 owner task。
- Proposal、Apply、re-index、Verify 已经是独立于 Scan 的写入路径。

这些边界必须保留。

### 3.2 当前缺口

1. `operationExecutionGroup()` 把 `relationship-discovery`、`semantic-review`、`community-analysis`、`hub-bridge-analysis`、`file-proposals` 和 `maintenance-synthesis` 合并为同一次 Vault Review execution。
2. [`performPublish`](../../../src/app/vault-intelligence/VaultIntelligenceRuntime.ts) 才调用 `deriveVaultMaintenanceTasks()`；用户看不到 normalization、dedupe、grouping、drafting 和 validation。
3. [`deriveVaultMaintenanceTasks`](../../../src/ui/view/vault-intelligence/VaultIntelligenceModel.ts) 逐个遍历 11 个 config task kinds，并生成固定的 `maintenance:${kind}`；这相当于“一种 kind 最多一个大桶”，不是动态 owner-work planning。
4. Vault Review action / gap 通过固定 switch 映射到 task kind；AI 标题和 refs 还参与 identity，容易因一次措辞变化产生不稳定 identity。
5. `publish` 的 progress 只有一个终点 unit，无法解释“正在整理多少 findings、计划出多少 tasks、哪些正在 AI drafting、哪些校验失败”。

因此当前 Completed 能展示任务，但没有诚实回答任务是怎样生成的。

## 4. 端到端流程

```mermaid
flowchart LR
    DISCOVERY["Vault-wide Discovery<br/>retained findings + evidence"] --> FREEZE["Freeze review input<br/>snapshot + history"]
    LINT["Deterministic findings<br/>lint + index errors"] --> FREEZE
    HISTORY["Existing work<br/>choices + unresolved tasks"] --> FREEZE
    FREEZE --> NORMALIZE["Normalize and dedupe<br/>deterministic"]
    NORMALIZE --> PLAN["Build provisional work graph<br/>controller-owned identity"]
    PLAN --> JOBS["Schedule review preparation jobs<br/>conflict-aware batches"]
    JOBS --> AGENT["ReviewPreparationAgent<br/>inspect → shape → draft"]
    AGENT --> VALIDATE["Deterministic validation<br/>schema / evidence / boundary"]
    VALIDATE -->|"repairable errors"| AGENT
    VALIDATE --> AUTO["Automatic receipts"]
    VALIDATE --> TASKS["Maintenance tasks"]
    VALIDATE --> BLOCKED["Blocked / attention results"]
    AUTO --> PUBLISH["Atomic Completed snapshot"]
    TASKS --> PUBLISH
    BLOCKED --> PUBLISH
    PUBLISH --> COMPLETED["Completed + Work queue"]
    COMPLETED --> CHOICE["Owner review / choice"]
    CHOICE -->|"source change requested"| PROPOSAL["Proposal → diff → Apply<br/>→ re-index → Verify"]
```

### 4.1 六个内部步骤

1. **Normalize**：把 lint finding、index error、Discovery finding、旧 task 和 receipts 转成统一 review atoms。
2. **Provisional plan**：Controller 先建立不丢 atom 的 provisional bundles、稳定 anchors、冲突图和 deterministic dispositions。
3. **Agent preparation**：ReviewPreparationAgent 读取冻结证据，提出 merge/split/defer，生成 owner-facing review artifact。
4. **Validate and revise**：Validator 检查 schema、citation、boundary、identity、owner choice 和退出条件；可修复问题返回 Agent 继续修订。
5. **Freeze review work**：Controller 接纳通过校验的 artifact，冻结 task plan、workKey 和状态；不可修复项进入 attention。
6. **Publish**：原子保存 Completed snapshot、receipts、task updates 和 unresolved input ledger。

前五步是 `Prepare review`；第六步是很短的 publish commit，不需要再伪装成一个长 AI 阶段。

## 5. 输入与输出合同

### 5.1 冻结输入

```ts
interface ReviewPreparationInput {
  scanRunId: string;
  discoverySnapshotId: string;
  discoveryFindingRefs: string[];
  deterministicFindingRefs: string[];
  indexErrorRefs: string[];
  automaticReceiptRefs: string[];
  existingTaskRefs: string[];
  ownerChoiceRefs: string[];
  scopeRevision: string;
}
```

输入在阶段开始时冻结。新的 Vault edit 不应悄悄改变本次 denominator；它只会让相关 task 进入 stale / recovery，或触发下一次 Scan。

所有输入 atom 在完成时必须有且只有一个 disposition：

```ts
type ReviewAtomDisposition =
  | 'automatic-receipt'
  | 'assigned-to-task'
  | 'merged-duplicate'
  | 'superseded'
  | 'informational-only'
  | 'excluded-by-policy'
  | 'blocked';
```

### 5.2 输出

```ts
interface ReviewPreparationResult {
  inputSnapshotId: string;
  dispositions: ReviewAtomDispositionRecord[];
  automaticReceipts: ReviewReceipt[];
  taskPlan: ReviewTaskPlan;
  publishedTaskIds: string[];
  blockedResults: ReviewBlockedResult[];
  reviewArtifactRefs: string[];
  agentReceipts: ReviewPreparationAgentReceipt[];
  completedAt: number;
}
```

`Completed` 展示的是这个 result 的投影，而不是重新从 UI 文案推断状态。

### 5.3 Review artifact

每一项正常发布的 reviewable task 都引用一个 immutable artifact：

```ts
interface ReviewWorkArtifact {
  schemaVersion: 1;
  artifactId: string;
  scanRunId: string;
  workKey: string;
  planRevision: number;
  title: string;
  ownerQuestion: string;
  evidenceSummary: string;
  affectedObjectRefs: string[];
  citations: ReviewCitationRef[];
  choices: ReviewChoice[];
  recommendedChoiceId: string | null;
  recommendationReason: string | null;
  impact: 'low' | 'medium' | 'high';
  caveats: string[];
  writeBoundary: 'peak-owned' | 'proposal' | 'no-change' | 'recovery';
  verificationKind: string;
  exitCondition: string;
  sourceRevisionRefs: string[];
  generatedBy: ReviewPreparationAgentReceipt;
  validationReceiptId: string;
}
```

Agent 生成的是 artifact proposal，不能设置 `artifactId`、`workKey`、最终 impact、task state 或 validation receipt。Controller 根据 frozen plan 补齐 canonical fields，Validator 决定是否接纳。

## 6. Maintenance task 和 review artifact 怎样生成

### 6.1 Task 不是 detector category

一个 task 必须同时满足五个条件：

1. **一个明确的 owner question / action**；
2. **一个明确的 owner surface**，例如 Property review、Composer、Community workspace 或 Recovery；
3. **一个明确的 write boundary**：Peak-owned、proposal、no-change 或 recovery；
4. **一组兼容的 objects / choices**，可以被同一次 owner decision 正确处理；
5. **一个可验证的退出条件**。

缺少任何一项，都不能直接进入 Work queue。

### 6.2 分组规则

Controller 先做确定性 provisional grouping：

```text
candidate group key =
  owner surface
  + owner question
  + write boundary
  + verification kind
  + canonical object anchors
```

- 同一文件的 20 个 property findings 可以是一个 task 中的 20 个 atomic items。
- 63 个 broken references 可以按同一 owner question 成为一个 task，并在内部提供 Target / File 投影。
- 两个都叫 Community 的 finding，如果一个是 Peak-owned membership、一个要求修改 source note，就不能硬合并。
- 同一种 task kind 如果对应不同 project、不同 owner surface 或不同验证方式，可以拆成多个 task。
- 不同 finding kinds 如果共同回答同一个 owner question，可以合并成一个 task。

这一步只得到不丢输入的 provisional work graph，不直接得到用户可见产物。ReviewPreparationAgent 可以基于语义和证据提出 merge、split、defer 或 informational，但它只能在 provisional graph 的 atom 集合内调整；每个 atom 的最终 disposition 仍由 Controller 提交。

正常 reviewable task 的生成链固定为：

```text
frozen atoms
→ provisional bundle
→ ReviewPreparationAgent inspection
→ task shape proposal
→ review artifact draft
→ deterministic validation
→ Agent revision（0..N）
→ Controller commit workKey + artifact
→ task preparation becomes Prepared / Needs attention
→ owner workflow projects Needs your choice where a decision is required
```

### 6.3 稳定身份与跨 Scan 去重

模型不能提供 canonical task ID。Controller 根据规范化 anchor 生成稳定 `workKey`：

```ts
interface ReviewTaskGroup {
  workKey: string;              // controller-derived
  kindId: string;               // config catalog, not the identity
  ownerSurfaceId: string;
  ownerQuestionId: string;
  writeBoundary: 'peak-owned' | 'proposal' | 'no-change' | 'recovery';
  verificationKind: string;
  atomRefs: string[];
  state: 'planning' | 'drafting' | 'validating' | 'ready' | 'blocked';
}
```

Agent 无权生成 canonical `workKey`。若已有 active task 具有相同 `workKey`：

- 新 atom 合入已有 task；
- 已消失 atom 按证据状态解决或保留 stale history；
- owner choice 永远优先于新的 AI suggestion；
- 已 verified task 只有在出现实质新证据时才能 reopen；
- 不创建第二个重复 task。

### 6.4 任务数量何时可知

任务数量不是 Scan 开始时的 denominator。

- Normalize 期间：只能显示 `Organizing findings`，不能承诺“将生成 11 项”。
- Task plan 首次冻结后：显示 `11 tasks planned`。
- 若 Agent 提议且 validator 接纳合并、拆分或拒绝 group，必须发布 plan revision receipt，UI 数量可以变化一次并说明原因。
- Draft 阶段开始后，planned task denominator 应稳定；新发现不得偷偷加入本次运行。

11 个 config kinds 只是允许的 task catalog，不是每次运行的 output list。

## 7. Prepare review Agent Harness

### 7.1 需要几个 Agent

| 组件 | 数量 | 性质 | 负责 |
|---|---:|---|---|
| `ReviewPreparationController` | 1 | 确定性应用层控制器 | ledger、provisional graph、冲突图、进度、预算、状态、发布 |
| `ReviewPreparationAgent` | 1 个 capability，0..N jobs | 有界 Agent Harness | 读证据、调整 work shape、生成 review artifact、根据 validator 修订 |
| Validator | 1 | 纯代码 gate | schema、evidence、boundary、dedupe、exit condition |
| `ProposalDraftAgent` | 本阶段 0 | 后续独立能力 | owner 选择后生成具体 proposal artifact |

这里的 `0..N jobs` 不表示创建 N 个不同 Agent persona。它是同一个 capability，针对 conflict graph 中互不冲突的 bundle batches 多次调用。一个 job 可以产生一个或多个 review artifacts，但每个 artifact 必须单独验证和提交。

示例：

```text
42 retained findings
→ Controller 形成 9 个 provisional bundles
→ 2 个 deterministic receipt / recovery bundles
→ 7 个 reviewable bundles 组成 3 个无冲突 batches
→ ReviewPreparationAgent 执行 3 个 jobs
→ 其中 1 个 artifact 被 validator 驳回并在同一 job 中修订
→ 最终形成 7 个 validated review artifacts / tasks
```

另一次运行可能是：

```text
18 deterministic findings
→ 规则形成 2 个 recovery tasks + 5 个 automatic receipts
→ catalog 将 recovery tasks 声明为 deterministic-only
→ 0 次 Agent 调用
→ 2 个 deterministic artifacts + 5 个 automatic receipts
```

### 7.2 一个 job 内部怎样运行

每个 job 都是复用 `runAgentLoop` 的 bounded attempt：

1. `review_get_state` 读取 job、预算、已有 work 和 validator feedback；
2. Agent 通过 inspect/search tools 读取冻结 evidence 与 source passages；
3. Agent 提出 work shape；必要时 merge/split/defer；
4. Agent 为每个目标 workKey 提交结构化 review artifact draft；
5. Agent 调用 `review_request_validation`；
6. Validator 返回 accepted 或逐字段错误；
7. 可修复错误回到步骤 2–5；预算耗尽或不可修复错误形成 attention receipt；
8. job 只有在所有 bundle 都有 terminal disposition 后结束。

`stopWhen` 只能结束当前 job attempt。Prepare review session 是否完成仍由 Controller 的 ledger 和 completion gate 决定。

```ts
interface ReviewPreparationJob {
  jobId: string;
  sessionId: string;
  planRevision: number;
  mode: 'shape-and-draft' | 'draft-only' | 'revise';
  bundleRefs: string[];
  conflictKeys: string[];
  routePolicyId: 'review-work-shaping' | 'review-artifact-drafting';
  status: 'queued' | 'inspecting' | 'drafting' | 'validating' | 'revising' | 'completed' | 'attention';
  attemptIds: string[];
  draftRefs: string[];
  validationChallengeId: string | null;
  checkpointRef: string | null;
}
```

下面的时序是一个 job 的完整生产闭环。它解释了为何 Agent 可以灵活推理，但不能跳过证据、校验或 canonical commit：

```mermaid
sequenceDiagram
    participant C as ReviewPreparationController
    participant A as ReviewPreparationAgent
    participant T as Typed review tools
    participant V as Deterministic validator
    participant S as Canonical store
    participant U as Run progress UI

    C->>S: Persist queued job and checkpoint
    C->>A: Start bounded attempt with frozen bundle refs
    A-->>U: reasoning and activity stream
    A->>T: Inspect bundle, evidence, history
    T-->>A: Frozen facts, citations, owner choices
    A->>T: Propose shape and draft artifacts
    T->>V: Validate draft checksum and references
    alt Draft has repairable errors
        V-->>A: Field errors and validation challenge
        A-->>U: validation feedback and revision stream
        A->>T: Submit revised artifact
        T->>V: Validate new checksum
    end
    V-->>C: Accepted artifact proposals
    C->>S: Commit workKey, artifacts, receipts and event sequence
    S-->>U: Publish durable task projection
```

UI stream event union 至少覆盖：

```ts
type ReviewPreparationStreamEvent =
  | { type: 'job-queued'; jobId: string; bundleCount: number }
  | { type: 'reasoning-delta'; jobId: string; text: string }
  | { type: 'tool-start'; jobId: string; toolName: string }
  | { type: 'tool-result'; jobId: string; toolName: string; summary: string }
  | { type: 'artifact-draft'; jobId: string; draftRef: string; workKeyHint: string }
  | { type: 'validation-failed'; jobId: string; errors: ReviewValidationError[] }
  | { type: 'validation-passed'; jobId: string; draftRef: string }
  | { type: 'artifact-committed'; jobId: string; artifactId: string; workKey: string }
  | { type: 'job-completed'; jobId: string; status: 'completed' | 'attention' }
  | { type: 'checkpoint'; sessionId: string; checkpointRef: string };
```

只有 `artifact-committed` 会推进上方 task row 到 Prepared。`reasoning-delta`、`artifact-draft` 和 `validation-passed` 都不能单独改变 canonical task 状态。

### 7.3 为什么不设计 11 个 category Agents

- task kind 不是执行阶段；
- 同一个 owner task 可能跨多个 finding kinds；
- Agent 之间会重复读取同一证据、产生不同 identity 和互相冲突的分组；
- 小 Vault 的成本和等待时间会被无意义放大；
- 本来能用确定性代码完成的 dedupe、boundary 和 state transition 不应交给模型。

### 7.4 Job partition 和并发

- 本地模型默认串行；
- remote route 可以使用有界 rolling pool；
- Controller 根据共享 atom、object anchor、existing workKey 和 owner choice 构建 conflict graph；
- 并发单位是互不相连的 bundle batch，不是 task kind；
- 同一 `workKey`、共享 atomic item 或共享 owner choice 的 jobs 必须串行；
- 每个 job 受 token、tool call、wall-clock、revision 和 artifact 数上限约束；
- controller 只在 job 完成并通过 validator 后提交结果。

### 7.5 整个 Scan 到底有几个 Agent 流程

Scan 内只有两个用户可理解的 Agent sessions：

1. `VaultDiscoveryAgent`：反复调查 Vault，产生 validated findings；
2. `ReviewPreparationAgent`：把 findings 变成 validated review artifacts。

Build Index 的 embedding / summary / tags 是 provider jobs，不是 Agent loop。Content-health 与 graph collectors 是确定性系统 jobs，也不是 Agent。Completed 后若 owner 要修改文件，才进入第三个独立的 `ProposalDraftAgent`，它不属于 Scan run。

### 7.6 模型路线

模型仍然只在 Scan setup 配置。Prepare review 在 setup 中保留两个 operation route policies，但它们属于同一个 Agent session：

| operation | 什么时候调用 | 产物 |
|---|---|---|
| `review-work-shaping` | provisional bundle 存在语义分组歧义时 | merge / split / defer proposal |
| `review-artifact-drafting` | 存在非 deterministic-only reviewable work 时 | ReviewWorkArtifact draft / revision |

两个 operation 可以使用同一模型，也可以分别使用本地和远端 route pool；每个 job 保存 planned/actual route receipt。两个 route policies 不代表两个 Agent persona、两条 UI stream 或两个完成条件。

旧的 `maintenance-synthesis` 迁移为 `review-work-shaping`，旧的 `file-proposals` 迁移为 `review-artifact-drafting`。后者在 Prepare review 中只生成无写入能力的 review artifact；真实 source proposal 仍在 owner choice 之后生成。

## 8. ReviewPreparationAgent 的工具

Agent 不应拿到“生成全部任务”的黑盒工具。工具必须让它能够反复观察、比较、调整 work shape、生成 artifact 和根据 validation feedback 修订，同时由 controller 保留最终控制权。

### 8.1 读取工具

#### `review_get_state`

返回当前 bundle、plan revision、预算、现有 task matches 和尚未解决的 validator 问题。

#### `review_inspect_finding_bundle`

按稳定 refs 读取 findings、evidence、counter-evidence、对象 anchors 和 source revisions。只读冻结 snapshot。

#### `review_compare_existing_work`

查找相同或相近 `workKey` 的 active / verified / stale task，并返回 owner choices 和 history。防止每次 Scan 重复创建工作。

#### `review_search_evidence`

在 frozen Evidence Manifest 内做受限检索，返回 passages、graph facts、counter-evidence 和 source revision refs。不能搜索 snapshot 外的新内容。

### 8.2 提议工具

#### `review_propose_task_group`

提出一个 group，包括 atom refs、owner question、owner surface、boundary、exit condition 和理由。不能指定 canonical ID。

#### `review_propose_task_transition`

提出 `merge | split | revise | defer | informational`，并说明原 group refs 和目标 refs。

#### `review_draft_artifact`

提交完整 `ReviewWorkArtifactDraft`：title、owner question、evidence summary、citations、choices、recommendation、caveats、boundary 和 exit condition。关键状态、stable ID、最终 impact 和数量不从文案解析。

### 8.3 校验工具

#### `review_request_publish_check`

要求 controller 运行 deterministic validator，并返回逐字段、可修复错误以及一次性 validation challenge ID。Agent 可以据此修订 artifact，但不能绕过错误。

#### `review_submit_validated_artifact`

提交 artifact draft ref 与最近一次 validation challenge ID。Controller 只在 challenge 与当前 draft checksum 匹配且 validator 已 accepted 时 commit；旧 challenge 或改过内容的 draft 一律拒绝。

### 8.4 明确禁止的工具

- `generate_all_tasks`
- `mark_scan_completed`
- `mark_task_ready_review`
- 任意 Vault write / rename / delete
- 直接修改 owner choices
- 直接设置 stable ID、impact、confidence 或 completion percent

这些都是 controller 或后续显式 owner workflow 的职责。

## 9. 进度怎样控制

这个阶段需要独立进度，而且它可以比 Discovery 更精确，因为输入已经冻结。

### 9.1 两次冻结 denominator

**第一次冻结：Review atoms**

Discovery snapshot 关闭后，冻结 `totalInputAtoms`。Normalize 每处理一个 atom，就得到一个明确 disposition 或进入 candidate group。

```text
input progress = accounted atoms / total input atoms
```

**第二次冻结：Task plan**

Provisional graph 通过首轮完整性检查，并完成 conflict-aware job partition 后，冻结 `plannedGroups`、`plannedAgentJobs` 和 `plannedArtifacts`。

```text
draft progress = terminal groups / planned groups
agent progress = terminal jobs / planned agent jobs
artifact progress = terminal validated artifacts / planned artifacts
```

这里的 terminal 包括 ready、blocked、merged、excluded 和 failed；成功数量必须单独显示，不能把失败冒充成功。

### 9.2 总进度

UI 可以给一个 phase percent，但只在第一次 denominator 冻结后出现。Prepare review 内部 credits 固定为：

| work class | phase credits | denominator |
|---|---:|---|
| Normalize input | 20 | accounted atoms / frozen atoms |
| Provisional plan | 15 | terminal provisional groups + job partition gate |
| Agent preparation | 30 | terminal ReviewPreparationAgent jobs / frozen jobs |
| Artifact validation | 25 | terminal artifacts / frozen planned artifacts |
| Freeze review package | 10 | atoms 全部处置、workKey 唯一、owner choice 保留、artifact refs 可达、package receipt durable 五个 system gates |

```text
Prepare review progress =
  normalized input units
  + terminal planned groups
  + terminal Agent jobs
  + terminal artifact validation units
  + one atomic publish unit
```

每种 unit 的数量来自冻结 plan，不使用 finding 数、token 数或模型自报“42%”。没有 Agent jobs 的 deterministic-only run 将 Agent/Artifact 类别明确记为 skipped-terminal，而不是从 denominator 悄悄删掉；plan revision 只能由 controller 产生，并留下 receipt；percent 必须单调不回退。

在 task plan 尚未冻结前，界面显示 `Planning review work` 和 activity，而不是一个虚假的百分比。

### 9.3 ETA

ETA 由真实 route 和 job type 的历史吞吐估算：

```text
remaining ETA =
  deterministic units × local EMA
  + queued remote jobs / effective concurrency × route EMA
  + validation units × validator EMA
```

- 本地 deterministic work 通常显示秒级；
- remote Agent jobs 显示范围，例如 `2–4 min`；
- route 变化、rate limit 或 retry 后重算范围；
- 没有足够历史时显示 `Estimating…`，不造一个精确秒数；
- elapsed、estimated remaining 和 target 需同时常驻。

### 9.4 暂停、停止与失败

- **Pause**：停止派发新 Agent job；在当前 tool / provider 边界 checkpoint。
- **Resume**：从 persisted plan revision、job transcript checkpoint 和 ledger 恢复，不重做已 accepted artifact。
- **Stop**：保存 partial preparation result，未处理 atoms 显式标为 blocked / unprocessed。
- **Agent failure**：确定性 receipts 和已验证 artifacts 仍有效；失败 bundle 可用新 attempt retry 或发布为 attention。
- **Validator failure**：task 不得进入 ready，错误常驻在 UI。

## 10. 界面合同

### 10.1 页面位置

`Prepare review` 是 Run progress 的最后一个有内容阶段。它不是新顶层 tab，也不是 Completed 上突然弹出的后台工作。

Run steps 建议为：

```text
Discover → Build index → Vault-wide discovery → Prepare review → Completed
```

如果 Build Index 与 Discovery 允许重叠，顶部可以继续表达 lanes；但 `Prepare review` 只能在本次 review input snapshot 冻结后开始。

### 10.2 Header

左侧：

- `Preparing work for review`
- 百分比，或 plan 未冻结前的 `Planning…`
- 一条 phase progress bar
- elapsed、estimated remaining、paused/running 状态

右侧竖向三行常驻数字：

```text
Findings accounted     42 / 42
Tasks planned           7
Ready / attention       5 / 2
```

`Tasks planned` 只有在 plan freeze 后出现。数字旁不堆 description；定义和算法放在 hover / focus disclosure。

### 10.3 主体

主体使用一个纵向 task draft list，不使用很多颜色的小卡片：

```text
Preparing work for review

  Organize Research interview records       12 files    Validating
  Repair broken references                  63 refs     Drafting · Claude Sonnet 4
  Review Community membership                9 notes    Ready
  Recover unreadable documents               3 files    Needs attention
```

每行只保留：

- owner-facing task title；
- 影响对象数量；
- 当前状态；
- 当前正在处理该 bundle 的 model（只有真实 AI job 活跃时）；
- 展开后才显示 evidence、grouping reason、write boundary 和 validation detail。

统一 preparation 状态：`Grouping | Inspecting | Drafting | Validating | Revising | Prepared | Needs attention`。UI 可以把 `Prepared` 显示为 `Ready for review`；不要把 detector 名、内部 kind、token receipt 或两层解释文字常驻在主列表。

### 10.4 Session log

Task list 下方保留一个 session log，显示真实控制器事件：

```text
14:03:12  Accounted for 42 retained findings
14:03:13  Reused 2 existing owner tasks
14:03:14  Prepared 3 review batches from 7 reviewable bundles
14:03:31  Drafted evidence and choices for Repair broken references
14:03:42  Validation requested one revision: two citations are stale
14:03:51  Revision accepted · review artifact ready
```

- Agent reasoning 可以流式显示为普通 log text，但不自动成为 task 或 artifact；
- cited evidence 是独占整行，不做左右两栏；
- log 不自动追踪滚动，避免晃眼；
- 新事件追加到底部，并提供未读计数 / `Jump to latest`；
- task 产生或状态变化时，上方对应纵向 row 更新，不再额外堆彩色 discovery cards。

### 10.5 Completed 的含义

Completed 页面不负责现场生成 tasks。它只读取已经原子发布的 snapshot：

- Run details；
- Completed automatically receipts；
- Maintenance tasks that need you；
- Needs attention / recovery；
- actual AI usage 和 preparation receipts。

如果 Prepare review 以 partial 状态结束，标题应为 `Scan completed with attention`，不能把未处理 findings 静默丢掉。

## 11. Task 状态与真实 artifact

```mermaid
stateDiagram-v2
    [*] --> planning
    planning --> prepared: review artifact validated
    planning --> recovery: executable recovery path
    planning --> blocked: no safe owner action or missing evidence
    prepared --> needsChoice: owner outcome required
    prepared --> verified: Peak-owned or no-change work verified
    needsChoice --> needsProposal: owner selects proposal boundary
    needsChoice --> verified: owner selects no-change outcome
    needsProposal --> readyReview: actual guarded proposal artifact exists
    readyReview --> applying: explicit owner Apply
    applying --> reindexing
    reindexing --> verifying
    verifying --> verified: fresh verification passes
    verifying --> recovery: conflict or verification failure
    blocked --> planning: evidence or policy changes
```

关键规则：

- `prepared`（Prepare review 内部状态）：validated ReviewWorkArtifact 已存在；Completed UI 可显示 `Ready for review`，但还没有 source diff。
- `needs-choice`：有证据和合法 choices，但没有 source diff。
- `needs-proposal`：owner 已选 proposal-boundary outcome，proposal 尚未生成。
- `ready-review`（Proposal workflow 状态）：真实、revision-guarded source diff artifact 已存在；不能只靠 ReviewWorkArtifact 或 AI summary 进入该状态。
- `recovery`：有可执行 recovery scope 和验证方式。
- `verified`：fresh verification 已通过，不等于“用户点过接受”。

## 12. 完成 Gate

Controller 只有在以下条件全部成立时，才能发布正常 Completed：

1. 每个 frozen input atom 都有 disposition；
2. 每个 published task 都有 stable `workKey`；
3. 每个 task 都有 owner question、owner surface 和 compatible object set；
4. 每个 task 都有 write boundary 和 verifiable exit condition；
5. evidence refs 均来自 frozen snapshot，source revisions 可追溯；
6. 没有与现有 active work 重复的 task；
7. owner choices 和 previous verified history 没有被模型覆盖；
8. 每个普通 reviewable task 都有 validated ReviewWorkArtifact；任何 workflow state 为 `ready-review` 的 task 还必须有 guarded proposal artifact；
9. failures、blocked atoms 和 skipped AI jobs 均未被隐藏；
10. Completed snapshot、task changes、receipts 和 plan revision 原子持久化。

不满足 1、5、7、8 或 10 时禁止普通 Completed；可发布 `completed-with-attention` 或保持可恢复的 failed checkpoint。

## 13. 建议的数据状态

```ts
interface ReviewPreparationSession {
  id: string;
  scanRunId: string;
  status:
    | 'planning'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'completed'
    | 'completed-with-attention'
    | 'stopped-partial'
    | 'failed';
  inputSnapshotId: string;
  inputLedger: ReviewAtomLedger;
  plan: ReviewTaskPlan | null;
  planRevision: number;
  agentJobs: ReviewPreparationJob[];
  reviewArtifacts: ReviewWorkArtifactRef[];
  validation: ReviewValidationState;
  progress: ReviewPreparationProgress;
  events: ReviewPreparationEventRef[];
  updatedAt: number;
}

interface ReviewPreparationProgress {
  phase:
    | 'normalizing'
    | 'grouping'
    | 'inspecting'
    | 'drafting'
    | 'validating'
    | 'revising'
    | 'freezing';
  terminalUnits: number;
  successfulUnits: number;
  failedUnits: number;
  skippedUnits: number;
  totalUnits: number | null;
  percent: number | null;
  elapsedMs: number;
  remainingRangeMs: [number, number] | null;
  frozenAt: number | null;
}
```

`percent: null` 是合法状态，表示 plan 尚未冻结，而不是 0%。

## 14. 现有代码的迁移方向

### Slice 1：状态与 truth contract

- 在 Scan stage 中加入技术 stage `prepare-review`；用户文案为 `Prepare review`。
- 引入 `ReviewPreparationSession`、input ledger、task plan、job receipts 和 progress ledger。
- 11 个 `tasks` config 继续作为允许的 kind / choice catalog，不再代表输出数量。
- 为 task 增加 stable `workKey`，同时保留现有 task ID 的迁移读取。

### Slice 2：Controller 与确定性 planner

- 从 [`performPublish`](../../../src/app/vault-intelligence/VaultIntelligenceRuntime.ts) 移出 task derivation。
- 把现有 lint / index error / review evidence adapter 转成 review atoms。
- 实现 disposition、existing-task reconciliation、owner choice preservation 和 completion gate。
- 直接实现 provisional work graph 和 dynamic grouping；“一种 kind 一个大桶”只能保留为迁移输入 adapter，不能进入新生产 planner。

### Slice 3：Agent capability 与 artifact pipeline

- 在 app layer 组合统一的 `ReviewPreparationAgent` capability；复用现有 Agent Harness，不创建 service singleton。
- 注册本设计中的 typed tools 和 schema。
- 从 shared Vault Review execution group 移除 `file-proposals` / `maintenance-synthesis`；Discovery 只输出 findings。
- 实现 provisional graph、conflict-aware job partition、artifact draft、validator feedback 和 revision loop。
- 只要有非 deterministic-only reviewable work，就必须产生 validated Agent artifact。

### Slice 4：Run progress UI

- 加入独立 Prepare review header、纵向 draft list 和 non-follow session log。
- Pause / Resume / Stop 继续控制同一个 Scan run。
- Completed 只读取 published snapshot，不在 render 时重新 derive tasks。

### Slice 5：Proposal 边界收口

- 保留现有 `prepareProposal()` 的 deterministic exact-patch 安全路径。
- 对需要复杂生成的 task，在 owner choice 后路由到独立 Proposal capability。
- `ready-review` 必须绑定 proposal artifact ID，修正任何 label-only 状态。

## 15. 验证矩阵

| 场景 | 必须证明 |
|---|---|
| 0 findings | 0 task、0 Agent call、正常 Completed |
| catalog 声明为 deterministic-only 的 findings | 正确 recovery tasks / receipts，0 Agent call |
| 普通 reviewable findings | 至少一个 Agent job；每个 task 有 validated artifact |
| 多 finding 合一 | 一个 stable workKey，原子项不丢失 |
| 一 finding 拆分 | 不同 owner surface / exit condition 形成不同 tasks |
| 重复 Scan | 复用 active task，不复制；owner choices 保留 |
| 已 verified work 出现新证据 | 有条件 reopen，并保留历史 |
| local model | jobs 串行，ETA 使用 local throughput |
| remote model | bounded pool，互斥 workKey 不并发 |
| pause / resume | plan revision 和 accepted jobs 不重做 |
| Agent failure | deterministic result 保留，失败 bundle 显式 attention |
| validator revision | 同一 draft checksum 失效，Agent 修订后用新 challenge 提交 |
| stale source | proposal 不进入 ready-review，task 进入 recovery |
| fake ready-review | 没有 artifact ID 时 validator 拒绝 |
| partial stop | 未处理 atoms 可枚举、可恢复、不静默丢失 |
| Completed publish crash | 原子恢复，不出现 task 与 receipt 半发布 |

自动测试至少覆盖 planner property tests、identity stability、cross-scan reconciliation、progress monotonicity、pause/resume、Agent tool permission、artifact gate 和 atomic publish。真实 Obsidian 还要验证 Run progress 滚动、Pause/Resume、展开详情、focus 恢复和 Completed 路由；在得到真实宿主证据前必须保留 `INTERACTION NOT VERIFIED`。

## 16. 明确拒绝的方向

- 不设计 11 个 task-specific Agents。
- 不把 Prepare review 降级成“规则分组 + AI 偶尔润色”。
- 不把 11 个 config kinds 当固定输出任务。
- 不让 Discovery Agent 一边发现、一边直接发布 Work queue。
- 不用 finding 数、token 数或 reasoning 字数冒充完成度。
- 不在 plan 未冻结时显示虚假的百分比或 ETA。
- 不把 AI suggestion 叫作 proposal。
- 不在没有实际 diff / review artifact 时显示 `Ready for review`。
- 不为这个阶段创建新的顶层 Workspace、右侧 drawer 或一堆分类彩色卡片。
- 不允许模型直接改 task identity、owner choices、completion state 或用户文件。

## 17. Owner 可见的最终心智

用户只需要理解这条因果链：

```text
Peak 找到了什么
→ Peak 正在把它们整理成少量可处理的工作
→ 哪些已自动完成
→ 哪些需要我决定
→ 我决定之后，才会产生具体 Proposal
→ 我确认 Apply 之后，才会改文件并重新验证
```

因此，`Prepare review` 不是多余的一步。它是把灵活、反复的 Vault-wide investigation 转换为稳定、可恢复、可审核 owner work 的必要边界。
