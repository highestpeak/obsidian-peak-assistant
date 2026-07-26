/**
 * Peak Composer — table dual-mode selection (WP6, CMP-TABLE-06, S5 contract).
 *
 * Pure reducer + gesture partition (no DOM):
 *   - gesture partition: glyph-drag → native text selection; padding/edge drag or
 *     non-glyph → object cell-range selection (object never disables text);
 *   - click / drag rectangle / vertical+horizontal range;
 *   - Shift extend; Cmd/Ctrl discontiguous toggle (add + remove);
 *   - arrow move / Shift+arrow extend; Esc clear;
 *   - merge-aware: a selection over a merged cell resolves to its anchor;
 *   - rectangle detection (gates merge) + ARIA description.
 */

import { pipeToModel, mergeRange } from '@/service/composer';
import {
	EMPTY_TABLE_SELECTION,
	arrowExtend,
	arrowMove,
	classifyTablePointer,
	clearSelection,
	clickCell,
	describeSelection,
	dragTo,
	isCellSelected,
	isSelectionEmpty,
	pointerInPadding,
	selectedCellKeys,
	selectionRectangle,
	shiftTo,
	toggleCell,
	type TableSelectionStrings,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const GRID = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |', '| 7 | 8 | 9 |'].join('\n');
const model = pipeToModel(GRID); // 4 rows x 3 cols

const STRINGS: TableSelectionStrings = {
	cellsSelected: '{count} cells selected',
	singleCell: 'Row {row}, column {col}',
	rangeCells: 'Rows {r0}–{r1}, columns {c0}–{c1}',
	none: 'No cells selected',
};

// ── gesture partition (S5) ──────────────────────────────────────────────────
{
	const geo = { x: 40, y: 12, width: 120, height: 32, padX: 8, padY: 6 };
	check('glyph drag in content → text selection', classifyTablePointer({ geometry: geo, overGlyph: true }) === 'text');
	check('padding/edge drag → object selection', classifyTablePointer({ geometry: { ...geo, x: 3 }, overGlyph: true }) === 'object');
	check('non-glyph content drag → object selection', classifyTablePointer({ geometry: geo, overGlyph: false }) === 'object');
	check('pointerInPadding left edge', pointerInPadding({ ...geo, x: 4 }));
	check('pointerInPadding center false', !pointerInPadding(geo));
}

// ── click + drag rectangle ──────────────────────────────────────────────────
{
	const s = clickCell(model, { row: 1, col: 1 });
	check('click selects one cell', selectedCellKeys(s, model).size === 1 && isCellSelected(s, model, 1, 1));
	const dragged = dragTo(s, model, { row: 3, col: 2 }); // 3x2 rectangle
	const keys = selectedCellKeys(dragged, model);
	check('drag selects rectangle', keys.size === 6 && isCellSelected(dragged, model, 3, 2) && isCellSelected(dragged, model, 1, 1));
	const rect = selectionRectangle(dragged, model);
	check('rectangle detected', rect !== null && rect.r0 === 1 && rect.c0 === 1 && rect.r1 === 3 && rect.c1 === 2);
	// vertical range
	const vrange = dragTo(clickCell(model, { row: 1, col: 0 }), model, { row: 3, col: 0 });
	check('vertical range 3x1', selectedCellKeys(vrange, model).size === 3);
	// horizontal range
	const hrange = dragTo(clickCell(model, { row: 0, col: 0 }), model, { row: 0, col: 2 });
	check('horizontal range 1x3', selectedCellKeys(hrange, model).size === 3);
}

// ── shift extend ────────────────────────────────────────────────────────────
{
	const s = clickCell(model, { row: 1, col: 1 });
	const extended = shiftTo(s, model, { row: 2, col: 2 });
	check('shift extends from anchor', selectedCellKeys(extended, model).size === 4 && isCellSelected(extended, model, 1, 1) && isCellSelected(extended, model, 2, 2));
}

// ── Cmd/Ctrl discontiguous toggle ──────────────────────────────────────────
{
	let s = clickCell(model, { row: 0, col: 0 });
	s = toggleCell(s, model, { row: 2, col: 2 });
	const keys = selectedCellKeys(s, model);
	check('cmd-click adds discontiguous cell', keys.size === 2 && isCellSelected(s, model, 0, 0) && isCellSelected(s, model, 2, 2));
	check('discontiguous is not a rectangle', selectionRectangle(s, model) === null);
	// remove one by toggling again
	s = toggleCell(s, model, { row: 0, col: 0 });
	check('cmd-click removes an already-selected cell', selectedCellKeys(s, model).size === 1 && isCellSelected(s, model, 2, 2) && !isCellSelected(s, model, 0, 0));
}

// ── arrow move / shift+arrow extend / esc ───────────────────────────────────
{
	const s = clickCell(model, { row: 1, col: 1 });
	const moved = arrowMove(s, model, 'down');
	check('arrow moves single-cell selection', selectedCellKeys(moved, model).size === 1 && isCellSelected(moved, model, 2, 1));
	const clampedTop = arrowMove(clickCell(model, { row: 0, col: 0 }), model, 'up');
	check('arrow clamps at top edge', isCellSelected(clampedTop, model, 0, 0));
	const ext = arrowExtend(clickCell(model, { row: 1, col: 1 }), model, 'right');
	check('shift+arrow extends focus', selectedCellKeys(ext, model).size === 2 && isCellSelected(ext, model, 1, 2));
	const cleared = clearSelection();
	check('esc clears selection', isSelectionEmpty(cleared, model) && cleared === EMPTY_TABLE_SELECTION);
}

// ── merge-aware selection ───────────────────────────────────────────────────
{
	const merged = mergeRange(model, { r0: 1, c0: 0, r1: 2, c1: 1 });
	if (merged.ok) {
		// clicking a covered position resolves to the merge anchor (1,0)
		const s = clickCell(merged.model, { row: 2, col: 1 });
		check('click on covered cell snaps to merge anchor', isCellSelected(s, merged.model, 1, 0) && selectedCellKeys(s, merged.model).size === 1);
	}
}

// ── ARIA description ────────────────────────────────────────────────────────
{
	check('aria: none', describeSelection(EMPTY_TABLE_SELECTION, model, STRINGS) === 'No cells selected');
	check('aria: single cell (1-based)', describeSelection(clickCell(model, { row: 0, col: 1 }), model, STRINGS) === 'Row 1, column 2');
	const rectSel = dragTo(clickCell(model, { row: 1, col: 0 }), model, { row: 2, col: 1 });
	check('aria: rectangle', describeSelection(rectSel, model, STRINGS) === 'Rows 2–3, columns 1–2');
	let disc = clickCell(model, { row: 0, col: 0 });
	disc = toggleCell(disc, model, { row: 3, col: 2 });
	check('aria: discontiguous count', describeSelection(disc, model, STRINGS) === '2 cells selected');
}

done('composer-table-selection');
