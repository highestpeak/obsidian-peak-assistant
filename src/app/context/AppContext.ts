import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings, HarnessSettings, DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';
import { GraphInspectorTestTools, AISearchAgentTestTools } from '@/app/context/test-tools';
import { GraphCleanupService } from '@/service/search/index/maintenance/GraphCleanupService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { defaultIndexDocumentOptions, IndexService } from '@/service/search/index/indexService';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import { AIGraphAgent } from '@/service/agents/AIGraphAgent';
import { getVaultPersona } from '@/app/debug/system-info';
import { SessionContextService } from '@/service/context/SessionContextService';
import { ClaudeAgentSDKBridge } from '@/service/agents/harness-bridge/ClaudeAgentSDKBridge';
import { AppRuntimeRegistry } from '@/app/runtime/AppRuntimeRegistry';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import type { VaultPreviewPort } from '@/core/ports/VaultPreviewPort';
import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { WikilinkPort } from '@/core/ports/WikilinkPort';
import type { EditorCommandsPort } from '@/core/ports/EditorCommandsPort';
import type { ChatVaultWriterPort } from '@/core/ports/ChatVaultWriterPort';
import type { VaultStatsPort } from '@/core/ports/VaultStatsPort';
import { composeVaultPreview } from '@/app/adapters/preview/composeVaultPreview';
import { composeVaultNavigation, composeEditorCommands, composeWikilink } from '@/app/adapters/navigation/composeNavigation';
import { composeChatVaultWriter } from '@/app/chat/composeChatVaultWriter';
import { AppVaultStatsAdapter } from '@/app/adapters/vault/AppVaultStatsAdapter';
import { composeCopilotReviewHistory } from '@/app/copilot/composeCopilotReviewHistory';
import type { CopilotReviewHistoryService } from '@/service/copilot/CopilotReviewHistoryService';
import type { ProgressReporterPort } from '@/core/ports/ProgressReporterPort';
import { ObsidianProgressReporter } from '@/app/adapters/ObsidianProgressReporter';

/**
 * Application context containing all global dependencies.
 * Created once at plugin initialization and passed to all views and components.
 */
export class AppContext {
	public viewManager: ViewManager;
	public readonly eventBus: EventBus;
	/** Bridge instance shared across the plugin lifetime. */
	public readonly _bridge: ClaudeAgentSDKBridge;
	/**
	 * App-owned runtime registry. T6R moves Vault Lint runtime ownership
	 * from a service-layer module singleton into this registry; future
	 * capability runtimes plug in here too.
	 */
	public readonly runtimeRegistry: AppRuntimeRegistry;

	/** App-owned progress notification reporter. Passed to service consumers via constructor injection. */
	public readonly progressReporter: ProgressReporterPort;

	/**
	 * T11N: app-composed ports for the streamdown/chat-attachment preview
	 * surface, the cross-cutting "open vault link" affordance, the
	 * "insert wikilink at cursor" editor command, and the chat
	 * save-to-vault writer. Constructed once here so React consumers
	 * receive them via `ReactElementFactory` and never instantiate the
	 * concrete adapters themselves.
	 */
	public readonly vaultPreview: VaultPreviewPort;
	public readonly vaultNavigation: VaultNavigationPort;
	public readonly wikilink: WikilinkPort;
	public readonly editorCommands: EditorCommandsPort;
	public readonly chatVaultWriter: ChatVaultWriterPort;
	public readonly vaultStats: VaultStatsPort;
	/**
	 * T11Q (Track B): app-owned Copilot Auto Review history service.
	 * Composed here so the service tier no longer hides an
	 * `AppContext.getInstance()` lookup behind a singleton getter.
	 */
	public readonly copilotReviewHistory: CopilotReviewHistoryService;

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

	public static getSessionContext(): SessionContextService {
		return SessionContextService.getInstance();
	}

	/** Current harness settings — falls back to defaults if not persisted yet. */
	public static getHarnessSettings(): HarnessSettings {
		return AppContext.getInstance().settings.harnessSettings ?? { ...DEFAULT_HARNESS_SETTINGS };
	}

	/** Singleton ClaudeAgentSDKBridge instance. */
	public static getBridge(): ClaudeAgentSDKBridge {
		return AppContext.getInstance()._bridge;
	}

	/**
	 * Bind the Vault Lint runtime at plugin boot. Delegates to the
	 * app-owned `AppRuntimeRegistry`. Fail-loud on double-bind.
	 */
	public static setVaultLintRuntime(runtime: VaultLintRuntime): void {
		AppContext.getInstance().runtimeRegistry.setVaultLintRuntime(runtime);
	}

	/**
	 * Read the bound Vault Lint runtime. Fail-loud if boot has not run
	 * yet. Service-side consumers (e.g. `VaultReviewSession`) use this.
	 */
	public static getVaultLintRuntime(): VaultLintRuntime {
		return AppContext.getInstance().runtimeRegistry.getVaultLintRuntime();
	}

	/**
	 * Soft accessor — returns `null` if boot has not bound the runtime
	 * yet. UI providers use this so an early panel mount does not throw
	 * inside React rendering; the consumer handles the null case.
	 */
	public static tryGetVaultLintRuntime(): VaultLintRuntime | null {
		return AppContext.getInstance().runtimeRegistry.tryGetVaultLintRuntime();
	}

	/**
	 * Release the bound runtime — called from `main.onunload` so hot
	 * reload does not keep a reference to the closed sqlite repo.
	 */
	public static clearVaultLintRuntime(): void {
		AppContext.getInstance().runtimeRegistry.clearVaultLintRuntime();
	}

	/**
	 * T8: Bind the Ambient runtime at plugin boot. Delegates to the
	 * app-owned `AppRuntimeRegistry`. Fail-loud on double-bind.
	 */
	public static setAmbientRuntime(runtime: AmbientRuntime): void {
		AppContext.getInstance().runtimeRegistry.setAmbientRuntime(runtime);
	}

	/**
	 * T8: Read the bound Ambient runtime. Fail-loud if boot has not
	 * run yet. Command actions (`openRelatedNotes` /
	 * `refreshRelatedNotes`) use this.
	 */
	public static getAmbientRuntime(): AmbientRuntime {
		return AppContext.getInstance().runtimeRegistry.getAmbientRuntime();
	}

	/**
	 * T8: Soft accessor — returns `null` if boot has not bound the
	 * runtime yet. UI providers (Related Notes panel, gutter widget)
	 * use this so an early mount does not throw inside React rendering.
	 */
	public static tryGetAmbientRuntime(): AmbientRuntime | null {
		return AppContext.getInstance().runtimeRegistry.tryGetAmbientRuntime();
	}

	/**
	 * T8: Dispose + drop the Ambient runtime — called from
	 * `main.onunload` so the editor event subscriptions release and
	 * the hot-reloaded bundle does not keep them alive.
	 */
	public static clearAmbientRuntime(): void {
		AppContext.getInstance().runtimeRegistry.clearAmbientRuntime();
	}

	/**
	 * T9: Bind the Vault Review runtime at plugin boot. Delegates to
	 * the app-owned `AppRuntimeRegistry`. Fail-loud on double-bind.
	 */
	public static setVaultReviewRuntime(runtime: VaultReviewRuntime): void {
		AppContext.getInstance().runtimeRegistry.setVaultReviewRuntime(runtime);
	}

	/**
	 * T9: Read the bound Vault Review runtime. Fail-loud if boot has
	 * not run yet. Used by callers that should only run after boot
	 * (rare — most UI uses `tryGetVaultReviewRuntime`).
	 */
	public static getVaultReviewRuntime(): VaultReviewRuntime {
		return AppContext.getInstance().runtimeRegistry.getVaultReviewRuntime();
	}

	/**
	 * T9: Soft accessor — returns `null` if boot has not bound the
	 * runtime yet. Used by the Vault Auto Run modal, the picker, and
	 * the history modal so an early mount does not throw inside React
	 * rendering; the consumer handles the null case (graceful empty
	 * state).
	 */
	public static tryGetVaultReviewRuntime(): VaultReviewRuntime | null {
		return AppContext.getInstance().runtimeRegistry.tryGetVaultReviewRuntime();
	}

	/**
	 * T9: Dispose + drop the Vault Review runtime — called from
	 * `main.onunload` so the hot-reloaded bundle does not retain
	 * references to the closed sqlite repo or the fingerprint cache.
	 */
	public static clearVaultReviewRuntime(): void {
		AppContext.getInstance().runtimeRegistry.clearVaultReviewRuntime();
	}

	/**
	 * T10: Bind the Quick Search background-session runtime at plugin
	 * boot. Delegates to the app-owned `AppRuntimeRegistry`. Fail-loud
	 * on double-bind.
	 */
	public static setQuickSearchBackgroundRuntime(runtime: QuickSearchBackgroundRuntime): void {
		AppContext.getInstance().runtimeRegistry.setQuickSearchBackgroundRuntime(runtime);
	}

	/**
	 * T10: Read the bound Quick Search background runtime. Fail-loud
	 * if boot has not run yet. Used by service-side callers that only
	 * run post-boot (e.g. `CascadeWorker.drainDebt`).
	 */
	public static getQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime {
		return AppContext.getInstance().runtimeRegistry.getQuickSearchBackgroundRuntime();
	}

	/**
	 * T10: Soft accessor — returns `null` if boot has not bound the
	 * runtime yet. UI hooks (`useSearchSession`, the modal onClose
	 * effect, `ActiveSessionsList`, `RecentAIAnalysis`) use this so an
	 * early mount does not throw inside React rendering.
	 */
	public static tryGetQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime | null {
		return AppContext.getInstance().runtimeRegistry.tryGetQuickSearchBackgroundRuntime();
	}

	/**
	 * T10: Dispose + drop the runtime — called from `main.onunload`
	 * so a hot-reloaded plugin bundle does not keep abort controllers
	 * + agent references for sessions that the new bundle would never
	 * be able to restore.
	 */
	public static clearQuickSearchBackgroundRuntime(): void {
		AppContext.getInstance().runtimeRegistry.clearQuickSearchBackgroundRuntime();
	}

	/**
	 * T11B: Bind the Copilot manual-action runtime at plugin boot.
	 * Delegates to the app-owned `AppRuntimeRegistry`. Fail-loud on
	 * double-bind.
	 */
	public static setCopilotActionRuntime(runtime: CopilotActionRuntime): void {
		AppContext.getInstance().runtimeRegistry.setCopilotActionRuntime(runtime);
	}

	/**
	 * T11B: Read the bound Copilot action runtime. Fail-loud if boot
	 * has not run yet. Used by command actions that should only run
	 * post-boot (e.g. the registered command palette entries that open
	 * a specific Copilot action by id).
	 */
	public static getCopilotActionRuntime(): CopilotActionRuntime {
		return AppContext.getInstance().runtimeRegistry.getCopilotActionRuntime();
	}

	/**
	 * T11B: Soft accessor — returns `null` if boot has not bound the
	 * runtime yet. UI components (Copilot picker, result modal, auto
	 * planner) use this so an early mount renders an empty/loading
	 * state instead of throwing inside React.
	 */
	public static tryGetCopilotActionRuntime(): CopilotActionRuntime | null {
		return AppContext.getInstance().runtimeRegistry.tryGetCopilotActionRuntime();
	}

	/**
	 * T11B: Dispose + drop the Copilot action runtime — called from
	 * `main.onunload` so a hot-reloaded plugin bundle does not retain
	 * references to closed sqlite repos / abort controllers.
	 */
	public static clearCopilotActionRuntime(): void {
		AppContext.getInstance().runtimeRegistry.clearCopilotActionRuntime();
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
			// Release any per-capability runtime so a hot-reloaded plugin
			// bundle does not retain references to the closed sqlite repo
			// or the editor event subscriptions.
			AppContext.instance.runtimeRegistry.clearVaultLintRuntime();
			AppContext.instance.runtimeRegistry.clearAmbientRuntime();
			AppContext.instance.runtimeRegistry.clearVaultReviewRuntime();
			AppContext.instance.runtimeRegistry.clearQuickSearchBackgroundRuntime();
			AppContext.instance.runtimeRegistry.clearCopilotActionRuntime();
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
		/** When true, running in mock/dev environment (e.g. desktop dev). */
		public readonly isMockEnv: boolean = false,
	) {
		// viewManager will be set after ViewManager is created
		this.viewManager = null as any;
		this.eventBus = EventBus.getInstance(app);
		this._bridge = new ClaudeAgentSDKBridge();
		this.runtimeRegistry = new AppRuntimeRegistry();
		this.progressReporter = new ObsidianProgressReporter();
		this.vaultPreview = composeVaultPreview(app);
		this.vaultNavigation = composeVaultNavigation(app);
		this.wikilink = composeWikilink(app);
		this.editorCommands = composeEditorCommands(app);
		this.chatVaultWriter = composeChatVaultWriter(app);
		this.vaultStats = new AppVaultStatsAdapter(app);
		this.copilotReviewHistory = composeCopilotReviewHistory(app);
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

	/** Create a VaultSearchAgent (routes to VaultSearchAgentSDK on desktop). */
	public static vaultSearchAgent(): VaultSearchAgent {
		const ctx = AppContext.getInstance();
		return new VaultSearchAgent(ctx.app, ctx.plugin.manifest.id, ctx.searchClient, ctx.manager);
	}

	/** Create an AIGraphAgent for building multi-lens knowledge graphs. */
	public static aiGraphAgent(): AIGraphAgent {
		const ctx = AppContext.getInstance();
		return new AIGraphAgent(ctx.app, ctx.searchClient, ctx.manager);
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
				(window as any).getVaultPersona = () => getVaultPersona();
				(window as any).cleanupGraphTable = () => {
					const graphCleanupService = new GraphCleanupService(
						sqliteStoreManager.getIndexContext('vault'),
						sqliteStoreManager.getMobiusNodeRepo(),
						sqliteStoreManager.getIndexedDocumentRepo(),
					);
					return graphCleanupService.run();
				};

				// V2 search debug — screenshot + DOM + state, saved to /tmp
					(window as any).dumpV2State = () => {
						try {
							const { useSearchSessionStore } = require('@/ui/view/quick-search/store/searchSessionStore');
							const s = useSearchSessionStore.getState();
							const dump = {
								status: s.status, query: s.query,
								v2Steps: s.v2Steps.map((st: any) => ({
									id: st.id, toolName: st.toolName, displayName: st.displayName,
									status: st.status, summary: st.summary,
									durationMs: st.endedAt && st.startedAt ? st.endedAt - st.startedAt : null,
								})),
								v2ReportLength: s.v2ReportChunks.join('').length,
								v2ReportChunkCount: s.v2ReportChunks.length,
								v2ReportComplete: s.v2ReportComplete,
								v1Steps: s.steps.map((st: any) => ({ type: st.type, status: st.status })),
								usage: s.usage, duration: s.duration, error: s.error,
								debugLogCount: s.agentDebugLog.length,
							};
							console.log('[V2 State Dump]', JSON.stringify(dump, null, 2));
							return dump;
						} catch (e) { console.error('dumpV2State failed', e); }
					};
					(window as any).captureV2Debug = async () => {
						const fs = require('fs');
						const path = require('path');
						const outDir = '/tmp/peak-v2-debug';
						try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
						const ts = Date.now();

						// 1. State dump
						const state = (window as any).dumpV2State?.();
						if (state) {
							fs.writeFileSync(path.join(outDir, `state-${ts}.json`), JSON.stringify(state, null, 2));
						}

						// 2. DOM snapshot of the search result area
						const modalEl = document.querySelector('.modal-container');
						if (modalEl) {
							const html = modalEl.innerHTML;
							fs.writeFileSync(path.join(outDir, `dom-${ts}.html`), html);
						}

						// 3. Screenshot via Electron
						try {
							const electron = require('electron');
							const win = (electron.remote ?? electron).getCurrentWindow?.()
								?? electron.BrowserWindow?.getFocusedWindow?.();
							if (win) {
								const image = await win.webContents.capturePage();
								fs.writeFileSync(path.join(outDir, `screenshot-${ts}.png`), image.toPNG());
								console.log(`[captureV2Debug] screenshot saved: ${outDir}/screenshot-${ts}.png`);
							}
						} catch (e) {
							console.warn('[captureV2Debug] screenshot failed (expected in some Electron configs):', (e as Error).message);
						}

						console.log(`[captureV2Debug] saved to ${outDir}/ (state + dom + screenshot)`);
						return outDir;
					};

					console.debug('🔧 Dev Tools initialized!');
				console.debug('📖 Usage: window.testGraphTools.inspectNote("path/to/note.md")');
				console.debug('📖 Usage: await window.testAISearchTools.testSlotRecall("your question")');
				console.debug('📖 Usage: window.indexDocument("path/to/note.md") — fast core index');
				console.debug('📖 Usage: window.indexDocumentFull("path/to/note.md") — full index + LLM');
				(window as any).testBackboneMap = (opts?: Record<string, unknown>) =>
					(window as any).testAISearchTools.testBackboneMap(opts);
				(window as any).testKnowledgeIntuition = (opts?: Record<string, unknown>) =>
					(window as any).testAISearchTools.testKnowledgeIntuition(opts);
				(window as any).testClassify = (query: string) =>
					(window as any).testAISearchTools.testClassify(query);
				(window as any).testPipelinePhases = (query: string) =>
					(window as any).testAISearchTools.testPipelinePhases(query);
			}
		} else {
			if (typeof window !== 'undefined') {
				const globals = [
					'testGraphTools', 'testAISearchTools', 'indexDocument', 'indexDocumentFull',
					'runPendingLlmIndexEnrichment', 'runPendingVectorIndexEnrichment',
					'getVaultPersona', 'cleanupGraphTable', 'dumpV2State', 'captureV2Debug',
					'testBackboneMap', 'testKnowledgeIntuition', 'testClassify', 'testPipelinePhases',
				];
				for (const g of globals) {
					if ((window as any)[g]) delete (window as any)[g];
				}
			}
		}
	}
}
