import type { Command } from 'obsidian';
import type { MyPluginSettings, SearchSettings } from '@/app/settings/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import {
	openChatStudio,
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openQuickSearch,
	openRelatedNotes,
	openSettingsModal,
	openUsageDashboard,
	openVaultXRay,
} from '@/app/commands/PeakCommandActions';

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

	// T11B (2026-06-14): Copilot manual-action catalog is now owned by
	// the app-level `CopilotActionRuntime` (composed in `main.ts` after
	// sqlite + AIServiceManager are ready). `buildCoreCommands` no
	// longer registers actions as a boot side effect — UI reaches the
	// runtime via `AppContext.tryGetCopilotActionRuntime()`.

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
			id: 'peak-related-notes',
			name: 'Open Related Notes',
			callback: openRelatedNotes,
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
