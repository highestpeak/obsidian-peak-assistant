import { Plugin } from 'obsidian';
import { isDesktop } from '@/core/platform';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { MySettings } from 'src/app/settings/MySetting';
import { normalizePluginSettings } from 'src/app/settings/PluginSettingsLoader';
import { ViewManager } from 'src/app/view/ViewManager';
import { buildCoreCommands } from 'src/app/commands/Register';
import { registerCoreEvents, removeAllChatViewButtons, clearPendingConversationTimeouts } from 'src/app/events/Register';
import { MyPluginSettings, DEFAULT_HARNESS_SETTINGS } from '@/app/settings/types';
import { SearchClient } from '@/service/search/SearchClient';
import { SearchUpdateListener } from '@/service/search/index/indexUpdater';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { AppVaultReaderAdapter } from '@/app/vault/AppVaultReaderAdapter';
import { IndexService } from '@/service/search/index/indexService';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { BetterSqliteStore } from '@/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore';
import { NativeModuleManager } from '@/core/storage/sqlite/NativeModuleManager';
import { VAULT_DB_FILENAME } from '@/core/constant';
import { AppContext } from '@/app/context/AppContext';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import { setEmbeddingUsageReporter } from '@/core/embeddings/embedClient';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { registerTemplateEngineHelpers } from '@/core/template-engine-helper';
import { DocSimpleAgent } from '@/service/agents/DocSimpleAgent';
import { RerankProviderManager } from '@/core/providers/rerank/factory';
import { warmupPool, shutdownPool } from '@/service/agents/core/sdkAgentPool';
import { TemplateManager } from '@/core/template/TemplateManager';
import { initPatternSystem } from '@/service/context/PatternDiscoveryTrigger';
import { createPluginDirContentProvider } from '@/core/template/PluginDirContentProvider';
import { createVaultContentProvider } from '@/core/template/VaultContentProvider';
import { clearTemplateEngineForUnload } from '@/core/template-engine-helper';
import { clearFormatUtilsCaches } from '@/core/utils/format-utils';
import { getPluginDirAbsolute } from '@/core/utils/obsidian-utils';
import {
	hydrateCodeStopwordsFromTemplateManager,
} from '@/core/utils/markdown-utils';
import { hydrateTextStopwordsFromTemplateManager } from '@/core/utils/stopword-utils';
import { installHoverMenuGlobals } from '@/ui/component/mine/hover-menu-manager';
import { resetAIAnalysisAll } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useGraphAnimationStore } from '@/ui/store/graphAnimationStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { composeAmbientRuntime } from '@/app/ambient/composeAmbientRuntime';
import { markAmbientPushPanelAutoOpened, shouldAutoOpenAmbientPushPanel } from '@/service/ambient/ambientPanelStartup';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { serendipityGutterExtension } from '@/app/ambient/SerendipityGutterPlugin';
import { CascadeWorker } from '@/service/search/index/cascade/CascadeWorker';
import { SessionContextService } from '@/service/context/SessionContextService';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import { UsageOptimizationService } from '@/service/usage/optimization';
import { composeCuratorPushRuntime } from '@/app/usage/composeCuratorPushRuntime';
import { mountCuratorPushRoot } from '@/ui/view/usage-dashboard/runtime/mountCuratorPushRoot';
import { ModelRegistry } from '@/core/providers/model-registry';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { MCPClientManager } from '@/service/mcp/MCPClientManager';
import { DEFAULT_SKILLS_FOLDER } from '@/core/constant';
import { SkillRegistry } from '@/service/skills/SkillRegistry';
import { CapabilityRegistry } from '@/service/capabilities';
import { openSettingsModal } from '@/app/commands/PeakCommandActions';
import {
	clearDefaultProgressReporter,
	setDefaultProgressReporter,
} from '@/service/ports/ProgressReporterPort';
import { ObsidianProgressReporter } from '@/app/adapters/ObsidianProgressReporter';

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

	/** Cleanup function for the Curator runtime push hidden React root + chat-bridge slot registrations. */
	private unmountCuratorPushRoot?: () => void;

	/**
	 * Bootstraps services, views, commands, and layout handling.
	 */
	async onload() {
		// Register the process-level ProgressReporterPort default before any
		// service code can construct an IndexProgressTracker. The tracker's
		// constructor calls getDefaultProgressReporter() when no reporter is
		// passed; a missing registration throws, which makes a forgotten
		// wiring step fail loudly rather than silently dropping notifications.
		setDefaultProgressReporter(new ObsidianProgressReporter());

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
			(aiServiceManager: AIServiceManager) => new DocSimpleAgent(aiServiceManager),
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
			const { composeQuickSearchBackgroundRuntime } = await import('@/app/quick-search/background/composeQuickSearchBackgroundRuntime');
			AppContext.setQuickSearchBackgroundRuntime(composeQuickSearchBackgroundRuntime(this.app));
		}

		// Initialize global DocumentLoaderManager singleton
		// Pass aiServiceManager for loaders that need AI capabilities (e.g., image description)
		// T11K: loaders depend on a narrow vault port; this adapter is the
		// only place that holds Obsidian `App` / `TFile` / `TFolder`.
		const vaultReader = new AppVaultReaderAdapter(this.app);
		DocumentLoaderManager.init(vaultReader, vaultReader, this.settings.search, this.aiServiceManager);

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

		// T11L: bind the "peak-system folder created" notifier from app/
		// so `CopilotReviewHistoryService` (service tier) no longer imports
		// Obsidian's `Notice`. Without this binding the README is still
		// written but no banner is shown (e.g. headless tests).
		{
			const { getCopilotReviewHistoryService } = await import('@/service/copilot/CopilotReviewHistoryService');
			const { Notice } = await import('obsidian');
			getCopilotReviewHistoryService().setFolderCreatedNotifier((message, durationMs) => {
				new Notice(message, durationMs);
			});
		}
		await this.aiServiceManager.init();

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

		// Initialize SQLite store and search service (desktop only — native modules unavailable on mobile)
		this.appContext = appContext;
		if (isDesktop()) {
			// Set up NativeModuleManager so it can auto-download the correct
			// better-sqlite3 binary if the current one is missing or ABI-incompatible.
			NativeModuleManager.getInstance().setPluginDir(getPluginDirAbsolute(undefined, this.app));

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

		// Register Chat surface capability adapter so Settings sees readiness.
		// Chat needs an active agent profile with a primaryModel (the
		// "Conversation" capability). Without one, sends would fail at the
		// service-conversation.streamChat layer; surfacing the gap in Settings
		// lets the user repair via the onboarding wizard / model picker.
		CapabilityRegistry.getInstance().register({
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
		CapabilityRegistry.getInstance().register({
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

		// Connect enabled MCP servers (non-blocking)
		const mcpConfigs = this.settings.mcpServers ?? [];
		for (const config of mcpConfigs) {
			if (config.enabled) {
				MCPClientManager.getInstance().connect(config).catch(e => {
					console.warn(`[Peak Assistant] Failed to connect MCP server "${config.name}":`, e);
				});
			}
		}

		// Initialize Skill Registry (vault folder skills + built-ins)
		const skillsFolder = this.settings.skillsFolder ?? DEFAULT_SKILLS_FOLDER;
		SkillRegistry.getInstance().init(this.app, skillsFolder).catch(e => {
			console.warn('[Peak Assistant] SkillRegistry init failed:', e);
		});

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

			// Status bar indicator
			if (!ambientPushSettings || ambientPushSettings.showStatusBar !== false) {
				const statusBarEl = this.addStatusBarItem();
				statusBarEl.addClass('peak-ambient-status');
				statusBarEl.setText('\u26A1 \u2013');
				statusBarEl.onClickEvent(() => void this.viewManager?.activateAmbientPushView());

				this.ambientStoreUnsub = useAmbientPushStore.subscribe((state) => {
					const count = state.items.length;
					statusBarEl.setText(count > 0 ? `\u26A1 ${count} related` : '\u26A1 \u2013');
				});
			}

			// Auto-open the Related Notes panel in the right sidebar on first run
			this.app.workspace.onLayoutReady(() => {
				if (!shouldAutoOpenAmbientPushPanel(this.settings.ambientPush)) return;

				void this.viewManager?.activateAmbientPushView().then(() => {
					this.settings.ambientPush = markAmbientPushPanelAutoOpened(this.settings.ambientPush);
					void this.saveSettings();
				});
			});

			// CM6 gutter hint for serendipity items (Phase 3)
			if (!ambientPushSettings || ambientPushSettings.enableSerendipityGutter !== false) {
				this.registerEditorExtension(serendipityGutterExtension());
			}
		}

		// Dashboard carrier B/A/C — compose and bind the Curator Push
		// runtime (T11E), then mount the hidden React root that hosts the
		// modal + registers chat-bridge slots (inline receipt, context
		// ring). The runtime is app-owned via AppRuntimeRegistry; unload
		// tears it down via `AppContext.clearCuratorPushRuntime()` and
		// drops the React root via `unmountCuratorPushRoot`.
		const curatorPushRuntime = composeCuratorPushRuntime({
			app: this.app,
			getSettings: () => ({
				usagePreviewEnabled: this.settings.usagePreviewEnabled ?? true,
			}),
		});
		curatorPushRuntime.start();
		AppContext.setCuratorPushRuntime(curatorPushRuntime);
		this.unmountCuratorPushRoot = mountCuratorPushRoot();

		// Auto-open the Harness onboarding wizard on first run (no profiles
		// configured). T11F retired the older general OnboardingModal — the
		// capability-binding wizard is now the single onboarding surface.
		const profiles = ProfileRegistry.getInstance().getAllProfiles();
		if (profiles.length === 0) {
			// Slight delay so the workspace is fully rendered before opening the modal
			setTimeout(() => {
				const { HarnessOnboardingModal } = require('@/ui/view/modals/HarnessOnboardingModal');
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
				});
				UsageTrackingService.getInstance().init(
					sqliteStoreManager.getIndexContext('chat'),
					this.app,
					{
						usageTrackingEnabled: this.settings.usageTrackingEnabled,
						usageDetailRetentionDays: this.settings.usageDetailRetentionDays,
					},
				);
				UsageOutcomeService.getInstance().init(
					sqliteStoreManager.getIndexContext('chat'),
				);
				UsageOptimizationService.getInstance().init(
					sqliteStoreManager.getIndexContext('chat'),
				);
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
				// T11B-R: Copilot action runtime is now bound earlier in
				// onload (right after `aiServiceManager.init()`), so
				// `initSqlite()` no longer touches it. The catalog stays
				// available even when initSqlite is deferred or skipped
				// (mobile).
				const sessionContext = SessionContextService.getInstance(this.app, EventBus.getInstance(this.app));
				await sessionContext.init();
				// Only start background AI services if an active profile is configured
				// (invalid/missing API key causes unrecoverable subprocess crashes)
				const hasActiveProfile = !!ProfileRegistry.getInstance().getActiveAgentProfile();
				if (hasActiveProfile) {
					initPatternSystem().catch((e) => console.error('[PatternDiscovery] Init failed:', e));
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
							const { MorningBriefingModal } = await import('@/ui/view/morning-briefing/MorningBriefingModal');
							const modal = new MorningBriefingModal(this.app);
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
		// Initialize IndexService with AIServiceManager for embedding generation
		IndexService.getInstance().init(this.aiServiceManager);

		this.searchClient = new SearchClient(this.app, this.aiServiceManager, this.settings.search);
		await this.searchClient.init();

		// first init listener then initializer to avoid missing index changes
		this.searchUpdateQueue = new SearchUpdateListener(this.app, this, this.settings.search, this.settings.search.indexRefreshInterval);
		this.searchUpdateQueue.start();

		// T10: inject the Quick Search background runtime so the
		// worker can defer drain while user-facing analyses run,
		// without reaching the retired BackgroundSessionManager.
		this.cascadeWorker = new CascadeWorker(this.app, AppContext.getQuickSearchBackgroundRuntime(), this.settings.ai.rootFolder);
		this.cascadeWorker.start();

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

		// Disconnect MCP servers
		MCPClientManager.getInstance().dispose().catch(() => { /* ignore */ });

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

		// Destroy skill registry (removes vault watchers)
		SkillRegistry.getInstance().destroy();

		// Break singletons so old bundle can be GC'd
		try { this.unmountCuratorPushRoot?.(); } catch { /* ignore */ }
		this.unmountCuratorPushRoot = undefined;
		// T11E: release the app-owned Curator Push runtime (drops the
		// EventBus subscription and resets the Zustand projection).
		try { AppContext.clearCuratorPushRuntime(); } catch { /* not bound — ignore */ }
		UsageTrackingService.getInstance().destroy();
		UsageOutcomeService.getInstance().destroy();
		UsageOptimizationService.getInstance().destroy();
		// T6R: drop the Vault Lint runtime BEFORE clearing AppContext.
		// `AppContext.clearForUnload()` also calls clearVaultLintRuntime
		// internally, but invoking it here makes the ordering explicit
		// and keeps the unload sequence symmetrical with the boot path.
		try { AppContext.clearVaultLintRuntime(); } catch { /* not bound — ignore */ }
		AppContext.clearForUnload();
		SessionContextService.destroyInstance();
		// Drop the ProgressReporterPort default so a hot-reloaded plugin
		// bundle does not see a stale Notice closure from the previous load.
		clearDefaultProgressReporter();
		EventBus.destroyInstance();
		IndexService.clearInstance();
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
