/**
 * Peak Composer — Copilot session lifecycle + run receipt (WP9, handoff §12.1–3).
 *
 * The Sidecar top level is only `Copilot | History`. Inside Copilot the user
 * moves through a lifecycle WITHOUT a permanent stage rail (spec §Copilot):
 *
 *   brief → session → running → session / review / error / cancelled
 *
 *   - `brief` is the quiet, document-adjacent proactive surface (no composer).
 *   - `session` is where the full prompt composer lives; a `send` freezes the
 *     run context and enters `running`.
 *   - `review` is transient — it only exists while a run has produced pending
 *     candidate patches, and returns to the originating session when closed. It
 *     is not a permanent tab.
 *
 * A run's four artifact families (Changes / Insights / Sources / Trace, §12.3)
 * live INSIDE one receipt message — they are never restored as top-level tabs.
 * Accepted changes flow to History through the transaction hub, not here.
 *
 * This machine is pure runtime state — no React, no Obsidian, no singletons. The
 * app-composed IntelligenceRuntime owns one instance per open document.
 */

import type { ComposerContextSnapshot, ComposerTarget } from '@/core/composer';

/** Sidecar top-level surface — switching only re-projects, never re-owns context. */
export type IntelligenceTopSurface = 'copilot' | 'history';

/** Copilot internal stage (no permanent rail). */
export type CopilotStage = 'brief' | 'session' | 'review';

/** The run sub-status while a session is executing (spec Interaction State Contract). */
export type CopilotRunStatus =
	| 'idle'
	| 'assembling'
	| 'streaming'
	| 'proposed'
	| 'no-change'
	| 'error'
	| 'cancelled';

/** Run artifact categories — local to one receipt, never global navigation. */
export type RunArtifactCategory = 'changes' | 'insights' | 'sources' | 'trace';

/**
 * The immutable context a run executes against (handoff §12.2). Assembled from
 * the live document at SEND time and frozen; later focus/selection changes only
 * affect the NEXT run. Wraps the WP3 {@link ComposerContextSnapshot} (already
 * frozen by the context assembler) and adds the brought-in related refs and the
 * verbatim target quote used for the message's clickable body reference.
 */
export interface FrozenRunContext {
	readonly runId: string;
	readonly snapshot: ComposerContextSnapshot;
	/** Verbatim quote of the target at freeze time — click locates the doc block. */
	readonly targetQuote: string;
	/** Related-material source ids explicitly carried into this run. */
	readonly relatedRefs: readonly string[];
}

/** One entry in a receipt artifact family. */
export interface RunArtifact {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
}

/** A Change artifact locates an in-place candidate in the body. */
export interface RunChangeArtifact extends RunArtifact {
	readonly changeId: string;
	readonly target: ComposerTarget;
}

/** A Source artifact opens / locates a read material. */
export interface RunSourceArtifact extends RunArtifact {
	readonly path: string;
}

/** A Trace artifact is a verifiable receipt only — never model reasoning (§12.3). */
export interface RunTraceArtifact extends RunArtifact {
	readonly kind: 'capability' | 'tool';
	readonly status: 'started' | 'ok' | 'cancelled' | 'failed';
}

/**
 * The per-run receipt rendered as ONE compact-then-expandable message. Counts
 * are derived, never stored redundantly.
 */
export interface RunReceipt {
	readonly runId: string;
	readonly status: CopilotRunStatus;
	/** Human action label ("润色当前段落"), resolved from config by the caller. */
	readonly action: string;
	/** Short target label ("引言 · 第 2 段"). */
	readonly targetLabel: string;
	readonly elapsedMs: number;
	readonly changes: readonly RunChangeArtifact[];
	readonly insights: readonly RunArtifact[];
	readonly sources: readonly RunSourceArtifact[];
	readonly trace: readonly RunTraceArtifact[];
	/** History transactions produced by accepting this run's changes (§12.3 bridge). */
	readonly acceptedTransactionIds: readonly string[];
}

/** Derived counts for the compact receipt header. */
export function receiptCounts(receipt: RunReceipt): Record<RunArtifactCategory, number> {
	return {
		changes: receipt.changes.length,
		insights: receipt.insights.length,
		sources: receipt.sources.length,
		trace: receipt.trace.length,
	};
}

/** The observable projection the Sidecar UI renders. */
export interface IntelligenceSessionProjection {
	readonly surface: IntelligenceTopSurface;
	readonly stage: CopilotStage;
	readonly runStatus: CopilotRunStatus;
	readonly activeRunId: string | null;
	/** Receipts in run order (newest last). */
	readonly receipts: readonly RunReceipt[];
	/** The task title of the current session (never the generic "对话"). */
	readonly sessionTitle: string | null;
}

let runSeq = 0;
function nextRunId(): string {
	runSeq += 1;
	return `cmp-copilot-run-${Date.now().toString(36)}-${runSeq.toString(36)}`;
}

/**
 * The Copilot session lifecycle machine. Guards enforce the contract: `review`
 * is only reachable from a run that proposed changes, and always returns to the
 * originating session; the top-surface switch never mutates run/receipt state.
 */
export class CopilotSessionMachine {
	private surface: IntelligenceTopSurface = 'copilot';
	private stage: CopilotStage = 'brief';
	private runStatus: CopilotRunStatus = 'idle';
	private activeRunId: string | null = null;
	private sessionTitle: string | null = null;
	private readonly receiptsById = new Map<string, RunReceipt>();
	private readonly frozenById = new Map<string, FrozenRunContext>();
	/** The session a review was entered from, so close returns there (never History). */
	private reviewOriginStage: CopilotStage = 'session';
	private readonly subs = new Set<(p: IntelligenceSessionProjection) => void>();

	subscribe(cb: (p: IntelligenceSessionProjection) => void): () => void {
		this.subs.add(cb);
		cb(this.projection());
		return () => this.subs.delete(cb);
	}

	projection(): IntelligenceSessionProjection {
		return {
			surface: this.surface,
			stage: this.stage,
			runStatus: this.runStatus,
			activeRunId: this.activeRunId,
			receipts: [...this.receiptsById.values()],
			sessionTitle: this.sessionTitle,
		};
	}

	/** Switch top surface. Projection-only: does not touch run/receipt/session. */
	selectSurface(surface: IntelligenceTopSurface): void {
		if (this.surface === surface) return;
		this.surface = surface;
		this.notify();
	}

	/**
	 * Brief → session. A brief handoff assembles chips and focuses the composer
	 * (the caller does the chip assembly); this only names the task and moves the
	 * stage. It never auto-runs (spec §Copilot brief handoff).
	 */
	openSession(taskTitle: string): void {
		this.stage = 'session';
		this.runStatus = 'idle';
		this.sessionTitle = taskTitle;
		this.notify();
	}

	/** Session → brief, preserving receipts + frozen contexts for resume. */
	backToBrief(): void {
		this.stage = 'brief';
		this.runStatus = 'idle';
		this.notify();
	}

	/**
	 * Send from the session: freeze the run context and enter `running`
	 * (assembling). Returns the frozen context (immutable). Later focus changes
	 * do NOT touch it — the next send freezes fresh (§12.2).
	 */
	send(input: { snapshot: ComposerContextSnapshot; targetQuote: string; relatedRefs?: readonly string[] }): FrozenRunContext {
		const runId = nextRunId();
		const frozen: FrozenRunContext = Object.freeze({
			runId,
			snapshot: input.snapshot,
			targetQuote: input.targetQuote,
			relatedRefs: Object.freeze([...(input.relatedRefs ?? [])]),
		});
		this.frozenById.set(runId, frozen);
		this.activeRunId = runId;
		this.stage = 'session';
		this.runStatus = 'assembling';
		this.receiptsById.set(runId, {
			runId,
			status: 'assembling',
			action: this.sessionTitle ?? '',
			targetLabel: input.targetQuote.slice(0, 48),
			elapsedMs: 0,
			changes: [],
			insights: [],
			sources: [],
			trace: [],
			acceptedTransactionIds: [],
		});
		this.notify();
		return frozen;
	}

	/** The frozen context for a run, or undefined. Immutable by construction. */
	frozenContext(runId: string): FrozenRunContext | undefined {
		return this.frozenById.get(runId);
	}

	/** Run began streaming tokens/candidates. */
	markStreaming(runId: string): void {
		this.updateRunStatus(runId, 'streaming');
	}

	/**
	 * Run produced one or more pending candidate patches → transient `review`.
	 * `review` is entered from the current session and remembers it as the origin.
	 */
	markProposed(runId: string, receipt: Partial<RunReceipt>): void {
		this.patchReceipt(runId, { ...receipt, status: 'proposed' });
		if (this.activeRunId !== runId) return;
		this.runStatus = 'proposed';
		this.reviewOriginStage = 'session';
		this.stage = 'review';
		this.notify();
	}

	/** Run finished with no proposed change — stay in the session (spec §Copilot). */
	markNoChange(runId: string, receipt?: Partial<RunReceipt>): void {
		this.patchReceipt(runId, { ...(receipt ?? {}), status: 'no-change' });
		if (this.activeRunId === runId) {
			this.runStatus = 'no-change';
			this.stage = 'session';
		}
		this.notify();
	}

	markError(runId: string, message: string): void {
		this.patchReceipt(runId, { status: 'error', insights: [] });
		if (this.activeRunId === runId) {
			this.runStatus = 'error';
			this.stage = 'session';
		}
		void message;
		this.notify();
	}

	markCancelled(runId: string): void {
		this.patchReceipt(runId, { status: 'cancelled' });
		if (this.activeRunId === runId) {
			this.runStatus = 'cancelled';
			this.stage = 'session';
		}
		this.notify();
	}

	/** Close the transient review → return to the originating session (never History). */
	closeReview(): void {
		if (this.stage !== 'review') return;
		this.stage = this.reviewOriginStage;
		this.notify();
	}

	/** Record an accepted-change → History transaction link on the run receipt (§12.3). */
	linkAcceptedTransaction(runId: string, transactionId: string): void {
		const receipt = this.receiptsById.get(runId);
		if (!receipt) return;
		if (receipt.acceptedTransactionIds.includes(transactionId)) return;
		this.receiptsById.set(runId, {
			...receipt,
			acceptedTransactionIds: [...receipt.acceptedTransactionIds, transactionId],
		});
		this.notify();
	}

	private updateRunStatus(runId: string, status: CopilotRunStatus): void {
		this.patchReceipt(runId, { status });
		if (this.activeRunId === runId) this.runStatus = status;
		this.notify();
	}

	private patchReceipt(runId: string, patch: Partial<RunReceipt>): void {
		const existing = this.receiptsById.get(runId);
		if (!existing) return;
		this.receiptsById.set(runId, { ...existing, ...patch });
	}

	private notify(): void {
		const projection = this.projection();
		for (const cb of this.subs) cb(projection);
	}
}
