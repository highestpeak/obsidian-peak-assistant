// T12 CommandGateway — register / dispatch / duplicate-guard.

import assert from 'assert';
import type { CapabilityManifest } from '@/core/types/capability';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import {
	CommandGateway,
	type GatewayBinding,
} from '@/service/capabilities/CommandGateway';

function makeManifest(id: string): CapabilityManifest {
	return {
		id,
		title: `Cap ${id}`,
		description: 'unit',
		inputContract: { kind: 'object', description: 'in' },
		outputContract: { kind: 'object', description: 'out' },
		permissionKind: 'read',
		costTier: 'fast',
		backendPolicy: { preferred: 'hermes-harness', fallback: [] },
		skillRef: `skill.${id}`,
		surfaceBinding: ['chat'],
	};
}

function makeCompiled(skillId: string): CompiledSkill {
	return { skillId, allowedTools: [], systemPrompt: '', quarantine: 'permissive' };
}

function makeBinding(commandId: string, capId: string): GatewayBinding {
	return {
		commandId,
		commandLabel: `Do ${commandId}`,
		manifest: makeManifest(capId),
		compiledSkill: makeCompiled(`skill.${capId}`),
		execute: async () => ({ result: { ran: commandId } }),
	};
}

function testRegisterAndDispatch(): Promise<void> {
	return (async () => {
		const gw = new CommandGateway();
		gw.register(makeBinding('peak.foo', 'foo.cap'));
		assert.strictEqual(gw.has('peak.foo'), true);
		assert.strictEqual(gw.has('peak.bar'), false);
		assert.strictEqual(gw.all().length, 1);

		const out = await gw.dispatch<{ ran: string }>('peak.foo');
		assert.strictEqual(out.commandId, 'peak.foo');
		assert.strictEqual(out.result.session.status, 'completed');
		assert.deepStrictEqual(out.result.result, { ran: 'peak.foo' });
		console.log('PASS: registerAndDispatch');
	})();
}

function testDuplicateRegister(): void {
	const gw = new CommandGateway();
	gw.register(makeBinding('peak.foo', 'foo.cap'));
	let thrown: unknown = null;
	try {
		gw.register(makeBinding('peak.foo', 'foo.cap'));
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error, 'duplicate register must throw');
	assert.match((thrown as Error).message, /already registered/);
	console.log('PASS: duplicateRegister');
}

async function testDispatchUnknown(): Promise<void> {
	const gw = new CommandGateway();
	let thrown: unknown = null;
	try {
		await gw.dispatch('peak.nope');
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error);
	assert.match((thrown as Error).message, /no binding for command 'peak.nope'/);
	console.log('PASS: dispatchUnknown');
}

async function testDispatchUsesBuildInput(): Promise<void> {
	const gw = new CommandGateway();
	const b: GatewayBinding<{ n: number }, { doubled: number }> = {
		commandId: 'peak.double',
		commandLabel: 'Double',
		manifest: makeManifest('double.cap'),
		compiledSkill: makeCompiled('skill.double.cap'),
		buildInput: () => ({ n: 21 }),
		execute: async (input) => ({ result: { doubled: input.n * 2 } }),
	};
	gw.register(b as GatewayBinding);
	const out = await gw.dispatch<{ doubled: number }>('peak.double');
	assert.deepStrictEqual(out.result.result, { doubled: 42 });
	console.log('PASS: dispatchUsesBuildInput');
}

function testUnregister(): void {
	const gw = new CommandGateway();
	gw.register(makeBinding('peak.foo', 'foo.cap'));
	gw.unregister('peak.foo');
	assert.strictEqual(gw.has('peak.foo'), false);
	// After unregister, re-register is legal.
	gw.register(makeBinding('peak.foo', 'foo.cap'));
	assert.strictEqual(gw.has('peak.foo'), true);
	console.log('PASS: unregister');
}

async function run(): Promise<void> {
	await testRegisterAndDispatch();
	testDuplicateRegister();
	await testDispatchUnknown();
	await testDispatchUsesBuildInput();
	testUnregister();
	console.log('command-gateway: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
