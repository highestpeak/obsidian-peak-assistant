// B4 · Harness PermissionGuard consumes skill quarantine.
//
// Verifies AgentLoop rejects a tool call not in the compiled skill's
// allowedTools with a synthetic `skill-quarantine: ...` failure result,
// without invoking the underlying tool.

import assert from 'assert';
import { z } from 'zod';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import { makeStreamModel, textStepChunks, toolStepChunks } from './harness-fixtures/mockStreamModel';

function toolThenStop(toolName: string, args: any, finalText = 'fin'): TierBinding {
	const model = makeStreamModel('mock', [
		toolStepChunks({ toolName, input: args }),
		textStepChunks({ text: finalText }),
	]);
	return {
		tier: 'local-fast',
		providerId: 'mock',
		modelId: 'mock',
		resolve: () => model,
		capabilities: { ...DEFAULT_TIER_CAPABILITIES },
		estimatedSingleStepP: 0.9,
	};
}

function mkTool(name: string, executed: { count: number }): ToolDef {
	return {
		name,
		description: `tool ${name}`,
		inputSchema: z.object({ value: z.string().optional() }),
		async execute() {
			executed.count += 1;
			return { ok: true as const, data: { name } };
		},
	};
}

function strictSkill(allowedTools: string[]): CompiledSkill {
	return {
		skillId: 'skill.strict.test',
		systemPrompt: '',
		quarantine: 'strict',
		allowedTools,
	};
}

function permissiveSkill(): CompiledSkill {
	return {
		skillId: 'skill.perm.test',
		systemPrompt: '',
		quarantine: 'permissive',
		allowedTools: [],
	};
}

async function testStrictSkillRejectsDisallowedTool(): Promise<void> {
	const executed = { count: 0 };
	const bindings: TierBindings = { 'local-fast': toolThenStop('vault.delete', {}) };
	const controller = new TierController({ bindings, policy: { allowEscalation: false } });

	const result = await runAgentLoop({
		loopId: 'Q1',
		systemPrompt: '',
		initialMessages: [{ role: 'user', content: 'delete' }],
		tools: [mkTool('vault.delete', executed)],
		tierController: controller,
		compiledSkill: strictSkill(['vault.read']),
	});

	assert.strictEqual(executed.count, 0, 'quarantined tool must NOT execute');
	const tr = result.steps[0].toolResults[0];
	assert.strictEqual(tr.ok, false);
	assert.match(String(tr.payload), /skill-quarantine/);
	assert.match(String(tr.payload), /vault\.delete/);
	console.log('PASS: strictSkillRejectsDisallowedTool');
}

async function testStrictSkillAllowsWhitelistedTool(): Promise<void> {
	const executed = { count: 0 };
	const bindings: TierBindings = { 'local-fast': toolThenStop('vault.read', {}) };
	const controller = new TierController({ bindings, policy: { allowEscalation: false } });

	const result = await runAgentLoop({
		loopId: 'Q2',
		systemPrompt: '',
		initialMessages: [{ role: 'user', content: 'read' }],
		tools: [mkTool('vault.read', executed)],
		tierController: controller,
		compiledSkill: strictSkill(['vault.read']),
	});

	assert.strictEqual(executed.count, 1, 'whitelisted tool must execute');
	const tr = result.steps[0].toolResults[0];
	assert.strictEqual(tr.ok, true);
	console.log('PASS: strictSkillAllowsWhitelistedTool');
}

async function testPermissiveSkillPassesThrough(): Promise<void> {
	const executed = { count: 0 };
	const bindings: TierBindings = { 'local-fast': toolThenStop('web.fetch', {}) };
	const controller = new TierController({ bindings, policy: { allowEscalation: false } });

	const result = await runAgentLoop({
		loopId: 'Q3',
		systemPrompt: '',
		initialMessages: [{ role: 'user', content: 'fetch' }],
		tools: [mkTool('web.fetch', executed)],
		tierController: controller,
		compiledSkill: permissiveSkill(),
	});

	assert.strictEqual(executed.count, 1, 'permissive skill lets any tool through');
	const tr = result.steps[0].toolResults[0];
	assert.strictEqual(tr.ok, true);
	console.log('PASS: permissiveSkillPassesThrough');
}

async function testNoSkillMeansLegacyBehaviour(): Promise<void> {
	const executed = { count: 0 };
	const bindings: TierBindings = { 'local-fast': toolThenStop('anything', {}) };
	const controller = new TierController({ bindings, policy: { allowEscalation: false } });

	const result = await runAgentLoop({
		loopId: 'Q4',
		systemPrompt: '',
		initialMessages: [{ role: 'user', content: 'do' }],
		tools: [mkTool('anything', executed)],
		tierController: controller,
		// no compiledSkill
	});

	assert.strictEqual(executed.count, 1, 'legacy path must not require skill');
	const tr = result.steps[0].toolResults[0];
	assert.strictEqual(tr.ok, true);
	console.log('PASS: noSkillMeansLegacyBehaviour');
}

async function run(): Promise<void> {
	await testStrictSkillRejectsDisallowedTool();
	await testStrictSkillAllowsWhitelistedTool();
	await testPermissiveSkillPassesThrough();
	await testNoSkillMeansLegacyBehaviour();
	console.log('harness-skill-quarantine: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
