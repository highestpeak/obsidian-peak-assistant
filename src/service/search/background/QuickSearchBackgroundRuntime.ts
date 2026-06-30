// T10: Quick Search background-session runtime — interface only.
//
// Production callers (QuickSearchModal, SearchModal, useSearchSession,
// ActiveSessionsList, RecentAIAnalysis, CascadeWorker) reach this
// through `AppContext.{get,tryGet}QuickSearchBackgroundRuntime()`. The
// concrete `QuickSearchBackgroundRuntimeImpl` lives next to this file
// and takes a `QuickSearchBackgroundDeps` port bag; the runtime
// composition (`src/app/search/background/composeQuickSearchBackgroundRuntime`)
// is the ONE place that wires app singletons (Obsidian `Notice`,
// Zustand `useSearchSessionStore`, `eventTargetRedirect`,
// `QuickSearchModal`, `persistSessionToVault`) into ports.
//
// Single-instance-per-plugin-load. Binding semantics live in
// `AppRuntimeRegistry`.

import type {
	QuickSearchBackgroundRestoreResult,
	QuickSearchBackgroundSession,
	QuickSearchBackgroundSessionSummary,
} from './QuickSearchBackgroundTypes';

export interface QuickSearchBackgroundRuntime {
	/** Subscribe to the cached session list for `useSyncExternalStore`. */
	subscribe(listener: () => void): () => void;

	/** Read the cached read-only session list. */
	getSessions(): QuickSearchBackgroundSessionSummary[];

	/** Count of sessions currently in `streaming` status. Used by the
	 * cascade worker to defer index work while analyses are running. */
	getActiveCount(): number;

	/**
	 * Detach the live foreground session into the background. Returns
	 * null if there is nothing detachable (idle foreground with no
	 * plan pending). Side effects:
	 *   - snapshots the foreground store via the foreground port;
	 *   - registers a session + caches summaries;
	 *   - routes the event stream into the background via the event
	 *     router port (only when status === 'streaming');
	 *   - resets the foreground store;
	 *   - fires plan-ready notification when the detach lands on
	 *     `plan-ready` status.
	 */
	detachForeground(): QuickSearchBackgroundSession | null;

	/**
	 * Restore the named session to the foreground. Returns the snapshot
	 * + agent handle (so the UI adapter can rebind HITL refs) or null
	 * if the session has already gone (e.g. completed). Side effects:
	 *   - removes the session from the runtime;
	 *   - clears the event-router redirect;
	 *   - notifies subscribers.
	 */
	restoreToForeground(sessionId: string): QuickSearchBackgroundRestoreResult | null;

	/** Queue a restore intent. Consumed once on next `consumePendingRestore`. */
	requestRestore(sessionId: string): void;

	/** Read + clear the pending restore intent. Single-shot. */
	consumePendingRestore(): string | null;

	/** Open the Quick Search modal and queue a restore. Used by
	 * cross-surface entry points (notification click, Recent AI Analysis
	 * card click) where the modal isn't already mounted. */
	openAndRestore(sessionId: string): void;

	/** Abort + drop the session. Side effects: abort controller, clear
	 * redirect (if currently routed to this session), promote any
	 * queued session, notify subscribers. */
	cancelSession(sessionId: string): void;

	/** Abort every session and reset internal state. Called from
	 * `main.onunload` so hot reload doesn't leave async agents
	 * pointing at the dead React tree. */
	abortAll(): void;

	/** Dispose-on-unload alias. Calls `abortAll()` + clears pending
	 * restore + clears redirect. */
	dispose(): void;
}
