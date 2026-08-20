# Vault Scan Follow-up 与 Work queue 用户合同

> 本文是 Vault Scan 完成后如何形成 Follow-up、如何进入 Work queue、用户可以采取哪些动作的权威产品合同。它补充 [Vault Intelligence 功能正稿](../../13-feature-vault-intelligence.html)、[Work queue 与 Findings 设计](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md) 和直接展示完整 48 项合成数据的 [V2 Completed Mock](../../gstack/vault-intelligence-workspace-2026-08-12-v2/index.html#completed)。

## 结论

Follow-up 不是五种固定结果，也不是 Scan 生成的所有对象。Peak 先完成能够安全自动完成的维护，再把仍然需要 owner 的事项变成 Follow-up。

一个事项只有同时满足以下条件，才进入 Work queue：

- Peak 无法安全地独自关闭它；
- 用户有明确、可执行的下一步；
- 处理结果有可验证的退出条件；
- 状态需要跨页面或跨 Scan 保留。

真实 Scan 可以产生 0 个、3 个、12 个或更多 Follow-up。当前 Mock 为了完整评审动作设计，故意在 Completed 中同时生成 48 个合成 Follow-up；这是穷举测试数据，不是生产运行数量的暗示。

## 1. 用户看到的完整因果链

```text
选择 Scan 范围、任务、AI 操作和模型
  ↓
Peak 更新本地事实、Knowledge Index 和已授权的机器知识
  ↓
Completed 先展示 Peak finished automatically
  ↓
Peak 汇总仍然不能安全完成的事项
  ↓
Completed 展示 Needs you
  ↓
未解决事项创建或更新 Work item
  ↓
用户选择、Review、Apply、恢复或继续工作
  ↓
Peak 重新索引或重新检查
  ↓
Verified 后退出 Work queue；新证据出现时可以 Reopen
```

Completed 页按因果顺序展示：

1. Scan 已完成，以及用户文件是否发生变化；
2. Peak 自动完成了什么，以及影响了哪些产品能力；
3. 本次仍然需要用户处理的具体事项；
4. 模型、token、费用、operation 状态和 provider receipt。

## 2. 哪些结果不进入 Follow-up

以下内容仍然是重要 Scan 结果，但成功时不形成用户任务：

- Full-text、chunks 和 Search projection 已成功发布；
- 已授权的 vectors、Summary 和 machine-only AI Tags 已成功更新；
- 确定性的 graph facts 和 Community membership 已成功更新；
- detector 完成检查且没有发现异常；
- AI explanation 已经被一个具体 owner decision 吸收；
- Run receipt 仅用于成本、审计、比较或调试。

三个边界例子：

### AI Tags

- 39 组 machine-only AI Tags 成功更新：放在 `Peak finished automatically`；
- 用户启用 AI Tags，但 17 个文件生成失败：形成可 Retry 的 Enrichment Follow-up；
- 用户想把 AI Tags 写入 Markdown frontmatter：先生成 Proposal，再由用户 Review 和 Apply。

### Community

- Louvain 等确定性算法更新 Community membership：属于 Peak 自动完成的机器状态；
- AI 发现现有 Community 可能需要 Split、Merge 或 Rename：形成 owner decision；
- AI 只更新 Community 描述候选：形成 Peak-owned text review，不修改用户文件。

### Search

- 137 个文件重新可搜索：展示受影响的 Vault Search、AI Search 和 file context；
- 三个文件仍不可读取：保留其他成功结果，只为这三个文件形成 Recovery Follow-up。

## 3. Follow-up 的五个独立维度

Follow-up 必须同时保留下面五个维度。它们不能压成一套固定分类。

| 维度 | 回答的问题 | 示例 |
|---|---|---|
| Source | 事项从哪里产生？ | Structure finding、runtime failure、proposal |
| Capability domain | 它属于哪种维护能力？ | Freshness、Machine knowledge、User metadata |
| Finding / object | Peak 实际发现或生成了什么？ | Broken link、stale Hub、guarded diff |
| Lifecycle state | 当前处理到哪里？ | Open、Proposal ready、Verification pending |
| Owner action | 用户下一步要做什么？ | Connect、Review diff、Retry、Snooze |

Work queue 顶层筛选只帮助用户找到下一步，不代表完整类型。当前推荐的轻量筛选是：

- All；
- Needs your choice；
- Ready for review；
- Needs recovery。

## 4. 十种 Follow-up 来源

### 4.1 连续工作与运行状态

| 来源 | 什么时候进入 | 具体例子 | 退出条件 |
|---|---|---|---|
| Peak continuation | 已有 Vault 维护工作被保存、暂停或因证据变化阻塞 | Composer 中的 Research metadata review 尚未完成 | 恢复同一 review，并完成或明确取消 |
| Pending decision | Peak 有证据，但不能替 owner 决定知识含义 | 21 个 meeting notes 是否属于 Research | 用户选择处理结果，并记录理由 |
| Readiness | 输入或依赖不能用于本次维护 | 三个 PDF 第二次解析仍失败 | 文件恢复可读，或 exclusion policy 已保存 |
| Runtime | 已选 operation 中断或只完成一部分 | Community review 完成，但 Hub review 被用户停止 | 继续、重跑或明确接受 partial result |
| Proposal | 改动正在等待 Review、Apply 或 Verify | 12 个 frontmatter diffs 中有 1 个 source conflict | Apply 后 re-index 和 Verify 通过，或 Proposal 被拒绝 |

### 4.2 Vault 内容与知识维护

| 来源 | 什么时候进入 | 具体例子 | 退出条件 |
|---|---|---|---|
| Enrichment | 用户期望的机器知识缺失、过期或生成失败 | 17 个已启用 AI Tags 没有当前 source hash 的结果 | 重新生成并验证 source hash，或用户取消该输出 |
| Structure | 图结构存在需要 owner 判断或修复的问题 | Product 与 Research 只剩一条脆弱 Bridge | 更新、替换、退役或标记为有意状态 |
| Content | 文件内容本身需要维护 | 4 个超过阈值的超长 Markdown 文件 | 拆分、保留、Snooze 或 Dismiss with reason |
| Tags & metadata | 用户 metadata 与当前 policy 冲突 | Projects/ 中 12 个文件缺少 required status | Proposal 被 Apply 并验证，或 policy exception 被记录 |
| Semantic review | AI 找到需要证据审阅的意义或关系问题 | 两个 Hub 可能重复描述同一知识区域 | Review 后 Merge、Keep both 或 Reject candidate |

`Peak continuation` 只收录与 Vault 维护直接相关、拥有稳定返回点的工作。普通 Chat、Project 或 Composer session 不会因为长时间未打开就自动进入 Work queue。

## 5. 七个维护能力域

| 能力域 | Peak 维护什么 | Follow-up 例子 |
|---|---|---|
| Structure | Link、Community、Topic、Hub、Bridge、Orphan、Gap | Split 一个混合 Community |
| Content | 空文件、草稿、超长文件、重复内容、命名 | 比较两份重复研究笔记并决定 Merge 或 Keep both |
| Freshness | stale Hub、recent drift、长期未维护的 folder / cluster | Refresh 一个成员已变化的 Hub |
| Machine knowledge | Full-text、vectors、Summary、AI Tags、entities | Retry 17 个失败的 AI Tags |
| User metadata | frontmatter、用户 Tags、字段类型、taxonomy policy | Review 12 个 guarded frontmatter diffs |
| AI diagnosis | 根因、关系候选、矛盾、结构变化和优先级 | Review AI 发现的 Product ↔ Research 新关系 |
| Materialization | 把审阅结果变成用户文件或显式用户产物 | Apply 经过 source guard 的 wikilink Proposal |

## 6. 当前 19 个确定性检查：每项一个例子

### 6.1 Connections 与 Structure：6 项

| 检查 | 例子 | 典型下一步 |
|---|---|---|
| Hard orphan | `meeting-2026-08-12.md` 没有入链、出链或 folder context | Connect notes，或 Mark intentional |
| Soft orphan | 一篇 Research note 只有一个弱连接，无法从主要 Topic 导航到 | Open in File Atlas，再补连接或保持独立 |
| Broken link | 七个文件中的 `[[Research roadmap]]` 目标不存在 | Create target、Redirect 或 Remove link |
| Missing backlink / related but unlinked | Launch checklist 与 Research synthesis 高度相关但没有显式关系 | Review evidence，再生成 wikilink Proposal |
| Island cluster | 六篇 imported notes 只互相连接，没有接回主知识图 | Connect to Community，或 Keep separate |
| Fragile bridge | Product 与 Research 只依赖两篇过期 Bridge notes | Update、Replace 或 Retire Bridge |

### 6.2 Content：6 项

| 检查 | 例子 | 典型下一步 |
|---|---|---|
| Empty | `Untitled 41.md` 只有 frontmatter，没有正文 | Delete、Draft in Composer 或 Mark intentional |
| Stub | `Agent memory.md` 只有一句未完成想法 | Continue saved work、Archive 或 Snooze |
| Oversized | 一篇 19,000 字研究笔记已经难以搜索和维护 | Split note 或 Keep as one with reason |
| Missing frontmatter | Projects/ 中一篇项目笔记没有 policy 要求的字段 | Generate Proposal，再 Review diff |
| Naming violation | `Untitled.md` 或带首尾空格的文件名 | Review rename Proposal |
| Duplicate | 两篇标题和语义都高度相似的 launch notes | Merge duplicates、Keep both 或 Alias |

### 6.3 Tags：2 项

| 检查 | 例子 | 典型下一步 |
|---|---|---|
| Untagged | 项目 policy 要求用户 Tags，但 18 篇笔记没有任何 Tags | Generate tag Proposal，或记录 policy exception |
| Tag explosion | 一篇笔记有 42 个用户 Tags，远高于 Vault 中位数 | Review taxonomy，再生成修剪 Proposal |

### 6.4 Aging 与 Freshness：5 项

| 检查 | 例子 | 典型下一步 |
|---|---|---|
| Stale Hub | Research Hub 的成员已变化 52 天，但 Hub 内容没有更新 | Refresh Hub、Keep current 或 Snooze |
| Recent drift | 最近密集修改的一组 launch notes 没有形成收尾或归档 | Revisit、Archive 或 Mark intentional |
| Decaying Bridge | 一篇关键 Bridge 仍被引用，但长期没有覆盖两侧的新内容 | Update、Replace 或 Retire Bridge |
| Abandoned folder | `Projects/Old launch/` 内所有文件长期无活动 | Archive folder 或 Reintegrate relevant notes |
| Abandoned cluster | 一个 Community 长期无活动且与当前主图断开 | Archive、Bridge back 或 Keep separate |

## 7. 六个 AI-assisted Semantic Review：每项一个例子

下面六项已经作为 `M-*` detector 注册，但当前执行仍返回空结果。产品必须显示 `Not available yet`，不能把空结果解释成“已经检查且没有问题”。

| Semantic review | 未来例子 | 可能的 owner decision |
|---|---|---|
| Coverage gap | Research Community 反复引用评估方法，但 Vault 没有专门解释该方法的内容 | Create note、Accept gap 或 Ask AI |
| Low cohesion | 一个 Community 的成员分成两个明显不同的语义簇 | Split Community 或 Keep together |
| Contradiction | 两篇当前文档对同一产品限制给出互相冲突的结论 | Review sources、Choose current truth 或 Keep both with context |
| Phantom node | Map 中保留了一个 Topic，但已没有当前文件支持它 | Retire Topic 或 Reconnect evidence |
| Semantic isolation | 一篇内容明显属于 Research，却在链接图中完全隔离 | Connect note 或 Mark intentional |
| Redundant Hubs | 两个 Hub 覆盖相同成员和相同主题 | Merge Hubs、Retire one 或 Keep both |

## 8. 用户动作注册表：每个动作一个例子

下面的分组只描述动作的行为边界，不是 Follow-up 的结果分类。

### 8.1 打开、理解和继续：不会单独关闭事项

| 动作 | 具体例子 | 动作之后 |
|---|---|---|
| Continue saved work | 恢复上次停下的多文件 Property diff | 回到同一 task、Group by、filter、decision state、revision、scroll anchor 和 review position |
| Repair broken links | 维护本轮发现的全部 63 个 broken references；21 个已按 Setup 预授权自动修复，31 个等待选择 repair method，11 个等待选择明确 target | 选中的 redirect / create note / remove link 方案通过 revision guard 写入、re-index，并由 fresh detector 验证；延期项保持显式未解决状态 |
| Open in File Atlas | 查看 soft orphan 的一跳、两跳真实关系 | 用户随后选择连接或保持独立 |
| Inspect evidence | 查看 Bridge finding 的 source notes、mtime、member changes 和 citations | 不改变任何状态 |
| Ask AI | 询问“为什么这 21 篇 imported notes 被聚合在一起？” | 新 explanation 附在原 Work item，不覆盖 raw finding |
| Draft in Composer | 为 oversized note 创建一个拆分草稿 | 进入 Composer Change Set，尚未修改源文件 |

### 8.2 知识组织与结构决策：直接改变 Peak 状态或准备 Proposal

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Connect notes | 把 21 篇 meeting notes 归入 Research context | 关系已记录，并通过 graph verification |
| Keep separate | 确认六篇 personal notes 不属于 Research | 保存 intentional-separation reason |
| Merge duplicates | 合并两篇重复的 launch notes | 经过 Proposal、Apply 和 re-index |
| Keep both | 两篇内容相似但分别代表计划版与复盘版 | 记录区别，duplicate finding 关闭 |
| Alias duplicates | 保留两篇文件，并把旧标题指向 canonical note | Alias Proposal Apply 后验证链接 |
| Split note | 把 19,000 字研究笔记拆成三个主题文件 | Composer Proposal Apply 后重新索引 |
| Merge Communities | Product strategy 与 Product research 实际属于同一稳定区域 | 新 membership version 发布并验证 |
| Split Community | 一个 Community 包含互不相关的产品决策和用户研究 | 用户确认两个 identity 后发布新版本 |
| Rename Topic / Community | 把 `Misc research` 改为 `User interview evidence` | Peak-owned名称发布；用户文件不变 |

### 8.3 Broken target、Bridge 和 Hub 动作

Broken link 不是“一条 finding 对应一个打开文件按钮”，也不是 Property diff 的 Accept/Reject 复制品。一个 Scan 应形成一个 canonical `Broken-link maintenance` 任务，覆盖本轮全部 unresolved broken references。每个 exact reference 是最终可独立决定的对象，但维护工作允许三级继承：`Target default → File override → exact reference override`。Target choice 可将一个修复方案批量设置给所有匹配引用；File choice 可覆盖一个文件内的匹配引用；展开文件后，单个引用位置可再次覆盖。任何 grouping 都必须读写同一 reference-level decision state，不能复制第二套选择。对上层范围执行批量选择会清除该范围的下层 exceptions；之后新建的下层选择成为显式例外。可选语义是 redirect 到现有 note、创建或恢复缺失目标、移除链接语法但保留文字，或保持 unresolved；歧义 target 必须显式展示 evidence-backed candidates。

若用户已在 Scan Setup 明确允许 deterministic link repair，Peak 可以自动写入完全由 rename receipt、唯一 heading rename 或其他非 AI 证据确定的修复。每次自动修复都必须经过 source revision guard、write receipt、re-index 和 fresh broken-link detector verification，并出现在 `Peak finished automatically`，而不是 Work queue。任何依赖 AI 语义判断、存在多个候选 target 或证据不足的修复仍是 Proposal / owner decision。文件证据在 maintenance task 内由完整 file row 原地展开 line number 与 source excerpt，不再制造独立 `Inspect` action 或 Follow-up。

当前 Mock 的完整评审数据为 63 个 broken references、18 个唯一文件：21 个 deterministic repairs 已自动完成，31 个 references 等待选择 repair method，11 个 ambiguous references 等待 target decision。同一个文件可以出现在多个 Target groups；切换到 File grouping 时必须重排同一 decision state，而不是复制工作项。`All / Needs repair / Needs target / Already repaired` 是同一列表上的 filters；默认 `All` 同时显示 automatic 与 unresolved rows。折叠行只展示 broken target、带名称的影响摘要和 next action。展开行先展示应用于整个 Target 的默认 repair methods，再展示 filename / References / Current choice。点击完整 file row 原地展开一个 file-level choice 和每个 exact line/source excerpt 的 choice control；每条引用都能继承上层或单独选择。path 与 revision 只进入 filename hover metadata，不另设逐行 Inspect。Target、File 和 exact-reference disclosure 必须使用一致的展开状态和动画；Automatic rows 在同一列表中只读展示 receipt，不参与事后选择。

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Create missing target | 为 11 个 `[[Research roadmap]]` 引用创建目标笔记 | 新文件显式创建并 re-index |
| Redirect broken link | 把旧 `[[Research roadmap]]` 指向现有 `[[Research plan]]` | Link Proposal Apply 后无 unresolved target |
| Remove broken link | 确认一个历史链接已经没有意义并移除 | Proposal Apply 后 detector 不再命中 |
| Update Bridge | 补充 Product ↔ Research Bridge 对 14 个 changed sources 的覆盖 | Bridge note Apply 后重新验证 coverage |
| Replace Bridge | 用新的 synthesis note 替换两篇已经失效的 Bridge notes | 新 Bridge verified，旧 Bridge 退役状态已记录 |
| Retire Bridge | 确认两个 Community 不再需要显式 Bridge | Peak 记录 owner decision，相关 warning 关闭 |
| Create Hub | 为一个稳定 Community 创建用户可维护的 Hub note | Materialization Review 和 Apply 完成 |
| Refresh Hub | 更新 Research Hub 对新成员的概览 | Hub source revision Apply 后 freshness 通过 |
| Retire Hub | 一个 Hub 已无稳定成员或被新 Hub 替代 | 退役状态和替代目标记录完成 |

### 8.4 Freshness 与内容生命周期动作

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Revisit | 打开 recent drift 的 Launch cluster 继续收尾 | 用户完成、转存或重新安排后更新状态 |
| Archive | 把已结束的旧项目内容移入用户选择的归档位置 | File Proposal Apply 后重新索引 |
| Reintegrate | 把 abandoned folder 中仍有价值的 Research note 接回当前 Topic | 新关系验证通过 |
| Snooze | 将“Research Hub 需要刷新”延后到下周 | 保存 snoozeUntil；到期或证据变化时重开 |
| Mark intentional | 确认一篇 index note 就是有意保持 orphan | 保存 reason 和 policy scope |
| Dismiss with reason | 误报的 oversized finding 来自生成文件，不需要维护 | 保存 dismissal rule；证据变化时可以重开 |

### 8.5 Machine knowledge 与恢复动作

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Retry | 重新解析三个读取失败的 PDF | 文件变为 Search-ready，或仍失败并更新证据 |
| Exclude | 用户确认加密 PDF 永远不进入 Index | Exclusion policy 持久化，Readiness item 关闭 |
| Regenerate Summary | 42 个 Summary 的 source hash 已过期 | 新 Summary source hash 与当前内容一致 |
| Regenerate AI Tags | 17 个 AI Tags provider calls 失败 | 新 tag set receipt 验证通过 |
| Rebuild vectors | 294 个文件缺少当前版本的 embeddings | vector source hash 与 content hash 一致 |
| Repair parser / setup | OCR provider 未配置，扫描 PDF 无法提取文本 | Setup ready 后 Retry 成功 |
| Resume stopped AI work | 用户停止了 Hub review，但仍希望获得该输出 | 从 checkpoint 继续，或明确 Skip remaining |

这些动作只更新可重建的 Index、运行状态或 exclusion policy，不写 Markdown。用户在 Setup 或 Progress 中主动关闭某个可选 AI operation，本身不会自动制造 Follow-up；只有当用户仍然期望对应输出、并且存在明确恢复动作时才进入队列。

### 8.6 Peak-owned generated knowledge 动作

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Publish | 发布新的 Research Community 描述 | 新 version 成为 Vault map 当前文案 |
| Try another | 当前 Topic label 太泛，要求模型生成另一版 | 新候选出现，原候选保留在版本记录中 |
| Keep old | 新 Hub 描述没有更准确，保留旧文案 | 新候选被拒绝，旧 version 保持当前 |

这三种动作只改变 Peak-owned 可见知识，不改变 Community membership，也不修改用户文件。

### 8.7 User-file Proposal 动作

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Review diff | 查看 12 个 Research frontmatter candidates 的 before / after | 每个 candidate 得到 Review 状态 |
| Edit candidate | 把建议的 `status: active` 改为 `status: paused` | 编辑后的 candidate 重新通过 schema 检查 |
| Apply selected | 只批准 11 个无冲突文件 | Source guard 通过后写入，并生成 receipt |
| Reject proposal | 拒绝把 AI Tags 写入用户 YAML | Proposal 关闭，用户文件保持不变 |
| Resolve source conflict | 一个文件在 Review 期间被编辑 | Rebuild candidate、Keep source 或 Remove candidate |

所有用户文件修改都遵守：

```text
Evidence
  → Candidate
  → Diff review
  → Source / revision guard
  → Explicit Apply
  → Re-index
  → Verify
```

### 8.8 验证与重新打开

| 动作 | 具体例子 | 退出条件 |
|---|---|---|
| Mark fixed | 用户在 Obsidian 中手动修复 broken links | 状态进入 Verification pending，不直接 Resolved |
| Re-run verification | 重新运行 broken-link detector 和受影响 Index 检查 | Finding 消失后 Resolved；仍存在则 Reopened |
| Reopen | 新 Scan 发现已关闭 Bridge 又失去 coverage | 保留旧决策历史，附上新证据重新进入队列 |

`Mark fixed` 只是用户声明，不是验证结果。Peak 只有拿到新的 detector、Index 或 source evidence，才能把事项标为 Resolved。

## 9. Work item 最小用户合同

每个 Work item 的默认行必须让用户快速看到：

- 需要决定或处理什么；
- 为什么 Peak 不能自己完成；
- 影响多少文件、关系或知识对象；
- 当前最合适的主动作。

展开后必须补全：

- Peak 已经完成的部分；
- 证据、来源和 observation time；
- AI 是否参与，以及对应 model、provider、tokens 和费用；
- 可选动作和每个动作的影响；
- 是否会修改用户文件；
- owner surface 和稳定返回点；
- exit condition 和 verification state；
- source revision、staleness 和 originating Scan。

## 10. 跨 Scan 去重与生命周期

```text
Open
  → Acknowledged / Snoozed / Dismissed / Marked intentional
  → Proposal ready（需要文件修改时）
  → Applied / No change / Rejected
  → Verification pending
  → Resolved
  → Reopened（新证据或 scope 变化）
```

同一个问题使用稳定 identity 更新原 Work item：

- 同类证据增加时更新 affected count 和 evidence revision；
- source 变化时标记 Needs re-review；
- Scan 验证问题消失时关闭；
- 用户选择不处理时记录 reason 和 policy scope；
- 新证据超出旧 dismissal scope 时重新打开。

<a id="scan-maintenance-review-shared-rules"></a>

## 11. Scan maintenance review 的共享规则

本节用于约束后续所有 Scan item 的设计与实现。它不要求每个事项长得一样，也不把 Property 的 Accept/Reject 或 Broken link 的 repair menu 当成通用 UI。共享的是底层真值和流程边界。每个维护能力仍然保留自己的动词、结果和验证方法。

### 11.1 先定义真值，再画界面

每个 maintenance task 必须先回答下面五个问题：

| 问题 | 必须给出的答案 |
|---|---|
| 最小可独立处理对象是什么？ | 一条 Property change、一个 exact broken reference、一个 Community candidate 等 |
| 它的稳定 identity 是什么？ | 必须足以跨分组、跨 Scan 和跨 suggestion revision 去重 |
| 哪些只是视图？ | Batch / File、Target / File 等只能重新排列同一 canonical set |
| 用户到底能选什么？ | 二元 Accept/Reject、多结果 repair、文本 Publish、Retry 等领域动作 |
| 什么才算完成？ | Apply、re-index、detector/schema check、provider retry 或其他可验证退出条件 |

如果这五个答案还不清楚，不先增加任何界面结构。界面不能替数据模型猜测对象边界。

### 11.2 当前 owner choice 是界面真值

File Property、Broken link 与 Community membership 三轮设计反复暴露的不是三个孤立的视觉问题，而是前一版规则少了一条状态优先级。此前已经记录了 canonical set、分组投影、层级作用域和领域动作，却没有规定“用户做出选择以后，界面上的标题、解释、数量和动作应该听谁的”。因此实现可以形式上使用同一个列表和下拉菜单，语义上仍继续展示已经被 owner 覆盖的 Peak suggestion。

| 迭代 | 当时学到的规则 | 当时仍漏掉的约束 | 造成的返工 |
|---|---|---|---|
| File Property | 一份 canonical change set；Batch / File 只是投影；多层 Accept / Reject 写回同一状态 | 没有把 owner-edited value 和后续 suggestion revision 的优先级写成渲染合同 | 控件和数量可以同步，但自定义值、冲突与重新建议仍容易退回通用状态文案 |
| Broken link | Target default → File override → exact-reference override；结果必须生成领域正确的 diff | 没有禁止把 inheritance、status 和内部 resolution 名称重复渲染成多列、多行小字 | 出现 `Uses target choice`、重复 status、无价值 locations 和同义说明 |
| Community membership | 同类 Decide finding 聚合；Suggested Community / File 共享同一 decision state | 没有明确 owner override / reject 后旧 suggestion 只能退到 history；也没有把用户可识别的领域名词设为 gate | 仍出现模糊 `Context`、旧 `Why Product Research`、卡片式第二套选择和缺少 Reject 的路径 |

开放 review 中的渲染优先级固定为：

```text
Current owner choice
  > current Peak suggestion
  > historical suggestion and evidence
```

写入完成后，`Applied / Verified result` 成为新的可见真值；owner choice 与 Peak suggestion 转为可追溯历史。任何层级、投影、筛选或展开区都必须遵守同一优先级，不能在 note row 显示 owner choice、却在下方解释区继续把旧 suggestion 写成当前结论。

| Atomic state | 主路径应该显示 | 解释区应该显示 | 数量如何变化 | 禁止显示 |
|---|---|---|---|---|
| 尚无 owner choice | `Suggested: Research` 或领域等价文案 | `Why Research` 与必要证据摘要 | 保持 pending | 把 suggestion 写成已决定事实 |
| 接受 suggestion | `Research`，并明确这是当前选择 | 可以继续显示 `Why Research` | pending 减少，selected / ready 增加 | 额外再加一个 accepted 状态列或 badge |
| Owner override | `Changed to Project Launch` 或当前领域结果 | 为什么当前 owner choice 覆盖原建议；原建议只在 history / evidence 中可查 | 原子对象只计入当前选择一次 | 继续使用 `Why Research` 作为当前标题 |
| Reject / no membership | `No Community` 或领域中的真实拒绝结果 | 拒绝影响与必要边界 | pending 减少，rejected / decided 增加 | 继续把被拒绝 suggestion 高亮为推荐结论 |
| Suggestion 已重算 | owner choice 不变；无 owner choice 的对象显示新 suggestion | changed / unchanged、instruction 和 suggestion diff | 不改变 owner-decision count；必要时增加 needs reconfirmation | 用新 suggestion 静默覆盖 owner choice |
| Applied / Verified | 实际写入或 Peak-owned state 的 verified result | receipt、verification 与失败范围按需查看 | 从 review 移出或进入 verified filter | 仍以 proposal / suggestion 语气描述已完成结果 |

顶部 summary、group state、row treatment、解释标题、CTA 与最终 change set 必须由同一 atomic state 派生。这不是 copy guideline，而是状态模型与渲染器共同遵守的不变量。

### 11.3 一份 canonical set，多种可替换视图

- 一个 task 只拥有一份 canonical atomic items；所有选择和状态都写回这份集合。
- Group by、Show、sort、search 和 collapse 只改变阅读方式，不能复制、重置或重新计数对象。
- 同一个原子对象可以出现在不同 projection 中，但必须使用同一 identity 和同一 decision state。
- Group、File 和 exact item 都是可见作用域，不是新的 Work item。
- 顶部 summary、filter count、group count 和主按钮数量必须从 canonical state 实时派生，不能维护第二份演示数字。

同一种可重复出现的 Decide finding 也必须先聚合成一个维护任务，不能按对象生成大量单例 Work items。一个 Scan 找到九篇 Community membership 不确定的 notes，应生成一个 `Community membership` task 和九个 canonical note decisions；Property、broken link、Hub 或其他领域同理。只有对象之间没有共同决策语义、共同 owner surface、共同生命周期或可共享的 canonical set 时，才拆成不同任务。证据的 one-hop / two-hop、citation、similarity 或 history 只是某个 atomic decision 的 evidence layers，不是新的任务、分组或主要导航。

共享状态链如下。不是所有领域都需要 AI suggestion，但任何用户文件写入都不能跳过后半段：

```text
Observed evidence
  → Peak suggestion（可重算、可解释，不是用户决定）
  → Owner choice（可修改，尚未写文件）
  → Final change set（合并冲突与文件级 diff）
  → Explicit Apply（source-revision guard）
  → Re-index / fresh verification
  → Resolved 或部分失败后继续留在 Work queue
```

确定性自动修复可以在 Setup 预授权后跳过 suggestion 与 owner choice，但仍必须保留 revision guard、write receipt、re-index 和 fresh verification。它在 review 中是只读完成结果，不能伪装成待选建议。

### 11.4 信息按语义层级展开

| 层级 | 默认回答什么 | 不应出现什么 |
|---|---|---|
| Task header | 还剩什么、用户现在要做什么 | 重复标题、大段 policy 文案、四格静态 dashboard |
| Collapsed row | 对象、具名影响数量、当前选择或下一步 | 无名双数字、重复类型 badge、第二行解释全文 |
| Expanded group / file | 这一作用域有哪些对象和统一动作 | 把 header 里的数量和状态原样再写一次 |
| Atomic item | 原始内容、建议或候选、用户选择、必要证据 | 每行重复 path、revision、来源和通用免责声明 |

具体规则：

- Task header 使用一个标题区；摘要只写一行，并随当前 choice state 实时变化。
- Group by 与 Show 是左侧同级 view controls；全局 mutation 放在右侧，但只有存在真实全局动作时才出现。
- Collapsed row 必须能独立读懂；数量必须命名为 files、references、changes 等真实对象。
- 完整 header row 负责折叠和展开；行内输入、菜单和动作按钮必须隔离事件。
- 展开必须进入下一层具体对象或证据，不能只把同一句话变长。
- Revision、rule、model、provider、token、cost 和 receipts 默认按需查看；只有它们直接改变当前决定时才进入主路径。
- 不用颜色、badge、状态列和按钮四次表达同一个状态。当前选择本身就是主要反馈。

用户可见名词必须通过领域名词检查：标题、列名、菜单和结果先使用用户能直接指认的对象，例如 File、Folder、Property、Community、broken target、Bridge 或 Hub。只有产品真的在维护一种跨对象且没有更准确名称的语义边界时才使用 `Context`；如果动作实际改变 Community membership，就必须写 Community，而不是让用户猜 `Context` 是 Folder、Community、Topic 还是一组证据。

每一行 secondary copy 只能在满足下面至少一项时保留：

- 区分两个看起来相似但后果不同的选择；
- 解释当前证据、置信度或为什么仍需 owner 判断；
- 说明是否写用户文件、可逆性或 Apply / Verify 边界；
- 说明 conflict、stale、partial failure 或其他 blocker。

如果小字只改写标题、重复作用范围、重复数量、重复当前状态，或说出用户从 action 本身已经知道的事实，就删除它。不能依赖 10–11px caption 承担关键产品语义。

### 11.5 列、菜单和响应式必须表达同一结构

- Header 与 body 使用同一列 grid；一个 column header 只能对应一个数据列。`Affected` 可以在一个 cell 内写 `24 references · 7 files`，不能暗中横跨两个无名数字列。
- Title / object 列优先获得剩余空间；数量列使用可预测宽度；Resolution 必须容纳完整 outcome。只要容器仍有空白，就不能先截断 outcome 或让按钮挤成两行。
- Status 只有在它提供独立信息时才成为一列。`Repaired · verified`、`Choose target` 或当前 repair 本身已经是 Resolution，不再另加 status badge。
- 窄宽度先把次要 provenance、revision 和说明移入展开内容，再让主对象、具名数量和当前 choice 换行；不能让单个 `Set all`、count label 或 action 自己断成两行。
- Resolution menu 的第一行把领域动词和具体结果合在一起，例如 `Redirect  Research plan`；短解释可以放第二行。Recommended 只是行尾的轻量提示，不是 outcome 名称、独立状态列或带重边框的按钮。
- 菜单、header 和 atomic rows 使用同一 action 语言；不能在上层写 `Choose repair`、下一层写 `Uses target choice`、底层又换成另一套内部术语。
- 设计宽屏时必须真正使用可用空间；设计窄屏时必须有明确的信息降级顺序。响应式不是简单缩短列宽和增加 ellipsis。

### 11.6 父级动作必须有真实作用域

只有 canonical atomic items 确实可独立处理时，才提供 task / group / file / item 级动作。

- 二元选择领域可以提供 Accept/Reject；父级动作批量写入子项 decision state，之后父级根据子项显示 all、mixed、pending 或 conflict。
- 多结果领域使用 default 与 override：上层选择设置统一默认，下层选择形成明确例外。
- 父级动作必须放在父级 header 内，不增加一条“Apply to all items in this group”的重复行。
- 执行父级动作时，产品必须明确是保留既有 exceptions，还是让整个范围重新一致；不能隐式猜测。
- Bulk Accept 必须跳过不能安全批量处理的 conflict；Bulk Reject 或 Leave unresolved 可以覆盖的范围必须在领域合同中明确。
- AI 调用、只读 inspect、单一恢复命令和 receipt review 不制造虚假的 item/group/all 批量动作。

### 11.7 用户可以纠正 Peak 的 suggestion

Suggestion 不是事实，也不是用户决定。任何由规则或 AI 生成的维护建议，都必须允许 owner 表达新的约束并批量重新计算建议。

标准交互是一个自然语言输入和一个明确的 `Update suggestions` 动作。它作用于当前 task 中所有尚未 Apply 的 reviewable atomic items，包括已有 owner choice 但还未写入的对象；automatic verified items 不被改写。

重新计算必须遵守以下合同：

- 使用当前 source revision、原 evidence、用户 instruction 和现有 suggestion revision；
- 只更新 suggestion，不静默修改 Accept/Reject、repair choice 或其他 owner decision；
- suggestion 在已有 choice 下面发生变化时，将该项标为需要重新确认，而不是替用户换选择；
- 只有推荐内容真的变化时才显示 updated suggestion；无变化时返回 checked / changed / unchanged 和原因；
- 历史记录保留用户 instruction、影响范围、changed / unchanged 数量和 suggestion diff；
- provider、model、tokens 和实际费用进入可展开 receipt/history，不在输入框旁常驻一个局部模型选择器；model route 继承 Scan Setup / Settings，若本 task 没有预授权或预估费用发生实质变化，则先进入统一的紧凑 AI preflight；
- 点击 Update suggestions 只触发一次受控 AI/规则运行，不执行 Apply；
- 用户可以回看或恢复上一 suggestion revision，已保存的 owner decisions 不随 projection 切换丢失。

### 11.8 新 Scan item 的设计检查

在修改 Mock 或生产 UI 前，先完成这份检查；任何一项答不出来都说明对象合同还没有设计完。

| 检查 | 验收问题 |
|---|---|
| Canonical atom | 最小对象能否被独立选择、去重、恢复和验证？ |
| Identity | 同一问题再次 Scan 时会更新原对象，还是错误地复制一份？ |
| Projection | 切换分组后，数量、选择和 scroll context 是否保持？ |
| Scope action | Task、group、file 和 item 动作分别会修改哪些 atoms？ |
| Domain outcomes | 动词是否来自真实领域，而不是统一套用 Accept/Reject？ |
| Owner truth | owner override / reject 后，标题、解释、数量和 CTA 是否都停止把旧 suggestion 当成当前结论？ |
| Domain noun | 用户是否无需理解内部模型就能说出这里在维护 File、Property、Community、link、Bridge 还是其他对象？ |
| Copy value | 每一条 secondary copy 是否至少解释选择差异、证据、后果或 blocker 之一？ |
| Semantic zoom | 每次展开是否展示下一层新信息？ |
| Live summary | 顶部数字和 CTA 是否完全由当前 canonical state 派生？ |
| Suggestion correction | 用户能否修改约束、重算建议并查看差异？ |
| Write boundary | suggestion、choice、Apply 和 verified 是否清楚分开？ |
| Recovery | stale、conflict、partial failure 和 reopen 是否只影响相关 atoms？ |

### 11.9 每个领域先填写同一张适配卡

```text
Task:
Canonical atomic item:
Stable identity:
Interchangeable views:
Visible scope levels:
User outcomes:
Owner-choice precedence and rejection outcome:
Safe automatic path:
Suggestion correction scope:
Final diff / result:
Apply boundary:
Verification and reopen:
```

适配卡是开始 UI 设计前的 gate。它不是新的产品术语，也不进入用户界面；它用于让产品、设计和实现对同一对象合同达成一致。

### 11.10 Property、Broken link 与 Community membership 的领域适配

| 合同 | File Property | Broken link | Community membership |
|---|---|---|---|
| Atomic item | 一个文件 revision 上的一条 Property operation | 一个文件精确位置上的 broken reference | 一个 note identity / membership-evidence revision 上的 Community membership decision |
| 可替换视图 | Batch / File | Target / File | Suggested Community / File |
| 父级作用域 | All / Batch / visible File / change | Target default / File override / exact reference override | Accept all / Reject all suggestions / suggested-Community group / note override |
| 用户动作 | Accept、Reject、Edit proposed value、Resolve conflict | Redirect、Create or restore target、Remove link、Leave unresolved | Use suggested Community、Choose another Community、No Community |
| 自动完成 | 默认不自动写 frontmatter | Setup 预授权的确定性 rename / heading repair | 不自动替 owner 决定知识归属 |
| 最终验证 | combined frontmatter diff、re-index、schema check | combined Markdown diff、re-index、fresh broken-link detector | Peak-owned Community membership 更新、重新计算受影响的 Community projection；source-file edits 另走 Proposal |

`Community membership` 拥有本轮全部 Community 归属不确定 notes，而不是为每篇 note 创建一个 `Decide where … belongs`。稳定 identity 至少包含 note identity、source revision 和 membership-evidence revision；同一 note 在新 Scan 中更新原 decision，不复制 Work item。Collapsed group 只显示建议 Community、note count 和 evidence-signal count；note row 明确突出 filename、evidence count 和 current choice。真正的选择控件始终在当前 scope 的原行：Community group 与 note row 使用同一套下拉菜单，选项为接受当前 Community suggestion、选择另一个 Community 或 `No Community`；group choice 写入同一组 note decisions，任意 note 可以再覆盖。Dropdown 每项只用一行展示 action + Community name；若小字只是改写 action 或重复作用范围，就必须删除。顶部必须同时提供 `Accept all / Reject all`，其中 Reject 明确表示拒绝当前 suggestions 并让 notes 保持在 Communities 之外，不能只有 Accept。展开说明必须由当前 decision 驱动：未覆盖或接受建议时显示 `Why <suggested Community>`；owner 改选后显示 `Changed to <chosen Community>` 并说明它覆盖了原建议；拒绝后显示 `No Community`。不得继续用已被覆盖的 suggestion 作为当前标题或解释。详细 one-hop / two-hop、citation、similarity 或 history 通过 `Open evidence in File Atlas` 按需查看，不能在主决策面堆 evidence cards、choice cards 或 outcome buttons。该任务只能改变 Peak-owned Community membership；移动 Folder 或修改 Markdown、frontmatter、Wikilink 必须进入独立 user-file Proposal。

这个规则推广到所有 suggestion-driven canonical sets：同一领域的 all / group / file / item 层级必须复用同一种 choice control、同一组领域结果和同一 decision state。展开只负责 semantic zoom，不得偷偷切换交互语法。若拒绝 suggestion 对应一个合法领域结果，bulk surface 必须提供对称的 Reject；若领域不是二元接受/拒绝，则直接使用真实结果名称，而不是隐藏拒绝路径或把多结果卡片塞进 evidence 区。

自然语言 guidance 对这个 task 内全部尚未写入的 Community suggestions 重新计算。已有 owner decisions 不被覆盖；如果 suggestion 改变，则只把相关 note 标成需要重新确认。保存决定只更新 Peak-owned Community membership / typed relationship；任何需要写 Markdown、frontmatter 或 Wikilink 的动作必须生成独立 Proposal。新 link、source evidence 或 owner policy 使结论失效时，只 reopen 受影响的 note decisions。

这张表只定义适配差异。其他 Scan item 也必须先完成上面的领域适配卡，再开始复用共享 UI 与 AI follow-up 组件。

### 11.11 跨领域回归场景

下面这些场景是修改 Mock 或生产实现前的最低回归集。它们验证的不是截图相似度，而是同一个对象在状态变化、投影切换和建议重算后仍然保持正确语义。

| 场景 | 必须成立的结果 |
|---|---|
| Property：在 Batch 视图接受一条 change，切到 File 视图后编辑 proposed value | 仍是同一个 atomic operation；File 视图显示 owner-edited value，accepted / pending 数量实时更新，原 suggestion 只作为 provenance |
| Broken link：设置 Target default，再覆盖一个 File，最后覆盖一个 exact reference | 三层使用同一 exact-reference state；每个位置生成与当前 repair 对应的真实 diff；切到 File 视图不丢 exception，也不重复计数 |
| Community：Peak 建议 Product Research，owner 把一篇 note 改为 Research，并把另一篇设为 No Community | group 变为 mixed；两篇 note 分别显示 `Changed to Research` 与 `No Community`；旧 `Why Product Research` 只能从 history / evidence 查到 |
| Bulk action 后再做局部 override | 父级显示 all / mixed / pending 的真实聚合状态；局部对象只计数一次；是否清除旧 exception 符合该领域合同 |
| 输入 owner guidance 并 Update suggestions | 只重算未 Apply suggestions；owner choices 保留；建议变化的已选择对象进入 needs reconfirmation，summary 不把它们误算为 pending 或 applied |
| Source revision 只改变一个对象 | 只有相关 atomic item 进入 stale / scoped refresh；其他 decisions、分组、checkpoint 和 counts 保持 |
| 查看 automatic verified items | 它们与 reviewable items 处于同一 canonical list / filter 体系，但只读、带 receipt，且不被 Update suggestions 或 bulk review action 改写 |

以上场景必须同时检查标题、当前 choice、展开解释、summary、CTA 和最终 diff / result。只验证其中一个控件变色，不算通过。

### 11.12 后续 Scan item 的评审顺序

后续不再把视觉修改与对象、动作修改混在一起。每个 item 按下面顺序通过评审，上一层没有稳定前不进入下一层：

1. **对象评审**：锁定 task、canonical atom、identity、去重和跨 Scan 更新。
2. **信息评审**：锁定 collapsed row、expanded levels、具名数量和按需 evidence。
3. **动作评审**：锁定每个作用域的领域结果、bulk / default / override 语义和 conflict。
4. **建议评审**：锁定规则或 AI suggestion、owner correction、history 和 decision preservation。
5. **写入评审**：锁定 combined diff、Apply、revision guard、partial failure、Verify 和 Reopen。
6. **场景验证**：先运行 §11.11 的 owner override、reject、recompute、projection switch、stale 与 automatic-result 场景。
7. **视觉评审**：最后处理列宽、间距、折叠动画、active treatment、menu 和 responsive behavior。
8. **不变量验证**：切换 projection、filter、collapse 和 suggestion revision，确认 identity、choice、explanation、count、CTA、scroll context 和 write boundary 均不变化。

这样复用的是已经确认的产品合同，而不是上一张截图的 CSS。视觉问题仍然需要修，但不会再靠视觉反复暴露更底层的对象与状态错误。

<a id="file-property-review-contract"></a>

## 12. File Property 还需要补齐的合同

当前 Mock 已经确认一份 canonical suggestion set、Batch / File 两种投影、Git-style 连续 diff 和多层 Accept/Reject。它仍然缺少下面这些真实维护能力；没有这些能力，Property review 只能评审演示数据，不能完整承载大规模 frontmatter 维护。

| 缺口 | 必须补齐的行为 |
|---|---|
| Canonical collision | identity 至少包含 file identity、source revision 和 property key；多个 Batch 命中同一 Property 时合并 evidence，候选不一致时形成一个 conflict，不能生成两条都可接受的写入 |
| Operation 类型 | 支持 add、replace、remove、rename key、merge/split multi-value；每种操作都生成正确 frontmatter diff |
| Owner 自定义值 | 单条建议除 Accept/Reject 外可以 Edit proposed value；自定义值成为 owner-edited proposal，仍需最终 Apply |
| 值与 schema 校验 | 校验 scalar / array 类型、允许值、空值、YAML 表达和 Vault policy；无效自定义值不能进入 Change Set |
| Evidence 按需查看 | File 或 change 原地展开 why、rule / AI provenance、source citation 和 confidence；默认行不重复小字 |
| Conflict resolution | 同屏比较 current、Peak candidate、其他 candidate 和 custom value，并支持 defer；Bulk Accept 继续跳过 conflict |
| Suggestion correction | 复用上节 AI/规则 follow-up，按 owner instruction 批量更新所有未 Apply 建议，并保留原 choices 与 revision history |
| Partial staleness | 文件变化时只让受影响的 suggestions stale；其他文件的 decisions 和 checkpoint 继续有效，支持 scoped regenerate / rebase |
| Final combined diff | Review selected changes 按文件展示最终合并 frontmatter，而不是只重复原子行；检测同文件写入碰撞和 source revision mismatch |
| Apply 与 Verify | 输出 applied、skipped、stale、failed 和 verified 数量；显式 Apply 后 re-index，并重新执行 Property schema / detector 检查 |

Property 的 canonical atom 不是“来自某个 Batch 的一行”，而是“某个 source revision 上准备对某个 Property 执行的一次操作”。Batch 只记录为什么这些操作可以一起 review；同一 atom 可以带多个 evidence sources，但只能拥有一个最终 choice 和一个写入结果。

建议的原子状态至少覆盖：

- Pending：还没有 owner choice；
- Accepted / Rejected：owner 已决定，但尚未写入；
- Edited：owner 修改了 proposed value；
- Conflict：存在相互冲突的候选或 current evidence；
- Stale：source revision 已变化，需要 scoped refresh；
- Applied / Verified：写入已完成，并通过重新索引与检查。

这些状态用于 filter、恢复和最终结果，不要求在每一行重复渲染 badge。普通行仍优先由 active action、row treatment 和 diff 表达决定；只有 Conflict、Stale 和 Apply failure 这类会阻止下一步的状态需要显式警告。

Property 与 machine-only AI Tags 必须继续分开：AI Tags 是可重建的 Peak-owned Index knowledge，可以在已授权 Scan 中自动更新；Property Proposal 将改写用户 frontmatter，必须经过 owner choice、combined diff、explicit Apply 和 verification。

## 13. 当前 Mock 与真实能力边界

[V2 Completed Mock](../../gstack/vault-intelligence-workspace-2026-08-12-v2/index.html#completed) 为了完整的 owner 设计评审，直接在 `Peak finished automatically` 之后把全部 48 个合成 Follow-up 按普通结果行从上到下连续排列。动作族只作为行内来源 badge，不形成分组容器。每项都展示具体场景、预期结果、owner surface、影响、证据、状态变化和写入边界；右侧主动作路由到六种真实交互之一：精确恢复 saved review、只读 inspect、AI setup → progress / actual usage → result、真正的用户决策、scoped recovery / verification setup → progress → result、逐文件 Proposal workspace。只有真正的用户决策可以使用 `Choose outcome` 和 outcome cards，其他动作必须直接进入自己的工作界面。所有路径都必须产生与本动作匹配的状态转移和结果数据，包括实际处理对象、数量、成功或失败、剩余 blocker、receipt，以及 AI 操作的模型、token 和费用。统一的 `ready`、`selected` 或空泛“路径已选择”不算动作结果。结果区域还必须呈现该动作真正操作或检查的对象：文件/行号表、diff、AI answer + citation、Graph/Community/Bridge 变化、parser/provider log、batch、write receipt 或 verification detail。只有摘要和 metric chip 不满足合同。Mock 不再提供额外 Action catalog、右下角入口或单项预览器。

Property Review 确认的交互原则适用于所有 Follow-up，但动作语义不得被 Property 模式污染。Completed 的完整事项行必须可点击并支持 Enter/Space；列表使用稳定的 `Follow-up / Affected / Next action` 三列。Title 必须独立表达任务，不能依赖第二行解释；Affected 每行只展示一种用户真正要处理的主对象数量，例如 files、notes、nodes、Communities、PDFs 或 Hubs。第二个数量只有在决定任务含义时才进入 Title，否则进入详情，不能在同一个列标题下制造两个无名数据列。family、provenance、ID、impact、boundary、Evidence 摘要和说明句不得重复铺在结果行。完整上下文留给详情。任务工作面只允许一个主标题区；通用 Modal chrome 不得与工作面内容连续重复同一任务类型和标题。进入任何任务后，第一组主指标先回答本次处理多少对象、变化、证据、费用或恢复范围；任何承载对象集合的区块都由完整 header row 折叠/展开，header 内动作控件不得触发折叠。AI setup、只读 inspect、产品决策、scoped recovery、verification 和 Proposal 使用各自真实的动词、状态与结果，不得统一伪装为 Choose outcome 或 Accept/Reject。只有 canonical set 中每个对象确实可独立选择时，才提供 item/group/all 级批量选择；AI 调用、只读证据和单一恢复命令不制造无意义的 bulk action。

Property Follow-up 必须由一个属性维护任务拥有一组 canonical suggestions，不能按文件或 Property 炸成大量 Work queue 事项。`Batch` 与 `File` 是同一建议集合上的可切换分组投影，而不是两个不同工作流或必须逐层进入的导航：Batch 依据维护目的、证据来源与可信度、风险、owner surface、写入边界和验证路径组织；File 把同一文件来自一个或多个 Batch 的所有变化集中显示。Property 名完全相同既不是 Batch 分组的必要条件，也不是充分条件。切换分组不得复制、重置或重复计算建议。

界面必须像多文件 diff 一样从上到下展示全部变化，并在 Batch、当前视图中的 File group、单条 Property change 三个粒度提供统一文案的 Accept/Reject。`Group by` 与 `Show` 是同级 view controls，必须并排放在左侧；`Accept all / Reject all` 是全局 mutation selection，单独放在右侧。Batch header 必须把 file count 与 change count 提升成独立主指标；File header 必须突出 change count，并在跨 Batch 时突出 batch count，不能将这些关键数量埋进辅助说明。Revision 只在 File header 层展示一次；Property change 行只展示 Property、current value、suggested value 和 Accept/Reject，不逐行重复 Revision 或 evidence 说明。按 File 分组时，只有来源 Batch 需要以紧凑标记留在行内。Batch 和 File 的完整 header row 都可点击或通过 Enter/Space 折叠；行内 Accept/Reject 必须隔离点击，不能顺带触发折叠。折叠只改变阅读密度，不改变 canonical suggestion 或 decision state。普通行由 active Accept/Reject 按钮表达状态，不重复显示 accepted/rejected/pending badge；conflict 仍需显式标记。决定状态必须具备至少三层一致反馈：选中 action 使用实色，change row 使用对应 tint 与左侧 rail，proposed value 使用 accepted/rejected treatment；未选中的反向 action 降级但仍可切换，所有 action 同步 `aria-pressed`。所有操作更新同一 decision state；Group by Batch 中接受一个文件只影响该 Batch 下可见的变化，Group by File 中接受一个文件影响该文件跨 Batch 的全部可见变化。`Accept all` 作用于 canonical set 内所有非冲突建议，`Reject all` 作用于全部建议并可安全拒绝 conflict；所有 Bulk Accept 都必须跳过 conflict，冲突只能逐条确认或拒绝。Accept/Reject 只准备最终 Change Set，不能绕过最终 combined diff、显式 Apply、source-revision guard、re-index 和 verification。

继续 review 时必须恢复 task、当前 Group by 模式、filter、collapsed groups、scroll anchor、所有 Accept/Reject 状态、source revision 和原文件位置。当前 Mock 有 43 条 canonical changes、28 个唯一文件；`Customer interview 07.md` 的 `type / source / status` 分别来自三个 Batch，在 File 视图中合并、在 Batch 视图中分开，但始终是同三条 suggestion。恢复 checkpoint 只恢复上下文，不执行 Apply。

这 48 项是故意穷举的评审数据集，不代表一次真实 Scan 通常会产生 48 个待办。生产流程仍然只物化当前运行有证据支持、需要 owner 介入且有可验证退出条件的事项。

Mock 用于确认信息层级、动作语言和交互边界。它不证明以下能力已经真实实现：

- Scan runtime 和跨阶段 checkpoint；
- provider receipt-backed token / cost accounting；
- Follow-up materialization 和跨 Scan 去重；
- Proposal Apply 与 write verification；
- AI-assisted semantic detector；
- 完整动作注册表中的所有 owner-surface handoff。

## 14. 不要这样实现

- 不把十种来源做成十张 Completed 分类卡；
- 不把五个 action filter 当成固定结果 taxonomy；
- 不把成功的 Search、Summary、AI Tags 或 graph refresh 伪装成待办；
- 不把用户主动关闭的可选 AI operation 自动变成错误；
- 不让 AI explanation 覆盖 raw finding；
- 不让 Scan、AI Review 或 Work queue 直接静默修改 Markdown；
- 不用 `Mark fixed` 绕过重新验证；
- 不让每次 Scan 为同一个问题新增重复 Work item。
- 不把 Property 的 Accept/Reject 机械复制给多结果 repair、AI 或只读检查；
- 不让 Update suggestions 覆盖 owner 已保存的 choice；
- 不让不同 Batch 为同一文件、同一 Property 生成可同时 Apply 的重复写入；
- 不在 canonical state 之外维护不会随选择更新的 summary 数字。

## 15. 相关文档

- [Vault Intelligence 功能正稿](../../13-feature-vault-intelligence.html)
- [Vault Intelligence Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md)
- [Work queue 与 Findings 设计](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md)
- [Scan Vault 与 Runs 设计](./2026-08-12-vault-intelligence-scan-and-runs-design.md)
- [AI Review 与 Proposal 设计](./2026-08-12-vault-intelligence-ai-review-and-proposal-design.md)
- [V2 Mock README](../../gstack/vault-intelligence-workspace-2026-08-12-v2/README.md)
- [V2 Scan continuation handoff](../../gstack/vault-intelligence-workspace-2026-08-12-v2/continuation-handoff.md)
