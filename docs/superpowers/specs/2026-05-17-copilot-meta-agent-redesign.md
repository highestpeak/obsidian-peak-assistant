# Copilot Auto Review — Meta-Agent Redesign

> Date: 2026-05-17
> Status: Approved (all decisions resolved)
> Owner: highestpeak
> Replaces: planner-driven `consumeCapabilityRun` flow in `src/ui/view/copilot/CopilotAutoRunModal.tsx`

## Problem Statement

当前 Auto Review 流程在使用中暴露三类问题，截图与对话记录见 2026-05-17 会话。

### P1. 架构层面：agent-per-capability 与 agent-driven 理念冲突

`planCopilotAutoRun` 用硬编码规则（孤立笔记、字数、链接数等）挑选若干 `PlannedCapability`，然后 `CopilotAutoRunContent` 顺序为每个 capability 启动一次独立的 `buildCopilotAgentStream`（独立 SDK query、独立 system prompt、独立 maxTurns=20）。

副作用：

- **上下文不共享**：Review Article 不知道 Suggest Links 已经读过哪些笔记，重复 read/grep。一次 Auto Review 实测产生 26 个 trace step、3 次 `Selected intent`。
- **选 capability 是规则而不是 agent 决定**，跟"all agent-driven"的总体方向相反。
- **串行 N 个 agent loop 慢**，token 成本叠加，maxTurns 频繁触发。

### P2. 数据模型层面：Changes / Sources / Chat 永远为空

`CopilotArtifactAdapter.actionResultToArtifacts` 的逻辑：

- `result.type === 'stream'` 时只有 actionId 命中 `streamAsChangeAction` 白名单（polish / format-polish / translate / rewrite-selection 等改写型）才产 `type: 'change'`；否则一律转 `insight`。
- `result.type === 'structured'` 时只有 `data?.evidence` 才走 `evidenceArtifacts` 产 source；其余分析型 capability（Suggest Links / Review Article / Check Task List 等）不会产 source。
- Chat tab 是占位 UI，从未接 agent。

结论：当前 Auto Review 默认选中的 capability 在数据模型上**就不可能**输出 changes / sources / chat。Tab 上的 0 不是 bug，是设计缺失。

### P3. UI 层面：trace 过长且无结构

- 26 个 trace step 平铺，缺乏"哪几个 read 是为哪个产出服务的"分组。
- 切到 Trace tab 时左侧还有缩略 rail（已在 2026-05-17 修复）。
- 工具名截断（已修复）。

P3 的折叠诉求其实是 P1 的症状：架构改了之后 step 数会大幅减少，折叠规则也才有清晰锚点。

---

## Decision Record

| 决策点 | 选项 | 结论 |
|---|---|---|
| Capability 抽象 | A1 嵌套 agent / A2 单次 LLM prompt / **A3 取消中间层** | **A3**：删 capability 中间层，meta-agent 直接产 artifact |
| Plan 形态 | B1 显式 `submit_plan` 工具 / **B2 隐式 plan + `note_finding` 轻量工具** | **B2** |
| Fast vs Complete 区分 | C1 不同 prompt + maxTurns / C2 不同 capability 白名单 | **C1**：单一 system prompt + mode flag + maxTurns 上限 |
| Planner 命运 | D1 删除 / **D2 保留信号收集，不再选 capability** | **D2**：planner 退化为"文档体检报告"，喂给 meta-agent prompt |
| Artifact 产出方式 | E1 result→adapter 推断 / **E2 显式 `propose_*` 工具** | **E2**：agent 显式调工具产出，adapter 不再猜 |
| Trace 折叠锚点 | F1 按时间窗 / F2 按 capability / **F3 按 `propose_*` 工具调用** | **F3** |
| 终止机制 | G1 强制 submit_review / G2 软引导 + maxTurns / **G3 软引导 + 70% 预算提醒 + maxTurns 兜底** | **G3**：turn 数到 70% 时插一个 tool-result 警示，maxTurns 强终止 |
| 多轮 review | H1 单轮 / **H2 agent 自决多轮 + compact** | **H2**：`submit_review.continue` 控制；Fast 1 轮、Complete 上限 3 轮；轮间 compact 旧 transcript |
| note_finding 写回 | **I1 进 transcript** / I2 不进 / I3 进但折叠 | **I1**：tool-result 即文本本身，agent 后续 turn 看得到 |
| Pre-flight 来源 | **J1 纯规则** / J2 + Haiku 同步 / J3 + Haiku 异步 | **J1**：完全规则，~50ms |
| 9 个旧 playbook | K1 全删 / K2 全留 / **K3 抽共享片段** | **K3**：playbook 内容抽到 templates，meta-agent 与 single-capability 共用；老 buildCopilotAgentStream 暂留，待 meta-agent 稳定 1-2 月后下线 |
| Mobile | L1 同 desktop / **L2 隐藏入口** / L3 轻量 fallback | **L2**：Platform.isMobile guard 隐藏 Auto Review 入口，等移动端整体方案 |
| Usage 观测粒度 | **M1 每个 propose_* 一条事件** / M2 仅 submit 汇总 / M3 两者 | **M1**：`feature='auto-review-meta'`, `action='propose_<type>' / 'submit_review'` |

---

## Target Architecture

### 整体流程

```
Open Auto Review
  ↓
Pre-flight (rule-based, no LLM, <50ms):
  - 收集信号：word count / orphan? / has tasks? / outgoing & incoming link count / 是否含 selection
  - 输出 "Document signal report" 文字段，作为 meta-agent system prompt 的一部分
  ↓
Single meta-agent loop (one SDK query):
  System prompt:
    - "You are reviewing this note. Signal report: [...]"
    - "Mode: fast | complete"
    - Tool inventory:
        vault_list_folders / vault_read_folder / vault_read_note / vault_grep / vault_wikilink_expand
        propose_insight / propose_change / propose_source / attach_chat_followup
        note_finding (lightweight)
        submit_review (terminator)
    - Output protocol: "Begin with a 2-4 line plan. Read what you need.
                       Call propose_* to publish each artifact.
                       Call submit_review when done."
  
  Agent loop:
    plan (text-delta)
    → read/grep/...
    → note_finding "X 似乎与 Y 相关"
    → read/grep/...
    → propose_insight {...}
    → read/grep/...
    → propose_change {...}
    → submit_review
  ↓
Display review with populated Insights / Changes / Sources / Chat tabs
```

### Pre-flight Signal Report 的内容

"Pre-flight" = agent loop 启动前的纯 JS 文档体检，不调 LLM，~50ms。目的是把 agent 自己迟早要查的基础数据（字数、backlinks、孤立性、任务清单状态）提前算好喂给 system prompt，省 agent 1-2 个 turn。

固定字段（rule-based）：

```
File: <basename>
Scope: full document | selection (<N> chars)
Word count: <N>
Outgoing links: <N>
Incoming links (backlinks): <N>
Orphan: yes/no
Tags: [...]
Has task list: yes/no (count <N> open tasks)
Recently modified: <date>
```

这一段作为 system prompt 的"文档体检报告"，让 meta-agent **看到事实而非建议**。不再说"建议你跑 Suggest Links"，让 agent 自己决定。

### 新增 MCP 工具

注册在已有的 `copilot` MCP server（`buildSubmitResultMcpServer` 扩展）。所有工具返回 `{ acknowledged: true, count: N }` 形式 tool-result，agent 据此知道已产出多少 artifact。

#### `propose_insight`

```ts
{
  title: string,                            // 短标题
  body: string,                             // markdown 主体
  severity: 'info' | 'warn' | 'critical',
  provenance: string[],                     // 引用过的 note 路径
  followUpQuestions?: string[],              // 给用户的引导问题
}
```

UI: 渲染到 Insights tab；trace 上作为产出节点（folding anchor）。

#### `propose_change`

```ts
{
  title: string,                            // 改动主题
  blocks: Array<{
    heading: string,
    before: string,                          // 原文片段
    after: string,                           // 改后片段
    rationale: string,                       // 理由
  }>,
  provenance: string[],
}
```

UI: 渲染到 Changes tab，可勾选 Apply。

#### `propose_source`

```ts
{
  path: string,                             // vault 路径
  excerpt: string,                          // 引用片段
  relevance: string,                        // 为何重要
  weight: number,                           // 0-1
}
```

UI: 渲染到 Sources tab。

#### `attach_chat_followup`

```ts
{
  question: string,
  rationale: string,
}
```

UI: 渲染到 Chat tab，作为 agent 主动提的可点 follow-up（区别于 user-initiated chat）。

#### `note_finding`

```ts
{ text: string }
```

不是产出，只是 agent 沿途的中间思考记录。trace 上以淡色 reasoning 节点展示，**不计入** Insights/Changes/Sources。作用：

- 给 trace 加可读性（不再只有 tool call）
- 让 agent 显式记录中间结论，避免再读一遍同样的文件

#### `submit_review`

```ts
{
  summary: string,                          // 本轮整体总结，2-4 句
  modeUsed: 'fast' | 'complete',
  continue: boolean,                        // true = 还想再跑一轮 (compact 后继续)，false = 真结束
  continueRationale?: string,               // 若 continue=true，简述还想探索什么
}
```

agent 调用即结束本轮。是否真正终止取决于 `continue` 字段与轮次预算（见下文 Multi-round）。

### Fast vs Complete & Multi-round

| | Fast | Complete |
|---|---|---|
| 最大轮次 | 1 | 3 |
| 单轮 maxTurns | 8 | 15 |
| 总 turn 预算 | 8 | 45 |
| 70% 预算提醒触发点 | turn 6 | 单轮 turn 11 |
| System prompt 末尾追加 | "Pick exactly ONE focus area. Produce one propose_* call and submit_review with continue=false." | "Cover relevant focus areas. Multiple propose_* expected. Set continue=true if you want another round to explore a different angle; the system will compact this round's transcript." |
| Pre-flight cap | 跳过深度信号采集 | 完整采集 |
| UI 入口 | 单独 Fast Review 按钮 | 默认 Auto |

实现细节：mode 由 `CopilotAutoRunModalProps` 携带；新 `buildCopilotMetaAgentStream` 接收 `{ mode, ctx, signalReport }`。

### 单轮内的预算提醒机制 (G3)

每轮独立计算。当 agent 已用 turn 数 ≥ 70% maxTurns 时，下一次 tool-result 后端注入额外文本：

```
<system-note>You have used N of M turns this round.
Consider calling submit_review soon. Set continue=true if you need another round.</system-note>
```

这是确定性触发，由 SDK 消费者（即新的 stream consumer）在 yield tool-result 时拼接。Agent 看得到，可继续调用工具或立即 submit。

### 多轮 + Compact (H2)

轮次状态：

```ts
interface ReviewSession {
  mode: 'fast' | 'complete';
  rounds: RoundRecord[];
  maxRounds: number;   // fast=1, complete=3
  carryArtifacts: { insights, changes, sources, chats };  // 跨轮累积
  carryFindings: string[];                                 // note_finding 全部保留
  carryPlanSummaries: string[];                            // 每轮 submit_review.summary
}

interface RoundRecord {
  roundIndex: number;
  startedAt: number;
  endedAt?: number;
  turnCount: number;
  steps: V2ToolStep[];                                     // 仅本轮原始 trace，UI 展示用
  submission?: { summary, continue, rationale };
}
```

**Compact 机制**：

agent 调 `submit_review` 后：

1. 把本轮 `propose_*` 产出的 artifact 合并入 `carryArtifacts`；
2. 把本轮所有 `note_finding` 追加到 `carryFindings`；
3. 记录 `submission` 到 `RoundRecord`；
4. 决策树：
   - `continue === false` → 终止 session，进入 review 展示。
   - `continue === true && roundIndex + 1 < maxRounds` → 启动下一轮（见下）。
   - `continue === true && roundIndex + 1 === maxRounds` → 强制终止，UI 提示 "Agent wanted to continue but round budget exhausted"。

**下一轮启动**（新建一个独立 SDK query，**不复用** 旧 generator）：

System prompt 在原 mode-specific 段之后追加一个 `<previous-rounds>` 块：

```
<previous-rounds>
Round 1 summary: <agent 自己写的 submission.summary>
Round 1 rationale for continuing: <submission.continueRationale>
Findings so far: <carryFindings 合并去重，截断 8000 chars>
Already produced:
  Insights: <title 列表>
  Changes: <title 列表>
  Sources: <path 列表>
</previous-rounds>

This is round <N+1> of <maxRounds>. Explore angles not yet covered.
```

旧 transcript（read/grep 原始 tool-result）**完全丢弃**——这就是 compact 的本质。Agent 通过上述 summary block 知道之前做了什么、产出了什么，但不会被原始噪音淹没。

**Turn 总预算检查**：每轮内部各自 maxTurns 限制，不存在跨轮的"全局 turn 数"概念——compact 后开新一轮 = 重置 SDK query。

### Trace 显示多轮

新 trace 顶层为 `Round 1`, `Round 2`, ... 的 group root，每个 round 内部按 propose_* 折叠（沿用 F3 规则）。Round header 显示 "Round 1 of 3 · 12 turns · 2 insights · 1 change · continued"。

### Trace 折叠语义

锚点：每次 `propose_*` 工具调用即一个折叠 group 的 root。规则：

1. 时间线扫描 trace items。
2. 遇到 `propose_*` 即关闭当前 group，把之前所有未归属的 read/grep/note_finding 收为它的 children。
3. 第一个 `propose_*` 之前的 read/grep 归属第一个 group（"为产出 X 而读"）。
4. 最后一个 `propose_*` 之后到 `submit_review` 之间的内容归属"Wrap-up" group。
5. plan 文本（首段 text-delta）作为顶部独立条目，不折叠。

UI:

- 默认折叠完成的 group，仅显示标题 + summary ("3 reads · 1 grep · → Insight: Suggest Links")。
- 正在进行的 group 默认展开。
- 点击 group header 展开/折叠所有 children。
- `note_finding` 在展开状态下用斜体淡色显示，与 tool call 视觉区分。

---

## Phase Plan

### Phase 1 — 数据模型先行（低风险，1 天）

目标：解决 P2（Changes/Sources 空），不动 agent 架构。

1. 新增 `propose_insight / propose_change / propose_source / attach_chat_followup` MCP 工具，注册到现有 `buildSubmitResultMcpServer`（改名为 `buildCopilotOutputMcpServer`）。
2. 现有 capability 的 system prompt 增加："Optionally call propose_change / propose_source if you produce concrete edits or cite source notes."
3. UI: `CopilotArtifactAdapter` 改造为优先消费 `propose_*` 的产物；fallback 才走旧的 schema 推断。

完成标准：跑一次 Auto Review，Insights / Changes / Sources tab 都能有内容（取决于 agent 是否调相应工具）。

### Phase 2 — Meta-agent + 多轮 (compact) 替换 capability loop（中高风险，3-4 天）

目标：解决 P1，落地 H2 多轮 + compact + G3 预算提醒。

1. `planCopilotAutoRun` 退化为信号采集，返回 `DocumentSignalReport`，不再选 capability。
2. 新建 `buildCopilotMetaAgentStream`，接收 `{ ctx, signalReport, mode, previousRounds? }`，跑单一 SDK query。`previousRounds` 用于轮间 compact prompt 拼接。
3. 新建 `ReviewSession` 状态机（见上文）。Stream consumer 监听 `submit_review`，根据 `continue` 与 `roundIndex` 决定终止 or 开启下一轮 SDK query。
4. 单轮预算提醒：consumer 跟踪 turn count，达 70% 后下一个 tool-result yield 时拼接 `<system-note>`。
5. 删 `CopilotAutoRunContent` 里的 `for (const queuedRun of state.runs)` 循环，改为消费 `ReviewSession`。
6. 删 `consumeCapabilityRun`；状态字段从 `CapabilityRun` 改为 `RoundRecord[]`。
7. `CopilotActionRegistry` 暂保留（user-triggered single capability 还在用）；Auto Review 不再走它。

完成标准：Auto Review trace 长度从 ~26 step 降到 ~8-15 step（单轮）；轮间正确 compact；Round header 展示正确；agent 自己写 plan 文字。

### Phase 3 — Trace 折叠 UI（低风险，1 天）

目标：解决 P3。

1. `CopilotRunArtifacts.TraceArtifact` 加 `groupRoot?: boolean`、`groupOf?: string` 字段。
2. `buildAutoRunArtifacts` 处理时按规则填充 groupRoot/groupOf。
3. `TraceArtifactPanel` 渲染时分组、加 collapse/expand 控件，记忆每个 group 的折叠态。
4. `note_finding` 用单独样式。

### Phase 4 — Fast / Complete UI 切换（低风险，0.5 天）

1. Modal 标题旁加 Fast / Complete toggle（默认 Complete）。
2. Fast 模式提示气泡："Single focused review, ~8 turns."

---

## Resolved (formerly Open Questions, 2026-05-17)

1. **终止机制 (Q1 → G3)**：软引导 + 单轮 70% 预算提醒（tool-result 注入 `<system-note>`）+ maxTurns 兜底。新增 H2 多轮 + compact：agent 在 `submit_review` 时通过 `continue` 字段自决是否再来一轮，Complete 模式上限 3 轮，轮间 compact 旧 transcript 只保留 summary + propose_* 产出 + findings。
2. **note_finding 写回 (Q2 → I1)**：tool-result 直接回写 finding 文本，agent 后续 turn 看得到。
3. **Pre-flight (Q3 → J1)**：纯规则，~50ms，不引入 Haiku。
4. **9 个旧 playbook (Q4 → K3)**：抽成共享 prompt 片段（放 `templates/prompts/shared/` 或类似），meta-agent 和 single-capability 路径共用。老 `buildCopilotAgentStream` 暂留，meta-agent 稳定运行 1-2 个月后下线，CopilotPickerModal 统一切到 meta-agent + "force this artifact kind" 提示。
5. **Mobile (Q5 → L2)**：Auto Review 入口加 `Platform.isMobile` guard 隐藏。
6. **Usage 观测 (Q6 → M1)**：每个 `propose_*` 单独发 `UsageRecordedViewEvent`，`feature='auto-review-meta'`，`action='propose_<type>'` / `'submit_review'`。

---

## Non-goals

- 本 spec 不改 user-triggered single-capability flow（Copilot picker / Result modal）。
- 不动 chat 主流程（service-manager.ts）。
- 不引入新 LLM provider 或更换 SDK。
- 不重写 vault MCP server（继续复用 `vault_*` 工具）。

---

## Acceptance Criteria

完成 Phase 1-4 后：

- [ ] Auto Review 跑完后 Insights / Changes / Sources / Chat 至少有一个 tab 非空（视文档情况）；不会全 0。
- [ ] Trace step 数比当前减少 ≥ 50%（同一文档同一 mode 下对比）。
- [ ] Trace 上能看到 agent 自己写的 plan 文字（≥ 2 行）。
- [ ] Trace 默认折叠完成的 group，展开正在进行的 group。
- [ ] Fast mode 平均耗时 ≤ 30s，Complete mode 平均耗时 ≤ 120s（多轮场景，中等大小笔记）。
- [ ] Trace 上能看出 Round 1/2/3 分隔；轮间 transcript 正确 compact（旧 read/grep 不再出现在新 round 的 prompt 中）。
- [ ] 当 agent `continue=true` 触及上限时，UI 显示 "Agent wanted another round but budget exhausted" 提示。
- [ ] 不再出现 "Unknown template id" 类错误（capability playbook 不再被 meta-agent 路径调用）。
