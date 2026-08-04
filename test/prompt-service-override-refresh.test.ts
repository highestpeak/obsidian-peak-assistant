import assert from 'assert';
import { PromptService } from '@/service/prompt/PromptService';

async function testOverrideRefreshesAfterModifyAndDelete(): Promise<void> {
	let exists = true;
	let mtime = 1;
	let body = 'First override: {{subject}}';
	let reads = 0;
	const file = {
		path: 'Peak AI/Prompts/query-rewrite.prompt.md',
		extension: 'md',
		stat: { mtime },
	};
	const app = {
		vault: {
			getAbstractFileByPath(path: string) {
				if (!exists || path !== file.path) return null;
				file.stat.mtime = mtime;
				return file;
			},
			async read() {
				reads++;
				return body;
			},
		},
	};
	const service = new PromptService(
		app as any,
		{ rootFolder: 'Peak AI' } as any,
		undefined,
		{ render: async () => 'Built-in prompt: {{subject}}' } as any,
	);

	const first = await service.render('query-rewrite' as any, { subject: 'one' } as any);
	assert.strictEqual(first, 'First override: one');
	assert.strictEqual(reads, 1, 'first render reads the override file');

	body = 'Second override: {{subject}}';
	mtime = 2;
	const modified = await service.render('query-rewrite' as any, { subject: 'two' } as any);
	assert.strictEqual(modified, 'Second override: two', 'next render reads the modified override');
	assert.strictEqual(reads, 2, 'modified file invalidates the content cache');

	exists = false;
	const deleted = await service.render('query-rewrite' as any, { subject: 'three' } as any);
	assert.strictEqual(deleted, 'Built-in prompt: {{subject}}', 'deleted override immediately falls back to the bundled template');
	console.log('PASS: overrideRefreshesAfterModifyAndDelete');
}

async function testSavePromptOverrideWritesThroughTheExistingVaultOwner(): Promise<void> {
	let stored = '';
	let createdPath = '';
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			async create(path: string, content: string) {
				createdPath = path;
				stored = content;
				return { path, extension: 'md', stat: { mtime: 1 } };
			},
			async createFolder() {},
		},
	};
	const service = new PromptService(
		app as any,
		{ rootFolder: 'Peak AI' } as any,
		undefined,
		{ getTemplate: async () => 'unused' } as any,
	);

	await service.savePromptOverride('query-rewrite' as any, 'Use {{subject}}.');
	assert.strictEqual(createdPath, 'Peak AI/Prompts/query-rewrite.prompt.md');
	assert.match(stored, /id: query-rewrite/);
	assert.match(stored, /Use \{\{subject\}\}\./);
	console.log('PASS: savePromptOverrideWritesThroughTheExistingVaultOwner');
}

Promise.all([
	testOverrideRefreshesAfterModifyAndDelete(),
	testSavePromptOverrideWritesThroughTheExistingVaultOwner(),
]).then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
