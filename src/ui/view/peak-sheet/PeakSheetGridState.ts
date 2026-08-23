import type {
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetPatchOperation,
	PeakSheetRow,
} from '@/core/sheet';

export const PEAK_SHEET_MIN_ROWS = 64;
export const PEAK_SHEET_MIN_COLUMNS = 30;

export type PeakSheetGridMode = 'navigation' | 'selecting' | 'editing';

export interface PeakSheetGridState {
	readonly anchorRow: number;
	readonly anchorField: number;
	readonly focusRow: number;
	readonly focusField: number;
	readonly mode: PeakSheetGridMode;
}

export interface PeakSheetGridBounds {
	readonly top: number;
	readonly bottom: number;
	readonly left: number;
	readonly right: number;
}

export const INITIAL_PEAK_SHEET_GRID_STATE: PeakSheetGridState = {
	anchorRow: 0,
	anchorField: 0,
	focusRow: 0,
	focusField: 0,
	mode: 'navigation',
};

export function peakSheetGridBounds(state: PeakSheetGridState): PeakSheetGridBounds {
	return {
		top: Math.min(state.anchorRow, state.focusRow),
		bottom: Math.max(state.anchorRow, state.focusRow),
		left: Math.min(state.anchorField, state.focusField),
		right: Math.max(state.anchorField, state.focusField),
	};
}

export function peakSheetColumnName(index: number): string {
	let value = index + 1;
	let name = '';
	while (value > 0) {
		value -= 1;
		name = String.fromCharCode(65 + (value % 26)) + name;
		value = Math.floor(value / 26);
	}
	return name;
}

export function peakSheetRangeLabel(bounds: PeakSheetGridBounds): string {
	const start = `${peakSheetColumnName(bounds.left)}${bounds.top + 1}`;
	const end = `${peakSheetColumnName(bounds.right)}${bounds.bottom + 1}`;
	return start === end ? start : `${start}:${end}`;
}

export function visiblePeakSheetRowCount(snapshot: PeakSheetDatasetSnapshot): number {
	return Math.max(PEAK_SHEET_MIN_ROWS, snapshot.rows.length + 1);
}

export function visiblePeakSheetColumnCount(snapshot: PeakSheetDatasetSnapshot): number {
	return Math.max(PEAK_SHEET_MIN_COLUMNS, snapshot.fields.length + 1);
}

export function peakSheetFieldWidth(field?: PeakSheetFieldDefinition): number {
	if (!field) return 160;
	const contract = FIELD_WIDTHS[field.type];
	return Math.max(contract.min, Math.min(contract.max, field.width ?? contract.default));
}

export function buildPeakSheetMaterializeOperations(
	snapshot: PeakSheetDatasetSnapshot,
	rowIndex: number,
	fieldIndex: number,
	value: PeakSheetCellValue,
	rowId?: string,
): readonly PeakSheetPatchOperation[] {
	const fields = [...snapshot.fields];
	const operations: PeakSheetPatchOperation[] = [];
	while (fields.length <= fieldIndex) {
		const index = fields.length;
		const field: PeakSheetFieldDefinition = {
			id: `field-${crypto.randomUUID()}`,
			name: `Column ${peakSheetColumnName(index)}`,
			type: 'text',
			width: FIELD_WIDTHS.text.default,
		};
		fields.push(field);
		operations.push({ type: 'addField', field });
	}
	let targetRowId = rowId;
	if (!targetRowId) {
		const missing = Math.max(1, rowIndex - snapshot.rows.length + 1);
		for (let index = 0; index < missing; index++) {
			const row = blankPeakSheetRow(fields);
			operations.push({ type: 'addRow', row });
			targetRowId = row.id;
		}
	}
	const field = fields[fieldIndex];
	if (!targetRowId || !field || field.formula) return operations;
	operations.push({ type: 'setCell', rowId: targetRowId, fieldId: field.id, value: normalizePeakSheetInput(value, field) });
	return operations;
}

export function blankPeakSheetRow(fields: readonly PeakSheetFieldDefinition[]): PeakSheetRow {
	return {
		id: `row-${crypto.randomUUID()}`,
		cells: Object.fromEntries(fields.filter((field) => !field.formula).map((field) => [field.id, field.type === 'checkbox' ? false : null])),
	};
}

export function normalizePeakSheetInput(value: PeakSheetCellValue, field: PeakSheetFieldDefinition): PeakSheetCellValue {
	if (typeof value !== 'string') return value;
	const text = value.trim();
	if (!text) return field.type === 'checkbox' ? false : null;
	if (field.type === 'number') {
		const parsed = Number(text);
		return Number.isFinite(parsed) ? parsed : null;
	}
	if (field.type === 'checkbox') return ['true', 'yes', '1', 'checked', '✓'].includes(text.toLocaleLowerCase());
	if (field.type === 'singleSelect') {
		const option = field.options?.find((candidate) => candidate.id === text || candidate.label.toLocaleLowerCase() === text.toLocaleLowerCase());
		return option?.id ?? null;
	}
	if (field.type === 'file') return { kind: 'vault', vaultPath: text };
	return text;
}

const FIELD_WIDTHS: Readonly<Record<PeakSheetFieldDefinition['type'], { readonly default: number; readonly min: number; readonly max: number }>> = {
	text: { default: 220, min: 160, max: 520 },
	link: { default: 200, min: 144, max: 520 },
	singleSelect: { default: 112, min: 104, max: 220 },
	checkbox: { default: 104, min: 96, max: 152 },
	date: { default: 108, min: 96, max: 180 },
	number: { default: 96, min: 84, max: 180 },
	file: { default: 180, min: 144, max: 360 },
};
