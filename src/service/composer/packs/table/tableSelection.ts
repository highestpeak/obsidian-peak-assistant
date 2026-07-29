/**
 * Peak Composer — table object-selection model (WP6, handoff §10.3, S5 contract).
 *
 * Pure, DOM-free selection reducer for the table OBJECT layer (as opposed to
 * native text selection). Two selection modes coexist per the locked S5 gesture
 * contract:
 *
 *  - **object selection** — a drag from a cell selects a rectangle by default,
 *    matching spreadsheet muscle memory. Shift extension, Cmd/Ctrl discontiguous
 *    toggle, arrow/Shift+arrow keyboard extension, and Esc clear are modeled here.
 *  - **text selection** — Option/Alt + drag from visible text preserves the native
 *    selection escape hatch without making merge depend on tiny cell padding.
 *
 * Object selection never disables cell text selection: the two are partitioned
 * by where the gesture starts, never by turning one off.
 *
 * Selection is stored as an in-progress rectangle (`active`, from the last
 * click/drag/shift anchor→focus) plus committed discontiguous rectangles
 * (`rects`, from Cmd/Ctrl gestures). The concrete selected-cell set is DERIVED
 * against the current {@link TableModel} so merged cells expand correctly.
 */

import { normalizeRange, resolveGrid, type TableModel, type TableRange } from './tableModel';

export interface CellPos {
	row: number;
	col: number;
}

export interface TableSelectionState {
	/** In-progress rectangle (click / drag / shift). */
	active: { anchor: CellPos; focus: CellPos } | null;
	/** Committed discontiguous rectangles (Cmd/Ctrl). */
	rects: TableRange[];
}

export const EMPTY_TABLE_SELECTION: TableSelectionState = { active: null, rects: [] };

const key = (r: number, c: number): string => `${r},${c}`;

/** Snap a logical position to its merge anchor (covered cells resolve to origin). */
function snapToAnchor(model: TableModel, pos: CellPos): CellPos {
	const { grid, rows, cols } = resolveGrid(model);
	if (pos.row < 0 || pos.col < 0 || pos.row >= rows || pos.col >= cols) return pos;
	const g = grid[pos.row][pos.col];
	if (!g) return pos;
	return { row: g.ar, col: g.ac };
}

function clampPos(model: TableModel, pos: CellPos): CellPos {
	const { rows, cols } = resolveGrid(model);
	return {
		row: Math.max(0, Math.min(rows - 1, pos.row)),
		col: Math.max(0, Math.min(cols - 1, pos.col)),
	};
}

/** Expand a rectangle to the full anchor-position set it covers (merge-aware). */
function rangeCells(model: TableModel, range: TableRange): CellPos[] {
	const { grid } = resolveGrid(model);
	const seen = new Set<string>();
	const out: CellPos[] = [];
	for (let r = range.r0; r <= range.r1; r++) {
		for (let c = range.c0; c <= range.c1; c++) {
			const g = grid[r]?.[c];
			if (!g) continue;
			const k = key(g.ar, g.ac);
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({ row: g.ar, col: g.ac });
		}
	}
	return out;
}

/** The resolved set of selected anchor cells as `"row,col"` keys. */
export function selectedCellKeys(state: TableSelectionState, model: TableModel): Set<string> {
	const keys = new Set<string>();
	for (const rect of state.rects) for (const p of rangeCells(model, rect)) keys.add(key(p.row, p.col));
	if (state.active) {
		const rect = normalizeRange(state.active.anchor, state.active.focus);
		for (const p of rangeCells(model, rect)) keys.add(key(p.row, p.col));
	}
	return keys;
}

export function isCellSelected(state: TableSelectionState, model: TableModel, row: number, col: number): boolean {
	const g = resolveGrid(model).grid[row]?.[col];
	if (!g) return false;
	return selectedCellKeys(state, model).has(key(g.ar, g.ac));
}

export function isSelectionEmpty(state: TableSelectionState, model: TableModel): boolean {
	return selectedCellKeys(state, model).size === 0;
}

/**
 * The single clean rectangle the selection forms, or null when the selection is
 * empty, discontiguous, or not a full rectangle. Merge enablement depends on it.
 */
export function selectionRectangle(state: TableSelectionState, model: TableModel): TableRange | null {
	const keys = selectedCellKeys(state, model);
	if (keys.size === 0) return null;
	let r0 = Infinity;
	let c0 = Infinity;
	let r1 = -Infinity;
	let c1 = -Infinity;
	for (const k of keys) {
		const [r, c] = k.split(',').map(Number);
		r0 = Math.min(r0, r);
		c0 = Math.min(c0, c);
		r1 = Math.max(r1, r);
		c1 = Math.max(c1, c);
	}
	const rect = { r0, c0, r1, c1 };
	// Full rectangle iff every covered anchor inside the bbox is selected.
	const expected = rangeCells(model, rect);
	if (expected.length !== keys.size) return null;
	for (const p of expected) if (!keys.has(key(p.row, p.col))) return null;
	return rect;
}

// ── Reducer actions ─────────────────────────────────────────────────────────────

export function clickCell(model: TableModel, pos: CellPos): TableSelectionState {
	const anchor = snapToAnchor(model, clampPos(model, pos));
	return { active: { anchor, focus: anchor }, rects: [] };
}

export function dragTo(state: TableSelectionState, model: TableModel, pos: CellPos): TableSelectionState {
	if (!state.active) return clickCell(model, pos);
	return { ...state, active: { anchor: state.active.anchor, focus: snapToAnchor(model, clampPos(model, pos)) } };
}

export function shiftTo(state: TableSelectionState, model: TableModel, pos: CellPos): TableSelectionState {
	if (!state.active) return clickCell(model, pos);
	return { ...state, active: { anchor: state.active.anchor, focus: snapToAnchor(model, clampPos(model, pos)) } };
}

/** Cmd/Ctrl toggle: add a discontiguous single cell, or remove it if selected. */
export function toggleCell(state: TableSelectionState, model: TableModel, pos: CellPos): TableSelectionState {
	const anchor = snapToAnchor(model, clampPos(model, pos));
	// Fold the in-progress rect into committed rects first.
	const rects = state.active
		? [...state.rects, normalizeRange(state.active.anchor, state.active.focus)]
		: [...state.rects];
	const already = selectedCellKeys({ active: null, rects }, model).has(key(anchor.row, anchor.col));
	if (already) {
		// Removing a discontiguous cell: rebuild rects as single-cell rects minus this one.
		const keys = selectedCellKeys({ active: null, rects }, model);
		keys.delete(key(anchor.row, anchor.col));
		const rebuilt: TableRange[] = [];
		for (const k of keys) {
			const [r, c] = k.split(',').map(Number);
			rebuilt.push({ r0: r, c0: c, r1: r, c1: c });
		}
		return { active: null, rects: rebuilt };
	}
	return { active: { anchor, focus: anchor }, rects };
}

const ARROW: Record<'up' | 'down' | 'left' | 'right', CellPos> = {
	up: { row: -1, col: 0 },
	down: { row: 1, col: 0 },
	left: { row: 0, col: -1 },
	right: { row: 0, col: 1 },
};

/** Move the single-cell selection by one (collapses any multi-cell selection). */
export function arrowMove(
	state: TableSelectionState,
	model: TableModel,
	dir: 'up' | 'down' | 'left' | 'right',
): TableSelectionState {
	const from = state.active?.focus ?? { row: 0, col: 0 };
	const d = ARROW[dir];
	const next = snapToAnchor(model, clampPos(model, { row: from.row + d.row, col: from.col + d.col }));
	return { active: { anchor: next, focus: next }, rects: [] };
}

/** Extend the active rectangle's focus by one (Shift+arrow). */
export function arrowExtend(
	state: TableSelectionState,
	model: TableModel,
	dir: 'up' | 'down' | 'left' | 'right',
): TableSelectionState {
	if (!state.active) return arrowMove(state, model, dir);
	const d = ARROW[dir];
	const focus = snapToAnchor(
		model,
		clampPos(model, { row: state.active.focus.row + d.row, col: state.active.focus.col + d.col }),
	);
	return { ...state, active: { anchor: state.active.anchor, focus } };
}

export function clearSelection(): TableSelectionState {
	return EMPTY_TABLE_SELECTION;
}

// ── ARIA description ────────────────────────────────────────────────────────────

export interface TableSelectionStrings {
	/** e.g. "{count} cells selected". `{count}` substituted. */
	cellsSelected: string;
	/** e.g. "Row {row}, column {col}". `{row}`/`{col}` substituted (1-based). */
	singleCell: string;
	/** e.g. "Rows {r0}–{r1}, columns {c0}–{c1}". */
	rangeCells: string;
	/** e.g. "No cells selected". */
	none: string;
}

/** Human/AT description of the current selection (§10.3 ARIA requirement). */
export function describeSelection(
	state: TableSelectionState,
	model: TableModel,
	strings: TableSelectionStrings,
): string {
	const keys = selectedCellKeys(state, model);
	if (keys.size === 0) return strings.none;
	if (keys.size === 1) {
		const [r, c] = [...keys][0].split(',').map(Number);
		return strings.singleCell.replace('{row}', String(r + 1)).replace('{col}', String(c + 1));
	}
	const rect = selectionRectangle(state, model);
	if (rect) {
		return strings.rangeCells
			.replace('{r0}', String(rect.r0 + 1))
			.replace('{r1}', String(rect.r1 + 1))
			.replace('{c0}', String(rect.c0 + 1))
			.replace('{c1}', String(rect.c1 + 1));
	}
	return strings.cellsSelected.replace('{count}', String(keys.size));
}

// ── Gesture partition (S5 locked contract) ──────────────────────────────────────

export interface CellGeometry {
	/** Pointer offset inside the cell box (px from the cell's top-left). */
	x: number;
	y: number;
	width: number;
	height: number;
	/** Padding gutter width/height that starts an object drag. */
	padX: number;
	padY: number;
}

/** True when the pointer is inside the cell's padding/edge gutter (object zone). */
export function pointerInPadding(g: CellGeometry): boolean {
	return g.x < g.padX || g.x > g.width - g.padX || g.y < g.padY || g.y > g.height - g.padY;
}

/**
 * Route a pointer-down inside a table cell (S5): table cells default to OBJECT
 * selection so merge/sort/structure operations are reachable from the same drag
 * users naturally perform in a spreadsheet. Native TEXT selection remains an
 * explicit escape hatch for visible glyphs.
 */
export function classifyTablePointer(input: { geometry: CellGeometry; overGlyph: boolean; preferTextSelection?: boolean }): 'text' | 'object' {
	if (input.preferTextSelection && input.overGlyph && !pointerInPadding(input.geometry)) return 'text';
	return 'object';
}
