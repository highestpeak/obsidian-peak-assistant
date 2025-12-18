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
import { SearchUpdateListener } from '@/service/search/index/update-queue';
import { IndexInitializer } from '@/service/search/index/index-initializer';
import { VaultBytesStore } from '@/service/storage/vault/VaultBytesStore';
import { VaultJsonStore } from '@/service/storage/vault/VaultJsonStore';
import { StoragePersistenceScheduler } from '@/service/storage/StoragePersistenceScheduler';
import type { StorageType } from '@/service/search/worker/types-rpc';

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
	storagePersistence: StoragePersistenceScheduler | null = null;

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

		// Initialize global search service (singleton)
		await this.initializeSearchService();

		// register commands (after services are ready)
		buildCoreCommands(
			this.viewManager,
			this.aiServiceManager,
			this.searchClient,
			this.settings.search,
			this.settings.dataStorageFolder,
			this.storagePersistence ?? undefined,
		).forEach((command) => this.addCommand(command));

		// register workspace events
		registerCoreEvents(this, this.viewManager);

	}

	/**
	 * Initialize search client and background indexing.
	 */
	private async initializeSearchService(): Promise<void> {
		try {
			const storageFolder = this.settings.dataStorageFolder;
			// Use appropriate store types for different file formats:
			// - SQLite: binary file store
			// - Orama/Graph: JSON file store (compact format, human-readable)
			const sqliteStore = new VaultBytesStore(this.app, {
				filename: 'search-metadata.sqlite',
				storageFolder,
			});
			const oramaStore = new VaultJsonStore(this.app, {
				filename: 'search-orama.json',
				storageFolder,
			});
			const graphStore = new VaultJsonStore(this.app, {
				filename: 'search-graph.json',
				storageFolder,
			});

			// Load existing data from disk
			const [sqliteBytes, oramaJson, graphJson] = await Promise.all([
				sqliteStore.load(),
				oramaStore.loadJson(),
				graphStore.loadJson(),
			]);

			let tmpSearchClient: SearchClient;
			// Storage persistence strategy:
			// - Only save on plugin unload to avoid frequent disk writes that cause frame drops
			// - For major changes (e.g., index completion), save when user is idle
			// - Worker exports data, main thread persists to disk
			const scheduler = new StoragePersistenceScheduler(
				async (types: StorageType[]) => await tmpSearchClient.exportStorage(types),
				{
					sqlite: sqliteStore,
					orama: oramaStore,
					graph: graphStore,
				},
				5000, // Idle timeout: save after 5 seconds of inactivity for major changes
			);
			this.storagePersistence = scheduler;

			// Mark storage as dirty but don't auto-save (saves only on unload or explicit flush)
			tmpSearchClient = new SearchClient(this.app, (types) => scheduler.schedule(types));
			this.searchClient = tmpSearchClient;

			const searchUpdateListener = new SearchUpdateListener(this.app, this.searchClient, 800);
			this.searchUpdateQueue = searchUpdateListener;
			searchUpdateListener.start();

			// Initialize worker and start background indexing
			const basePath = (this.app.vault.adapter as any)?.basePath ?? '';
			await this.searchClient.init({
				vaultId: `${this.app.vault.getName?.() ?? 'vault'}:${basePath}`,
				storageBytes: {
					sqlite: sqliteBytes,
					orama: oramaJson,
					graph: graphJson,
				},
			});

			// Check index status and perform incremental indexing if needed
			// This handles cases where files were modified outside Obsidian (e.g., git sync, external editors)
			const indexInitializer = new IndexInitializer(
				this.app,
				tmpSearchClient,
				this.settings.search,
				storageFolder,
				scheduler, // Pass scheduler for idle-time saves after major changes
			);
			await indexInitializer.checkAndUpdateIndex();
		} catch (e) {
			console.error('Search service initialization failed:', e);
			// Keep plugin usable even if search fails
		}
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
		if (this.storagePersistence) {
			try {
				await this.storagePersistence.flush();
			} catch (e) {
				console.error('Search storage persistence flush failed:', e);
			} finally {
				this.storagePersistence.dispose();
				this.storagePersistence = null;
			}
		}
		if (this.searchClient) {
			this.searchClient.dispose();
			this.searchClient = null;
		}
	}

	/**
	 * Persists current plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

}

