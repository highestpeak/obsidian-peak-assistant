/**
 * Peak Composer — semantic selection partition (WP4, §7.3).
 *
 * Given a source byte range `[from,to)` over a snapshot, split it into one
 * {@link ComposerSelectionUnit} per semantic inline unit it touches — the exact
 * structure the mark serializer and paste-URL guard consume. A list selection
 * becomes one unit per (leaf) list item; a table selection becomes one unit per
 * cell; prose/heading/quote/callout become a single text unit clamped to the
 * block. This is what guarantees formatting never wraps a `p`/`li`/`td` node:
 * the caller only ever gets per-unit inner ranges.
 *
 * Pure/framework-neutral: the UI resolves a DOM Range into `[from,to)` and calls
 * this; tests call it directly against a parsed snapshot.
 */

import type {
	ComposerBlock,
	ComposerDocumentSnapshot,
	ComposerSelection,
	ComposerSelectionUnit,
	ComposerSubBlockAnchor,
	SelectionScopeKind,
} from '@/core/composer';

const HEADING_MARKER_RE = /^#{1,6}\s+/;
/** List / task item marker (`- `, `* `, `1. `, `- [ ] `) — excluded from the editable content range. */
const LIST_MARKER_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

/** Partition a source range into a frozen selection snapshot. */
export function partitionSourceRange(
	snapshot: ComposerDocumentSnapshot,
	from: number,
	to: number,
): ComposerSelection {
	const lo = Math.min(from, to);
	const hi = Math.max(from, to);
	const units: ComposerSelectionUnit[] = [];

	for (const block of snapshot.blocks) {
		if (block.source.from >= hi || block.source.to <= lo) continue;
		const clampFrom = Math.max(lo, block.source.from);
		const clampTo = Math.min(hi, block.source.to);
		if (clampFrom >= clampTo) continue;
		collectBlockUnits(block, clampFrom, clampTo, snapshot.sourceText, units);
	}

	const text = units.map((u) => snapshot.sourceText.slice(u.from, u.to)).join('\n');
	return {
		sourceText: snapshot.sourceText,
		units,
		scope: classifyScope(units),
		text,
		collapsed: lo === hi || units.length === 0,
	};
}

function collectBlockUnits(
	block: ComposerBlock,
	from: number,
	to: number,
	source: string,
	out: ComposerSelectionUnit[],
): void {
	if (block.kind === 'list' || block.kind === 'task') {
		pushUnitAnchors(block, 'list-item', from, to, source, out);
		return;
	}
	if (block.kind === 'table') {
		pushUnitAnchors(block, 'table-cell', from, to, source, out);
		return;
	}
	if (block.kind === 'heading') {
		const marker = HEADING_MARKER_RE.exec(source.slice(block.source.from, block.source.to));
		const textStart = block.source.from + (marker ? marker[0].length : 0);
		out.push({
			blockId: block.blockId,
			blockKind: block.kind,
			unitKind: 'heading-text',
			from: Math.max(from, textStart),
			to,
		});
		return;
	}
	// paragraph / quote / callout / code / math / html / etc. → one text unit.
	out.push({
		blockId: block.blockId,
		blockKind: block.kind,
		unitKind: 'block-text',
		from,
		to,
	});
}

/** Push one selection unit per (leaf) sub-anchor of the given kind that intersects. */
function pushUnitAnchors(
	block: ComposerBlock,
	kind: ComposerSubBlockAnchor['unitKind'],
	from: number,
	to: number,
	source: string,
	out: ComposerSelectionUnit[],
): void {
	const anchors = block.units.filter((u) => u.unitKind === kind && u.from < to && u.to > from);
	const leaves = anchors.filter((u) => !anchors.some((v) => v !== u && v.from >= u.from && v.to <= u.to && (v.from > u.from || v.to < u.to)));
	const chosen = leaves.length > 0 ? leaves : anchors;
	for (const u of chosen) {
		// Trim structural delimiters out of the unit so formatting only ever wraps
		// the unit's text: a fully-selected list item must not swallow its `- `
		// bullet, and a table cell must not swallow the `|` grid pipes.
		const [contentFrom, contentTo] =
			kind === 'list-item'
				? [u.from + markerLength(source, u.from, u.to), u.to]
				: cellContentBounds(source, u.from, u.to);
		const unitFrom = Math.max(from, contentFrom);
		const unitTo = Math.min(to, contentTo);
		if (unitFrom >= unitTo) continue;
		out.push({
			blockId: block.blockId,
			blockKind: block.kind,
			unitId: u.unitId,
			unitKind: u.unitKind,
			from: unitFrom,
			to: unitTo,
		});
	}
}

function markerLength(source: string, from: number, to: number): number {
	const m = LIST_MARKER_RE.exec(source.slice(from, to));
	return m ? m[0].length : 0;
}

/**
 * Content start of a list/task item unit — the offset after the `- ` / `1. ` /
 * `- [ ] ` marker. The editable leaf for an item covers `[contentStart, to)`.
 */
export function listItemContentStart(source: string, unit: { from: number; to: number }): number {
	return unit.from + markerLength(source, unit.from, unit.to);
}

/** Heading text start — the offset after the `#…# ` marker. */
export function headingTextStart(source: string, block: { from: number; to: number }): number {
	const m = HEADING_MARKER_RE.exec(source.slice(block.from, block.to));
	return block.from + (m ? m[0].length : 0);
}

/**
 * mdast table-cell anchors include the surrounding `|` pipes and padding. Trim
 * them so a cell selection's range is the cell text only — never the grid.
 */
function cellContentBounds(source: string, from: number, to: number): [number, number] {
	const slice = source.slice(from, to);
	const lead = /^\s*\|?\s*/.exec(slice)?.[0].length ?? 0;
	const trail = /\s*\|?\s*$/.exec(slice)?.[0].length ?? 0;
	return [from + lead, Math.max(from + lead, to - trail)];
}

function classifyScope(units: readonly ComposerSelectionUnit[]): SelectionScopeKind {
	if (units.length <= 1) return 'single';
	const blockIds = new Set(units.map((u) => u.blockId));
	if (blockIds.size === 1) {
		const kind = units[0].unitKind;
		if (kind === 'table-cell') return 'cross-cell';
		if (kind === 'list-item') return 'cross-item';
		return 'cross-paragraph';
	}
	const allProse = units.every((u) => u.unitKind === 'block-text' || u.unitKind === 'heading-text');
	return allProse ? 'cross-paragraph' : 'cross-block';
}
