import type { Command } from 'obsidian';
import type { MyPluginSettings, SearchSettings } from '@/core/config/settingsTypes';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { ViewManager } from '@/app/ui-host/views/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import {
	openChatStudio,
	openFileAtlas,
	openHarnessSetupWizard,
	openQuickSearch,
	openSettingsModal,
	openUsageDashboard,
} from '@/app/commands/PeakCommandActions';

/**
 * Registers the small set of top-level commands exposed through Obsidian's command palette.
 *
 * Maintenance, indexing, dangerous operations, and nested product actions live in
 * their owning product surfaces or Settings (Advanced → Maintenance) instead of
 * being flattened here.
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
			id: 'peak-open-command-center',
			name: 'Open Peak Command Center',
			callback: () => {
				const runtime = viewManager.appContext.runtimeRegistry.tryGetCommandCenterRuntime();
				if (runtime) runtime.openLauncher();
			},
		},
		{
			id: 'peak-open-settings',
			name: 'Settings',
			callback: openSettingsModal,
		},
		{
			id: 'peak-harness-setup-wizard',
			name: 'Setup Wizard',
			callback: openHarnessSetupWizard,
		},
		{
			id: 'peak-quick-search',
			name: 'Quick Search',
			callback: openQuickSearch,
		},
		{
			id: 'peak-file-atlas-open',
			name: 'Open File Atlas',
			callback: openFileAtlas,
		},
		{
			id: 'peak-usage-dashboard',
			name: 'Usage Dashboard',
			callback: openUsageDashboard,
		},
		{
			id: 'peak-open-chat-studio',
			name: 'Open Chat Studio',
			callback: openChatStudio,
		},
	];
}
