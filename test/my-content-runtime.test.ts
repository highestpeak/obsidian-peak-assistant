import assert from 'assert';
import { TFile } from 'obsidian';
import { createDefaultGeneratedOutputRegistry } from '@/core/storage/generated-output';
import { MyContentRuntime } from '@/app/my-content/MyContentRuntime';

function file(path: string, basename: string, ctime: number, mtime: number): TFile {
	return Object.assign(Object.create(TFile.prototype), { path, basename, stat: { ctime, mtime } }) as TFile;
}

async function testListsOnlyExplicitMaterializedHubArtifacts(): Promise<void> {
	const explicitHubFile = file('Peak/Hub-Summaries/research.md', 'research', 30, 40);
	const runtime = new MyContentRuntime({
		app: {
			vault: {
				getFiles: () => [
					file('Peak/system/User-Profile.md', 'User-Profile', 10, 20),
					explicitHubFile,
					file('Peak/Hub-Summaries/legacy.md', 'legacy', 50, 60),
					file('Peak/DataStore/records/chat/conversations/a.jsonl', 'a', 70, 80),
					file('ordinary-note.md', 'ordinary-note', 90, 100),
				],
				getAbstractFileByPath: (path: string) => path === explicitHubFile.path ? explicitHubFile : null,
			},
		} as any,
		registry: createDefaultGeneratedOutputRegistry(),
		resolveAiRoot: () => 'Peak',
		getHubRuntime: () => ({
			listExplicitMaterializedHubs: async () => [{
				manifest: {
					hubId: 'hub-explicit', label: 'Research hub', status: 'active', communityIds: [],
					decision: { nodeId: 'hub-explicit', hubPath: explicitHubFile.path, action: 'keep', scope: { communityIds: [], memberNodeIds: [] }, reason: 'test' },
					members: [], summary: { version: 1 }, materialization: { state: 'materialized', path: explicitHubFile.path }, planId: 'plan', updatedAt: 40,
				},
				materializedAt: 35,
			}],
		}),
	});

	const items = await runtime.list();
	assert.deepStrictEqual(items.map((item) => item.path), [
		'Peak/Hub-Summaries/research.md',
		'Peak/system/User-Profile.md',
	]);
	assert.deepStrictEqual(items.map((item) => item.title), ['Research hub', 'User-Profile']);
	assert.strictEqual(items[0]?.createdAt, 35);
	console.log('PASS: listsOnlyExplicitMaterializedHubArtifacts');
}

testListsOnlyExplicitMaterializedHubArtifacts().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
