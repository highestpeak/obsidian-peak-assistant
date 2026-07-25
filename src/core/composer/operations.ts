/**
 * Peak Composer — discrete, reversible operation algebra (WP2, framework-neutral).
 *
 * A {@link ComposerOperation} is a *semantic* edit expressed in the coordinate
 * space of one document revision (the base source the transaction was built on).
 * Every operation compiles down to a set of primitive {@link TextEdit}s — a
 * splice of `[from,to)` for `insert` — so applying and inverting a whole
 * transaction is one deterministic algorithm regardless of operation kind.
 *
 * Contract (locked with WP1's patch contract, see `types.ts` SourceAnchor):
 *
 *   1. A block patch may only touch bytes strictly INSIDE a block's `[from,to)`;
 *      the inter-block separator in the gap is never absorbed. Operations here
 *      carry raw offsets, so the caller (transaction engine) is responsible for
 *      keeping ranges inside block bounds — but {@link operationsToEdits} +
 *      {@link applyTextEdits} reject *overlapping* edits, which is the atomicity
 *      guard: a transaction whose operations collide is refused whole.
 *
 *   2. {@link applyOperations} is atomic — it either produces the fully-edited
 *      source or throws; it never applies a partial subset.
 *
 *   3. {@link deriveInverseOperations} returns `replaceRange` operations in the
 *      coordinate space of the RESULT source, such that
 *      `applyOperations(applyOperations(base, ops), inverse) === base`. This is
 *      the "apply + invert === original" invariant the atomicity test asserts.
 */

import type { ComposerBlockKind } from './types';

/** A primitive splice: replace bytes `[from,to)` of a source string with `insert`. */
export interface TextEdit {
	from: number;
	to: number;
	insert: string;
}

/**
 * Discrete reversible operation. Offsets are UTF-16 positions into the base
 * revision's `sourceText`. Each kind carries exactly the data needed to (a)
 * apply it and (b) let the engine derive its inverse from the base source.
 */
export type ComposerOperation =
	/** Replace the byte range `[from,to)` with `text`. The universal primitive. */
	| { kind: 'replaceRange'; from: number; to: number; text: string }
	/** Insert a brand-new block's `text` at offset `at` (a zero-width splice). */
	| { kind: 'insertBlock'; at: number; text: string; blockKind?: ComposerBlockKind }
	/** Remove a block occupying `[from,to)` (delete-to-empty splice). */
	| { kind: 'removeBlock'; from: number; to: number }
	/**
	 * Move the block occupying `[from,to)` so its text is re-inserted at
	 * `insertAt` (an offset OUTSIDE `[from,to)` in base coordinates).
	 */
	| { kind: 'moveBlock'; from: number; to: number; insertAt: number };

/** Compile one operation into its primitive text edits against `baseSource`. */
export function operationToEdits(op: ComposerOperation, baseSource: string): TextEdit[] {
	switch (op.kind) {
		case 'replaceRange':
			return [{ from: op.from, to: op.to, insert: op.text }];
		case 'insertBlock':
			return [{ from: op.at, to: op.at, insert: op.text }];
		case 'removeBlock':
			return [{ from: op.from, to: op.to, insert: '' }];
		case 'moveBlock': {
			if (op.insertAt > op.from && op.insertAt < op.to) {
				throw new Error(
					`moveBlock: insertAt ${op.insertAt} is inside the moved range [${op.from},${op.to})`,
				);
			}
			const moved = baseSource.slice(op.from, op.to);
			return [
				{ from: op.from, to: op.to, insert: '' },
				{ from: op.insertAt, to: op.insertAt, insert: moved },
			];
		}
	}
}

/** Flatten all operations of a transaction into one edit list (base coords). */
export function operationsToEdits(
	operations: readonly ComposerOperation[],
	baseSource: string,
): TextEdit[] {
	const edits: TextEdit[] = [];
	for (const op of operations) edits.push(...operationToEdits(op, baseSource));
	return edits;
}

/** True when two edits touch overlapping interior bytes (a zero-width insert never overlaps). */
function editsOverlap(a: TextEdit, b: TextEdit): boolean {
	// Zero-width inserts (from === to) only conflict when they sit at the same point.
	if (a.from === a.to && b.from === b.to) return a.from === b.from;
	return a.from < b.to && b.from < a.to;
}

/**
 * Apply a set of edits (in the SAME coordinate space) atomically. Edits are
 * validated for overlap (any collision throws — the transaction is refused
 * whole) and applied in descending `from` order so earlier offsets stay valid.
 */
export function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
	for (const e of edits) {
		if (e.from < 0 || e.to < e.from || e.to > source.length) {
			throw new Error(`text edit out of bounds: [${e.from},${e.to}) on length ${source.length}`);
		}
	}
	const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);
	for (let i = 1; i < sorted.length; i++) {
		if (editsOverlap(sorted[i - 1], sorted[i])) {
			throw new Error('overlapping edits in a single transaction are not allowed');
		}
	}
	let out = source;
	for (const e of sorted) {
		out = out.slice(0, e.from) + e.insert + out.slice(e.to);
	}
	return out;
}

/** Apply a transaction's operations to the base source atomically. */
export function applyOperations(baseSource: string, operations: readonly ComposerOperation[]): string {
	return applyTextEdits(baseSource, operationsToEdits(operations, baseSource));
}

/**
 * Derive the inverse of a transaction as `replaceRange` operations expressed in
 * the RESULT coordinate space (the source produced by applying `operations`).
 * Applying the returned operations to the result reproduces `baseSource`.
 */
export function deriveInverseOperations(
	baseSource: string,
	operations: readonly ComposerOperation[],
): ComposerOperation[] {
	const edits = operationsToEdits(operations, baseSource);
	// Validate (overlap / bounds) up-front so a bad set never yields a bogus inverse.
	applyTextEdits(baseSource, edits);
	const ascending = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
	const inverse: ComposerOperation[] = [];
	let delta = 0;
	for (const e of ascending) {
		const resultStart = e.from + delta;
		const resultEnd = resultStart + e.insert.length;
		const removedText = baseSource.slice(e.from, e.to);
		inverse.push({ kind: 'replaceRange', from: resultStart, to: resultEnd, text: removedText });
		delta += e.insert.length - (e.to - e.from);
	}
	return inverse;
}

/** Coarse +/- character stats for a transaction (History item summary). */
export interface OperationStats {
	added: number;
	removed: number;
}

export function computeOperationStats(
	baseSource: string,
	operations: readonly ComposerOperation[],
): OperationStats {
	const edits = operationsToEdits(operations, baseSource);
	let added = 0;
	let removed = 0;
	for (const e of edits) {
		added += e.insert.length;
		removed += e.to - e.from;
	}
	return { added, removed };
}
