/**
 * Peak Composer — table/chart block operation builders (WP6).
 *
 * Turn table-model edits and chart generation into engine-safe operation sets,
 * following the WP4 separator contract (`blockOps.ts`): a block's source range
 * excludes the inter-block gap, so an in-place source replacement is a single
 * `replaceRange` over `[from,to)` (block count unchanged), while a chart
 * insertion carries an explicit `\n\n` separator so reparse keeps the block
 * count guard happy.
 */

import type {
	ComposerBlockKind,
	ComposerDocumentSnapshot,
	ComposerOperation,
	ComposerTarget,
} from '@/core/composer';

export interface BuiltBlockOps {
	operations: ComposerOperation[];
	target?: ComposerTarget;
	expectedBlockDelta?: number;
}

/**
 * Replace a block's verbatim source with `nextSource` (a re-serialized table, a
 * switched-type chart, etc.). One atomic `replaceRange` over the block span; the
 * inter-block separator in the gap is untouched, so block count stays stable.
 */
export function buildReplaceBlockSourceOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	nextSource: string,
): BuiltBlockOps | null {
	const block = snapshot.blocks.find((b) => b.blockId === blockId);
	if (!block) return null;
	const current = snapshot.sourceText.slice(block.source.from, block.source.to);
	if (current === nextSource) return null;
	return {
		operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: nextSource }],
		target: { kind: 'block', blockId },
		expectedBlockDelta: 0,
	};
}

/**
 * Insert a fenced block (e.g. a generated ```chart) immediately below `blockId`.
 * Mirrors `buildInsertBelowOps` separator handling so the new block never fuses
 * with its neighbours on reparse.
 */
export function buildInsertBlockBelowOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	source: string,
	blockKind: ComposerBlockKind = 'code',
): BuiltBlockOps | null {
	if (!source.trim()) return null;
	const { blocks, sourceText } = snapshot;
	const i = blocks.findIndex((b) => b.blockId === blockId);
	if (i < 0) return null;
	const isLast = i === blocks.length - 1;
	if (isLast) {
		const at = sourceText.length;
		const lead = sourceText.endsWith('\n') ? '\n' : '\n\n';
		return {
			operations: [{ kind: 'insertBlock', at, text: lead + source + '\n', blockKind }],
			target: { kind: 'block', blockId },
			expectedBlockDelta: 1,
		};
	}
	const at = blocks[i + 1].source.from;
	return {
		operations: [{ kind: 'insertBlock', at, text: source + '\n\n', blockKind }],
		target: { kind: 'block', blockId },
		expectedBlockDelta: 1,
	};
}
