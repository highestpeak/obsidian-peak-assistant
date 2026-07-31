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
import { countDraftBlocks } from './newBlockDraft';
import { listItemContentStart } from './selection/partitionSelection';

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
 * Insert arbitrary Markdown below `blockId`. Markdown is the source of truth:
 * block kinds and block count are derived by the parser, never from a hidden UI
 * selection. A literally-empty Markdown block is unrepresentable.
 */
export function buildInsertBelowOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	text: string,
): BuiltOps | null {
	if (!text.trim()) return null;
	const expectedBlockDelta = countDraftBlocks(text);
	if (expectedBlockDelta < 1) return null;
	const { blocks, sourceText } = snapshot;
	const i = blocks.findIndex((b) => b.blockId === blockId);
	if (i < 0) return null;
	const isLast = i === blocks.length - 1;
	if (isLast) {
		const at = sourceText.length;
		const lead = sourceText.endsWith('\n') ? '\n' : '\n\n';
		return {
			operations: [{ kind: 'insertBlock', at, text: lead + text + '\n' }],
			target: { kind: 'block', blockId },
			expectedBlockDelta,
		};
	}
	const at = blocks[i + 1].source.from;
	return {
		operations: [{ kind: 'insertBlock', at, text: text + '\n\n' }],
		target: { kind: 'block', blockId },
		expectedBlockDelta,
	};
}

export type DirectListItemKind = 'list' | 'task';

export interface BuiltListIndentOps extends BuiltOps {
	/** A valid list item owns Tab even when the first item cannot indent. */
	handled: true;
}

/**
 * Indent/outdent one persisted list item by changing only its source prefix.
 *
 * The editable leaf intentionally excludes the list marker, so Tab is routed
 * to this structure owner after pending text is flushed. A first sibling cannot
 * indent, but still handles the key so focus never escapes Composer.
 */
export function buildIndentListItemOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	unitId: string,
	outdent = false,
): BuiltListIndentOps | null {
	const block = snapshot.blocks.find((candidate) => candidate.blockId === blockId);
	if (!block || (block.kind !== 'list' && block.kind !== 'task')) return null;
	const items = block.units.filter((unit) => unit.unitKind === 'list-item');
	const item = items.find((unit) => unit.unitId === unitId);
	if (!item) return null;
	const lineStart = snapshot.sourceText.lastIndexOf('\n', Math.max(0, item.from - 1)) + 1;
	const line = snapshot.sourceText.slice(lineStart, item.to);
	if (outdent) {
		const remove = removableListIndent(line);
		if (remove === 0) return { handled: true, operations: [] };
		return {
			handled: true,
			operations: [{
				kind: 'replaceRange',
				from: lineStart,
				to: lineStart + remove,
				text: '',
			}],
			target: { kind: 'unit', blockId, unitId },
			expectedBlockDelta: 0,
		};
	}
	const siblings = items.filter((candidate) => candidate.parentUnitId === item.parentUnitId);
	if (siblings.findIndex((candidate) => candidate.unitId === unitId) <= 0) {
		return { handled: true, operations: [] };
	}
	return {
		handled: true,
		operations: [{
			kind: 'replaceRange',
			from: lineStart,
			to: lineStart,
			text: '\t',
		}],
		target: { kind: 'unit', blockId, unitId },
		expectedBlockDelta: 0,
	};
}

function removableListIndent(line: string): number {
	if (line.startsWith('\t')) return 1;
	let spaces = 0;
	while (spaces < line.length && spaces < 4 && line[spaces] === ' ') spaces += 1;
	return spaces;
}

/**
 * Insert one empty top-level list item at an explicit visual gap.
 *
 * The item inherits indentation and ordered/unordered marker style from the
 * neighboring source item. Only the checkbox marker is controlled by `kind`.
 * The transaction keeps the surrounding list as one parsed block, so History,
 * Undo and the reparse guard remain unchanged.
 */
export function buildInsertListItemOps(
	snapshot: ComposerDocumentSnapshot,
	blockId: string,
	insertionIndex: number,
	kind: DirectListItemKind,
): BuiltOps | null {
	const block = snapshot.blocks.find((candidate) => candidate.blockId === blockId);
	if (!block || (block.kind !== 'list' && block.kind !== 'task')) return null;
	const items = block.units.filter(
		(unit) => unit.unitKind === 'list-item' && !unit.parentUnitId,
	);
	if (!Number.isInteger(insertionIndex) || insertionIndex < 0 || insertionIndex > items.length) {
		return null;
	}
	const next = items[insertionIndex];
	const previous = items[insertionIndex - 1];
	const reference = next ?? previous ?? items[0];
	const marker = directListMarker(snapshot.sourceText, block.renderModel.ordered, reference, kind);
	const newline = snapshot.sourceText.includes('\r\n') ? '\r\n' : '\n';
	if (next) {
		return {
			operations: [{
				kind: 'replaceRange',
				from: next.from,
				to: next.from,
				text: `${marker}${newline}`,
			}],
			target: { kind: 'block', blockId },
			expectedBlockDelta: 0,
		};
	}
	const lead = snapshot.sourceText.slice(block.source.from, block.source.to).endsWith(newline)
		? ''
		: newline;
	return {
		operations: [{
			kind: 'replaceRange',
			from: block.source.to,
			to: block.source.to,
			text: `${lead}${marker}`,
		}],
		target: { kind: 'block', blockId },
		expectedBlockDelta: 0,
	};
}

function directListMarker(
	source: string,
	ordered: boolean | undefined,
	reference: { from: number; to: number } | undefined,
	kind: DirectListItemKind,
): string {
	const rawMarker = reference
		? source.slice(reference.from, listItemContentStart(source, reference))
		: '';
	const match = /^(\s*)([-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.exec(rawMarker);
	const indent = match?.[1] ?? '';
	const token = match?.[2] ?? (ordered ? '1.' : '-');
	return kind === 'task'
		? `${indent}${token} [ ] `
		: `${indent}${token} `;
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
