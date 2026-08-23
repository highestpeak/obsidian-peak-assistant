import assert from 'node:assert/strict';

import {
	applyPeakSheetPatch,
	buildPeakSheetPasteOperations,
	computeSelectionStats,
	executePeakSheetAnalysis,
	parsePeakSheetCsv,
	parsePeakSheetJson,
	peakSheetCellKey,
	projectPeakSheetRows,
	serializePeakSheetSelection,
	validatePeakSheetSnapshot,
} from '@/core/sheet';
import type { PeakSheetDatasetSnapshot, PeakSheetRow } from '@/core/sheet';
import { HyperFormulaPeakSheetEngine } from '@/service/sheet/formula/HyperFormulaPeakSheetEngine';

function snapshot(rows: readonly PeakSheetRow[] = baseRows()): PeakSheetDatasetSnapshot {
	return {
		schemaVersion: 1, datasetId: 'sheet-test', name: 'Test', revision: 1,
		fields: [
			{ id: 'task', name: 'Task', type: 'text', width: 200 },
			{ id: 'area', name: 'Area', type: 'singleSelect', options: [{ id: 'UI', label: 'UI' }, { id: 'Agent', label: 'Agent' }] },
			{ id: 'priority', name: 'Priority', type: 'number' },
			{ id: 'done', name: 'Done', type: 'checkbox' },
			{ id: 'double', name: 'Double', type: 'number', formula: '=[Priority]*2' },
		],
		rows,
		views: [{ id: 'table-main', name: 'Table', type: 'table' }],
		createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
	};
}

function baseRows(): PeakSheetRow[] {
	return [
		{ id: 'r1', cells: { task: 'Polish UI', area: 'UI', priority: 2, done: false } },
		{ id: 'r2', cells: { task: 'Fix agent', area: 'Agent', priority: 5, done: true } },
	];
}

function testPatchInverseAndFormula(): void {
	const original = snapshot();
	validatePeakSheetSnapshot(original);
	const applied = applyPeakSheetPatch(original, {
		patchId: 'p1', datasetId: original.datasetId, baseRevision: 1,
		operations: [
			{ type: 'setCell', rowId: 'r1', fieldId: 'priority', value: 7 },
			{ type: 'renameField', fieldId: 'task', name: 'Work' },
			{ type: 'addRow', row: { id: 'r3', cells: { task: 'Ship', area: 'UI', priority: 9, done: false } } },
		],
		actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	});
	assert.equal(applied.snapshot.revision, 2);
	assert.equal(applied.snapshot.rows.length, 3);
	assert.equal(applied.snapshot.fields[0].name, 'Work');
	const restored = applyPeakSheetPatch(applied.snapshot, { ...applied.inverse, createdAt: '2026-08-10T02:00:00.000Z' }).snapshot;
	assert.deepEqual(restored.fields.map((field) => field.name), original.fields.map((field) => field.name));
	assert.deepEqual(restored.rows, original.rows);

	const resolved = new HyperFormulaPeakSheetEngine().resolve(applied.snapshot);
	assert.equal(resolved.rows.find((row) => row.id === 'r1')?.cells.double, 14);
	assert.equal(resolved.rows.find((row) => row.id === 'r2')?.cells.double, 10);
	const selected = new Set([peakSheetCellKey('r1', 'priority'), peakSheetCellKey('r1', 'done')]);
	assert.equal(serializePeakSheetSelection(original.rows, original.fields, selected, new Set()), '2\tfalse');
	assert.deepEqual(buildPeakSheetPasteOperations('11\ttrue', original.rows, original.fields, 0, 2), [
		{ type: 'setCell', rowId: 'r1', fieldId: 'priority', value: 11 },
		{ type: 'setCell', rowId: 'r1', fieldId: 'done', value: true },
	]);
	const formulaToggle = applyPeakSheetPatch(original, {
		patchId: 'p-formula', datasetId: original.datasetId, baseRevision: 1,
		operations: [{ type: 'setFieldFormula', fieldId: 'priority', formula: '=[Double]/2' }],
		actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	});
	const formulaRestored = applyPeakSheetPatch(formulaToggle.snapshot, formulaToggle.inverse).snapshot;
	assert.equal(formulaRestored.rows[0].cells.priority, 2, 'undoing formula mode restores raw values');
	const renamedFormula = applyPeakSheetPatch(original, {
		patchId: 'p-rename', datasetId: original.datasetId, baseRevision: 1,
		operations: [{ type: 'renameField', fieldId: 'priority', name: 'Rank' }],
		actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	}).snapshot;
	assert.equal(renamedFormula.fields.find((field) => field.id === 'double')?.formula, '=[Rank]*2');
	const changedOptions = applyPeakSheetPatch(original, {
		patchId: 'p-options', datasetId: original.datasetId, baseRevision: 1,
		operations: [{ type: 'setFieldOptions', fieldId: 'area', options: [{ id: 'UI', label: 'Interface' }, { id: 'Agent', label: 'Agent' }] }],
		actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	});
	assert.equal(changedOptions.snapshot.fields.find((field) => field.id === 'area')?.options?.[0].label, 'Interface');
	assert.deepEqual(applyPeakSheetPatch(changedOptions.snapshot, changedOptions.inverse).snapshot.fields.find((field) => field.id === 'area')?.options, original.fields.find((field) => field.id === 'area')?.options);
	const withBoard: PeakSheetDatasetSnapshot = { ...original, views: [...original.views, { id: 'board', name: 'Board', type: 'board', laneFieldId: 'area', titleFieldId: 'task' }] };
	const deletedField = applyPeakSheetPatch(withBoard, {
		patchId: 'p-delete-field', datasetId: withBoard.datasetId, baseRevision: 1,
		operations: [{ type: 'deleteField', fieldId: 'area' }], actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	});
	assert.equal(deletedField.snapshot.views.some((view) => view.id === 'board'), false);
	const fieldRestored = applyPeakSheetPatch(deletedField.snapshot, deletedField.inverse).snapshot;
	assert.deepEqual(fieldRestored.views, withBoard.views, 'undoing field deletion restores dependent views');
	console.log('PASS: Peak Sheet patch inversion and HyperFormula resolution');
}

function testQueryAnalysisAndPerformance(): void {
	const rows = Array.from({ length: 500 }, (_, index): PeakSheetRow => ({
		id: `row-${index}`,
		cells: { task: `Task ${index}`, area: index % 2 ? 'Agent' : 'UI', priority: index, done: index % 3 === 0 },
	}));
	const source = snapshot(rows);
	const filtered = projectPeakSheetRows(source, {
		conjunction: 'all', rules: [{ id: 'f1', fieldId: 'area', operator: 'equals', value: 'UI' }],
	});
	assert.equal(filtered.length, 250);
	assert.deepEqual(computeSelectionStats([1, 2, 3, null]), { count: 3, numericCount: 3, sum: 6, average: 2, min: 1, max: 3 });
	const result = executePeakSheetAnalysis(source, {
		planId: 'analysis-1', datasetId: source.datasetId, baseRevision: 1,
		steps: [
			{ op: 'filter', filters: { conjunction: 'all', rules: [{ id: 'f1', fieldId: 'done', operator: 'equals', value: false }] } },
			{ op: 'group', fieldId: 'area' },
			{ op: 'aggregate', metrics: [{ id: 'average-priority', fieldId: 'priority', operation: 'average' }] },
			{ op: 'chart', chartType: 'bar', categoryFieldId: 'area', metrics: [{ id: 'count', operation: 'count' }] },
		],
	}, new HyperFormulaPeakSheetEngine());
	assert.equal(result.rows.length, 333);
	assert.equal(result.groups?.length, 2);
	assert.equal(result.chart?.points.length, 2);
	console.log('PASS: Peak Sheet 500-row filter, aggregation and chart analysis');
}

function testImports(): void {
	const csv = parsePeakSheetCsv('Task,Priority,Done,Due\nShip,1,true,2026-08-20\n"Fix, parser",2,false,2026-08-21\n', 'CSV');
	assert.equal(csv.rows.length, 2);
	assert.equal(csv.fields[1].type, 'number');
	assert.equal(csv.fields[2].type, 'checkbox');
	assert.equal(csv.fields[3].type, 'date');
	assert.equal(csv.rows[1].cells[csv.fields[0].id], 'Fix, parser');
	const json = parsePeakSheetJson('[{"name":"Launch","score":9,"ready":true}]', 'JSON');
	assert.equal(json.rows.length, 1);
	assert.deepEqual(json.fields.map((field) => field.type), ['text', 'number', 'checkbox']);
	assert.throws(() => parsePeakSheetJson('[{"nested":{"bad":true}}]'), /flat objects/);
	console.log('PASS: Peak Sheet CSV and flat JSON import');
}

function testMultiGroupAndSavedScripts(): void {
	const original = snapshot();
	const now = '2026-08-24T00:00:00.000Z';
	const applied = applyPeakSheetPatch(original, {
		patchId: 'p-script', datasetId: original.datasetId, baseRevision: original.revision,
		operations: [
			{ type: 'upsertView', view: { id: 'table-main', name: 'Table', type: 'table', groupByFields: ['area', 'done'] } },
			{ type: 'upsertScript', script: { id: 'risk', name: 'Risk count', summary: 'Area to count', steps: [{ op: 'group', fieldId: 'area' }], createdAt: now, updatedAt: now } },
			{ type: 'appendScriptRun', run: { id: 'run-1', scriptId: 'risk', scope: 'all', baseRevision: 1, resultRevision: 1, changedRows: 0, unchangedRows: 2, failedRows: 0, diagnostics: [], completedAt: now } },
		],
		actor: { kind: 'user' }, createdAt: now,
	});
	const table = applied.snapshot.views[0];
	assert.equal(table.type, 'table');
	if (table.type === 'table') assert.deepEqual(table.groupByFields, ['area', 'done']);
	assert.equal(applied.snapshot.scripts?.[0]?.name, 'Risk count');
	assert.equal(applied.snapshot.scriptRuns?.[0]?.unchangedRows, 2);
	const restored = applyPeakSheetPatch(applied.snapshot, applied.inverse).snapshot;
	assert.equal(restored.scripts?.length ?? 0, 0);
	assert.equal(restored.scriptRuns?.length ?? 0, 0);
	console.log('PASS: Peak Sheet ordered grouping and saved declarative script history');
}

testPatchInverseAndFormula();
testQueryAnalysisAndPerformance();
testImports();
testMultiGroupAndSavedScripts();
