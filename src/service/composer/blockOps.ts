/**
 * Peak Composer — structural block operation builders (WP4).
 *
 * Builders that turn chrome gestures (drag-reorder, insert-below) into safe
 * operation sets for the transaction engine. The tricky part is the inter-block
 * separator contract (WP1 §SourceAnchor): block ranges exclude the blank-line
 * gap between blocks, so a naïve `moveBlock` of just the block bytes would land
 * flush against its new neighbour and fuse on reparse (rejected by the engine's
 * block-count guard). These builders move/insert the block WITH an explicit
 * separator so the reparse-assert holds.
 */

import type { ComposerDocumentSnapshot, ComposerOperation, ComposerTarget } from '@/core/composer';

export interface BuiltOps {
	operations: ComposerOperation[];
	target?: ComposerTarget;
	expectedBlockDelta?: number;
}

/**
 * Move `blockId` so it lands before the block currently at `dropIndex`
 * (`dropIndex === blocks.length` ⇒ end of document). Returns null for a no-op
 * drop (same position). Uses a remove+insert `replaceRange` pair — the moved
 * bytes travel with an explicit `\n\n` separator, so block count stays stable.
 */
export function buildMoveBlockOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	dropIndex: number,
): BuiltOps | null {
	const { blocks, sourceText } = snapshot;
	const i = blocks.findIndex((b) => b.blockId === blockId);
	if (i < 0) return null;
	if (dropIndex === i || dropIndex === i + 1) return null;
	const block = blocks[i];
	const raw = sourceText.slice(block.source.from, block.source.to);

	// Remove the block plus ONE adjacent gap (trailing when it has a follower,
	// leading when it is the last block) so the old location closes up cleanly.
	const removeFrom = i < blocks.length - 1 ? block.source.from : blocks[i - 1]?.source.to ?? 0;
	const removeTo = i < blocks.length - 1 ? blocks[i + 1].source.from : block.source.to;

	let insertAt: number;
	let insertText: string;
	if (dropIndex >= blocks.length) {
		insertAt = sourceText.length;
		insertText = (sourceText.endsWith('\n') ? '\n' : '\n\n') + raw + '\n';
	} else {
		insertAt = blocks[dropIndex].source.from;
		insertText = raw + '\n\n';
	}
	// The insert point must not sit inside the removed range.
	if (insertAt > removeFrom && insertAt < removeTo) return null;

	return {
		operations: [
			{ kind: 'replaceRange', from: removeFrom, to: removeTo, text: '' },
			{ kind: 'replaceRange', from: insertAt, to: insertAt, text: insertText },
		],
		target: { kind: 'block', blockId },
		expectedBlockDelta: 0,
	};
}

/**
 * Insert a new paragraph with `text` below `blockId`. The chrome's 在下方插入
 * uses an ephemeral draft leaf and commits through this builder on the first
 * flush — a literally-empty paragraph is unrepresentable in Markdown (it would
 * fail the engine's +1 block-count guard), so the transaction carries the
 * draft's first real content.
 */
export function buildInsertBelowOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	text: string,
): BuiltOps | null {
	if (!text.trim()) return null;
	const { blocks, sourceText } = snapshot;
	const i = blocks.findIndex((b) => b.blockId === blockId);
	if (i < 0) return null;
	const isLast = i === blocks.length - 1;
	if (isLast) {
		const at = sourceText.length;
		const lead = sourceText.endsWith('\n') ? '\n' : '\n\n';
		return {
			operations: [{ kind: 'insertBlock', at, text: lead + text + '\n', blockKind: 'paragraph' }],
			target: { kind: 'block', blockId },
			expectedBlockDelta: 1,
		};
	}
	const at = blocks[i + 1].source.from;
	return {
		operations: [{ kind: 'insertBlock', at, text: text + '\n\n', blockKind: 'paragraph' }],
		target: { kind: 'block', blockId },
		expectedBlockDelta: 1,
	};
}

/** Toggle a task item's checkbox: flips the `[ ]` / `[x]` at the item's marker. */
export function buildToggleTaskOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	unitId: string,
): BuiltOps | null {
	const block = snapshot.blocks.find((b) => b.blockId === blockId);
	const unit = block?.units.find((u) => u.unitId === unitId);
	if (!block || !unit) return null;
	const slice = snapshot.sourceText.slice(unit.from, unit.to);
	const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(slice);
	if (!m) return null;
	const at = unit.from + m[1].length;
	const next = m[2] === ' ' ? 'x' : ' ';
	return {
		operations: [{ kind: 'replaceRange', from: at, to: at + 1, text: next }],
		target: { kind: 'unit', blockId, unitId },
		expectedBlockDelta: 0,
	};
}
