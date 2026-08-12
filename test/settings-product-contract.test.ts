import assert from 'node:assert/strict';
import {
	AGENT_SAFETY_MODES,
	INDEXABLE_FILE_TYPES,
	ONBOARDING_STEPS,
	PRODUCT_MODEL_FEATURES,
	SETTINGS_TABS,
} from '@/core/settings/peakSettingsContract';

assert.deepEqual(
	SETTINGS_TABS.map((tab) => tab.id),
	['aiModels', 'agents', 'knowledgeSearch', 'advanced'],
	'Settings has exactly the four owner-approved tabs',
);

assert.deepEqual(
	ONBOARDING_STEPS.map((step) => step.id),
	['connect-ai', 'core-models', 'prepare-vault', 'system-check', 'try-peak'],
	'Onboarding uses the five-step first-success flow',
);

assert.equal(
	AGENT_SAFETY_MODES.find((mode) => 'recommended' in mode && mode.recommended)?.id,
	'ask',
	'Ask every time is the safe launch default',
);

assert.deepEqual(
	INDEXABLE_FILE_TYPES.map((type) => type.type),
	['markdown', 'pdf', 'image', 'excalidraw', 'txt', 'csv', 'json', 'html', 'canvas'],
	'Only the agreed launch document types are user-selectable',
);
assert.equal(INDEXABLE_FILE_TYPES.some((entry) => entry.type === ('docx' as never)), false);
assert.equal(INDEXABLE_FILE_TYPES.some((entry) => entry.type === ('pptx' as never)), false);
assert.equal(INDEXABLE_FILE_TYPES.some((entry) => entry.type === ('xlsx' as never)), false);

const chat = PRODUCT_MODEL_FEATURES.find((feature) => feature.id === 'chat-studio');
const composer = PRODUCT_MODEL_FEATURES.find((feature) => feature.id === 'composer-copilot');
const agent = PRODUCT_MODEL_FEATURES.find((feature) => feature.id === 'agent-wizard');

assert.ok(chat?.actions.some((action) => action.id === 'attachments'));
assert.ok(chat?.actions.some((action) => action.id === 'image-generation'));
assert.ok(composer?.actions.some((action) => action.id === 'selected-text-rewrite'));
assert.equal(agent?.requiredCapabilities.tools, true, 'Peak Hermes requires a tool-capable model');

console.log('settings-product-contract: all assertions passed');
