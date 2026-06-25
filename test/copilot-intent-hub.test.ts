import assert from 'assert';
import {
	COPILOT_INTENT_TABS,
	getActionIntentTab,
	getIntentTabDefinition,
	type IntentHubId,
	type IntentTabId,
} from '../src/service/copilot/intent-hub';
import type { CopilotAction } from '../src/service/copilot/CopilotActionRegistry';

function action(
	id: string,
	category: CopilotAction['category'],
	intentTab?: CopilotAction['intentTab'],
): Pick<CopilotAction, 'id' | 'category' | 'intentTab'> {
	return { id, category, intentTab };
}

assert.deepStrictEqual(
	COPILOT_INTENT_TABS.map(tab => tab.id),
	['document', 'vault', 'setting'] satisfies IntentTabId[],
);

assert.deepStrictEqual(
	COPILOT_INTENT_TABS.map(tab => tab.hub),
	['copilot', 'vault-intelligence', 'manage-system'] satisfies IntentHubId[],
);

assert.deepStrictEqual(
	COPILOT_INTENT_TABS.map(tab => ({
		label: tab.label,
		subtitle: tab.subtitle,
		searchPlaceholder: tab.searchPlaceholder,
		autoLabel: tab.autoLabel,
	})),
	[
		{
			label: 'Document',
			subtitle: '= Copilot',
			searchPlaceholder: 'Search or ask in current document... (# heading, @ note, ? help)',
			autoLabel: 'Auto',
		},
		{
			label: 'Vault',
			subtitle: '= Vault Intelligence',
			searchPlaceholder: 'Search or ask across vault... (# in-file, @ folder, ? help)',
			autoLabel: 'Auto',
		},
		{
			label: 'Setting',
			subtitle: '= System',
			searchPlaceholder: 'Search settings, index, models, skills, prompts...',
			autoLabel: 'Auto',
		},
	],
);

assert.equal(getActionIntentTab(action('suggest-links', 'document')), 'document');
assert.equal(getActionIntentTab(action('rewrite-selection', 'writing')), 'document');
assert.equal(getActionIntentTab(action('add-evidence', 'vault')), 'document');
assert.equal(getActionIntentTab(action('continue-writing', 'vault')), 'document');
assert.equal(getActionIntentTab(action('writing-plan', 'vault')), 'document');
assert.equal(getActionIntentTab(action('write-article', 'vault')), 'document');
assert.equal(getActionIntentTab(action('vault-health', 'vault')), 'vault');
assert.equal(getActionIntentTab(action('prompt-audit', 'vault')), 'setting');
assert.equal(getActionIntentTab(action('custom-setting-action', 'document', 'setting')), 'setting');

assert.strictEqual(getIntentTabDefinition('vault').id, 'vault');
assert.strictEqual(getIntentTabDefinition('setting').hub, 'manage-system');
assert.strictEqual(getIntentTabDefinition('missing' as IntentTabId).id, 'document');
