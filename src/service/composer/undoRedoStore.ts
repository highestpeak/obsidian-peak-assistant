/**
 * Peak Composer — document Undo/Redo stack (WP2, handoff §9.7).
 *
 * A pure stack manager: it decides WHAT to revert / re-apply, the hub does the
 * actual engine writes. A commit pushes onto the undo stack and CLEARS the redo
 * branch (a new edit after an undo makes redo meaningless). Consecutive edits
 * that share a coalesce key (a typing burst on the same target, or the children
 * of one AI run) fold into a single undo STEP so one Cmd+Z reverts the whole
 * burst / run rather than one keystroke at a time.
 *
 * Pending candidates are NOT represented here — they use discard/restore in the
 * candidate store, never document undo (§9.7).
 */

import { composerTargetBlockId } from '@/core/composer';
import type {
	ComposerTransaction,
	ComposerTransactionConfig,
	UndoRedoProjection,
} from '@/core/composer';

interface UndoStep {
	transactions: ComposerTransaction[];
	coalesceKey: string | null;
	lastAt: number;
}

/**
 * Coalesce key for a transaction, or null when it must stand alone. Mirrors the
 * History grouping: an explicit `groupId` (typing burst) or `runId` (one AI run)
 * folds unconditionally so one Cmd+Z reverts the whole burst / run; the
 * `direct` + same-target fallback is bounded by the burst time window.
 */
function coalesceKeyFor(txn: ComposerTransaction): string | null {
	if (txn.groupId) return `group:${txn.groupId}`;
	if (txn.runId) return `run:${txn.runId}`;
	if (txn.origin === 'direct') {
		const block = (txn.target && composerTargetBlockId(txn.target)) ?? 'doc';
		return `burst:${block}`;
	}
	return null;
}

function stepLabel(step: UndoStep): string {
	const last = step.transactions[step.transactions.length - 1];
	if (step.transactions.length > 1) return `${last.label} (${step.transactions.length})`;
	return last.label;
}

export class ComposerUndoRedoStore {
	private undoStack: UndoStep[] = [];
	private redoStack: UndoStep[] = [];

	constructor(private readonly config: ComposerTransactionConfig) {}

	/** Push a freshly-committed transaction; clears the redo branch. */
	pushCommit(txn: ComposerTransaction): void {
		this.redoStack = [];
		const key = coalesceKeyFor(txn);
		const top = this.undoStack[this.undoStack.length - 1];
		if (key && top && top.coalesceKey === key && this.withinWindow(txn, top, key)) {
			top.transactions.push(txn);
			top.lastAt = txn.committedAt;
			return;
		}
		this.undoStack.push({ transactions: [txn], coalesceKey: key, lastAt: txn.committedAt });
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/**
	 * The transactions of the top undo step, in the order they were committed.
	 * The hub reverts them in REVERSE (applying each stored inverse), then calls
	 * {@link commitUndo} to move the step onto the redo stack.
	 */
	peekUndo(): readonly ComposerTransaction[] | null {
		const top = this.undoStack[this.undoStack.length - 1];
		return top ? top.transactions : null;
	}

	/** The transactions of the top redo step, in commit order (re-applied forward). */
	peekRedo(): readonly ComposerTransaction[] | null {
		const top = this.redoStack[this.redoStack.length - 1];
		return top ? top.transactions : null;
	}

	/** Move the top undo step onto the redo stack (after a successful revert). */
	commitUndo(): void {
		const step = this.undoStack.pop();
		if (step) this.redoStack.push(step);
	}

	/** Move the top redo step back onto the undo stack (after a successful redo). */
	commitRedo(): void {
		const step = this.redoStack.pop();
		if (step) this.undoStack.push(step);
	}

	projection(): UndoRedoProjection {
		const undoTop = this.undoStack[this.undoStack.length - 1];
		const redoTop = this.redoStack[this.redoStack.length - 1];
		return {
			canUndo: this.undoStack.length > 0,
			canRedo: this.redoStack.length > 0,
			nextUndoLabel: undoTop ? stepLabel(undoTop) : null,
			nextRedoLabel: redoTop ? stepLabel(redoTop) : null,
			undoDepth: this.undoStack.length,
			redoDepth: this.redoStack.length,
		};
	}

	private withinWindow(txn: ComposerTransaction, top: UndoStep, key: string): boolean {
		if (!key.startsWith('burst:')) return true; // explicit group / AI run always folds
		return txn.committedAt - top.lastAt <= this.config.burstWindowMs;
	}
}
