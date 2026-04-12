import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings } from '../settings/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';
import { GraphInspectorTestTools, AISearchAgentTestTools } from '@/app/context/test-tools';
import { cleanupGraphTable } from '@/app/context/graph-cleanup';
import {
	debugBatchIndex,
	debugDocumentSnapshot,
	debugExplainPathCoverage,
	debugHubDiscoverClusterOnly,
	debugHubDiscoverDocumentOnly,
	debugHubDiscoverFolderOnly,
	debugHubDiscoverManualOnly,
	debugHubDiscoverSnapshot,
	debugIndexDocument,
	debugMaterializeHubCandidate,
	debugRunHubDiscoverWithReport,
	debugRunMaintenance,
	debugValidateSubset,
} from '@/app/context/index-debug-tools';
import { defaultIndexDocumentOptions, IndexService } from '@/service/search/index/indexService';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { DocSimpleAgent } from '@/service/agents/DocSimpleAgent';
import { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import type { VaultSearchOptions as VaultSearchOpts } from '@/service/agents/vault/types';
import { getVaultPersona } from '@/service/tools/system-info';

/**
 * Application context containing all global dependencies.
 * Created once at plugin initialization and passed to all views and components.
 */
export class AppContext {
	public viewManager: ViewManager;
	public readonly eventBus: EventBus;

	private static instance: AppContext | null = null;

	/** Unsubscribe from EventBus so workspace ref is released on unload. */
	private unsubscribeSettingsUpdated?: () => void;

	public static getInstance(): AppContext {
		if (!AppContext.instance) {
			throw new BusinessError(
				ErrorCode.CONFIGURATION_MISSING,
				'AppContext is not initialized'
			);
		}
		return AppContext.instance;
	}

	/** Obsidian `App` from the initialized singleton. */
	public static getApp(): App {
		return AppContext.getInstance().app;
	}

	public static getManager(): AIServiceManager {
		return AppContext.getInstance().manager;
	}

	public static getSearchClient(): SearchClient {
		return AppContext.getInstance().searchClient;
	}

	public static getPlugin(): MyPlugin {
		return AppContext.getInstance().plugin;
	}

	public static getSettings(): MyPluginSettings {
		return AppContext.getInstance().settings;
	}

	public static getEventBus(): EventBus {
		return AppContext.getInstance().eventBus;
	}

	public static getViewManager(): ViewManager {
		return AppContext.getInstance().viewManager;
	}

	public static getAIAnalysisHistoryService(): AIAnalysisHistoryService {
		return AppContext.getInstance().aiAnalysisHistoryService;
	}

	/**
	 * Clear singleton and unsubscribe from workspace events.
	 * Must be called from plugin onunload to break reference chains and allow GC.
	 */
	public static clearForUnload(): void {
		if (AppContext.instance) {
			AppContext.instance.unsubscribeSettingsUpdated?.();
			// Explicitly clean up window globals to break closure-based memory leaks
			AppContext.instance.handleDevToolsSettingChange(false);
			AppContext.instance = null;
		}
	}

	constructor(
		public readonly app: App,
		public readonly manager: AIServiceManager,
		/**
		 * SearchClient is mutable because the AppContext must be constructed BEFORE
		 * service initialization (so obsidian-utils / vault-utils resolveApp helpers
		 * can find the singleton), but SearchClient itself is only created inside
		 * Plugin.initializeSearchService() after sqlite is ready. main.ts sets this
		 * after initializeSearchService() completes.
		 */
		public searchClient: SearchClient,
		public readonly plugin: MyPlugin,
		public settings: MyPluginSettings,
		public readonly aiAnalysisHistoryService: AIAnalysisHistoryService,
		public readonly searchAgentFactory: (aiServiceManager: AIServiceManager) => DocSimpleAgent,
		/** When true, running in mock/dev environment (e.g. desktop dev). */
		public readonly isMockEnv: boolean = false,
	) {
		// viewManager will be set after ViewManager is created
		this.viewManager = null as any;
		this.eventBus = EventBus.getInstance(app);
		AppContext.instance = this;

		this.handleDevToolsSettingChange(this.settings.enableDevTools ?? false);

		this.unsubscribeSettingsUpdated = this.eventBus.on(ViewEventType.SETTINGS_UPDATED, (event) => {
			const previousEnableDevTools = this.settings.enableDevTools ?? false;
			this.settings = this.plugin!.settings!;

			// Handle dynamic enableDevTools setting changes
			const currentEnableDevTools = this.settings.enableDevTools ?? false;
			if (previousEnableDevTools !== currentEnableDevTools) {
				this.handleDevToolsSettingChange(currentEnableDevTools);
			}
		});
	}

	public static searchAgent(): DocSimpleAgent {
		return AppContext.getInstance().searchAgentFactory(AppContext.getInstance().manager);
	}

	/** Create a VaultSearchAgent (new HITL-first pipeline: classify → decompose → recon → HITL → report). */
	public static vaultSearchAgent(options?: VaultSearchOpts): VaultSearchAgent {
		return new VaultSearchAgent(AppContext.getInstance().manager, options);
	}

	/**
	 * Handle dynamic changes to enableDevTools setting
	 */
	private handleDevToolsSettingChange(enabled: boolean) {
		if (enabled) {
			// Dynamically initialize test tools when setting is enabled
			if (typeof window !== 'undefined') {
				(window as any).testGraphTools = new GraphInspectorTestTools();
				(window as any).testAISearchTools = new AISearchAgentTestTools();
				(window as any).indexDocument = (docPath: string) =>
					IndexService.getInstance().indexDocument(
						docPath,
						this.settings.search,
						defaultIndexDocumentOptions('listener_fast'),
					);
				(window as any).indexDocumentFull = (docPath: string) =>
					IndexService.getInstance().indexDocument(
						docPath,
						this.settings.search,
						defaultIndexDocumentOptions('manual_full'),
					);
				(window as any).runPendingLlmIndexEnrichment = () =>
					IndexService.runPendingLlmIndexEnrichment(this.settings.search);
				(window as any).runPendingVectorIndexEnrichment = () =>
					IndexService.runPendingVectorIndexEnrichment(this.settings.search);
				const getSearch = () => this.settings.search;
				(window as any).debugIndexDocument = (
					docPath: string,
					mode: 'core_fast' | 'vector_only' | 'llm_only' | 'manual_full' = 'manual_full',
				) => debugIndexDocument(docPath, getSearch, mode);
				(window as any).debugBatchIndex = (
					paths: string[],
					mode: 'core_fast' | 'vector_only' | 'llm_only' | 'manual_full' = 'manual_full',
				) => debugBatchIndex(paths, getSearch, mode);
				(window as any).debugRunMaintenance = (tenants?: ('vault' | 'chat')[]) => debugRunMaintenance(tenants);
				(window as any).debugRunHubDiscoverWithReport = (opts?: Parameters<typeof debugRunHubDiscoverWithReport>[0]) => debugRunHubDiscoverWithReport(opts);
				(window as any).debugMaterializeHubCandidate = (
					candidate: Parameters<typeof debugMaterializeHubCandidate>[0],
					opts?: Parameters<typeof debugMaterializeHubCandidate>[2],
				) => debugMaterializeHubCandidate(candidate, getSearch, opts);
				(window as any).debugHubDiscoverSnapshot = (tenant?: 'vault' | 'chat') => debugHubDiscoverSnapshot(tenant);
				(window as any).debugHubDiscoverManualOnly = (tenant?: 'vault' | 'chat') => debugHubDiscoverManualOnly(tenant);
				(window as any).debugHubDiscoverDocumentOnly = (tenant?: 'vault' | 'chat') =>
					debugHubDiscoverDocumentOnly(tenant);
				(window as any).debugHubDiscoverFolderOnly = (tenant?: 'vault' | 'chat') => debugHubDiscoverFolderOnly(tenant);
				(window as any).debugHubDiscoverClusterOnly = (tenant?: 'vault' | 'chat') => debugHubDiscoverClusterOnly(tenant);
				(window as any).debugValidateSubset = (opts: Parameters<typeof debugValidateSubset>[0]) => debugValidateSubset(opts);
				(window as any).debugExplainPathCoverage = (docPath: string) => debugExplainPathCoverage(docPath);
				(window as any).debugDocumentSnapshot = (
					docPath: string,
					opts?: Parameters<typeof debugDocumentSnapshot>[1],
				) => debugDocumentSnapshot(docPath, opts);
				(window as any).getVaultPersona = () => getVaultPersona();
				(window as any).cleanupGraphTable = () => cleanupGraphTable();

				console.debug('🔧 Graph Inspector Test Tools initialized!');
				console.debug('📖 Usage: window.testGraphTools.inspectNote("path/to/note.md")');
				console.debug('📖 Usage: await window.testAISearchTools.testSlotRecall("your question")');
				console.debug('📖 Usage: window.indexDocument("path/to/note.md") — fast core index');
				console.debug('📖 Usage: window.indexDocumentFull("path/to/note.md") — full index + LLM');
				console.debug('📖 Usage: await window.runPendingLlmIndexEnrichment() — deferred LLM for pending docs');
				console.debug('📖 Usage: await window.runPendingVectorIndexEnrichment() — deferred vectors for pending docs');
				console.debug('📖 Usage: await window.debugIndexDocument("path/to/note.md","manual_full")');
				console.debug('📖 Usage: await window.debugBatchIndex(["a.md","b.md"],"core_fast")');
				console.debug('📖 Usage: await window.debugRunMaintenance() — full Mobius maintenance');
				console.debug('📖 Usage: await window.debugRunHubDiscoverWithReport() — hub discovery (can be slow)');
				(window as any).testBackboneMap = (opts?: Record<string, unknown>) =>
					(window as any).testAISearchTools.testBackboneMap(opts);
				(window as any).testKnowledgeIntuition = (opts?: Record<string, unknown>) =>
					(window as any).testAISearchTools.testKnowledgeIntuition(opts);
				(window as any).testClassify = (query: string) =>
					(window as any).testAISearchTools.testClassify(query);
				(window as any).testPipelinePhases = (query: string) =>
					(window as any).testAISearchTools.testPipelinePhases(query);
				console.debug('📖 Usage: await window.testBackboneMap() — folder tree + backbone highways (deterministic, SQLite)');
				console.debug(
					'📖 Usage: await window.testKnowledgeIntuition({ userGoal?: "..." }) — KnowledgeIntuitionAgent (vault intuition skeleton)',
				);
				console.debug(
					'📖 Usage: await window.debugMaterializeHubCandidate(candidate, { hubCandidatesForHubSet }) — one Hub-*.md from a candidate',
				);
				console.debug('📖 Usage: await window.debugHubDiscoverSnapshot() — hub discovery (can be slow)');
				console.debug(
					'📖 Usage: await window.debugHubDiscoverManualOnly() | debugHubDiscoverDocumentOnly() | debugHubDiscoverFolderOnly() | debugHubDiscoverClusterOnly() — one first-round leg',
				);
				console.debug('📖 Usage: await window.debugValidateSubset({ pathPrefixes: ["Projects"] })');
				console.debug('📖 Usage: await window.debugExplainPathCoverage("path/to/note.md")');
				console.debug('📖 Usage: await window.debugDocumentSnapshot("path/to/note.md") — DB-only index snapshot (add { includeHubCoverage: true } for slow hub coverage)');
				console.debug('📖 Usage: await window.cleanupGraphTable() — clean mobius_node/edge orphans and doc nodes missing from index');
				console.debug('📖 Available methods:', [
					...Object.getOwnPropertyNames(GraphInspectorTestTools.prototype).filter(name => name !== 'constructor'),
					'testAISearchTools.testSlotRecall',
					'indexDocument',
					'indexDocumentFull',
					'runPendingLlmIndexEnrichment',
					'runPendingVectorIndexEnrichment',
					'debugIndexDocument',
					'debugBatchIndex',
					'debugRunMaintenance',
					'debugRunHubDiscoverWithReport',
					'debugMaterializeHubCandidate',
					'debugHubDiscoverSnapshot',
					'debugHubDiscoverManualOnly',
					'debugHubDiscoverDocumentOnly',
					'debugHubDiscoverFolderOnly',
					'debugHubDiscoverClusterOnly',
					'debugValidateSubset',
					'debugExplainPathCoverage',
					'debugDocumentSnapshot',
					'cleanupGraphTable',
					'testBackboneMap',
					'testKnowledgeIntuition',
					'testClassify',
					'testPipelinePhases',
				]);
			}
		} else {
			if (typeof window !== 'undefined') {
				if ((window as any).testGraphTools) delete (window as any).testGraphTools;
				if ((window as any).testAISearchTools) delete (window as any).testAISearchTools;
				if ((window as any).indexDocument) delete (window as any).indexDocument;
				if ((window as any).runPendingLlmIndexEnrichment) delete (window as any).runPendingLlmIndexEnrichment;
				if ((window as any).runPendingVectorIndexEnrichment) delete (window as any).runPendingVectorIndexEnrichment;
				if ((window as any).indexDocumentFull) delete (window as any).indexDocumentFull;
				if ((window as any).debugIndexDocument) delete (window as any).debugIndexDocument;
				if ((window as any).debugBatchIndex) delete (window as any).debugBatchIndex;
				if ((window as any).debugRunMaintenance) delete (window as any).debugRunMaintenance;
				if ((window as any).debugRunHubDiscoverWithReport) delete (window as any).debugRunHubDiscoverWithReport;
				if ((window as any).debugMaterializeHubCandidate) delete (window as any).debugMaterializeHubCandidate;
				if ((window as any).debugHubDiscoverSnapshot) delete (window as any).debugHubDiscoverSnapshot;
				if ((window as any).debugHubDiscoverManualOnly) delete (window as any).debugHubDiscoverManualOnly;
				if ((window as any).debugHubDiscoverDocumentOnly) delete (window as any).debugHubDiscoverDocumentOnly;
				if ((window as any).debugHubDiscoverFolderOnly) delete (window as any).debugHubDiscoverFolderOnly;
				if ((window as any).debugHubDiscoverClusterOnly) delete (window as any).debugHubDiscoverClusterOnly;
				if ((window as any).debugValidateSubset) delete (window as any).debugValidateSubset;
				if ((window as any).debugExplainPathCoverage) delete (window as any).debugExplainPathCoverage;
				if ((window as any).debugDocumentSnapshot) delete (window as any).debugDocumentSnapshot;
				if ((window as any).cleanupGraphTable) delete (window as any).cleanupGraphTable;
				if ((window as any).testBackboneMap) delete (window as any).testBackboneMap;
				if ((window as any).testKnowledgeIntuition) delete (window as any).testKnowledgeIntuition;
				if ((window as any).testClassify) delete (window as any).testClassify;
				if ((window as any).testPipelinePhases) delete (window as any).testPipelinePhases;
				console.log('🔧 Graph Inspector Test Tools disabled');
			}
		}
	}
}
