import assert from 'assert';
import fs from 'fs';
import path from 'path';

function source(relativePath: string): string {
	return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function testRetiredPromptModelMapHasNoRuntimePath(): void {
	const files = [
		'src/core/config/settingsTypes.ts',
		'src/app/settings/PluginSettingsLoader.ts',
		'src/service/chat/service-manager.ts',
		'src/service/chat/context/BuildUserProfileRunner.ts',
		'src/service/search/support/llm-enrichment-progress-tracker.ts',
	];
	for (const file of files) {
		assert.ok(!source(file).includes('promptModelMap'), `${file} must not revive the retired prompt model map`);
	}
	assert.match(
		source('src/service/search/support/llm-enrichment-progress-tracker.ts'),
		/getActiveAgentModel\(\)/,
		'indexing estimates must use the route model that will actually execute',
	);
	assert.match(
		source('src/service/chat/context/BuildUserProfileRunner.ts'),
		/getActiveAgentModel\(\)/,
		'profile scans must size input against the route model that will actually execute',
	);
	console.log('PASS: retiredPromptModelMapHasNoRuntimePath');
}

testRetiredPromptModelMapHasNoRuntimePath();
