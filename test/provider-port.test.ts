// T2 ProviderPort — shape guard + runtime stub check.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { ProviderPort, ProviderInfo } from '@/core/ports/ProviderPort';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/ProviderPort.ts');
const portSource = fs.readFileSync(PORT_PATH, 'utf8');

function testPortShape(): void {
	const required = ['hasProvider(', 'listProviders(', 'getProviderInfo('];
	for (const m of required) {
		assert.ok(portSource.includes(m), `ProviderPort missing '${m}'`);
	}
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	// Read-only surface: no mutation / stream / complete.
	for (const forbidden of ['registerProvider(', 'streamText(', 'chat(', 'complete(']) {
		assert.ok(!stripped.includes(forbidden), `ProviderPort must not include '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

function testBoundary(): void {
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	assert.ok(!/from ['"]@\/service\//.test(stripped), 'port must not import from service');
	assert.ok(!/from ['"]@\/app\//.test(stripped), 'port must not import from app');
	assert.ok(!/from ['"]@\/ui\//.test(stripped), 'port must not import from ui');
	assert.ok(!/from ['"]obsidian(\/|['"])/.test(stripped), 'port must not import obsidian');
	console.log('PASS: boundary');
}

function testStubSatisfiesPort(): void {
	const infos: ProviderInfo[] = [
		{ id: 'anthropic', name: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com', ready: true },
		{ id: 'openai', name: 'OpenAI', defaultBaseUrl: 'https://api.openai.com', ready: false },
	];
	const stub: ProviderPort = {
		hasProvider(id) { return infos.some((p) => p.id === id); },
		listProviders() { return infos.slice(); },
		getProviderInfo(id) { return infos.find((p) => p.id === id); },
	};
	assert.strictEqual(stub.hasProvider('anthropic'), true);
	assert.strictEqual(stub.hasProvider('mistral'), false);
	assert.strictEqual(stub.listProviders().length, 2);
	assert.strictEqual(stub.getProviderInfo('openai')?.ready, false);
	console.log('PASS: stubSatisfiesPort');
}

testPortShape();
testBoundary();
testStubSatisfiesPort();
console.log('provider-port: all guards passed');
