import type { Command } from 'obsidian';
import type { MyPluginSettings, SearchSettings } from '@/app/settings/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { registerAllCopilotActions } from '@/service/copilot/actions';
import {
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openKnowledgeCenter,
	openQuickSearch,
	openSettingsModal,
} from '@/app/commands/PeakCommandActions';

/**
 * Registers the small set of top-level commands exposed through Obsidian's command palette.
 *
 * Maintenance, indexing, dangerous operations, and nested product actions live in
 * Copilot (Document/Vault/Setting tabs), Knowledge Center, or Settings (Advanced →
 * Maintenance) instead of being flattened here. The Chat view is reachable via its
 * sidebar ribbon icon (`message-circle`), so no palette command is needed for it.
 */
export function buildCoreCommands(
	settings: MyPluginSettings,
	viewManager: ViewManager,
	aiManager: AIServiceManager,
	searchClient: SearchClient | null,
	indexInitializer: IndexInitializer,
	searchSettings?: SearchSettings,
	storageFolder?: string,
): Command[] {
	void settings;
	void viewManager;
	void aiManager;
	void searchClient;
	void indexInitializer;
	void searchSettings;
	void storageFolder;

	registerAllCopilotActions();

	return [
		{
			id: 'peak-quick-search',
			name: 'Quick Search',
			callback: openQuickSearch,
		},
		{
			id: 'peak-copilot-open',
			name: 'Open Copilot',
			callback: openCopilotPanel,
		},
		{
			id: 'peak-copilot-review-history',
			name: 'Open Auto Review History',
			callback: openCopilotReviewHistory,
		},
		{
			id: 'peak-knowledge-center',
			name: 'Open Knowledge Center',
			callback: openKnowledgeCenter,
		},
		{
			id: 'peak-harness-setup-wizard',
			name: 'Setup Wizard',
			callback: openHarnessSetupWizard,
		},
		{
			id: 'peak-open-settings',
			name: 'Settings',
			callback: openSettingsModal,
		},
	];
}
