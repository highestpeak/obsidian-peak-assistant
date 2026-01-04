import { Plugin } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { CommandHiddenControlService } from 'src/service/CommandHiddenControlService';
import { MySettings } from 'src/app/settings/MySetting';
import { normalizePluginSettings } from 'src/app/settings/PluginSettingsLoader';
import { ViewManager } from 'src/app/view/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { registerCoreEvents } from 'src/app/events/Register';
import { MyPluginSettings } from '@/app/settings/types';
import { SearchClient } from '@/service/search/SearchClient';
import { SearchUpdateListener } from '@/service/search/index/indexUpdater';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { IndexService } from '@/service/search/index/indexService';
import { SEARCH_DB_FILENAME } from '@/core/constant';
import { AppContext } from '@/app/context/AppContext';

/**
 * Primary Peak Assistant plugin entry that wires services and views.
 */
export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	// eventHandler: EventDispatcher;

	// views
	viewManager: ViewManager;

	// chat
	aiServiceManager: AIServiceManager;

	// search
	searchClient: SearchClient | null = null;
	searchUpdateQueue: SearchUpdateListener | null = null;
	indexInitializer: IndexInitializer | null = null;

	// try to replace other plugins' functions'
	commandHiddenControlService: CommandHiddenControlService;

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

		// Create AIServiceManager (ConversationService and ProjectService will be initialized in init())
		this.aiServiceManager = new AIServiceManager(this.app, this.settings.ai);
		// Initialize global DocumentLoaderManager singleton
		// Pass aiServiceManager for loaders that need AI capabilities (e.g., image description)
		DocumentLoaderManager.init(this.app, this.settings.search, this.aiServiceManager);
		await this.aiServiceManager.init();

		// Initialize SQLite store
		await sqliteStoreManager.init({ 
			app: this.app, 
			storageFolder: this.settings.dataStorageFolder, 
			filename: SEARCH_DB_FILENAME,
			settings: { sqliteBackend: this.settings.sqliteBackend }
		});

		// Initialize search service (singleton)
		await this.initializeSearchService();

		// Create AppContext with all dependencies (viewManager will be set after ViewManager creation)
		const appContext = new AppContext(
			this.app,
			this.aiServiceManager,
			this.searchClient
		);

		// Create ViewManager with AppContext
		this.viewManager = new ViewManager(this, appContext);
		// Set viewManager in AppContext after creation
		appContext.viewManager = this.viewManager;

		this.viewManager.init();

		// register workspace events
		registerCoreEvents(this, this.viewManager);

		// register commands (after services are ready)
		buildCoreCommands(
			this.viewManager,
			this.aiServiceManager,
			this.searchClient,
			this.indexInitializer!,
			this.settings.search,
			this.settings.dataStorageFolder,
		).forEach((command) => this.addCommand(command));

		// add setting ui
		this.addSettingTab(new MySettings(this.app, this));

		// Initialize UI control service
		this.commandHiddenControlService = new CommandHiddenControlService(this.app, this, this.settings.commandHidden);
		this.commandHiddenControlService.init();
	}

	/**
	 * Initialize search client and background indexing.
	 */
	private async initializeSearchService(): Promise<void> {
		// Initialize IndexService with AIServiceManager for embedding generation
		IndexService.getInstance().init(this.aiServiceManager);

		this.searchClient = new SearchClient(this.app, this.aiServiceManager, this.settings.search);
		await this.searchClient.init();

		// first init listener then initializer to avoid missing index changes
		this.searchUpdateQueue = new SearchUpdateListener(this.app, this.settings.search, 800);
		// todo tmp block. remove comments this after testing
		// this.searchUpdateQueue.start();

		// Check index status and perform incremental indexing if needed
		// This handles cases where files were modified outside Obsidian (e.g., git sync, external editors)
		this.indexInitializer = new IndexInitializer(
			this.app,
			this.settings.search,
			this.settings.dataStorageFolder,
		);
		// todo tmp block. remove comments this after testing
		// await this.indexInitializer.checkAndUpdateIndex();
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

