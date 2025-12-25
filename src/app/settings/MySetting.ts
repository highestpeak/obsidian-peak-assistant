import { App, PluginSettingTab } from 'obsidian';
import type MyPlugin from 'main';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';
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
