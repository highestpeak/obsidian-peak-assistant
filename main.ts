import { App, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EventDispatcher } from 'src/EventDispatcher';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-Control',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;

	async onload() {
		await this.loadSettings();
		this.eventHandler = new EventDispatcher(this.app, this);
		this.eventHandler.addScriptFolderListener(this.settings.scriptFolder)

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('EventScriptFolder')
			.setDesc('Script in this folder will be register to listen to target events.')
			.addText(text => text
				.setPlaceholder('Enter your Folder')
				.setValue(this.plugin.settings.scriptFolder)
				.onChange(async (value) => {
					this.plugin.settings.scriptFolder = value;
					this.plugin.eventHandler.addScriptFolderListener(value)
					await this.plugin.saveSettings();
				}));
	}
}
