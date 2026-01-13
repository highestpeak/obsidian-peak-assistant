import { useCallback } from 'react';
import type MyPlugin from 'main';
import type { MyPluginSettings } from '@/app/settings/types';
import { EventBus, SettingsUpdatedEvent } from '@/core/eventBus';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { PromptId } from '@/service/prompt/PromptId';

/**
 * Generic hook for creating update functions for nested settings.
 * This eliminates the need to write individual callbacks for each setting field.
 * Handles saving, service updates, and event dispatching.
 * 
 * @param plugin - The plugin instance
 * @param eventBus - The event bus for dispatching events
 * @param settings - Current settings object
 * @returns Object with update functions for different settings sections
 */
export function useSettingsUpdate(
	plugin: MyPlugin,
	eventBus: EventBus,
	settings: MyPluginSettings
) {
	/**
	 * Main update function that handles side effects (saving, service updates, events)
	 */
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

			// Handle search settings side effects
			if (updates.search) {
				DocumentLoaderManager.getInstance().updateSettings(
					plugin.settings.search
				);
			}

			// Save to disk
			await plugin.saveSettings();

			// Dispatch settings updated event
			eventBus.dispatch(new SettingsUpdatedEvent());
		},
		[plugin, eventBus]
	);
	/**
	 * Update top-level settings directly
	 */
	const update = useCallback(
		<K extends keyof MyPluginSettings>(key: K, value: MyPluginSettings[K]) => {
			return updateSettings({ [key]: value } as Partial<MyPluginSettings>);
		},
		[updateSettings]
	);

	/**
	 * Update AI settings section
	 */
	const updateAI = useCallback(
		<K extends keyof MyPluginSettings['ai']>(key: K, value: MyPluginSettings['ai'][K]) => {
			return updateSettings({
				ai: {
					...plugin.settings.ai,
					[key]: value,
				},
			});
		},
		[updateSettings] // Remove settings.ai dependency to avoid stale closure
	);

	/**
	 * Update search settings section
	 */
	const updateSearch = useCallback(
		<K extends keyof MyPluginSettings['search']>(key: K, value: MyPluginSettings['search'][K]) => {
			return updateSettings({
				search: {
					...plugin.settings.search,
					[key]: value,
				},
			});
		},
		[updateSettings] // Remove settings.search dependency to avoid stale closure
	);

	/**
	 * Update search.chunking settings section
	 */
	const updateChunking = useCallback(
		<K extends keyof NonNullable<MyPluginSettings['search']['chunking']>>(
			key: K,
			value: NonNullable<MyPluginSettings['search']['chunking']>[K]
		) => {
			if (!plugin.settings.search.chunking) return Promise.resolve();
			return updateSettings({
				search: {
					...plugin.settings.search,
					chunking: {
						...plugin.settings.search.chunking,
						[key]: value,
					},
				},
			});
		},
		[updateSettings] // Remove settings.search dependency to avoid stale closure
	);

	/**
	 * Update model configuration in AI settings (defaultModel)
	 */
	const updateDefaultModel = useCallback(
		(provider: string, modelId: string) => {
			return updateSettings({
				ai: {
					...plugin.settings.ai,
					defaultModel: { provider, modelId },
				},
			});
		},
		[updateSettings] // Remove settings.ai dependency to avoid stale closure
	);

	/**
	 * Update model configuration in search settings (searchSummaryModel)
	 */
	const updateSearchModel = useCallback(
		(key: 'searchSummaryModel', provider: string, modelId: string) => {
			return updateSettings({
				search: {
					...plugin.settings.search,
					[key]: { provider, modelId },
				},
			});
		},
		[updateSettings] // Remove settings.search dependency to avoid stale closure
	);

	/**
	 * Update model configuration in search.chunking settings (embeddingModel, rerankModel)
	 */
	const updateChunkingModel = useCallback(
		(key: 'embeddingModel' | 'rerankModel', provider: string, modelId: string) => {
			if (!plugin.settings.search.chunking) return Promise.resolve();
			return updateSettings({
				search: {
					...plugin.settings.search,
					chunking: {
						...plugin.settings.search.chunking,
						[key]: { provider, modelId },
					},
				},
			});
		},
		[updateSettings] // Remove settings.search dependency to avoid stale closure
	);

	/**
	 * Update includeDocumentTypes in search settings
	 */
	const updateDocumentType = useCallback(
		(type: string, value: boolean) => {
			return updateSettings({
				search: {
					...plugin.settings.search,
					includeDocumentTypes: {
						...plugin.settings.search.includeDocumentTypes,
						[type]: value,
					},
				},
			});
		},
		[updateSettings] // Remove settings.search dependency to avoid stale closure
	);

	/**
	 * Update AI provider settings
	 */
	const updateAISettings = useCallback(
		(updates: Partial<MyPluginSettings['ai']>) => {
			return updateSettings({
				ai: {
					...plugin.settings.ai,
					...updates,
				},
			});
		},
		[updateSettings] // Remove settings.ai dependency to avoid stale closure
	);

	/**
	 * Update prompt model configuration
	 */
	const updatePromptModel = useCallback(
		(promptId: string, provider: string, modelId: string) => {
			// Only update configurable prompt IDs
			const existingMap = plugin.settings.ai.promptModelMap || {};
			return updateSettings({
				ai: {
					...plugin.settings.ai,
					promptModelMap: {
						...existingMap,
						[promptId]: { provider, modelId },
					},
				},
			});
		},
		[updateSettings] // Remove settings.ai dependency to avoid stale closure
	);

	return {
		update,
		updateAI,
		updateSearch,
		updateChunking,
		updateDocumentType,
		updateAISettings,
		updateDefaultModel,
		updateSearchModel,
		updateChunkingModel,
		updatePromptModel,
		updateSettings,
	};
}

/**
 * Type for the return value of useSettingsUpdate hook
 */
export type SettingsUpdates = ReturnType<typeof useSettingsUpdate>;

