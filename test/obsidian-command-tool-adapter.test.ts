// T5 — obsidian-command ToolDef adapter.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { ToolExecCtx } from '@/core/types/tool';
import {
	obsidianCommandToToolDef,
	obsidianCommandsToToolDefs,
	type CommandInvoker,
} from '@/service/agents/harness/tool/ObsidianCommandToolAdapter';

function makeCtx(): ToolExecCtx {
	return { loopId: 'l-1', stepIndex: 0, tier: 'fast', signal: new AbortController().signal };
}

function makeInvoker(shouldFind: boolean, throwErr?: Error): CommandInvoker {
	return {
		executeCommandById(_id: string) {
			if (throwErr) throw throwErr;
			return shouldFind;
		},
	};
}

// ---------------------------------------------------------------------------
// Rule 1 — happy invocation returns ok + records invocation.
// ---------------------------------------------------------------------------

async function testHappyInvocation(): Promise<void> {
	const tool = obsidianCommandToToolDef(
		{ id: 'app:go-back', name: 'Navigate back' },
		makeInvoker(true),
	);
	assert.strictEqual(tool.source, 'obsidian-command');
	assert.strictEqual(tool.name, 'obsidian_app_go-back');
	assert.strictEqual(tool.description, 'Navigate back');
	assert.strictEqual(tool.kind, 'edit');

	const res = await tool.execute({}, makeCtx());
	assert.strictEqual(res.ok, true);
	if (res.ok) {
		assert.deepStrictEqual(res.data, { invoked: true, commandId: 'app:go-back' });
	}
	console.log('PASS: happyInvocation');
}

// ---------------------------------------------------------------------------
// Rule 2 — invoker reports not-found → recoverable failure.
// ---------------------------------------------------------------------------

async function testNotFound(): Promise<void> {
	const tool = obsidianCommandToToolDef(
		{ id: 'unknown:cmd' },
		makeInvoker(false),
	);
	const res = await tool.execute({}, makeCtx());
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.match(res.error, /not found or refused/);
		assert.strictEqual(res.recoverable, true);
	}
	console.log('PASS: notFound');
}

// ---------------------------------------------------------------------------
// Rule 3 — invoker throws → recoverable failure with message surfaced.
// ---------------------------------------------------------------------------

async function testInvokerThrows(): Promise<void> {
	const tool = obsidianCommandToToolDef(
		{ id: 'crash:cmd' },
		makeInvoker(false, new Error('boom')),
	);
	const res = await tool.execute({}, makeCtx());
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.match(res.error, /boom/);
	}
	console.log('PASS: invokerThrows');
}

// ---------------------------------------------------------------------------
// Rule 4 — options override prefix / description / kind.
// ---------------------------------------------------------------------------

function testOptions(): void {
	const tool = obsidianCommandToToolDef(
		{ id: 'x:y', name: 'X Y' },
		makeInvoker(true),
		{ toolNamePrefix: 'obs_', description: 'do a thing', kind: 'read' },
	);
	assert.strictEqual(tool.name, 'obs_x_y');
	assert.strictEqual(tool.description, 'do a thing');
	assert.strictEqual(tool.kind, 'read');
	console.log('PASS: options');
}

// ---------------------------------------------------------------------------
// Rule 5 — batch converter round-trips a list.
// ---------------------------------------------------------------------------

function testBatch(): void {
	const tools = obsidianCommandsToToolDefs(
		[
			{ id: 'a:1' },
			{ id: 'b:2', name: 'Second' },
		],
		makeInvoker(true),
	);
	assert.strictEqual(tools.length, 2);
	assert.strictEqual(tools[0]!.source, 'obsidian-command');
	assert.strictEqual(tools[1]!.description, 'Second');
	console.log('PASS: batch');
}

// ---------------------------------------------------------------------------
// Rule 6 — source-scan boundary: adapter must not import `obsidian`.
// ---------------------------------------------------------------------------

function testBoundary(): void {
	const src = fs.readFileSync(
		path.resolve(process.cwd(), 'src/service/agents/harness/tool/ObsidianCommandToolAdapter.ts'),
		'utf8',
	);
	const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	assert.ok(!/from ['"]obsidian(\/|['"])/.test(stripped), 'adapter must not import obsidian');
	assert.ok(!/from ['"]@\/app\//.test(stripped), 'adapter must not import app');
	assert.ok(!/from ['"]@\/ui\//.test(stripped), 'adapter must not import ui');
	console.log('PASS: boundary');
}

async function run(): Promise<void> {
	testOptions();
	testBatch();
	testBoundary();
	await testHappyInvocation();
	await testNotFound();
	await testInvokerThrows();
	console.log('obsidian-command-tool-adapter: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
