import { Plugin } from 'obsidian';
import { EventDispatcher } from 'src/core/EventDispatcher';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { CommandHiddenControlService } from 'src/service/CommandHiddenControlService';
import { MySettings, normalizePluginSettings } from 'src/app/settings/MySetting';
import { ViewManager } from 'src/app/view/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { registerCoreEvents } from 'src/app/events/Register';
import { MyPluginSettings } from '@/app/settings/types';
import { SearchClient } from '@/service/search/SearchClient';
import { SearchUpdateListener } from '@/service/search/index/indexUpdater';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocumentLoaderManager } from '@/core/document/loader/DocumentLoaderManager';
import { IndexService } from '@/service/search/index/indexService';

/**
 * Primary Peak Assistant plugin entry that wires services and views.
 */
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	eventHandler: EventDispatcher;
	commandHiddenControlService: CommandHiddenControlService;
	viewManager: ViewManager;

	aiServiceManager: AIServiceManager;

	// search
	searchClient: SearchClient | null = null;
	searchUpdateQueue: SearchUpdateListener | null = null;
	indexInitializer: IndexInitializer | null = null;

	/**
	 * Bootstraps services, views, commands, and layout handling.
	 */
	async onload() {
		const data = await this.loadData();
		this.settings = normalizePluginSettings(data);

		// first version code, temp ignore
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

		this.aiServiceManager = new AIServiceManager(this.app, this.settings.ai);
		await this.aiServiceManager.init();

		// Initialize UI control service
		this.commandHiddenControlService = new CommandHiddenControlService(this.app, this, this.settings.commandHidden);
		this.commandHiddenControlService.init();

		this.viewManager = new ViewManager(this, this.aiServiceManager);
		this.viewManager.init();

		// add setting ui
		this.addSettingTab(new MySettings(this.app, this));

		// Initialize global SQLite store
		await sqliteStoreManager.init({ app: this.app, storageFolder: this.settings.dataStorageFolder, filename: 'search.sqlite' });

		// Initialize IndexService with AIServiceManager for embedding generation
		IndexService.getInstance().init(this.aiServiceManager);

		// Initialize global search service (singleton)
		await this.initializeSearchService();

		// register commands (after services are ready)
		buildCoreCommands(
			this.viewManager,
			this.aiServiceManager,
			this.searchClient,
			this.indexInitializer!,
			this.settings.search,
			this.settings.dataStorageFolder,
		).forEach((command) => this.addCommand(command));

		// register workspace events
		registerCoreEvents(this, this.viewManager);

	}

	/**
	 * Initialize search client and background indexing.
	 */
	private async initializeSearchService(): Promise<void> {
		// Initialize global DocumentLoaderManager singleton
		DocumentLoaderManager.init(this.app, this.settings.search);

		const tmpSearchClient = new SearchClient(this.app, this.aiServiceManager, this.settings.search);
		this.searchClient = tmpSearchClient;

		// first init listener then initializer to avoid missing index changes
		const searchUpdateListener = new SearchUpdateListener(this.app, this.settings.search, 800);
		this.searchUpdateQueue = searchUpdateListener;
		searchUpdateListener.start();

		// Initialize local SQLite search service
		await this.searchClient.init();

		// Check index status and perform incremental indexing if needed
		// This handles cases where files were modified outside Obsidian (e.g., git sync, external editors)
		this.indexInitializer = new IndexInitializer(
			this.app,
			this.settings.search,
			this.settings.dataStorageFolder,
		);
		await this.indexInitializer.checkAndUpdateIndex();
	}

	/**
	 * Cleans up registered views and services when plugin unloads.
	 */
	async onunload() {
		this.viewManager?.unload();
		this.commandHiddenControlService?.unload();

		// Clean up search service
		if (this.searchUpdateQueue) {
			await this.searchUpdateQueue.dispose();
			this.searchUpdateQueue = null;
		}
		if (this.searchClient) {
			this.searchClient.dispose();
			this.searchClient = null;
		}

		// Close global SQLite store
		const { sqliteStoreManager } = await import('@/core/storage/sqlite/SqliteStoreManager');
		sqliteStoreManager.close();
	}

	/**
	 * Persists current plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

}

