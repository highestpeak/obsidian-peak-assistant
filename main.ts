import { Notice, Plugin } from 'obsidian';
import { isDesktop } from '@/core/platform';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { MySettings } from 'src/app/settings/MySetting';
import { normalizePluginSettings } from 'src/app/settings/PluginSettingsLoader';
import { ViewManager } from 'src/app/ui-host/views/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { composeCommandGatewayBindings } from '@/app/commands/gateway/composeCommandGatewayBindings';
import {
	openChatStudio,
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openQuickSearch,
	openUsageDashboard,
} from '@/app/commands/PeakCommandActions';
import { CommandGateway } from '@/service/capabilities/CommandGateway';
import { registerBackendStrategies } from '@/app/composition/registerBackendStrategies';
import { registerCoreEvents, removeAllChatViewButtons, clearPendingConversationTimeouts } from 'src/app/chat/registerChatMarkdownAffordance';
import { MyPluginSettings, DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import { SearchClient } from '@/service/search/SearchClient';
import { SearchUpdateListener } from '@/service/search/index/indexUpdater';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { AppVaultReaderAdapter } from '@/app/platform/vault/AppVaultReaderAdapter';
import { IndexService } from '@/service/search/index/indexService';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { BetterSqliteStore } from '@/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore';
import { NativeModuleManager } from '@/core/storage/sqlite/NativeModuleManager';
import { DebugTraceRecorder } from '@/core/debug-trace';
import { obsidianHttpClient } from '@/app/platform/HttpClientAdapter';
import { obsidianNotifier } from '@/app/platform/NoticeNotifier';
import { VAULT_DB_FILENAME } from '@/core/constant';
import { AppContext } from '@/app/context/AppContext';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import { setEmbeddingUsageReporter } from '@/service/search/embeddings/embedClient';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { registerTemplateEngineHelpers } from '@/core/template-engine-helper';
import { RerankProviderManager } from '@/core/providers/rerank/factory';
import { warmupPool, shutdownPool } from '@/service/agents/core/sdkAgentPool';
import { TemplateManager } from '@/core/template/TemplateManager';
import { initPatternSystem } from '@/service/context/PatternDiscoveryTrigger';
import { createPluginDirContentProvider } from '@/core/template/PluginDirContentProvider';
import { createVaultContentProvider } from '@/app/platform/vault/VaultContentProvider';
import { clearTemplateEngineForUnload } from '@/core/template-engine-helper';
import { clearFormatUtilsCaches } from '@/core/utils/format-utils';
import { getPluginDirAbsolute } from '@/app/platform/vault/obsidian-utils';
import {
	hydrateCodeStopwordsFromTemplateManager,
} from '@/core/utils/markdown-utils';
import { hydrateTextStopwordsFromTemplateManager } from '@/core/utils/stopword-utils';
import { installHoverMenuGlobals } from '@/ui/component/mine/hover-menu-manager';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useGraphAnimationStore } from '@/ui/store/graphAnimationStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { composeAmbientRuntime } from '@/app/ambient/composeAmbientRuntime';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { serendipityGutterExtension } from '@/app/ambient/SerendipityGutterPlugin';
import { CascadeWorker } from '@/service/search/index/cascade/CascadeWorker';
import { SessionContextService } from '@/service/context/SessionContextService';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import { UsageOptimizationService } from '@/service/usage/optimization';
import { registerUsageDashboardReceipts } from '@/ui/view/usage-dashboard/runtime/registerUsageDashboardReceipts';
import { ModelRegistry } from '@/core/providers/model-registry';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { MCPClientManager } from '@/service/mcp/MCPClientManager';
import { getAISkillsFolder } from '@/core/config/folderPaths';
import { SkillRegistry } from '@/service/skills/SkillRegistry';
import { CapabilityRegistry } from '@/service/capabilities';
import { openSettingsModal } from '@/app/commands/PeakCommandActions';
// Note: `openSettingsModal` is also passed into `composeCommandGatewayBindings`
// (below) via the same import binding; a second import would collide.

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
	private ambientStoreUnsub: (() => void) | null = null;

	// search
	searchClient: SearchClient | null = null;
	searchUpdateQueue: SearchUpdateListener | null = null;
	indexInitializer: IndexInitializer | null = null;
	private cascadeWorker: CascadeWorker | null = null;

	/** Tracks whether SQLite has been lazily initialized (or is in progress). */
	private sqliteInitPromise: Promise<void> | null = null;

	/** Cached AppContext reference for use in initSqlite(). */
	private appContext: AppContext | null = null;

	/** Cleanup function for hover menu globals. */
	private uninstallHoverMenuGlobals?: () => void;

	/** Cleanup function for Usage Dashboard's chat receipt slot registration. */
	private unregisterUsageDashboardReceipts?: () => void;

	/**
	 * Bootstraps services, views, commands, and layout handling.
	 */
	async onload() {
		registerTemplateEngineHelpers();

		this.uninstallHoverMenuGlobals = installHoverMenuGlobals();

		const data = await this.loadData();
		this.settings = normalizePluginSettings(data);
		// Initialize ProfileRegistry from persisted settings (must precede AIServiceManager)
		const ps = this.settings.profileSettings ?? {
			profiles: [],
			activeAgentConfig: null,
			activeAgentFastConfig: null,
			activeChatConfig: null,
			activeCopilotConfig: null,
			activeEmbeddingConfig: null,
			activeWebSearchConfig: null,
			sdkSettings: { ...DEFAULT_SDK_SETTINGS },
		};
		ProfileRegistry.getInstance().load(ps, (updated) => {
			this.settings.profileSettings = updated;
			void this.saveSettings();
		});

		// Auto-detect indexLevel for existing users who already have an embedding profile configured.
		// Only upgrades 'fast' → 'semantic'; never downgrades an explicit user choice.
		if (!this.settings.search.indexLevel || this.settings.search.indexLevel === 'fast') {
			const embProfile = ProfileRegistry.getInstance().getActiveEmbeddingProfile();
			if (embProfile?.embeddingEndpoint && embProfile?.embeddingModel) {
				this.settings.search.indexLevel = 'semantic';
			}
		}

		// Template manager loads prompts/templates from plugin dir on demand (absolute path for Node fs)
		try {
			const pluginDirAbsolute = getPluginDirAbsolute(this.manifest.id, this.app);
			this.templateManager = new TemplateManager(createPluginDirContentProvider(pluginDirAbsolute));
		} catch (e) {
			console.warn('[Peak Assistant] PluginDirContentProvider not available, using vault adapter fallback.', e);
			this.templateManager = new TemplateManager(createVaultContentProvider(this.app, this.manifest.id));
		}
		// T11M: bind the process-wide singleton so UI string loaders
		// (chatStrings, settingsStrings, onboardingStrings, InlineReceipt,
		// UsageDashboard) can fetch the manager directly without reaching
		// through AppContext.
		TemplateManager.setInstance(this.templateManager);
		if (this.templateManager) {
			try {
				await hydrateCodeStopwordsFromTemplateManager(this.templateManager);
				await hydrateTextStopwordsFromTemplateManager(this.templateManager);
			} catch (e) {
				console.warn(
					'[Peak Assistant] Failed to hydrate stopword templates; keyword extraction may be noisier.',
					e,
				);
			}

			// Load per-provider model registry JSON files (overrides bundled catalog data)
			try {
				await ModelRegistry.loadFromTemplateManager(this.templateManager, [
					ConfigTemplateId.ModelsOpenAI,
					ConfigTemplateId.ModelsClaude,
					ConfigTemplateId.ModelsGemini,
					ConfigTemplateId.ModelsPerplexity,
					ConfigTemplateId.ModelsOllamaFamilies,
				]);
			} catch (e) {
				console.warn('[Peak Assistant] Failed to load model registry templates; using bundled catalog.', e);
			}

			// Load curator catalog for the Agent Harness onboarding wizard.
			try {
				const { loadCuratorCatalog } = await import('@/service/agents/harness/curator');
				await loadCuratorCatalog(this.templateManager);
			} catch (e) {
				console.warn('[Peak Assistant] Failed to load curator catalog; harness onboarding will use fallback rules.', e);
			}
		}

		// Initialize global DocumentLoaderManager singleton BEFORE constructing
		// AIServiceManager. The manager's constructor builds ResourceSummaryService,
		// whose ctor calls `DocumentLoaderManager.getInstance()` synchronously to
		// wire a ResourceKindDetector. The AI summarizer dep is late-bound below
		// (after AIServiceManager exists) via `setAiServiceManager()` — that
		// breaks the construction-time cycle that crashed plugin re-enable.
		// T11K: loaders depend on a narrow vault port; this adapter is the only
		// place that holds Obsidian `App` / `TFile` / `TFolder`.
		const vaultReader = new AppVaultReaderAdapter(this.app);
		DocumentLoaderManager.init(vaultReader, vaultReader, this.settings.search);

		// Create AIServiceManager (ConversationService and ProjectService will be initialized in init())
		// T11I (2026-06-26): chat runtime UI toggles reach the service layer via
		// an explicit port so SystemPromptSlot / ConversationService stop
		// importing `useChatViewStore`.
		const { ChatRuntimeStateAdapter } = await import('@/app/chat/ChatRuntimeStateAdapter');
		// T11L: construct AIAnalysisHistoryService FIRST so the manager (and the
		// PrevAnalysisSlot it owns) can take a narrow AnalysisHistoryPort by
		// constructor injection instead of reaching `AppContext` at slot-build
		// time.
		const aiAnalysisHistoryService = new AIAnalysisHistoryService();
		// T11J B3: explicit pluginId + harness-settings provider so the
		// manager no longer reaches `AppContext.getInstance()` for them.
		this.aiServiceManager = new AIServiceManager(
			this.app,
			this.settings.ai,
			new ChatRuntimeStateAdapter(),
			this.manifest.id,
			() => this.settings.harnessSettings ?? DEFAULT_HARNESS_SETTINGS,
			aiAnalysisHistoryService,
			// T11L: providers resolve the SearchClient (set after sqlite init)
			// and the live search-settings snapshot. Tool factories consume
			// them via narrow getters instead of reaching `AppContext`.
			() => this.appContext?.searchClient ?? null,
			() => this.settings.search,
			this.templateManager ?? undefined,
		);

		// Wire the prompter so `onAnalysisComplete` can hand the live
		// AIServiceManager to PatternDiscoveryTrigger without the trigger
		// reaching back into the app layer. Resolver is lazy because the
		// history service was constructed before the manager existed.
		aiAnalysisHistoryService.setPrompterProvider(() => this.aiServiceManager ?? null);

		// Create AppContext EARLY — before any service init runs, so obsidian-utils and
		// vault-utils resolveApp() helpers can find the singleton during downstream init
		// chains. searchClient is null-cast now; back-filled after initializeSearchService
		// below. This replaces an earlier bug where AppContext was created too late.
		const appContext = new AppContext(
			this.app,
			this.aiServiceManager,
			null as unknown as SearchClient,
			this,
			this.settings,
			aiAnalysisHistoryService,
		);

		// T10: bind the Quick Search background-session runtime as
		// soon as AppContext exists. The runtime is in-memory only —
		// no sqlite dependency — so it can be ready before the
		// CascadeWorker (which dependency-injects it) constructs in
		// `initializeSearchService`. Production callers reach it via
		// `AppContext.tryGetQuickSearchBackgroundRuntime()`; the
		// previous `BackgroundSessionManager.getInstance()` singleton
		// is retired.
		{
			const { composeQuickSearchBackgroundRuntime } = await import('@/app/search/background/composeQuickSearchBackgroundRuntime');
			AppContext.setQuickSearchBackgroundRuntime(composeQuickSearchBackgroundRuntime(this.app));
		}

		// Late-bind the AI summarizer onto the already-initialized
		// DocumentLoaderManager. Loaders that need AI capabilities (image
		// description, markdown/text summarization) pick it up via the
		// re-registration in `setAiServiceManager`.
		DocumentLoaderManager.getInstance().setAiServiceManager(this.aiServiceManager);

		// T11K B3: bind the embedding usage reporter so `embedClient`
		// surfaces usage events without reaching `AppContext` from core.
		setEmbeddingUsageReporter({
			report: (u) => {
				appContext.eventBus.dispatch(new UsageRecordedViewEvent({
					sessionId: crypto.randomUUID(),
					feature: u.feature,
					action: u.action,
					provider: u.provider,
					model: u.model,
					inputTokens: u.inputTokens,
					outputTokens: 0,
					cachedTokens: 0,
					reasoningTokens: 0,
					costUsd: 0,
					durationMs: u.durationMs,
					isStreaming: false,
				}));
			},
		});

		// T11Q (Track B): `CopilotReviewHistoryService` is now composed in
		// the app layer (`AppContext.copilotReviewHistory`) with its
		// folder-created notifier injected at construction time — no late
		// setter, no service-side singleton.
		await this.aiServiceManager.init();

		// Debug Trace Infrastructure — one in-memory recorder per plugin load.
		// Mode + retention read from `settings.debugTrace`; defaults keep the
		// recorder in `off` mode (zero-alloc hot paths) until the user opts in
		// from Settings → Advanced → Developer → Debug traces.
		//
		// Constructed HERE (before initSqlite / ViewManager / commands) so
		// every downstream consumer — `conv.setDebugTracePort` immediately
		// below, `composeAmbientRuntime` further down — sees a real port
		// instead of null.
		const debugSettings = this.settings.debugTrace;
		const debugRecorder = new DebugTraceRecorder({
			mode: debugSettings?.mode ?? 'off',
			retention:
				debugSettings?.retention === 'session'
					? Number.POSITIVE_INFINITY
					: (debugSettings?.retention ?? 20),
		});
		AppContext.setDebugTracePort(debugRecorder);

		// Publish the port to ConversationService so chat turns record a
		// receipt (context.assemble spans + drop / compact decisions).
		// No-op when the recorder is in 'off' mode.
		this.aiServiceManager.conv.setDebugTracePort(debugRecorder);

		// T11B-R (2026-06-14): bind the Copilot manual-action runtime
		// BEFORE initSqlite(). The catalog must be available the moment
		// the user opens the picker — including mobile mode (no sqlite)
		// and the SQLite-deferred path (native module download pending).
		// SQLite-dependent action execution (find-related, semantic
		// links, tag suggestions) degrades gracefully through the
		// adapter ports; the catalog itself never blocks on sqlite.
		{
			const { composeCopilotActionRuntime } = await import('@/app/copilot/actions/composeCopilotActionRuntime');
			const copilotActionRuntime = composeCopilotActionRuntime(this.app);
			AppContext.setCopilotActionRuntime(copilotActionRuntime);
			copilotActionRuntime
				.refreshCustomPrompts()
				.catch(e => console.warn('[Peak Assistant] Failed to load custom prompts:', e));
		}

		// ─── UI-shell registration comes BEFORE any long-running boot step ───
		//
		// Ribbon icon, workspace event handlers, palette commands, settings
		// tab, and capability registry are all cheap synchronous work. They
		// used to sit AFTER `await this.initSqlite()`, which meant any hang
		// or slow await in the sqlite → search → indexer → session-context
		// chain silently broke the entire plugin UI (no ribbon, no commands,
		// no chat view). Every fresh boot-chain change (Ambient, debug-trace,
		// context pipeline, etc.) was one more way to trip that trap; the
		// pattern showed up repeatedly in the git log (`fix(boot):`,
		// `fix(morning-briefing):`, `fix(pattern-discovery):`).
		//
		// Registering the UI shell here — before `initSqlite()` — decouples
		// UI availability from backend readiness. If sqlite / search init
		// hangs, users still get a working ribbon and can access chat +
		// settings; the sqlite-dependent features degrade gracefully at
		// the call site (e.g. "search index still building").
		this.appContext = appContext;

		// Create ViewManager with AppContext
		this.viewManager = new ViewManager(this, appContext);
		// Set viewManager in AppContext after creation
		appContext.viewManager = this.viewManager;

		this.viewManager.init();

		// register workspace events
		registerCoreEvents(this, this.viewManager);

		// register commands (after services are ready)
		//
		// B1 (2026-07-03): palette commands now flow through the
		// `CommandGateway`. Each command registers a `GatewayBinding`
		// with a stub `execute` that fires the original UI-open handler,
		// but the Obsidian callback goes through `gateway.dispatch(id)`
		// so every invocation is observable as a `RunSession`. Once B3
		// lands live backend strategies, individual bindings can be
		// re-wired to real backend dispatch without touching the palette
		// registration path.
		// B3 (2026-07-03): populate the backend-strategy registry from
		// currently-configured providers. Wave 1 capability adopters
		// (B2.chat / B2.copilot / etc.) will pick up the strategies as
		// they graduate their execute paths from surface-only wrappers
		// to real backend dispatch. `sdkQueryAdapter` /
		// `providerStreamAdapter` deliberately stay omitted until those
		// adopters land — leaving them unset means `claude-sdk` /
		// `provider-direct` do not register, and palette commands
		// resolve to `hermes-harness` (or fall through further) via
		// `resolveBackendStrategy`.
		const backendStrategies = registerBackendStrategies({
			profileRegistry: ProfileRegistry.getInstance(),
		});
		void backendStrategies; // consumers wire in during Wave 1

		const commandGateway = new CommandGateway();
		AppContext.setCommandGateway(commandGateway);
		const gatewayBindings = composeCommandGatewayBindings({
			openQuickSearch,
			openCopilotPanel,
			openCopilotReviewHistory,
			openChatStudio,
			openUsageDashboard,
			openHarnessSetupWizard,
			openSettingsModal,
		});
		for (const binding of gatewayBindings) {
			commandGateway.register(binding);
			this.addCommand({
				id: binding.commandId,
				name: binding.commandLabel,
				callback: () => {
					commandGateway.dispatch(binding.commandId).catch((err) => {
						const msg = err instanceof Error ? err.message : String(err);
						console.error(`[Peak] CommandGateway dispatch failed for '${binding.commandId}':`, err);
						new Notice(`Peak command '${binding.commandLabel}' failed: ${msg}`);
					});
				},
			});
		}
		// Hub Curation commands. Not routed through CommandGateway because they
		// are low-frequency background actions with independent runtime deps.
		// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 9.
		this.addCommand({
			id: 'peak-hub-curate-now',
			name: 'Curate Hubs Now',
			callback: () => {
				void (async () => {
					const { curateHubsNow } = await import('@/app/commands/PeakCommandActions');
					await curateHubsNow();
				})();
			},
		});
		this.addCommand({
			id: 'peak-hub-materialize-active-note',
			name: 'Materialize Hub for Active Note',
			callback: () => {
				void (async () => {
					const { materializeHubForActiveNote } = await import('@/app/commands/PeakCommandActions');
					await materializeHubForActiveNote();
				})();
			},
		});
		this.addCommand({
			id: 'peak-hub-show-latest-plan',
			name: 'Show Latest Hub Curation Plan',
			callback: () => {
				void (async () => {
					const { showLatestHubCurationPlan } = await import('@/app/commands/PeakCommandActions');
					await showLatestHubCurationPlan();
				})();
			},
		});
		this.addCommand({
			id: 'peak-copilot-command-center',
			name: 'Open Copilot Command Center',
			callback: () => {
				void (async () => {
					const { openCopilotCommandCenter } = await import('@/app/commands/PeakCommandActions');
					await openCopilotCommandCenter();
				})();
			},
		});
		this.addCommand({
			id: 'peak-related-notes-open',
			name: 'Open Related Notes panel',
			callback: () => {
				void (async () => {
					const { openRelatedNotes } = await import('@/app/commands/PeakCommandActions');
					openRelatedNotes();
				})();
			},
		});
		this.addCommand({
			id: 'peak-copy-last-debug-trace',
			name: 'Copy last debug trace',
			callback: () => {
				void (async () => {
					const port = AppContext.tryGetDebugTracePort();
					if (!port) {
						new Notice('Debug tracing is not initialised.');
						return;
					}
					if (!port.isEnabled()) {
						new Notice('Debug tracing is off. Enable it in Settings → Advanced.');
						return;
					}
					const recent = port.listRecent(1);
					const run = recent[0];
					if (!run) {
						new Notice('No debug trace has been recorded yet.');
						return;
					}
					const { copyDebugRun } = await import('@/service/debug-trace/copyDebugRun');
					const { DEFAULT_DEBUG_TRACE_SETTINGS } = await import('@/core/config/settingsTypes');
					await copyDebugRun(run.runId, {
						port,
						settings: this.settings.debugTrace ?? DEFAULT_DEBUG_TRACE_SETTINGS,
						writeClipboard: (text) => navigator.clipboard.writeText(text),
						notify: (m) => new Notice(m),
					});
				})();
			},
		});
		this.addCommand({
			id: 'peak-media-tts-active-note',
			name: 'Generate TTS for Active Note (fal.ai)',
			callback: () => {
				void (async () => {
					const { generateTtsForActiveNote } = await import('@/app/commands/PeakCommandActions');
					await generateTtsForActiveNote();
				})();
			},
		});
		this.addCommand({
			id: 'peak-media-cover-active-note',
			name: 'Generate Cover Image for Active Note (fal.ai)',
			callback: () => {
				void (async () => {
					const { generateCoverImageForActiveNote } = await import('@/app/commands/PeakCommandActions');
					await generateCoverImageForActiveNote();
				})();
			},
		});

		// Note: `buildCoreCommands` used to be the palette table; it is
		// intentionally left imported (see top of file) and unused so
		// audits that grep for it can still land on this file until it
		// is removed in a follow-up cleanup pass.
		void buildCoreCommands;
		// add setting ui
		this.addSettingTab(new MySettings(this.app, this, appContext));

		// T13: capability registry owned by AppRuntimeRegistry. Constructed
		// here so Chat + Copilot adapters can self-register before Settings
		// mounts.
		const capabilityRegistry = new CapabilityRegistry();
		AppContext.setCapabilityRegistry(capabilityRegistry);

		// Register Chat surface capability adapter so Settings sees readiness.
		// Chat needs an active agent profile with a primaryModel (the
		// "Conversation" capability). Without one, sends would fail at the
		// service-conversation.streamChat layer; surfacing the gap in Settings
		// lets the user repair via the onboarding wizard / model picker.
		capabilityRegistry.register({
			surfaceId: 'chat',
			surfaceLabel: 'Chat',
			getCapabilityStatus: async () => {
				const profileRegistry = ProfileRegistry.getInstance();
				const profile = profileRegistry.getActiveAgentProfile();
				const hasConvModel = !!profile?.primaryModel;
				return [
					{
						capability: 'Conversation',
						status: hasConvModel ? 'ready' : 'not-ready',
						reason: hasConvModel ? undefined : 'No Conversation model selected',
						repair: hasConvModel ? undefined : {
							label: 'Choose Conversation model',
							action: () => openSettingsModal(),
						},
					},
				];
			},
		});

		// Register Copilot surface capability adapter so Settings sees readiness.
		// Reports: Fast Lookup (single-pass review), Research (multi-round review),
		// Safety (inherited from harness permission mode — optional from copilot's
		// perspective, since copilot does not own permission settings).
		capabilityRegistry.register({
			surfaceId: 'copilot',
			surfaceLabel: 'Copilot',
			getCapabilityStatus: async () => {
				const profileRegistry = ProfileRegistry.getInstance();
				const profile = profileRegistry.getActiveAgentProfile();
				const fastConfig = profileRegistry.getActiveAgentFastConfig();
				const fastReady = !!fastConfig?.modelId;
				const researchReady = !!profile?.primaryModel;
				return [
					{
						capability: 'Fast Lookup',
						status: fastReady ? 'ready' : 'needs-attention',
						reason: fastReady ? undefined : 'No fast model configured',
						repair: fastReady ? undefined : {
							label: 'Configure AI behavior',
							action: () => openSettingsModal(),
						},
					},
					{
						capability: 'Research',
						status: researchReady ? 'ready' : 'not-ready',
						reason: researchReady ? undefined : 'No Research model selected',
						repair: researchReady ? undefined : {
							label: 'Configure AI behavior',
							action: () => openSettingsModal(),
						},
					},
					{
						// Copilot inherits permission mode from harness —
						// optional from copilot's perspective.
						capability: 'Safety',
						status: 'optional',
					},
				];
			},
		});

		// T13: MCP client manager owned by AppRuntimeRegistry. Constructed
		// here and disposed in onunload so stdio child processes are reaped
		// before a hot-reload spawns replacements.
		const mcpClientManager = new MCPClientManager();
		AppContext.setMcpClientManager(mcpClientManager);
		// Connect enabled MCP servers (non-blocking)
		const mcpConfigs = this.settings.mcpServers ?? [];
		for (const config of mcpConfigs) {
			if (config.enabled) {
				mcpClientManager.connect(config).catch(e => {
					console.warn(`[Peak Assistant] Failed to connect MCP server "${config.name}":`, e);
				});
			}
		}

		// T13: SkillRegistry owned by AppRuntimeRegistry. `init(...)` scans
		// the vault folder + registers file watchers; `destroy()` in clear
		// releases the watchers so a hot reload doesn't double-register them.
		const skillRegistry = new SkillRegistry();
		AppContext.setSkillRegistry(skillRegistry);
		const skillsFolder = this.settings.skillsFolder ?? getAISkillsFolder(this.settings.ai.rootFolder);
		skillRegistry.init(this.app, skillsFolder).catch(e => {
			console.warn('[Peak Assistant] SkillRegistry init failed:', e);
		});

		// Initialize SQLite store and search service (desktop only — native
		// modules unavailable on mobile). This is the historically hang-prone
		// step; the UI shell above is already registered so a hang here can
		// no longer take the ribbon / commands down with it. Downstream
		// runtimes that need sqlite (Ambient below) still sit after this
		// await because their adapters would throw immediately without a
		// live sqlite store.
		if (isDesktop()) {
			// Set up NativeModuleManager so it can auto-download the correct
			// better-sqlite3 binary if the current one is missing or ABI-incompatible.
			NativeModuleManager.getInstance().setPluginDir(getPluginDirAbsolute(undefined, this.app));
			NativeModuleManager.getInstance().configure({
				http: obsidianHttpClient,
				notifier: obsidianNotifier,
			});

			// Attempt eager init — if native module is already compatible, this is
			// transparent to the user. If it fails (e.g. first install, ABI mismatch
			// after Obsidian update), the plugin still loads and the user can trigger
			// setup via the onboarding wizard command.
			try {
				await this.initSqlite();
			} catch (e) {
				console.warn('[Peak Assistant] SQLite deferred — native module not ready yet:', e);
			}
		} else {
			console.log('[Peak Assistant] Mobile mode: SQLite and indexing skipped');
		}

		// Ambient Push — proactive related-note suggestions
		// T8: Ambient runtime is composed at the app layer and bound on
		// the app-owned `AppRuntimeRegistry`. Production callers reach
		// it via `AppContext.{get,tryGet}AmbientRuntime()`; the previous
		// `AmbientPushService.getInstance()` singleton is retired.
		const ambientPushSettings = this.settings.ambientPush;
		if (!ambientPushSettings || ambientPushSettings.enabled !== false) {
			const ambientRuntime = composeAmbientRuntime(this.app);
			AppContext.setAmbientRuntime(ambientRuntime);
			ambientRuntime.start();

			// Status bar indicator. D1 upgrade: prefer the LLM-inferred working
			// context summary when available (SessionContextService.workingTheme
			// .llmInferred), fall back to the "N related" count otherwise. The
			// status-bar text is refreshed on both AmbientPushStore updates and
			// a 60s poll so the working-theme summary appears once the
			// WorkingThemeInferrer produces one.
			if (!ambientPushSettings || ambientPushSettings.showStatusBar !== false) {
				const statusBarEl = this.addStatusBarItem();
				statusBarEl.addClass('peak-ambient-status');
				statusBarEl.setText('\u26A1 \u2013');

				const refreshStatusBar = () => {
					try {
						const sessionCtx = SessionContextService.getInstance();
						const summary = sessionCtx.getWorkingContext().workingTheme.llmInferred?.summary;
						if (summary && summary.trim().length > 0) {
							const short = summary.length > 44 ? `${summary.slice(0, 41)}\u2026` : summary;
							statusBarEl.setText(`\uD83E\uDDE0 ${short}`);
							statusBarEl.title = summary;
							return;
						}
					} catch {
						// SessionContextService not initialized yet \u2014 fall through
					}
					const count = useAmbientPushStore.getState().items.length;
					statusBarEl.setText(count > 0 ? `\u26A1 ${count} related` : '\u26A1 \u2013');
					statusBarEl.title = '';
				};

				this.ambientStoreUnsub = useAmbientPushStore.subscribe(() => refreshStatusBar());
				const themePollTimer = window.setInterval(refreshStatusBar, 60_000);
				this.register(() => window.clearInterval(themePollTimer));
				refreshStatusBar();
			}

			// CM6 gutter hint for serendipity items (Phase 3)
			if (!ambientPushSettings || ambientPushSettings.enableSerendipityGutter !== false) {
				this.registerEditorExtension(serendipityGutterExtension());
			}
		}

		// Usage Dashboard carrier A — register the inline receipt renderer
		// shown under assistant messages.
		this.unregisterUsageDashboardReceipts = registerUsageDashboardReceipts();

		// Auto-open the Harness onboarding wizard on first run (no profiles
		// configured). T11F retired the older general OnboardingModal — the
		// capability-binding wizard is now the single onboarding surface.
		const profiles = ProfileRegistry.getInstance().getAllProfiles();
		if (profiles.length === 0) {
			// Slight delay so the workspace is fully rendered before opening the modal
			setTimeout(() => {
				const { HarnessOnboardingModal } = require('@/app/ui-host/modals/HarnessOnboardingModal');
				new HarnessOnboardingModal(appContext, { isReRun: false }).open();
			}, 500);
		}
	}

	/**
	 * Initialize SQLite and all dependent services (search, indexing, pattern discovery).
	 * Safe to call multiple times — second call returns the same promise.
	 * Called eagerly in onload() if native module is ready, or lazily from the
	 * onboarding wizard after native module download completes.
	 */
	async initSqlite(): Promise<void> {
		if (this.sqliteInitPromise) return this.sqliteInitPromise;

		this.sqliteInitPromise = (async () => {
			try {
				await sqliteStoreManager.init({
					app: this.app,
					storageFolder: this.settings.dataStorageFolder,
					filename: VAULT_DB_FILENAME,
					settings: { sqliteBackend: this.settings.sqliteBackend },
					// T11Q: app-layer Notice for "backend unavailable" — core no
					// longer imports Obsidian's `Notice` directly.
					unavailableReporter: (message, durationMs) => {
						const { Notice } = require('obsidian') as typeof import('obsidian');
						new Notice(message, durationMs);
					},
				});
				// T13: Usage services owned by AppRuntimeRegistry as a bundle.
				// UsageTrackingService subscribes to EventBus in `init()`;
				// `clearUsageServices` in onunload calls `destroy()` on all
				// three so a hot reload does not double-register the listener.
				const chatDb = sqliteStoreManager.getIndexContext('chat');
				const usageTracking = new UsageTrackingService();
				const usageOutcome = new UsageOutcomeService();
				const usageOptimization = new UsageOptimizationService();
				usageTracking.init(chatDb, this.app, {
					usageTrackingEnabled: this.settings.usageTrackingEnabled,
					usageDetailRetentionDays: this.settings.usageDetailRetentionDays,
				});
				usageOutcome.init(chatDb);
				usageOptimization.init(chatDb);
				AppContext.setUsageServices({
					tracking: usageTracking,
					outcome: usageOutcome,
					optimization: usageOptimization,
				});
				await this.initializeSearchService();
				if (this.appContext) {
					this.appContext.searchClient = this.searchClient!;
				}
				// T6R: bind the Vault Lint runtime once sqlite is ready.
				// Ownership lives on `AppContext` (delegating to the
				// app-owned `AppRuntimeRegistry`). Consumers reach the
				// engine through `AppContext.getVaultLintRuntime()` or
				// via the React `ServiceContext`; the service layer no
				// longer owns the binding.
				{
					const { composeVaultLintRuntime } = await import('@/app/lint/composeVaultLintRuntime');
					AppContext.setVaultLintRuntime(composeVaultLintRuntime());
				}
				// T9: bind the Vault Review runtime once Vault Lint is bound
				// (the digest adapter reads the lint runtime at compose
				// time). UI (`VaultAutoRunModal`, picker, history modal)
				// reaches the runtime via `AppContext.tryGetVaultReviewRuntime()`.
				{
					const { composeVaultReviewRuntime } = await import('@/app/copilot/vault/composeVaultReviewRuntime');
					AppContext.setVaultReviewRuntime(composeVaultReviewRuntime(this.app));
				}
				// Hub Generation runtime (Curator + Materializer + Executor + Scheduler).
				// Must run after sqlite + AIServiceManager + TemplateManager are ready.
				try {
					const { composeHubGenerationRuntime } = await import('@/app/hub/composeHubGenerationRuntime');
					const templateManager = this.aiServiceManager.getTemplateManager?.();
					if (templateManager) {
						const { runtime, scheduler } = composeHubGenerationRuntime({
							app: this.app,
							aiServiceManager: this.aiServiceManager,
							templateManager,
							getSettings: () => this.settings.search,
							rootFolder: this.settings.ai?.rootFolder ?? '',
						});
						this.appContext?.runtimeRegistry.setHubGenerationRuntime(runtime, scheduler);
					} else {
						console.warn('[Peak] Hub Generation runtime skipped — TemplateManager not available.');
					}
				} catch (e) {
					console.warn('[Peak] Hub Generation runtime compose failed:', e);
				}
				// T11B-R: Copilot action runtime is now bound earlier in
				// onload (right after `aiServiceManager.init()`), so
				// `initSqlite()` no longer touches it. The catalog stays
				// available even when initSqlite is deferred or skipped
				// (mobile).
				const sessionContext = SessionContextService.getInstance(
					this.app,
					EventBus.getInstance(this.app),
					// T11Q (Track A): inject the working-theme LLM query so
					// WorkingThemeInferrer no longer reaches into AppContext.
					(promptId, vars) => this.aiServiceManager.queryText(promptId as any, vars as any),
				);
				await sessionContext.init();
				// Only start background AI services if an active profile is configured
				// (invalid/missing API key causes unrecoverable subprocess crashes)
				const hasActiveProfile = !!ProfileRegistry.getInstance().getActiveAgentProfile();
				if (hasActiveProfile) {
					initPatternSystem(this.aiServiceManager).catch((e) => console.error('[PatternDiscovery] Init failed:', e));
					warmupPool().catch((e) => console.warn('[sdkAgentPool] warmup failed:', e));
				} else {
					console.log('[Peak Assistant] No active profile — skipping PatternDiscovery and agent pool warmup');
				}
				console.log('[Peak Assistant] SQLite and search services initialized');

				// Morning Briefing — show proactive recommendations on session start (Phase 4).
				// T8: the briefing path now flows through the app-owned
				// Ambient runtime instead of the retired `MorningBriefingService`
				// singleton. `tryGetAmbientRuntime()` returns null if the
				// runtime was not bound (e.g. Ambient disabled in settings).
				setTimeout(async () => {
					try {
						const runtime = AppContext.tryGetAmbientRuntime();
						const shouldShow = (await runtime?.tryShowMorningBriefing()) ?? false;
						if (shouldShow) {
							const { MorningBriefingModal } = await import('@/app/ui-host/modals/MorningBriefingModal');
							if (!this.appContext) return;
							const modal = new MorningBriefingModal(this.app, this.appContext);
							modal.open();
						}
					} catch {
						// Morning briefing is non-critical
					}
				}, 3000);
			} catch (e) {
				// Clear so next call retries instead of returning a rejected promise
				this.sqliteInitPromise = null;
				throw e;
			}
		})();

		return this.sqliteInitPromise;
	}

	/**
	 * Initialize search client and background indexing.
	 */
	private async initializeSearchService(): Promise<void> {
		// T13: IndexService constructed with AIServiceManager + env (chat root
		// + live `App`) injected via constructor. Bound on the app-owned
		// `AppRuntimeRegistry`; consumers reach it through
		// `AppContext.getIndexService()`.
		const indexService = new IndexService(
			this.aiServiceManager,
			{
				app: this.app,
				rootFolder: this.settings.ai.rootFolder,
			},
		);
		AppContext.setIndexService(indexService);

		this.searchClient = new SearchClient(this.app, this.aiServiceManager, this.settings.search);
		await this.searchClient.init();

		// T10 / T13-followup (2026-07-02): construct the cascade worker
		// BEFORE the search update listener so the listener can hold a
		// direct reference (drops the retired `CascadeWorker.getInstance()`
		// singleton). Quick Search background runtime is injected so the
		// worker can defer drain while user-facing analyses run.
		this.cascadeWorker = new CascadeWorker(this.app, AppContext.getQuickSearchBackgroundRuntime(), this.settings.ai.rootFolder);
		this.cascadeWorker.start();

		// first init listener then initializer to avoid missing index changes
		this.searchUpdateQueue = new SearchUpdateListener(this.app, this, this.settings.search, indexService, this.cascadeWorker, this.settings.search.indexRefreshInterval);
		this.searchUpdateQueue.start();

		// Check index status and perform incremental indexing if needed
		// This handles cases where files were modified outside Obsidian (e.g., git sync, external editors)
		this.indexInitializer = new IndexInitializer(
			this.app,
			this.settings.search,
			this.settings.dataStorageFolder,
			AppContext.getInstance().progressReporter,
			indexService,
		);
		// B2.index (2026-07-03): startup check-and-update runs inside a
		// RunEnvelope so startup latency + failures land in the run
		// trace. Errors are logged (not rethrown) — a startup index
		// glitch must not prevent the plugin from loading, mirroring
		// the pre-RunEnvelope try/catch behaviour that used to wrap
		// this call.
		try {
			const { runIndexInitializer } = await import(
				'@/service/search/index/indexInitializerRun'
			);
			await runIndexInitializer({
				initializer: this.indexInitializer,
				trigger: 'startup',
			});
		} catch (err) {
			console.error('[Peak] startup IndexInitializer run failed:', err);
		}
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

		// Clear Zod global registry and remove global ref so registry/schemas can be GC'd (zod closure may still hold ref until bundle is unloaded)
		try {
			const g = globalThis as unknown as { __zod_globalRegistry?: { clear(): void } };
			const reg = g.__zod_globalRegistry;
			if (reg && typeof reg.clear === 'function') {
				reg.clear();
				delete g.__zod_globalRegistry;
			}
		} catch (_) { /* ignore */ }

		// Clean up Ambient Push.
		// T8: dispose flows through the runtime registry; the old
		// duplicate `AmbientPushService.getInstance().dispose()` call
		// near the bottom of this method is also retired.
		this.ambientStoreUnsub?.();
		this.ambientStoreUnsub = null;
		try { AppContext.clearAmbientRuntime(); } catch { /* not bound — ignore */ }
		// T9: release the Vault Review runtime so the digest adapter's
		// fingerprint cache + agent SDK bindings drop with the
		// hot-reloaded bundle.
		try { AppContext.clearVaultReviewRuntime(); } catch { /* not bound — ignore */ }
		// Hub Generation runtime: dispose scheduler timer + drop agent refs.
		try {
			const registry = AppContext.getInstance().runtimeRegistry;
			registry.clearHubGenerationRuntime();
		} catch { /* not initialized — ignore */ }

		// T13: MCP client manager is released via `clearForUnload` (below),
		// which calls `dispose()` and reaps any live stdio child processes.
		// Kept as a fail-loud break in case the AppContext is already torn
		// down when this code path runs (e.g. crash-recovery unload).
		try { AppContext.clearMcpClientManager(); } catch { /* not bound — ignore */ }
		// Debug Trace recorder: release the in-memory ring buffer so the
		// hot-reloaded bundle starts with an empty history.
		try { AppContext.clearDebugTracePort(); } catch { /* not bound — ignore */ }

		clearPendingConversationTimeouts();
		this.viewManager?.unload();
		removeAllChatViewButtons();
		if (this.templateManager) {
			this.templateManager.clear();
			this.templateManager = null;
		}
		TemplateManager.setInstance(null);
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

		// Dispose cascade worker before closing DB
		this.cascadeWorker?.dispose();
		this.cascadeWorker = null;

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
			useChatDataStore.getState().reset();
			useGraphAnimationStore.getState().reset();
			useChatViewStore.getState().reset();
		} catch (e) {
			console.warn('[Peak Assistant] Store reset on unload:', e);
		}

		// Cancel any ongoing indexing operations
		IndexService.cancelIndexing();

		// Release AI service timers and subscriptions before closing DB so no async touches DB after close
		this.aiServiceManager?.cleanup();

		// Close global SQLite store (sync; already imported at top)
		sqliteStoreManager.close();

		// T10: abort all Quick Search background analysis sessions
		// through the app-owned runtime registry. The retired
		// `BackgroundSessionManager.clearInstance()` singleton tear-down
		// has been replaced by `AppContext.clearQuickSearchBackgroundRuntime`,
		// which itself calls `dispose()` on the runtime (aborts every
		// session + drops listeners + clears the redirect).
		try { AppContext.clearQuickSearchBackgroundRuntime(); } catch { /* not bound — ignore */ }

		// T8: Ambient runtime already released above via
		// `AppContext.clearAmbientRuntime()`; the duplicate dispose call
		// against the retired `AmbientPushService` singleton is gone.

		// Shutdown SDK agent pool (clear cached node info so reload re-probes)
		shutdownPool();

		// T13: Skill + Usage services are released via `clearForUnload`
		// below (which invokes `destroy()` on each). Break the usage
		// dashboard message-receipt registration explicitly so its
		// closure references release before the services do.
		try { this.unregisterUsageDashboardReceipts?.(); } catch { /* ignore */ }
		this.unregisterUsageDashboardReceipts = undefined;
		// T6R: drop the Vault Lint runtime BEFORE clearing AppContext.
		// `AppContext.clearForUnload()` also calls clearVaultLintRuntime
		// internally, but invoking it here makes the ordering explicit
		// and keeps the unload sequence symmetrical with the boot path.
		try { AppContext.clearVaultLintRuntime(); } catch { /* not bound — ignore */ }
		AppContext.clearForUnload();
		SessionContextService.destroyInstance();
		EventBus.destroyInstance();
		// T13: IndexService release now goes through `AppContext.clearForUnload()`
		// invoked just above; no `clearInstance()` static remains.
		DocumentLoaderManager.clearInstance();
		SqliteStoreManager.clearInstance();
		BetterSqliteStore.clearInstance();
		NativeModuleManager.clearInstance();
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
