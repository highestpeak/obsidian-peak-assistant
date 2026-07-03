# Real-time LLM Context Inspector — 2026-07-03

## 一句话结论

**现有 RunEnvelope + `service/agents/harness/trace` 已经采集了所有 raw material（每一次 model call 的 prompt + tools + response + usage）；缺的是一个"实时"UI 面板把这些事件流式渲染出来。不需要新采集层，只需要 UI + 一个 `TraceProjection` view。**

## 问题定义

用户在 Chat / Copilot / Analysis / Harness 里发送一次请求后，模型底下拿到的完整 context（system prompt + resolved slots + attachments + tool schemas + memory blocks）今天对用户是不可见的。当结果不符合预期时，用户没法快速定位是：
1. 装配层漏了 file / 塞错了 slot；
2. 模型 misinterpret 了 system prompt；
3. Tool 定义描述不清导致模型跑偏；
4. Provider 侧模型截断了 context。

**目标**：把"模型看到了什么、模型返回了什么、每一步耗时耗 token"用一个 side-panel 或 modal 实时展示，跟随当前活跃的 RunSession 一起流。

## 现有基础设施盘点

| 层 | 已有 | 用途 |
|---|---|---|
| RunEnvelope | `service/run-envelope/*` — `InMemoryRunRecorder`、`RunEnvelopeStore`、`projection.ts` | 每次 conversation / review / analysis / agent-loop 一份 RunSession |
| Trace bus | `service/agents/harness/trace/events.ts` — `TraceBus.emit('tool_call', {...})` / `loop_start` / `loop_finish` / `step_finish` / `context_compacted` | Harness 内部所有事件流 |
| Projection | `RunEnvelopeStore.deriveEvents(projection, selector)` | 已经能派生"某选择器视图"的最新 snapshot，React `useSyncExternalStore` 直接消费 |
| Golden trace | `test/wave3-adopter-runs.test.ts` | 已经用 golden fixture 锁定过事件形状 |
| Artifact | `ArtifactPort` + `VaultArtifactStore` | body 存到 vault，可以复用作为"完整 prompt snapshot" |

结论：raw material 齐了，实时性通过 `RunEnvelopeStore.subscribe(...)` 天然满足。

## 需要新加的部分

### 1. TraceProjection view

新一个 selector 装到 `RunEnvelopeStore`：

```ts
createProjectingRecorder({
  projection: {
    selector: (event) => ['tool_call', 'tool_result', 'step_finish', 'context_compacted', 'error'].includes(event.type),
    // 每个事件把 body 塞进去做 UI 可读
  }
});
```

派生视图给 UI 侧一个 `TraceEntry[]`，每条含 `stepIndex / phase / label / durationMs / tokenIn / tokenOut / promptExcerpt / responseExcerpt`。

### 2. Prompt snapshot artifact

在装 prompt 前记一次 `recorder.recordArtifact({ kind: 'trace', contentType: 'application/vnd.peak.prompt-snapshot+json', body: { systemPrompt, messages, tools } })`。VaultArtifactStore 已能落地 `.peak/artifacts/<runId>/*.json`。

Copilot 侧 & Chat 侧要各自在 `run*Envelope` 的 `send` / `review` / `generate` 里加一处 `recorder.recordArtifact(promptSnapshot)`。

### 3. UI 面板

一个 side panel（复用 QuickSearch panel 那种 leaf），顶部下拉选择 "当前 active RunSession" / "最近 N 次"，下面：
- **Timeline 视图**：把 events 按 stepIndex 折叠，每个 step 显示 `input tokens / output tokens / duration / provider / model`。
- **Prompt viewer**：点某个 step 展开，用 Streamdown 渲染 `promptSnapshot.messages`。
- **Response viewer**：同理，渲染 model completion。
- **Tool call viewer**：显示 `tool_call.args` 和 `tool_result.payload`（大 payload 折叠成 hover 展开）。

## 成本估算

| 项 | 成本 | 备注 |
|---|---|---|
| RunEnvelope trace 已有 | 0 |  |
| Prompt snapshot artifact 落 vault | 每 run 5-50 KB | 用户可通过 dismissible 设置关掉；开发模式下默认开 |
| Prompt snapshot artifact 落 memory 只 | 0 (与 UI 生命周期同) | 不需要 vault trace 的用户走这条 |
| UI 面板开发 | 2-3 天 | side panel + timeline + prompt viewer；复用 QuickSearch 的 leaf 骨架 |
| Streamdown 渲染 | 0 (已有) |  |

## 竞品参考

- **LangSmith / LangFuse**：完整 trace UI + LLM run replay。对标价值参考。
- **Anthropic Console**：单次 completion 的 raw prompt view，最简形态。
- **OpenAI Traces**：Assistant API 后台。
- **Claude Code 的 `--trace` flag**：本地 stderr 打印 tool call。

不做完整 LangSmith 复刻；本地面板即可。

## 决策

- **必要性**：**高**。产品差异化点。用户切换到 Peak 常见反馈是 "不知道 AI 到底看到了什么"。
- **形态**：Side panel 内嵌，不做独立 view。
- **落地依赖**：无。RunEnvelope 已全部 landed（Wave 1）。
- **优先级**：Wave 4 之后（在 Ambient / Chat Rich Generation 之后），因为需要用户能理解"这是我的 chat run"这种前置概念。

## Next steps

1. Wave 4 D1/D2/D3 完工后启动
2. 先出 UX mockup（3 屏）
3. 落地 `TraceProjection` + `promptSnapshot` artifact
4. 落地 side panel MVP（timeline + prompt viewer）
5. QA + release note
