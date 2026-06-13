import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import type MyPlugin from 'main';
import { MyPluginSettings, HarnessSettings, DEFAULT_HARNESS_SETTINGS } from '../settings/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { EventBus, ViewEventType } from '@/core/eventBus';
import { GraphInspectorTestTools, AISearchAgentTestTools } from '@/app/context/test-tools';
import { cleanupGraphTable } from '@/app/context/graph-cleanup';
import { defaultIndexDocumentOptions, IndexService } from '@/service/search/index/indexService';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { DocSimpleAgent } from '@/service/agents/DocSimpleAgent';
import { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import { AIGraphAgent } from '@/service/agents/AIGraphAgent';
import { getVaultPersona } from '@/service/tools/system-info';
import { SessionContextService } from '@/service/context/SessionContextService';
import { ClaudeAgentSDKBridge } from '@/service/agents/harness-bridge/ClaudeAgentSDKBridge';
import { AppRuntimeRegistry } from '@/app/runtime/AppRuntimeRegistry';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';

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
		this._bridge = new ClaudeAgentSDKBridge();
		this.runtimeRegistry = new AppRuntimeRegistry();
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

	/** Create a VaultSearchAgent (routes to VaultSearchAgentSDK on desktop). */
	public static vaultSearchAgent(): VaultSearchAgent {
		return new VaultSearchAgent(AppContext.getInstance().manager);
	}

	/** Create an AIGraphAgent for building multi-lens knowledge graphs. */
	public static aiGraphAgent(): AIGraphAgent {
		return new AIGraphAgent(AppContext.getInstance().manager);
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
				(window as any).cleanupGraphTable = () => cleanupGraphTable();

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
