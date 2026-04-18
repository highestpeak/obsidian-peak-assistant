/**
 * BackgroundSessionManager — singleton that manages background AI analysis sessions.
 *
 * Detaches active foreground sessions from the Zustand store, holds their
 * snapshots as plain objects, manages concurrency (max 3 streaming), and fires
 * Obsidian Notice notifications when sessions reach key states.
 *
 * Lives at the service layer — no React imports except the Zustand store accessor.
 */

import { Notice } from 'obsidian';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { EventDispatchTarget } from '@/ui/view/quick-search/hooks/eventDispatcher';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import type { V2Section } from '@/ui/view/quick-search/store/v2SessionTypes';
import type { V2ToolStep, V2Source } from '@/ui/view/quick-search/types/search-steps';
import { AppContext } from '@/app/context/AppContext';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';
import { eventTargetRedirect } from '@/ui/view/quick-search/hooks/useEventRouter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class BackgroundSessionManager {
	private static instance: BackgroundSessionManager | null = null;

	/** Pending restore ID -- checked by the modal on mount. */
	static pendingRestore: string | null = null;

	static getInstance(): BackgroundSessionManager {
		if (!BackgroundSessionManager.instance) {
			BackgroundSessionManager.instance = new BackgroundSessionManager();
		}
		return BackgroundSessionManager.instance;
	}

	/** Abort all sessions and destroy the singleton. */
	static clearInstance(): void {
		if (BackgroundSessionManager.instance) {
			BackgroundSessionManager.instance.abortAll();
			BackgroundSessionManager.instance = null;
		}
	}

	// -----------------------------------------------------------------------
	// Internal state
	// -----------------------------------------------------------------------

	private sessions: Map<string, BackgroundSession> = new Map();
	private queue: string[] = []; // IDs of queued sessions
	private readonly MAX_CONCURRENT = 3;
	private listeners: Set<() => void> = new Set();
	private cachedSessions: BackgroundSession[] = [];

	private constructor() {
		// singleton
	}

	// -----------------------------------------------------------------------
	// React subscription (for useSyncExternalStore)
	// -----------------------------------------------------------------------

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		this.cachedSessions = Array.from(this.sessions.values());
		for (const listener of this.listeners) {
			listener();
		}
	}

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	getSessions(): BackgroundSession[] {
		return this.cachedSessions;
	}

	getSession(id: string): BackgroundSession | null {
		return this.sessions.get(id) ?? null;
	}

	/** Count of sessions with status === 'streaming'. */
	getActiveCount(): number {
		let count = 0;
		for (const session of this.sessions.values()) {
			if (session.status === 'streaming') count++;
		}
		return count;
	}

	// -----------------------------------------------------------------------
	// Core lifecycle
	// -----------------------------------------------------------------------

	/**
	 * Detach the current foreground session into the background.
	 *
	 * Reads from `useSearchSessionStore.getState()`, validates that the session
	 * is detachable, takes a snapshot, and resets the foreground store.
	 */
	detachForeground(refs: {
		agentRef: VaultSearchAgent | null;
		abortController: AbortController | null;
	}): BackgroundSession | null {
		const store = useSearchSessionStore.getState();

		// Only detach if streaming/starting OR has unapproved plan sections
		const isActive = store.status === 'streaming' || store.status === 'starting';
		const hasPlanPending = store.v2PlanSections.length > 0 && !store.v2PlanApproved;
		if (!isActive && !hasPlanPending) {
			return null;
		}

		const snapshot = store.snapshotState();
		const sessionId = snapshot.id ?? `bg-${Date.now()}`;

		// Determine initial background status
		let status: BackgroundSessionStatus;
		if (hasPlanPending && !isActive) {
			// Plan is ready but not streaming -- park as plan-ready
			status = 'plan-ready';
		} else if (this.getActiveCount() >= this.MAX_CONCURRENT) {
			status = 'queued';
		} else {
			status = 'streaming';
		}

		const session: BackgroundSession = {
			id: sessionId,
			query: snapshot.query,
			title: snapshot.title,
			createdAt: Date.now(),
			status,
			savedPath: snapshot.autoSaveState?.lastSavedPath ?? null,
			agentRef: refs.agentRef,
			abortController: refs.abortController,
			snapshot,
			error: null,
		};

		this.sessions.set(sessionId, session);

		if (status === 'queued') {
			this.queue.push(sessionId);
		}

		// Activate event redirect so the still-running performAnalysis closure
		// writes to the background snapshot instead of the foreground Zustand store
		if (session.status === 'streaming') {
			eventTargetRedirect.target = this.buildSnapshotTarget(session);
			eventTargetRedirect.summaryBuffer = { appendDelta: () => {}, flush: () => {} };
			eventTargetRedirect.uiStepRef = { get: () => null, set: () => {} };
			eventTargetRedirect.active = true;
		}

		// Reset the foreground store so the user gets a clean slate
		store.resetAll();

		// Fire notice for plan-ready immediately
		if (status === 'plan-ready') {
			this.notifyPlanReady(session);
		}

		this.notify();
		return session;
	}

	/**
	 * Restore a background session to the foreground.
	 * Returns the snapshot; caller is responsible for calling restoreFromSnapshot.
	 */
	restoreToForeground(sessionId: string): V2SessionSnapshot | null {
		const session = this.sessions.get(sessionId);
		if (!session) return null;

		const snapshot = session.snapshot;

		// Deactivate event redirect — foreground will handle events directly
		eventTargetRedirect.active = false;
		eventTargetRedirect.target = null;
		eventTargetRedirect.summaryBuffer = null;
		eventTargetRedirect.uiStepRef = null;

		// Remove from map and queue
		this.sessions.delete(sessionId);
		this.queue = this.queue.filter((id) => id !== sessionId);

		this.notify();
		return snapshot;
	}

	/**
	 * Get the agent + abort controller refs for a session before restoring it.
	 * Caller needs these to re-bind streaming in the foreground.
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

	/** Cancel a background session: abort, remove, try to start next queued. */
	cancelSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		// Deactivate redirect if this was the redirected session
		if (eventTargetRedirect.active && session.status === 'streaming') {
			eventTargetRedirect.active = false;
			eventTargetRedirect.target = null;
			eventTargetRedirect.summaryBuffer = null;
			eventTargetRedirect.uiStepRef = null;
		}

		if (session.abortController) {
			try {
				session.abortController.abort();
			} catch {
				// ignore abort errors
			}
		}

		this.sessions.delete(sessionId);
		this.queue = this.queue.filter((id) => id !== sessionId);

		this.tryStartNext();
		this.notify();
	}

	/** Abort all sessions and clear state. */
	abortAll(): void {
		for (const session of this.sessions.values()) {
			if (session.abortController) {
				try {
					session.abortController.abort();
				} catch {
					// ignore
				}
			}
		}
		this.sessions.clear();
		this.queue = [];

		eventTargetRedirect.active = false;
		eventTargetRedirect.target = null;
		eventTargetRedirect.summaryBuffer = null;
		eventTargetRedirect.uiStepRef = null;

		this.notify();
	}

	// -----------------------------------------------------------------------
	// Background stream consumption target
	// -----------------------------------------------------------------------

	/**
	 * Build an EventDispatchTarget that mutates `session.snapshot` directly.
	 *
	 * Used by the event redirect mechanism (Task 5) so that `dispatchEvent`
	 * writes to the background session's snapshot instead of the Zustand store.
	 */
	buildSnapshotTarget(session: BackgroundSession): EventDispatchTarget {
		const snap = session.snapshot;
		const mgr = this;

		return {
			enableDevTools(): boolean {
				return true; // background sessions must always record errors
			},

			// Reads
			getV2Active(): boolean {
				return snap.v2Active;
			},
			getV2ProposedOutline(): string | null {
				return snap.v2ProposedOutline;
			},
			getStartedAt(): number | null {
				return snap.startedAt;
			},
			getV2StepsLength(): number {
				return snap.v2Steps.length;
			},
			getV2Sources(): V2Source[] {
				return snap.v2Sources;
			},

			// Writes
			setV2Active(active: boolean): void {
				snap.v2Active = active;
			},

			addPhaseUsage(usage: { phase: string; modelId: string; inputTokens: number; outputTokens: number }): void {
				snap.phaseUsages.push(usage);
			},

			pushV2TimelineText(id: string, chunk: string): void {
				const last = snap.v2Timeline[snap.v2Timeline.length - 1];
				if (last && last.kind === 'text' && !last.complete) {
					last.chunks.push(chunk);
				} else {
					snap.v2Timeline.push({ kind: 'text', id, chunks: [chunk], complete: false });
				}
			},

			resolveV2ToolName(id: string): string {
				return snap.v2ToolCallIndex.get(id) ?? 'unknown';
			},

			updateV2Step(id: string, updater: (step: V2ToolStep) => V2ToolStep): void {
				const idx = snap.v2Steps.findIndex((s) => s.id === id);
				if (idx !== -1) {
					snap.v2Steps[idx] = updater(snap.v2Steps[idx]);
				}
			},

			updateV2TimelineTool(id: string, updater: (step: V2ToolStep) => V2ToolStep): void {
				const idx = snap.v2Timeline.findIndex((item) => item.kind === 'tool' && item.step.id === id);
				if (idx !== -1) {
					const item = snap.v2Timeline[idx] as { kind: 'tool'; step: V2ToolStep };
					snap.v2Timeline[idx] = { kind: 'tool', step: updater(item.step) };
				}
			},

			appendAgentDebugLog(entry: { type: string; taskIndex?: number; data: Record<string, unknown> }): void {
				if (snap.agentDebugLog.length >= 2000) {
					snap.agentDebugLog = snap.agentDebugLog.slice(-1999);
				}
				snap.agentDebugLog.push({ ts: Date.now(), ...entry });
			},

			setDashboardUpdatedLine(line: string): void {
				snap.dashboardUpdatedLine = line ?? '';
			},

			setTitle(title: string | null): void {
				snap.title = title;
				session.title = title;
			},

			setHasAnalyzed(v: boolean): void {
				snap.hasAnalyzed = v;
			},

			setUsage(usage): void {
				snap.usage = usage;
			},

			setDuration(duration: number): void {
				snap.duration = duration;
			},

			markCompleted(): void {
				snap.status = 'completed';
				session.status = 'completed';
				mgr.notifyCompleted(session);
				mgr.tryStartNext();
				mgr.notify();
			},

			markV2ReportComplete(): void {
				snap.v2ReportComplete = true;
			},

			recordError(error: string): void {
				snap.status = 'error';
				snap.error = error;
				session.status = 'error';
				session.error = error;
				mgr.notifyError(session);
				mgr.tryStartNext();
				mgr.notify();
			},

			setHitlPause(state: { pauseId: string; phase: string; snapshot: any }): void {
				snap.hitlState = { isPaused: true, ...state };
			},

			pushV2Step(step: V2ToolStep): void {
				snap.v2Steps.push(step);
			},

			pushV2TimelineTool(step: V2ToolStep): void {
				const last = snap.v2Timeline[snap.v2Timeline.length - 1];
				if (last && last.kind === 'text' && !last.complete) {
					(last as any).complete = true;
				}
				snap.v2Timeline.push({ kind: 'tool', step });
			},

			registerV2ToolCall(id: string, toolName: string): void {
				snap.v2ToolCallIndex.set(id, toolName);
			},

			addV2Source(source: V2Source): void {
				if (!snap.v2Sources.some((s) => s.path === source.path)) {
					snap.v2Sources.push(source);
				}
			},

			setPlanSections(sections: V2Section[]): void {
				snap.v2PlanSections = sections;
				// Detect plan arrival: transition from streaming to plan-ready
				if (sections.length > 0 && session.status === 'streaming') {
					session.status = 'plan-ready';
					mgr.notifyPlanReady(session);
					mgr.notify();
				}
			},

			setProposedOutline(outline: string): void {
				snap.v2ProposedOutline = outline;
			},

			setFollowUpQuestions(questions: string[]): void {
				snap.v2FollowUpQuestions = questions;
			},

			setV2Sources(sources: V2Source[]): void {
				snap.v2Sources = sources;
			},
		};
	}

	// -----------------------------------------------------------------------
	// Concurrency management
	// -----------------------------------------------------------------------

	/**
	 * When a session completes/pauses/errors, check if we can dequeue the next.
	 *
	 * Note: For queued sessions, starting actually means transitioning them from
	 * 'queued' to 'streaming'. The actual stream consumption is already running
	 * (the closure from performAnalysis continues); the queued status just means
	 * we haven't attached it to the event dispatch target yet. Task 5 handles
	 * the actual redirect wiring.
	 */
	private tryStartNext(): void {
		if (this.getActiveCount() >= this.MAX_CONCURRENT) return;
		if (this.queue.length === 0) return;

		const nextId = this.queue.shift()!;
		const next = this.sessions.get(nextId);
		if (next && next.status === 'queued') {
			next.status = 'streaming';
			this.notify();
		}
	}

	// -----------------------------------------------------------------------
	// Notifications
	// -----------------------------------------------------------------------

	private notifyPlanReady(session: BackgroundSession): void {
		const frag = document.createDocumentFragment();
		const span = document.createElement('span');
		const label = session.title ?? session.query.slice(0, 40);
		span.textContent = `Analysis plan ready: "${label}"`;
		span.style.cursor = 'pointer';
		span.style.textDecoration = 'underline';
		span.addEventListener('click', () => {
			this.openModalAndRestore(session.id);
		});
		frag.appendChild(span);
		new Notice(frag, 8000);
	}

	private notifyCompleted(session: BackgroundSession): void {
		const frag = document.createDocumentFragment();
		const span = document.createElement('span');
		const label = session.title ?? session.query.slice(0, 40);
		span.textContent = `Analysis complete: "${label}"`;
		span.style.cursor = 'pointer';
		span.style.textDecoration = 'underline';
		span.addEventListener('click', () => {
			this.openModalAndRestore(session.id);
		});
		frag.appendChild(span);
		new Notice(frag, 8000);
	}

	private notifyError(session: BackgroundSession): void {
		const frag = document.createDocumentFragment();
		const span = document.createElement('span');
		const label = session.title ?? session.query.slice(0, 40);
		span.textContent = `Analysis failed: "${label}"`;
		span.style.cursor = 'pointer';
		span.style.textDecoration = 'underline';
		span.addEventListener('click', () => {
			this.openModalAndRestore(session.id);
		});
		frag.appendChild(span);
		new Notice(frag, 8000);
	}

	/**
	 * Set pendingRestore and open a new QuickSearchModal.
	 * The modal's mount logic (Task 7) will detect pendingRestore and call
	 * restoreToForeground + restoreFromSnapshot.
	 */
	private openModalAndRestore(sessionId: string): void {
		BackgroundSessionManager.pendingRestore = sessionId;
		const appContext = AppContext.getInstance();
		const modal = new QuickSearchModal(appContext);
		modal.open();
	}
}
