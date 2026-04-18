# Background Multi-Session AI Analysis

## Problem

When the user closes the AI analysis modal mid-analysis, the agent continues running in its closure but:
- The user cannot start a new analysis without overwriting the running one (singleton store)
- There is no way to see or manage background sessions
- Recent Analysis only shows completed records (no in-progress visibility)
- No re-attach mechanism to resume interaction with a background session

## Design

### Architecture Overview

Introduce `BackgroundSessionManager` — an in-memory singleton that manages sessions detached from the foreground UI.

```
┌─────────────┐     close modal      ┌──────────────────────┐
│  Foreground  │ ──────────────────▶  │ BackgroundSession[]  │
│  Store       │                      │ (max 3 concurrent,   │
│  (singleton) │ ◀──────────────────  │  rest queued)        │
└─────────────┘     restore to fg     └──────────────────────┘
                                              │
                                              ▼
                                      ┌──────────────┐
                                      │ Recent list   │
                                      │ (top section) │
                                      └──────────────┘
```

The foreground Zustand store remains a singleton. Background sessions hold plain-object snapshots, not additional Zustand instances.

### BackgroundSession Data Structure

```typescript
interface BackgroundSession {
  id: string;                    // same as session run id
  query: string;
  title: string | null;
  createdAt: number;
  status: 'streaming' | 'plan-ready' | 'queued' | 'completed' | 'error';
  savedPath: string | null;     // md file path (exists from plan phase via early-save)

  // Live references (null when queued or completed)
  agentRef: AsyncGenerator | null;
  abortController: AbortController | null;
  reportOrchestrator: ReportOrchestrator | null;

  // Full session state snapshot
  snapshot: V2SessionSnapshot;

  // Error info
  error: string | null;
}
```

`V2SessionSnapshot` is the serializable subset of `SearchSessionState` — all V2 fields (plan sections, steps, timeline, sources, summary, rounds, usage, duration, etc.) minus functions and refs.

### BackgroundSessionManager

```typescript
class BackgroundSessionManager {
  private static instance: BackgroundSessionManager;
  static getInstance(): BackgroundSessionManager;

  private sessions: Map<string, BackgroundSession>;
  private queue: string[];                     // ids waiting to start
  private readonly MAX_CONCURRENT = 3;

  // Lifecycle
  detachForeground(): BackgroundSession | null;  // snapshot fg store → bg session
  restoreToForeground(sessionId: string): void;  // bg session → fg store
  cancelSession(sessionId: string): void;

  // Stream consumption (runs independently of React)
  private consumeStream(session: BackgroundSession): Promise<void>;
  private processEvent(session: BackgroundSession, event: LLMStreamEvent): void;

  // Queue management
  private tryStartNext(): void;

  // Subscriptions (for UI reactivity)
  subscribe(listener: () => void): () => void;  // simple pub/sub for React
  getSessions(): BackgroundSession[];
  getSession(id: string): BackgroundSession | null;
}
```

### Lifecycle Flows

#### 1. Modal Close — Detach to Background

When `QuickSearchModal.onClose()` fires and the foreground store has `status === 'streaming'` or has plan sections with `!v2PlanApproved`:

1. `BackgroundSessionManager.detachForeground()` is called
2. Snapshots the entire foreground store state into a `BackgroundSession`
3. Transfers `agentRef`, `abortController`, `reportOrchestrator` references from the hook closure
4. Starts independent `consumeStream()` on the BackgroundSessionManager (not tied to React)
5. Foreground store is reset to idle
6. If concurrent count < 3, session runs immediately; otherwise status = `queued`

**Critical implementation detail:** The `consumeStream` loop currently lives in `useSearchSession.ts:135-153`. This logic must be extracted into a standalone async function that can run in either the hook or the BackgroundSessionManager. The event routing (`useEventRouter` dispatches) must also be refactored: when running in background, events write to `BackgroundSession.snapshot` instead of the Zustand stores.

#### 2. Plan Ready — Pause and Notify

When a background session's agent emits a plan/HITL event:

1. Session status → `plan-ready`
2. Stream consumption pauses (stop iterating the async generator; the HITL callback keeps the generator suspended)
3. Plan is already persisted to md file (via early-save from prior work)
4. Obsidian `Notice` fires: "Analysis plan ready: {title}" with a click handler that opens the modal and restores this session

#### 3. Restore to Foreground

Triggered by clicking an in-progress item in Recent list, or clicking a Notice:

1. Check foreground store status:
   - If `streaming` or has unapproved plan → detach current foreground to background first (step 1)
   - If `completed` or `idle` → directly overwrite
2. Write `BackgroundSession.snapshot` into the foreground store via `store.setState()`
3. Re-bind agent references to the foreground hook:
   - For `streaming` sessions: resume stream consumption in the hook's `consumeStream`
   - For `plan-ready` sessions: user sees the plan UI, can approve → triggers `ReportOrchestrator`
4. Remove session from BackgroundSessionManager

#### 4. Approve and Report Generation

Standard foreground flow — user approves plan in the UI, `ReportOrchestrator.generateReport()` runs, writes to the foreground store, auto-save persists the result.

#### 5. Concurrency Control

- At most 3 sessions in `streaming` status simultaneously
- Sessions beyond 3 are set to `queued` status
- When a session transitions to `plan-ready`, `completed`, or `error`, `tryStartNext()` promotes the oldest queued session to `streaming` and starts its `consumeStream()`
- `plan-ready` does NOT count against the 3-concurrent limit (the agent is paused, no LLM calls)

### Event Routing Refactor

Currently `useEventRouter` is a React hook that dispatches events to Zustand stores. For background sessions, events must update the plain-object snapshot instead.

Introduce `EventDispatcher` — a pure function (no React dependency):

```typescript
function dispatchEvent(
  event: LLMStreamEvent,
  target: {
    // Mutator functions that work on either store or snapshot
    pushStep: (step: V2ToolStep) => void;
    appendSectionChunk: (id: string, chunk: string) => void;
    addSource: (source: V2Source) => void;
    setPlanSections: (sections: V2Section[]) => void;
    // ... etc
  }
): void;
```

- **Foreground mode:** target functions are `useSearchSessionStore.getState().pushV2Step`, etc.
- **Background mode:** target functions mutate `BackgroundSession.snapshot` directly

### Recent Analysis UI Changes

#### Top Section: Active Sessions

Rendered above the existing completed history list. Data source: `BackgroundSessionManager.getSessions()` via `useSyncExternalStore`.

Each card shows:
- Title or query text (truncated)
- Status badge:
  - 🔄 spinner + "Analyzing..." for `streaming`
  - 📋 "Plan Ready" for `plan-ready` (distinct color, e.g. amber)
  - ⏳ "Queued" for `queued`
- Time elapsed since start
- Click → restore to foreground
- × button → cancel and remove

#### Current Foreground Session

If the foreground store has an active session (`status !== 'idle'`), show it as the first item in the Active Sessions area with a "Current" badge, so the user sees all sessions in one place.

### Notice Behavior

| Event | Notice text | Clickable | Click action |
|-------|------------|-----------|--------------|
| Plan ready | "📋 Analysis plan ready: {title}" | Yes | Open modal, restore session |
| Completed | "✅ Analysis complete: {title}" | Yes | Open modal, restore session |
| Error | "❌ Analysis failed: {title}" | No | — |

Notice click handler: `BackgroundSessionManager.getInstance().restoreToForeground(sessionId)` + open a new `QuickSearchModal`.

### Persistence

- **Early save** (already implemented): md file is created when plan sections appear
- **Background sessions** update the md file incrementally when snapshot changes (reuse `persistAnalysisDocToPath`)
- **On completion**: full auto-save + `AIAnalysisHistoryRecord` insert (existing pipeline)
- **Plan-ready sessions**: md file exists with plan outline + sources, no report sections yet

### Error Handling

- If a background session's agent throws, catch in `consumeStream`, set `status: 'error'`, store error message, fire Notice
- If the user cancels a background session, `abortController.abort()`, remove from manager
- If the plugin unloads (`onunload`), abort all background sessions gracefully

### What Does NOT Change

- Foreground Zustand store remains a singleton — no multi-instance store
- `useSearchSession` hook API stays the same for foreground use
- `AIAnalysisHistoryService` schema unchanged — still only stores completed records
- Completed history list in Recent Analysis unchanged
- All existing auto-save, incremental persist, and restore-from-vault-path logic unchanged

### Key Files to Modify

| File | Change |
|------|--------|
| `src/service/BackgroundSessionManager.ts` | **New** — core manager class |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | Extract `consumeStream` to standalone function; add detach/restore methods |
| `src/ui/view/quick-search/hooks/useEventRouter.ts` | Extract `EventDispatcher` pure function from hook |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | Add `snapshotState()` / `restoreState(snapshot)` methods |
| `src/ui/view/QuickSearchModal.tsx` | Call `detachForeground()` in `onClose()` when session is active |
| `src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx` | Add Active Sessions top section |
| `src/ui/view/quick-search/tab-AISearch.tsx` | Handle restore-from-background flow |
| `src/main.ts` | Register BackgroundSessionManager; abort all on `onunload` |

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Memory leak from orphaned agent closures | BackgroundSessionManager tracks all sessions; plugin `onunload` aborts all |
| Snapshot/store state shape drift | `V2SessionSnapshot` type derived from `V2SessionState` — TypeScript enforces shape match |
| Event dispatcher divergence (fg vs bg paths) | Single `EventDispatcher` function used by both paths |
| Race condition on detach/restore | Synchronous snapshot + transfer; manager operations are not async |
| Legacy bridge stores (`aiAnalysisStore`) stale after restore | `restoreToForeground` must also populate legacy stores via bridge |
