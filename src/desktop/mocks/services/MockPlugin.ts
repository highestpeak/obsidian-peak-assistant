import { DEFAULT_SETTINGS, MyPluginSettings } from '@/app/settings/types';
import { MockAIServiceManager } from './MockAIServiceManager';
import { MockCommandHiddenControlService } from './MockCommandHiddenControlService';

/**
 * Mock Plugin for desktop development
 */
export class MockPlugin {
	settings: MyPluginSettings = { ...DEFAULT_SETTINGS };

	aiServiceManager = new MockAIServiceManager() as any;
	commandHiddenControlService = new MockCommandHiddenControlService(this.settings.commandHidden);

	/**
	 * Mock saveSettings method for desktop development
	 */
	async saveSettings() {
		console.log('MockPlugin: saveSettings', this.settings);
		// In desktop mode, we don't actually save to disk
		// Just simulate the async operation
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}
