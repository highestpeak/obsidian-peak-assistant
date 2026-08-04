import { SLICE_CAPS } from '@/core/constant';
import type { AppHandle as App } from '@/core/ports/AppHandle';
import { ModelInfoForSwitch, LLMUsage, LLMStreamEvent, LLMRequestMessage, ModelTokenLimits } from '@/core/providers/types';
import { computeUsdFromUsage } from '@/service/search/support/llm-cost-utils';
import { modelRegistry } from '@/core/providers/model-registry';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { ChatConversation } from './types';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId, PromptInfo, PromptVariables } from '@/core/types/prompt';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AssistantService } from './service-assistant';
import {
	AIServiceSettings,
	DEFAULT_AI_SERVICE_SETTINGS,
} from '@/core/config/settingsTypes';
import {
	getAIProfileFilePath,
	getAIPromptFolder,
	getAIResourcesSummaryFolder,
} from '@/core/config/folderPaths';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { ContextUpdateService } from './context/ContextUpdateService';
import { ContextPipeline } from './context/ContextPipeline';
import { SystemPromptSlot } from './context/slots/SystemPromptSlot';
import { UserProfileSlot } from './context/slots/UserProfileSlot';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { ConvSummarySlot } from './context/slots/ConvSummarySlot';
import { AssistantSlot } from './context/slots/AssistantSlot';
import { RecentMessagesSlot } from './context/slots/RecentMessagesSlot';
import { WorkingContextSlot } from './context/slots/WorkingContextSlot';
import { ActivityIndexSlot } from './context/slots/ActivityIndexSlot';
import { PrevAnalysisSlot } from './context/slots/PrevAnalysisSlot';
import { ResourceIndexSlot } from './context/slots/ResourceIndexSlot';
import { VaultIntuitionSlot } from './context/slots/VaultIntuitionSlot';
import { CurrentFileSlot } from './context/slots/CurrentFileSlot';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import { createChatMessage } from './utils/chat-message-builder';
import type { UsageFeature } from '@/service/usage/types';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { ChatRuntimeStatePort } from '@/core/ports/ChatRuntimeStatePort';
import type { AnalysisHistoryPort } from '@/core/ports/AnalysisHistoryPort';
import type { SearchClient } from '@/service/search/SearchClient';
import type { SearchSettings } from '@/core/config/settingsTypes';
import { AgentTemplateId, getTemplateMetadata } from '@/core/template/TemplateRegistry';
import { estimateTokens as estimateTokensFn } from './token-estimation';
import type { Profile } from '@/core/profiles/types';
import {
	runHarnessText,
	streamHarnessModel,
} from '@/service/agents/harness/HarnessModelRunner';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import type { IDocTagClassifier } from '@/core/llm/IDocTagClassifier';
import type { HarnessSettings } from '@/core/config/settingsTypes';

/**
 * Manage AI conversations, storage, and model interactions.
 *
 * T11J A3: explicitly implements the narrow `IDocSummarizer` and
 * `IDocTagClassifier` ports so `src/core/**` consumers (document loaders,
 * rerank, TagService) can type their dependencies against the port
 * instead of importing this class.
 */
export class AIServiceManager implements IDocSummarizer, IDocTagClassifier {
	private storage: ChatStorageService;
	private promptService: PromptService;
	private _projectService?: ProjectService;
	private _conversationService?: ConversationService;
	private _assistantService?: AssistantService;
	private resourceSummaryService: ResourceSummaryService;
	private profileService?: UserProfileService;
	private generatedOutputs?: GeneratedOutputPersistenceRuntime;
	private contextUpdateService?: ContextUpdateService;

	get proj(): ProjectService {
		if (!this._projectService) throw new Error('ProjectService not initialized. Call init() first.');
		return this._projectService;
	}

	get conv(): ConversationService {
		if (!this._conversationService) throw new Error('ConversationService not initialized. Call init() first.');
		return this._conversationService;
	}

	get assistant(): AssistantService {
		if (!this._assistantService) throw new Error('AssistantService not initialized. Call init() first.');
		return this._assistantService;
	}

	/** Public accessor for PromptService. */
	get prompt(): PromptService {
		return this.promptService;
	}

	constructor(
		private readonly app: App,
		private settings: AIServiceSettings,
		private readonly chatRuntimeState: ChatRuntimeStatePort,
		/**
		 * T11J B3: explicit deps so the manager no longer reaches
		 * `AppContext.getInstance()` for pluginId / harness-settings reads.
		 * `harnessSettingsProvider` is a getter callback because the user
		 * can edit harness settings at runtime.
		 */
		private readonly pluginId: string,
		private readonly harnessSettingsProvider: () => HarnessSettings,
		/**
		 * T11L: narrow analysis-history read port so {@link PrevAnalysisSlot}
		 * and recent-analysis agent tools no longer reach `AppContext` for
		 * the live `AIAnalysisHistoryService`.
		 */
		private readonly analysisHistory: AnalysisHistoryPort,
		/**
		 * T11L: lazy SearchClient resolver. Boot order means the SearchClient
		 * doesn't exist when this manager is constructed; the caller hands a
		 * getter that resolves to the live instance once it's wired (and
		 * `null` while sqlite is still initializing).
		 */
		private readonly searchClientProvider: () => SearchClient | null,
		/**
		 * T11L: search-settings getter so tool factories that need a config
		 * snapshot can stay narrow without reaching `AppContext`.
		 */
		private readonly searchSettingsProvider: () => SearchSettings,
		private readonly templateManager?: TemplateManager,
	) {
		// === Settings initialization ===
		// Merge given settings with defaults
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...settings };

		// === Core services initialization ===
		// Storage service for chat data
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
		}, this.generatedOutputs);

		// === Resource summary service ===
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			getAIResourcesSummaryFolder(this.settings.rootFolder),
			this.generatedOutputs,
		);

		// === Service construction ===
		this.promptService = new PromptService(this.app, this.settings, undefined, this.templateManager);
		// T11J B3: wire the prompter port so PromptService chat helpers no
		// longer reach `AppContext.getInstance().manager`.
		this.promptService.setPrompter(this);

		// Initialize context service if profile is enabled
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				getAIProfileFilePath(this.settings.rootFolder),
				this.generatedOutputs,
			);
		}

		// Note: ProjectService and ConversationService are initialized in init() method
		// to avoid circular dependency with DocumentLoaderManager
	}

	/** For on-demand template loading (prompts, tool results, agent context). Cleared on plugin unload. */
	getTemplateManager(): TemplateManager | undefined {
		return this.templateManager;
	}

	/** Bound by main.ts immediately after the app-owned runtime is composed. */
	setGeneratedOutputPersistenceRuntime(runtime: GeneratedOutputPersistenceRuntime): void {
		this.generatedOutputs = runtime;
		this.storage = new ChatStorageService(this.app, { rootFolder: this.settings.rootFolder }, runtime);
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			getAIResourcesSummaryFolder(this.settings.rootFolder),
			runtime,
		);
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				getAIProfileFilePath(this.settings.rootFolder),
				runtime,
			);
		}
		runtime.projections.register({
			projectionId: 'projection.chat',
			sourceOutputIds: [
				'chat.conversation-events',
				'chat.project-state',
				'run.events',
				'chat.artifact-receipt',
				'media.job-events',
				'chat.assistant-definition',
				'chat.project-plan-state',
			],
			rebuild: async (scope) => {
				const startedAt = new Date().toISOString();
				const report = await this.storage.rebuildChatProjection();
				return {
					projectionId: scope.projectionId,
					sourceOutputIds: [
						'chat.conversation-events',
						'chat.project-state',
						'run.events',
						'chat.artifact-receipt',
						'media.job-events',
						'chat.assistant-definition',
						'chat.project-plan-state',
					],
					recordsRead: report.recordsRead,
					recordsWritten: report.recordsWritten,
					startedAt,
					completedAt: new Date().toISOString(),
					warnings: report.warnings,
				};
			},
		});
	}

	async migrateLegacyGeneratedOutputs(): Promise<{
		conversationsImported: number;
		projectsImported: number;
		resourceSummariesAvailable: number;
		warnings: string[];
	}> {
		const chat = await this.storage.migrateLegacyGeneratedOutputs();
		const resourceSummariesAvailable = this.generatedOutputs
			? (await this.resourceSummaryService.listResourceSummaries()).length
			: 0;
		return {
			...chat,
			resourceSummariesAvailable,
		};
	}

	listDeletedCanonicalConversationIds(): Promise<Set<string>> {
		return this.storage.listDeletedCanonicalConversationIds();
	}

	/**
	 * Expose the narrow analysis-history read port for sub-agents and tools
	 * that need it. Lets the caller use the port without reaching
	 * `AppContext`.
	 */
	getAnalysisHistory(): AnalysisHistoryPort {
		return this.analysisHistory;
	}

	/**
	 * Lazy SearchClient resolver. Returns `null` until the SearchClient is
	 * wired (typically post `initializeSearchService`).
	 */
	getSearchClient(): SearchClient | null {
		return this.searchClientProvider();
	}

	/**
	 * Current top-level search-settings snapshot — used by tool factories
	 * (e.g. `content_reader`) that need to size summary buffers.
	 */
	getSearchSettings(): SearchSettings {
		return this.searchSettingsProvider();
	}

	/**
	 * Initialize storage resources and services that depend on DocumentLoaderManager.
	 */
	async init(): Promise<void> {
		await this.storage.init();
		await this.promptService.init();
		await this.resourceSummaryService.init();
		if (this.profileService) {
			await this.profileService.init();
		}

		// Initialize Project- and conversation-level services after DocumentLoaderManager is ready
		this._projectService = new ProjectService(
			this.app,
			this.storage,
			this.settings.rootFolder,
			this.promptService,
		);
		this._conversationService = new ConversationService(
			this.app,
			this.storage,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.settings,
			this.chatRuntimeState,
			this.pluginId,
			this.profileService,
		);
		this._assistantService = new AssistantService(this.storage);

		// Wire ContextPipeline into ConversationService
		const contextPipeline = new ContextPipeline([
			new SystemPromptSlot(this.promptService, this.chatRuntimeState),
			// B2 (plan §5.3.2): AssistantSlot must be present so a
			// conversation bound to a user assistant actually gets its
			// instructions into the prompt.
			new AssistantSlot(),
			new UserProfileSlot(this.promptService, this.profileService),
			new ConvSummarySlot(this.promptService),
			new RecentMessagesSlot(this.promptService, this.resourceSummaryService),
			new WorkingContextSlot(this.promptService),
			new ActivityIndexSlot(this.promptService),
			new PrevAnalysisSlot(this.analysisHistory),
			new ResourceIndexSlot(),
			new VaultIntuitionSlot(),
			new CurrentFileSlot(),
		]);
		this.conv.setContextPipeline(contextPipeline);

		// Initialize summary update service
		const eventBus = EventBus.getInstance(this.app);
		this.contextUpdateService = new ContextUpdateService(
			eventBus,
			this.storage,
			this.conv,
			this.proj,
		);
	}

	/**
	 * Release event subscriptions and timers. Call from plugin onunload.
	 */
	cleanup(): void {
		this.contextUpdateService?.cleanup();
	}

	/**
	 * Read a conversation by id.
	 * @param loadMessages If true, loads all messages; if false, only loads metadata and context.
	 */
	async readConversation(conversationId: string, loadMessages: boolean = true): Promise<ChatConversation | null> {
		return this.storage.readConversation(conversationId, loadMessages);
	}

	/**
	 * Resolve a vault-relative markdown path to its conversation id, if the
	 * file is a tracked conversation; otherwise null.
	 */
	async findConversationIdByVaultPath(vaultRelPath: string): Promise<string | null> {
		return this.storage.findConversationIdByVaultPath(vaultRelPath);
	}

	/**
	 * Return current AI service settings snapshot.
	 */
	getSettings(): AIServiceSettings {
		return this.settings;
	}

	/**
	 * Get UserProfileService when profile is enabled; otherwise undefined.
	 */
	getProfileService(): UserProfileService | undefined {
		return this.profileService;
	}

	/**
	 * Update settings and rebuild storage handlers.
	 */
	updateSettings(next: AIServiceSettings): void {
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...next };
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
		}, this.generatedOutputs);
		this.promptService.setPromptFolder(getAIPromptFolder(this.settings.rootFolder));
		this.promptService.setSettings(this.settings);
		this.refreshDefaultServices();
	}

	refreshDefaultServices(): void {
		// Reinitialize context service if profile is enabled
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				getAIProfileFilePath(this.settings.rootFolder),
				this.generatedOutputs,
			);
		}

		this._projectService = new ProjectService(
			this.app,
			this.storage, this.settings.rootFolder, this.promptService,
		);
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			getAIResourcesSummaryFolder(this.settings.rootFolder),
			this.generatedOutputs,
		);
		this._conversationService = new ConversationService(
			this.app,
			this.storage,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.settings,
			this.chatRuntimeState,
			this.pluginId,
			this.profileService,
		);
		this._assistantService = new AssistantService(this.storage);

		// Wire ContextPipeline into refreshed ConversationService
		const refreshedPipeline = new ContextPipeline([
			new SystemPromptSlot(this.promptService, this.chatRuntimeState),
			new AssistantSlot(),
			new UserProfileSlot(this.promptService, this.profileService),
			new ConvSummarySlot(this.promptService),
			new RecentMessagesSlot(this.promptService, this.resourceSummaryService),
			new WorkingContextSlot(this.promptService),
			new ActivityIndexSlot(this.promptService),
			new PrevAnalysisSlot(this.analysisHistory),
			new ResourceIndexSlot(),
			new VaultIntuitionSlot(),
			new CurrentFileSlot(),
		]);
		this.conv.setContextPipeline(refreshedPipeline);

		// Reinitialize summary update service
		const eventBus = EventBus.getInstance(this.app);
		if (this.contextUpdateService) {
			this.contextUpdateService.cleanup();
		}
		this.contextUpdateService = new ContextUpdateService(
			eventBus,
			this.storage,
			this.conv,
			this.proj,
		);

		// IndexService itself is constructed by `main.initializeSearchService`
		// which runs after `aiServiceManager.init()`; no rebinding needed here.
	}

	setPromptFolder(folder: string): void {
		this.promptService.setPromptFolder(folder);
	}

	/**
	 * Create a conversation from AI search analysis results.
	 * Builds a comprehensive initial message with search query, summary, sources, and topics.
	 */
	async createConvFromSearchAIAnalysis(params: {
		query: string;
		summary: string;
		sources: Array<{ path: string; title: string; content?: string }>;
		topics?: Array<{ label: string; weight: number }>;
	}): Promise<ChatConversation> {
		// Build title from query
		const title = params.query.trim() || 'AI Search Analysis';

		// Build content with sources as markdown links for context
		const sourcesList = params.sources.slice(0, SLICE_CAPS.chat.sourcesList).map((s, i) => {
			const link = `[[${s.path}|${s.title}]]`;
			const snippet = s.content ? `\n  - ${s.content.substring(0, 200)}...` : '';
			return `${i + 1}. ${link}${snippet}`;
		}).join('\n');

		const topicsList = params.topics && params.topics.length > 0
			? `\n\n**Key Topics:**\n${params.topics.map(t => `- ${t.label} (weight: ${t.weight})`).join('\n')}`
			: '';

		const content = `## Search Query
${params.query}

## Analysis Summary
${params.summary || 'No summary available.'}

## Top Sources (${params.sources.length} files)
${sourcesList}${topicsList}

---
*This conversation was created from an AI Search analysis. You can reference the sources above to continue the discussion.*`;

		// Get default model and timezone
		const defaultModel = this.settings.defaultModel;
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Create initial message with search context
		const initialMessage = createChatMessage(
			'user',
			content,
			defaultModel.modelId,
			defaultModel.provider,
			timezone
		);
		initialMessage.isMarkdownContent = true;

		// Create conversation with initial message containing all search context
		const conversation = await this.conv.createConversation({
			title,
			initialMessages: [initialMessage],
		});

		return conversation;
	}

	/**
	 * Regenerate conversation title based on current messages and context.
	 */
	async regenerateConversationTitle(conversationId: string): Promise<void> {

		// Load conversation with messages
		const conversation = await this.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		// Get project if exists
		const projects = await this.proj.listProjects();
		const project = conversation.meta.projectId
			? projects.find(p => p.meta.id === conversation.meta.projectId) || null
			: null;

		// Build context window for title generation
		const context = await this.conv.buildContextWindow(conversation.messages, project);

		// Generate new title based on messages and context
		const newTitle = await this.conv.generateConversationTitle(conversation.messages, context);

		if (!newTitle || newTitle.trim().length === 0) {
			return;
		}

		// Update title - preserve titleManuallyEdited status, but mark as auto-updated
		await this.conv.updateConversationTitle({
			conversationId: conversation.meta.id,
			title: newTitle.trim(),
			titleManuallyEdited: conversation.meta.titleManuallyEdited ?? false,
			titleAutoUpdated: true,
		});
	}

	async getPromptInfo<T extends PromptId>(
		promptId: T
	): Promise<PromptInfo> {
		return this.promptService.getPromptInfo(promptId);
	}

	/**
	 * Resolve model for a prompt:
	 * 1. `promptModelMap[promptId]` — per-prompt override (most specific)
	 * 2. `analysisModel` — for AiAnalysis* prompts when set
	 * 3. `defaultModel` — global fallback
	 */
	getModelForPrompt(promptId: PromptId): { provider: string; modelId: string } {
		const perPrompt = this.settings.promptModelMap?.[promptId];
		if (perPrompt) return { provider: perPrompt.provider, modelId: perPrompt.modelId };
		if (this.settings.analysisModel && promptId.startsWith('ai-analysis')) {
			return { provider: this.settings.analysisModel.provider, modelId: this.settings.analysisModel.modelId };
		}
		const m = this.settings.defaultModel;
		if (m) return { provider: m.provider, modelId: m.modelId };
		throw new Error('No AI model configured. Open Settings → Model Config to set a default model and enter your API key.');
	}

	async renderTemplate<T extends AgentTemplateId>(
		templateId: T,
		variables: Record<string, unknown>
	): Promise<string> {
		const tm = this.getTemplateManager?.();
		if (!tm) throw new Error('TemplateManager not available');
		return tm.render(templateId, variables);
	}

	async renderPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null
	): Promise<string> {
		return this.promptService.render(promptId, variables);
	}

	/**
	 * App-composed dynamic prompt renderer for user-owned definitions such as
	 * Custom Prompts. Callers receive this through a narrow port rather than
	 * importing Handlebars or PromptService directly.
	 */
	renderDynamicPromptTemplate(template: string, variables: Record<string, unknown>): string {
		return this.promptService.renderDynamicTemplate(template, variables);
	}



	/**
	 * Get all available models from all configured providers.
	 * Uses the static model catalog (no runtime API calls).
	 * Only returns models from enabled providers and enabled models.
	 */
	async getAllAvailableModels(): Promise<ModelInfoForSwitch[]> {
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		const result: ModelInfoForSwitch[] = [];

		for (const [providerId, config] of Object.entries(providerConfigs)) {
			if (config?.enabled !== true) continue;
			const models = modelRegistry.getModelsForProvider(providerId);
			for (const model of models) {
				const modelConfigs = config.modelConfigs;
				if (!modelConfigs) {
					// No modelConfigs → all models default to enabled
					result.push({ ...model, provider: providerId });
					continue;
				}
				const modelConfig = modelConfigs[model.id];
				if (modelConfig?.enabled === true) {
					result.push({ ...model, provider: providerId });
				}
				// If modelConfig is missing or not enabled → skip
			}
		}

		// Include models from custom OpenAI-compatible endpoints
		const customEndpoints = ProfileRegistry.getInstance().getCustomEndpoints();
		for (const endpoint of customEndpoints) {
			if (!endpoint.enabled) continue;
			const endpointProviderId = `custom:${endpoint.id}`;
			const endpointModels = modelRegistry.getModelsForProvider(endpointProviderId);
			for (const m of endpointModels) {
				result.push({ ...m, provider: endpointProviderId });
			}
		}

		return result;
	}

	async getModelInfo(modelId: string, provider: string): Promise<ModelInfoForSwitch | undefined> {
		const allModels = await this.getAllAvailableModels();
		return allModels.find(m => m.id === modelId && m.provider === provider);
	}

	/**
	 * Estimate token count for messages using the specified model
	 * @param messages - Array of messages to estimate tokens for
	 * @returns Estimated token count
	 */
	estimateTokens(messages: LLMRequestMessage[]): number {
		return estimateTokensFn(messages);
	}

	/**
	 * Get token limits for a specific model from the static model catalog.
	 */
	async getModelTokenLimits(model: string, provider: string): Promise<ModelTokenLimits | undefined> {
		return modelRegistry.getModelTokenLimits(provider, model);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Canonical Peak Harness query methods (Pattern B / C)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * T11J B1: Expose the live `app` + `pluginId` so service-side agents can
	 * obtain them via the prompter port chain rather than reaching
	 * `AppContext.getInstance()`. Read-only accessors — no setters.
	 */
	public getApp(): App {
		return this.app;
	}

	public getPluginIdPublic(): string {
		return this.pluginId;
	}

	/**
	 * T11Q (Track F): expose the AI/chat root folder so service-tier agents
	 * can build the explore-folder env from manager deps alone (no
	 * `AppContext` reach). This is the same path used to root prompts /
	 * profiles, so callers do not need a second settings handle.
	 */
	public getChatRootFolder(): string {
		return this.settings.rootFolder;
	}

	/**
	 * Return the current harness settings so agents can read tier config and
	 * escalation policy without importing AppContext directly.
	 */
	getHarnessSettings(): HarnessSettings {
		return this.harnessSettingsProvider();
	}

	/**
	 * Resolve the active agent profile or throw a user-friendly error.
	 */
	private requireActiveProfile() {
		const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
		if (!profile) {
			throw new Error('No active AI profile configured. Please set up a profile in Settings → Profiles.');
		}
		return profile;
	}

	/**
	 * Resolve the active agent profile AND model ID from the Agent config slot.
	 * Uses the slot's configured modelId (not profile.primaryModel).
	 */
	private resolveAgentProfileAndModel(): { profile: Profile; modelId: string } {
		const config = ProfileRegistry.getInstance().getActiveAgentConfig();
		if (config) return config;
		const profile = this.requireActiveProfile();
		return { profile, modelId: profile.primaryModel };
	}

	/**
	 * Resolve the Copilot slot's profile and model. Falls back to Agent slot.
	 */
	private resolveCopilotProfileAndModel(): { profile: Profile; modelId: string } {
		const config = ProfileRegistry.getInstance().getActiveCopilotConfig();
		if (config) return config;
		return this.resolveAgentProfileAndModel();
	}

	/**
	 * Render prompt + system prompt from a PromptId, returning the pair.
	 * When `promptOrText` is not a known PromptId (or rendering fails),
	 * treats it as a raw user prompt string.
	 */
	private async resolvePromptPair(
		promptOrText: string,
		variables?: Record<string, unknown>,
		systemPromptOverride?: string,
	): Promise<{ userPrompt: string; systemPrompt: string }> {
		let systemPrompt = systemPromptOverride ?? '';
		let userPrompt = promptOrText;

		// Attempt to treat promptOrText as a PromptId and render it
		if (this.promptService) {
			try {
				const meta = getTemplateMetadata(promptOrText as PromptId);
				// Load associated system prompt from template registry
				if (!systemPromptOverride && meta.systemPromptId && this.templateManager) {
					const sp = await this.templateManager.getTemplate(meta.systemPromptId);
					if (sp) systemPrompt = sp;
				}
				// Render the prompt template with variables
				const rendered = await this.promptService.render(promptOrText as PromptId, variables as any);
				userPrompt = rendered;
			} catch (err) {
				console.warn('[AIServiceManager] resolvePromptPair: failed to render prompt', promptOrText, err);
			}
		}

		return { userPrompt, systemPrompt };
	}

	/**
	 * Emit a chat-feature usage tracking event with the §11.6 metadata
	 * contract — `message_id`, conversation context, preview, attachments,
	 * tools. Fire-and-forget. Called by the chat send pipeline after the
	 * assistant message lands so the Usage Dashboard can correlate the
	 * usage_log row with outcome events (vault_save / continuation).
	 *
	 * The model + provider come from the conversation meta (not the active
	 * profile) because chat supports per-conversation model overrides.
	 */
	emitChatUsage(input: {
		usage: LLMUsage | undefined;
		startMs: number;
		conversationId: string;
		conversationTitle: string;
		turnIndex: number;
		turnCount: number;
		messageId: string;
		modelId: string;
		provider: string;
		promptText: string;
		responseText: string;
		attachedFiles: string[];
		toolCalls: Array<{ toolName: string }>;
	}): void {
		try {
			if (!input.usage) return;
			const action = 'chat_stream';
			const toolCounts = new Map<string, number>();
			for (const call of input.toolCalls) {
				toolCounts.set(call.toolName, (toolCounts.get(call.toolName) ?? 0) + 1);
			}
			const toolsUsed = Array.from(toolCounts, ([name, count]) => ({ name, count }));
			const metadata = {
				message_id: input.messageId,
				session_title: input.conversationTitle,
				turn_index: input.turnIndex,
				turn_count: input.turnCount,
				prompt_preview: String(input.promptText ?? '').slice(0, 200),
				response_preview: String(input.responseText ?? '').slice(0, 200),
				attached_files: input.attachedFiles,
				tools_used: toolsUsed,
			};
			void this.getModelInfo(input.modelId, input.provider).then(modelInfo => {
				const costUsd = computeUsdFromUsage(input.usage!, modelInfo);
				EventBus.getInstance(this.app).dispatch(new UsageRecordedViewEvent({
					sessionId: input.conversationId,
					feature: 'chat',
					action,
					provider: input.provider,
					model: input.modelId,
					inputTokens: input.usage!.inputTokens ?? 0,
					outputTokens: input.usage!.outputTokens ?? 0,
					cachedTokens: input.usage!.cachedInputTokens ?? 0,
					reasoningTokens: input.usage!.reasoningTokens ?? 0,
					costUsd,
					durationMs: Date.now() - input.startMs,
					isStreaming: true,
					metadata,
				}));
			}).catch(err => {
				console.warn('[AIServiceManager] emitChatUsage: failed to compute cost', err);
			});
		} catch (err) {
			console.warn('[AIServiceManager] emitChatUsage: unexpected error', err);
		}
	}

	/**
	 * Emit a usage tracking event. Fire-and-forget — failures are logged but never propagate.
	 */
	private emitUsage(
		usage: LLMUsage | undefined,
		startMs: number,
		isStreaming: boolean,
		feature: UsageFeature = 'internal',
		action: string = 'unknown',
		sessionId?: string,
		executedModel?: { provider: string; modelId: string },
	): void {
		try {
			if (!usage) return;
			const activeProfile = ProfileRegistry.getInstance().getActiveAgentProfile();
			const provider = executedModel?.provider ?? activeProfile?.kind;
			const modelId = executedModel?.modelId ?? activeProfile?.primaryModel;
			if (!provider || !modelId) return;
			void this.getModelInfo(modelId, provider).then(modelInfo => {
				const costUsd = computeUsdFromUsage(usage, modelInfo);
				EventBus.getInstance(this.app).dispatch(new UsageRecordedViewEvent({
					sessionId: sessionId ?? crypto.randomUUID(),
					feature,
					action,
					provider,
					model: modelId,
					inputTokens: usage.inputTokens ?? 0,
					outputTokens: usage.outputTokens ?? 0,
					cachedTokens: usage.cachedInputTokens ?? 0,
					reasoningTokens: usage.reasoningTokens ?? 0,
					costUsd,
					durationMs: Date.now() - startMs,
					isStreaming,
				}));
			}).catch(err => {
				console.warn('[AIServiceManager] emitUsage: failed to compute cost', err);
			});
		} catch (err) {
			console.warn('[AIServiceManager] emitUsage: unexpected error', err);
		}
	}

	/**
	 * Pattern B: Single-turn LLM call through the Peak Harness.
	 *
	 * Accepts either a PromptId (with variables) or a raw prompt string.
	 * Provider selection remains profile-driven, while Peak owns the loop.
	 *
	 * @param promptOrText - A PromptId or raw user prompt string
	 * @param variables - Template variables (only used when promptOrText is a PromptId)
	 * @param opts - Optional system prompt override and abort signal
	 */
	async queryText(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string; modelId?: string },
	): Promise<string> {
		const startMs = Date.now();
		const resolved = this.resolveAgentProfileAndModel();
		const profile = resolved.profile;
		const modelId = opts?.modelId ?? resolved.modelId;
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		const { text, usage } = await runHarnessText({
			loopId: `query-text-${crypto.randomUUID()}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt,
			maxSteps: 1,
			signal: opts?.signal,
		});
		this.emitUsage(
			usage,
			startMs,
			false,
			opts?.usageFeature,
			opts?.usageAction,
			opts?.usageSessionId,
			{ provider: profile.kind, modelId },
		);
		return text;
	}

	/**
	 * Pattern A′ (text streaming): Single-turn LLM call that yields raw text deltas.
	 * Simpler than queryStream (Pattern B) — yields plain `{ type: 'delta', text }` chunks
	 * plus a final `{ type: 'done', fullText }`. Ideal for progressive UI like the copilot modal.
	 */
	async *queryTextStream(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string; modelId?: string },
	): AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; fullText: string; usage?: LLMUsage }> {
		const startMs = Date.now();
		const resolved = this.resolveCopilotProfileAndModel();
		const profile = resolved.profile;
		const modelId = opts?.modelId ?? resolved.modelId;
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		let capturedUsage: LLMUsage | undefined;
		let fullText = '';
		for await (const event of streamHarnessModel({
			loopId: `query-text-stream-${crypto.randomUUID()}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt,
			maxSteps: 1,
			signal: opts?.signal,
		})) {
			if (event.type === 'text-delta') {
				fullText += event.text;
				yield { type: 'delta', text: event.text };
			} else if (event.type === 'complete') {
				capturedUsage = event.usage;
			}
		}
		yield { type: 'done', fullText, usage: capturedUsage };

		this.emitUsage(
			capturedUsage,
			startMs,
			true,
			opts?.usageFeature,
			opts?.usageAction,
			opts?.usageSessionId,
			{ provider: profile.kind, modelId },
		);
	}

	/**
	 * Pattern B (streaming): Single-turn LLM call through the Peak Harness.
	 * Yields LLMStreamEvents for progressive UI updates.
	 *
	 * @param promptOrText - A PromptId or raw user prompt string
	 * @param variables - Template variables (only used when promptOrText is a PromptId)
	 * @param opts - Optional system prompt override, trigger name, and abort signal
	 */
	async *queryStream(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; triggerName?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string; modelId?: string },
	): AsyncGenerator<LLMStreamEvent> {
		const startMs = Date.now();
		const resolved = this.resolveAgentProfileAndModel();
		const profile = resolved.profile;
		const modelId = opts?.modelId ?? resolved.modelId;
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		let capturedUsage: LLMUsage | undefined;

		for await (const event of streamHarnessModel({
			loopId: `query-stream-${crypto.randomUUID()}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt,
			maxSteps: 1,
			signal: opts?.signal,
			triggerName: opts?.triggerName as any,
		})) {
			if (event.type === 'complete') {
				capturedUsage = event.usage;
			}
			yield event;
		}

		this.emitUsage(
			capturedUsage,
			startMs,
			true,
			opts?.usageFeature,
			opts?.usageAction,
			opts?.usageSessionId,
			{ provider: profile.kind, modelId },
		);
	}

	/**
	 * Pattern C: Structured output through the Peak Harness. Returns parsed JSON.
	 *
	 * The caller provides a JSON schema (not Zod) for the SDK to enforce.
	 * Use `zodToJsonSchema()` to convert Zod schemas before calling.
	 *
	 * @param promptOrText - A PromptId or raw user prompt string
	 * @param variables - Template variables (only used when promptOrText is a PromptId)
	 * @param schema - JSON Schema object for structured output
	 * @param opts - Optional system prompt override and abort signal
	 */
	async queryStructured<T>(
		promptOrText: string,
		variables?: Record<string, unknown>,
		schema?: unknown,
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string; usageCallback?: (usage: LLMUsage) => void; modelId?: string },
	): Promise<T> {
		const startMs = Date.now();
		const resolved = this.resolveCopilotProfileAndModel();
		const profile = resolved.profile;
		const modelId = opts?.modelId ?? resolved.modelId;
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		const jsonInstruction = schema
			? `\n\nRespond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`
			: '\n\nRespond with valid JSON.';
		const { text, usage } = await runHarnessText({
			loopId: `query-structured-${crypto.randomUUID()}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt: systemPrompt + jsonInstruction,
			maxSteps: 1,
			signal: opts?.signal,
		});
		this.emitUsage(
			usage,
			startMs,
			false,
			opts?.usageFeature,
			opts?.usageAction,
			opts?.usageSessionId,
			{ provider: profile.kind, modelId },
		);
		if (usage && opts?.usageCallback) opts.usageCallback(usage);
		// Extract JSON from potential markdown code fences
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
		const raw = jsonMatch[1]?.trim();
		if (!raw) throw new Error('LLM returned empty response — no JSON to parse');
		return JSON.parse(raw) as T;
	}

}
