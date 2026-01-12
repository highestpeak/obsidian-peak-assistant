import { App, PluginSettingTab } from 'obsidian';
import type MyPlugin from 'main';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { SettingsRoot } from '@/ui/view/SettingsView';
import { AppContext } from '@/app/context/AppContext';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';

/**
 * Renders plugin settings UI with multiple tabs.
 */
export class MySettings extends PluginSettingTab {
	private settingsRenderer: ReactRenderer | null = null;
	private appContext: AppContext;

	constructor(app: App, plugin: MyPlugin, appContext: AppContext) {
		super(app, plugin);
		this.appContext = appContext;
	}

	/**
	 * Builds the full settings layout and tab navigation.
	 */
	display(): void {
		const { containerEl } = this;

		// Clean up React renderer before emptying container
		if (this.settingsRenderer) {
			this.settingsRenderer.unmount();
			this.settingsRenderer = null;
		}

		// Empty container after unmounting
		containerEl.empty();

		// Render the complete settings UI using SettingsRoot component with service context
		this.settingsRenderer = new ReactRenderer(containerEl);
		this.settingsRenderer.render(
			createReactElementWithServices(SettingsRoot, {}, this.appContext)
		);
	}

	/**
	 * Clean up when settings tab is closed
	 */
	hide(): void {
		if (this.settingsRenderer) {
			this.settingsRenderer.unmount();
			this.settingsRenderer = null;
		}
	}

}
