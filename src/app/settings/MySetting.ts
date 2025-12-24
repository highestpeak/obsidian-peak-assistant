import { App, PluginSettingTab } from 'obsidian';
import type MyPlugin from 'main';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, DEFAULT_SEARCH_SETTINGS, DEFAULT_SETTINGS, MyPluginSettings, SearchSettings } from '@/app/settings/types';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { SettingsRoot } from '@/ui/view/SettingsView';
import { EventBus } from '@/core/eventBus';

/**
 * Plugin settings tab that renders React-based settings UI.
 */
export class MySettings extends PluginSettingTab {
	private readonly pluginRef: MyPlugin;
	private reactRenderer: ReactRenderer | null = null;
	private eventBus: EventBus;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.pluginRef = plugin;
		this.eventBus = EventBus.getInstance(app);
	}

	/**
	 * Renders the settings UI using React.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Clean up previous renderer if exists
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}

		// Create container for React component
		const reactContainer = containerEl.createDiv();
		this.reactRenderer = new ReactRenderer(reactContainer);

		// Render React root component
		this.reactRenderer.render(
			React.createElement(SettingsRoot, {
				plugin: this.pluginRef,
				eventBus: this.eventBus,
			})
		);
	}

	/**
	 * Clean up React renderer when settings tab is hidden.
	 */
	hide(): void {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		super.hide();
	}
}

/**
 * Merge nested settings with defaults.
 */
function mergeNestedSettings<T>(defaults: T, raw: unknown): T {
	return Object.assign({}, defaults, raw ?? {});
}

/**
 * Normalize AI service settings, handling legacy chat settings migration.
 */
function normalizeAISettings(raw: Record<string, unknown>): AIServiceSettings {
	const legacyChatSettings = raw?.chat as Partial<AIServiceSettings> | undefined;
	const aiSettings = mergeNestedSettings(
		DEFAULT_AI_SERVICE_SETTINGS,
		raw?.ai ?? legacyChatSettings ?? {}
	);

	// Migrate legacy promptFolder from root level
	if (!aiSettings.promptFolder && typeof raw?.promptFolder === 'string') {
		aiSettings.promptFolder = raw.promptFolder;
	}

	// Ensure defaultModelId has a fallback
	if (!aiSettings.defaultModelId) {
		aiSettings.defaultModelId = DEFAULT_AI_SERVICE_SETTINGS.defaultModelId;
	}

	return aiSettings;
}

/**
 * Normalize search settings, handling legacy migrations.
 */
function normalizeSearchSettings(raw: Record<string, unknown>): SearchSettings {
	const rawSearch = raw?.search;
	const searchSettings = mergeNestedSettings(
		DEFAULT_SEARCH_SETTINGS,
		rawSearch ?? {}
	);

	// Migrate legacy neverPromptAgain to autoIndex
	if (rawSearch && typeof rawSearch === 'object' && 'neverPromptAgain' in rawSearch) {
		searchSettings.autoIndex = !(rawSearch as Record<string, unknown>).neverPromptAgain;
	}

	// Normalize includeDocumentTypes: merge with defaults
	const rawIncludeTypes = (rawSearch as Record<string, unknown>)?.includeDocumentTypes ?? {};
	searchSettings.includeDocumentTypes = mergeNestedSettings(
		DEFAULT_SEARCH_SETTINGS.includeDocumentTypes,
		rawIncludeTypes
	);

	// Normalize chunking settings
	searchSettings.chunking = mergeNestedSettings(
		DEFAULT_SEARCH_SETTINGS.chunking,
		searchSettings.chunking ?? {}
	);

	return searchSettings;
}

/**
 * Load and normalize plugin settings from persisted data.
 * Handles legacy settings migration and ensures all required fields are present.
 */
export function normalizePluginSettings(data: unknown): MyPluginSettings {
	const raw = (data ?? {}) as Record<string, unknown>;
	const settings: MyPluginSettings = mergeNestedSettings(DEFAULT_SETTINGS, raw);

	// Normalize nested settings
	settings.ai = normalizeAISettings(raw);
	settings.search = normalizeSearchSettings(raw);
	settings.commandHidden = mergeNestedSettings(
		settings.commandHidden,
		raw?.uiControl ?? {}
	);

	// Remove legacy chat property if it exists
	const settingsBag = settings as unknown as Record<string, unknown>;
	delete settingsBag.chat;

	return settings;
}
