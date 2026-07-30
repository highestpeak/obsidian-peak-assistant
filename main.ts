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
	openDocumentComposer,
	openFileAtlas,
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
/**
 * Renderer-safety guard: run the proactive background features at startup?
 * AmbientPush (related-note suggestions → search + PPR), PatternDiscovery
 * (background AI analysis), and the SDK agent-pool warmup each kick off work
 * right after load. OFF by default; they become on-demand until memory-bounded.
 * Module-scoped so both `onload` and `initSqlite` (separate methods) can read it.
 */
const AUTO_STARTUP_PROACTIVE_BACKGROUND = false;

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
		// ── TEMP startup mem diagnostic ──
		try {
			const _fs = require('fs') as typeof import('fs');
			const _L = '/tmp/peak-startup-mem.log';
			_fs.writeFileSync(_L, `=== onload ${Date.now()} ===\n`);
			const _a = (s: string): void => { try { _fs.appendFileSync(_L, `${Date.now()} rss=${Math.round(process.memoryUsage().rss/1048576)}MB | ${s}\n`); } catch {} };
			const _o = { l: console.log, w: console.warn, e: console.error };
			const _wrap = (fn: (...a: unknown[]) => void) => (...a: unknown[]): void => { _a(a.map(x => typeof x==='string'?x:(()=>{try{return JSON.stringify(x)}catch{return String(x)}})()).join(' ').slice(0,200)); fn(...(a as [])); };
			console.log = _wrap(_o.l); console.warn = _wrap(_o.w); console.error = _wrap(_o.e);
			const _t = setInterval(() => _a('·'), 150);
			setTimeout(() => { clearInterval(_t); console.log=_o.l; console.warn=_o.w; console.error=_o.e; }, 180000);
			(this as unknown as { _peakMemMark?: (s: string) => void })._peakMemMark = _a;
		} catch {}
		// ──────────────────────────────
		registerTemplateEngineHelpers();

		// Route provider fetches that would otherwise be blocked by browser
		// CORS (chiefly Anthropic — see docs/recurring-pitfalls.md §8)
		// through Obsidian's Node-side `requestUrl`. Must run before any
		// LLM call — provider-factory reads this at model construction.
		const { setProviderCorsBypassFetch } = await import('@/core/providers/vercel/provider-factory');
		const { obsidianFetch } = await import('@/app/platform/ObsidianFetchAdapter');
		setProviderCorsBypassFetch(obsidianFetch);

		this.uninstallHoverMenuGlobals = installHoverMenuGlobals();

		const data = await this.loadData();
		console.log('[MEM] onload: after loadData');
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
		};
		ProfileRegistry.getInstance().load(ps, (updated) => {
			this.settings.profileSettings = updated;
			void this.saveSettings();
		});
		// Mirror harness tier bindings into the registry so `resolveSlot`
		// sees the current Fast Lookup / Research / Stronger picks.
		this.syncProfileRegistryTierConfigs();

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
				console.log('[MEM] onload: before loadCuratorCatalog');
				const { loadCuratorCatalog } = await import('@/service/agents/harness/curator');
				await loadCuratorCatalog(this.templateManager);
				console.log('[MEM] onload: after loadCuratorCatalog');
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
			// 2026-07-21 (source-truth): expose real Vault availability to
			// SystemPromptSlot via the port so the system prompt stops
			// claiming Vault Search is available before the retrieval port
			// is wired. Lazy getter — the ConversationService exists after
			// this line, and its `isVaultSearchAvailable` flips true once
			// `setVaultRetrievalPort` runs later in bootstrap.
			new ChatRuntimeStateAdapter(() => {
				try {
					return this.aiServiceManager?.conv?.isVaultSearchAvailable() ?? false;
				} catch {
					// `.conv` getter throws before init(); the adapter is only
					// consumed by SystemPromptSlot which never runs pre-init,
					// but the try/catch prevents a stray early call from
					// crashing.
					return false;
				}
			}),
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
		console.log('[MEM] onload: before aiServiceManager.init');
		await this.aiServiceManager.init();
		console.log('[MEM] onload: after aiServiceManager.init');

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

		// Peak Composer (WP1): compose the app-owned Document Composer runtime
		// and bind it on the registry BEFORE workspace layout restore can
		// re-open a Composer leaf. Synchronous (no sqlite dependency), so it is
		// safe to bind here; released in onunload via clearDocumentComposerRuntime.
		try {
			const { composeDocumentComposerRuntime } = await import('@/app/composer');
			appContext.runtimeRegistry.setDocumentComposerRuntime(
				composeDocumentComposerRuntime(this.app, this.manifest.dir, {
					getDefaultDocumentView: () => this.settings.composer.defaultDocumentView,
					setDefaultDocumentView: async (view) => {
						this.settings.composer.defaultDocumentView = view;
						await this.saveSettings();
					},
					getIntelligenceManualOpen: () => this.settings.composer.intelligenceManualOpen,
					setIntelligenceManualOpen: async (open) => {
						this.settings.composer.intelligenceManualOpen = open;
						await this.saveSettings();
					},
				}),
			);
		} catch (e) {
			console.warn('[Peak Composer] runtime compose failed:', e);
		}

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
		// to real backend dispatch. `providerStreamAdapter` deliberately
		// stays omitted until those adopters land — leaving it unset means
		// `provider-direct` does not register, and palette commands
		// resolve to `hermes-harness` (or fall through further) via
		// `resolveBackendStrategy`.
		const backendStrategies = registerBackendStrategies({
			profileRegistry: ProfileRegistry.getInstance(),
		});
		void backendStrategies; // consumers wire in during Wave 1

		const commandGateway = new CommandGateway();
		AppContext.setCommandGateway(commandGateway);
		const gatewayBindings = composeCommandGatewayBindings({
			openSettingsModal,
			openHarnessSetupWizard,
			openQuickSearch,
			openFileAtlas,
			openUsageDashboard,
			openChatStudio,
			openDocumentComposer,
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
		// B1 §5.2 R3: thread the same instance into ConversationService so
		// Chat's tool set can include connected MCP tools. No service-side
		// singleton — the app layer owns the manager and injects it here.
		this.aiServiceManager.conv.setMcpClientManager(mcpClientManager);
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

			// Defer SQLite + search init OFF the startup critical path.
			// Peak's DB open is a ~600MB baseline. Loading it synchronously in
			// onload stacks that baseline on top of other plugins' startup memory
			// spikes — notably the Excalidraw image-cache decode, measured ~2GB
			// transient on this vault — so the renderer's total blows past its
			// per-process ceiling and OOM-aborts (white-screen crash loop). The
			// plugin is built to run with SQLite deferred (mobile skips it
			// outright), so we start it after the workspace is ready AND the
			// initial startup spike has had time to release. Search + File Atlas
			// warm up a few seconds after load instead of blocking / crashing it.
			this.app.workspace.onLayoutReady(() => {
				window.setTimeout(() => {
					this.initSqlite().catch((e) => {
						console.warn('[Peak Assistant] deferred SQLite init failed:', e);
					});
				}, 3500);
			});
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
			if (AUTO_STARTUP_PROACTIVE_BACKGROUND) ambientRuntime.start();

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
			if (AUTO_STARTUP_PROACTIVE_BACKGROUND && (!ambientPushSettings || ambientPushSettings.enableSerendipityGutter !== false)) {
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
		console.log('[MEM] onload: END (returning)');
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
				console.log('[MEM] initSqlite: before sqliteStoreManager.init');
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
				console.log('[MEM] initSqlite: before initializeSearchService');
				await this.initializeSearchService();
				console.log('[MEM] initSqlite: after initializeSearchService');
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
					console.log('[MEM] initSqlite: before composeHubGenerationRuntime');
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
				console.log('[MEM] initSqlite: before sessionContext.init');
				await sessionContext.init();
				console.log('[MEM] initSqlite: after sessionContext.init');
				// Only start background AI services if an active profile is configured
				// (invalid/missing API key causes unrecoverable subprocess crashes)
				const hasActiveProfile = !!ProfileRegistry.getInstance().getActiveAgentProfile();
				if (hasActiveProfile && AUTO_STARTUP_PROACTIVE_BACKGROUND) {
					initPatternSystem(this.aiServiceManager).catch((e) => console.error('[PatternDiscovery] Init failed:', e));
				} else {
					console.log('[Peak Assistant] PatternDiscovery skipped (renderer-safety guard / no active profile)');
				}
				// D1 §R1/R5 + D2 §R1/§R3/§R4: compose MediaGenerationService
				// + MediaJobRunner once at boot, bind them into
				// ConversationService (so `media_generate` can register as a
				// Chat ToolDef), then RESUME resumable async jobs BEFORE
				// falling back to `failAllUnfinished` for the truly
				// unresumable ones. This ordering is load-bearing —
				// running jobs with a persisted providerResponseUrl must
				// restart their poll loop, not be marked failed.
				try {
					const { composeMediaRuntime } = await import('@/app/media/composeMediaGenerationService');
					const { runtime } = await composeMediaRuntime({
						app: this.app,
						getFalApiKey: () => this.settings.ai?.falApiKey,
						getMediaAttachmentFolder: () => this.settings.ai?.mediaAttachmentFolder,
						getRootFolder: () => this.settings.ai?.rootFolder ?? '',
						// Task E1 — settings.ai.mediaDefaults is the user overlay
						// applied inside composeMediaRuntime's loadConfig closure.
						getMediaSettingsOverride: () => this.settings.ai?.mediaDefaults,
						saveArtifactReceipt: (r) => this.aiServiceManager.conv.saveArtifactReceipt(r),
						// Zero-gap §4 A1 — reference resolver reads receipt bytes
						// via this closure; the row lives in
						// `chat_artifact_receipt`, JSON-encoded, so we parse it
						// once and hand back the vaultPath the resolver needs.
						getArtifactReceipt: async (artifactId: string) => {
							try {
								const row = await sqliteStoreManager
									.getChatArtifactReceiptRepo()
									.getById(artifactId);
								if (!row) return null;
								const parsed = row.receipt_json
									? JSON.parse(row.receipt_json)
									: null;
								return { vaultPath: parsed?.vaultPath ?? null };
							} catch {
								return null;
							}
						},
					});
					this.aiServiceManager.conv.setMediaGenerationService(runtime.service);
					// Zero-gap C1 — media understanding runtime (audio/video → text)
					// composed alongside the generation service; useChatSubmit and
					// service-conversation both consume it from `manager.conv`.
					this.aiServiceManager.conv.setMediaUnderstandingRuntime(runtime.understanding);
					// D2 §R3-recovery: real resume BEFORE failAllUnfinished.
					// Anything still `running` with a persisted poll cursor
					// gets its poll loop restarted; anything unresumable
					// (queued mid-submit, running without cursor) is failed
					// with a retriable reason inside `resumeUnfinished`
					// itself. Only truly-orphaned rows (should be zero after
					// resume) fall to failAllUnfinished below.
					try {
						const resumeStats = await runtime.runner.resumeUnfinished();
						if (resumeStats.resumed + resumeStats.failed + resumeStats.awaiting > 0) {
							console.log(
								`[Peak Assistant] Media job resume: ${resumeStats.resumed} resumed, `
								+ `${resumeStats.failed} failed (retriable), `
								+ `${resumeStats.awaiting} awaiting-confirmation preserved`,
							);
						}
					} catch (e) {
						console.warn('[Peak Assistant] Media job resume failed:', e);
					}
					// Safety net: any row not touched by resume (should be
					// zero after the above ran) gets marked failed.
					const cleared = await runtime.service
						.getJobService()
						.failAllUnfinished('boot: no resumable session (post-resume sweep)');
					if (cleared > 0) {
						console.log(`[Peak Assistant] Cleared ${cleared} zombie media job(s) at boot (post-resume)`);
					}
					// D2 §R1: runner owns timers — dispose on plugin unload
					// so a hot reload cannot leak pending setTimeouts.
					this.register(() => {
						try { runtime.runner.dispose(); } catch { /* ignore */ }
					});
				} catch (e) {
					console.warn('[Peak Assistant] MediaGenerationService compose failed:', e);
				}

				// Zero-gap Track D (2026-07-21): compose the app-owned
				// ArtifactProducerService + ReminderSchedulerService so
				// `artifact_create` is a real Chat tool and persisted
				// reminder receipts fire notices at their due time.
				try {
					const { composeArtifactRuntime } = await import('@/app/chat/composeArtifactProducer');
					const artifactRuntime = composeArtifactRuntime({
						app: this.app,
						getRootFolder: () => this.settings.ai?.rootFolder ?? '',
						saveArtifactReceipt: (r) => this.aiServiceManager.conv.saveArtifactReceipt(r),
						notifier: obsidianNotifier,
						reminderSource: {
							listReminderReceipts: () =>
								this.aiServiceManager.conv.listArtifactReceiptsByKind('reminder'),
							saveReceipt: (r) => this.aiServiceManager.conv.saveArtifactReceipt(r),
						},
						onOpenReminderFile: (vaultPath: string) => {
							try {
								this.app.workspace.openLinkText(vaultPath, '', false);
							} catch (openErr) {
								console.warn('[Peak Assistant] open reminder failed:', openErr);
							}
						},
					});
					this.aiServiceManager.conv.setArtifactProducer(artifactRuntime.producer);
					console.log('[MEM] before artifactScheduler.start');
					artifactRuntime.scheduler.start();
					console.log('[MEM] after artifactScheduler.start');
					this.register(() => {
						try { artifactRuntime.scheduler.dispose(); } catch { /* ignore */ }
					});
				} catch (e) {
					console.warn('[Peak Assistant] Artifact producer compose failed:', e);
				}

				console.log('[Peak Assistant] SQLite and search services initialized');

				// Morning Briefing — show proactive recommendations on session start (Phase 4).
				// T8: the briefing path now flows through the app-owned
				// Ambient runtime instead of the retired `MorningBriefingService`
				// singleton. `tryGetAmbientRuntime()` returns null if the
				// runtime was not bound (e.g. Ambient disabled in settings).
				setTimeout(async () => {
					try {
						console.log('[MEM] briefing: timer fired');
						const runtime = AppContext.tryGetAmbientRuntime();
						const shouldShow = (await runtime?.tryShowMorningBriefing()) ?? false;
						console.log(`[MEM] briefing: tryShow returned ${shouldShow}`);
						if (shouldShow) {
							const { MorningBriefingModal } = await import('@/app/ui-host/modals/MorningBriefingModal');
							if (!this.appContext) return;
							const modal = new MorningBriefingModal(this.app, this.appContext);
							console.log('[MEM] briefing: before modal.open');
							modal.open();
							console.log('[MEM] briefing: after modal.open');
						}
					} catch (err) {
						console.warn('[MEM] briefing: FAILED', err);
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

		// chat-studio RUN-01: wire real Vault retrieval into the chat tool
		// layer. App-owned adapter over SearchClient; while unwired the
		// Composer Vault Search switch renders unavailable.
		const searchClientRef = this.searchClient;
		this.aiServiceManager.conv.setVaultRetrievalPort({
			search: async (query, opts) => {
				const response = await searchClientRef.search({
					text: query,
					scopeMode: opts?.scopeFolder ? 'inFolder' : 'all',
					scopeValue: opts?.scopeFolder ? { folderPath: opts.scopeFolder } : undefined,
					topK: opts?.topK,
					searchMode: 'hybrid',
				});
				return response.items.map((item) => ({
					id: item.id,
					path: item.path,
					title: item.title,
					snippet: item.highlight?.text ?? item.content?.slice(0, 300),
				}));
			},
		});

		// T10 / T13-followup (2026-07-02): construct the cascade worker
		// BEFORE the search update listener so the listener can hold a
		// direct reference (drops the retired `CascadeWorker.getInstance()`
		// singleton). Quick Search background runtime is injected so the
		// worker can defer drain while user-facing analyses run.
		this.cascadeWorker = new CascadeWorker(this.app, AppContext.getQuickSearchBackgroundRuntime(), this.settings.ai.rootFolder);
		// first init listener then initializer to avoid missing index changes
		this.searchUpdateQueue = new SearchUpdateListener(this.app, this, this.settings.search, indexService, this.cascadeWorker, this.settings.search.indexRefreshInterval);

		// Register the vault-event listeners only after the workspace is ready.
		// Registered directly in onload, Obsidian replays a `create` event for
		// EVERY existing file during its initial vault scan — on a large vault
		// that enqueues thousands of upserts and reindexes the whole graph at
		// startup, ballooning the renderer heap to multiple GB and OOM-aborting
		// it (the white-screen crash loop). `onLayoutReady` fires after the
		// initial scan, so only genuine post-startup edits are picked up.
		this.app.workspace.onLayoutReady(() => {
			console.log('[MEM] before cascadeWorker/searchUpdateQueue start');
			this.cascadeWorker.start();
			this.searchUpdateQueue.start();
			console.log('[MEM] after cascadeWorker/searchUpdateQueue start');
		});

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
		// Renderer-safety guard: the startup index reconcile re-indexes every
		// file whose content-hash drifted from the index (e.g. after a git
		// sync/checkout resets mtimes and touches content). On a large vault this
		// walks thousands of files and accumulates the graph build unbounded in
		// the renderer heap → multi-GB → OOM-abort (white-screen crash loop,
		// measured ~3GB on this vault: 8794 files scanned, 1297 dirty). The
		// plugin loads fine against the existing index without it; picking up
		// changed files becomes the explicit "Update index" command. Flip to
		// true only once incremental indexing is memory-bounded (batched +
		// released between docs) and the `mobius_node.path` upsert path is fixed.
		const AUTO_STARTUP_INDEX_RECONCILE = false;
		if (AUTO_STARTUP_INDEX_RECONCILE) {
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
		} else {
			console.log('[Peak Assistant] Startup index reconcile skipped (renderer-safety guard). Run "Update index" manually to index changed files.');
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
		// fingerprint cache + Harness bindings drop with the
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
		// Peak Composer runtime: detach the shared vault/workspace listeners so
		// a hot-reloaded bundle does not double-register them.
		try {
			this.appContext?.runtimeRegistry.clearDocumentComposerRuntime();
		} catch { /* not bound — ignore */ }

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
		// Keep the registry's tier mirror in step with any AI Setup change
		// before persisting, so the next resolveSlot() reflects the new picks.
		this.syncProfileRegistryTierConfigs();
		await this.saveData(this.settings);
	}

	/**
	 * Push the current harness tier bindings (Fast Lookup / Research / Stronger)
	 * into ProfileRegistry so `resolveSlot` resolves models from one source for
	 * the Peak Harness model bindings.
	 */
	private syncProfileRegistryTierConfigs(): void {
		const harness = this.settings.harnessSettings ?? DEFAULT_HARNESS_SETTINGS;
		ProfileRegistry.getInstance().setTierConfigs({
			fast: harness.localFastConfig ?? null,
			research: harness.localDeepConfig ?? null,
			stronger: harness.onlineConfig ?? null,
		});
	}

}
