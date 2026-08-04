import assert from 'assert';
import fs from 'fs';
import path from 'path';

const sourcePath = path.resolve(
	process.cwd(),
	'src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts',
);
const source = fs.readFileSync(sourcePath, 'utf8');

function testCustomPromptWatcherMatchesLoaderScope(): void {
	for (const event of ['create', 'modify', 'delete', 'rename']) {
		assert.match(source, new RegExp(`app\\.vault\\.on\\('${event}'`), `must watch Vault ${event} events`);
	}
	assert.match(source, /isDirectPromptFile\(path: string\)/, 'watcher must share a direct-file scope check');
	assert.match(source, /parentPath === normalizePath\(this\.opts\.resolveFolder\(\)\)/, 'watcher must ignore nested files the loader does not read');
	assert.match(source, /refs\.forEach\(\(ref\) => app\.vault\.offref\(ref\)\)/, 'watcher must release all Vault subscriptions');
	console.log('PASS: customPromptWatcherMatchesLoaderScope');
}

try {
	testCustomPromptWatcherMatchesLoaderScope();
	process.exit(0);
} catch (error) {
	console.error(error);
	process.exit(1);
}
