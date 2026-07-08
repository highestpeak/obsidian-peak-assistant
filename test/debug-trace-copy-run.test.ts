import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import { copyDebugRun } from '@/service/debug-trace/copyDebugRun';
import { DEFAULT_DEBUG_TRACE_SETTINGS, type DebugTraceSettings } from '@/core/config/settingsTypes';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(prefix = 'id'): DebugIdFactory {
	let n = 0;
	return { next: () => `${prefix}-${++n}` };
}

function makeClipboard() {
	let last = '';
	return {
		writeClipboard: async (text: string) => {
			last = text;
		},
		read: () => last,
	};
}

async function main() {
	console.log('debug-trace-copy-run: off mode short-circuits');
	{
		const rec = new DebugTraceRecorder({ mode: 'off' });
		const clip = makeClipboard();
		const settings: DebugTraceSettings = { ...DEFAULT_DEBUG_TRACE_SETTINGS, mode: 'off' };
		let notified = '';
		const res = await copyDebugRun('anything', {
			port: rec,
			settings,
			writeClipboard: clip.writeClipboard,
			notify: (m) => (notified = m),
		});
		assert.strictEqual(res.ok, false);
		assert.strictEqual(res.reason, 'debug-tracing-off');
		assert.strictEqual(clip.read(), '');
		assert.ok(notified.includes('off'));
	}

	console.log('debug-trace-copy-run: run-not-found returns reason');
	{
		const rec = new DebugTraceRecorder({
			mode: 'redacted',
			clock: makeClock(),
			idFactory: makeIds(),
		});
		const clip = makeClipboard();
		const settings: DebugTraceSettings = { ...DEFAULT_DEBUG_TRACE_SETTINGS, mode: 'redacted' };
		const res = await copyDebugRun('missing', {
			port: rec,
			settings,
			writeClipboard: clip.writeClipboard,
		});
		assert.strictEqual(res.ok, false);
		assert.strictEqual(res.reason, 'run-not-found');
	}

	console.log('debug-trace-copy-run: markdown copy of a real run');
	{
		const rec = new DebugTraceRecorder({
			mode: 'redacted',
			clock: makeClock(),
			idFactory: makeIds('run'),
		});
		const run = rec.startRun({ surface: 'search', capabilityId: 'search.query' });
		const s = run.startSpan({ kind: 'retrieval.recall', name: 'vector' });
		s.setOutput({ raw: 'preview' });
		s.finish();
		const finished = run.finish('completed');
		const clip = makeClipboard();
		const settings: DebugTraceSettings = {
			...DEFAULT_DEBUG_TRACE_SETTINGS,
			mode: 'redacted',
			copyFormat: 'markdown',
		};
		const res = await copyDebugRun(finished.runId, {
			port: rec,
			settings,
			writeClipboard: clip.writeClipboard,
		});
		assert.strictEqual(res.ok, true);
		const md = clip.read();
		assert.ok(md.includes('# Debug receipt — search · search.query'));
		assert.ok(md.includes('vector'));
		assert.ok(!md.includes('```\npreview'));
	}

	console.log('debug-trace-copy-run: json copy path');
	{
		const rec = new DebugTraceRecorder({
			mode: 'redacted',
			clock: makeClock(),
			idFactory: makeIds('run'),
		});
		const run = rec.startRun({ surface: 'chat' });
		run.startSpan({ kind: 'model.call', name: 'x' }).finish();
		const finished = run.finish('completed');
		const clip = makeClipboard();
		const settings: DebugTraceSettings = {
			...DEFAULT_DEBUG_TRACE_SETTINGS,
			mode: 'redacted',
			copyFormat: 'json',
		};
		const res = await copyDebugRun(finished.runId, {
			port: rec,
			settings,
			writeClipboard: clip.writeClipboard,
		});
		assert.strictEqual(res.ok, true);
		const parsed = JSON.parse(clip.read());
		assert.strictEqual(parsed.runId, finished.runId);
		assert.strictEqual(parsed.status, 'completed');
		assert.strictEqual(parsed.version, 1);
	}

	console.log('debug-trace-copy-run: raw mode + includeRawContent');
	{
		const rec = new DebugTraceRecorder({
			mode: 'raw',
			clock: makeClock(),
			idFactory: makeIds('run'),
		});
		const run = rec.startRun({ surface: 'chat' });
		const span = run.startSpan({ kind: 'model.call', name: 'ap' });
		span.setInput({ raw: 'raw prompt payload' });
		span.finish();
		const finished = run.finish('completed');
		const clip = makeClipboard();
		const settings: DebugTraceSettings = {
			mode: 'raw',
			retention: 20,
			copyFormat: 'markdown',
			includeRawContent: true,
		};
		await copyDebugRun(finished.runId, {
			port: rec,
			settings,
			writeClipboard: clip.writeClipboard,
		});
		const md = clip.read();
		assert.ok(md.includes('MODE: FULL LOCAL'));
		assert.ok(md.includes('raw prompt payload'));
	}

	console.log('debug-trace-copy-run: OK');
}

void main();
