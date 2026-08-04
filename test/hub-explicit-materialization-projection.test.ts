import assert from 'assert';
import { HubGenerationRuntime } from '@/service/hub/HubGenerationRuntime';

function manifest(id: string, state: 'virtual' | 'materialized', status: 'active' | 'retired' = 'active') {
	return {
		hubId: id,
		label: `${id} label`,
		status,
		communityIds: [],
		decision: { nodeId: id, hubPath: `Peak/Hub-Summaries/${id}.md`, action: 'keep', scope: { communityIds: [], memberNodeIds: [] }, reason: 'test' },
		members: [],
		summary: { version: 1 },
		materialization: state === 'materialized' ? { state, path: `Peak/Hub-Summaries/${id}.md` } : { state },
		planId: 'plan',
		updatedAt: 100,
	};
}

async function testOnlyUserMaterializationEventsProjectIntoMyContent(): Promise<void> {
	const manifests = {
		virtual: manifest('virtual', 'virtual'),
		legacy: manifest('legacy', 'materialized'),
		retired: manifest('retired', 'materialized', 'retired'),
		explicit: manifest('explicit', 'materialized'),
	};
	const runtime = new HubGenerationRuntime({
		recordStore: {
			listHubIds: async () => Object.keys(manifests),
			read: async (id: keyof typeof manifests) => manifests[id] ?? null,
			readEvents: async (id: keyof typeof manifests) => id === 'explicit'
				? [{ kind: 'synthesized', hubId: id, planId: 'plan', at: 20 }, { kind: 'materialized', hubId: id, planId: 'plan', at: 30 }]
				: id === 'legacy'
					? [{ kind: 'legacy-imported', hubId: id, planId: 'legacy-import', at: 10 }]
					: [{ kind: 'materialized', hubId: id, planId: 'plan', at: 15 }],
		},
	} as any);

	const items = await runtime.listExplicitMaterializedHubs();
	assert.deepStrictEqual(items.map((item) => item.manifest.hubId), ['explicit']);
	assert.strictEqual(items[0]?.materializedAt, 30);
	console.log('PASS: onlyUserMaterializationEventsProjectIntoMyContent');
}

testOnlyUserMaterializationEventsProjectIntoMyContent().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
