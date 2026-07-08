# Debug Trace Infrastructure

Status: draft, 2026-07-05
Owner: highestpeak
Scope: Peak Assistant plugin — Chat / Search / Agent Harness / Ambient Push / Analyze
Depends on: T3 RunEnvelope, T3A InMemoryRunRecorder, Harness TraceBus, T2 ArtifactPort, T7 RunEnvelopeStore

## 1. Motivation

用户之前在多个 surface 上（Chat、Search、Ambient、Analyze）反复要 "这次为什么给我这个结果 / 这条路径是怎么走的 / 谁被漏掉了、被谁挤掉了"。当前 debug 手段是散的：Search inspector 里能看几个中间量；Chat 里 assistant message 后面看不到用了哪些 slot；Ambient 只知道推了一条，不知道为什么。Harness TraceBus 结构已经健全，但它只对 agent 内部可见，不对 Chat / Search / Ambient / Analyze 生效。

这套 infra 的定位不是 "给每个 feature 加一个 debug 按钮"，而是：**在既有 RunEnvelope + TraceBus 上叠一层跨 surface 的 debug span 模型，配 sidecar recorder + Markdown/JSON formatter，让任何 run 都能被复制成一份可读的 receipt。**

不做：
- 不重写 Harness TraceBus。TraceBus 是 debug 数据的**上游**，不是替代品。
- 不把 debug 数据塞进业务 result 对象。用 sidecar recorder / artifact。
- 不默认打开 full-content capture。默认 redacted，raw 只在用户显式开启后落地。
- 不做全局 Debug Runs inspector（第一版）。第一版只做局部 "Copy debug trace" affordance。

## 2. 已有基础

- `src/service/run-envelope/InMemoryRunRecorder.ts` — 已有 `status | progress | artifact | error | log` 5 类事件；每个 run 拿到 runId，可挂 `onEvent` sink。
- `src/service/run-envelope/InMemoryArtifactStore.ts` + `VaultArtifactStore.ts` — 已有 in-memory + vault-backed ArtifactPort。
- `src/service/run-envelope/projection.ts` + `runEnvelopeStore.ts` — 已有 UI 订阅链。
- `src/service/agents/harness/trace/events.ts` — Harness TraceBus，8 类语义事件（loop_start / step_start / step_finish / tool_call / tool_result / tier_escalate / loop_finish / context_compacted）。
- `src/service/chat/ChatConversationRun.ts` + `CopilotReviewRun.ts` + `AnalysisReportRun.ts` + `HarnessAgentRun.ts` — 4 个 feature adopter 已就位，都已经拿到 runId。

Debug Trace Infra 建在这些之上，不重造 recorder。

## 3. 数据模型

### 3.1 DebugSpan

`src/core/debug-trace/types.ts`

```ts
export type DebugSurface = 'chat' | 'search' | 'agent' | 'ambient' | 'analyze';

export type DebugSpanKind =
  | 'model.call'          // provider LLM 调用
  | 'tool.call'           // agent tool 调用 / MCP tool
  | 'retrieval.recall'    // 单个 retriever 出结果（vector / fts / fts-stem / meta / graph）
  | 'retrieval.merge'     // RRF / weighted fusion
  | 'ranking.score'       // boost + rerank 打分
  | 'filter.decision'     // dedup / path filter / already-linked / exclude
  | 'context.assemble'    // 单个 context slot 装配
  | 'context.compact'     // 上下文压缩（对齐 harness context_compacted）
  | 'permission.check'    // permission guard 决策
  | 'artifact.write'      // artifact 写入（对齐 RunEnvelope artifact）
  | 'trigger.fire'        // ambient 触发点
  | 'custom';             // 逃生口，附带 subtype 字段

export interface DebugSpan {
  spanId: string;
  parentSpanId?: string;
  traceId: string;             // 一次 debug session 的顶层 id；1 个 traceId → N 个 span
  runId: string;               // 来自 RunEnvelope；同一 run 可以有多个 span
  surface: DebugSurface;
  kind: DebugSpanKind;
  name: string;                // 短标签，例如 'vector-recall' / 'rrf-merge'
  startedAt: number;
  durationMs: number;
  input?: DebugPayload;
  output?: DebugPayload;
  params?: Record<string, unknown>;
  metrics?: Record<string, number>;
  decisions?: DebugDecision[]; // 例：{ reason: 'already-linked', targetPath: '…' }
  redaction: 'redacted' | 'raw';
}

export interface DebugPayload {
  /** 短片段，默认 <= 240 char。永远存在。 */
  excerpt: string;
  /** 内容 hash，用于跨 span 引用同一段文本时去重。永远存在。 */
  contentHash: string;
  /** 全量内容。仅 redaction='raw' 时存在。 */
  raw?: string;
  /** 内容长度（char），永远存在。 */
  length: number;
  /** MIME-like 提示，例：'text/markdown' | 'application/json' | 'query' */
  contentType?: string;
}

export interface DebugDecision {
  decision: 'keep' | 'drop' | 'promote' | 'demote' | 'skip' | 'deny';
  reason: string;
  target?: string;                    // 被裁的对象引用（path / spanId / slotName）
  score?: number;
  meta?: Record<string, unknown>;
}
```

### 3.2 DebugRun

一次 run 的完整状态：

```ts
export interface DebugRun {
  traceId: string;
  runId: string;
  surface: DebugSurface;
  capabilityId?: string;               // 来自 RunEnvelope Session.capabilityId
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  spans: DebugSpan[];
  summary?: DebugSummary;              // formatter 用；surface adapter 可选写入
  redactionMode: 'redacted' | 'raw';
  version: 1;
}
```

`DebugSummary` 是给 formatter 的短总结（例：Search 里的 `finalTopK` / `rerankModel` / `query`），adapter 决定写不写。

## 4. Recorder + Port

### 4.1 DebugTracePort

`src/core/debug-trace/DebugTracePort.ts`

```ts
export interface DebugTracePort {
  /** 是否开启（Off 状态下所有 record 变 no-op）。 */
  isEnabled(): boolean;
  currentMode(): 'off' | 'redacted' | 'raw';

  /** 开一个新 run。返回一个 handle；handle 关闭时 run 归档。 */
  startRun(input: StartDebugRunInput): DebugRunHandle;

  /** 读取历史 run（按 retention 上限保留）。 */
  listRecent(limit?: number): DebugRun[];
  getRun(runId: string): DebugRun | undefined;
  clearAll(): void;
}

export interface DebugRunHandle {
  readonly traceId: string;
  readonly runId: string;
  startSpan(input: StartSpanInput): DebugSpanHandle;
  finish(status: 'completed' | 'failed' | 'cancelled', summary?: DebugSummary): DebugRun;
  snapshot(): DebugRun;
}

export interface DebugSpanHandle {
  readonly spanId: string;
  setInput(payload: DebugPayloadInput): void;
  setOutput(payload: DebugPayloadInput): void;
  setParams(params: Record<string, unknown>): void;
  addMetric(key: string, value: number): void;
  addDecision(decision: DebugDecision): void;
  child(input: StartSpanInput): DebugSpanHandle;
  finish(): DebugSpan;
}
```

Port + Recorder 分离：
- Port 是 UI / composition 拿到的东西。
- Recorder 是 in-memory 实现（`DebugTraceRecorder`），保留最近 N 条 run（config），支持 dispose。

### 4.2 Recorder 实现

`src/core/debug-trace/DebugTraceRecorder.ts`

- 构造参数：`{ clock, idFactory, mode: 'off'|'redacted'|'raw', retention: number, redactor: PayloadRedactor }`。
- `mode='off'` 时所有 handle 都是 no-op（返回 stub handle，`finish()` 返 stub run），保证 hot path 零分配。
- `startRun` 拿 `runId` 参数，可选。若来自 RunEnvelope adopter，则复用 RunEnvelope 的 runId；若是纯 debug 独立 run（Search 未包 RunEnvelope 时），idFactory 分配一个新 runId。
- 每次 span finish 时，通过 `redactor` 处理 `input.raw / output.raw`：
  - `redacted` 模式：`raw` 字段永远丢弃；只保留 `excerpt + contentHash + length`。
  - `raw` 模式：`raw` 保留完整值，但仍跑 redactor 的 secret 扫描（API key / auth token / private path 前缀）。

### 4.3 PayloadRedactor

`src/core/debug-trace/redactor.ts`

- 一组正则 + rule：
  - API key patterns（`sk-…`、`Bearer …`、常见 provider 前缀）
  - Auth token（长 base64）
  - 用户 profile 隐私字段：从 settings 里显式声明的 key（例如 `apiKey`, `authToken`, `password`）
- `redactString(raw): { safe: string, hits: Array<{ pattern: string, count: number }> }`
- `hits` 附加进 span `params.redactionHits`，Markdown formatter 可显式提示 "3 potential secrets redacted"。

## 5. Formatter — Markdown / JSON

`src/core/debug-trace/DebugTraceFormatter.ts`

```ts
export interface DebugFormatterOptions {
  format: 'markdown' | 'json' | 'both';
  includeRawIfAvailable: boolean;
}

export function formatDebugRun(run: DebugRun, opts: DebugFormatterOptions): {
  markdown?: string;
  json?: string;
};
```

### 5.1 Markdown template

顶部 metadata block → surface summary → span tree（含分组）→ redaction footer。

```
# Debug receipt — {surface} · {capabilityId}

- runId: {runId}
- traceId: {traceId}
- status: {status}
- started: {ISO}
- duration: {ms} ms
- mode: {redacted|raw}
- redaction hits: {n}

## Summary
{surface-specific summary lines}

## Spans

### 1. retrieval.recall — vector
- durationMs: 42
- params: { source: 'vector', topK: 40, model: 'text-embedding-3-small' }
- output.excerpt: "12 documents…"
- output.length: 12
- metrics: { hits: 12, minScore: 0.13, maxScore: 0.87 }

…

## Redaction
- 3 potential secrets redacted (pattern: sk-…, count: 2; Bearer …, count: 1)
```

### 5.2 JSON appendix

`format='both'` 时，Markdown 底部追加：

```
<details><summary>JSON appendix</summary>

```json
{ "traceId": "…", "spans": [ … ] }
```

</details>
```

Markdown 是给人读的；JSON 是给下游工具消费的（例如未来自研 evaluator / Langfuse 转换）。

## 6. Adapter 契约

**约束**：adapter 只 record；不改业务返回值。任何 surface 断了 debug adapter，业务链路必须依然工作。

### 6.1 Agent Harness adapter

新文件：`src/service/agents/harness/trace/debugTraceAdapter.ts`

- 输入：`{ traceBus: TraceBus, debugRun: DebugRunHandle }`。
- 订阅 TraceBus 全部 8 类事件，映射到 span：
  - `loop_start` → 打开 root span `agent-loop-{loopId}`。
  - `step_start` → 新 span `model.call`，input.excerpt 取最近 user turn 摘要。
  - `step_finish` → 关掉当前 step span，output.excerpt 取 assistant text 首段，params 记 provider/model/tier/tokens/finishReason/selfScore。
  - `tool_call` → step span 下的 child `tool.call`，input=args（redacted 时只写 excerpt）。
  - `tool_result` → 关闭对应 child span，output=payload，params={ok, durationMs}。
  - `tier_escalate` → decision `promote` 附加到当前 loop span。
  - `context_compacted` → span `context.compact`，metrics={tokensBefore, tokensAfter, droppedBlocks, droppedMessages}。
  - `loop_finish` → 关闭 root span。
- 接入点：`AgentLoop.ts:44` (loop_start) 已经 emit，adapter 只订阅。**AgentLoop 本身不改。** 只在 `HarnessAgentRun.ts:48` 构造 recorder 的地方额外构造 debugRun，把 traceBus 交给 adapter。

### 6.2 Search receipt adapter

Search 目前**没有** RunEnvelope adopter。第一版走 debug-only path：`SearchClient.search()` 内部自己 startRun。

新文件：`src/service/search/debugTraceAdapter.ts`

改动点（都是加参、不改语义）：
- `SearchClient.ts:35` — search() 入口 startRun('search')，记录 root span with params={query, topK, enableLLMRerank}。
- `queryService.ts:61` — parseQuery 后加一个 span `query-parse`，output.excerpt=JSON.stringify(plan.terms + phrases + excludes)。
- `retriever/registry.ts:20` — executeAll 里 for each retriever 起一个 span `retrieval.recall` name=retriever id；output.metrics={hits, minScore, maxScore}；output.excerpt=top-3 titles。
- `rrf-merger.ts:13` — rrfMerge 出一个 span `retrieval.merge`，per doc 记录 `params.contributions[docId]={vector: 0.03, fts: 0.02, ...}`。太大就只保留 topK 的 contribution。
- `queryService.ts:132` — applyRankingBoosts 出一个 span `ranking.score`，params={signalsUsed[], pprActive, boostWeights}，decisions=top-K per-doc breakdown。
- `reranker.ts:91` — 若 enableLLMRerank：加 span `ranking.score` name='llm-rerank'，params={provider, model}，decisions=每条 doc 的 raw rerank score + combined score。
- `queryService.ts:147` — 最终 finish root span with summary={finalTopK, totalCandidates, dedupDropped}。

Filter / dedup 相关（`already-linked` / `path-excluded` / 类型 filter）：装到 decisions 数组里，附加到 `retrieval.merge` 或独立 `filter.decision` span，取决于代码里已有的分离度。

### 6.3 Chat ContextPipeline adapter

新文件：`src/service/chat/context/debugTraceAdapter.ts`

- 接入点 `service-conversation.ts:294`（`ChatConversationRun` 已经开了 recorder，可以共享 runId）。
- `ContextPipeline.assemble()` 增加 optional `debugRun` 参数。
- 每个 slot builder 输出一个 span `context.assemble` name=slotName，output.excerpt=slot 前 240 char，metrics={tokens}。
- `budgetGovernor.fit()` 内部对每个被 drop 的 slot 加 decision `{decision:'drop', reason:'budget-exceeded', target:slotName, meta:{tokens}}`。
- 最终 chat.dispatch 前记 span `model.call`，params={provider, model, profile, temperature}, input.excerpt=最后 user turn。output 在收到 assistant text 后回填。
- Redaction 硬约束：raw context / raw prompt 只在 `raw` 模式写。redacted 模式只保 excerpt + hash。

### 6.4 Ambient Push adapter

新文件：`src/service/ambient/debugTraceAdapter.ts`

- 接入点 `AmbientPushRuntime.ts:36` (trigger fire) → span `trigger.fire`，params={triggerType, filePath}。
- `AmbientPushRuntime.ts:119` (search) → span `retrieval.recall` name='ambient-search'。
- Serendipity 走 `SerendipitySearcher.ts:55` → span `ranking.score` name='serendipity'，decisions 记 2-hop bridge / cosine / hop-2 signals。
- Dedup / already-linked filter → decisions on final span。
- 最终 chosen item / no-op → span finish 时写 summary={chosenPath?, skipReason?}。

### 6.5 Analyze adapter

新文件：`src/service/agents/report/debugTraceAdapter.ts`

- 复用 `AnalysisReportRun.ts:47` 的 runId。
- `ReportOrchestrator.ts:193` → root span 'analysis-report'，params={sectionCount, evidencePathsCount, userQuery excerpt}。
- 每个 section 起一个 child span `model.call` name='section-generate' + name=sectionId。
- `ContinueAnalysisAgent.ts:55` 走 harness adapter（继承 harness 覆盖，不重复）。
- 保存 artifact 的地方 emit span `artifact.write`，params={path, kind}。
- 中途 abort / fallback → decision `{decision:'skip', reason:'fallback', target:sectionId}`。

## 7. Settings

`src/core/config/settingsTypes.ts:290` 附近的 `MyPluginSettings` 加：

```ts
debugTrace?: {
  mode: 'off' | 'redacted' | 'raw';   // default: 'redacted'
  retention: 20 | 100 | 'session';     // default: 20
  copyFormat: 'markdown' | 'json' | 'both';  // default: 'markdown'
  includeRawContent: boolean;          // default: false; UI 只在 mode='raw' 时可编辑
};
```

`PluginSettingsLoader` 加 `sanitizeDebugTrace()`：缺字段填默认值，非法枚举回落到 `off`。

`AdvancedTab.tsx:65` Developer section 加 subsection：

```
Debug traces
  Mode:          ( ) Off   (•) Redacted (recommended)   ( ) Full local (warn)
  Retention:     [ 20 ▼ ]   ( Session only )
  Copy format:   [ Markdown ▼ ]
  Include raw content in Markdown copy: [ off ]  (only editable when Full local)
  [ Clear all debug traces ]  ← 用 destructive button，二次确认

  Warning row（在 Full local 下渲染）:
    "完整模式会在本地保留 prompt / context / tool arguments 的原文，
     可能包含笔记内容与账号信息。不要把 Full local 的 receipt 发给别人。"
```

## 8. UI copy affordances

第一版**只做局部 copy**，不做全局 inspector view。

- Chat：assistant message action menu 加 "Copy debug trace"。
  - 拿到 assistant message 对应的 runId → `debugTracePort.getRun(runId)` → formatter → clipboard。
  - Off 状态下 hide 菜单项（或 disabled + tooltip "Debug tracing is off"）。
- Search：结果面板 footer / header 加一个小按钮 "Copy search trace"。
  - 拿到最近一次 search 的 runId。
- Ambient push：卡片右上角 kebab 菜单加 "Copy push trace"。
- Analyze / Report：report action 菜单里加 "Copy analysis trace"。

所有 copy 都走同一入口：

```ts
copyDebugRun(runId, port, opts) → Promise<void>
  → 调用 formatter → 写 clipboard → Notice "Debug trace copied"
```

未来（第二版）再建 "Debug runs inspector" 全局 view。

## 9. Redaction 硬规则

- 默认 `redacted`。
- `redacted` 模式下：
  - context / prompt / tool args / tool result raw → 只留 excerpt + hash + length。
  - API key / bearer token pattern → excerpt 里也替换成 `[REDACTED-key]`。
  - vault raw content → 只留 excerpt（前 240 char）+ hash。
- `raw` 模式下：
  - 允许 raw 字段落地，但**仍过 redactor**，检出的 secret 强制替换。
  - Markdown copy 顶部渲染 "MODE: FULL LOCAL — contains raw content" 警告 banner。
- **绝不**默认复制：完整 vault content / API key / bearer token / profile 密码字段。
- Settings 里 profile 隐私字段列表（apiKey / authToken / password / bearer 等）单点声明在 `src/core/debug-trace/redactor.ts`。新字段在这里加。

## 10. 目录结构与文件

```
src/core/debug-trace/
  types.ts                — DebugSpan / DebugRun / Payload / Decision
  DebugTracePort.ts       — Port + handle interfaces
  DebugTraceRecorder.ts   — in-memory 实现 + no-op fallback
  DebugTraceFormatter.ts  — Markdown / JSON emitter
  redactor.ts             — PayloadRedactor + secret patterns
  helpers.ts              — hashContent / excerpt / clock / idFactory 复用

src/service/agents/harness/trace/debugTraceAdapter.ts
src/service/search/debugTraceAdapter.ts
src/service/chat/context/debugTraceAdapter.ts
src/service/ambient/debugTraceAdapter.ts
src/service/agents/report/debugTraceAdapter.ts

src/ui/view/settings/tabs/AdvancedTab.tsx     — 加 Debug traces subsection
src/ui/view/chat-view/…                        — assistant message menu 加 Copy debug trace
src/ui/view/vault-search/…                     — 结果面板加 Copy search trace
src/ui/view/ambient-push/…                     — 推送卡片加 Copy push trace
src/ui/view/analysis-report/…                  — Copy analysis trace

test/debug-trace-recorder.test.ts             — start/span/finish + retention + no-op mode
test/debug-trace-redaction.test.ts            — secret patterns + raw vs redacted
test/debug-trace-formatter.test.ts            — golden Markdown 快照
test/debug-trace-search-adapter.test.ts       — recall / merge / rerank score breakdown
test/debug-trace-harness-adapter.test.ts      — step_finish / tool_call / context_compacted 桥接
```

## 11. 与既有 abstraction 的边界

- **不新增 runtime 全局**。DebugTracePort 由 `AppContext` 或 composition 层持有，adapter 通过构造注入，禁止 module-level `let recorder = null`。参考 `docs/superpowers/refactor-ops/config-defaults-governance.md`。
- **RunEnvelope 是所有权者，不是消费者**。DebugRun 通过 runId 关联 RunEnvelope Session；DebugRun 不复制 RunEnvelope 的 status/artifact 语义，只覆盖 span 语义。
- **TraceBus 是上游数据源**。Harness 内部依旧只 emit TraceBus 事件；DebugTraceAdapter 负责映射到 DebugSpan。TraceBus 类型不变。
- **ArtifactPort**：debug run 落 vault（未来）时走 `VaultArtifactStore`，`kind: 'debug-trace'`，contentType `'trace-json'`。第一版不落 vault，只做 in-memory + clipboard。
- **boundary**：`src/core/debug-trace/**` 严禁 import service/ui/app/obsidian。adapter 位于 service 层，只 import core + 自己 surface 的类型。

## 12. Phase 与验收

按小步可验证顺序：

- **P1 · Core.** `types + DebugTracePort + DebugTraceRecorder + redactor + formatter` + 3 条 core test（recorder / redaction / formatter golden）。boundary test 锁死 `src/core/debug-trace/**` 只 import `src/core/**`。
- **P2 · Harness adapter.** Adapter 挂 TraceBus，`HarnessAgentRun` 里构造 debugRun 传入 loop。1 条 test 覆盖 step_finish + tool_call + context_compacted 桥接。
- **P3 · Search adapter.** SearchClient + queryService + rrf-merger + reranker 加 optional `debugRun` 注入。1 条 golden receipt test 覆盖 recall → merge → rerank score breakdown。
- **P4 · Chat adapter.** ContextPipeline + service-conversation 加 optional debugRun 注入；ChatConversationRun 里 startRun。1 条 test 覆盖 dropped slot + compact + final prompt shape（redacted 模式）。
- **P5 · Ambient + Analyze.** 两处 adapter，各 1 条最小 test。
- **P6 · Settings + Copy UI.** Advanced tab UI + 4 处 Copy 按钮。手动跑通一遍。
- **P7 · Retention + Clear.** In-memory ring buffer + Clear all button。

**验收标准**：
- Settings 能打开 debug trace。
- Search 完成后能 copy 一份 Markdown receipt，每个条目能看出 vector / fts / graph 来自哪里 + RRF contribution + rerank score。
- Harness run 能 copy tool / model / context compact trace。
- Chat assistant message 能 copy context stack receipt。
- Ambient push + Analyze 至少能 copy trigger / input / output / filter / decision trace。
- 默认 redacted 模式下，Markdown receipt 里**没有**完整 vault content、API key、bearer token。
- `npm run test` 全绿 + 每个 phase 各自 targeted test 全绿。

## 13. 明确 out of scope（第一版）

- 全局 Debug Runs inspector view。
- 把 debug run 落 Vault / SQLite 持久化。
- Trace 视图跨 run 关联（trace 只在单 run 内成树；后续如果引入 conversation-level trace，另做 spec）。
- 上传 / 分享 / 导出到外部平台（Langfuse / Phoenix / OTLP）。第一版只做本地。
- 自动性能分析 / 回归对比。
- 与 UsageTrackingService 的成本合并展示（成本走既有 dashboard）。

后面按需要再叠。

## 14. 参考

- OpenAI Agents SDK tracing — <https://openai.github.io/openai-agents-python/tracing/>
- Vercel AI SDK Telemetry — <https://ai-sdk.dev/docs/ai-sdk-core/telemetry>
- Langfuse — <https://langfuse.com/docs>
- Arize Phoenix — <https://arize.com/docs/phoenix>
- AutoGen tracing — <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tracing.html>
- ReAct — <https://arxiv.org/abs/2210.03629>
- Agent provenance survey — <https://arxiv.org/html/2606.04990v3>
- RAG evaluation survey — <https://arxiv.org/html/2504.14891v1>
