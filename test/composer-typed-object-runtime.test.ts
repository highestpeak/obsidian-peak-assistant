/**
 * Peak Composer — typed-object AI generation path (WP-INT, table + chart).
 *
 * Drives the REAL production capability composition
 * (`composeComposerCapabilityRuntime`) over a fake executor port to lock the
 * table/chart AI wiring end to end:
 *
 *   - the composition's `registry.validateBindings` accepts the table + chart
 *     packs (no throw at compose time ⇒ every result kind has a materializer and
 *     every writeback adapter id resolves);
 *   - the five table/chart AI actions project onto a table block's object
 *     toolbar as `ai` actions with a targeted-instruction affordance;
 *   - a typed-object run streams JSON that is NEVER surfaced as the candidate
 *     body (skeleton only), then materializes on completion into a typed
 *     table-patch variant; accept writes the exact materialized bytes;
 *   - a bad-JSON run fails closed: the candidate lands in the error state and
 *     nothing is written back;
 *   - a chart-source run inserts an independent fenced chart block below the
 *     table (never rewrites the table).
 */

import { composeComposerCapabilityRuntime } from '@/app/composer/capabilities/composeComposerCapabilityRuntime';
import type { ComposerResultEnvelope } from '@/core/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';
import { FakeComposerExecutor, nextRunEvent, collectRunEvents } from './helpers/capability-fakes';

const { check, done } = makeChecker();

const PATH = 'data.md';
const TABLE = '| Week | Value |\n| --- | --- |\n| W1 | 3 |\n| W2 | 7 |';
const SOURCE = `# Data\n\n${TABLE}\n`;

const SUMMARIZE_ID = 'composer.table.summarize';
const ADD_COLUMN_ID = 'composer.table.add-column';
const CHECK_UNITS_ID = 'composer.table.check-units';
const EXTRACT_FORMULA_ID = 'composer.table.extract-formula';
const GENERATE_CHART_ID = 'composer.table.generate-chart';

function setup() {
	const vault = new FakeVault();
	const session = openSession(vault, PATH, SOURCE);
	const hub = makeHub(vault, session);
	const executor = new FakeComposerExecutor();
	// The production composition — validateBindings runs here; a broken table/chart
	// binding would throw before this returns.
	const factory = composeComposerCapabilityRuntime({ executor });
	const runtime = factory.forDocument(session, hub);
	return { vault, session, hub, executor, runtime };
}

function tableSnapshot(runtime: ReturnType<typeof setup>['runtime'], session: ReturnType<typeof setup>['session']) {
	const table = blockOfKind(session, 'table');
	return { table, snapshot: runtime.assembleSnapshot({ kind: 'block', blockId: table.blockId }) };
}

/** 1. Composition validates + projects the five AI actions on a table object toolbar. */
function testProjection(): void {
	const { runtime, session } = setup();
	check('compose: production composition validates table/chart bindings', true);
	const { snapshot } = tableSnapshot(runtime, session);
	const actions = runtime.actionsFor(snapshot, 'object-toolbar');
	const ids = actions.map((a) => a.capabilityId);
	for (const id of [SUMMARIZE_ID, ADD_COLUMN_ID, CHECK_UNITS_ID, EXTRACT_FORMULA_ID, GENERATE_CHART_ID]) {
		check(`projection: '${id}' projects on the table object toolbar`, ids.includes(id), ids.join(','));
	}
	const summarize = actions.find((a) => a.capabilityId === SUMMARIZE_ID);
	check('projection: table AI action is in the ai group', summarize?.group === 'ai');
	check('projection: table AI action offers a targeted instruction', summarize?.acceptsInstruction === true);
	check('projection: projected AI action carries no dead disabledReason', !summarize?.disabledReason);
}

/** 2. Typed-object happy path: skeleton stream → materialized table-patch → byte-exact accept. */
async function testTablePatchHappyPath(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const { table, snapshot } = tableSnapshot(runtime, session);
	const { from, to } = table.source;

	// The model streams a fenced JSON table-patch across several chunks.
	const patchJson = JSON.stringify({ op: 'replace-cell', row: 1, col: 1, text: '99' });
	executor.queue({ chunks: ['```json\n', '{ "op": "replace', '-cell", "row": 1,', ' "col": 1, "text": "99" }', '\n```'] });

	const { events, stop } = collectRunEvents(runtime);
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(SUMMARIZE_ID, snapshot);
	const readyEvent = await ready;
	stop();

	// The raw JSON never leaked into the streamed body (skeleton only).
	const deltas = events.filter((e) => e.type === 'content-delta');
	const leaked = deltas.some((e) => e.type === 'content-delta' && e.text.includes('{'));
	check('typed-object: streamed deltas never surface raw JSON', !leaked && deltas.every((e) => e.type === 'content-delta' && e.text === ''));

	// Executor got the registered PromptId + the frozen table variable.
	const request = executor.requests[0];
	check('typed-object: executor got the table PromptId', request?.promptId === 'doc-table-summarize', request?.promptId);
	check('typed-object: variables carry the frozen table source', request?.variables.table === TABLE, String(request?.variables.table));

	// Candidate is ready with a typed table-patch envelope; nothing written yet.
	const candidate = hub.projection().candidates[0];
	check('typed-object: candidate ready', candidate?.status === 'ready', candidate?.status);
	const envelope = candidate?.proposedChange.result as ComposerResultEnvelope | undefined;
	check('typed-object: envelope kind table-patch', envelope?.resultKind === 'table-patch');
	check('typed-object: variant-ready envelope matches', readyEvent.envelope.resultKind === 'table-patch');
	const payload = envelope?.payload as { patch?: { op?: string }; replacement?: string } | undefined;
	check('typed-object: payload carries the parsed patch', payload?.patch?.op === 'replace-cell', JSON.stringify(patchJson));
	const replacement = payload?.replacement;
	check('typed-object: payload carries the materialized replacement', typeof replacement === 'string' && replacement.includes('99'), replacement);
	check('typed-object: pending candidate wrote nothing', vault.read(PATH) === SOURCE && vault.writeCount === 0);

	// Accept → the writeback replaces EXACTLY the frozen table span with the
	// materialized replacement (byte-precise).
	await runtime.accept(candidate!.candidateId);
	const expected = SOURCE.slice(0, from) + replacement + SOURCE.slice(to);
	check('typed-object: accept writes the exact materialized bytes', vault.read(PATH) === expected, vault.read(PATH));
	check('typed-object: accept produced exactly one write', vault.writeCount === 1, String(vault.writeCount));
	const history = hub.projection().history;
	check('typed-object: one History entry with ai origin', history.length === 1 && history[0]?.origin === 'ai');
}

/** 3. Bad JSON fails closed: error state, nothing written. */
async function testBadJsonFailsClosed(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const { snapshot } = tableSnapshot(runtime, session);

	executor.queue({ chunks: ['not json at all — the model refused'] });
	const failed = nextRunEvent(runtime, 'run-failed');
	runtime.invoke(ADD_COLUMN_ID, snapshot);
	const failedEvent = await failed;
	// Let the run's finally settle.
	await new Promise((resolve) => setTimeout(resolve, 0));

	check('bad-json: run-failed carries a reason', failedEvent.error.length > 0, failedEvent.error);
	check('bad-json: reason mentions invalid JSON (no raw parser error)', /valid JSON|no JSON output/.test(failedEvent.error), failedEvent.error);
	const candidate = hub.projection().candidates[0];
	check('bad-json: candidate is in the failed/error state', candidate?.status === 'failed', candidate?.status);
	check('bad-json: nothing written back', vault.read(PATH) === SOURCE && vault.writeCount === 0);
	check('bad-json: no History entry', hub.projection().history.length === 0);
}

/** 4. Schema-invalid JSON (parses but violates the payload schema) also fails closed. */
async function testSchemaInvalidFailsClosed(): Promise<void> {
	const { vault, executor, runtime, session } = setup();
	const { snapshot } = tableSnapshot(runtime, session);

	// Valid JSON, wrong shape (unknown op) → schema rejects it.
	executor.queue({ chunks: [JSON.stringify({ op: 'delete-everything' })] });
	const failed = nextRunEvent(runtime, 'run-failed');
	runtime.invoke(CHECK_UNITS_ID, snapshot);
	await failed;
	await new Promise((resolve) => setTimeout(resolve, 0));
	check('schema-invalid: nothing written back', vault.read(PATH) === SOURCE && vault.writeCount === 0);
}

/** 5. Chart-source run inserts an independent fenced chart block below the table. */
async function testChartSource(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const { table, snapshot } = tableSnapshot(runtime, session);
	const { to } = table.source;

	const spec = { type: 'bar', title: 'Weekly', x: 'Week', series: [{ key: 'Value' }], data: [{ Week: 'W1', Value: 3 }, { Week: 'W2', Value: 7 }] };
	executor.queue({ chunks: ['```json\n', JSON.stringify(spec), '\n```'] });
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(GENERATE_CHART_ID, snapshot);
	await ready;

	const candidate = hub.projection().candidates[0];
	const envelope = candidate?.proposedChange.result as ComposerResultEnvelope | undefined;
	check('chart: envelope kind chart-source', envelope?.resultKind === 'chart-source');
	const fenced = (envelope?.payload as { fencedSource?: string } | undefined)?.fencedSource;
	check('chart: payload carries a fenced chart block', typeof fenced === 'string' && fenced.startsWith('```chart'), fenced);

	await runtime.accept(candidate!.candidateId);
	const written = vault.read(PATH);
	check('chart: table source is preserved verbatim', written.includes(TABLE), written);
	check('chart: fenced chart block inserted after the table', written.includes('```chart') && written.indexOf('```chart') >= to, written);
	check('chart: exactly one write', vault.writeCount === 1, String(vault.writeCount));
}

async function main(): Promise<void> {
	testProjection();
	await testTablePatchHappyPath();
	await testBadJsonFailsClosed();
	await testSchemaInvalidFailsClosed();
	await testChartSource();
	done('composer-typed-object-runtime');
}

void main();
