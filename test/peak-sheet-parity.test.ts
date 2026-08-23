import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { PeakSheetDatasetSnapshot } from '@/core/sheet';
import {
	buildPeakSheetMaterializeOperations,
	normalizePeakSheetInput,
	peakSheetColumnName,
	peakSheetRangeLabel,
} from '@/ui/view/peak-sheet/PeakSheetGridState';

const blank: PeakSheetDatasetSnapshot = {
	format: 'peak-sheet', version: 2, datasetId: 'blank', name: 'Blank', revision: 1,
	fields: [], rows: [], views: [{ id: 'table', name: 'Table', type: 'table' }],
	createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
};

function testVirtualGridMaterialization(): void {
	assert.equal(peakSheetColumnName(0), 'A');
	assert.equal(peakSheetColumnName(25), 'Z');
	assert.equal(peakSheetColumnName(26), 'AA');
	assert.equal(peakSheetRangeLabel({ top: 1, bottom: 3, left: 1, right: 4 }), 'B2:E4');
	const operations = buildPeakSheetMaterializeOperations(blank, 2, 2, 'Pasted value');
	assert.equal(operations.filter((operation) => operation.type === 'addField').length, 3);
	assert.equal(operations.filter((operation) => operation.type === 'addRow').length, 3);
	assert.equal(operations.at(-1)?.type, 'setCell');
	assert.deepEqual(normalizePeakSheetInput('Assets/demo.png', { id: 'file', name: 'File', type: 'file' }), { kind: 'vault', vaultPath: 'Assets/demo.png' });
}

function testReferenceGeometryContract(): void {
	const root = process.cwd();
	const css = fs.readFileSync(path.join(root, 'src/styles/peak-sheet.css'), 'utf8');
	const view = fs.readFileSync(path.join(root, 'src/ui/view/peak-sheet/PeakSheet.tsx'), 'utf8');
	const table = fs.readFileSync(path.join(root, 'src/ui/view/peak-sheet/PeakSheetTable.tsx'), 'utf8');
	assert.match(css, /grid-template-rows: 66px 39px 39px 33px minmax\(0, 1fr\) 27px/);
	assert.match(css, /grid-template-columns: 50px 36px minmax\(0, 1fr\)/);
	assert.match(css, /width: min\(440px, calc\(100% - 20px\)\)/);
	assert.match(view, /mode="table"[\s\S]*mode="board"[\s\S]*mode="calendar"/);
	assert.match(view, /formulaFocused && formulaDraft\.trim\(\)/);
	assert.match(table, /onContextMenu/);
	assert.doesNotMatch(table, /Create typed field|Field name/);
}

testVirtualGridMaterialization();
testReferenceGeometryContract();
console.log('PASS: Peak Sheet Mock parity geometry and virtual materialization contracts');
