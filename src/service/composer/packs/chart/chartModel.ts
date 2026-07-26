/**
 * Peak Composer — chart spec model (WP6, handoff §10.6, S4 schema).
 *
 * A chart lives in the document as a fenced ```chart block whose body is the
 * JSON spec (type/title/x/series/data). This module is the single owner of that
 * spec ⇄ fenced-source ⇄ table-derived-spec logic — pure, no React, no recharts.
 * The renderer and the writeback adapter both read the SAME parsed spec, so a
 * chart and its source never disagree (§10.6: "chart and table source do not
 * re-render each other").
 */

import {
	ComposerChartSourcePayloadSchema,
	type ComposerChartSourcePayload,
} from '@/core/schemas/composer';
import { colCount, resolveGrid, type TableModel } from '../table/tableModel';

export type ChartType = 'bar' | 'line' | 'pie';
export type ChartSpec = ComposerChartSourcePayload;

/** Default categorical palette (chart series colors when unspecified). */
export const CHART_PALETTE = ['#4f8cff', '#22aa88', '#ff8844', '#aa44ff', '#e5484d', '#f5a623'] as const;

export const CHART_FENCE_LANG = 'chart';

/** Detect a fenced ```chart block from its verbatim source slice. */
export function isChartSource(raw: string): boolean {
	return /^\s*(`{3,}|~{3,})\s*chart\b/.test(raw);
}

/** Extract the JSON body from a fenced ```chart block (null when not one). */
export function extractChartBody(raw: string): string | null {
	const m = /^\s*(`{3,}|~{3,})\s*chart\b[^\n]*\n([\s\S]*?)\n?\1\s*$/.exec(raw.trim());
	if (!m) return null;
	return m[2];
}

export type ParseChartResult = { ok: true; spec: ChartSpec } | { ok: false; reason: string };

/** Parse + validate a fenced ```chart block into a typed spec. */
export function parseChartSource(raw: string): ParseChartResult {
	const body = extractChartBody(raw);
	if (body === null) return { ok: false, reason: 'not a fenced chart block' };
	return parseChartJson(body);
}

/** Parse + validate raw JSON text into a typed spec. */
export function parseChartJson(json: string): ParseChartResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (err) {
		return { ok: false, reason: `invalid chart JSON: ${err instanceof Error ? err.message : String(err)}` };
	}
	const result = ComposerChartSourcePayloadSchema.safeParse(parsed);
	if (!result.success) return { ok: false, reason: result.error.issues[0]?.message ?? 'invalid chart spec' };
	return { ok: true, spec: result.data };
}

/** Serialize a spec back into a fenced ```chart block (stable 2-space JSON). */
export function chartSpecToFencedSource(spec: ChartSpec): string {
	return '```chart\n' + JSON.stringify(spec, null, 2) + '\n```';
}

/** The resolved color for series `i` (explicit color wins, else palette). */
export function seriesColor(spec: ChartSpec, i: number): string {
	return spec.series[i]?.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
}

// ── table → chart ────────────────────────────────────────────────────────────

/** A column looks numeric when every non-empty body cell parses as a number. */
function columnIsNumeric(model: TableModel, col: number): boolean {
	const { grid } = resolveGrid(model);
	let seen = 0;
	for (let r = 1; r < model.rows.length; r++) {
		const text = grid[r]?.[col]?.cell.text?.trim() ?? '';
		if (text === '') continue;
		if (Number.isNaN(Number(text))) return false;
		seen++;
	}
	return seen > 0;
}

function headerText(model: TableModel, col: number): string {
	return resolveGrid(model).grid[0]?.[col]?.cell.text?.trim() || `col${col + 1}`;
}

export type TableToChartResult = { ok: true; spec: ChartSpec } | { ok: false; reason: string };

/**
 * Derive a chart spec from a table (§10.4 chart button / §10.5 generate-chart):
 * the first column becomes the category axis (`x`); every numeric column becomes
 * a series. Fails closed with a reason when no numeric column exists (the toolbar
 * renders it as the button's disabled explanation).
 */
export function tableToChartSpec(model: TableModel, type: ChartType = 'bar', title?: string): TableToChartResult {
	const cols = colCount(model);
	if (cols < 2 || model.rows.length < 2) {
		return { ok: false, reason: 'a chart needs at least two columns and one data row' };
	}
	const { grid } = resolveGrid(model);
	const xField = headerText(model, 0);
	const numericCols: number[] = [];
	for (let c = 1; c < cols; c++) if (columnIsNumeric(model, c)) numericCols.push(c);
	if (numericCols.length === 0) {
		return { ok: false, reason: 'no numeric column found to chart' };
	}
	const series = numericCols.map((c, i) => ({
		key: headerText(model, c),
		label: headerText(model, c),
		color: CHART_PALETTE[i % CHART_PALETTE.length],
	}));
	const data: Record<string, string | number>[] = [];
	for (let r = 1; r < model.rows.length; r++) {
		const row: Record<string, string | number> = { [xField]: grid[r]?.[0]?.cell.text ?? '' };
		for (const c of numericCols) {
			const raw = grid[r]?.[c]?.cell.text?.trim() ?? '';
			row[headerText(model, c)] = raw === '' ? 0 : Number(raw);
		}
		data.push(row);
	}
	const spec: ChartSpec = {
		type,
		...(title ? { title } : {}),
		x: xField,
		series,
		data,
	};
	return { ok: true, spec };
}

/** Switch a chart's type (bar/line/pie), preserving the rest of the spec. */
export function switchChartType(spec: ChartSpec, type: ChartType): ChartSpec {
	return { ...spec, type };
}
