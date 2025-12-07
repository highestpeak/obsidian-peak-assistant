import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/service/chat/service-manager';
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
