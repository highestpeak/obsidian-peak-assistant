import { App, PluginSettingTab } from 'obsidian';
import type MyPlugin from 'main';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, DEFAULT_SEARCH_SETTINGS, DEFAULT_SETTINGS, MyPluginSettings } from '@/app/settings/types';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { SettingsRoot } from '@/ui/view/SettingsView';
import { EventBus } from '@/core/eventBus';

/**
 * Renders plugin settings UI with multiple tabs.
 */
export class MySettings extends PluginSettingTab {
	private readonly pluginRef: MyPlugin;
	private settingsRenderer: ReactRenderer | null = null;
	private eventBus: EventBus;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.pluginRef = plugin;
		this.eventBus = EventBus.getInstance(app);
	}

	/**
	 * Builds the full settings layout and tab navigation.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Clean up React renderer when re-rendering
		if (this.settingsRenderer) {
			this.settingsRenderer.unmount();
			this.settingsRenderer = null;
		}

		// Render the complete settings UI using SettingsRoot component
		this.settingsRenderer = new ReactRenderer(containerEl);
		this.settingsRenderer.render(
			React.createElement(SettingsRoot, {
				plugin: this.pluginRef,
				eventBus: this.eventBus,
			})
		);
	}

}

/**
 * Load and normalize plugin settings from persisted data.
 */
export function normalizePluginSettings(data: unknown): MyPluginSettings {
	const raw = (data ?? {}) as Record<string, unknown>;
	const settings: MyPluginSettings = Object.assign({}, DEFAULT_SETTINGS, raw);
	const legacyChatSettings = raw?.chat as Partial<AIServiceSettings> | undefined;
	settings.ai = Object.assign({}, DEFAULT_AI_SERVICE_SETTINGS, raw?.ai ?? legacyChatSettings ?? {});
	settings.search = Object.assign({}, DEFAULT_SEARCH_SETTINGS, raw?.search ?? {});
	// Migrate from legacy neverPromptAgain to autoIndex
	if (raw?.search && typeof raw.search === 'object' && 'neverPromptAgain' in raw.search) {
		settings.search.autoIndex = !(raw.search as any)?.neverPromptAgain;
		delete (settings.search as any).neverPromptAgain;
	}
	// Normalize includeDocumentTypes: merge with defaults, ensuring all DocumentTypes are present
	const rawIncludeTypes = (settings.search as any)?.includeDocumentTypes ?? {};
	settings.search.includeDocumentTypes = Object.assign(
		{},
		DEFAULT_SEARCH_SETTINGS.includeDocumentTypes,
		rawIncludeTypes,
	);
	// Ensure chunking settings exist
	if (!settings.search.chunking) {
		settings.search.chunking = DEFAULT_SEARCH_SETTINGS.chunking;
	} else {
		settings.search.chunking = Object.assign(
			{},
			DEFAULT_SEARCH_SETTINGS.chunking,
			settings.search.chunking,
		);
	}
	if (!settings.ai.promptFolder) {
		const legacyPromptFolder = typeof raw?.promptFolder === 'string' ? (raw.promptFolder as string) : undefined;
		settings.ai.promptFolder = legacyPromptFolder || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
	}
	settings.ai.defaultModelId = settings.ai.defaultModelId || 'gpt-4.1-mini';
	// Set defaults for memory/profile/rewrite if not present
	if (settings.ai.memoryEnabled === undefined) {
		settings.ai.memoryEnabled = DEFAULT_AI_SERVICE_SETTINGS.memoryEnabled ?? true;
	}
	if (!settings.ai.memoryFilePath) {
		settings.ai.memoryFilePath = DEFAULT_AI_SERVICE_SETTINGS.memoryFilePath;
	}
	if (settings.ai.profileEnabled === undefined) {
		settings.ai.profileEnabled = DEFAULT_AI_SERVICE_SETTINGS.profileEnabled ?? true;
	}
	if (!settings.ai.profileFilePath) {
		settings.ai.profileFilePath = DEFAULT_AI_SERVICE_SETTINGS.profileFilePath;
	}
	if (settings.ai.promptRewriteEnabled === undefined) {
		settings.ai.promptRewriteEnabled = DEFAULT_AI_SERVICE_SETTINGS.promptRewriteEnabled ?? false;
	}
	settings.commandHidden = Object.assign({}, settings.commandHidden, raw?.uiControl ?? {});
	const settingsBag = settings as unknown as Record<string, unknown>;
	delete settingsBag.chat;
	return settings;
}
