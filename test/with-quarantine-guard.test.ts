// T6 — withQuarantineGuard + guardToolExecution semantics.

import assert from 'assert';
import { z } from 'zod';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { ToolPort } from '@/core/ports/ToolPort';
import type { ToolDef, ToolExecCtx } from '@/core/types/tool';
import { ok } from '@/core/types/tool';
import {
	withQuarantineGuard,
	guardToolExecution,
} from '@/service/skills/withQuarantineGuard';

function makeTool(name: string, kind: ToolDef['kind'] = 'read'): ToolDef {
	return {
		name,
		description: `tool ${name}`,
		inputSchema: z.object({}),
		kind,
		execute: async () => ok({ from: name }),
	};
}

function makeCtx(): ToolExecCtx {
	return { loopId: 'l-1', stepIndex: 0, tier: 'fast', signal: new AbortController().signal };
}

function makePort(tools: ToolDef[]): ToolPort {
	const byName = new Map(tools.map((t) => [t.name, t] as const));
	return {
		has: (n) => byName.has(n),
		get: (n) => byName.get(n),
		all: () => Array.from(byName.values()),
		forTier: (_tier, allowedNames) => {
			const list = Array.from(byName.values());
			return allowedNames ? list.filter((t) => allowedNames.includes(t.name)) : list;
		},
	};
}

const strict: CompiledSkill = {
	skillId: 'skill.strict',
	allowedTools: ['tool.read', 'tool.list'],
	systemPrompt: 'be strict',
	quarantine: 'strict',
};

const permissive: CompiledSkill = {
	skillId: 'skill.perm',
	allowedTools: ['tool.read'], // intentionally narrow — permissive means ignored.
	systemPrompt: 'permissive',
	quarantine: 'permissive',
};

// ---------------------------------------------------------------------------
// Test 1 — strict guard filters `has` / `get` / `all` / `forTier`.
// ---------------------------------------------------------------------------

function testStrictFilters(): void {
	const port = makePort([makeTool('tool.read'), makeTool('tool.list'), makeTool('tool.write', 'edit')]);
	const guarded = withQuarantineGuard(port, strict);

	assert.strictEqual(guarded.has('tool.read'), true);
	assert.strictEqual(guarded.has('tool.list'), true);
	assert.strictEqual(guarded.has('tool.write'), false, 'tool.write must be filtered out');
	assert.strictEqual(guarded.get('tool.write'), undefined);
	assert.ok(guarded.get('tool.read'));

	const all = guarded.all();
	assert.strictEqual(all.length, 2);
	assert.deepStrictEqual(all.map((t) => t.name).sort(), ['tool.list', 'tool.read']);

	const forFast = guarded.forTier('fast');
	assert.strictEqual(forFast.length, 2);
	console.log('PASS: strictFilters');
}

// ---------------------------------------------------------------------------
// Test 2 — permissive guard passes through.
// ---------------------------------------------------------------------------

function testPermissivePassthrough(): void {
	const port = makePort([makeTool('tool.read'), makeTool('tool.write', 'edit')]);
	const guarded = withQuarantineGuard(port, permissive);
	assert.strictEqual(guarded.has('tool.write'), true, 'permissive must expose all tools');
	assert.strictEqual(guarded.all().length, 2);
	console.log('PASS: permissivePassthrough');
}

// ---------------------------------------------------------------------------
// Test 3 — guardToolExecution denies at execute-time.
// ---------------------------------------------------------------------------

async function testGuardExecutionDenies(): Promise<void> {
	const tool = makeTool('tool.write', 'edit');
	const res = await guardToolExecution({
		compiled: strict,
		tool,
		input: {},
		ctx: makeCtx(),
	});
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.match(res.error, /skill-quarantine/);
		assert.strictEqual(res.recoverable, false);
	}
	console.log('PASS: guardExecutionDenies');
}

// ---------------------------------------------------------------------------
// Test 4 — guardToolExecution allows whitelisted.
// ---------------------------------------------------------------------------

async function testGuardExecutionAllows(): Promise<void> {
	const tool = makeTool('tool.read');
	const res = await guardToolExecution({
		compiled: strict,
		tool,
		input: {},
		ctx: makeCtx(),
	});
	assert.strictEqual(res.ok, true);
	if (res.ok) assert.deepStrictEqual(res.data, { from: 'tool.read' });
	console.log('PASS: guardExecutionAllows');
}

async function run(): Promise<void> {
	testStrictFilters();
	testPermissivePassthrough();
	await testGuardExecutionDenies();
	await testGuardExecutionAllows();
	console.log('with-quarantine-guard: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
