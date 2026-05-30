import type { Command } from 'obsidian';
import type { MyPluginSettings, SearchSettings } from '@/app/settings/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { AppContext } from '@/app/context/AppContext';
import { registerAllCopilotActions } from '@/service/copilot/actions';
import { CommandCenterModal } from '@/ui/view/command-center/CommandCenterModal';
import {
	openAssistant,
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openKnowledgeCenter,
	openQuickSearch,
	openSettingsModal,
	openUsageDashboard,
} from '@/app/commands/PeakCommandActions';

/**
 * Registers the small set of top-level commands exposed through Obsidian's command palette.
 *
 * Maintenance, indexing, dangerous operations, and nested product actions now live in
 * Command Center, Knowledge Center, Copilot, or Settings instead of being flattened here.
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
	const appContext = AppContext.getInstance();

	return [
		{
			id: 'peak-chat-open-view',
			name: 'Open Assistant',
			callback: openAssistant,
		},
		{
			id: 'peak-command-center',
			name: 'Command Center',
			callback: () => new CommandCenterModal(appContext).open(),
		},
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
			id: 'peak-usage-dashboard',
			name: 'Usage Dashboard',
			callback: openUsageDashboard,
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
