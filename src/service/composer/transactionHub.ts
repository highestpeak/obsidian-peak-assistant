/**
 * Peak Composer — transaction hub (WP2).
 *
 * The single per-document coordinator that ties the transaction engine, the
 * candidate store, the History ledger and the Undo/Redo stack together, and
 * exposes ONE subscribable projection (history + undo + candidates) plus a typed
 * event stream for WP3/WP4 to consume. It owns no Obsidian / React state — the
 * app layer injects the source + write ports and the resolved config.
 *
 * Responsibilities per the handoff:
 *   - commit (§5.2): engine writes atomically, then History records, Undo pushes,
 *     Redo clears, pending candidates revalidate, and the unified event fires;
 *   - accept a candidate (§5.3): only an active `ready` variant on a fresh
 *     candidate commits; a stale one is refused with a conflict;
 *   - undo/redo (§9.7): document-level stack replayed through the engine;
 *   - rollback (§9.6): appends an inverse transaction, never deletes history;
 *   - external change: pending candidates go stale, never silently redirected.
 */

import {
	makeGroupId,
	ComposerConflictError,
	type ComposerCandidate,
	type ComposerDocumentSnapshot,
	type ComposerHistoryItem,
	type ComposerOperation,
	type ComposerTarget,
	type ComposerTransaction,
	type ComposerTransactionConfig,
	type ComposerTransactionEvent,
	type ComposerTransactionOrigin,
	type ComposerTransactionProjection,
	type ProposedChange,
	DEFAULT_TRANSACTION_CONFIG,
} from '@/core/composer';
import { ComposerCandidateStore, type AddVariantInput } from './candidateStore';
import { ComposerHistoryStore } from './historyStore';
import { ComposerTransactionEngine } from './transactionEngine';
import { ComposerUndoRedoStore } from './undoRedoStore';
import type { ComposerDocumentSession } from './documentSession';

export interface ComposerCommitInput {
	origin: ComposerTransactionOrigin;
	label: string;
	operations: readonly ComposerOperation[];
	target?: ComposerTarget;
	groupId?: string;
	runId?: string;
	expectedBlockDelta?: number;
}

export interface CreateCandidateArgs<TResult = unknown> {
	target: ComposerTarget;
	proposedChange: ProposedChange<TResult>;
	streaming?: boolean;
	instruction?: string;
}

export interface AcceptOptions {
	origin?: ComposerTransactionOrigin;
	label?: string;
	runId?: string;
}

export interface ComposerHistoryPreview {
	readonly item: ComposerHistoryItem;
	readonly beforeText: string;
	readonly afterText: string;
}

export class ComposerTransactionHub {
	private readonly engine: ComposerTransactionEngine;
	private readonly candidates: ComposerCandidateStore;
	private readonly history: ComposerHistoryStore;
	private readonly undoRedo: ComposerUndoRedoStore;
	/** Full ledger of committed transactions, keyed by id (for rollback). */
	private readonly ledger = new Map<string, ComposerTransaction>();
	private readonly projectionSubs = new Set<(p: ComposerTransactionProjection) => void>();
	private readonly eventSubs = new Set<(e: ComposerTransactionEvent) => void>();

	constructor(
		private session: ComposerDocumentSession,
		deps: { engine: ComposerTransactionEngine; config?: ComposerTransactionConfig },
	) {
		this.engine = deps.engine;
		const config = deps.config ?? DEFAULT_TRANSACTION_CONFIG;
		this.candidates = new ComposerCandidateStore();
		this.history = new ComposerHistoryStore(config);
		this.undoRedo = new ComposerUndoRedoStore(config);
	}

	// ── subscriptions ───────────────────────────────────────────────────────────

	/** Subscribe to the full projection (fires immediately with current state). */
	subscribe(cb: (p: ComposerTransactionProjection) => void): () => void {
		this.projectionSubs.add(cb);
		cb(this.projection());
		return () => this.projectionSubs.delete(cb);
	}

	/** Subscribe to typed transaction events (unified event, §5.2 step 8). */
	on(cb: (e: ComposerTransactionEvent) => void): () => void {
		this.eventSubs.add(cb);
		return () => this.eventSubs.delete(cb);
	}

	/** Current subscribable projection (immutable snapshot). */
	projection(): ComposerTransactionProjection {
		return {
			revision: this.session.baseRevision,
			history: this.history.list(),
			undo: this.undoRedo.projection(),
			candidates: this.candidates.list(),
		};
	}

	get currentRevision(): string {
		return this.session.baseRevision;
	}

	/**
	 * Read-only preview for the History inspector. Text is derived from the same
	 * committed operation/inverse-operation pair used by rollback, so the UI
	 * never guesses a diff from labels or from the current document revision.
	 */
	historyPreview(historyId: string): ComposerHistoryPreview | null {
		const item = this.history.find(historyId);
		const txn = item ? this.ledger.get(item.transactionId) : undefined;
		if (!item || !txn) return null;
		return {
			item,
			beforeText: txn.inverseOperations
				.filter((operation) => operation.kind === 'replaceRange')
				.map((operation) => operation.text)
				.join('\n'),
			afterText: txn.operations
				.flatMap((operation) => {
					if (operation.kind === 'replaceRange' || operation.kind === 'insertBlock') {
						return [operation.text];
					}
					return [];
				})
				.join('\n'),
		};
	}

	// ── commit ───────────────────────────────────────────────────────────────────

	/** Commit a direct / deterministic / AI transaction atomically. */
	async commit(input: ComposerCommitInput): Promise<ComposerTransaction> {
		const prev = this.session.snapshot;
		const txn = await this.engine.commit(this.session, input);
		this.ledger.set(txn.transactionId, txn);
		this.history.record(txn);
		this.undoRedo.pushCommit(txn);
		this.revalidateCandidates(prev);
		this.emit({ type: 'committed', transaction: txn });
		this.notify();
		return txn;
	}

	// ── candidates ────────────────────────────────────────────────────────────────

	createCandidate<TResult = unknown>(args: CreateCandidateArgs<TResult>): ComposerCandidate<TResult> {
		const candidate = this.candidates.create<TResult>({
			target: args.target,
			baseRevision: this.session.baseRevision,
			proposedChange: args.proposedChange,
			streaming: args.streaming,
			instruction: args.instruction,
		});
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	addVariant<TResult = unknown>(candidateId: string, input: AddVariantInput<TResult>): ComposerCandidate<TResult> {
		const candidate = this.candidates.addVariant<TResult>(candidateId, input);
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	setActiveVariant(candidateId: string, variantId: string): ComposerCandidate {
		const candidate = this.candidates.setActiveVariant(candidateId, variantId);
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	markVariantReady<TResult = unknown>(candidateId: string, proposedChange: ProposedChange<TResult>): ComposerCandidate {
		const candidate = this.candidates.markVariantReady(candidateId, proposedChange);
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	markVariantFailed(candidateId: string, error?: string): ComposerCandidate {
		const candidate = this.candidates.markVariantFailed(candidateId, error);
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	markVariantCancelled(candidateId: string): ComposerCandidate {
		const candidate = this.candidates.markVariantCancelled(candidateId);
		this.emitCandidate(candidate);
		this.notify();
		return candidate;
	}

	/** Immediately block review acceptance after an out-of-band file change. */
	markCandidatesStale(): string[] {
		const staleIds = this.candidates.markAllStale();
		if (staleIds.length > 0) {
			this.emit({ type: 'candidates-revalidated', staleIds });
			this.notify();
		}
		return staleIds;
	}

	/** Restore one persisted review candidate into this document projection. */
	restoreCandidateSnapshot(candidate: ComposerCandidate): boolean {
		const restored = this.candidates.restoreSnapshot(candidate);
		if (!restored) return false;
		this.emitCandidate(candidate);
		this.notify();
		return true;
	}

	/** Discard a pending candidate (candidate-local; never a document undo). */
	discardCandidate(candidateId: string): void {
		const candidate = this.candidates.get(candidateId);
		this.candidates.discard(candidateId);
		if (candidate) {
			this.emit({ type: 'candidate-changed', candidateId, status: 'discarded' });
		}
		this.notify();
	}

	/**
	 * Mark a candidate accepted WITHOUT a Markdown commit. For results whose write
	 * lands OUTSIDE this document's transaction ledger — a `native-file-patch`
	 * written to a separate `.base`/`.canvas`/`.excalidraw` file through the
	 * native-file port — so the candidate leaves the pending list once its own
	 * revision-guarded write has succeeded. Never touches Markdown / History / Undo.
	 */
	markCandidateAccepted(candidateId: string): void {
		this.candidates.markAccepted(candidateId);
		this.emit({ type: 'candidate-changed', candidateId, status: 'accepted' });
		this.notify();
	}

	/** Restore a discarded candidate (candidate-local; never a document redo). */
	restoreCandidate(candidateId: string): ComposerCandidate | undefined {
		const candidate = this.candidates.restore(candidateId);
		this.notify();
		return candidate;
	}

	/**
	 * Accept a candidate: commits the active `ready` variant's operations. Throws
	 * {@link ComposerConflictError}(`stale-candidate`) when the candidate is stale
	 * or its base revision has drifted (it must be re-run / rebased first).
	 */
	async acceptCandidate(candidateId: string, opts: AcceptOptions = {}): Promise<ComposerTransaction> {
		const prepared = this.candidates.prepareAccept(candidateId, this.session.baseRevision);
		if (!prepared.ok) {
			// The only candidate-scoped conflict reason; the specific cause (stale
			// vs not-ready) rides along in the message for the caller/log.
			this.emit({ type: 'conflict', reason: 'stale-candidate' });
			this.notify();
			throw new ComposerConflictError('stale-candidate', `candidate ${candidateId} is ${prepared.reason}`);
		}
		const candidate = prepared.candidate;
		const txn = await this.commit({
			origin: opts.origin ?? 'ai',
			label: opts.label ?? candidate.proposedChange.summary ?? 'Accept suggestion',
			operations: candidate.proposedChange.operations,
			target: candidate.target,
			runId: opts.runId,
		});
		this.candidates.markAccepted(candidateId);
		this.emit({ type: 'candidate-changed', candidateId, status: 'accepted' });
		this.notify();
		return txn;
	}

	// ── undo / redo ───────────────────────────────────────────────────────────────

	async undo(): Promise<boolean> {
		const step = this.undoRedo.peekUndo();
		if (!step || step.length === 0) return false;
		const prev = this.session.snapshot;
		// Revert in reverse commit order so each stored inverse applies at the
		// exact revision it bridges.
		for (let i = step.length - 1; i >= 0; i--) {
			await this.engine.revert(this.session, step[i]);
		}
		this.undoRedo.commitUndo();
		this.revalidateCandidates(prev);
		this.emit({ type: 'undone', transactions: [...step] });
		this.notify();
		return true;
	}

	async redo(): Promise<boolean> {
		const step = this.undoRedo.peekRedo();
		if (!step || step.length === 0) return false;
		const prev = this.session.snapshot;
		for (let i = 0; i < step.length; i++) {
			await this.engine.reapply(this.session, step[i]);
		}
		this.undoRedo.commitRedo();
		this.revalidateCandidates(prev);
		this.emit({ type: 'redone', transactions: [...step] });
		this.notify();
		return true;
	}

	// ── rollback (History) ─────────────────────────────────────────────────────────

	/**
	 * Roll back a History entry by appending an inverse transaction (§9.6): the
	 * original entry is preserved and a new `system-rollback` transaction is
	 * committed + pushed to Undo. Refused with `anchor-drift` when the region the
	 * transaction touched has since changed (a safe rebase is out of WP2 scope).
	 */
	async rollback(historyId: string): Promise<ComposerTransaction> {
		const item = this.history.find(historyId);
		const txn = item ? this.ledger.get(item.transactionId) : undefined;
		if (!item || !txn) throw new Error(`no rollbackable transaction for history ${historyId}`);
		if (!this.isInverseApplicable(txn, this.session.snapshot.sourceText)) {
			this.emit({ type: 'conflict', reason: 'anchor-drift' });
			this.notify();
			throw new ComposerConflictError('anchor-drift', `cannot roll back ${historyId}: region has changed`);
		}
		const prev = this.session.snapshot;
		const inverseTxn = await this.engine.commit(this.session, {
			origin: 'system-rollback',
			label: `Undo: ${txn.label}`,
			operations: txn.inverseOperations,
			target: txn.target,
			groupId: makeGroupId(),
			expectedBlockDelta: -txn.expectedBlockDelta,
		});
		this.ledger.set(inverseTxn.transactionId, inverseTxn);
		this.history.recordRollback(inverseTxn, historyId);
		this.undoRedo.pushCommit(inverseTxn);
		this.revalidateCandidates(prev);
		this.emit({ type: 'rolled-back', transaction: inverseTxn, targetHistoryId: historyId });
		this.notify();
		return inverseTxn;
	}

	// ── external change ─────────────────────────────────────────────────────────────

	/**
	 * Adopt a snapshot produced by an external reparse (the lifecycle controller
	 * detected an out-of-band edit). Pending candidates are migrated / marked
	 * stale; the undo/redo stack is left intact — the engine's revision guard
	 * safely refuses any replay whose coordinates no longer line up.
	 */
	adoptExternalSnapshot(next: ComposerDocumentSnapshot): void {
		const prev = this.session.snapshot;
		this.session.adoptSnapshot(next);
		this.revalidateCandidates(prev);
		this.notify();
	}

	// ── internals ─────────────────────────────────────────────────────────────────

	private revalidateCandidates(prev: ComposerDocumentSnapshot): void {
		const staleIds = this.candidates.revalidate(prev, this.session.snapshot);
		if (staleIds.length > 0) this.emit({ type: 'candidates-revalidated', staleIds });
	}

	/**
	 * Whether `txn` can still be safely rolled back against the current source.
	 * On-top (session at the transaction's result revision) is always exact. For
	 * a superseded entry we require every inverse `replaceRange` to still hold, in
	 * bounds, the exact text the forward edit inserted — i.e. the region was not
	 * touched since. Transactions with block move/remove are rolled back only
	 * while on-top (a safe rebase is out of WP2 scope).
	 */
	private isInverseApplicable(txn: ComposerTransaction, currentSource: string): boolean {
		if (this.session.baseRevision === txn.resultRevision) return true;
		const inserts = forwardReplaceInserts(txn);
		if (!inserts) return false;
		const inverse = txn.inverseOperations;
		if (inverse.length !== inserts.length) return false;
		for (let i = 0; i < inverse.length; i++) {
			const op = inverse[i];
			if (op.kind !== 'replaceRange') return false;
			if (op.to > currentSource.length || op.from > op.to) return false;
			if (currentSource.slice(op.from, op.to) !== inserts[i]) return false;
		}
		return true;
	}

	private emitCandidate(candidate: ComposerCandidate): void {
		this.emit({ type: 'candidate-changed', candidateId: candidate.candidateId, status: candidate.status });
	}

	private emit(event: ComposerTransactionEvent): void {
		for (const cb of this.eventSubs) cb(event);
	}

	private notify(): void {
		const projection = this.projection();
		for (const cb of this.projectionSubs) cb(projection);
	}
}

/**
 * The insert text each forward edit contributes, in ascending offset order (the
 * same order `deriveInverseOperations` produced the inverse in, so index i pairs
 * inverse[i] with the i-th forward insert). Returns null when any operation is a
 * block move/remove — those are rolled back only while on-top.
 */
function forwardReplaceInserts(txn: ComposerTransaction): string[] | null {
	const inserts: Array<{ from: number; insert: string }> = [];
	for (const op of txn.operations) {
		if (op.kind === 'replaceRange') inserts.push({ from: op.from, insert: op.text });
		else if (op.kind === 'insertBlock') inserts.push({ from: op.at, insert: op.text });
		else return null; // removeBlock / moveBlock → on-top only
	}
	return inserts.sort((a, b) => a.from - b.from).map((e) => e.insert);
}
