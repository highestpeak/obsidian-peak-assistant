import ExcelJS from 'exceljs';

import { exportPeakSheetCellValue } from '@/core/sheet';
import type { PeakSheetDatasetSnapshot } from '@/core/sheet';

export async function exportPeakSheetXlsx(snapshot: PeakSheetDatasetSnapshot): Promise<ArrayBuffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Peak Sheet';
	workbook.created = new Date(snapshot.createdAt);
	workbook.modified = new Date(snapshot.updatedAt);
	const worksheet = workbook.addWorksheet(safeWorksheetName(snapshot.name));
	worksheet.addRow(snapshot.fields.map((field) => field.name));
	for (const row of snapshot.rows) {
		worksheet.addRow(snapshot.fields.map((field) => exportPeakSheetCellValue(row.cells[field.id] ?? null)));
	}
	worksheet.getRow(1).font = { bold: true };
	for (let index = 0; index < snapshot.fields.length; index++) {
		worksheet.getColumn(index + 1).width = Math.max(10, Math.min(80, Math.round((snapshot.fields[index].width ?? 160) / 8)));
	}
	worksheet.views = [{ state: 'frozen', ySplit: 1 }];
	const encoded = await workbook.xlsx.writeBuffer();
	return encoded instanceof ArrayBuffer
		? encoded
		: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

function safeWorksheetName(name: string): string {
	return name.replace(/[\\/*?:\[\]]/g, '-').slice(0, 31) || 'Peak Sheet';
}
