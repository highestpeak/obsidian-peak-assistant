import { Plugin } from 'obsidian';
import { isDesktop } from '@/core/platform';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { MySettings } from 'src/app/settings/MySetting';
import { normalizePluginSettings } from 'src/app/settings/PluginSettingsLoader';
import { ViewManager } from 'src/app/view/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { registerCoreEvents, removeAllChatViewButtons, clearPendingConversationTimeouts } from 'src/app/events/Register';
import { MyPluginSettings } from '@/app/settings/types';
import { SearchClient } from '@/service/search/SearchClient';
import { SearchUpdateListener } from '@/service/search/index/indexUpdater';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { IndexService } from '@/service/search/index/indexService';
import { IgnoreService } from '@/service/search/IgnoreService';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { BetterSqliteStore } from '@/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore';
import { VAULT_DB_FILENAME } from '@/core/constant';
import { clearCurrentAnalysisContext } from '@/core/analysis-context-holder';
import { AppContext } from '@/app/context/AppContext';
import { EventBus } from '@/core/eventBus';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { registerTemplateEngineHelpers } from '@/core/template-engine-helper';
import { DocSimpleAgent } from '@/service/agents/DocSimpleAgent';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { ProviderServiceFactory } from '@/core/providers/base/factory';
import { RerankProviderManager } from '@/core/providers/rerank/factory';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { TemplateManager } from '@/core/template/TemplateManager';
import { initPatternSystem } from '@/service/context/PatternDiscoveryTrigger';
import { createPluginDirContentProvider } from '@/core/template/PluginDirContentProvider';
import { createVaultContentProvider } from '@/core/template/VaultContentProvider';
import { clearTemplateEngineForUnload } from '@/core/template-engine-helper';
import { clearFormatUtilsCaches } from '@/core/utils/format-utils';
import { getPluginDirAbsolute } from '@/core/utils/obsidian-utils';
import {
	hydrateClusterHubWeakTitleTokensFromTemplateManager,
	hydrateCodeStopwordsFromTemplateManager,
} from '@/core/utils/markdown-utils';
import { hydrateTextStopwordsFromTemplateManager } from '@/core/utils/stopword-utils';
import { installHoverMenuGlobals } from '@/ui/component/mine/hover-menu-manager';
import { resetAIAnalysisAll } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import { useGraphAnimationStore } from '@/ui/component/mine/graph-viz/graphAnimationStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

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

	/** On-demand template loader; cleared on unload to free memory. */
	private templateManager: TemplateManager | null = null;

	// search
	searchClient: SearchClient | null = null;
	searchUpdateQueue: SearchUpdateListener | null = null;
	indexInitializer: IndexInitializer | null = null;

	/** Cleanup function for hover menu globals. */
	private uninstallHoverMenuGlobals?: () => void;

	/**
	 * Bootstraps services, views, commands, and layout handling.
	 */
	async onload() {
		registerTemplateEngineHelpers();

		this.uninstallHoverMenuGlobals = installHoverMenuGlobals();

		const data = await this.loadData();
		this.settings = normalizePluginSettings(data);


		// Template manager loads prompts/templates from plugin dir on demand (absolute path for Node fs)
		try {
			const pluginDirAbsolute = getPluginDirAbsolute(this.manifest.id, this.app);
			this.templateManager = new TemplateManager(createPluginDirContentProvider(pluginDirAbsolute));
		} catch (e) {
			console.warn('[Peak Assistant] PluginDirContentProvider not available, using vault adapter fallback.', e);
			this.templateManager = new TemplateManager(createVaultContentProvider(this.app, this.manifest.id));
		}
		if (this.templateManager) {
			try {
				await hydrateCodeStopwordsFromTemplateManager(this.templateManager);
				await hydrateClusterHubWeakTitleTokensFromTemplateManager(this.templateManager);
				await hydrateTextStopwordsFromTemplateManager(this.templateManager);
			} catch (e) {
				console.warn(
					'[Peak Assistant] Failed to hydrate stopword templates; keyword extraction may be noisier.',
					e,
				);
			}
		}

		// Create AIServiceManager (ConversationService and ProjectService will be initialized in init())
		this.aiServiceManager = new AIServiceManager(this.app, this.settings.ai, this.templateManager ?? undefined);

		// Create AppContext EARLY — before any service init runs, so obsidian-utils and
		// vault-utils resolveApp() helpers can find the singleton during downstream init
		// chains. searchClient is null-cast now; back-filled after initializeSearchService
		// below. This replaces an earlier bug where AppContext was created too late.
		const aiAnalysisHistoryService = new AIAnalysisHistoryService();
		const appContext = new AppContext(
			this.app,
			this.aiServiceManager,
			null as unknown as SearchClient,
			this,
			this.settings,
			aiAnalysisHistoryService,
			(aiServiceManager: AIServiceManager) => new DocSimpleAgent(aiServiceManager),
		);

		// Initialize global DocumentLoaderManager singleton
		// Pass aiServiceManager for loaders that need AI capabilities (e.g., image description)
		DocumentLoaderManager.init(this.app, this.settings.search, this.aiServiceManager);
		await this.aiServiceManager.init();

		// Initialize SQLite store and search service (desktop only — native modules unavailable on mobile)
		if (isDesktop()) {
			await sqliteStoreManager.init({
				app: this.app,
				storageFolder: this.settings.dataStorageFolder,
				filename: VAULT_DB_FILENAME,
				settings: { sqliteBackend: this.settings.sqliteBackend }
			});
			await this.initializeSearchService();
			appContext.searchClient = this.searchClient!;
			initPatternSystem().catch((e) => console.error('[PatternDiscovery] Init failed:', e));
		} else {
			console.log('[Peak Assistant] Mobile mode: SQLite and indexing skipped');
		}

		// Create ViewManager with AppContext
		this.viewManager = new ViewManager(this, appContext);
		// Set viewManager in AppContext after creation
		appContext.viewManager = this.viewManager;

		this.viewManager.init();

		// register workspace events
		registerCoreEvents(this, this.viewManager);

		// register commands (after services are ready)
		buildCoreCommands(
			this.settings,
			this.viewManager,
			this.aiServiceManager,
			this.searchClient,
			this.indexInitializer!,
			this.settings.search,
			this.settings.dataStorageFolder,
		).forEach((command) => this.addCommand(command));

		// add setting ui
		this.addSettingTab(new MySettings(this.app, this, appContext));
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
		this.searchUpdateQueue = new SearchUpdateListener(this.app, this, this.settings.search, this.settings.search.indexRefreshInterval);
		this.searchUpdateQueue.start();

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
	 * Heap Retainers map: see docs/HEAP_RETAINERS_MAIN_JS.md (main.js:32730 Bluebird, :2989 Handlebars Exception, :26480 p-queue TimeoutError, :50721 sax ParseError).
	 * Note: Error.__BluebirdErrorTypes__ is set configurable:false in bundle (main.js:32754-32758) so we cannot delete it; we still try for other envs.
	 */
	async onunload() {
		// Remove Mermaid zombie load listeners (Streamdown/Mermaid register window.load regardless of startOnLoad)
		// getEventListeners is DevTools-only; when available (e.g. console open), remove by function body signature
		try {
			const getListeners = (typeof globalThis !== 'undefined' && (globalThis as any).getEventListeners) ?? (typeof window !== 'undefined' && (window as any).getEventListeners);
			if (typeof getListeners === 'function') {
				const loadList = (getListeners as (target: Window) => { load?: Array<{ listener: EventListener }> })(window)?.load;
				if (loadList && Array.isArray(loadList)) {
					loadList.forEach((l) => {
						if (l?.listener && String(l.listener).includes('Mermaid failed to initialize')) {
							window.removeEventListener('load', l.listener);
							console.log('[Peak Assistant] Removed Mermaid load listener');
						}
					});
				}
			}
		} catch (_) { /* ignore */ }

		// Clear LangChain global registry if present (avoids holding references to old plugin context)
		try {
			const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined);
			if (g && (g as any).lc_block_translators_registry) (g as any).lc_block_translators_registry.clear();
		} catch (_) { /* ignore */ }

		// Clear analysis context holder so update-result tools and agents can be GC'd
		try {
			clearCurrentAnalysisContext();
		} catch (_) { /* ignore */ }

		// Clear Zod global registry and remove global ref so registry/schemas can be GC'd (zod closure may still hold ref until bundle is unloaded)
		try {
			const g = globalThis as unknown as { __zod_globalRegistry?: { clear(): void } };
			const reg = g.__zod_globalRegistry;
			if (reg && typeof reg.clear === 'function') {
				reg.clear();
				delete g.__zod_globalRegistry;
			}
		} catch (_) { /* ignore */ }

		clearPendingConversationTimeouts();
		this.viewManager?.unload();
		removeAllChatViewButtons();
		if (this.templateManager) {
			this.templateManager.clear();
			this.templateManager = null;
		}
		clearTemplateEngineForUnload();

		// Bluebird/Error cleanup before closing DB so Error refs are cleared while plugin refs still exist
		try {
			const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : undefined;
			if (g) {
				const P = (g as any).Promise;
				if (P && typeof (P as any).config === 'function') {
					try { (P as any).config({ longStackTraces: false, warnings: false }); } catch (_) { /* ignore */ }
				}
				const Err = (g as any).Error;
				if (Err && typeof Err === 'function') {
					const exact = '__BluebirdErrorTypes__';
					try {
						if ((Err as any)[exact] != null) { delete (Err as any)[exact]; (Err as any)[exact] = null; }
					} catch (_) { /* ignore */ }
					for (const target of [Err, Err.prototype]) {
						try {
							for (const k of Object.getOwnPropertyNames(target)) {
								if (!k.includes('Bluebird') && !k.includes('bluebird')) continue;
								try { delete (target as any)[k]; } catch (_) { /* ignore */ }
								(target as any)[k] = null;
							}
						} catch (_) { /* ignore */ }
					}
				}
			}
		} catch (_) { /* ignore */ }

		// Wait for in-flight index flush to settle so we close DB after and avoid OperationalError/Bluebird retaining bundle
		if (this.searchUpdateQueue) {
			await this.searchUpdateQueue.dispose();
			this.searchUpdateQueue = null;
		}
		if (this.searchClient) {
			this.searchClient.dispose();
			this.searchClient = null;
		}

		// Reset all Zustand stores to release state and break references to plugin bundle
		try {
			useVaultSearchStore.getState().reset();
			useSharedStore.getState().reset();
			useUIEventStore.getState().reset();
			useProjectStore.getState().reset();
			useMessageStore.getState().reset();
			useGraphAnimationStore.getState().reset();
			useChatViewStore.getState().reset();
			resetAIAnalysisAll();
		} catch (e) {
			console.warn('[Peak Assistant] Store reset on unload:', e);
		}

		// Cancel any ongoing indexing operations
		IndexService.cancelIndexing();

		// Release AI service timers and subscriptions before closing DB so no async touches DB after close
		this.aiServiceManager?.cleanup();

		// Close global SQLite store (sync; already imported at top)
		sqliteStoreManager.close();

		// Abort all background analysis sessions
		BackgroundSessionManager.clearInstance();

		// Break singletons so old bundle can be GC'd
		AppContext.clearForUnload();
		EventBus.destroyInstance();
		IndexService.clearInstance();
		DocumentLoaderManager.clearInstance();
		IgnoreService.clearInstance();
		SqliteStoreManager.clearInstance();
		BetterSqliteStore.clearInstance();
		MultiProviderChatService.clearInstance();
		ProviderServiceFactory.clearInstance();
		RerankProviderManager.clearInstance();

		this.uninstallHoverMenuGlobals?.();
		clearFormatUtilsCaches();

		// Aggressively clear require.cache so old module instances (and their Bluebird/Handlebars/sax refs) can be GC'd
		if (typeof require !== 'undefined' && require.cache) {
			const cache = require.cache;
			const drop = [
				'better-sqlite3', 'sqlite-vec', 'obsidian-peak-assistant',
				'bluebird', 'handlebars', 'officeparser', 'mammoth', 'saxes', 'sax', 'p-queue', '@langchain'
			];
			for (const key in cache) {
				if (drop.some((name) => key.includes(name))) {
					delete cache[key];
				}
			}
		}

	}

	/**
	 * Persists current plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

}
