/**
 * Peak Composer — TableModel round-trip, merge, HTML upgrade/downgrade, CSV,
 * deterministic ops and typed table-patch plumbing (WP6, CMP-TABLE-01..05/07).
 *
 * Pure service-layer logic (no DOM): parse5 backs HTML parsing (service/tests),
 * mirroring the production renderer's DOMParser port. Covers:
 *   - pipe ⇄ model byte-exact round-trip (align colons, `\|` escape, inline md);
 *   - merge → one-way HTML upgrade; HTML round-trip keeps rowspan/colspan;
 *   - safe-downgrade predicate (merge / multi-header / align-conflict block it);
 *   - deterministic ops with merge-aware guards + reason strings;
 *   - CSV export/import escaping;
 *   - table-patch materializer (typed patch → resolved source) + writeback ops.
 */

import {
	addColumn,
	addRow,
	canDowngradeToPipe,
	colCount,
	createParse5HtmlPort,
	csvToModel,
	hasMerges,
	htmlToModel,
	mergeRange,
	modelToCsv,
	modelToHtml,
	modelToPipe,
	pipeToModel,
	removeColumn,
	removeRow,
	resolveGrid,
	serializeTable,
	sortByColumn,
	transpose,
	unmergeAt,
} from '@/service/composer';
import {
	applyTablePatch,
	createTablePatchMaterializer,
	createTablePatchWritebackAdapter,
	parseTableSource,
	serializeTableSource,
} from '@/service/composer';
import type { ComposerCapabilityDefinition, ComposerContextSnapshot } from '@/core/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const port = createParse5HtmlPort();

const PIPE_CANON = ['| Name | Qty | Note |', '| :-- | --: | :-: |', '| a \\| b | 12 | **hi** |', '| `x` | 3 | [l](u) |'].join('\n');
const GRID3x3 = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |'].join('\n');

const gridText = (m: ReturnType<typeof pipeToModel>): string =>
	resolveGrid(m).grid
		.map((r) => r.map((g) => (g?.anchor ? `[${g.cell.text}|${g.cell.colspan}x${g.cell.rowspan}]` : '·')).join(''))
		.join('\n');

// ── 1. pipe round-trip ──────────────────────────────────────────────────────
{
	const m = pipeToModel(PIPE_CANON);
	check('pipe→model→pipe byte-exact', modelToPipe(m) === PIPE_CANON);
	check('escaped pipe decoded to logical "|"', m.rows[1].cells[0].text === 'a | b');
	check('column alignment parsed', JSON.stringify(m.columns.map((c) => c.align)) === JSON.stringify(['left', 'right', 'center']));
	const messy = ['|Name|Qty|', '|:----:|---|', '|  a  |  b  |'].join('\n');
	const once = modelToPipe(pipeToModel(messy));
	const twice = modelToPipe(pipeToModel(once));
	check('serializer idempotent on messy input', once === twice);
}

// ── 2. merge + HTML round-trip ──────────────────────────────────────────────
{
	const merged = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 1 });
	check('merge 2x2 rectangle ok', merged.ok, merged.ok ? '' : merged.reason);
	if (merged.ok) {
		check('merged model has spans', hasMerges(merged.model));
		const g = resolveGrid(merged.model);
		check('anchor colspan/rowspan set', g.grid[1][0]?.cell.colspan === 2 && g.grid[1][0]?.cell.rowspan === 2);
		check('covered cell not an anchor', g.grid[2][1]?.anchor === false);
		let threw = false;
		try {
			modelToPipe(merged.model);
		} catch {
			threw = true;
		}
		check('merged model refuses pipe (one-way upgrade)', threw);
		const html1 = modelToHtml(merged.model);
		const back = htmlToModel(html1, port);
		const html2 = modelToHtml(back);
		check('HTML byte round-trip', html1 === html2);
		check('grid structure preserved through HTML', gridText(merged.model) === gridText(back));
	}

	const headerMerge = mergeRange(pipeToModel(GRID3x3), { r0: 0, c0: 0, r1: 0, c1: 2 });
	check('colspan-only header merge ok', headerMerge.ok && resolveGrid(headerMerge.model).grid[0][0]?.cell.colspan === 3);

	const crossSection = mergeRange(pipeToModel(GRID3x3), { r0: 0, c0: 0, r1: 1, c1: 0 });
	check('merge crossing header/body rejected', !crossSection.ok && /boundary/.test(crossSection.ok ? '' : crossSection.reason));

	if (merged.ok) {
		const onExisting = mergeRange(merged.model, { r0: 1, c0: 0, r1: 2, c1: 2 });
		check('merge onto existing span rejected', !onExisting.ok && /clean rectangle|part of a merge/.test(onExisting.ok ? '' : onExisting.reason));
		const un = unmergeAt(merged.model, 1, 0);
		check('unmerge restores span-1 cells', un.ok && !hasMerges(un.model));
		if (un.ok) {
			const g = resolveGrid(un.model);
			check('unmerge keeps anchor text, empties freed', g.grid[1][0]?.cell.text === '1' && g.grid[2][1]?.cell.text === '');
		}
	}

	// complex HTML with mixed spans, byte-exact re-serialize
	const complex =
		'<table><thead><tr><th colspan="2">Head</th><th>C</th></tr></thead>' +
		'<tbody><tr><td rowspan="2">L</td><td>x</td><td>y</td></tr><tr><td>z</td><td>w</td></tr></tbody></table>';
	const cm = htmlToModel(complex, port);
	check('complex HTML re-serializes losslessly', modelToHtml(cm) === complex);
	const cg = resolveGrid(cm);
	check('complex spans resolved', cg.grid[0][0]?.cell.colspan === 2 && cg.grid[1][0]?.cell.rowspan === 2 && cg.grid[2][0]?.anchor === false);
}

// ── 3. safe downgrade ───────────────────────────────────────────────────────
{
	check('plain grid downgradable', canDowngradeToPipe(pipeToModel(GRID3x3)).downgradable);
	const merged = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 1 });
	if (merged.ok) {
		const v = canDowngradeToPipe(merged.model);
		check('merged NOT downgradable', !v.downgradable && /merged/.test(v.downgradable ? '' : v.reason));
	}
	const alignHtml =
		'<table><thead><tr><th align="left">A</th><th>B</th></tr></thead>' +
		'<tbody><tr><td align="left">1</td><td>2</td></tr></tbody></table>';
	const am = htmlToModel(alignHtml, port);
	check('HTML w/o merges downgrades to pipe', canDowngradeToPipe(am).downgradable);
	check('downgraded pipe carries alignment', /\| :-- \| --- \|/.test(modelToPipe(am)));
	const conflict =
		'<table><thead><tr><th align="left">A</th><th>B</th></tr></thead>' +
		'<tbody><tr><td align="right">1</td><td>2</td></tr></tbody></table>';
	check('per-cell align conflict blocks downgrade', !canDowngradeToPipe(htmlToModel(conflict, port)).downgradable);
	// serializeTable picks the narrowest lossless form
	const mergedSerial = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 1 });
	if (mergedSerial.ok) {
		check('serializeTable → HTML when merged', serializeTable(mergedSerial.model, modelToHtml).startsWith('<table>'));
	}
	check('serializeTable → pipe when plain', serializeTable(pipeToModel(GRID3x3), modelToHtml) === GRID3x3);
}

// ── 4. deterministic ops with merge-aware guards ────────────────────────────
{
	const added = addRow(pipeToModel(GRID3x3), 2);
	check('addRow inserts an empty row', added.ok && added.model.rows.length === 4);
	if (added.ok) {
		const removed = removeRow(added.model, 2);
		check('removeRow removes it', removed.ok && removed.model.rows.length === 3);
	}
	check('removeRow refuses header', !removeRow(pipeToModel(GRID3x3), 0).ok);

	const vMerge = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 0 });
	if (vMerge.ok) {
		const rr = removeRow(vMerge.model, 1);
		check('removeRow blocked inside vertical merge (reason)', !rr.ok && /vertical merge/.test(rr.ok ? '' : rr.reason));
		const ar = addRow(vMerge.model, 2);
		check('addRow blocked splitting vertical merge (reason)', !ar.ok && /splits a vertical merge/.test(ar.ok ? '' : ar.reason));
	}

	const ac = addColumn(pipeToModel(GRID3x3), 1);
	check('addColumn adds empty column', ac.ok && colCount(ac.model) === 4 && ac.model.rows[1].cells[1].text === '');
	if (ac.ok) check('removeColumn removes it', removeColumn(ac.model, 1).ok && colCount(removeColumn(ac.model, 1).ok ? (removeColumn(ac.model, 1) as { model: typeof ac.model }).model : ac.model) === 3);
	const hMerge = mergeRange(pipeToModel(GRID3x3), { r0: 0, c0: 0, r1: 0, c1: 1 });
	if (hMerge.ok) check('removeColumn blocked inside horizontal merge (reason)', !removeColumn(hMerge.model, 0).ok);

	const sortSrc = ['| K | V |', '| --- | --- |', '| a | 10 |', '| b | 2 |', '| c | 30 |'].join('\n');
	const sorted = sortByColumn(pipeToModel(sortSrc), 1, 'asc');
	check('numeric sort ascending', sorted.ok && JSON.stringify(sorted.model.rows.slice(1).map((r) => r.cells[1].text)) === JSON.stringify(['2', '10', '30']));
	const mergedSort = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 1 });
	if (mergedSort.ok) check('sort disabled with merges (reason)', !sortByColumn(mergedSort.model, 0).ok);

	const t = transpose(pipeToModel(GRID3x3));
	check('transpose plain grid', t.ok && t.model.rows.length === 3 && t.model.rows[0].cells.map((c) => c.text).join(',') === 'A,1,4');
	if (mergedSort.ok) check('transpose disabled with merges (reason)', !transpose(mergedSort.model).ok);
}

// ── 5. CSV ──────────────────────────────────────────────────────────────────
{
	const csvSrc = ['| A | B |', '| --- | --- |', '| x,y | he said "hi" |'].join('\n');
	const out = modelToCsv(pipeToModel(csvSrc));
	check('CSV export escapes comma/quote (RFC4180)', out.ok && out.csv === 'A,B\r\n"x,y","he said ""hi"""');
	const back = csvToModel('A,B\r\n"x,y","he said ""hi"""');
	check('CSV import round-trips quoted fields', back.rows[1].cells[0].text === 'x,y' && back.rows[1].cells[1].text === 'he said "hi"' && back.rows[0].isHeader);
	const mergedCsv = mergeRange(pipeToModel(GRID3x3), { r0: 1, c0: 0, r1: 2, c1: 1 });
	if (mergedCsv.ok) check('CSV export disabled with merges', !modelToCsv(mergedCsv.model).ok);
}

// ── 6. typed table-patch materializer + writeback ───────────────────────────
{
	const snapshot: ComposerContextSnapshot = {
		documentId: 'd',
		revision: 'r0',
		target: { kind: 'block', blockId: 'b1' },
		targetSource: GRID3x3,
	};
	const def = { rendererId: 'composer.renderer.streaming-text', writebackAdapterId: 'composer.writeback.table-patch' } as unknown as ComposerCapabilityDefinition;
	const mat = createTablePatchMaterializer();
	const wb = createTablePatchWritebackAdapter();

	// replace-cell
	const env1 = mat.materialize({ definition: def, snapshot, text: JSON.stringify({ op: 'replace-cell', row: 1, col: 1, text: '99' }) });
	check('table-patch replace-cell resolves new source', /\| 1 \| 99 \| 3 \|/.test((env1.payload as { replacement: string }).replacement));
	const ops1 = wb.buildOperations(env1, { target: snapshot.target, anchor: { from: 0, to: GRID3x3.length } });
	check('table-patch writeback → one replaceRange', ops1.length === 1 && ops1[0].kind === 'replaceRange');

	// set-column append (补一列)
	const env2 = mat.materialize({ definition: def, snapshot, text: JSON.stringify({ op: 'set-column', col: 3, header: 'D', cells: ['7', '8'] }) });
	const rep2 = (env2.payload as { replacement: string }).replacement;
	check('table-patch set-column appends column', /\| A \| B \| C \| D \|/.test(rep2) && /\| 1 \| 2 \| 3 \| 7 \|/.test(rep2));

	// replace-table
	const env3 = mat.materialize({ definition: def, snapshot, text: JSON.stringify({ op: 'replace-table', grid: [['H1', 'H2'], ['1', '2']], align: ['left', 'right'] }) });
	const rep3 = (env3.payload as { replacement: string }).replacement;
	check('table-patch replace-table rebuilds grid + align', /\| H1 \| H2 \|/.test(rep3) && /\| :-- \| --: \|/.test(rep3));

	// direct model helpers (apply + serialize round-trip through parseTableSource)
	const model = parseTableSource(GRID3x3);
	const applied = applyTablePatch(model, { op: 'replace-cell', row: 2, col: 0, text: 'ZZ' });
	check('applyTablePatch replace-cell', applied.ok && /\| ZZ \| 5 \| 6 \|/.test(serializeTableSource(applied.ok ? applied.model : model)));

	// writeback fails closed without an anchor
	let failedClosed = false;
	try {
		wb.buildOperations(env1, { target: snapshot.target });
	} catch {
		failedClosed = true;
	}
	check('table-patch writeback fails closed without anchor', failedClosed);
}

done('composer-table-merge-html');
