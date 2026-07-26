/**
 * Peak Composer — table HTML (de)serialization (WP6, handoff §10.4/10.5).
 *
 * `modelToHtml` is pure (no DOM). Parsing HTML back into a model needs an HTML
 * tokenizer, which differs by environment, so it goes through a small port:
 *
 *  - **service / tests** use `parse5` (already in node_modules, zero new dep) —
 *    {@link createParse5HtmlPort};
 *  - **renderer** uses the leaf window's native `DOMParser` —
 *    {@link createDomParserHtmlPort} — so the shipped bundle never pulls parse5.
 *
 * The round-trip invariant (S3 GREEN): `modelToHtml → htmlToModel → modelToHtml`
 * is byte-exact and never loses rowspan/colspan/content.
 */

import { colCount, makeCell, resolveGrid, type TableAlign, type TableModel, type TableRow } from './tableModel';

const alignAttr = (a?: TableAlign): string => (a && a !== 'none' ? ` align="${a}"` : '');

/** Serialize the model to a compact `<table><thead>…</thead><tbody>…</tbody></table>`. */
export function modelToHtml(model: TableModel): string {
	const { grid, cols } = resolveGrid(model);
	const cellTag = (r: number, tag: 'th' | 'td'): string => {
		let s = '';
		for (let c = 0; c < cols; c++) {
			const g = grid[r][c];
			if (!g || !g.anchor) continue;
			const cell = g.cell;
			const a = cell.align || model.columns[c]?.align || 'none';
			const cs = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
			const rs = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
			s += `<${tag}${cs}${rs}${alignAttr(a)}>${cell.text}</${tag}>`;
		}
		return `<tr>${s}</tr>`;
	};
	const rowsMeta = model.rows.map((row, r) => ({ r, isHeader: row.isHeader }));
	const headRows = rowsMeta.filter((x) => x.isHeader).map((x) => cellTag(x.r, 'th')).join('');
	const bodyRows = rowsMeta.filter((x) => !x.isHeader).map((x) => cellTag(x.r, 'td')).join('');
	return `<table><thead>${headRows}</thead><tbody>${bodyRows}</tbody></table>`;
}

/** A parsed cell (attributes + inner text) surfaced by an HTML port. */
export interface ParsedTableCell {
	text: string;
	colspan: number;
	rowspan: number;
	align?: TableAlign;
}

export interface ParsedTableRow {
	isHeader: boolean;
	cells: ParsedTableCell[];
}

/**
 * Environment-specific HTML→rows bridge. Implementations return the raw parsed
 * rows; {@link rowsToModel} assembles the shared model + column alignment.
 */
export interface HtmlTablePort {
	parseRows(html: string): ParsedTableRow[];
}

function num(v: string | undefined, fallback: number): number {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toAlign(v: string | undefined): TableAlign | undefined {
	if (v === 'left' || v === 'right' || v === 'center' || v === 'none') return v;
	return undefined;
}

/** Assemble parsed rows into a model, deriving per-column alignment from row 0. */
function rowsToModel(rows: ParsedTableRow[]): TableModel {
	const model: TableModel = {
		columns: [],
		rows: rows.map((r) => ({
			isHeader: r.isHeader,
			cells: r.cells.map((c) => makeCell(c.text, c.colspan, c.rowspan, c.align)),
		})),
	};
	if (model.rows.length === 0) return model;
	const cols = colCount(model);
	const { grid } = resolveGrid(model);
	model.columns = Array.from({ length: cols }, (_, c) => ({
		align: (grid[0][c]?.cell.align ?? 'none') as TableAlign,
	}));
	return model;
}

export function htmlToModel(html: string, port: HtmlTablePort): TableModel {
	return rowsToModel(port.parseRows(html));
}

// ── parse5 port (service / tests) ──────────────────────────────────────────────

/**
 * parse5-backed port. Lazily `require`d so the renderer bundle (which uses the
 * DOMParser port) never drags parse5 in. Node/test only.
 */
export function createParse5HtmlPort(): HtmlTablePort {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { parseFragment } = require('parse5') as typeof import('parse5');
	type P5Node = {
		nodeName: string;
		value?: string;
		tagName?: string;
		attrs?: { name: string; value: string }[];
		childNodes?: P5Node[];
	};
	const findNode = (node: P5Node | undefined, name: string): P5Node | null => {
		if (!node) return null;
		if (node.nodeName === name) return node;
		for (const child of node.childNodes ?? []) {
			const hit = findNode(child, name);
			if (hit) return hit;
		}
		return null;
	};
	const childrenNamed = (node: P5Node | null, name: string): P5Node[] =>
		(node?.childNodes ?? []).filter((c) => c.nodeName === name);
	const attrOf = (node: P5Node, name: string): string | undefined =>
		(node.attrs ?? []).find((a) => a.name === name)?.value;
	const textOf = (node: P5Node): string =>
		(node.childNodes ?? []).map((c) => (c.nodeName === '#text' ? (c.value ?? '') : textOf(c))).join('');

	return {
		parseRows(html: string): ParsedTableRow[] {
			const frag = parseFragment(html) as unknown as P5Node;
			const table = findNode(frag, 'table');
			if (!table) throw new Error('no <table> element found');
			const thead = findNode(table, 'thead');
			const tbody = findNode(table, 'tbody');
			const sections: { node: P5Node; isHeader: boolean }[] = [];
			if (thead) sections.push({ node: thead, isHeader: true });
			if (tbody) sections.push({ node: tbody, isHeader: false });
			if (!thead && !tbody) sections.push({ node: table, isHeader: false });
			const out: ParsedTableRow[] = [];
			for (const sec of sections) {
				for (const tr of childrenNamed(sec.node, 'tr')) {
					const ordered = (tr.childNodes ?? []).filter((c) => c.nodeName === 'th' || c.nodeName === 'td');
					out.push({
						isHeader: sec.isHeader,
						cells: ordered.map((td) => ({
							text: textOf(td),
							colspan: num(attrOf(td, 'colspan'), 1),
							rowspan: num(attrOf(td, 'rowspan'), 1),
							...(toAlign(attrOf(td, 'align')) ? { align: toAlign(attrOf(td, 'align')) } : {}),
						})),
					});
				}
			}
			return out;
		},
	};
}

// ── DOMParser port (renderer) ──────────────────────────────────────────────────

/**
 * Native-DOM port for the renderer. Pass the leaf's own `document` (owner window)
 * so table parsing stays scoped to the popout when the composer is detached.
 */
export function createDomParserHtmlPort(ownerDocument: Document): HtmlTablePort {
	return {
		parseRows(html: string): ParsedTableRow[] {
			const parser = new (ownerDocument.defaultView?.DOMParser ?? DOMParser)();
			const doc = parser.parseFromString(html, 'text/html');
			const table = doc.querySelector('table');
			if (!table) throw new Error('no <table> element found');
			const thead = table.querySelector('thead');
			const tbody = table.querySelector('tbody');
			const sections: { el: Element; isHeader: boolean }[] = [];
			if (thead) sections.push({ el: thead, isHeader: true });
			if (tbody) sections.push({ el: tbody, isHeader: false });
			if (!thead && !tbody) sections.push({ el: table, isHeader: false });
			const out: ParsedTableRow[] = [];
			for (const sec of sections) {
				const trs = Array.from(sec.el.children).filter((c) => c.tagName === 'TR');
				for (const tr of trs) {
					const cells = Array.from(tr.children).filter((c) => c.tagName === 'TH' || c.tagName === 'TD');
					out.push({
						isHeader: sec.isHeader,
						cells: cells.map((td) => ({
							text: td.textContent ?? '',
							colspan: num(td.getAttribute('colspan') ?? undefined, 1),
							rowspan: num(td.getAttribute('rowspan') ?? undefined, 1),
							...(toAlign(td.getAttribute('align') ?? undefined)
								? { align: toAlign(td.getAttribute('align') ?? undefined) }
								: {}),
						})),
					});
				}
			}
			return out;
		},
	};
}

export type { TableRow };
