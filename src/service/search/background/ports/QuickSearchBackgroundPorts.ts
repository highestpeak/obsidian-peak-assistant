// T10: ports for the Quick Search background-session runtime.
//
// Each port has exactly one app-layer adapter; the runtime depends only
// on these abstract interfaces. Together they replace the ad-hoc
// reaches `BackgroundSessionManager` previously made into
// `useSearchSessionStore` (UI Zustand), `eventTargetRedirect` (UI hook
// module global), `Notice` (Obsidian), `new QuickSearchModal(AppContext)`
// (Obsidian Modal class), and `persistSessionToVault` (service file
// internally reaching AppContext).

import type {
	QuickSearchAgentHandle,
	QuickSearchBackgroundEventTarget,
	QuickSearchBackgroundSession,
	QuickSearchBackgroundSessionHooks,
	QuickSearchForegroundDetachIntent,
	QuickSearchForegroundSnapshot,
	QuickSearchSessionNotification,
} from '../QuickSearchBackgroundTypes';

/**
 * Read+write access to the foreground session. The adapter wraps the
 * Zustand `useSearchSessionStore` plus the `sessionRefs` hook module
 * global so the runtime never touches them directly.
 */
export interface QuickSearchForegroundSessionPort {
	/**
	 * Whether a detach should proceed. The legacy rule was
	 * `status === streaming|starting` OR `v2PlanSections.length > 0 && !v2PlanApproved`.
	 * The adapter encapsulates that derivation.
	 */
	detachIntent(): QuickSearchForegroundDetachIntent;
	/** Snapshot the current foreground state for background storage. */
	snapshot(): QuickSearchForegroundSnapshot;
	/** Reset the foreground store so the user gets a clean modal slate. */
	resetForeground(): void;
	/** Write a snapshot back into the foreground store on restore. */
	restore(snapshot: QuickSearchForegroundSnapshot): void;
	/** Read the agent / abort controller bound to the live foreground session. */
	getAgentHandle(): QuickSearchAgentHandle | null;
	/** Clear the agent handle on the foreground side (used by cancel / restore). */
	clearAgentHandle(): void;
	/** Re-bind a previously detached agent handle to the foreground. */
	bindAgentHandle(handle: QuickSearchAgentHandle | null): void;
}

/**
 * Owns the `eventTargetRedirect` module-level switch on the UI side.
 * The runtime never reads `eventTargetRedirect`; it only tells the
 * router to start / stop routing to a target.
 */
export interface QuickSearchEventRouterPort {
	routeToBackground(sessionId: string, target: QuickSearchBackgroundEventTarget): void;
	clearBackgroundRoute(sessionId?: string): void;
}

/**
 * Builds the per-session redirect target. The factory knows the
 * snapshot's full UI shape (it casts the opaque snapshot back to
 * `V2SessionSnapshot`); the runtime treats the returned object as
 * opaque and hands it to the event router.
 *
 * `hooks` lets the target route status changes (plan-ready / completed
 * / error / title change) back into the runtime so persistence and
 * notification still fire from the right owner.
 */
export interface QuickSearchBackgroundTargetFactoryPort {
	build(
		session: QuickSearchBackgroundSession,
		hooks: QuickSearchBackgroundSessionHooks,
	): QuickSearchBackgroundEventTarget;
}

/**
 * Surfaces a clickable session notice. The adapter wraps Obsidian
 * `Notice` and the click handler invokes the modal-opener port to
 * reopen the modal + restore.
 */
export interface QuickSearchNotificationPort {
	showSessionReady(input: QuickSearchSessionNotification): void;
	showSessionComplete(input: QuickSearchSessionNotification): void;
	showSessionError(input: QuickSearchSessionNotification): void;
}

/**
 * Opens the Quick Search modal and queues a restore. The adapter wraps
 * `new QuickSearchModal(AppContext.getInstance()).open()`. The runtime
 * uses this for cross-surface restore (notification clicks, Recent AI
 * Analysis cards).
 */
export interface QuickSearchModalOpenerPort {
	openAndRestore(sessionId: string): void;
}

/**
 * Persists a session snapshot to the vault. The adapter wraps the
 * existing `persistSessionToVault(snapshot, { existingPath })`
 * function so the runtime stays free of `AppContext` / Obsidian
 * dependencies.
 */
export interface QuickSearchAnalysisPersistencePort {
	persist(
		snapshot: QuickSearchForegroundSnapshot,
		options?: { existingPath?: string | null },
	): Promise<{ path: string } | null>;
}

/**
 * Monotonic clock surface. The adapter wraps `Date.now`. Tests inject a
 * fake so session-ID generation and `createdAt` timestamps stay
 * deterministic.
 */
export interface QuickSearchClockPort {
	now(): number;
}

/**
 * Aggregated dependency bag the runtime constructor takes.
 */
export interface QuickSearchBackgroundDeps {
	foregroundSession: QuickSearchForegroundSessionPort;
	eventRouter: QuickSearchEventRouterPort;
	targetFactory: QuickSearchBackgroundTargetFactoryPort;
	notification: QuickSearchNotificationPort;
	modalOpener: QuickSearchModalOpenerPort;
	persistence: QuickSearchAnalysisPersistencePort;
	clock: QuickSearchClockPort;
}
