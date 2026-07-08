import type { CopilotAction } from './CopilotActionRegistry';

// 'atlas' and 'ambient' are new picker tabs shown in the Copilot Modal.
// 'vault' remains for action categorization + Search Modal's Vault Intelligence
// panel (Copilot Modal no longer shows it as a tab).
// 'setting' remains for action categorization (command-only, no picker tab).
export type IntentTabId = 'document' | 'vault' | 'setting' | 'atlas' | 'ambient';
export type IntentHubId = 'copilot' | 'vault-intelligence' | 'manage-system' | 'atlas' | 'ambient';

export interface IntentTabDefinition {
	id: IntentTabId;
	hub: IntentHubId;
	label: string;
	subtitle: string;
	searchPlaceholder: string;
	autoLabel: string;
}

export const COPILOT_INTENT_TABS: IntentTabDefinition[] = [
	{
		id: 'document',
		hub: 'copilot',
		label: 'Document',
		subtitle: '= Copilot',
		searchPlaceholder: 'Search or ask in current document... (# heading, @ note, ? help)',
		autoLabel: 'Auto',
	},
	{
		id: 'vault',
		hub: 'vault-intelligence',
		label: 'Vault',
		subtitle: '= Vault Intelligence',
		searchPlaceholder: 'Search or ask across vault... (# in-file, @ folder, ? help)',
		autoLabel: 'Auto',
	},
	{
		id: 'setting',
		hub: 'manage-system',
		label: 'Setting',
		subtitle: '= System',
		searchPlaceholder: 'Search settings, index, models, skills, prompts...',
		autoLabel: 'Auto',
	},
];

const SETTING_ACTION_IDS = new Set([
	'prompt-audit',
]);

const DOCUMENT_ACTION_IDS = new Set([
	'add-evidence',
	'continue-writing',
	'rewrite-selection',
	'writing-plan',
	'write-article',
]);

export function getActionIntentTab(action: Pick<CopilotAction, 'id' | 'category' | 'intentTab'>): IntentTabId {
	if (action.intentTab) return action.intentTab;
	if (SETTING_ACTION_IDS.has(action.id)) return 'setting';
	if (action.category === 'document') return 'document';
	if (action.category === 'writing') return 'document';
	if (DOCUMENT_ACTION_IDS.has(action.id)) return 'document';
	return 'vault';
}

export function getIntentTabDefinition(id: IntentTabId): IntentTabDefinition {
	return COPILOT_INTENT_TABS.find(tab => tab.id === id) ?? COPILOT_INTENT_TABS[0];
}
