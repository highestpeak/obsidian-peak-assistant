import * as React from 'react';
import {
	EMPTY_TABLE_SELECTION,
	arrowExtend,
	arrowMove,
	classifyTablePointer,
	clearSelection,
	clickCell,
	dragTo,
	shiftTo,
	toggleCell,
	type CellPos,
	type TableModel,
	type TableSelectionState,
} from '@/service/composer';

/** Padding gutter (px) that starts an object drag — mirrors the CSS cell padding. */
const CELL_PAD_X = 11;
const CELL_PAD_Y = 10;

interface CellHit {
	pos: CellPos;
	el: HTMLElement;
}

function cellFromPoint(doc: Document, x: number, y: number): CellHit | null {
	const el = doc.elementFromPoint(x, y);
	const cell = el?.closest<HTMLElement>('[data-cell-row]');
	if (!cell) return null;
	const row = Number(cell.dataset.cellRow);
	const col = Number(cell.dataset.cellCol);
	if (Number.isNaN(row) || Number.isNaN(col)) return null;
	return { pos: { row, col }, el: cell };
}

export interface TableObjectSelection {
	state: TableSelectionState;
	selecting: boolean;
	/** Pointer-down on a cell: returns 'text' when native text selection should run. */
	onCellPointerDown: (row: number, col: number, ev: React.PointerEvent<HTMLElement>) => 'text' | 'object';
	onKeyDown: (ev: React.KeyboardEvent<HTMLElement>) => void;
	clear: () => void;
	setState: React.Dispatch<React.SetStateAction<TableSelectionState>>;
}

/**
 * Object cell-range selection wired to the pure reducer (WP6, S5). A pointer-down
 * in the cell defaults to object selection so merge stays reachable; Option/Alt
 * on visible text preserves a native text-selection escape hatch. Drag listeners
 * are scoped to the leaf's OWNER document so a detached (popout) composer works.
 */
export function useTableObjectSelection(model: TableModel, tableRef: React.RefObject<HTMLElement>): TableObjectSelection {
	const [state, setState] = React.useState<TableSelectionState>(EMPTY_TABLE_SELECTION);
	const [selecting, setSelecting] = React.useState(false);

	const onCellPointerDown = (row: number, col: number, ev: React.PointerEvent<HTMLElement>): 'text' | 'object' => {
		const cell = ev.currentTarget;
		const rect = cell.getBoundingClientRect();
		const geometry = {
			x: ev.clientX - rect.left,
			y: ev.clientY - rect.top,
			width: rect.width,
			height: rect.height,
			padX: CELL_PAD_X,
			padY: CELL_PAD_Y,
		};
		const overGlyph = Boolean((ev.target as HTMLElement).closest('.pk-tcell-text'));
		const mode = classifyTablePointer({ geometry, overGlyph, preferTextSelection: ev.altKey });

		if (ev.metaKey || ev.ctrlKey) {
			ev.preventDefault();
			setState((s) => toggleCell(s, model, { row, col }));
			return 'object';
		}
		if (mode === 'text') return 'text';

		ev.preventDefault();
		setState((s) => (ev.shiftKey ? shiftTo(s, model, { row, col }) : clickCell(model, { row, col })));
		beginDrag();
		return 'object';
	};

	const beginDrag = () => {
		const doc = tableRef.current?.ownerDocument;
		if (!doc) return;
		setSelecting(true);
		const move = (pe: PointerEvent) => {
			const hit = cellFromPoint(doc, pe.clientX, pe.clientY);
			if (hit) setState((s) => dragTo(s, model, hit.pos));
		};
		const up = () => {
			doc.removeEventListener('pointermove', move);
			doc.removeEventListener('pointerup', up);
			setSelecting(false);
		};
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
	};

	const onKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
		const dir = ARROW_KEYS[ev.key];
		if (dir) {
			ev.preventDefault();
			setState((s) => (ev.shiftKey ? arrowExtend(s, model, dir) : arrowMove(s, model, dir)));
			return;
		}
		if (ev.key === 'Escape') {
			ev.preventDefault();
			setState(clearSelection());
		}
	};

	return { state, selecting, onCellPointerDown, onKeyDown, clear: () => setState(clearSelection()), setState };
}

const ARROW_KEYS: Record<string, 'up' | 'down' | 'left' | 'right' | undefined> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
};
