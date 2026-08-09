import type {
	PeakSheetAggregateMetric,
	PeakSheetAnalysisGroup,
	PeakSheetCellValue,
	PeakSheetChartPoint,
	PeakSheetChartViewDefinition,
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetFilterGroup,
	PeakSheetFilterRule,
	PeakSheetRow,
	PeakSheetSelectionStats,
	PeakSheetSortRule,
} from './types';

export function projectPeakSheetRows(
	snapshot: PeakSheetDatasetSnapshot,
	filters?: PeakSheetFilterGroup,
	sorts?: readonly PeakSheetSortRule[],
): PeakSheetRow[] {
	const filtered = filters
		? snapshot.rows.filter((row) => matchesFilterGroup(row, snapshot.fields, filters))
		: [...snapshot.rows];
	if (!sorts?.length) return filtered;
	return stableSortRows(filtered, snapshot.fields, sorts);
}

export function matchesFilterGroup(
	row: PeakSheetRow,
	fields: readonly PeakSheetFieldDefinition[],
	group: PeakSheetFilterGroup,
): boolean {
	if (group.rules.length === 0) return true;
	if (group.conjunction === 'all') {
		return group.rules.every((rule) => matchesFilterRule(row, fields, rule));
	}
	return group.rules.some((rule) => matchesFilterRule(row, fields, rule));
}

export function stableSortRows(
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	sorts: readonly PeakSheetSortRule[],
): PeakSheetRow[] {
	return rows
		.map((row, index) => ({ row, index }))
		.sort((left, right) => {
			for (const sort of sorts) {
				const field = fields.find((candidate) => candidate.id === sort.fieldId);
				if (!field) continue;
				const result = compareValues(left.row.cells[field.id] ?? null, right.row.cells[field.id] ?? null, field);
				if (result !== 0) return sort.direction === 'asc' ? result : -result;
			}
			return left.index - right.index;
		})
		.map((entry) => entry.row);
}

export function computeSelectionStats(values: readonly PeakSheetCellValue[]): PeakSheetSelectionStats {
	const present = values.filter((value) => value !== null && value !== '');
	const numbers = present.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
	if (numbers.length === 0) {
		return { count: present.length, numericCount: 0, sum: null, average: null, min: null, max: null };
	}
	const sum = numbers.reduce((total, value) => total + value, 0);
	return {
		count: present.length,
		numericCount: numbers.length,
		sum,
		average: sum / numbers.length,
		min: Math.min(...numbers),
		max: Math.max(...numbers),
	};
}

export function aggregatePeakSheetRows(
	rows: readonly PeakSheetRow[],
	metrics: readonly PeakSheetAggregateMetric[],
): Record<string, number | null> {
	const result: Record<string, number | null> = {};
	for (const metric of metrics) {
		if (metric.operation === 'count' && !metric.fieldId) {
			result[metric.id] = rows.length;
			continue;
		}
		const values = metric.fieldId
			? rows.map((row) => row.cells[metric.fieldId!] ?? null)
			: [];
		const stats = computeSelectionStats(values);
		result[metric.id] = metricValue(stats, metric.operation);
	}
	return result;
}

export function groupPeakSheetRows(
	rows: readonly PeakSheetRow[],
	fieldId: string,
	metrics: readonly PeakSheetAggregateMetric[] = [],
	maxGroups = 100,
): PeakSheetAnalysisGroup[] {
	const buckets = new Map<string, PeakSheetRow[]>();
	for (const row of rows) {
		const key = displayValue(row.cells[fieldId] ?? null) || '(Empty)';
		const bucket = buckets.get(key) ?? [];
		bucket.push(row);
		buckets.set(key, bucket);
	}
	return [...buckets.entries()].slice(0, Math.max(1, maxGroups)).map(([key, bucket]) => ({
		key,
		rowCount: bucket.length,
		metrics: aggregatePeakSheetRows(bucket, metrics),
	}));
}

export function chartPointsForView(
	snapshot: PeakSheetDatasetSnapshot,
	view: PeakSheetChartViewDefinition,
): PeakSheetChartPoint[] {
	const rows = projectPeakSheetRows(snapshot, view.filters, view.sorts);
	const metrics: PeakSheetAggregateMetric[] = view.series.map((series) => ({
		id: series.fieldId,
		fieldId: series.aggregate === 'count' ? undefined : series.fieldId,
		operation: series.aggregate,
		label: series.label,
	}));
	return groupPeakSheetRows(rows, view.categoryFieldId, metrics).map((group) => ({
		category: group.key,
		values: Object.fromEntries(Object.entries(group.metrics).map(([key, value]) => [key, value ?? 0])),
	}));
}

export function displayValue(value: PeakSheetCellValue): string {
	if (value === null) return '';
	if (typeof value === 'object') return value.displayName?.trim() || value.vaultPath;
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	return String(value);
}

function matchesFilterRule(
	row: PeakSheetRow,
	fields: readonly PeakSheetFieldDefinition[],
	rule: PeakSheetFilterRule,
): boolean {
	const field = fields.find((candidate) => candidate.id === rule.fieldId);
	if (!field) return false;
	const left = row.cells[rule.fieldId] ?? null;
	const right = rule.value ?? null;
	const leftText = displayValue(left).toLocaleLowerCase();
	const rightText = displayValue(right).toLocaleLowerCase();
	if (rule.operator === 'isEmpty') return left === null || leftText === '';
	if (rule.operator === 'isNotEmpty') return left !== null && leftText !== '';
	if (rule.operator === 'contains') return leftText.includes(rightText);
	if (rule.operator === 'notContains') return !leftText.includes(rightText);
	if (rule.operator === 'equals') return compareValues(left, right, field) === 0;
	if (rule.operator === 'notEquals') return compareValues(left, right, field) !== 0;
	const comparison = compareValues(left, right, field);
	if (rule.operator === 'greaterThan' || rule.operator === 'after') return comparison > 0;
	if (rule.operator === 'greaterThanOrEqual') return comparison >= 0;
	if (rule.operator === 'lessThan' || rule.operator === 'before') return comparison < 0;
	return comparison <= 0;
}

function compareValues(
	left: PeakSheetCellValue,
	right: PeakSheetCellValue,
	field: PeakSheetFieldDefinition,
): number {
	if (left === null && right === null) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	if (field.type === 'number') return numericValue(left) - numericValue(right);
	if (field.type === 'checkbox') return Number(Boolean(left)) - Number(Boolean(right));
	if (field.type === 'date') return dateValue(left) - dateValue(right);
	return displayValue(left).localeCompare(displayValue(right), undefined, { numeric: true, sensitivity: 'base' });
}

function numericValue(value: PeakSheetCellValue): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	const parsed = Number(displayValue(value));
	return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: PeakSheetCellValue): number {
	const parsed = Date.parse(displayValue(value));
	return Number.isFinite(parsed) ? parsed : 0;
}

function metricValue(
	stats: PeakSheetSelectionStats,
	operation: PeakSheetAggregateMetric['operation'],
): number | null {
	if (operation === 'count') return stats.count;
	if (operation === 'sum') return stats.sum;
	if (operation === 'average') return stats.average;
	if (operation === 'min') return stats.min;
	return stats.max;
}
