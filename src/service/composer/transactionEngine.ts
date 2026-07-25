/**
 * Peak Composer — transaction engine (WP2).
 *
 * Executes the atomic commit contract (handoff §5.2). One commit is
 * all-or-nothing: it either advances the document by a fully-validated,
 * reversible {@link ComposerTransaction} or it throws and NOTHING is persisted.
 *
 * The eight commit steps (§5.2) map here as follows:
 *
 *   1. revalidate the base revision against the LIVE file  → `persist` step 1
 *   2. apply operations atomically                          → `applyOperations`
 *   3. reparse + assert the target semantic still exists    → `assertReparseSafe`
 *   4. write to the Vault (revision-guarded)                → `write.writeSource`
 *   5–8. record History / push Undo / clear Redo / emit event → owned by the
 *        {@link ComposerTransactionHub}; the engine returns the transaction.
 *
 * IMPORTANT ordering note: the reparse-assert (step 3 in the list above) runs on
 * the PROSPECTIVE `nextText` in memory, BEFORE the write, not after it. The
 * handoff lists "write" before "reparse and confirm", but a post-write reparse
 * cannot un-persist a bad splice — doing the assertion pre-write is what makes
 * "step-4 failure → nothing persisted, nothing in History" actually hold. A bad
 * patch (e.g. one that eats an inter-block separator and fuses two blocks) is
 * caught and rejected before a single byte reaches disk.
 *
 * `revert` / `reapply` reuse the same persistence path for Undo / Redo: they
 * replay a stored transaction's inverse (undo) or forward (redo) operations with
 * a strict revision guard, so the stack can only move the document between the
 * exact revisions the transaction bridged.
 */

import {
	applyOperations,
	computeOperationStats,
	deriveInverseOperations,
	makeTransactionId,
	ComposerConflictError,
	type ComposerDocumentSnapshot,
	type ComposerOperation,
	type ComposerTarget,
	type ComposerTransaction,
	type ComposerTransactionOrigin,
} from '@/core/composer';
import { matchBlocks } from './blockIdentity';
import { parseComposerDocument, reconstruct } from './documentParser';
import type { ComposerDocumentSession } from './documentSession';
import { ComposerSourceRevisionService } from './sourceRevisionService';
import type { ComposerSourcePort, ComposerWritePort } from './ports';

export interface CommitSpec {
	origin: ComposerTransactionOrigin;
	label: string;
	operations: readonly ComposerOperation[];
	target?: ComposerTarget;
	groupId?: string;
	runId?: string;
	/**
	 * Intended change in top-level block count. Defaults to the value derived
	 * from the operation kinds (`insertBlock` +1, `removeBlock` −1, others 0). A
	 * caller performing a deliberate structural change (paragraph → two blocks)
	 * overrides this; the default is what rejects a separator-eating patch.
	 */
	expectedBlockDelta?: number;
}

interface PersistOptions {
	target?: ComposerTarget;
	expectedBlockDelta: number;
}

export class ComposerTransactionEngine {
	constructor(
		private readonly source: ComposerSourcePort,
		private readonly write: ComposerWritePort,
		private readonly revisionService: ComposerSourceRevisionService = new ComposerSourceRevisionService(),
	) {}

	/**
	 * Commit `spec` against `session`, advancing the session on success. Throws
	 * {@link ComposerConflictError} (nothing persisted) when the base revision
	 * has drifted or the reparse-assert fails.
	 */
	async commit(session: ComposerDocumentSession, spec: CommitSpec): Promise<ComposerTransaction> {
		const base = session.snapshot;
		const next = await this.persist(session, spec.operations, {
			target: spec.target,
			expectedBlockDelta: spec.expectedBlockDelta ?? defaultBlockDelta(spec.operations),
		});
		return {
			transactionId: makeTransactionId(spec.origin),
			documentId: base.documentId,
			baseRevision: base.revision,
			resultRevision: next.revision,
			origin: spec.origin,
			label: spec.label,
			operations: spec.operations,
			inverseOperations: deriveInverseOperations(base.sourceText, spec.operations),
			groupId: spec.groupId,
			runId: spec.runId,
			stats: computeOperationStats(base.sourceText, spec.operations),
			target: spec.target,
			committedAt: Date.now(),
		};
	}

	/**
	 * Revert a committed transaction (Undo). The session MUST currently be at the
	 * transaction's `resultRevision`; the inverse operations then restore its
	 * `baseRevision`. Any drift throws `revision-mismatch` (nothing persisted).
	 */
	async revert(session: ComposerDocumentSession, txn: ComposerTransaction): Promise<void> {
		if (session.baseRevision !== txn.resultRevision) {
			throw new ComposerConflictError('revision-mismatch', 'undo target revision has moved');
		}
		await this.persist(session, txn.inverseOperations, {
			target: txn.target,
			expectedBlockDelta: -defaultBlockDelta(txn.operations),
		});
	}

	/**
	 * Re-apply a committed transaction (Redo). The session MUST currently be at
	 * the transaction's `baseRevision`; the forward operations reach its
	 * `resultRevision`. Any drift throws `revision-mismatch`.
	 */
	async reapply(session: ComposerDocumentSession, txn: ComposerTransaction): Promise<void> {
		if (session.baseRevision !== txn.baseRevision) {
			throw new ComposerConflictError('revision-mismatch', 'redo base revision has moved');
		}
		await this.persist(session, txn.operations, {
			target: txn.target,
			expectedBlockDelta: defaultBlockDelta(txn.operations),
		});
	}

	// ── shared persistence path (steps 1–4) ─────────────────────────────────────

	private async persist(
		session: ComposerDocumentSession,
		operations: readonly ComposerOperation[],
		opts: PersistOptions,
	): Promise<ComposerDocumentSnapshot> {
		const base = session.snapshot;

		// Step 1 — revalidate base revision against the live file.
		const liveText = await this.source.readSource(session.filePath);
		if (this.revisionService.isExternallyModified(base, liveText)) {
			throw new ComposerConflictError(
				'revision-mismatch',
				`base revision ${base.revision} no longer matches live source`,
			);
		}

		// Step 2 — apply operations atomically (throws on overlap / bounds).
		const nextText = applyOperations(base.sourceText, operations);

		// Step 3 — reparse the prospective text and assert structure survives.
		const nextSnapshot = parseComposerDocument(nextText, { filePath: session.filePath });
		this.assertReparseSafe(base, nextSnapshot, nextText, opts);

		// Step 4 — persist (revision-guarded; the port re-checks expectedBaseText).
		await this.write.writeSource(session.filePath, nextText, base.sourceText);

		// Advance the session to the freshly-persisted revision.
		return session.reparse(nextText);
	}

	private assertReparseSafe(
		base: ComposerDocumentSnapshot,
		next: ComposerDocumentSnapshot,
		nextText: string,
		opts: PersistOptions,
	): void {
		if (reconstruct(next) !== nextText) {
			throw new ComposerConflictError('target-missing-after-reparse', 'reparse is not lossless');
		}
		const actualDelta = next.blocks.length - base.blocks.length;
		if (actualDelta !== opts.expectedBlockDelta) {
			throw new ComposerConflictError(
				'target-missing-after-reparse',
				`block-count delta ${actualDelta} ≠ expected ${opts.expectedBlockDelta} (a patch may have fused/split blocks)`,
			);
		}
		const targetBlockId = targetBlockOf(opts.target);
		if (!targetBlockId) return;
		const oldBlock = base.blocks.find((b) => b.blockId === targetBlockId);
		if (!oldBlock) return; // target was not a live block (nothing to preserve)
		const match = matchBlocks(base.blocks, next.blocks).find((m) => m.oldBlockId === targetBlockId);
		if (!match) {
			throw new ComposerConflictError(
				'target-missing-after-reparse',
				`target block ${targetBlockId} did not survive the reparse`,
			);
		}
		const newBlock = next.blocks.find((b) => b.blockId === match.newBlockId);
		if (newBlock && newBlock.kind !== oldBlock.kind) {
			throw new ComposerConflictError(
				'target-missing-after-reparse',
				`target block changed kind ${oldBlock.kind} → ${newBlock.kind}`,
			);
		}
	}
}

function defaultBlockDelta(operations: readonly ComposerOperation[]): number {
	let delta = 0;
	for (const op of operations) {
		if (op.kind === 'insertBlock') delta += 1;
		else if (op.kind === 'removeBlock') delta -= 1;
	}
	return delta;
}

function targetBlockOf(target: ComposerTarget | undefined): string | null {
	if (!target) return null;
	if (target.kind === 'block' || target.kind === 'unit') return target.blockId;
	return null;
}
