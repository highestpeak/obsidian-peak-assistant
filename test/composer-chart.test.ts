/**
 * Peak Composer — chart spec model (WP6, CMP-CHART-01..02).
 *
 * Pure logic (no recharts, no DOM):
 *   - fenced ```chart parse/validate + serialize round-trip;
 *   - table → chart spec derivation (first column = x, numeric columns = series);
 *   - fails closed when there is no numeric column;
 *   - bar/line/pie type switch preserves the rest of the spec + writes back to
 *     valid fenced source;
 *   - chart-source materializer (deterministic table-derived + AI JSON) + insert
 *     writeback (chart is an independent block, never rewrites the table).
 */

import {
	CHART_PALETTE,
	chartSpecToFencedSource,
	extractChartBody,
	isChartSource,
	parseChartJson,
	parseChartSource,
	pipeToModel,
	seriesColor,
	switchChartType,
	tableToChartSpec,
} from '@/service/composer';
import {
	createChartSourceMaterializer,
	createChartSourceWritebackAdapter,
} from '@/service/composer';
import type { ComposerCapabilityDefinition, ComposerContextSnapshot } from '@/core/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const TABLE = ['| Week | Capture | Output |', '| --- | --- | --- |', '| W1 | 12 | 3 |', '| W2 | 18 | 7 |', '| W3 | 9 | 5 |'].join('\n');

// ── fenced source parse/serialize ────────────────────────────────────────────
{
	const spec = { type: 'bar' as const, title: 'T', x: 'week', series: [{ key: 'v', label: 'V' }], data: [{ week: 'W1', v: 3 }] };
	const fenced = chartSpecToFencedSource(spec);
	check('serialize produces fenced chart block', isChartSource(fenced) && fenced.startsWith('```chart'));
	const parsed = parseChartSource(fenced);
	check('parse fenced chart back to spec', parsed.ok && parsed.spec.type === 'bar' && parsed.spec.x === 'week');
	check('extractChartBody returns JSON body', (extractChartBody(fenced) ?? '').includes('"type"'));
	check('non-chart source rejected', !isChartSource('```js\nx\n```') && extractChartBody('```js\nx\n```') === null);
	const bad = parseChartJson('{ not json');
	check('invalid JSON fails closed with reason', !bad.ok && bad.reason.length > 0);
	const badSpec = parseChartJson(JSON.stringify({ type: 'bar', x: 'w', series: [], data: [] }));
	check('empty series rejected by schema', !badSpec.ok);
}

// ── table → chart ────────────────────────────────────────────────────────────
{
	const derived = tableToChartSpec(pipeToModel(TABLE), 'bar', 'Weekly');
	check('table→chart ok', derived.ok);
	if (derived.ok) {
		check('x is first column header', derived.spec.x === 'Week');
		check('numeric columns become series', derived.spec.series.length === 2 && derived.spec.series[0].key === 'Capture');
		check('series colors from palette', derived.spec.series[0].color === CHART_PALETTE[0]);
		check('data rows carry x + numeric values', derived.spec.data.length === 3 && derived.spec.data[0].Capture === 12 && derived.spec.data[0].Week === 'W1');
		check('title carried', derived.spec.title === 'Weekly');
		check('seriesColor resolves', seriesColor(derived.spec, 1) === CHART_PALETTE[1]);
	}
	// no numeric column → fail closed
	const textOnly = pipeToModel(['| A | B |', '| --- | --- |', '| x | y |'].join('\n'));
	const failed = tableToChartSpec(textOnly);
	check('no numeric column fails closed with reason', !failed.ok && /numeric/.test(failed.ok ? '' : failed.reason));
}

// ── type switch ──────────────────────────────────────────────────────────────
{
	const derived = tableToChartSpec(pipeToModel(TABLE), 'bar');
	if (derived.ok) {
		const line = switchChartType(derived.spec, 'line');
		check('switch to line', line.type === 'line' && line.series.length === derived.spec.series.length && line.x === derived.spec.x);
		const pie = switchChartType(derived.spec, 'pie');
		check('switch to pie preserves data', pie.type === 'pie' && pie.data.length === derived.spec.data.length);
		check('switched spec re-serializes to valid fenced source', parseChartSource(chartSpecToFencedSource(line)).ok);
	}
}

// ── chart-source materializer + writeback ────────────────────────────────────
{
	const snapshot: ComposerContextSnapshot = {
		documentId: 'd',
		revision: 'r0',
		target: { kind: 'block', blockId: 'b1' },
		targetSource: TABLE,
	};
	const def = { rendererId: 'composer.renderer.streaming-text', writebackAdapterId: 'composer.writeback.chart-source' } as unknown as ComposerCapabilityDefinition;
	const mat = createChartSourceMaterializer();
	const wb = createChartSourceWritebackAdapter();

	// deterministic path: empty text → derive from the table
	const env = mat.materialize({ definition: def, snapshot, text: '' });
	check('materializer derives chart from table when text empty', env.resultKind === 'chart-source' && isChartSource((env.payload as { fencedSource: string }).fencedSource));

	// AI path: streamed JSON spec
	const aiSpec = JSON.stringify({ type: 'line', x: 'Week', series: [{ key: 'Capture' }], data: [{ Week: 'W1', Capture: 12 }] });
	const env2 = mat.materialize({ definition: def, snapshot, text: aiSpec });
	check('materializer accepts AI JSON spec', (env2.payload as { spec: { type: string } }).spec.type === 'line');

	// writeback inserts a new block (never rewrites the table)
	const ops = wb.buildOperations(env, { target: snapshot.target, anchor: { from: 0, to: TABLE.length } });
	check('chart writeback → insertBlock (independent block)', ops.length === 1 && ops[0].kind === 'insertBlock');
	check('chart writeback does NOT replace the table', !ops.some((o) => o.kind === 'replaceRange'));

	let failedClosed = false;
	try {
		wb.buildOperations(env, { target: snapshot.target });
	} catch {
		failedClosed = true;
	}
	check('chart writeback fails closed without anchor', failedClosed);
}

done('composer-chart');
