# Vault Intelligence：Work queue 与 Findings 设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文定义所有可处理事项如何进入一个完整队列，以及 19 个确定性 detector 如何产生可追溯 findings。Overview 的 Priority work 只是这份队列的少量摘要。

每个来源、detector 和用户动作的完整例子集中在 [Follow-up 与 Work queue 用户合同](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md)。本文继续负责 detector 与队列结构，不再把少数 owner-action 筛选误写成完整 Follow-up taxonomy。

Work item 打开后的 maintenance review 不是另一套临时状态：Batch / File、Target / File 等只是同一 canonical set 的投影，所有 choice、count、history 与最终写入都遵循共享规则。

## 1. Work queue 收录什么

| 来源 | 例子 |
|---|---|
| Peak continuation | Project blocked、Composer pending review、AI Graph source changed |
| Pending decision | Proposal、Reminder 或媒体任务等待确认 |
| Readiness | 未读取、未索引、解析失败、provider 不可用 |
| Enrichment | vectors、Summary、AI Tags 缺失或过期 |
| Structure | Orphan、broken link、island、Gap、fragile Bridge、stale Hub |
| Content | empty、stub、oversized、duplicate、naming issue |
| Tags & metadata | untagged、tag explosion、frontmatter policy |
| Semantic review | contradiction、coverage gap 等未来 AI-assisted finding |
| Runtime | paused、failed、skipped、conflict、budget stop |
| Proposal | waiting review、waiting apply、waiting verify |

对象只有在拥有 durable status 或 finding、明确 next action 和可验证退出条件时才进入队列。

每次 Scan Vault 完成时，系统对本次 unresolved results 做一次确定性 materialization：满足上述条件的结果创建或更新 Work item；已解决、无需动作或仅用于说明 projection 更新的结果只留在 run snapshot。Completed run 必须显示本次创建 / 更新了多少 Work item，并允许从具体结果直接打开对应 item，而不是要求用户猜测 Work queue 从哪里来。

## 2. Work item 最小信息

每个 item 必须回答：

1. 发生了什么；
2. 影响哪些对象；
3. 证据是什么；
4. 用户可以做什么；
5. 处理后如何确认它已经退出队列。

建议字段：

```text
workItemId / sourceType / sourceId
title / naturalLanguageSummary
objectRefs[] / scope
severity / confidence / impact
evidenceRefs[] / findingSnapshotId
status / createdAt / updatedAt
nextActions[] / ownerSurface
exitCondition / verificationState
dismissalPolicy / snoozeUntil
```

## 3. Overview 为什么只显示少量 Priority work

Priority work 最多展示 3–5 项，并显示 `Why this is here`。排序依据包括：

- 对 Search、关键 Hub 或大量文件的影响；
- finding 的确定性和误判风险；
- 是否有清晰下一步；
- 是否明确等待用户 review、恢复或确认；
- 是否来自最新成功扫描；
- 处理成本与写入风险；
- 用户配置的重要目录和 ignore policy。

首页排序不能代替完整队列，也不能用一个综合 Health score 隐藏原因。

## 4. Work queue 页面

### 4.1 筛选

- source；
- object type；
- file type；
- finding group；
- severity；
- confidence；
- status；
- run；
- owner surface。

### 4.2 批量动作

- Dismiss with reason；
- Snooze；
- Retry；
- Mark intentional；
- Open selected objects；
- Review with AI；
- Generate proposal。

批量动作必须先说明 eligible、not applicable、conflict 和预计写入范围。真正写文件的 Apply 不在普通批量动作中直接发生。

## 5. Work item detail

### 5.1 打开位置

Work queue 是高密度、按行浏览的页面。点击一条 item 后，详情直接在该行下方展开，不使用右侧 Drawer：

- 触发点、详情和主动作保持在同一个水平区域，避免鼠标横跨整个窗口；
- 原行保持选中状态，用户不会丢失正在查看的 item；
- 同时只展开一项；再次点击、关闭、筛选、搜索、离开页面或按 Escape 都会收起；
- Checkbox 只控制批量选择，不触发详情；
- 展开区显示自然语言说明、证据、下一步和退出条件，深度 review 再进入 AI Review、Proposal 或 owner surface。

Map 节点、Overview 卡片等没有稳定行锚点的对象使用居中 Modal。Vault Intelligence 不使用通用右侧 Drawer；因为从左侧列表或图中选择对象后，将主动作放到最右侧会增加指针距离并割裂空间上下文。

### 5.2.1 Owner surface handoff 不是普通跳转

`Open Project Home`、`Open saved review` 或 `Open AI Graph View` 必须绑定具体 work item，而不是绑定在对象家族的汇总数字上。以 Composer 为例，该 item 必须提供 `composerSessionId`、`changeSetId`、明确文件范围和冻结 source revision。

- 定位信息完整且 revision 未漂移：打开已存在的 Composer review，并选中对应 Change Set；
- 定位信息缺失：禁用跳转，说明哪个持久化记录无法恢复；
- source revision 已漂移：保留 work item，先显示 conflict / rebuild 选项；
- 仅有 `1 pending review` 这类汇总数：只能查看分布和具体列表，不得猜测目标或打开空白 owner surface。

### 5.2 内容结构

```text
Broken references in Research/Imports
High impact · Deterministic · Found 12 min ago

What happened
47 unresolved targets across 18 Markdown files.

Why it matters
9 source files are high-traffic hubs.

Evidence
Source files, missing targets, occurrence counts, source hashes.

Next steps
Review files · Generate repair proposal · Open folder · Dismiss rule
```

详情保留 detector ID、阈值和原始证据，但首先使用自然语言解释。

## 6. Deterministic findings 与 AI insights

确定性 detector 负责产生稳定事实。AI Review 读取 finding snapshot 后进行聚类、根因分析、趋势比较和优先级判断。

| 层级 | 能否被后续 AI 改写 | 在队列中的表现 |
|---|---:|---|
| Raw finding | 否 | 可独立查看、dismiss、verify |
| AI insight | 否，只能新增版本 | 可以关联多个 findings |
| Suggested action | 可以由用户选择或拒绝 | 进入 action 或 proposal 状态 |

AI insight 不覆盖 raw finding。一个 insight 可以把多个同源 findings 合并成更可理解的工作主题。

扫描完成页按工作主题聚合展示，但 Work item 仍保留原始 finding references。若 AI 将 21 个同源 orphan 解释为一次导入流程问题，界面可以显示一个 owner-facing 结果和一个主要 Work item，同时保留 21 条 raw findings 供证据审计。

## 7. 19 个确定性 detector

### 7.1 Connections / Structural（6）

| ID | 用户语言 | 主要证据 | 典型动作 |
|---|---|---|---|
| `S-ORPHAN` | 完全没有连接的内容 | hard orphan / degree 0 | 查看邻居、标记为有意独立 |
| `S-SOFT-ORPHAN` | 连接很少、难以导航到 | in + out degree threshold | 建议链接、加强连接 |
| `S-BROKEN-LINK` | 链接指向不存在目标 | unresolved links | 创建、重定向、移除 |
| `S-MISSING-BACKLINK` | 内容相关但没有显式连接 | similarity + no link | 建议 wikilink、dismiss |
| `S-ISLAND-CLUSTER` | 小 Community 没有接回主图 | member count | 连接主 Community、创建 Hub |
| `S-FRAGILE-BRIDGE` | Community 内部连接稀薄 | member count + density | 补连接、拆分、解释 |

### 7.2 Content（6）

| ID | 用户语言 | 适用范围 | 典型动作 |
|---|---|---|---|
| `C-EMPTY` | 文件没有有效正文 | 当前 Markdown detector | 删除、补写、ignore template |
| `C-STUB` | 正文过短，像未完成草稿 | 当前 Markdown detector | 补写、归档、snooze |
| `C-OVERSIZED` | 单文件过长 | 当前 Markdown detector | 建议拆分、打开 Composer |
| `C-FRONTMATTER-MISSING` | 缺少 frontmatter block | Markdown only | metadata proposal |
| `C-NAMING-VIOLATION` | Untitled、空名或首尾空格 | 当前 Markdown detector | rename proposal |
| `C-DUPLICATE` | 标题和语义都高度相似 | indexed candidates | 对比、合并、保留两份 |

### 7.3 Tags（2）

| ID | 用户语言 | 主要证据 | 典型动作 |
|---|---|---|---|
| `G-UNTAGGED` | Markdown 没有 tags | metadata cache | AI tag suggestion、ignore policy |
| `G-TAG-EXPLOSION` | 单文件标签数远高于中位数 | tag count + median | 修剪 proposal、review taxonomy |

### 7.4 Aging / Temporal（5）

| ID | 用户语言 | 主要证据 | 典型动作 |
|---|---|---|---|
| `T-STALE-HUB` | Hub 没有跟随成员变化更新 | stale since / threshold | 更新、mark current |
| `T-RECENT-DRIFT` | 最近活跃后没有收尾 | mtime window | revisit、archive、snooze |
| `T-DECAYING-BRIDGE` | 重要连接长期未维护 | degree + mtime | review、split、refresh |
| `T-ABANDONED-FOLDER` | 整个 folder 长期没有活动 | child mtime aggregation | archive、reintegrate |
| `T-ABANDONED-CLUSTER` | 整个 Community 长期没有活动 | community + mtime | archive、bridge、review |

## 8. Semantic detector 的诚实状态

以下六个 `M-*` detector 已注册，但当前执行仍返回空结果：

- `M-COVERAGE-GAP`；
- `M-LOW-COHESION`；
- `M-CONTRADICTION`；
- `M-PHANTOM-NODE`；
- `M-SEMANTIC-ISOLATION`；
- `M-REDUNDANT-HUBS`。

它们必须显示 `Not available yet`，不能把空结果解释为“已检查且没有问题”。这不影响 AI Review 对现有 19 个确定性 findings 做第二层分析。

## 9. Finding 生命周期

```text
Open
→ Acknowledged / Snoozed / Dismissed
→ Proposal pending（需要修改时）
→ Applied / No change
→ Verification pending
→ Resolved or Reopened
```

Dismiss 必须保留 reason 和 policy scope。下次扫描如果证据或 scope 发生变化，可以重新打开，而不是永久隐藏新问题。
