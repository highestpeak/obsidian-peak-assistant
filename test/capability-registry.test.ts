/**
 * Tests for CapabilityRegistry:
 *  - register adds an adapter; getById / getAll surface it
 *  - register overwrites when the same surfaceId is re-used (last-write-wins)
 *  - getAll returns adapters in stable surface-id order regardless of registration order
 *  - size() reflects the current count
 *  - resetForTest() clears the singleton — subsequent getInstance() returns a fresh registry
 */

import assert from 'assert';
import {
	CapabilityRegistry,
	type CapabilityStatus,
	type SurfaceCapabilityAdapter,
	type SurfaceId,
} from '@/service/capabilities';

function makeAdapter(
	surfaceId: SurfaceId,
	surfaceLabel: string,
	statuses: CapabilityStatus[] = [],
): SurfaceCapabilityAdapter {
	return {
		surfaceId,
		surfaceLabel,
		getCapabilityStatus: async () => statuses,
	};
}

type TestCase = { name: string; run: () => Promise<void> | void };

const tests: TestCase[] = [
	{
		name: 'register + getById + getAll: a single adapter is discoverable',
		run: () => {
			CapabilityRegistry.resetForTest();
			const reg = CapabilityRegistry.getInstance();
			const adapter = makeAdapter('chat', 'Chat', [
				{ capability: 'Conversation', status: 'ready' },
			]);
			reg.register(adapter);

			assert.strictEqual(reg.getById('chat'), adapter, 'getById should return the registered adapter');
			assert.deepStrictEqual(
				reg.getAll().map((a) => a.surfaceId),
				['chat'],
				'getAll should include the registered adapter',
			);
			assert.strictEqual(reg.size(), 1, 'size should be 1 after one registration');
		},
	},

	{
		name: 'register overwrites: re-registering same surfaceId replaces previous adapter',
		run: () => {
			CapabilityRegistry.resetForTest();
			const reg = CapabilityRegistry.getInstance();
			const first = makeAdapter('chat', 'Chat (v1)');
			const second = makeAdapter('chat', 'Chat (v2)');
			reg.register(first);
			reg.register(second);

			assert.strictEqual(reg.size(), 1, 'size should remain 1 after overwrite');
			assert.strictEqual(reg.getById('chat'), second, 'getById should return the latest adapter');
			assert.strictEqual(
				reg.getById('chat')?.surfaceLabel,
				'Chat (v2)',
				'label should reflect the second registration',
			);
		},
	},

	{
		name: 'getAll returns adapters in stable surface-id order (chat → vault-search → ai-analysis → copilot → web-chat)',
		run: () => {
			CapabilityRegistry.resetForTest();
			const reg = CapabilityRegistry.getInstance();

			// Register out of canonical order.
			reg.register(makeAdapter('web-chat', 'Web-enabled Chat'));
			reg.register(makeAdapter('copilot', 'Copilot'));
			reg.register(makeAdapter('chat', 'Chat'));
			reg.register(makeAdapter('ai-analysis', 'AI Analysis'));
			reg.register(makeAdapter('vault-search', 'Vault Search'));

			assert.deepStrictEqual(
				reg.getAll().map((a) => a.surfaceId),
				['chat', 'vault-search', 'ai-analysis', 'copilot', 'web-chat'],
				'getAll should reorder adapters into the canonical surface-id sequence',
			);
			assert.strictEqual(reg.size(), 5, 'size should reflect all 5 registrations');
		},
	},

	{
		name: 'getAll skips surfaces that have not registered',
		run: () => {
			CapabilityRegistry.resetForTest();
			const reg = CapabilityRegistry.getInstance();
			reg.register(makeAdapter('chat', 'Chat'));
			reg.register(makeAdapter('copilot', 'Copilot'));

			assert.deepStrictEqual(
				reg.getAll().map((a) => a.surfaceId),
				['chat', 'copilot'],
				'getAll should only include registered surfaces, in canonical order',
			);
			assert.strictEqual(reg.getById('vault-search'), undefined, 'unregistered surfaces return undefined');
			assert.strictEqual(reg.size(), 2);
		},
	},

	{
		name: 'resetForTest clears state: getInstance returns a fresh registry',
		run: () => {
			CapabilityRegistry.resetForTest();
			const first = CapabilityRegistry.getInstance();
			first.register(makeAdapter('chat', 'Chat'));
			assert.strictEqual(first.size(), 1, 'first instance has one adapter');

			CapabilityRegistry.resetForTest();
			const second = CapabilityRegistry.getInstance();
			assert.notStrictEqual(second, first, 'resetForTest should produce a new singleton');
			assert.strictEqual(second.size(), 0, 'fresh registry should be empty');
			assert.strictEqual(second.getById('chat'), undefined, 'previously-registered adapter should be gone');
		},
	},

	{
		name: 'getCapabilityStatus is invocable through the registered adapter',
		run: async () => {
			CapabilityRegistry.resetForTest();
			const reg = CapabilityRegistry.getInstance();
			const statuses: CapabilityStatus[] = [
				{ capability: 'Conversation', status: 'ready' },
				{
					capability: 'Safety',
					status: 'needs-attention',
					reason: 'Review safety policy',
					repair: { label: 'Review safety', action: () => {} },
				},
			];
			reg.register(makeAdapter('copilot', 'Copilot', statuses));

			const adapter = reg.getById('copilot');
			assert.ok(adapter, 'adapter should be registered');
			const result = await adapter!.getCapabilityStatus();
			assert.deepStrictEqual(result, statuses, 'adapter should report the configured statuses');
		},
	},
];

async function main() {
	let passed = 0;
	let failed = 0;
	for (const t of tests) {
		try {
			await t.run();
			console.log(`  ✓ ${t.name}`);
			passed++;
		} catch (err) {
			console.error(`  ✗ ${t.name}`);
			console.error(err);
			failed++;
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

main();
