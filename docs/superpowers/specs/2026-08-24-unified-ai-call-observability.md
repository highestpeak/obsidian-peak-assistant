# Unified AI call observability

Status: approved for implementation, 2026-08-24
Owner: Peak Assistant
Audience: maintainers implementing or debugging provider-backed features

## 1. Decision

Peak must record every provider-backed AI round trip at the execution boundary. A call becomes visible before network execution starts and remains inspectable through streaming, completion, cancellation, or failure.

This extends the existing app-owned `DebugTraceRecorder`. It does not add a second trace singleton and does not make feature UIs own provider logging.

The minimum debugging loop is:

1. Open **Settings → Advanced → Diagnostics**.
2. See the active or failed call immediately.
3. Inspect the logical request, provider wire request when the adapter exposes it, streamed text/reasoning, terminal raw response, usage, finish reason, and error.
4. Copy one redacted or full-local record without reproducing the run.

## 2. Problem and current evidence

The repository already has three observability fragments, but none is a universal AI-call contract:

- `src/core/debug-trace/` records feature-level spans and retains only finished runs in memory.
- `src/core/llm/SingleTurnGenerationTrace.ts` is a callback used by selected `queryText` and `queryStructured` callers.
- `src/service/usage/` records terminal usage after a call; it cannot explain an empty response or show what was sent.

The actual provider paths are split:

| Execution path | Current entry | Current gap |
| --- | --- | --- |
| Harness language calls | `AgentLoop` → AI SDK `streamText` | No universal request/response record; only selected TraceBus consumers |
| Direct language calls | `vercelGenerateText` / `vercelStreamChat` | Bypasses feature DebugRun in several services |
| Structured generation | `AIServiceManager.queryStructured` | Callback is optional and caller-local |
| Embedding | `embedTexts` | Usage is reported only after success; request and failure are absent |
| Media generation/transcription | media adapters and service runtime | Usage/receipts exist, but exact provider lifecycle is not in Debug Trace |

The root cause is therefore a `STRUCTURE_MISMATCH`: logging is attached to selected features instead of the provider execution boundary.

## 3. Goals

- Record `request` before provider execution.
- Record incremental text and provider-emitted reasoning without inventing hidden reasoning.
- Record terminal response, finish reason, usage, provider metadata, duration, cancellation, and error.
- Cover language, structured output, embeddings, media generation, and transcription.
- Keep provider/profile/model routing explicit; observability never selects a fallback model.
- Make active and recent calls inspectable from one production surface.
- Emit structured, secret-scrubbed DevTools logs for request and terminal events.
- Keep diagnostics local and bounded.

## 4. Non-goals

- No external telemetry or hosted tracing service.
- No automatic upload of Vault content.
- No synthetic reasoning text.
- No swallowing, retrying, or converting provider errors into successful empty responses.
- No redesign of feature-specific progress UI.
- No provider or model fallback.

## 5. Runtime contract

### 5.1 Model call record

`DebugTracePort` gains a call-level sidecar model:

```ts
interface DebugModelCall {
  callId: string;
  runId?: string;
  surface: DebugSurface;
  capabilityId: string;
  operation: 'text.generate' | 'text.stream' | 'object.generate'
    | 'embedding.generate' | 'media.generate' | 'speech.transcribe';
  providerId: string;
  modelId: string;
  phase: 'request' | 'streaming' | 'response' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  request: DebugPayload;
  response?: DebugPayload;
  reasoning?: DebugPayload;
  finishReason?: string;
  metrics?: Record<string, number>;
  error?: { message: string; stack?: string };
}
```

The corresponding handle supports request replacement when the provider exposes the actual HTTP body, throttled stream snapshots, success, failure, and cancellation.

### 5.2 Language-model boundary

AI SDK language models are wrapped with a `LanguageModelV3Middleware` inside the Peak execution boundary. The middleware records:

- logical call parameters before `doStream` or `doGenerate`;
- adapter-provided `request.body` when available;
- raw stream parts, text deltas, reasoning deltas, tool calls, tool results, response metadata, usage, and finish reason;
- thrown errors and stream error parts.

The wrapper is applied by `AgentLoop` and the direct Vercel adapter. Feature code does not manually serialize provider payloads.

### 5.3 Embedding and media boundaries

- `embedTexts` starts a call before `fetch`, records the sanitized request body, then records vector count/dimensions and provider response metadata or the original failure.
- `MediaGenerationService` and `MediaUnderstandingRuntime` record domain request, selected adapter route, terminal receipt/result metadata, and failure. Binary payloads are represented by byte length, MIME type, hash, and stable reference; raw binary/base64 is never copied into a debug record.

## 6. Live inspection and retention

The recorder keeps active calls and finished calls in one bounded ring. `subscribe()` notifies the Diagnostics UI on request, stream snapshot, and terminal transition.

Modes:

- `redacted` is the default. It stores a scrubbed excerpt, content hash, and length.
- `raw` is explicit **Full local** mode. It stores full text after secret scrubbing for the current plugin session.
- `off` is available, but the UI states that disabling it removes failure evidence.

The first production implementation remains session-local. DevTools receives the same sanitized request and terminal records, which makes a failed call visible even if its feature surface unmounts. Persistent LP-08 storage is a separate follow-up because raw Vault content requires an explicit retention and deletion UX.

## 7. Privacy and safety

- API keys, bearer tokens, auth headers, and known key prefixes are scrubbed before storage or console output.
- Binary attachments and data URLs are summarized, not copied.
- Redacted mode never retains `raw`.
- Full-local mode never bypasses secret redaction.
- Records never enter Vault search, sync, or user-authored Markdown.
- Failure logging must not replace throwing the original error.

## 8. Runtime sequence

```mermaid
sequenceDiagram
    participant Feature as Feature runtime
    participant Loop as AgentLoop or direct adapter
    participant Trace as App-owned DebugTraceRecorder
    participant Provider as Configured provider and model
    participant UI as Diagnostics inspector

    Feature->>Loop: execute configured call
    Loop->>Trace: startModelCall(request)
    Trace-->>UI: request visible immediately
    Loop->>Provider: send request
    Provider-->>Loop: stream parts or blocking result
    Loop->>Trace: stream snapshot
    Trace-->>UI: text and reasoning update
    alt completed
        Loop->>Trace: succeed(response, usage, finishReason)
    else failed or cancelled
        Loop->>Trace: fail or cancel(original error)
        Loop-->>Feature: throw or return cancellation
    end
```

Reading notes:

- The recorder observes a call; it does not route it.
- The configured provider and model remain frozen for the call.
- The feature receives the original success, cancellation, or exception semantics.
- The inspector reads the recorder and does not reconstruct state from console strings.

## 9. Coverage gate

An automated source audit must fail when production code invokes any of these boundaries without an observability argument:

- `runAgentLoop`;
- `runHarnessModel`, `runHarnessText`, or `streamHarnessModel`;
- `vercelGenerateText` or `vercelStreamChat`;
- embedding request execution;
- media adapter execution.

The audit distinguishes declarations and tests from production call sites.

## 10. Verification

- Recorder unit tests prove request visibility before completion, subscriptions, redaction, terminal states, and retention.
- Middleware tests prove request body, streamed text/reasoning, usage, finish reason, provider error, and cancellation capture without changing the stream delivered to the caller.
- Coverage tests scan production sources for unobserved call boundaries.
- Settings UI contract tests prove active and failed calls are visible and copyable.
- Focused tests and `npm run build` must pass.
- Real Obsidian verification must confirm one active local-model call and one failed call in Diagnostics. Until that happens: `INTERACTION NOT VERIFIED`.

## 11. Rollback

The change is sidecar-only. Removing the middleware/observer arguments returns execution to the existing runtime because model routing, prompts, provider adapters, and result types are unchanged. The recorder can also be set to `off` without changing call behavior.
