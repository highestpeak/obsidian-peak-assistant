import type { PeakSheetCellValue, PeakSheetDatasetSnapshot } from './types';

export function serializePeakSheetCsv(snapshot: PeakSheetDatasetSnapshot): string {
	const rows = [
		snapshot.fields.map((field) => csvCell(field.name)),
		...snapshot.rows.map((row) => snapshot.fields.map((field) => csvCell(exportValue(row.cells[field.id] ?? null)))),
	];
	return `${rows.map((row) => row.join(',')).join('\r\n')}\r\n`;
}

export function exportPeakSheetCellValue(value: PeakSheetCellValue): string | number | boolean | null {
	if (value === null) return null;
	if (typeof value !== 'object') return value;
	return value.vaultPath;
}

function exportValue(value: PeakSheetCellValue): string {
	return String(exportPeakSheetCellValue(value) ?? '');
}

function csvCell(value: string): string {
	if (!/[",\r\n]/.test(value)) return value;
	return `"${value.replace(/"/g, '""')}"`;
}
