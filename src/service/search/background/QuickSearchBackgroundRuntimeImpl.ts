// T10: concrete `QuickSearchBackgroundRuntime` implementation.
//
// Takes a `QuickSearchBackgroundDeps` port bag. Holds no Obsidian /
// AppContext / UI-store references. All side effects (Notice, modal
// open, Zustand reads/writes, event redirect, persistence) flow
// through ports.
//
// State owned by this class:
//   - sessions: Map<id, QuickSearchBackgroundSession>
//   - queue: id[] (FIFO for the MAX_CONCURRENT cap)
//   - listeners: Set<() => void>
//   - cachedSummaries: QuickSearchBackgroundSessionSummary[] (frozen
//     reference for cheap `useSyncExternalStore` equality)
//   - pendingRestoreId: single-shot restore intent
//
// No module-level mutable globals: the registry holds at most one
// instance per plugin load, and `clear*Runtime()` drops it on unload.

import type { QuickSearchBackgroundRuntime } from './QuickSearchBackgroundRuntime';
import type {
	QuickSearchAgentHandle,
	QuickSearchBackgroundRestoreResult,
	QuickSearchBackgroundSession,
	QuickSearchBackgroundSessionHooks,
	QuickSearchBackgroundSessionStatus,
	QuickSearchBackgroundSessionSummary,
	QuickSearchSessionNotification,
} from './QuickSearchBackgroundTypes';
import type { QuickSearchBackgroundDeps } from './ports/QuickSearchBackgroundPorts';

const MAX_CONCURRENT = 3;

export class QuickSearchBackgroundRuntimeImpl implements QuickSearchBackgroundRuntime {
	private sessions = new Map<string, QuickSearchBackgroundSession>();
	private queue: string[] = [];
	private listeners = new Set<() => void>();
	private cachedSummaries: QuickSearchBackgroundSessionSummary[] = [];
	private pendingRestoreId: string | null = null;
	/** Tracks which session currently owns the event-router redirect so
	 * `cancel` and `restore` only clear it when the redirect is bound
	 * to *that* session. */
	private redirectOwnerId: string | null = null;

	constructor(private readonly deps: QuickSearchBackgroundDeps) {}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getSessions(): QuickSearchBackgroundSessionSummary[] {
		return this.cachedSummaries;
	}

	getActiveCount(): number {
		let count = 0;
		for (const session of this.sessions.values()) {
			if (session.status === 'streaming') count++;
		}
		return count;
	}

	detachForeground(): QuickSearchBackgroundSession | null {
		const { foregroundSession, eventRouter, targetFactory, clock } = this.deps;
		const intent = foregroundSession.detachIntent();
		if (!intent.isActive && !intent.hasPlanPending) return null;

		const snapshot = foregroundSession.snapshot();
		const sessionId = (typeof snapshot.id === 'string' && snapshot.id) || `bg-${clock.now()}`;

		const status: QuickSearchBackgroundSessionStatus =
			intent.hasPlanPending && !intent.isActive
				? 'plan-ready'
				: this.getActiveCount() >= MAX_CONCURRENT
					? 'queued'
					: 'streaming';

		const savedPath =
			(snapshot.autoSaveState && typeof snapshot.autoSaveState.lastSavedPath === 'string'
				? snapshot.autoSaveState.lastSavedPath
				: null) ?? null;

		const session: QuickSearchBackgroundSession = {
			id: sessionId,
			status,
			query: snapshot.query,
			title: snapshot.title,
			createdAt: clock.now(),
			savedPath,
			error: null,
			agentHandle: foregroundSession.getAgentHandle(),
			snapshot,
		};

		this.sessions.set(sessionId, session);
		if (status === 'queued') this.queue.push(sessionId);

		if (status === 'streaming') {
			const target = targetFactory.build(session, this.buildSessionHooks(session));
			eventRouter.routeToBackground(sessionId, target);
			this.redirectOwnerId = sessionId;
		}

		foregroundSession.resetForeground();

		if (status === 'plan-ready') {
			this.fireNotification(session, 'plan-ready');
		}

		this.notify();
		return session;
	}

	restoreToForeground(sessionId: string): QuickSearchBackgroundRestoreResult | null {
		const session = this.sessions.get(sessionId);
		if (!session) return null;

		const result: QuickSearchBackgroundRestoreResult = {
			snapshot: session.snapshot,
			agentHandle: session.agentHandle,
		};

		this.sessions.delete(sessionId);
		this.queue = this.queue.filter((id) => id !== sessionId);
		if (this.redirectOwnerId === sessionId) {
			this.deps.eventRouter.clearBackgroundRoute(sessionId);
			this.redirectOwnerId = null;
		}
		this.notify();
		return result;
	}

	requestRestore(sessionId: string): void {
		this.pendingRestoreId = sessionId;
	}

	consumePendingRestore(): string | null {
		const id = this.pendingRestoreId;
		this.pendingRestoreId = null;
		return id;
	}

	openAndRestore(sessionId: string): void {
		this.pendingRestoreId = sessionId;
		this.deps.modalOpener.openAndRestore(sessionId);
	}

	cancelSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		if (this.redirectOwnerId === sessionId) {
			this.deps.eventRouter.clearBackgroundRoute(sessionId);
			this.redirectOwnerId = null;
		}
		try {
			session.agentHandle?.abortController?.abort();
		} catch {
			// Caller may have already aborted; ignore.
		}
		this.sessions.delete(sessionId);
		this.queue = this.queue.filter((id) => id !== sessionId);
		this.tryStartNext();
		this.notify();
	}

	abortAll(): void {
		for (const session of this.sessions.values()) {
			try {
				session.agentHandle?.abortController?.abort();
			} catch {
				// ignore
			}
		}
		this.sessions.clear();
		this.queue = [];
		if (this.redirectOwnerId !== null) {
			this.deps.eventRouter.clearBackgroundRoute();
			this.redirectOwnerId = null;
		}
		this.pendingRestoreId = null;
		this.notify();
	}

	dispose(): void {
		this.abortAll();
		this.listeners.clear();
	}

	// ---------------------------------------------------------------
	// Internals
	// ---------------------------------------------------------------

	private buildSessionHooks(session: QuickSearchBackgroundSession): QuickSearchBackgroundSessionHooks {
		return {
			setTitle: (title) => {
				session.title = title;
				this.notify();
			},
			markPlanReady: () => {
				if (session.status !== 'streaming') return;
				session.status = 'plan-ready';
				if (!session.savedPath) {
					void this.deps.persistence
						.persist(session.snapshot)
						.then((result) => {
							if (result) session.savedPath = result.path;
						})
						.catch(() => {
							// persistence failures shouldn't crash the runtime
						});
				}
				this.fireNotification(session, 'plan-ready');
				this.notify();
			},
			markCompleted: () => {
				session.status = 'completed';
				if (session.savedPath) {
					void this.deps.persistence
						.persist(session.snapshot, { existingPath: session.savedPath })
						.catch(() => {
							// persistence is best-effort
						});
				}
				this.fireNotification(session, 'completed');
				this.tryStartNext();
				this.notify();
			},
			markError: (error) => {
				session.status = 'error';
				session.error = error;
				this.fireNotification(session, 'error');
				this.tryStartNext();
				this.notify();
			},
		};
	}

	private fireNotification(
		session: QuickSearchBackgroundSession,
		kind: 'plan-ready' | 'completed' | 'error',
	): void {
		const payload: QuickSearchSessionNotification = {
			sessionId: session.id,
			title: session.title,
			query: session.query,
			onRestore: () => this.openAndRestore(session.id),
		};
		if (kind === 'plan-ready') this.deps.notification.showSessionReady(payload);
		else if (kind === 'completed') this.deps.notification.showSessionComplete(payload);
		else this.deps.notification.showSessionError(payload);
	}

	private tryStartNext(): void {
		if (this.getActiveCount() >= MAX_CONCURRENT) return;
		if (this.queue.length === 0) return;
		const nextId = this.queue.shift()!;
		const next = this.sessions.get(nextId);
		if (next && next.status === 'queued') {
			next.status = 'streaming';
		}
	}

	private notify(): void {
		this.cachedSummaries = Array.from(this.sessions.values()).map(toSummary);
		for (const listener of this.listeners) listener();
	}
}

function toSummary(session: QuickSearchBackgroundSession): QuickSearchBackgroundSessionSummary {
	return {
		id: session.id,
		status: session.status,
		query: session.query,
		title: session.title,
		createdAt: session.createdAt,
		savedPath: session.savedPath,
		error: session.error,
	};
}

/**
 * Helper for testing the agent-handle wiring without exposing the
 * internal `Map` or `AgentHandle` ownership shape. Adapters use this
 * to read/write the handle on a known session.
 *
 * (Public re-export exists because the foreground-session port owns
 * agent-handle re-binding on restore — the runtime's
 * `restoreToForeground` result already exposes the handle, so this
 * helper is optional.)
 */
export type _QuickSearchAgentHandle = QuickSearchAgentHandle;
