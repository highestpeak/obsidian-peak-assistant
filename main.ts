import { App, Modal, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, PaneType } from 'obsidian';
import { buildLogMetricListener } from 'src/business/LogMetricRegister';
import { EventDispatcher } from 'src/core/EventDispatcher';
import { registerHTMLView, registerHTMLViews } from 'src/core/HtmlView';
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;

	async onload() {
		await this.loadSettings();

		// event dispatcher
		this.eventHandler = new EventDispatcher(this.app, this);
		// add external script listener
		this.eventHandler.addScriptFolderListener(this.settings.scriptFolder)
		// add statistics listener
		this.eventHandler.addNewHandlers(
			buildLogMetricListener(this.settings.statisticsDataStoreFolder)
		)
		// add setting ui
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// register home view
		registerHTMLViews(
			this.settings.htmlViewConfigFile,
			this
		)
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
