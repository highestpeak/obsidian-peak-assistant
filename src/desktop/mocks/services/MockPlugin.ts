import { DEFAULT_SETTINGS, MyPluginSettings } from '@/app/settings/types';
import { MockAIServiceManager } from './MockAIServiceManager';

/**
 * Mock Plugin for desktop development
 */
export class MockPlugin {
	settings: MyPluginSettings = { ...DEFAULT_SETTINGS };

	aiServiceManager = new MockAIServiceManager() as any;
	commandHiddenControlService = {
		isCommandHidden: (commandId: string) => false,
		setCommandHidden: (commandId: string, hidden: boolean) => {},
	} as any;
}

