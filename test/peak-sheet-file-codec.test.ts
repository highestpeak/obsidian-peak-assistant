import assert from 'node:assert/strict';

import {
	fingerprintPeakSheetContent,
	parsePeakSheetFile,
	parsePeakSheetFileOrLegacy,
	serializePeakSheetFile,
	serializePeakSheetCsv,
} from '@/core/sheet';
import type { PeakSheetDatasetSnapshot } from '@/core/sheet';

const snapshot: PeakSheetDatasetSnapshot = {
	schemaVersion: 1,
	datasetId: 'sheet-file-native',
	name: 'Legacy title',
	revision: 3,
	fields: [{ id: 'task', name: 'Task', type: 'text', width: 220 }],
	rows: [{ id: 'row-1', cells: { task: 'Ship file-native Sheet' } }],
	views: [{ id: 'table-main', name: 'Table', type: 'table' }],
	scripts: [{ id: 'count', name: 'Count', summary: 'Count rows', steps: [{ op: 'aggregate', metrics: [{ id: 'count', operation: 'count' }] }], createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' }],
	scriptRuns: [],
	createdAt: '2026-08-11T00:00:00.000Z',
	updatedAt: '2026-08-11T00:01:00.000Z',
};

async function run(): Promise<void> {
	const text = serializePeakSheetFile(snapshot);
	const parsedJson = JSON.parse(text) as Record<string, unknown>;
	assert.equal(parsedJson.format, 'peak-sheet');
	assert.equal(parsedJson.schemaVersion, 2);
	assert.equal(parsedJson.name, undefined);
	assert.equal(parsedJson.deletedAt, undefined);

	const restored = parsePeakSheetFile(text, 'Projects/Launch Tracker.peaksheet');
	assert.equal(restored.name, 'Launch Tracker');
	assert.equal(restored.datasetId, snapshot.datasetId);
	assert.deepEqual(restored.rows, snapshot.rows);
	assert.deepEqual(restored.scripts, snapshot.scripts);

	const legacy = parsePeakSheetFileOrLegacy(JSON.stringify(snapshot), 'Archive/Renamed.peaksheet');
	assert.equal(legacy.name, 'Renamed');
	assert.equal(legacy.deletedAt, undefined);
	assert.throws(
		() => parsePeakSheetFile('{"format":"peak-sheet","schemaVersion":99}', 'Bad.peaksheet'),
		/Unsupported Peak Sheet file schema/,
	);
	assert.equal(await fingerprintPeakSheetContent(text), await fingerprintPeakSheetContent(text));
	assert.equal(serializePeakSheetCsv(snapshot), 'Task\r\nShip file-native Sheet\r\n');
	console.log('PASS: Peak Sheet file codec and title ownership');
}

void run();
