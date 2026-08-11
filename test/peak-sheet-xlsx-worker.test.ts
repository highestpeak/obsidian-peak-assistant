import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import alias from 'esbuild-plugin-alias';
import ExcelJS from 'exceljs';

import { PeakSheetXlsxWorkerClient } from '@/app/sheet/PeakSheetXlsxWorkerClient';
import type { PeakSheetDatasetSnapshot } from '@/core/sheet';

const ROOT = process.cwd();

async function buildWorker(output: string): Promise<void> {
	await build({
		entryPoints: [path.join(ROOT, 'src/app/sheet/PeakSheetXlsxWorker.ts')],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: 'es2018',
		outfile: output,
		plugins: [alias({ '@': path.join(ROOT, 'src') })],
		logLevel: 'silent',
	});
}

async function testImportExportAndWorkerTermination(): Promise<void> {
	const directory = mkdtempSync(path.join(tmpdir(), 'peak-xlsx-worker-'));
	try {
		const workerPath = path.join(directory, 'peak-sheet-xlsx-worker.cjs');
		await buildWorker(workerPath);
		const client = new PeakSheetXlsxWorkerClient(workerPath);

		const source = new ExcelJS.Workbook();
		const worksheet = source.addWorksheet('Launch');
		worksheet.addRow(['Task', 'Priority']);
		worksheet.addRow(['Release', 9]);
		const encoded = await source.xlsx.writeBuffer();
		const preview = await client.preview(
			new Uint8Array(encoded as ArrayBuffer).buffer as ArrayBuffer,
			'Launch workbook',
		);
		assert.equal(preview.sheets[0].name, 'Launch');
		assert.ok(Object.values(preview.sheets[0].draft.rows[0].cells).includes(9));

		const snapshot: PeakSheetDatasetSnapshot = {
			schemaVersion: 1,
			datasetId: 'sheet-worker',
			name: 'Worker export',
			revision: 1,
			fields: [{ id: 'task', name: 'Task', type: 'text' }],
			rows: [{ id: 'row-1', cells: { task: 'Dispose ExcelJS' } }],
			views: [{ id: 'table-main', name: 'Table', type: 'table' }],
			createdAt: '2026-08-12T00:00:00.000Z',
			updatedAt: '2026-08-12T00:00:00.000Z',
		};
		const exported = await client.export(snapshot);
		const roundTrip = new ExcelJS.Workbook();
		await roundTrip.xlsx.load(exported as never);
		assert.equal(roundTrip.getWorksheet('Worker export')?.getCell('A2').value, 'Dispose ExcelJS');
		assert.equal(
			client.activeWorkerCount,
			0,
			'XLSX result must not resolve until its worker isolate has terminated',
		);

		client.dispose();
		await assert.rejects(client.preview(new ArrayBuffer(0)), /disposed/);
		assert.match(readFileSync(workerPath, 'utf8'), /PeakSheetXlsxImporter/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

testImportExportAndWorkerTermination()
	.then(() => console.log('peak sheet xlsx worker: passed'))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
