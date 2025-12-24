import { useCallback } from 'react';
import type MyPlugin from 'main';
import { MyPluginSettings } from '@/app/settings/types';
import { EventBus, SettingsUpdatedEvent } from '@/core/eventBus';

/**
 * Hook for managing plugin settings updates with side effects.
 * Handles saving, service updates, and event dispatching.
 */
export function usePluginSettings(plugin: MyPlugin, eventBus: EventBus) {
	const updateSettings = useCallback(
		async (updates: Partial<MyPluginSettings>) => {
			// Merge updates into current settings
			plugin.settings = {
				...plugin.settings,
				...updates,
			};

			// Handle AI settings side effects
			if (updates.ai) {
				// If promptFolder changed, update it separately
				if (updates.ai.promptFolder !== undefined) {
					plugin.aiServiceManager?.setPromptFolder(plugin.settings.ai.promptFolder);
				}
				plugin.aiServiceManager?.updateSettings(plugin.settings.ai);
				plugin.aiServiceManager?.refreshDefaultServices();
				await plugin.aiServiceManager?.init();
			}

			// Handle command hidden settings side effects
			if (updates.commandHidden) {
				plugin.commandHiddenControlService?.updateSettings(plugin.settings.commandHidden);
			}

			// Save to disk
			await plugin.saveSettings();

			// Dispatch settings updated event
			eventBus.dispatch(new SettingsUpdatedEvent());
		},
		[plugin, eventBus]
	);

	return { updateSettings };
}
