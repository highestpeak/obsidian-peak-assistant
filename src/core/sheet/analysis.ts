import {
	aggregatePeakSheetRows,
	groupPeakSheetRows,
	projectPeakSheetRows,
	stableSortRows,
} from './compute';
import type {
	PeakSheetAnalysisPlan,
	PeakSheetAnalysisResult,
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetRow,
} from './types';

export interface PeakSheetFormulaResolver {
	resolve(snapshot: PeakSheetDatasetSnapshot): PeakSheetDatasetSnapshot;
}

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_GROUPS = 100;
const DEFAULT_MAX_OUTPUT_BYTES = 160_000;

export function executePeakSheetAnalysis(
	snapshot: PeakSheetDatasetSnapshot,
	plan: PeakSheetAnalysisPlan,
	formulaResolver?: PeakSheetFormulaResolver,
): PeakSheetAnalysisResult {
	if (plan.datasetId !== snapshot.datasetId) throw new Error('Analysis dataset does not match the current dataset.');
	if (plan.baseRevision !== snapshot.revision) {
		throw new Error(`Stale analysis revision: expected ${snapshot.revision}, received ${plan.baseRevision}.`);
	}
	const maxRows = clampLimit(plan.limits?.maxRows, DEFAULT_MAX_ROWS, 5_000);
	const maxGroups = clampLimit(plan.limits?.maxGroups, DEFAULT_MAX_GROUPS, 1_000);
	const maxOutputBytes = clampLimit(plan.limits?.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 1_000_000);
	const diagnostics: string[] = [];
	let working = formulaResolver ? formulaResolver.resolve(snapshot) : snapshot;
	let rows = [...working.rows];
	let groupFieldId: string | undefined;
	let resultGroups: PeakSheetAnalysisResult['groups'];
	let resultMetrics: PeakSheetAnalysisResult['metrics'];
	let chart: PeakSheetAnalysisResult['chart'];

	for (const step of plan.steps) {
		if (step.op === 'filter') {
			rows = projectPeakSheetRows({ ...working, rows }, step.filters);
			continue;
		}
		if (step.op === 'sort') {
			rows = stableSortRows(rows, working.fields, step.sorts);
			continue;
		}
		if (step.op === 'group') {
			requireField(working, step.fieldId);
			groupFieldId = step.fieldId;
			resultGroups = groupPeakSheetRows(rows, step.fieldId, [], maxGroups);
			continue;
		}
		if (step.op === 'aggregate') {
			for (const metric of step.metrics) if (metric.fieldId) requireField(working, metric.fieldId);
			if (groupFieldId) {
				resultGroups = groupPeakSheetRows(rows, groupFieldId, step.metrics, maxGroups);
			} else {
				resultMetrics = aggregatePeakSheetRows(rows, step.metrics);
			}
			continue;
		}
		if (step.op === 'topN') {
			requireField(working, step.fieldId);
			rows = stableSortRows(rows, working.fields, [{
				fieldId: step.fieldId,
				direction: step.direction ?? 'desc',
			}]).slice(0, clampLimit(step.count, 10, maxRows));
			continue;
		}
		if (step.op === 'dedupe') {
			for (const fieldId of step.fieldIds) requireField(working, fieldId);
			rows = dedupeRows(rows, step.fieldIds);
			continue;
		}
		if (step.op === 'cast') {
			requireField(working, step.fieldId);
			rows = castRows(rows, step.fieldId, step.target, diagnostics);
			working = { ...working, rows };
			continue;
		}
		if (step.op === 'derive') {
			const field = requireField(working, step.fieldId);
			if (!formulaResolver) {
				diagnostics.push(`Formula engine is unavailable; derive step for ${field.name} was skipped.`);
				continue;
			}
			working = formulaResolver.resolve({
				...working,
				rows,
				fields: working.fields.map((candidate) => candidate.id === field.id
					? { ...candidate, formula: step.formula }
					: candidate),
			});
			rows = [...working.rows];
			continue;
		}
		for (const metric of step.metrics) if (metric.fieldId) requireField(working, metric.fieldId);
		requireField(working, step.categoryFieldId);
		const groups = groupPeakSheetRows(rows, step.categoryFieldId, step.metrics, maxGroups);
		chart = {
			type: step.chartType,
			points: groups.map((group) => ({
				category: group.key,
				values: Object.fromEntries(Object.entries(group.metrics).map(([key, value]) => [key, value ?? 0])),
			})),
		};
	}

	const boundedRows = rows.slice(0, maxRows);
	if (rows.length > boundedRows.length) diagnostics.push(`Rows truncated from ${rows.length} to ${boundedRows.length}.`);
	const result: PeakSheetAnalysisResult = {
		datasetId: snapshot.datasetId,
		revision: snapshot.revision,
		rows: boundedRows,
		groups: resultGroups,
		metrics: resultMetrics,
		chart,
		diagnostics,
	};
	const byteLength = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	if (byteLength > maxOutputBytes) {
		return {
			...result,
			rows: [],
			diagnostics: [...diagnostics, `Row payload omitted because the result exceeded ${maxOutputBytes} bytes.`],
		};
	}
	return result;
}

function dedupeRows(rows: readonly PeakSheetRow[], fieldIds: readonly string[]): PeakSheetRow[] {
	const seen = new Set<string>();
	const result: PeakSheetRow[] = [];
	for (const row of rows) {
		const key = JSON.stringify(fieldIds.map((fieldId) => normalizeForKey(row.cells[fieldId] ?? null)));
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(row);
	}
	return result;
}

function castRows(
	rows: readonly PeakSheetRow[],
	fieldId: string,
	target: 'text' | 'number' | 'date' | 'checkbox',
	diagnostics: string[],
): PeakSheetRow[] {
	return rows.map((row) => {
		const current = row.cells[fieldId] ?? null;
		const value = castValue(current, target);
		if (value === null && current !== null && current !== '') diagnostics.push(`Row ${row.id}: value could not be cast to ${target}.`);
		return { ...row, cells: { ...row.cells, [fieldId]: value } };
	});
}

function castValue(
	value: PeakSheetCellValue,
	target: 'text' | 'number' | 'date' | 'checkbox',
): PeakSheetCellValue {
	if (value === null) return null;
	if (target === 'text') return typeof value === 'object' ? value.vaultPath : String(value);
	if (target === 'number') {
		const parsed = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	if (target === 'checkbox') {
		if (typeof value === 'boolean') return value;
		const normalized = String(value).trim().toLocaleLowerCase();
		if (['true', 'yes', '1', 'checked'].includes(normalized)) return true;
		if (['false', 'no', '0', 'unchecked'].includes(normalized)) return false;
		return null;
	}
	const timestamp = Date.parse(String(value));
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeForKey(value: PeakSheetCellValue): unknown {
	if (typeof value === 'string') return value.trim().toLocaleLowerCase();
	if (value && typeof value === 'object') return value.vaultPath.trim().toLocaleLowerCase();
	return value;
}

function requireField(snapshot: PeakSheetDatasetSnapshot, fieldId: string) {
	const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
	if (!field) throw new Error(`Analysis references unknown field ${fieldId}.`);
	return field;
}

function clampLimit(value: number | undefined, fallback: number, maximum: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.min(maximum, Math.floor(value)));
}
