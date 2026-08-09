import { CellError, HyperFormula } from 'hyperformula';

import type { PeakSheetFormulaResolver } from '@/core/sheet';
import type {
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
} from '@/core/sheet';

const FIELD_REFERENCE_PATTERN = /\[([^\]]+)]/g;

export class HyperFormulaPeakSheetEngine implements PeakSheetFormulaResolver {
	resolve(snapshot: PeakSheetDatasetSnapshot): PeakSheetDatasetSnapshot {
		if (!snapshot.fields.some((field) => field.formula)) return snapshot;
		const matrix = snapshot.rows.map((row, rowIndex) => snapshot.fields.map((field, columnIndex) => {
			if (field.formula) return normalizeFormula(field.formula, snapshot.fields, rowIndex, columnIndex);
			return toFormulaValue(row.cells[field.id] ?? null);
		}));
		const engine = HyperFormula.buildFromArray(matrix, { licenseKey: 'gpl-v3' });
		try {
			const rows = snapshot.rows.map((row, rowIndex) => {
				const cells: Record<string, PeakSheetCellValue> = { ...row.cells };
				for (let columnIndex = 0; columnIndex < snapshot.fields.length; columnIndex++) {
					const field = snapshot.fields[columnIndex];
					if (!field.formula) continue;
					cells[field.id] = fromFormulaValue(engine.getCellValue({ sheet: 0, row: rowIndex, col: columnIndex }));
				}
				return { ...row, cells };
			});
			return { ...snapshot, rows };
		} finally {
			engine.destroy();
		}
	}
}

function normalizeFormula(
	formula: string,
	fields: readonly PeakSheetFieldDefinition[],
	rowIndex: number,
	currentColumnIndex: number,
): string {
	const normalized = formula.trim().startsWith('=') ? formula.trim() : `=${formula.trim()}`;
	return normalized.replace(FIELD_REFERENCE_PATTERN, (_, rawName: string) => {
		const fieldIndex = fields.findIndex((field) => field.name.trim().toLocaleLowerCase() === rawName.trim().toLocaleLowerCase());
		if (fieldIndex < 0) return '#REF!';
		if (fieldIndex === currentColumnIndex) return '#CYCLE!';
		return `${columnName(fieldIndex)}${rowIndex + 1}`;
	});
}

function columnName(index: number): string {
	let current = index + 1;
	let result = '';
	while (current > 0) {
		const remainder = (current - 1) % 26;
		result = String.fromCharCode(65 + remainder) + result;
		current = Math.floor((current - 1) / 26);
	}
	return result;
}

function toFormulaValue(value: PeakSheetCellValue): string | number | boolean | null {
	if (value && typeof value === 'object') return value.vaultPath;
	return value;
}

function fromFormulaValue(value: unknown): PeakSheetCellValue {
	if (value instanceof CellError) return `#${value.type}!`;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	return null;
}
