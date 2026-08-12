import assert from 'node:assert/strict';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

const defaults = normalizePluginSettings({});
assert.equal(defaults.modelRouting.automatic.optimizeFor, 'recommended');
assert.equal(defaults.modelRouting.automatic.processingLocation, 'cloud-and-local');
assert.equal(defaults.harnessSettings?.defaultPermissionMode, 'ask');
assert.equal(defaults.search.includeFolders.length, 0, 'empty folders means whole Vault');
assert.equal(defaults.search.maintenance.batchSize, 25);

const configured = normalizePluginSettings({
	ai: { attachmentHandlingDefault: 'degrade_to_text' },
	modelRouting: {
		automatic: { optimizeFor: 'higher-quality', processingLocation: 'prefer-local' },
		assignments: {
			'chat-studio': { mode: 'fixed', config: { profileId: 'p1', modelId: 'm1' } },
			broken: { mode: 'fixed', config: { profileId: 3, modelId: null } },
		},
		advancedControls: { 'chat-studio': { reasoningEffort: 'high' } },
	},
	modelCatalog: {
		hiddenModels: ['p1/old'], aliases: { 'p1/m1': 'Daily model' },
		openRouterCatalogUrl: 'https://example.test/models.json', lastCheckedAt: 8, lastModified: 'etag-a',
	},
	search: {
		includeFolders: ['Notes', 4],
		maintenance: {
			changeDebounceMs: 7500, onStartup: 'prompt', largeChangeSetThreshold: 80,
			batchSize: 40, retryAttempts: 4,
		},
	},
	harnessSettings: {
		defaultPermissionMode: 'ask',
		executionModel: { profileId: 'p1', modelId: 'm1' },
		tools: { skills: false },
		permissions: { networkAccess: 'deny' },
	},
});

assert.equal(configured.ai.attachmentHandlingDefault, 'degrade_to_text');
assert.deepEqual(configured.modelRouting.assignments['chat-studio'], {
	mode: 'fixed', config: { profileId: 'p1', modelId: 'm1' },
});
assert.equal(configured.modelRouting.assignments.broken, undefined);
assert.equal(configured.modelRouting.advancedControls['chat-studio']?.reasoningEffort, 'high');
assert.deepEqual(configured.modelCatalog.aliases, { 'p1/m1': 'Daily model' });
assert.deepEqual(configured.search.includeFolders, ['Notes']);
assert.equal(configured.search.maintenance.changeDebounceMs, 7500);
assert.equal(configured.harnessSettings?.executionModel?.modelId, 'm1');
assert.equal(configured.harnessSettings?.tools.skills, false);
assert.equal(configured.harnessSettings?.tools.mcp, true, 'missing tool flags inherit defaults');
assert.equal(configured.harnessSettings?.permissions.networkAccess, 'deny');

console.log('settings-model-routing-roundtrip: all assertions passed');
