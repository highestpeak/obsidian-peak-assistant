import type { Command } from 'obsidian';
import type { MyPluginSettings, SearchSettings } from '@/app/settings/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { registerAllCopilotActions } from '@/service/copilot/actions';
import {
	openBatchTagSuggestions,
	openChatStudio,
	openCopilotPanel,
	openCopilotReviewHistory,
	openGapAnalysis,
	openHarnessSetupWizard,
	openQuickSearch,
	openRelatedNotes,
	openSettingsModal,
	openUsageDashboard,
	openVaultXRay,
} from '@/app/commands/PeakCommandActions';
import { loadMockConversationForIndexPreview } from '@/app/commands/DebugCommandActions';

/**
 * Registers the small set of top-level commands exposed through Obsidian's command palette.
 *
 * Maintenance, indexing, dangerous operations, and nested product actions live in
 * Copilot (Document/Vault/Setting tabs) or Settings (Advanced → Maintenance)
 * instead of being flattened here. The Chat view is reachable via its sidebar
 * ribbon icon (`message-circle`), so no palette command is needed for it.
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
			id: 'peak-open-chat-studio',
			name: 'Open Chat Studio',
			callback: openChatStudio,
		},
		{
			id: 'peak-usage-dashboard',
			name: 'Usage Dashboard',
			callback: openUsageDashboard,
		},
		{
			id: 'peak-vault-xray',
			name: 'Open Vault X-Ray',
			callback: openVaultXRay,
		},
		{
			id: 'peak-gap-analysis',
			name: 'Open Gap Analysis',
			callback: openGapAnalysis,
		},
		{
			id: 'peak-related-notes',
			name: 'Open Related Notes',
			callback: openRelatedNotes,
		},
		{
			id: 'peak-batch-tag',
			name: 'Batch Tag Suggestions',
			callback: openBatchTagSuggestions,
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
		// TEMPORARY — remove together with DebugCommandActions.ts once the
		// Conversation Index design work is signed off.
		{
			id: 'peak-debug-load-mock-conversation',
			name: '[Debug] Load mock conversation for index preview',
			callback: loadMockConversationForIndexPreview,
		},
	];
}
