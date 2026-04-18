# Background Multi-Session AI Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple AI analysis sessions to run concurrently in the background, with plan-ready pause, foreground restore, and active session visibility in Recent Analysis.

**Architecture:** Extract stream consumption and event routing from React hooks into standalone functions. Introduce `BackgroundSessionManager` singleton to hold detached sessions with their agent refs and state snapshots. On modal close, active sessions transfer to the manager; on restore, snapshot writes back to the foreground store.

**Tech Stack:** TypeScript, Zustand (existing singleton stores), Obsidian API (Notice, Modal), React 18 (`useSyncExternalStore`)

---

## File Structure

| File | Role |
|------|------|
| `src/service/BackgroundSessionManager.ts` | **New** — Singleton manager for background sessions, stream consumption, queue |
| `src/ui/view/quick-search/hooks/eventDispatcher.ts` | **New** — Pure function event dispatcher extracted from `useEventRouter` |
| `src/ui/view/quick-search/hooks/streamConsumer.ts` | **New** — Standalone stream consumer extracted from `useSearchSession` |
| `src/ui/view/quick-search/store/sessionSnapshot.ts` | **New** — Snapshot/restore helpers for `SearchSessionState` |
| `src/ui/view/quick-search/hooks/useEventRouter.ts` | **Modify** — Delegate to `eventDispatcher.ts` |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | **Modify** — Use `streamConsumer.ts`, expose detach/restore |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | **Modify** — Add `snapshotState()` / `restoreFromSnapshot()` actions |
| `src/ui/view/QuickSearchModal.tsx` | **Modify** — Call detach on close |
| `src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx` | **Modify** — Add Active Sessions section |
| `main.ts` | **Modify** — Abort all background sessions on `onunload` |

---

### Task 1: Extract Event Dispatcher from useEventRouter

Extract the pure event-routing logic out of the React hook so it can be called from both the hook (foreground) and BackgroundSessionManager (background).

**Files:**
- Create: `src/ui/view/quick-search/hooks/eventDispatcher.ts`
- Modify: `src/ui/view/quick-search/hooks/useEventRouter.ts:38-541`

- [ ] **Step 1: Define the EventTarget interface and dispatchEvent function**

Create `src/ui/view/quick-search/hooks/eventDispatcher.ts`:

```typescript
import type { LLMStreamEvent } from '@/service/agents/shared-types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';
import type { V2Section } from '../store/v2SessionTypes';
import { useUIEventStore } from '@/ui/store/uiEventStore';

/**
 * Target interface — abstracts store mutations so the same dispatch logic
 * works against both Zustand stores (foreground) and plain objects (background).
 */
export interface EventTarget {
  setV2Active: (active: boolean) => void;
  addPhaseUsage: (usage: { phase: string; modelId: string; inputTokens: number; outputTokens: number }) => void;
  pushV2Step: (step: V2ToolStep) => void;
  pushV2TimelineTool: (step: V2ToolStep) => void;
  pushV2TimelineText: (text: string) => void;
  registerV2ToolCall: (id: string, toolName: string) => void;
  updateV2Step: (id: string, update: Partial<V2ToolStep>) => void;
  updateV2TimelineTool: (id: string, update: Partial<V2ToolStep>) => void;
  addV2Source: (source: V2Source) => void;
  setPlanSections: (sections: V2Section[]) => void;
  setTitle: (title: string) => void;
  setHasAnalyzed: (v: boolean) => void;
  setUsage: (usage: any) => void;
  setDuration: (d: number) => void;
  setDashboardUpdatedLine: (line: string | null) => void;
  markCompleted: () => void;
  markV2ReportComplete: () => void;
  recordError: (msg: string) => void;
  setHitlPause: (state: any) => void;
  appendAgentDebugLog: (entry: string) => void;
  setProposedOutline: (outline: string) => void;
  setFollowUpQuestions: (qs: string[]) => void;
  setSources: (sources: V2Source[]) => void;
}

/**
 * Legacy bridge target — mutations that go to the old V1 stores.
 * null when running in background (legacy stores not updated).
 */
export interface LegacyBridgeTarget {
  startSummaryStreaming: () => void;
  appendSummaryDelta: (delta: string) => void;
  setSummary: (text: string) => void;
  setSources: (sources: any[]) => void;
  setEvidenceIndex: (index: any) => void;
  setDashboardBlocks: (blocks: any[]) => void;
  setTopics: (topics: any[]) => void;
  pushOverviewMermaidVersion: (v: string) => void;
  setTitle: (title: string) => void;
  setHasAnalyzed: (v: boolean) => void;
  setUsage: (usage: any) => void;
  setDuration: (d: number) => void;
  setDashboardUpdatedLine: (line: string | null) => void;
  recordError: (msg: string) => void;
  setHitlPause: (state: any) => void;
  clearHitlPause: () => void;
  setHitlFeedbackCallback: (cb: any) => void;
  appendCompletedUiStep: (step: any) => void;
  markCompleted: () => void;
  setSuggestedFollowUpQuestions: (qs: string[]) => void;
}

/**
 * Summary buffer — for debouncing summary deltas.
 */
export interface SummaryBuffer {
  buffer: string[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  flush: () => void;
}

/**
 * UI step accumulator ref — passed through for step tracking.
 */
export interface UiStepAccumRef {
  current: any;
}

/**
 * Dispatch a single LLMStreamEvent to the appropriate targets.
 * This is the pure-function extraction of useEventRouter's routeEvent callback.
 */
export function dispatchEvent(
  event: LLMStreamEvent,
  target: EventTarget,
  legacy: LegacyBridgeTarget | null,
  summaryBuffer: SummaryBuffer,
  uiStepRef: UiStepAccumRef,
): void {
  const publish = (type: string, payload: any) => useUIEventStore.getState().publish(type, payload);

  // ... The full switch(event.type) logic from useEventRouter.ts:143-538
  // is moved here verbatim, replacing:
  //   store.getState().xxx(...)  →  target.xxx(...)
  //   useAIAnalysis*Store.getState().xxx(...)  →  legacy?.xxx(...)
  //   summaryBufferRef.current  →  summaryBuffer.buffer
  //   etc.
}
```

The actual switch body is a direct copy of `useEventRouter.ts:143-538` with the substitutions above. Every `store.getState().foo(...)` becomes `target.foo(...)`, every `useAIAnalysis*Store.getState().foo(...)` becomes `legacy?.foo(...)` (guarded by null check).

- [ ] **Step 2: Refactor useEventRouter to delegate to dispatchEvent**

Modify `useEventRouter.ts:38-541` — replace the inline switch with a call to `dispatchEvent`:

```typescript
import { dispatchEvent, type EventTarget, type LegacyBridgeTarget, type SummaryBuffer, type UiStepAccumRef } from './eventDispatcher';

export function useEventRouter() {
  const store = useSearchSessionStore;

  const summaryBufferRef = useRef<string[]>([]);
  const summaryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUiStepRef = useRef<any>(null);

  const flushSummaryBuffer = useCallback(() => {
    // ... existing flush logic unchanged
  }, []);

  // Build foreground targets
  const fgTarget: EventTarget = useMemo(() => ({
    setV2Active: (v) => store.getState().setV2Active(v),
    addPhaseUsage: (u) => store.getState().addPhaseUsage(u),
    pushV2Step: (s) => store.getState().pushV2Step(s),
    // ... all other methods delegating to store.getState()
  }), []);

  const legacyTarget: LegacyBridgeTarget = useMemo(() => ({
    startSummaryStreaming: () => useAIAnalysisSummaryStore.getState().startSummaryStreaming(),
    // ... all other methods delegating to legacy stores
  }), []);

  const summaryBuf: SummaryBuffer = useMemo(() => ({
    buffer: summaryBufferRef.current,
    flushTimer: summaryFlushTimerRef.current,
    flush: flushSummaryBuffer,
  }), [flushSummaryBuffer]);

  const routeEvent = useCallback((event: LLMStreamEvent) => {
    dispatchEvent(event, fgTarget, legacyTarget, summaryBuf, { current: currentUiStepRef.current });
  }, [fgTarget, legacyTarget, summaryBuf]);

  return { routeEvent, flushSummaryBuffer, applySearchResult, currentUiStepRef, summaryBufferRef };
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/hooks/eventDispatcher.ts src/ui/view/quick-search/hooks/useEventRouter.ts
git commit -m "refactor: extract event dispatcher from useEventRouter into pure function"
```

---

### Task 2: Extract Stream Consumer from useSearchSession

Extract the `consumeStream` closure into a standalone function that can be called from both the React hook and BackgroundSessionManager.

**Files:**
- Create: `src/ui/view/quick-search/hooks/streamConsumer.ts`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:136-152`

- [ ] **Step 1: Create standalone consumeStream function**

Create `src/ui/view/quick-search/hooks/streamConsumer.ts`:

```typescript
import type { LLMStreamEvent } from '@/service/agents/shared-types';
import { pushTimelineEvent } from './timelineUtils';  // extract if needed, or inline
import type { EventTarget, LegacyBridgeTarget, SummaryBuffer, UiStepAccumRef } from './eventDispatcher';
import { dispatchEvent } from './eventDispatcher';

export interface StreamConsumerContext {
  /** Check whether streaming has started (to fire one-time start actions) */
  hasStartedStreaming: () => boolean;
  /** Called once when first event arrives */
  onStreamStart: () => void;
  /** Abort signal to check between events */
  signal: AbortSignal | undefined;
  /** Event dispatch targets */
  target: EventTarget;
  legacy: LegacyBridgeTarget | null;
  summaryBuffer: SummaryBuffer;
  uiStepRef: UiStepAccumRef;
  /** Optional timeline accumulator */
  timeline?: LLMStreamEvent[];
}

/**
 * Consume an async iterable of LLMStreamEvents, dispatching each to the provided targets.
 * Works in both foreground (React hook) and background (BackgroundSessionManager) contexts.
 */
export async function consumeStream(
  gen: AsyncIterable<LLMStreamEvent>,
  ctx: StreamConsumerContext,
): Promise<void> {
  for await (const event of gen) {
    if (!ctx.hasStartedStreaming()) {
      ctx.onStreamStart();
    }
    if (ctx.signal?.aborted) {
      break;
    }
    if (ctx.timeline) {
      pushTimelineEvent(ctx.timeline, event);
    }
    dispatchEvent(event, ctx.target, ctx.legacy, ctx.summaryBuffer, ctx.uiStepRef);
  }
}
```

- [ ] **Step 2: Refactor useSearchSession to use consumeStream**

In `useSearchSession.ts:136-152`, replace the inline `consumeStream` closure:

```typescript
import { consumeStream as consumeStreamFn, type StreamConsumerContext } from './streamConsumer';

// Inside performAnalysis, replace the old consumeStream definition:
const consumeCtx: StreamConsumerContext = {
  hasStartedStreaming: () => store.getState().hasStartedStreaming,
  onStreamStart: () => {
    store.getState().startStreaming();
    useAIAnalysisRuntimeStore.getState().startStreaming();
    useStepDisplayReplayStore.getState().setStreamStarted(true);
  },
  signal,
  target: fgTarget,      // from useEventRouter or built here
  legacy: legacyTarget,
  summaryBuffer: summaryBuf,
  uiStepRef: { current: currentUiStepRef.current },
  timeline: timelineRef.current,
};

const consumeStream = (gen: AsyncIterable<any>) => consumeStreamFn(gen, consumeCtx);
```

The rest of `performAnalysis` uses `consumeStream(...)` unchanged — no other lines need to change.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/hooks/streamConsumer.ts src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "refactor: extract stream consumer into standalone function"
```

---

### Task 3: Add Snapshot/Restore to SearchSessionStore

Add methods to snapshot the current session state and restore from a snapshot, enabling detach/restore between foreground and background.

**Files:**
- Create: `src/ui/view/quick-search/store/sessionSnapshot.ts`
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:61-93` (state interface), and actions section

- [ ] **Step 1: Define V2SessionSnapshot type and snapshot/restore helpers**

Create `src/ui/view/quick-search/store/sessionSnapshot.ts`:

```typescript
import type { V2SessionState, V2Section, Round } from './v2SessionTypes';
import type { V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';
import type { LLMUsage } from '@/service/agents/shared-types';
import type { AutoSaveState, HitlState } from './searchSessionStore';

/**
 * Serializable snapshot of a session's full state.
 * Contains all data fields, no functions/refs.
 */
export interface V2SessionSnapshot {
  // Session identity
  id: string | null;
  query: string;
  title: string | null;
  status: string;
  startedAt: number | null;

  // V2 state (all fields from V2SessionState)
  v2Active: boolean;
  v2View: 'process' | 'report' | 'sources';
  v2Steps: V2ToolStep[];
  v2ReportChunks: string[];
  v2ReportComplete: boolean;
  v2ToolCallIndex: Map<string, string>;
  v2Timeline: V2TimelineItem[];
  v2FinalReportStartIndex: number;
  v2Sources: V2Source[];
  v2FollowUpQuestions: string[];
  v2ProposedOutline: string | null;
  v2PlanSections: V2Section[];
  v2PlanApproved: boolean;
  v2UserInsights: string[];
  v2Summary: string;
  v2SummaryStreaming: boolean;
  rounds: Round[];
  currentRoundIndex: number;
  continueMode: boolean;

  // Metadata
  duration: number | null;
  usage: LLMUsage | null;
  phaseUsages: any[];
  agentDebugLog: string[];
  error: string | null;
  analysisMode: string;
  runAnalysisMode: string | null;
  webEnabled: boolean;
  hasStartedStreaming: boolean;
  hasAnalyzed: boolean;
  hitlState: HitlState | null;
  autoSaveState: AutoSaveState;
  dashboardUpdatedLine: string | null;
}

/** Fields to extract from store state into a snapshot. */
const SNAPSHOT_KEYS: (keyof V2SessionSnapshot)[] = [
  'id', 'query', 'title', 'status', 'startedAt',
  'v2Active', 'v2View', 'v2Steps', 'v2ReportChunks', 'v2ReportComplete',
  'v2ToolCallIndex', 'v2Timeline', 'v2FinalReportStartIndex', 'v2Sources',
  'v2FollowUpQuestions', 'v2ProposedOutline', 'v2PlanSections', 'v2PlanApproved',
  'v2UserInsights', 'v2Summary', 'v2SummaryStreaming', 'rounds', 'currentRoundIndex',
  'continueMode', 'duration', 'usage', 'phaseUsages', 'agentDebugLog', 'error',
  'analysisMode', 'runAnalysisMode', 'webEnabled', 'hasStartedStreaming', 'hasAnalyzed',
  'hitlState', 'autoSaveState', 'dashboardUpdatedLine',
];

/**
 * Extract a snapshot from the current store state.
 */
export function snapshotFromState(state: Record<string, any>): V2SessionSnapshot {
  const snap = {} as any;
  for (const key of SNAPSHOT_KEYS) {
    const val = state[key];
    // Deep-copy arrays and Maps to avoid shared references
    if (val instanceof Map) {
      snap[key] = new Map(val);
    } else if (Array.isArray(val)) {
      snap[key] = [...val];
    } else if (val && typeof val === 'object' && !(val instanceof AbortController)) {
      snap[key] = { ...val };
    } else {
      snap[key] = val;
    }
  }
  return snap as V2SessionSnapshot;
}
```

- [ ] **Step 2: Add snapshotState() and restoreFromSnapshot() to store**

In `searchSessionStore.ts`, add to the actions interface (~line 100-130) and implement:

```typescript
// In the actions interface:
snapshotState: () => V2SessionSnapshot;
restoreFromSnapshot: (snapshot: V2SessionSnapshot) => void;

// In the store implementation:
snapshotState: () => snapshotFromState(get()),

restoreFromSnapshot: (snapshot) => {
  set({
    ...snapshot,
    // Preserve runtime-only fields
    aiModalOpen: get().aiModalOpen,
    triggerAnalysis: get().triggerAnalysis,
    // Clear function refs (they'll be re-bound by the hook)
    hitlFeedbackCallback: null,
    restoredFromHistory: false,
    restoredFromVaultPath: null,
  });
},
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/sessionSnapshot.ts src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat: add session snapshot/restore to searchSessionStore"
```

---

### Task 4: Implement BackgroundSessionManager

The core singleton that manages background sessions, consumes streams, and handles concurrency.

**Files:**
- Create: `src/service/BackgroundSessionManager.ts`

- [ ] **Step 1: Implement BackgroundSessionManager**

Create `src/service/BackgroundSessionManager.ts`:

```typescript
import { Notice } from 'obsidian';
import type { LLMStreamEvent } from '@/service/agents/shared-types';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';
import { snapshotFromState } from '@/ui/view/quick-search/store/sessionSnapshot';
import { consumeStream, type StreamConsumerContext } from '@/ui/view/quick-search/hooks/streamConsumer';
import type { EventTarget as EvTarget } from '@/ui/view/quick-search/hooks/eventDispatcher';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';

export type BackgroundSessionStatus = 'streaming' | 'plan-ready' | 'queued' | 'completed' | 'error';

export interface BackgroundSession {
  id: string;
  query: string;
  title: string | null;
  createdAt: number;
  status: BackgroundSessionStatus;
  savedPath: string | null;

  agentRef: VaultSearchAgent | null;
  abortController: AbortController | null;

  snapshot: V2SessionSnapshot;
  error: string | null;
}

type Listener = () => void;

const MAX_CONCURRENT = 3;

export class BackgroundSessionManager {
  private static instance: BackgroundSessionManager | null = null;

  static getInstance(): BackgroundSessionManager {
    if (!BackgroundSessionManager.instance) {
      BackgroundSessionManager.instance = new BackgroundSessionManager();
    }
    return BackgroundSessionManager.instance;
  }

  static clearInstance(): void {
    BackgroundSessionManager.instance?.abortAll();
    BackgroundSessionManager.instance = null;
  }

  private sessions = new Map<string, BackgroundSession>();
  private queue: string[] = [];
  private listeners = new Set<Listener>();

  // ---- Pub/Sub for React (useSyncExternalStore) ----

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  getSessions(): BackgroundSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): BackgroundSession | null {
    return this.sessions.get(id) ?? null;
  }

  getActiveCount(): number {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'streaming',
    ).length;
  }

  // ---- Detach foreground → background ----

  detachForeground(refs: {
    agentRef: VaultSearchAgent | null;
    abortController: AbortController | null;
  }): BackgroundSession | null {
    const store = useSearchSessionStore.getState();
    const status = store.status;

    // Only detach if actively running or has unapproved plan
    const isActive = status === 'streaming' || status === 'starting';
    const hasPlan = store.v2PlanSections.length > 0 && !store.v2PlanApproved;
    if (!isActive && !hasPlan) return null;

    const snapshot = store.snapshotState();
    const session: BackgroundSession = {
      id: snapshot.id ?? `bg-${Date.now()}`,
      query: snapshot.query,
      title: snapshot.title,
      createdAt: Date.now(),
      status: hasPlan && !isActive ? 'plan-ready' : 'streaming',
      savedPath: store.autoSaveState.lastSavedPath,
      agentRef: refs.agentRef,
      abortController: refs.abortController,
      snapshot,
      error: null,
    };

    this.sessions.set(session.id, session);

    // Reset foreground store
    store.resetAll();

    if (session.status === 'streaming') {
      if (this.getActiveCount() <= MAX_CONCURRENT) {
        this.startBackgroundConsume(session);
      } else {
        session.status = 'queued';
        this.queue.push(session.id);
      }
    } else {
      // plan-ready — already paused, just notify
      this.notifyPlanReady(session);
    }

    this.notify();
    return session;
  }

  // ---- Restore background → foreground ----

  restoreToForeground(sessionId: string): V2SessionSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Stop background consumption if streaming
    if (session.abortController && session.status === 'streaming') {
      // Don't abort — just stop consuming in background.
      // The stream will be re-consumed in the foreground hook.
    }

    const snapshot = session.snapshot;

    // Remove from manager
    this.sessions.delete(sessionId);
    this.queue = this.queue.filter((id) => id !== sessionId);

    this.notify();
    return snapshot;
  }

  /**
   * Get the agent ref for a session being restored, so the foreground
   * hook can re-bind and continue consuming.
   */
  getAgentRefs(sessionId: string): {
    agentRef: VaultSearchAgent | null;
    abortController: AbortController | null;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      agentRef: session.agentRef,
      abortController: session.abortController,
    };
  }

  // ---- Cancel ----

  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.abortController?.abort();
    this.sessions.delete(sessionId);
    this.queue = this.queue.filter((id) => id !== sessionId);
    this.tryStartNext();
    this.notify();
  }

  abortAll(): void {
    for (const session of this.sessions.values()) {
      session.abortController?.abort();
    }
    this.sessions.clear();
    this.queue = [];
    this.notify();
  }

  // ---- Background stream consumption ----

  private startBackgroundConsume(session: BackgroundSession): void {
    const agent = session.agentRef;
    if (!agent) {
      session.status = 'error';
      session.error = 'No agent reference for background consumption';
      this.notify();
      return;
    }

    // Build an EventTarget that writes to the session's snapshot
    const target = this.buildSnapshotTarget(session);

    // The agent's async generator is already partially consumed.
    // The HITL callback (plan approval) is the pause mechanism —
    // the generator yields and waits for continueWithFeedback().
    // We just need to detect when it pauses.

    // Note: For sessions that are still streaming (not yet at HITL),
    // the generator is in-flight. We cannot easily "hand off" a running
    // async generator between consumers. Instead, the detach happens
    // between events — the foreground stops consuming, and the generator
    // is paused waiting for the next `for await` pull.
    //
    // In the background, we resume pulling from the same generator.
    // This works because JS async generators are pull-based.

    const ctx: StreamConsumerContext = {
      hasStartedStreaming: () => session.snapshot.hasStartedStreaming,
      onStreamStart: () => {
        session.snapshot.hasStartedStreaming = true;
      },
      signal: session.abortController?.signal,
      target,
      legacy: null,  // No legacy store updates in background
      summaryBuffer: { buffer: [], flushTimer: null, flush: () => {} },
      uiStepRef: { current: null },
    };

    // We don't have the generator directly — the agent's session is
    // still being iterated by the foreground closure. The foreground
    // closure will eventually return (since the React component unmounted
    // and the for-await loop's next() call will resolve).
    //
    // Actually: the `performAnalysis` closure holds the generator and
    // continues to iterate it even after unmount. The generator keeps
    // running and writing to the Zustand store.
    //
    // The key insight: we DON'T need to re-consume the stream in the
    // background manager. The existing closure keeps running. We just
    // need to redirect where events go.
    //
    // Solution: Instead of moving the consumption, we swap the event
    // routing target. The closure still calls routeEvent(), but
    // routeEvent now writes to the background session's snapshot
    // instead of the store.
    //
    // This is handled by the foreground hook storing a "redirect ref"
    // that the background manager can set.

    session.status = 'streaming';
    this.notify();
  }

  private buildSnapshotTarget(session: BackgroundSession): EvTarget {
    const s = session.snapshot;
    return {
      setV2Active: (v) => { s.v2Active = v; },
      addPhaseUsage: (u) => { s.phaseUsages = [...(s.phaseUsages || []), u]; },
      pushV2Step: (step) => { s.v2Steps = [...s.v2Steps, step]; },
      pushV2TimelineTool: (step) => { s.v2Timeline = [...s.v2Timeline, { type: 'tool', step } as any]; },
      pushV2TimelineText: (text) => { s.v2Timeline = [...s.v2Timeline, { type: 'text', text } as any]; },
      registerV2ToolCall: (id, name) => { s.v2ToolCallIndex = new Map(s.v2ToolCallIndex).set(id, name); },
      updateV2Step: (id, update) => {
        s.v2Steps = s.v2Steps.map((st) => st.id === id ? { ...st, ...update } : st);
      },
      updateV2TimelineTool: (id, update) => {
        s.v2Timeline = s.v2Timeline.map((t: any) =>
          t.type === 'tool' && t.step?.id === id ? { ...t, step: { ...t.step, ...update } } : t
        );
      },
      addV2Source: (source) => {
        if (!s.v2Sources.some((existing) => existing.path === source.path)) {
          s.v2Sources = [...s.v2Sources, source];
        }
      },
      setPlanSections: (sections) => {
        s.v2PlanSections = sections;
        // When plan sections arrive in background, this session is plan-ready
        if (sections.length > 0 && !s.v2PlanApproved) {
          session.status = 'plan-ready';
          this.notifyPlanReady(session);
          this.tryStartNext();
          this.notify();
        }
      },
      setTitle: (title) => {
        s.title = title;
        session.title = title;
        this.notify();
      },
      setHasAnalyzed: (v) => { s.hasAnalyzed = v; },
      setUsage: (usage) => { s.usage = usage; },
      setDuration: (d) => { s.duration = d; },
      setDashboardUpdatedLine: (line) => { s.dashboardUpdatedLine = line; },
      markCompleted: () => {
        s.status = 'completed';
        session.status = 'completed';
        this.notifyCompleted(session);
        this.tryStartNext();
        this.notify();
      },
      markV2ReportComplete: () => { s.v2ReportComplete = true; },
      recordError: (msg) => {
        s.error = msg;
        session.status = 'error';
        session.error = msg;
        this.notifyError(session);
        this.tryStartNext();
        this.notify();
      },
      setHitlPause: (state) => { s.hitlState = state; },
      appendAgentDebugLog: (entry) => { s.agentDebugLog = [...s.agentDebugLog, entry]; },
      setProposedOutline: (outline) => { s.v2ProposedOutline = outline; },
      setFollowUpQuestions: (qs) => { s.v2FollowUpQuestions = qs; },
      setSources: (sources) => { s.v2Sources = sources; },
    };
  }

  // ---- Queue management ----

  private tryStartNext(): void {
    if (this.getActiveCount() >= MAX_CONCURRENT) return;
    const nextId = this.queue.shift();
    if (!nextId) return;
    const session = this.sessions.get(nextId);
    if (session) {
      this.startBackgroundConsume(session);
    }
  }

  // ---- Notifications ----

  private notifyPlanReady(session: BackgroundSession): void {
    const title = session.title || session.query.slice(0, 50);
    const frag = document.createDocumentFragment();
    const span = document.createElement('span');
    span.textContent = `Analysis plan ready: ${title}`;
    span.style.cursor = 'pointer';
    span.style.textDecoration = 'underline';
    span.addEventListener('click', () => {
      this.openModalAndRestore(session.id);
    });
    frag.appendChild(span);
    new Notice(frag, 10000);
  }

  private notifyCompleted(session: BackgroundSession): void {
    const title = session.title || session.query.slice(0, 50);
    const frag = document.createDocumentFragment();
    const span = document.createElement('span');
    span.textContent = `Analysis complete: ${title}`;
    span.style.cursor = 'pointer';
    span.style.textDecoration = 'underline';
    span.addEventListener('click', () => {
      this.openModalAndRestore(session.id);
    });
    frag.appendChild(span);
    new Notice(frag, 8000);
  }

  private notifyError(session: BackgroundSession): void {
    const title = session.title || session.query.slice(0, 50);
    new Notice(`Analysis failed: ${title}`, 8000);
  }

  private openModalAndRestore(sessionId: string): void {
    // Store the session ID to restore — the modal will pick this up on mount
    BackgroundSessionManager.pendingRestore = sessionId;
    // Open a new modal
    const ctx = (globalThis as any).__peakAppContext as any;
    if (ctx?.viewManager) {
      ctx.viewManager.openQuickSearch();
    }
  }

  /** Pending restore ID — checked by the modal on mount */
  static pendingRestore: string | null = null;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/BackgroundSessionManager.ts
git commit -m "feat: implement BackgroundSessionManager singleton"
```

---

### Task 5: Wire Event Redirect for Background Sessions

When the foreground closure keeps running after modal close, events must be redirected to the background session's snapshot instead of the Zustand store.

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useEventRouter.ts`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts`

- [ ] **Step 1: Add redirect ref to useEventRouter**

In `useEventRouter.ts`, add a mutable ref that the BackgroundSessionManager can swap:

```typescript
// At module level (outside the hook):
export const eventTargetRedirect = {
  target: null as EventTarget | null,
  active: false,
};

// Inside routeEvent callback:
const routeEvent = useCallback((event: LLMStreamEvent) => {
  if (eventTargetRedirect.active && eventTargetRedirect.target) {
    // Background mode: write to snapshot, skip legacy stores
    dispatchEvent(event, eventTargetRedirect.target, null, bgSummaryBuf, bgUiStepRef);
    return;
  }
  // Foreground mode: normal dispatch
  dispatchEvent(event, fgTarget, legacyTarget, summaryBuf, { current: currentUiStepRef.current });
}, [fgTarget, legacyTarget, summaryBuf]);
```

- [ ] **Step 2: BackgroundSessionManager activates redirect on detach**

In `BackgroundSessionManager.detachForeground()`, after creating the session:

```typescript
import { eventTargetRedirect } from '@/ui/view/quick-search/hooks/useEventRouter';

// In detachForeground(), after building the session:
if (session.status === 'streaming') {
  const target = this.buildSnapshotTarget(session);
  eventTargetRedirect.target = target;
  eventTargetRedirect.active = true;
}
```

And in `restoreToForeground()`:
```typescript
eventTargetRedirect.active = false;
eventTargetRedirect.target = null;
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/hooks/useEventRouter.ts src/service/BackgroundSessionManager.ts
git commit -m "feat: wire event redirect for background session stream consumption"
```

---

### Task 6: Wire Modal Close → Detach

Connect QuickSearchModal's `onClose` to `BackgroundSessionManager.detachForeground()`.

**Files:**
- Modify: `src/ui/view/QuickSearchModal.tsx:46-58`
- Modify: `src/ui/view/quick-search/SearchModal.tsx` (expose agent refs)

- [ ] **Step 1: Store agent refs in a module-level holder**

The challenge: `abortControllerRef` and `vaultAgentRef` live inside `useSearchSession` (React refs). We need a way for the modal's `onClose` (which runs outside React) to access them.

Add a module-level ref holder in `useSearchSession.ts`:

```typescript
// Module-level (outside the hook), at top of file:
export const sessionRefs = {
  agentRef: null as VaultSearchAgent | null,
  abortController: null as AbortController | null,
};

// Inside useSearchSession, keep refs in sync:
// After: vaultAgentRef.current = AppContext.vaultSearchAgent();
sessionRefs.agentRef = vaultAgentRef.current;

// After: abortControllerRef.current = controller;
sessionRefs.abortController = controller;

// In cancel():
sessionRefs.abortController = null;
sessionRefs.agentRef = null;
```

- [ ] **Step 2: Call detachForeground in QuickSearchModal.onClose**

Modify `QuickSearchModal.tsx:46-58`:

```typescript
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { sessionRefs } from './quick-search/hooks/useSearchSession';
import { useSearchSessionStore } from './quick-search/store/searchSessionStore';

onClose(): void {
  // Detach active session to background before unmounting React
  const store = useSearchSessionStore.getState();
  const isActive = store.status === 'streaming' || store.status === 'starting';
  const hasPlan = store.v2PlanSections.length > 0 && !store.v2PlanApproved;
  if (isActive || hasPlan) {
    BackgroundSessionManager.getInstance().detachForeground({
      agentRef: sessionRefs.agentRef,
      abortController: sessionRefs.abortController,
    });
  }

  const r = this.reactRenderer;
  this.reactRenderer = null;
  if (r) {
    setTimeout(() => {
      r.unmount();
      this.contentEl.empty();
    }, 0);
  } else {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/QuickSearchModal.tsx src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "feat: detach active session to background on modal close"
```

---

### Task 7: Wire Modal Open → Restore

When the modal opens and there's a pending restore, load the background session into the foreground store.

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:71-341` (AITabContent)
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts`

- [ ] **Step 1: Add restoreFromBackground to useSearchSession**

In `useSearchSession.ts`, add a new function:

```typescript
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';

const restoreFromBackground = useCallback((sessionId: string) => {
  const manager = BackgroundSessionManager.getInstance();

  // If current foreground is active, detach it first
  const currentStore = store.getState();
  const isActive = currentStore.status === 'streaming' || currentStore.status === 'starting';
  const hasPlan = currentStore.v2PlanSections.length > 0 && !currentStore.v2PlanApproved;
  if (isActive || hasPlan) {
    manager.detachForeground({
      agentRef: sessionRefs.agentRef,
      abortController: sessionRefs.abortController,
    });
  }

  // Get agent refs before restoring (removes session from manager)
  const refs = manager.getAgentRefs(sessionId);
  const snapshot = manager.restoreToForeground(sessionId);
  if (!snapshot) return;

  // Restore snapshot to foreground store
  store.getState().restoreFromSnapshot(snapshot);

  // Re-bind agent refs
  if (refs) {
    vaultAgentRef.current = refs.agentRef;
    abortControllerRef.current = refs.abortController;
    sessionRefs.agentRef = refs.agentRef;
    sessionRefs.abortController = refs.abortController;
  }

  // Deactivate event redirect
  eventTargetRedirect.active = false;
  eventTargetRedirect.target = null;

  // Re-register HITL callback if plan-ready
  if (snapshot.v2PlanSections.length > 0 && !snapshot.v2PlanApproved && refs?.agentRef) {
    const hitlCallback = async (feedback: any) => {
      const agent = vaultAgentRef.current;
      if (!agent) return;
      store.getState().clearHitlPause();
      // Resume stream consumption in foreground
      await consumeStream(agent.continueWithFeedback(feedback));
      if (!store.getState().hitlState) {
        store.getState().markCompleted();
      }
    };
    store.getState().setHitlFeedbackCallback(hitlCallback);
  }
}, []);

// Add to return:
return { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection, restoreFromBackground };
```

- [ ] **Step 2: Check for pending restore on mount in AITabContent**

In `SearchModal.tsx`, add a `useEffect` in `AITabContent`:

```typescript
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';

// Inside AITabContent, after other hooks:
const { performAnalysis, cancel, handleApprovePlan, handleRegenerateSection, restoreFromBackground } = useSearchSession();

useEffect(() => {
  const pendingId = BackgroundSessionManager.pendingRestore;
  if (pendingId) {
    BackgroundSessionManager.pendingRestore = null;
    restoreFromBackground(pendingId);
  }
}, [restoreFromBackground]);
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts src/ui/view/quick-search/SearchModal.tsx
git commit -m "feat: restore background session to foreground on modal open"
```

---

### Task 8: Active Sessions UI in RecentAIAnalysis

Add a top section to RecentAIAnalysis showing in-progress and queued background sessions.

**Files:**
- Modify: `src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx:22-255`

- [ ] **Step 1: Add useSyncExternalStore hook for BackgroundSessionManager**

At the top of `RecentAIAnalysis.tsx`:

```typescript
import { useSyncExternalStore } from 'react';
import { BackgroundSessionManager, type BackgroundSession } from '@/service/BackgroundSessionManager';
import { Loader2, FileText, Clock, X } from 'lucide-react';

// Inside the component:
const bgSessions = useSyncExternalStore(
  (cb) => BackgroundSessionManager.getInstance().subscribe(cb),
  () => BackgroundSessionManager.getInstance().getSessions(),
);
```

- [ ] **Step 2: Add ActiveSessionCard component**

Before the `RecentAIAnalysis` component:

```typescript
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  streaming: { label: 'Analyzing...', color: '#7c3aed', icon: <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-animate-spin" /> },
  'plan-ready': { label: 'Plan Ready', color: '#d97706', icon: <FileText className="pktw-w-3.5 pktw-h-3.5" /> },
  queued: { label: 'Queued', color: '#6b7280', icon: <Clock className="pktw-w-3.5 pktw-h-3.5" /> },
  completed: { label: 'Complete', color: '#059669', icon: <FileText className="pktw-w-3.5 pktw-h-3.5" /> },
  error: { label: 'Failed', color: '#dc2626', icon: <X className="pktw-w-3.5 pktw-h-3.5" /> },
};

const ActiveSessionCard: React.FC<{
  session: BackgroundSession;
  onRestore: (id: string) => void;
  onCancel: (id: string) => void;
}> = ({ session, onRestore, onCancel }) => {
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.streaming;
  const elapsed = Math.round((Date.now() - session.createdAt) / 1000);
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)}m`;

  return (
    <div
      onClick={() => onRestore(session.id)}
      className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] hover:pktw-bg-[#f9fafb] pktw-cursor-pointer pktw-transition-colors pktw-group"
    >
      <span style={{ color: config.color }}>{config.icon}</span>
      <div className="pktw-flex-1 pktw-min-w-0">
        <span className="pktw-text-sm pktw-font-medium pktw-text-[#1f2937] pktw-truncate pktw-block">
          {session.title || session.query.slice(0, 60)}
        </span>
        <span className="pktw-text-xs pktw-text-[#9ca3af]">{elapsedStr}</span>
      </div>
      <span
        className="pktw-text-xs pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded-full"
        style={{ color: config.color, backgroundColor: `${config.color}15` }}
      >
        {config.label}
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); onCancel(session.id); }}
        className="pktw-p-1 pktw-text-[#9ca3af] hover:pktw-text-[#ef4444] pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
        title="Cancel"
      >
        <X className="pktw-w-3.5 pktw-h-3.5" />
      </span>
    </div>
  );
};
```

- [ ] **Step 3: Render Active Sessions section above history list**

Inside `RecentAIAnalysis` component, before the existing history list, add:

```typescript
const handleRestore = useCallback((sessionId: string) => {
  BackgroundSessionManager.pendingRestore = sessionId;
  // The modal is already open — trigger restore via store action
  // (The AITabContent will pick up pendingRestore on next effect cycle)
  useSearchSessionStore.getState().setTriggerRestore(sessionId);
}, []);

const handleCancelBg = useCallback((sessionId: string) => {
  BackgroundSessionManager.getInstance().cancelSession(sessionId);
}, []);

// In JSX, before the history scroll container:
{bgSessions.length > 0 && (
  <div className="pktw-px-3 pktw-pt-2 pktw-pb-1">
    <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-uppercase pktw-tracking-wide">
      Active Sessions
    </span>
    <div className="pktw-mt-1.5 pktw-flex pktw-flex-col pktw-gap-1.5">
      {bgSessions.map((s) => (
        <ActiveSessionCard
          key={s.id}
          session={s}
          onRestore={handleRestore}
          onCancel={handleCancelBg}
        />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/components/ai-analysis-sections/RecentAIAnalysis.tsx
git commit -m "feat: add Active Sessions section to RecentAIAnalysis"
```

---

### Task 9: Register BackgroundSessionManager in Plugin Lifecycle

Ensure background sessions are cleaned up on plugin unload.

**Files:**
- Modify: `main.ts:199-316`

- [ ] **Step 1: Add cleanup in onunload**

In `main.ts`, inside `onunload()`, after the store resets (~line 296) and before `AppContext.clearForUnload()` (~line 308):

```typescript
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';

// In onunload(), after store resets:
BackgroundSessionManager.clearInstance();
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add main.ts
git commit -m "feat: clean up BackgroundSessionManager on plugin unload"
```

---

### Task 10: Integration Test — Full Flow Manual Verification

Verify the complete flow works end-to-end in Obsidian.

**Files:** None (manual testing)

- [ ] **Step 1: Test detach on modal close**

1. Open Quick Search → AI Analysis
2. Start an analysis query
3. While streaming, close the modal (Esc or click outside)
4. Verify: No errors in DevTools console
5. Verify: A Notice appears when plan is ready (or when analysis completes)

- [ ] **Step 2: Test Active Sessions in Recent**

1. After closing modal with active analysis, reopen Quick Search → AI Analysis
2. Navigate to Recent Analysis
3. Verify: Active Sessions section shows the background session with correct status badge
4. Verify: Clicking the session restores it to the foreground

- [ ] **Step 3: Test plan-ready restore**

1. Start an analysis, close modal before plan approval
2. Wait for "Plan ready" Notice
3. Click the Notice
4. Verify: Modal opens with the plan visible, ready for approval
5. Click "Generate Report"
6. Verify: Report generates normally

- [ ] **Step 4: Test multiple concurrent sessions**

1. Start analysis A, close modal
2. Open modal, start analysis B, close modal
3. Open modal, start analysis C, close modal
4. Reopen modal → Recent Analysis
5. Verify: All 3 sessions visible in Active Sessions
6. Start analysis D — verify it shows as "Queued" (4th session)

- [ ] **Step 5: Test foreground swap on restore**

1. Have an active analysis in foreground
2. Click a background session in Active Sessions
3. Verify: Current foreground moves to background
4. Verify: Selected background session restores to foreground

- [ ] **Step 6: Test cancel**

1. With a background session running, click × on its Active Sessions card
2. Verify: Session disappears, no errors
