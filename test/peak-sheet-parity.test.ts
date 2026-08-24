import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPeakSheetPatch } from '@/core/sheet';
import type { PeakSheetDatasetSnapshot } from '@/core/sheet';
import {
	buildPeakSheetMaterializeOperations,
	buildPeakSheetMatrixPasteOperations,
	normalizePeakSheetInput,
	parsePeakSheetClipboardText,
	peakSheetColumnName,
	peakSheetRangeLabel,
} from '@/ui/view/peak-sheet/PeakSheetGridState';

const blank: PeakSheetDatasetSnapshot = {
	format: 'peak-sheet', version: 2, schemaVersion: 1, datasetId: 'blank', name: 'Blank', revision: 1,
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
	const matrix = parsePeakSheetClipboardText('Task\tStatus\tDue Date\nShip beta\tDoing\t2026-08-24\nFix paste\tTodo\t2026-08-25\n');
	assert.deepEqual(matrix, [
		['Task', 'Status', 'Due Date'],
		['Ship beta', 'Doing', '2026-08-24'],
		['Fix paste', 'Todo', '2026-08-25'],
	]);
	const paste = buildPeakSheetMatrixPasteOperations(blank, [], [], 3, 2, matrix);
	assert.equal(paste.filter((operation) => operation.type === 'addField').length, 5, 'pasting at C4 materializes A:E exactly once');
	assert.equal(paste.filter((operation) => operation.type === 'addRow').length, 6, 'pasting three rows at row 4 materializes rows 1:6 exactly once');
	const cells = paste.filter((operation) => operation.type === 'setCell');
	assert.equal(cells.length, 9);
	assert.equal(new Set(cells.map((operation) => operation.type === 'setCell' ? operation.rowId : '')).size, 3, 'each pasted matrix row shares one stable row id');
	assert.equal(new Set(cells.map((operation) => operation.type === 'setCell' ? operation.fieldId : '')).size, 3, 'each pasted matrix column shares one stable field id');
	const applied = applyPeakSheetPatch(blank, {
		patchId: 'paste-matrix', datasetId: blank.datasetId, baseRevision: blank.revision,
		operations: paste, actor: { kind: 'user' }, createdAt: '2026-08-24T00:01:00.000Z',
	}).snapshot;
	assert.deepEqual(applied.rows.slice(3, 6).map((row) => applied.fields.slice(2, 5).map((field) => row.cells[field.id])), matrix);
}

function testReferenceGeometryContract(): void {
	const root = process.cwd();
	const css = fs.readFileSync(path.join(root, 'src/styles/peak-sheet.css'), 'utf8');
	const view = fs.readFileSync(path.join(root, 'src/ui/view/peak-sheet/PeakSheet.tsx'), 'utf8');
	const table = fs.readFileSync(path.join(root, 'src/ui/view/peak-sheet/PeakSheetTable.tsx'), 'utf8');
	assert.match(css, /grid-template-rows: 66px 39px 39px 33px minmax\(0, 1fr\) 27px/);
	assert.match(css, /grid-template-columns: 50px 36px minmax\(0, 1fr\)/);
	assert.match(css, /--ps-accent: #6f52b5/);
	assert.match(css, /\.peak-sheet-virtual-grid-note \{ position: sticky;[\s\S]*height: 30px/);
	assert.match(css, /\.peak-sheet-ai-drawer \{ top: 151px; width: min\(440px/);
	assert.match(css, /\.peak-sheet-scripts-drawer \{ top: 112px; width: min\(408px/);
	assert.match(css, /width: min\(440px, calc\(100% - 20px\)\)/);
	assert.match(view, /mode="table"[\s\S]*mode="board"[\s\S]*mode="calendar"/);
	assert.match(view, /formulaFocused && formulaDraft\.trim\(\)/);
	assert.match(table, /onContextMenu/);
	assert.doesNotMatch(table, /Create typed field|Field name/);
}

testVirtualGridMaterialization();
testReferenceGeometryContract();
console.log('PASS: Peak Sheet Mock parity geometry and virtual materialization contracts');
