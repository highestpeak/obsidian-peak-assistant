import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import {
	assertPeakSheetXlsxArchiveBounds,
	parsePeakSheetXlsx,
} from '@/service/sheet/import/PeakSheetXlsxImporter';

async function testXlsxImport(): Promise<void> {
	const source = new ExcelJS.Workbook();
	const tasks = source.addWorksheet('Tasks');
	tasks.addRow(['Task', 'Score', 'Ready']);
	tasks.addRow(['Ship', 9, true]);
	tasks.addRow(['Polish', 7, false]);
	const content = source.addWorksheet('Content');
	content.addRow(['Topic', 'Publish Date']);
	content.addRow(['Launch', new Date('2026-08-20T00:00:00.000Z')]);
	const encoded = await source.xlsx.writeBuffer();
	const buffer = new Uint8Array(encoded as ArrayBuffer).buffer as ArrayBuffer;
	const imported = await parsePeakSheetXlsx(buffer, 'Launch workbook');
	assert.equal(imported.sheets.length, 2);
	assert.equal(imported.sheets[0].draft.rows.length, 2);
	assert.deepEqual(imported.sheets[0].draft.fields.map((field) => field.type), ['text', 'number', 'checkbox']);
	assert.equal(imported.sheets[1].draft.fields[1].type, 'date');
	assert.match(imported.diagnostics.join(' '), /conditional formatting/);

	const oversizedArchive = new JSZip();
	oversizedArchive.file('expanded.txt', 'x'.repeat(1_024));
	const oversizedEncoded = await oversizedArchive.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
	await assert.rejects(
		() => assertPeakSheetXlsxArchiveBounds(oversizedEncoded, { maxEntries: 10, maxExpandedBytes: 128 }),
		/expanded import limit/,
	);
	console.log('PASS: Peak Sheet bounded multi-worksheet XLSX import');
}

testXlsxImport().catch((error) => { console.error(error); process.exit(1); });
