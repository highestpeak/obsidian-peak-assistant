import assert from 'assert';
import { readFileSync } from 'fs';

const ports = readFileSync('src/service/composer/ports.ts', 'utf8');
const controller = readFileSync('src/app/composer/DocumentComposerController.ts', 'utf8');
const adapters = readFileSync('src/app/composer/ObsidianComposerAdapters.ts', 'utf8');
const viewManager = readFileSync('src/app/ui-host/views/ViewManager.ts', 'utf8');

for (const [name, source] of [
	['Composer file event port', ports],
	['Composer controller', controller],
	['Obsidian Composer adapters', adapters],
] as const) {
	assert.doesNotMatch(source, /onActiveFileChange|getActiveFilePath/, `${name} must not follow the active file`);
}
assert.doesNotMatch(
	viewManager,
	/getLeavesOfType\(DOCUMENT_COMPOSER_VIEW_TYPE\)\[0\]/,
	'opening Composer must never reuse the first unrelated Composer leaf',
);
assert.match(
	controller,
	/start\(filePath: string, preparationId\?: string\)/,
	'each Composer controller must start with an explicit file and optional prepared session',
);
assert.match(
	controller,
	/bindFile\(filePath: string, preparationId\?: string\)/,
	'leaf state is the only supported rebind path',
);

console.log('composer-old-follower-retirement: passed');
