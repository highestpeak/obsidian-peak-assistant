import { Plugin } from 'obsidian';
import { EventDispatcher } from 'src/core/EventDispatcher';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { CommandHiddenControlService } from 'src/service/CommandHiddenControlService';
import { MySettings, normalizePluginSettings } from 'src/app/settings/MySetting';
import { ViewManager } from 'src/app/view/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { registerCoreEvents } from 'src/app/events/Register';
import { MyPluginSettings } from 'src/app/settings/config';

/**
 * Primary Peak Assistant plugin entry that wires services and views.
 */
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;
	commandHiddenControlService: CommandHiddenControlService;
	viewManager: ViewManager;

	aiManager: AIServiceManager;

	/**
	 * Bootstraps services, views, commands, and layout handling.
	 */
	async onload() {
		const data = await this.loadData();
		this.settings = normalizePluginSettings(data);

		// todo first version code, temp ignore
		// // event dispatcher
		// this.eventHandler = new EventDispatcher(this.app, this);
		// // add external script listener
		// this.eventHandler.addScriptFolderListener(this.settings.scriptFolder)
		// // add statistics listener
		// this.eventHandler.addNewHandlers(
		// 	buildLogMetricListener(this.settings.statisticsDataStoreFolder)
		// )
		// // register home view
		// // registerHTMLViews(
		// // 	this.settings.htmlViewConfigFile,
		// // 	this
		// // )

		this.aiManager = new AIServiceManager(this.app, this.settings.ai);
		await this.aiManager.init();

		// Initialize UI control service
		this.commandHiddenControlService = new CommandHiddenControlService(this.app, this, this.settings.commandHidden);
		this.commandHiddenControlService.init();

		this.viewManager = new ViewManager(this, this.aiManager);
		this.viewManager.init();

		// add setting ui
		this.addSettingTab(new MySettings(this.app, this));

		// register commands
		buildCoreCommands(this.viewManager, this.aiManager)
			.forEach(command => this.addCommand(command));

		// register events
		registerCoreEvents(this, this.viewManager);
	}

	/**
	 * Cleans up registered views and services when plugin unloads.
	 */
	onunload() {
		this.viewManager?.unload();
		this.commandHiddenControlService?.unload();
	}

	/**
	 * Persists current plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

}
