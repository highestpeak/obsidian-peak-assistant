import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { datasetDraftFromMatrix, PEAK_SHEET_DEFAULTS } from '@/core/sheet';
import type { PeakSheetWorkbookDraft } from '@/core/sheet';

export async function parsePeakSheetXlsx(
	buffer: ArrayBuffer,
	workbookName = 'Imported workbook',
): Promise<PeakSheetWorkbookDraft> {
	if (buffer.byteLength > PEAK_SHEET_DEFAULTS.limits.maxImportBytes) {
		throw new Error(`Workbook exceeds the ${PEAK_SHEET_DEFAULTS.limits.maxImportBytes}-byte import limit.`);
	}
	await assertPeakSheetXlsxArchiveBounds(buffer);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer as never);
	const sheets: PeakSheetWorkbookDraft['sheets'][number][] = [];
	workbook.eachSheet((worksheet) => {
		const compatibility: string[] = [];
		if (worksheet.model.merges?.length) compatibility.push('Merged cells were flattened to their displayed values.');
		const matrix: unknown[][] = [];
		const rowCount = Math.min(worksheet.actualRowCount, PEAK_SHEET_DEFAULTS.limits.maxImportRows + 1);
		const columnCount = Math.min(worksheet.actualColumnCount, PEAK_SHEET_DEFAULTS.limits.maxImportColumns);
		for (let rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
			const values: unknown[] = [];
			for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
				values.push(readCellValue(worksheet.getCell(rowIndex, columnIndex), compatibility));
			}
			matrix.push(values);
		}
		if (worksheet.actualRowCount > rowCount) compatibility.push(`Rows after ${rowCount - 1} were not imported.`);
		if (worksheet.actualColumnCount > columnCount) compatibility.push(`Columns after ${columnCount} were not imported.`);
		if (matrix.length === 0) return;
		sheets.push({
			name: worksheet.name,
			draft: datasetDraftFromMatrix(matrix, worksheet.name, 'xlsx'),
			compatibility: [...new Set(compatibility)],
		});
	});
	if (sheets.length === 0) throw new Error('Workbook has no non-empty worksheets.');
	return {
		workbookName,
		sheets,
		diagnostics: ['Cell styles, conditional formatting, charts, macros and pivot tables are intentionally not imported.'],
	};
}

type PeakSheetXlsxArchiveLimits = {
	maxEntries: number;
	maxExpandedBytes: number;
};

type BoundedZipObject = {
	dir: boolean;
	_data?: {
		uncompressedSize?: number;
	};
};

export async function assertPeakSheetXlsxArchiveBounds(
	buffer: ArrayBuffer,
	limits: PeakSheetXlsxArchiveLimits = {
		maxEntries: PEAK_SHEET_DEFAULTS.limits.maxWorkbookEntries,
		maxExpandedBytes: PEAK_SHEET_DEFAULTS.limits.maxWorkbookExpandedBytes,
	},
): Promise<void> {
	const archive = await JSZip.loadAsync(buffer);
	const entries = Object.values(archive.files) as BoundedZipObject[];
	if (entries.length > limits.maxEntries) {
		throw new Error(`Workbook archive exceeds the ${limits.maxEntries}-entry import limit.`);
	}
	let expandedBytes = 0;
	for (const entry of entries) {
		if (entry.dir) continue;
		expandedBytes += entry._data?.uncompressedSize ?? 0;
		if (expandedBytes <= limits.maxExpandedBytes) continue;
		throw new Error(`Workbook archive exceeds the ${limits.maxExpandedBytes}-byte expanded import limit.`);
	}
}

function readCellValue(cell: ExcelJS.Cell, diagnostics: string[]): unknown {
	const value = cell.value;
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value;
	if (typeof value !== 'object') return value;
	if ('result' in value) {
		diagnostics.push('Formula cells were imported using cached results; workbook formulas were not copied.');
		return value.result ?? null;
	}
	if ('hyperlink' in value) return value.hyperlink;
	if ('richText' in value) return value.richText.map((part) => part.text).join('');
	if ('text' in value) return value.text;
	return String(cell.text ?? '');
}
