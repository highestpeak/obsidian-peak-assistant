import { RootMode } from '@/service/chat/types';
import { ProviderConfig } from '@/service/chat/providers/types';
import { CommandHiddenSettings, DEFAULT_COMMAND_HIDDEN_SETTINGS } from '@/service/CommandHiddenControlService';

/**
 * Document types included for indexing.
 */
export interface SearchDocumentTypeToggle {
	markdown: boolean;
	pdf: boolean;
	image: boolean;
}

/**
 * Search-related settings.
 */
export interface SearchSettings {
	/**
	 * Automatically index files on startup.
	 * If false, user must manually trigger indexing via command.
	 */
	autoIndex: boolean;
	/**
	 * File types to include in indexing.
	 */
	includeDocumentTypes: SearchDocumentTypeToggle;
}

/**
 * Shape of plugin-level persisted settings.
 */
export interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	dataStorageFolder: string;
	ai: AIServiceSettings;
	commandHidden: CommandHiddenSettings;
	search: SearchSettings;
}

/**
 * AI service configuration settings.
 */
export interface AIServiceSettings {
	rootFolder: string;
	rootMode: RootMode;
	promptFolder: string;
	uploadFolder: string;
	defaultModelId: string;
	llmProviderConfigs: Record<string, ProviderConfig>;
}

/**
 * Default values for AI service settings.
 */
export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	rootMode: 'conversation-first',
	promptFolder: 'A-control/PeakAssistantPrompts',
	uploadFolder: 'ChatFolder/Attachments',
	defaultModelId: 'gpt-4.1-mini',
	llmProviderConfigs: {},
};

/**
 * Default search settings.
 */
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
	autoIndex: false, // Default to manual indexing
	includeDocumentTypes: {
		markdown: true,
		pdf: true,
		image: true,
	},
};

/**
 * Baseline settings applied when no persisted data exists.
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	dataStorageFolder: '',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	commandHidden: DEFAULT_COMMAND_HIDDEN_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,
};
