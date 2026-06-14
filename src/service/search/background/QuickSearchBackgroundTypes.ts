// T10: Quick Search background-session types — service-side, framework-free.
//
// The runtime owns these structures; UI consumes them through the
// `QuickSearchBackgroundRuntime` contract and the app-layer adapters.
//
// The snapshot type is a *structural subset* — it lists the fields the
// runtime reads (id / query / title / savedPath / autoSaveState). The
// rest of the foreground state object is opaque to the runtime: the UI
// `TargetFactoryPort` casts to the full `V2SessionSnapshot` shape when
// building the redirect target, but the runtime never reaches into it.
// This keeps the service layer free of UI-store types without forcing a
// service-wide snapshot move.

export type QuickSearchBackgroundSessionStatus =
	| 'streaming'
	| 'plan-ready'
	| 'queued'
	| 'completed'
	| 'error';

/**
 * Reference to the AI agent / abort controller bound to a session.
 * The runtime never invokes the agent — it only calls
 * `abortController?.abort()` on cancel / shutdown. `agentRef` is held
 * across the detach/restore boundary so HITL feedback continues working
 * after the session returns to the foreground.
 */
export interface QuickSearchAgentHandle {
	agentRef: unknown | null;
	abortController: AbortController | null;
}

/**
 * Structural subset of the foreground session snapshot. The runtime
 * only reads these fields; everything else is opaque. UI adapters cast
 * to the concrete UI-store snapshot when they need full access (target
 * factory, persistence port).
 */
export interface QuickSearchForegroundSnapshot {
	id: string | null;
	query: string;
	title: string | null;
	autoSaveState?: { lastSavedPath: string | null } | null;
	// Opaque payload — additional UI fields preserved verbatim.
	[key: string]: unknown;
}

/**
 * Whether the foreground session is alive enough to detach. The runtime
 * fetches this via the foreground port and either accepts the detach
 * (active / has pending plan) or refuses it (idle).
 */
export interface QuickSearchForegroundDetachIntent {
	isActive: boolean;
	hasPlanPending: boolean;
}

/**
 * Internal session record kept inside the runtime. The runtime treats
 * `snapshot` as opaque after construction; UI adapters mutate it
 * through the target the factory builds.
 */
export interface QuickSearchBackgroundSession {
	readonly id: string;
	status: QuickSearchBackgroundSessionStatus;
	query: string;
	title: string | null;
	createdAt: number;
	savedPath: string | null;
	error: string | null;
	agentHandle: QuickSearchAgentHandle | null;
	snapshot: QuickSearchForegroundSnapshot;
}

/**
 * Read-only projection that `useSyncExternalStore` consumers see. The
 * runtime caches a frozen-shape array on every mutation so subscribers
 * compare references cheaply.
 */
export interface QuickSearchBackgroundSessionSummary {
	id: string;
	status: QuickSearchBackgroundSessionStatus;
	query: string;
	title: string | null;
	createdAt: number;
	savedPath: string | null;
	error: string | null;
}

/**
 * Returned by `restoreToForeground`. The UI adapter writes `snapshot`
 * into the foreground store, then re-binds `agentHandle` so HITL
 * feedback continues working.
 */
export interface QuickSearchBackgroundRestoreResult {
	snapshot: QuickSearchForegroundSnapshot;
	agentHandle: QuickSearchAgentHandle | null;
}

/**
 * Identifying payload supplied to the notification port — keeps the
 * service free of Obsidian `Notice` access. The notification adapter
 * formats this into a clickable Notice fragment.
 *
 * `onRestore` is wired by the runtime so the click handler invokes
 * `runtime.openAndRestore(sessionId)`, which sets the pending-restore
 * intent before asking the modal-opener port to surface the modal.
 * Calling the modal opener directly would only open the modal without
 * the pending intent, so the freshly mounted `SearchModal` would not
 * know which session to restore.
 */
export interface QuickSearchSessionNotification {
	sessionId: string;
	title: string | null;
	query: string;
	onRestore: () => void;
}

/**
 * Callbacks the target-factory uses to write back into runtime state.
 * The UI factory mutates the opaque snapshot directly (for v2Step /
 * timeline / source / report fields) but routes session-level state
 * changes (status, title for the Notice surface) through hooks so the
 * runtime owns notification + persistence + queue-resume side effects.
 */
export interface QuickSearchBackgroundSessionHooks {
	setTitle(title: string | null): void;
	markPlanReady(): void;
	markCompleted(): void;
	markError(error: string): void;
}

/**
 * Opaque event-target type. The runtime never dispatches into it; it
 * only hands it to the event-router port. UI side uses the concrete
 * `EventDispatchTarget` shape.
 */
export type QuickSearchBackgroundEventTarget = object;
