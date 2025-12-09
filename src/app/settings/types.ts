import { RootMode } from '@/service/chat/types';
import { ProviderConfig } from '@/service/chat/providers/types';
import { CommandHiddenSettings, DEFAULT_COMMAND_HIDDEN_SETTINGS } from '@/service/CommandHiddenControlService';

/**
 * Shape of plugin-level persisted settings.
 */
export interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	ai: AIServiceSettings;
	commandHidden: CommandHiddenSettings;
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
 * Baseline settings applied when no persisted data exists.
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	commandHidden: DEFAULT_COMMAND_HIDDEN_SETTINGS,
};
