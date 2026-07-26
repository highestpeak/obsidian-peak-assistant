/**
 * Peak Composer — typed TableModel (WP6, handoff §10.3–10.5).
 *
 * Production form of the S3 feasibility spike (`.dev/spikes/composer/s3-table/`),
 * rewritten clean. Design invariants that must not drift:
 *
 *  - **Anchor-only storage.** Rows store ONLY anchor cells (a merged cell keeps
 *    its `colspan`/`rowspan`); every covered `(row,col)` position is DERIVED by
 *    {@link resolveGrid}. Covered positions are never stored redundantly — the
 *    grid is the single source of truth for occupancy.
 *  - **Logical (unescaped) text.** `cell.text` holds a real pipe char as `"|"`;
 *    each serializer re-escapes for its own syntax. Round-trip is byte-exact for
 *    canonical GFM (align colons, `\|` escape, inline markdown preserved).
 *  - **One-way upgrade.** A model with merges cannot be pipe Markdown; the moment
 *    a merge exists the block upgrades to raw HTML. {@link canDowngradeToPipe}
 *    gates the reverse.
 *  - **Merge-aware guards.** Every deterministic op returns `{ok:false, reason}`
 *    (never throws) when a merge makes it unsafe; the reason string is the exact
 *    copy the toolbar renders as its disabled explanation (§10.4).
 *
 * HTML (de)serialization lives in `./htmlPort` so this file has no parse5 /
 * DOMParser dependency — it is pure logic, importable from tests and the UI.
 */

export type TableAlign = 'none' | 'left' | 'right' | 'center';

export interface TableCell {
	text: string;
	colspan: number;
	rowspan: number;
	/** Per-cell alignment override (rare; only HTML tables express it). */
	align?: TableAlign;
}

export interface TableRow {
	cells: TableCell[];
	isHeader: boolean;
}

export interface TableColumn {
	align: TableAlign;
}

export interface TableModel {
	columns: TableColumn[];
	rows: TableRow[];
}

/** Result of a deterministic op: success carries the next model, failure a reason. */
export type TableOpResult =
	| { ok: true; model: TableModel }
	| { ok: false; reason: string };

export function makeCell(text = '', colspan = 1, rowspan = 1, align?: TableAlign): TableCell {
	return { text, colspan, rowspan, ...(align ? { align } : {}) };
}

// ── Grid resolution ───────────────────────────────────────────────────────────

/** Logical column count = sum of the first row's anchor colspans. */
export function colCount(model: TableModel): number {
	if (model.rows.length === 0) return 0;
	return model.rows[0].cells.reduce((n, c) => n + c.colspan, 0);
}

export interface GridPosition {
	cell: TableCell;
	/** True at the merged cell's top-left origin, false at covered positions. */
	anchor: boolean;
	/** Anchor row/col this position resolves to. */
	ar: number;
	ac: number;
}

export interface ResolvedGrid {
	grid: (GridPosition | null)[][];
	cols: number;
	rows: number;
}

/** Build the occupancy grid mapping every `(r,c)` to its anchor cell. */
export function resolveGrid(model: TableModel): ResolvedGrid {
	const cols = colCount(model);
	const rows = model.rows.length;
	const grid: (GridPosition | null)[][] = Array.from({ length: rows }, () =>
		new Array<GridPosition | null>(cols).fill(null),
	);
	for (let r = 0; r < rows; r++) {
		let c = 0;
		for (const cell of model.rows[r].cells) {
			while (c < cols && grid[r][c] !== null) c++;
			if (c >= cols) throw new Error(`table row ${r} overflow while placing a cell`);
			const ac = c;
			for (let dr = 0; dr < cell.rowspan; dr++) {
				for (let dc = 0; dc < cell.colspan; dc++) {
					grid[r + dr][c + dc] = { cell, anchor: dr === 0 && dc === 0, ar: r, ac };
				}
			}
			c += cell.colspan;
		}
	}
	return { grid, cols, rows };
}

export function hasMerges(model: TableModel): boolean {
	return model.rows.some((row) => row.cells.some((c) => c.colspan > 1 || c.rowspan > 1));
}

// ── Pipe Markdown ⇄ model ──────────────────────────────────────────────────────

const ALIGN_DELIM: Record<TableAlign, string> = { none: '---', left: ':--', right: '--:', center: ':-:' };
const escPipeIn = (s: string): string => s.replace(/\|/g, '\\|');
const escPipeOut = (s: string): string => s.replace(/\\\|/g, '|');

/** Split a pipe row into raw cell strings, honoring backslash-escaped pipes. */
export function splitPipeRow(line: string): string[] {
	let s = line.trim();
	if (s.startsWith('|')) s = s.slice(1);
	if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
	const out: string[] = [];
	let cur = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '\\' && s[i + 1] === '|') {
			cur += '\\|';
			i++;
			continue;
		}
		if (ch === '|') {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out;
}

function parseAlign(token: string): TableAlign {
	const t = token.trim();
	const l = t.startsWith(':');
	const r = t.endsWith(':');
	if (l && r) return 'center';
	if (r) return 'right';
	if (l) return 'left';
	return 'none';
}

/** True when `md` looks like a GFM pipe table (header + `---` delimiter row). */
export function looksLikePipeTable(md: string): boolean {
	const lines = md.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length < 2) return false;
	return /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]) && lines[1].includes('-');
}

export function pipeToModel(md: string): TableModel {
	const lines = md.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length < 2) throw new Error('pipe table needs a header + delimiter row');
	const headerCells = splitPipeRow(lines[0]);
	const aligns = splitPipeRow(lines[1]).map(parseAlign);
	const columns: TableColumn[] = aligns.map((align) => ({ align }));
	const mkRow = (cells: string[], isHeader: boolean): TableRow => ({
		isHeader,
		cells: cells.map((raw) => makeCell(escPipeOut(raw.trim()))),
	});
	const rows: TableRow[] = [mkRow(headerCells, true)];
	for (let i = 2; i < lines.length; i++) rows.push(mkRow(splitPipeRow(lines[i]), false));
	return { columns, rows };
}

/** Canonical pipe serialization: leading+trailing pipes, single-space padding. */
export function modelToPipe(model: TableModel): string {
	if (hasMerges(model)) {
		throw new Error('modelToPipe: model has merged cells — upgrade to HTML instead');
	}
	const row = (cells: TableCell[]): string => '| ' + cells.map((c) => escPipeIn(c.text)).join(' | ') + ' |';
	const delim = '| ' + model.columns.map((c) => ALIGN_DELIM[c.align]).join(' | ') + ' |';
	const out = [row(model.rows[0].cells), delim];
	for (let i = 1; i < model.rows.length; i++) out.push(row(model.rows[i].cells));
	return out.join('\n');
}

// ── Safe downgrade predicate (model → pipe) ────────────────────────────────────

export type DowngradeVerdict = { downgradable: true } | { downgradable: false; reason: string };

/**
 * A model is pipe-representable iff: no merges, exactly one leading header row,
 * and no per-cell align conflicts with its column align (pipe only has per-column
 * alignment).
 */
export function canDowngradeToPipe(model: TableModel): DowngradeVerdict {
	if (hasMerges(model)) {
		return { downgradable: false, reason: 'merged cells cannot be expressed in pipe Markdown' };
	}
	const headerRows = model.rows.filter((r) => r.isHeader).length;
	if (headerRows !== 1) {
		return { downgradable: false, reason: `pipe supports exactly one header row (found ${headerRows})` };
	}
	if (!model.rows[0].isHeader) {
		return { downgradable: false, reason: 'the header row must come first' };
	}
	const { grid, cols, rows } = resolveGrid(model);
	for (let c = 0; c < cols; c++) {
		const colAlign = model.columns[c].align;
		for (let r = 0; r < rows; r++) {
			const cellAlign = grid[r][c]?.cell.align;
			if (cellAlign && cellAlign !== colAlign) {
				return {
					downgradable: false,
					reason: `cell (${r},${c}) alignment "${cellAlign}" conflicts with column alignment "${colAlign}"`,
				};
			}
		}
	}
	return { downgradable: true };
}

/**
 * Serialize to the narrowest lossless syntax: pipe Markdown when possible, else
 * raw HTML. This is the one place block writeback decides the on-disk form.
 */
export function serializeTable(model: TableModel, toHtml: (m: TableModel) => string): string {
	return canDowngradeToPipe(model).downgradable ? modelToPipe(model) : toHtml(model);
}

// ── Merge / unmerge (one-way upgrade to HTML) ──────────────────────────────────

export interface TableRange {
	r0: number;
	c0: number;
	r1: number;
	c1: number;
}

/** Normalize a possibly-inverted range to top-left → bottom-right. */
export function normalizeRange(a: { row: number; col: number }, b: { row: number; col: number }): TableRange {
	return {
		r0: Math.min(a.row, b.row),
		c0: Math.min(a.col, b.col),
		r1: Math.max(a.row, b.row),
		c1: Math.max(a.col, b.col),
	};
}

/**
 * Merge a rectangular selection into its top-left anchor. The rectangle must sit
 * inside one section (all header rows or all body rows) and cover only span-1
 * anchors (no partial overlap with an existing merge).
 */
export function mergeRange(model: TableModel, range: TableRange): TableOpResult {
	const { r0, c0, r1, c1 } = range;
	if (r0 > r1 || c0 > c1) return { ok: false, reason: 'empty selection' };
	if (r0 === r1 && c0 === c1) return { ok: false, reason: 'select at least two cells to merge' };
	const { grid, rows, cols } = resolveGrid(model);
	if (r1 >= rows || c1 >= cols) return { ok: false, reason: 'selection is out of bounds' };
	const sec = model.rows[r0].isHeader;
	for (let r = r0; r <= r1; r++) {
		if (model.rows[r].isHeader !== sec) {
			return { ok: false, reason: 'selection crosses the header/body boundary' };
		}
	}
	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			const g = grid[r][c];
			if (!g || !g.anchor || g.cell.colspan !== 1 || g.cell.rowspan !== 1) {
				return { ok: false, reason: `cell (${r},${c}) is already part of a merge — select a clean rectangle` };
			}
		}
	}
	const next = clone(model);
	for (let r = r0; r <= r1; r++) {
		const kept: TableCell[] = [];
		let c = 0;
		for (const cell of next.rows[r].cells) {
			const cellCol = c;
			const origSpan = cell.colspan;
			const within = cellCol >= c0 && cellCol <= c1;
			const isAnchorTL = r === r0 && cellCol === c0;
			if (isAnchorTL) {
				cell.colspan = c1 - c0 + 1;
				cell.rowspan = r1 - r0 + 1;
				kept.push(cell);
			} else if (!within) {
				kept.push(cell);
			}
			c += origSpan;
		}
		next.rows[r].cells = kept;
	}
	return { ok: true, model: next };
}

/** Expand the merged anchor at `(r0,c0)` back into span-1 cells (freed → empty). */
export function unmergeAt(model: TableModel, r0: number, c0: number): TableOpResult {
	const g = resolveGrid(model).grid[r0]?.[c0];
	if (!g || !g.anchor) return { ok: false, reason: 'select a merged cell to unmerge' };
	if (g.cell.colspan === 1 && g.cell.rowspan === 1) return { ok: false, reason: 'this cell is not merged' };
	return { ok: true, model: expandAndRefill(model, r0, c0) };
}

function expandAndRefill(model: TableModel, r0: number, c0: number): TableModel {
	const { grid, cols } = resolveGrid(model);
	const anchor = grid[r0][c0]!.cell;
	const rspan = anchor.rowspan;
	const cspan = anchor.colspan;
	const next = clone(model);
	for (let r = r0; r < r0 + rspan; r++) {
		const newCells: { cell: TableCell; c: number }[] = [];
		for (let c = 0; c < cols; c++) {
			const gp = grid[r][c];
			if (gp && gp.anchor) {
				const cell = clone(gp.cell);
				if (gp.ar === r0 && gp.ac === c0) {
					cell.colspan = 1;
					cell.rowspan = 1;
				}
				newCells.push({ cell, c });
			} else if (r >= r0 && r < r0 + rspan && c >= c0 && c < c0 + cspan) {
				newCells.push({ cell: makeCell(''), c });
			}
		}
		next.rows[r].cells = newCells.sort((a, b) => a.c - b.c).map((x) => x.cell);
	}
	return next;
}

// ── Deterministic operations ───────────────────────────────────────────────────

function guardNoMergeCrossingRow(model: TableModel, atRow: number): boolean {
	const { grid, cols } = resolveGrid(model);
	for (let c = 0; c < cols; c++) {
		const above = atRow > 0 ? grid[atRow - 1][c] : null;
		const at = atRow < grid.length ? grid[atRow][c] : null;
		if (above && at && above.ar === at.ar && above.ac === at.ac) return true;
	}
	return false;
}

export function addRow(model: TableModel, index: number): TableOpResult {
	if (index < 0 || index > model.rows.length) return { ok: false, reason: 'row index out of range' };
	if (guardNoMergeCrossingRow(model, index)) {
		return { ok: false, reason: 'this position splits a vertical merge' };
	}
	const cols = colCount(model);
	const next = clone(model);
	next.rows.splice(index, 0, {
		isHeader: false,
		cells: Array.from({ length: cols }, () => makeCell('')),
	});
	return { ok: true, model: next };
}

export function removeRow(model: TableModel, index: number): TableOpResult {
	if (index <= 0) return { ok: false, reason: 'the header row cannot be removed' };
	if (index >= model.rows.length) return { ok: false, reason: 'row index out of range' };
	const { grid, cols } = resolveGrid(model);
	for (let c = 0; c < cols; c++) {
		if ((grid[index][c]?.cell.rowspan ?? 1) > 1) {
			return { ok: false, reason: `row ${index} is part of a vertical merge` };
		}
	}
	const next = clone(model);
	next.rows.splice(index, 1);
	return { ok: true, model: next };
}

export function addColumn(model: TableModel, index: number): TableOpResult {
	const cols = colCount(model);
	if (index < 0 || index > cols) return { ok: false, reason: 'column index out of range' };
	const { grid } = resolveGrid(model);
	for (let r = 0; r < grid.length; r++) {
		const left = index > 0 ? grid[r][index - 1] : null;
		const at = index < cols ? grid[r][index] : null;
		if (left && at && left.ar === at.ar && left.ac === at.ac) {
			return { ok: false, reason: 'this position splits a horizontal merge' };
		}
	}
	const next = clone(model);
	next.columns.splice(index, 0, { align: 'none' });
	for (let r = 0; r < next.rows.length; r++) {
		const rebuilt: TableCell[] = [];
		let c = 0;
		let inserted = false;
		for (const cell of next.rows[r].cells) {
			if (!inserted && c === index) {
				rebuilt.push(makeCell(''));
				inserted = true;
			}
			rebuilt.push(cell);
			c += cell.colspan;
		}
		if (!inserted) rebuilt.push(makeCell(''));
		next.rows[r].cells = rebuilt;
	}
	return { ok: true, model: next };
}

export function removeColumn(model: TableModel, index: number): TableOpResult {
	const cols = colCount(model);
	if (index < 0 || index >= cols) return { ok: false, reason: 'column index out of range' };
	if (cols <= 1) return { ok: false, reason: 'a table needs at least one column' };
	const { grid, rows } = resolveGrid(model);
	for (let r = 0; r < rows; r++) {
		if ((grid[r][index]?.cell.colspan ?? 1) > 1) {
			return { ok: false, reason: `column ${index} is part of a horizontal merge` };
		}
	}
	const next = clone(model);
	next.columns.splice(index, 1);
	for (let r = 0; r < next.rows.length; r++) {
		let c = 0;
		next.rows[r].cells = next.rows[r].cells.filter((cell) => {
			const keep = c !== index;
			c += cell.colspan;
			return keep;
		});
	}
	return { ok: true, model: next };
}

export function sortByColumn(model: TableModel, colIndex: number, dir: 'asc' | 'desc' = 'asc'): TableOpResult {
	if (hasMerges(model)) return { ok: false, reason: 'sorting is disabled while the table has merged cells' };
	if (colIndex < 0 || colIndex >= colCount(model)) return { ok: false, reason: 'column index out of range' };
	const next = clone(model);
	const body = next.rows.slice(1);
	body.sort((a, b) => {
		const av = a.cells[colIndex]?.text ?? '';
		const bv = b.cells[colIndex]?.text ?? '';
		const na = Number(av);
		const nb = Number(bv);
		const numeric = av.trim() !== '' && bv.trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
		const cmp = numeric ? na - nb : av.localeCompare(bv);
		return dir === 'asc' ? cmp : -cmp;
	});
	next.rows = [next.rows[0], ...body];
	return { ok: true, model: next };
}

export function setColumnAlign(model: TableModel, colIndex: number, align: TableAlign): TableOpResult {
	if (colIndex < 0 || colIndex >= colCount(model)) return { ok: false, reason: 'column index out of range' };
	const next = clone(model);
	next.columns[colIndex] = { align };
	return { ok: true, model: next };
}

export function transpose(model: TableModel): TableOpResult {
	if (hasMerges(model)) return { ok: false, reason: 'transpose is disabled while the table has merged cells' };
	const cols = colCount(model);
	const rows = model.rows;
	const out: TableModel = {
		columns: Array.from({ length: rows.length }, () => ({ align: 'none' as TableAlign })),
		rows: [],
	};
	for (let c = 0; c < cols; c++) {
		out.rows.push({ isHeader: c === 0, cells: rows.map((row) => makeCell(row.cells[c]?.text ?? '')) });
	}
	return { ok: true, model: out };
}

/** Set one anchor cell's text by logical grid coordinate. */
export function setCellText(model: TableModel, row: number, col: number, text: string): TableOpResult {
	const { grid, rows, cols } = resolveGrid(model);
	if (row < 0 || row >= rows || col < 0 || col >= cols) return { ok: false, reason: 'cell out of range' };
	const g = grid[row][col];
	if (!g) return { ok: false, reason: 'cell out of range' };
	const next = clone(model);
	// Locate the anchor cell in the cloned row (walk logical columns) and write it.
	let c = 0;
	for (const cell of next.rows[g.ar].cells) {
		if (c === g.ac) {
			cell.text = text;
			return { ok: true, model: next };
		}
		c += cell.colspan;
	}
	return { ok: false, reason: 'anchor cell not found' };
}

// ── CSV (RFC 4180) ─────────────────────────────────────────────────────────────

function csvEscape(field: string): string {
	if (/[",\n\r]/.test(field)) return '"' + field.replace(/"/g, '""') + '"';
	return field;
}

export type CsvResult = { ok: true; csv: string } | { ok: false; reason: string };

export function modelToCsv(model: TableModel): CsvResult {
	if (hasMerges(model)) return { ok: false, reason: 'CSV export is disabled for tables with merged cells' };
	const lines = model.rows.map((row) => row.cells.map((c) => csvEscape(c.text)).join(','));
	return { ok: true, csv: lines.join('\r\n') };
}

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let i = 0;
	let inQ = false;
	while (i < text.length) {
		const ch = text[i];
		if (inQ) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i += 2;
				continue;
			}
			if (ch === '"') {
				inQ = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}
		if (ch === '"') {
			inQ = true;
			i++;
			continue;
		}
		if (ch === ',') {
			row.push(field);
			field = '';
			i++;
			continue;
		}
		if (ch === '\r' && text[i + 1] === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += 2;
			continue;
		}
		if (ch === '\n' || ch === '\r') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i++;
			continue;
		}
		field += ch;
		i++;
	}
	row.push(field);
	rows.push(row);
	// Drop a trailing empty row from a terminal newline.
	if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
	return rows;
}

export function csvToModel(text: string): TableModel {
	const rows = parseCsv(text);
	const cols = rows[0]?.length ?? 0;
	return {
		columns: Array.from({ length: cols }, () => ({ align: 'none' as TableAlign })),
		rows: rows.map((cells, r) => ({ isHeader: r === 0, cells: cells.map((t) => makeCell(t)) })),
	};
}

// ── shared ─────────────────────────────────────────────────────────────────────

function clone<T>(value: T): T {
	return typeof structuredClone === 'function'
		? structuredClone(value)
		: (JSON.parse(JSON.stringify(value)) as T);
}
