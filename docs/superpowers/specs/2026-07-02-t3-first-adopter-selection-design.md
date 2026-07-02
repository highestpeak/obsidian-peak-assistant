# T3 RunEnvelope — First-Adopter Selection Design

Date: 2026-07-02
Parent spec: `docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md` §Wave 2.A
Handbook: `docs/superpowers/specs/2026-06-01-peak-system-architecture-modernization-handbook.html` §7 (RunEnvelope)

## Goal

Wave 2.A of the completion plan lists six chains that must adopt `RunEnvelope`: Chat streaming, Search retrieval, Copilot review, AI Analysis, Harness agent loop, Knowledge Jobs. The parent spec recommended starting from "Knowledge Jobs" as "simplest, no UI flow dependency."

**This spec revises that recommendation.** After surveying the actual code, "Knowledge Jobs" is a fuzzy label — there is no single job runner — and the individual candidates (`CascadeWorker`, `IndexInitializer`, `GraphCleanupService`, `SearchUpdateListener`) each have a specific reason they're a bad fit for the very first adopter. This spec walks through the survey, then names the concrete order for the next two adopters plus the wiring for each.

## Non-Goals

- Not writing implementation code. Each named adopter still needs its own design pass covering the specific store/state migration in that chain.
- Not opining on T7 UI RunEvent Projection — that comes after enough adopters are in for a pattern to be worth generalizing.
- Not touching the six chains' internal business flows. RunEnvelope adoption is about **observability** and **state ownership**, not restructuring the pipeline.

## Baseline: What "Knowledge Jobs" actually contains

The label covers four different flavors, each with different risk:

| Component | File | Shape | Why it's tricky |
|---|---|---|---|
| **CascadeWorker** | `src/service/search/index/cascade/CascadeWorker.ts` | Long-lived background worker with `static instance: CascadeWorker \| null`, event-driven drain loop. | T13 residual — the `static instance` singleton missed the AppRuntimeRegistry migration. `indexUpdater.ts:235` still calls `CascadeWorker.getInstance()?.notifyFlushCompleted()`. Refactoring the ownership before RunEnvelope adoption would be conservative but out of scope for a T3 adoption PR. |
| **IndexInitializer** | `src/service/search/index/indexInitializer.ts` | One-shot startup task. Reports progress via `ProgressReporterPort`. | Cleanly injected via constructor DI already (T13 done). Ideal candidate. |
| **GraphCleanupService** | `src/service/search/index/maintenance/GraphCleanupService.ts` | One-shot function. Returns `{ orphanEdgesDeleted, nodesWithoutIndexedDocumentDeleted }`. | User-triggered from DevTools only. Not a "long task"; result is a two-integer counter. Adopting RunEnvelope here yields little observability value. |
| **SearchUpdateListener** | `src/service/search/index/…` | File-modify listener queue. | Continuous work, not "one run"; the RunEnvelope model of RunSession-per-invocation doesn't fit a queue processor. |

**Conclusion**: "Knowledge Jobs" is not one chain. The right first adopter is `IndexInitializer.checkAndUpdateIndex()`.

## Recommended order

### Adopter 1 (next PR): `IndexInitializer.checkAndUpdateIndex()`

**Why**
- Already DI-clean (constructor takes `ProgressReporterPort`, `IndexService`); no singleton entanglement.
- One-shot per invocation — natural fit for one RunSession per call.
- Already has explicit progress reporting via `reporter.show(...)`; wiring parallel `recorder.recordProgress(...)` is trivial.
- Runs at startup, so a golden trace fixture can be built by driving the initializer with a stub `IndexService`.
- Has a clear "result" — index status (files scanned, files needing update, files updated) — perfect for the `artifact` event.

**Wiring sketch**

```ts
// service/search/index/indexInitializerRun.ts (new file, mirrors VaultLintRun.ts pattern)
import { InMemoryRunRecorder, defaultClock, defaultIdFactory,
         type RunClock, type RunIdFactory } from '@/service/run-envelope';

export const INDEX_INITIALIZER_CAPABILITY_ID = 'knowledge.index.initialize';

export interface IndexInitializerRunOptions {
  recorder?: InMemoryRunRecorder;
  clock?: RunClock;
  idFactory?: RunIdFactory;
  onEvent?: (event, snapshot) => void;
  initializer: IndexInitializer;   // app-owned; app layer passes this in
  trigger: 'startup' | 'manual';
}

export async function runIndexInitializer(options: IndexInitializerRunOptions) {
  const recorder = options.recorder ?? new InMemoryRunRecorder({
    clock: options.clock ?? defaultClock(),
    idFactory: options.idFactory ?? defaultIdFactory('idx-init'),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });

  recorder.start({
    capabilityId: INDEX_INITIALIZER_CAPABILITY_ID,
    trigger: options.trigger,
  });
  recorder.recordStatus('running');

  try {
    // The initializer needs a small callback surface so it can emit
    // progress into the recorder without reaching for it directly.
    const stats = await options.initializer.checkAndUpdateIndexWithObserver({
      onScanBatch(processed, total) {
        recorder.recordProgress({ phase: 'scan', processed, total });
      },
      onUpdate(path) {
        recorder.recordProgress({ phase: 'update', label: path });
      },
      onError(step, message) {
        recorder.recordLog('warn', `${step}: ${message}`);
      },
    });

    const artifact = recorder.recordArtifact({
      kind: 'result',
      title: `Index initialize (${stats.scanned} scanned, ${stats.updated} updated)`,
      contentType: 'application/vnd.peak.index-initialize+json',
    });
    const session = recorder.finish('completed');
    return { stats, session, events: recorder.getEvents(), artifact };
  } catch (err) {
    recorder.recordError(err instanceof Error ? err.message : String(err), false);
    recorder.finish('failed');
    throw err;
  }
}
```

**Callsite changes**
- `main.ts:643-651` — replace the direct `new IndexInitializer(...)` + eventual `await this.indexInitializer.checkAndUpdateIndex()` with `runIndexInitializer({ initializer, trigger: 'startup' })`.
- `IndexInitializer.checkAndUpdateIndex()` grows a sibling method `checkAndUpdateIndexWithObserver(observer)`. The old method delegates to it with a no-op observer (backward compat during migration; delete when no other caller remains).

**Golden trace test**
- File: `test/index-initializer-run.test.ts`.
- Stub `IndexService` returning a canned status → runs `runIndexInitializer` → assert the RunEvent sequence: `status(running)` → `progress(scan, 1, 3)` → `progress(scan, 2, 3)` → `progress(scan, 3, 3)` → `artifact` → `status(completed)`.
- Use injected `clock` + `idFactory` so timestamps and ids are byte-stable.

**No-Dual-System**
- Remove the direct `checkAndUpdateIndex()` call from `main.ts` in the same PR. `IndexInitializer.checkAndUpdateIndex()` remains as a thin facade delegating to `checkAndUpdateIndexWithObserver`.

### Adopter 2 (subsequent PR): AI Analysis via `ReportOrchestrator`

**Why second, not first**
- Higher value (visible to user, currently splits state across `ReportOrchestrator` + `ui/store/searchSessionStore`), but bigger surface: touches Report streaming, prompt orchestration, and UI state.
- Wants `IndexInitializer` adoption first so the UI has already seen a RunEvent-consuming component paradigm before AI Analysis brings its bigger flow.

**Sketch**
- Create `service/search/analysis/AiAnalysisRun.ts` mirroring `VaultLintRun.ts`.
- Capability id: `knowledge.analysis.report` (or match handbook §8 naming when ready).
- The orchestrator's existing "phase" reporting (retrieval → rerank → summarize → report generate) maps directly to `progress(phase, ...)` events.
- Final report becomes an `artifact` with `kind: 'report'` pointing to the vault path where it lands.
- UI store (`searchSessionStore`) becomes a projection: its "activeAnalysisId" is a `runId`; the "phase/progress/output" fields all derive from `getEvents()` on the recorder.

### Deferred (needs user oversight before touching)

**CascadeWorker** — Fix T13 residual first (move to `AppRuntimeRegistry` ownership + drop `static instance`), then adopt RunEnvelope for each `drainDebt()` invocation. This is 2 PRs.

**Chat streaming** — Highest complexity: `LLMStreamEvent` normalization intersects with tool-call semantics and provider fan-out. Adopting RunEnvelope here should not fight the AI SDK's stream shape; instead RunEnvelope wraps at the service boundary (above `useChatSubmit`). Do it after Chat harness backend integration stabilizes.

**Copilot review** — Similarly complex: needs the `ArtifactRef` produced by RunEnvelope to actually replace `CopilotReviewHistoryService`'s ad-hoc artifact model. Do it after AI Analysis proves the artifact pattern.

**Harness agent loop** — `AgentLoop.ts` already emits `tool_call` / `text` / `usage` events into its own trace. Adopting RunEnvelope means retranslating those events into `RunEvent` variants. Feasible but needs golden-trace test to prove no semantic change.

**Search retrieval** — Adopting RunEnvelope here mostly affects background sessions; `QuickSearchBackgroundRuntime` already has a session/cancel skeleton that overlaps conceptually with RunSession. Best done alongside AI Analysis since they share the same UI store surface.

## Sequencing summary

```
Wave 2.A execution order (recommended):

  1. IndexInitializer         (small, DI-clean, one-shot)     [next PR]
  2. AI Analysis              (bigger, UI store split fix)    [+1 PR]
  3. CascadeWorker            (needs T13 residual first)      [+2 PRs total]
  4. Search retrieval         (paired with AI Analysis UI)    [could pair with 2]
  5. Copilot review           (needs artifact story from #2)
  6. Chat streaming           (highest complexity)
  7. Harness agent loop       (semantic-equivalence golden)
```

## Prerequisites already landed (2026-07-02)

- **T3A**: `RunSession` / `RunEvent` / `ArtifactRef` types + `InMemoryRunRecorder` — `src/service/run-envelope/`.
- **T3B**: `VaultLintRun.ts` — the canonical adoption pattern to mirror.
- **Shared helpers**: `defaultClock` + `defaultIdFactory` extracted to `run-envelope/helpers.ts` (2026-07-02) so future runners share the same id shape.

## Cross-cutting rules (from parent spec §Cross-Cutting Rules)

Every adopter PR must:
1. Delete or facade-shrink the pre-existing state truth (No Dual System).
2. Ship a golden-trace test fixture using injected clock + idFactory.
3. Update the UI store consuming that state to be a projection, or defer with an explicit follow-up TODO.
4. Update `docs/01-architecture.html` §roadmap T3 row with the newly-covered chain.

## Verification (this spec)

- `IndexInitializer.checkAndUpdateIndex()` exists at the file path claimed above. ✅ Verified 2026-07-02.
- `CascadeWorker` has `static instance` field. ✅ Verified 2026-07-02.
- `VaultLintRun.ts` uses `defaultClock` / `defaultIdFactory` from `@/service/run-envelope`. ✅ Verified 2026-07-02 (helpers extracted this session).

## Follow-up

When Adopter 1 (IndexInitializer) is ready to start, this spec becomes the input to its implementation plan. Write `docs/superpowers/plans/2026-07-XX-t3-index-initializer-adoption.md` mirroring the wave1 plan pattern.
