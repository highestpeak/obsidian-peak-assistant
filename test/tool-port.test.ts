// T2 ToolPort — shape guard + implements test.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ToolRegistry } from '@/service/agents/harness/tool/registry';
import type { ToolPort } from '@/core/ports/ToolPort';
import type { ToolDef } from '@/service/agents/harness/tool/types';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/ToolPort.ts');
const REGISTRY_PATH = path.resolve(process.cwd(), 'src/service/agents/harness/tool/registry.ts');

const portSource = fs.readFileSync(PORT_PATH, 'utf8');
const registrySource = fs.readFileSync(REGISTRY_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — Port declares the expected 4 read methods (has/get/all/forTier).
// ---------------------------------------------------------------------------

function testPortShape(): void {
	const required = ['has(', 'get(', 'all(', 'forTier('];
	for (const m of required) {
		assert.ok(portSource.includes(m), `ToolPort missing method '${m}'`);
	}
	// Port must NOT declare mutators — those stay on the concrete class.
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const forbidden of ['register(', 'registerAll(', 'clear(']) {
		assert.ok(!stripped.includes(forbidden), `ToolPort must not expose mutator '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

// ---------------------------------------------------------------------------
// Rule 2 — registry declares `implements ToolPort`.
// ---------------------------------------------------------------------------

function testRegistryImplementsPort(): void {
	assert.match(
		registrySource,
		/class ToolRegistry\s+implements\s+ToolPort/,
		'ToolRegistry must declare `implements ToolPort`',
	);
	console.log('PASS: registryImplementsPort');
}

// ---------------------------------------------------------------------------
// Runtime — a ToolRegistry instance can be passed through the port variable.
// ---------------------------------------------------------------------------

function makeTool(name: string): ToolDef {
	return {
		name,
		description: `t ${name}`,
		inputSchema: z.object({}),
		async execute() { return { ok: true as const, data: null }; },
	};
}

function testRegistryStructurallySatisfiesPort(): void {
	const reg = new ToolRegistry();
	reg.register(makeTool('a'));
	reg.register(makeTool('b'));
	// Assign to the port type — a type check happens at compile time,
	// this line just proves it at runtime.
	const port: ToolPort = reg;
	assert.strictEqual(port.has('a'), true);
	assert.strictEqual(port.has('z'), false);
	assert.strictEqual(port.get('a')?.name, 'a');
	assert.strictEqual(port.all().length, 2);
	assert.strictEqual(port.forTier('stronger').length, 2);
	assert.strictEqual(port.forTier('stronger', ['a']).length, 1);
	console.log('PASS: registryStructurallySatisfiesPort');
}

// ---------------------------------------------------------------------------

testPortShape();
testRegistryImplementsPort();
testRegistryStructurallySatisfiesPort();
console.log('tool-port: all guards passed');
