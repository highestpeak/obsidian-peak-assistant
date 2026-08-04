import assert from 'assert';
import { createDefaultGeneratedOutputRegistry } from '@/core/storage/generated-output';
import { MyContentRuntime } from '@/app/my-content/MyContentRuntime';

async function testListsOnlyRegisteredMaterializedUserArtifacts(): Promise<void> {
	const runtime = new MyContentRuntime({
		app: {
			vault: {
				getFiles: () => [
					{ path: 'Peak/system/User-Profile.md', basename: 'User-Profile', stat: { ctime: 10, mtime: 20 } },
					{ path: 'Peak/Hub-Summaries/research.md', basename: 'research', stat: { ctime: 30, mtime: 40 } },
					{ path: 'Peak/DataStore/records/chat/conversations/a.jsonl', basename: 'a', stat: { ctime: 50, mtime: 60 } },
					{ path: 'ordinary-note.md', basename: 'ordinary-note', stat: { ctime: 70, mtime: 80 } },
				],
			},
		} as any,
		registry: createDefaultGeneratedOutputRegistry(),
		resolveAiRoot: () => 'Peak',
	});

	const items = await runtime.list();
	assert.deepStrictEqual(items.map((item) => item.path), [
		'Peak/Hub-Summaries/research.md',
		'Peak/system/User-Profile.md',
	]);
	assert.deepStrictEqual(items.map((item) => item.typeLabel), ['Materialized Hub', 'User Profile']);
	console.log('PASS: listsOnlyRegisteredMaterializedUserArtifacts');
}

testListsOnlyRegisteredMaterializedUserArtifacts().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
