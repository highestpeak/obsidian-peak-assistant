/**
 * Peak Composer — transaction / candidate / History domain types (WP2).
 *
 * These are the framework-neutral shapes the transaction engine, candidate
 * store, History projection and Undo/Redo stack all speak. They intentionally
 * know nothing about Obsidian, React, or the DOM (boundary-guarded).
 *
 * See docs/superpowers/plans/2026-07-24-peak-composer-complete-implementation-handoff.md
 * §5.2 (Transaction), §5.3 (Candidate/variant), §9.6 (History), §9.7 (Undo).
 */

import type { ComposerOperation, OperationStats } from './operations';
import type { ComposerTarget } from './types';

/**
 * Where a committed change came from (§5.2). Drives History labelling and undo
 * grouping — `system-rollback` is the inverse transaction appended when a
 * History entry is rolled back (never deletes the original).
 */
export type ComposerTransactionOrigin = 'direct' | 'deterministic' | 'ai' | 'system-rollback';

/**
 * A committed, reversible change to one document (§5.2). `operations` are in the
 * base-revision coordinate space; `inverseOperations` are in the resulting
 * revision's space, so applying them reverts the commit exactly.
 */
export interface ComposerTransaction {
	transactionId: string;
	documentId: string;
	baseRevision: string;
	/** Revision the document reached AFTER this transaction was applied. */
	resultRevision: string;
	origin: ComposerTransactionOrigin;
	label: string;
	operations: readonly ComposerOperation[];
	inverseOperations: readonly ComposerOperation[];
	/** Groups sibling child transactions (typing burst / one AI run). */
	groupId?: string;
	/** The AI run that produced this change, if any. */
	runId?: string;
	/** Coarse +/- stats for History display. */
	stats: OperationStats;
	/** What the change targeted (for History "locate"). */
	target?: ComposerTarget;
	committedAt: number;
}

/**
 * A concrete, typed proposal that can be committed. `operations` are the edits
 * to apply on accept (base-revision coords); `result` carries the typed payload
 * (text patch, table patch, …) for WP3+ renderers; `summary` is a short label.
 */
export interface ProposedChange<TResult = unknown> {
	operations: readonly ComposerOperation[];
	result?: TResult;
	summary?: string;
}

/** Lifecycle of one variant's generation. */
export type CandidateVariantStatus = 'streaming' | 'ready' | 'failed';

/**
 * One generation attempt for a candidate (§5.3). Regeneration APPENDS a new
 * variant — it never overwrites an existing one, so variant history is
 * preserved. The `instruction` is run context (the targeted follow-up), NOT the
 * candidate body: it is stored beside the change, never rendered as content.
 */
export interface CandidateVariant<TResult = unknown> {
	variantId: string;
	provenance: 'initial' | 'regeneration';
	status: CandidateVariantStatus;
	proposedChange: ProposedChange<TResult>;
	/** Targeted instruction that produced this variant (run context, not body). */
	instruction?: string;
	createdAt: number;
}

/**
 * Lifecycle of a candidate (§5.3). `pending` states (`streaming`/`ready`) never
 * touch Markdown, History or Undo. Only an active `ready` variant on a
 * non-`stale` candidate may be accepted; a `stale` candidate must be rebased /
 * re-run or reported as a conflict, never silently applied.
 */
export type ComposerCandidateStatus =
	| 'streaming'
	| 'ready'
	| 'stale'
	| 'accepted'
	| 'discarded'
	| 'failed';

/** A pending, reviewable proposal targeting one part of the document (§5.3). */
export interface ComposerCandidate<TResult = unknown> {
	candidateId: string;
	target: ComposerTarget;
	baseRevision: string;
	status: ComposerCandidateStatus;
	variants: readonly CandidateVariant<TResult>[];
	activeVariantId: string;
	/** Convenience mirror of the active variant's proposed change. */
	proposedChange: ProposedChange<TResult>;
	/**
	 * Block the candidate is anchored to (for cross-reparse migration via
	 * `matchBlocks`). Derived from `target` for block/unit targets.
	 */
	anchorBlockId?: string;
}

/**
 * One entry in the History ledger (§9.6). Committed transactions project into
 * items; a typing burst or a single AI run projects into a PARENT item whose
 * `children` are the individual transactions — each child is still independently
 * locatable and diff-able. A rollback appends a new item (`isRollback`) rather
 * than deleting the original.
 */
export interface ComposerHistoryItem {
	historyId: string;
	transactionId: string;
	origin: ComposerTransactionOrigin;
	label: string;
	timestamp: number;
	target?: ComposerTarget;
	groupId?: string;
	runId?: string;
	stats: OperationStats;
	isRollback?: boolean;
	/** Grouped child items (typing burst / AI run children). */
	children?: ComposerHistoryItem[];
}

/** Snapshot of the Undo/Redo stack the UI (WP4 bottom status bar) subscribes to. */
export interface UndoRedoProjection {
	canUndo: boolean;
	canRedo: boolean;
	/** Label of the transaction that Undo would revert next, if any. */
	nextUndoLabel: string | null;
	/** Label of the transaction that Redo would re-apply next, if any. */
	nextRedoLabel: string | null;
	undoDepth: number;
	redoDepth: number;
}

/**
 * The full, subscribable projection WP3/WP4 consume from the transaction hub.
 * Contains no live objects — recomputed and frozen on every change.
 */
export interface ComposerTransactionProjection {
	revision: string;
	history: readonly ComposerHistoryItem[];
	undo: UndoRedoProjection;
	candidates: readonly ComposerCandidate[];
}

/**
 * Typed transaction event (the "unified transaction event" of the commit's
 * eighth step). Controller-scoped — it is NOT dispatched through the global
 * EventBus / workspace, so it needs no `peak:` namespace and does not fall
 * under the event-bus raw-string guard.
 */
export type ComposerTransactionEvent =
	| { type: 'committed'; transaction: ComposerTransaction }
	| { type: 'undone'; transactions: readonly ComposerTransaction[] }
	| { type: 'redone'; transactions: readonly ComposerTransaction[] }
	| { type: 'rolled-back'; transaction: ComposerTransaction; targetHistoryId: string }
	| { type: 'candidate-changed'; candidateId: string; status: ComposerCandidateStatus }
	| { type: 'candidates-revalidated'; staleIds: readonly string[] }
	| { type: 'conflict'; reason: ComposerConflictReason };

/** Why a commit / accept / rollback was refused. */
export type ComposerConflictReason =
	| 'revision-mismatch'
	| 'target-missing-after-reparse'
	| 'stale-candidate'
	| 'anchor-drift';

/** Thrown by the transaction engine / hub when a write is refused for safety. */
export class ComposerConflictError extends Error {
	constructor(public readonly reason: ComposerConflictReason, message?: string) {
		super(message ?? `composer conflict: ${reason}`);
		this.name = 'ComposerConflictError';
	}
}
