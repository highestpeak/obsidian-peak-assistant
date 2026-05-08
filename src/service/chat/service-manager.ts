import { SLICE_CAPS } from '@/core/constant';
import { App } from 'obsidian';
import { ModelInfoForSwitch, LLMUsage, LLMOutputControlSettings, LLMStreamEvent, MessagePart, LLMRequestMessage, ModelTokenLimits, ModelMetaData } from '@/core/providers/types';
import { computeUsdFromUsage } from '@/service/search/support/llm-cost-utils';
import { modelRegistry } from '@/core/providers/model-registry';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { ChatConversation, ChatMessage, ChatProject, ChatProjectMeta, StarredMessageRecord, ChatResourceRef } from './types';
import type { ConversationType } from './conversation-types';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId, PromptInfo, PromptVariables } from '@/service/prompt/PromptId';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import {
	AIServiceSettings,
	DEFAULT_AI_SERVICE_SETTINGS,
	getAIProfileFilePath,
	getAIPromptFolder,
	getAIResourcesSummaryFolder,
} from '@/app/settings/types';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { IndexService } from '@/service/search/index/indexService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { ContextUpdateService } from './context/ContextUpdateService';
import { ContextPipeline } from './context/ContextPipeline';
import { SystemPromptSlot } from './context/slots/SystemPromptSlot';
import { UserProfileSlot } from './context/slots/UserProfileSlot';
import { ConvSummarySlot } from './context/slots/ConvSummarySlot';
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
import { AgentTemplateId, getTemplateMetadata } from '@/core/template/TemplateRegistry';
import { estimateTokens as estimateTokensFn } from './token-estimation';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText, collectJson, translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';
// NOTE: AppContext is imported in service/ files already (see VaultSearchAgent, IndexService etc).
// The circular reference (AppContext → AIServiceManager → AppContext) is safe because
// the actual getInstance() call happens inside method bodies, not at module evaluation time.
import { AppContext } from '@/app/context/AppContext';

/**
 * Manage AI conversations, storage, and model interactions.
 */
export class AIServiceManager {
	private storage: ChatStorageService;
	private promptService: PromptService;
	private projectService?: ProjectService;
	private conversationService?: ConversationService;
	private resourceSummaryService: ResourceSummaryService;
	private profileService?: UserProfileService;
	private contextUpdateService?: ContextUpdateService;

	constructor(
		private readonly app: App,
		private settings: AIServiceSettings,
		private readonly templateManager?: TemplateManager,
	) {
		// === Settings initialization ===
		// Merge given settings with defaults
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...settings };

		// === Core services initialization ===
		// Storage service for chat data
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
		});

		// === Resource summary service ===
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			getAIResourcesSummaryFolder(this.settings.rootFolder),
		);

		// === Service construction ===
		this.promptService = new PromptService(this.app, this.settings, undefined, this.templateManager);

		// Initialize context service if profile is enabled
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				getAIProfileFilePath(this.settings.rootFolder),
			);
		}

		// Note: ProjectService and ConversationService are initialized in init() method
		// to avoid circular dependency with DocumentLoaderManager
	}

	/** For on-demand template loading (prompts, tool results, agent context). Cleared on plugin unload. */
	getTemplateManager(): TemplateManager | undefined {
		return this.templateManager;
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
		this.projectService = new ProjectService(
			this.app,
			this.storage,
			this.settings.rootFolder,
			this.promptService,
		);
		this.conversationService = new ConversationService(
			this.app,
			this.storage,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.settings,
			this.profileService,
		);

		// Wire ContextPipeline into ConversationService
		const contextPipeline = new ContextPipeline([
			new SystemPromptSlot(this.promptService),
			new UserProfileSlot(this.promptService, this.profileService),
			new ConvSummarySlot(this.promptService),
			new RecentMessagesSlot(this.promptService, this.resourceSummaryService),
			new WorkingContextSlot(this.promptService),
			new ActivityIndexSlot(this.promptService),
			new PrevAnalysisSlot(),
			new ResourceIndexSlot(),
			new VaultIntuitionSlot(),
			new CurrentFileSlot(),
		]);
		this.conversationService.setContextPipeline(contextPipeline);

		// Initialize summary update service
		const eventBus = EventBus.getInstance(this.app);
		this.contextUpdateService = new ContextUpdateService(
			eventBus,
			this.storage,
			this.conversationService,
			this.projectService,
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
		});
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
			);
		}

		this.projectService = new ProjectService(
			this.app,
			this.storage, this.settings.rootFolder, this.promptService,
		);
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			getAIResourcesSummaryFolder(this.settings.rootFolder),
		);
		this.conversationService = new ConversationService(
			this.app,
			this.storage,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.settings,
			this.profileService,
		);

		// Wire ContextPipeline into refreshed ConversationService
		const refreshedPipeline = new ContextPipeline([
			new SystemPromptSlot(this.promptService),
			new UserProfileSlot(this.promptService, this.profileService),
			new ConvSummarySlot(this.promptService),
			new RecentMessagesSlot(this.promptService, this.resourceSummaryService),
			new WorkingContextSlot(this.promptService),
			new ActivityIndexSlot(this.promptService),
			new PrevAnalysisSlot(),
			new ResourceIndexSlot(),
			new VaultIntuitionSlot(),
			new CurrentFileSlot(),
		]);
		this.conversationService.setContextPipeline(refreshedPipeline);

		// Reinitialize summary update service
		const eventBus = EventBus.getInstance(this.app);
		if (this.contextUpdateService) {
			this.contextUpdateService.cleanup();
		}
		this.contextUpdateService = new ContextUpdateService(
			eventBus,
			this.storage,
			this.conversationService,
			this.projectService,
		);

		// Update IndexService with updated AIServiceManager instance
		IndexService.getInstance().init(this);
	}

	setPromptFolder(folder: string): void {
		this.promptService.setPromptFolder(folder);
	}

	/**
	 * Create a new project on disk.
	 */
	async createProject(input: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'>): Promise<ChatProject> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.createProject(input);
	}

	/**
	 * List projects managed by the service.
	 */
	async listProjects(): Promise<ChatProject[]> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.listProjects();
	}

	/**
	 * List conversations, optionally filtered by project.
	 * Supports pagination with limit and offset parameters.
	 */
	async listConversations(
		projectId: string | null | undefined,
		limit?: number,
		offset?: number
	): Promise<ChatConversation[]> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.listConversations(projectId ?? null, limit, offset);
	}

	/**
	 * Count conversations, optionally filtered by project.
	 */
	async countConversations(projectId: string | null | undefined): Promise<number> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.countConversations(projectId ?? null);
	}

	async deleteConversation(conversationId: string): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.deleteConversation(conversationId);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: { title: string; project?: ChatProjectMeta | null; initialMessages?: ChatMessage[]; modelId?: string; provider?: string; conversationType?: ConversationType }): Promise<ChatConversation> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.createConversation(params);
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
		console.debug('[AIServiceManager] createConvFromSearchAIAnalysis called', {
			query: params.query,
			sourcesCount: params.sources.length,
			topicsCount: params.topics?.length ?? 0,
		});

		// Build title from query
		const title = params.query.trim() || 'AI Search Analysis';
		console.debug('[AIServiceManager] Conversation title:', title);

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

		console.debug('[AIServiceManager] Initial message content length:', content.length);

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

		console.debug('[AIServiceManager] Creating conversation with initial message', {
			messageId: initialMessage.id,
			model: defaultModel.modelId,
			provider: defaultModel.provider,
		});

		// Create conversation with initial message containing all search context
		const conversation = await this.createConversation({
			title,
			initialMessages: [initialMessage],
		});

		console.debug('[AIServiceManager] Conversation created successfully', {
			conversationId: conversation.meta.id,
			projectId: conversation.meta.projectId ?? null,
		});

		return conversation;
	}

	/**
	 * Send a message and wait for the full model response (blocking).
	 * Returns the assistant message and usage without persisting. Call addMessage to persist.
	 *
	 * @experimental This method is temporarily not supported. Use streamChat instead.
	 */
	async blockChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): Promise<{ message: ChatMessage; usage?: LLMUsage }> {
		throw new Error('Unsupported operation. Use streamChat instead.');
	}

	/**
	 * Send a message and stream incremental model output.
	 */
	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): AsyncGenerator<LLMStreamEvent> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.streamChat(params);
	}

	/**
	 * Update conversation's active model.
	 */
	async updateConversationModel(params: {
		conversationId: string;
		modelId: string;
		provider: string;
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		await this.conversationService.updateConversationModel(params);
	}

	/**
	 * Update conversation title and mark it as manually edited.
	 */
	async updateConversationTitle(params: {
		conversationId: string;
		title: string;
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		await this.conversationService.updateConversationTitle(params);
	}

	/**
	 * Update conversation's attachment handling mode override.
	 */
	async updateConversationAttachmentHandling(params: {
		conversationId: string;
		attachmentHandlingOverride?: 'direct' | 'degrade_to_text';
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		await this.conversationService.updateConversationAttachmentHandling(params);
	}

	/**
	 * Regenerate conversation title based on current messages and context.
	 */
	async regenerateConversationTitle(conversationId: string): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}

		// Load conversation with messages
		const conversation = await this.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		// Get project if exists
		const projects = await this.listProjects();
		const project = conversation.meta.projectId
			? projects.find(p => p.meta.id === conversation.meta.projectId) || null
			: null;

		// Build context window for title generation
		const context = await this.conversationService.buildContextWindow(conversation.messages, project);

		// Generate new title based on messages and context
		const newTitle = await this.conversationService.generateConversationTitle(conversation.messages, context);

		if (!newTitle || newTitle.trim().length === 0) {
			return;
		}

		// Update title - preserve titleManuallyEdited status, but mark as auto-updated
		await this.conversationService.updateConversationTitle({
			conversationId: conversation.meta.id,
			title: newTitle.trim(),
			titleManuallyEdited: conversation.meta.titleManuallyEdited ?? false,
			titleAutoUpdated: true,
		});
	}

	/**
	 * Update conversation's output control override settings.
	 */
	async updateConversationOutputControl(params: {
		conversationId: string;
		outputControlOverride?: LLMOutputControlSettings;
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		await this.conversationService.updateConversationOutputControl(params);
	}

	/**
	 * Upload files and create resource references.
	 * Uploads files to vault and creates resourceRef for each file.
	 */
	async uploadFilesAndCreateResources(files: File[]): Promise<ChatResourceRef[]> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.uploadFilesAndCreateResources(files);
	}

	/**
	 * Add a message to conversation and save it.
	 */
	async addMessage(params: {
		conversationId: string;
		message: ChatMessage;
		model: string;
		provider: string;
		usage: LLMUsage;
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		this.conversationService.addMessage({
			conversationId: params.conversationId,
			message: params.message,
			model: params.model,
			provider: params.provider,
			usage: params.usage,
		});
	}


	/**
	 * Toggle star status on a message.
	 */
	async toggleStar(params: {
		messageId: string;
		conversationId: string;
		starred: boolean;
	}): Promise<void> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.toggleStar(params);
	}

	/**
	 * Load starred message records.
	 */
	async loadStarred(): Promise<StarredMessageRecord[]> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.loadStarred();
	}

	/**
	 * List starred messages for a project.
	 */
	async listStarredMessagesByProject(projectId: string): Promise<{
		messages: ChatMessage[];
		messageToConversationId: Map<string, string>;
	}> {
		if (!this.storage) {
			throw new Error('StorageService not initialized. Call init() first.');
		}
		return this.storage.listStarredMessagesByProject(projectId);
	}

	/**
	 * Delete a project and all its conversations.
	 */
	async deleteProject(projectId: string): Promise<void> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.deleteProject(projectId);
	}

	/**
	 * Rename a project by renaming its folder.
	 */
	async renameProject(projectId: string, newName: string): Promise<ChatProject> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.renameProject(projectId, newName);
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
	 * Search for external prompts by query string.
	 * Stub: always returns an empty array. AI-powered prompt search is not yet implemented.
	 */
	async searchPrompts(query: string): Promise<Array<{ id: string; label: string; description: string; value: string; icon: string; showArrow: boolean }>> {
		console.debug('[AIServiceManager] searchPrompts called with query:', query);
		return [];
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
	// Provider v2 — Agent SDK query methods (Pattern B / C)
	//
	// These methods route through the shared sdkAgentPool → Claude Agent SDK,
	// using the active agent Profile for credentials.
	// ═══════════════════════════════════════════════════════════════════════════

	/** Resolve pluginId lazily from AppContext singleton. */
	private getPluginId(): string {
		return AppContext.getInstance().plugin.manifest.id;
	}

	private isAgentSdkProfile(profile: Profile): boolean {
		return profile.kind === 'anthropic' || profile.kind === 'openrouter';
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
	 * Emit a usage tracking event. Fire-and-forget — failures are logged but never propagate.
	 */
	private emitUsage(
		usage: LLMUsage | undefined,
		startMs: number,
		isStreaming: boolean,
		feature: UsageFeature = 'internal',
		action: string = 'unknown',
		sessionId?: string,
	): void {
		try {
			if (!usage) return;
			const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
			if (!profile) return;
			void this.getModelInfo(profile.primaryModel, profile.kind).then(modelInfo => {
				const costUsd = computeUsdFromUsage(usage, modelInfo);
				EventBus.getInstance(this.app).dispatch(new UsageRecordedViewEvent({
					sessionId: sessionId ?? crypto.randomUUID(),
					feature,
					action,
					provider: profile.kind,
					model: profile.primaryModel,
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
	 * Wrap an async iterable to capture usage from SDK `result` messages.
	 * Passes all messages through unchanged while extracting usage side-band.
	 */
	private teeUsageFromSdkStream(
		messages: AsyncIterable<any>,
		onUsage: (usage: LLMUsage) => void,
	): AsyncIterable<any> {
		return {
			[Symbol.asyncIterator]() {
				const iter = (messages as any)[Symbol.asyncIterator]();
				return {
					async next() {
						const result = await iter.next();
						if (!result.done) {
							const msg = result.value;
							if (msg?.type === 'result' && msg.usage) {
								onUsage({
									inputTokens: msg.usage.input_tokens ?? 0,
									outputTokens: msg.usage.output_tokens ?? 0,
									totalTokens: (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0),
									cachedInputTokens: msg.usage.cache_read_input_tokens ?? 0,
								});
							}
						}
						return result;
					},
				};
			},
		};
	}

	/**
	 * Pattern B: Single-turn LLM call via Agent SDK. Returns plain text.
	 *
	 * Accepts either a PromptId (with variables) or a raw prompt string.
	 * Routes through the active agent Profile → sdkAgentPool → Claude Agent SDK.
	 *
	 * @param promptOrText - A PromptId or raw user prompt string
	 * @param variables - Template variables (only used when promptOrText is a PromptId)
	 * @param opts - Optional system prompt override and abort signal
	 */
	async queryText(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string },
	): Promise<string> {
		const startMs = Date.now();
		const profile = this.requireActiveProfile();
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		if (this.isAgentSdkProfile(profile)) {
			let capturedUsage: LLMUsage | undefined;
			const rawMessages = queryWithProfile(this.app, this.getPluginId(), profile, {
				prompt: userPrompt,
				systemPrompt,
				maxTurns: 1,
				allowedTools: [],
				signal: opts?.signal,
			});
			const teed = this.teeUsageFromSdkStream(rawMessages, u => { capturedUsage = u; });
			const text = await collectText(teed);
			this.emitUsage(capturedUsage, startMs, false, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
			return text;
		} else {
			const { vercelGenerateText } = await import('@/core/providers/vercel');
			const llmMessages: LLMRequestMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: systemPrompt }] },
				{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
			];
			const { text, usage } = await vercelGenerateText(profile, profile.primaryModel, llmMessages);
			this.emitUsage(usage, startMs, false, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
			return text;
		}
	}

	/**
	 * Pattern A′ (text streaming): Single-turn LLM call that yields raw text deltas.
	 * Simpler than queryStream (Pattern B) — yields plain `{ type: 'delta', text }` chunks
	 * plus a final `{ type: 'done', fullText }`. Ideal for progressive UI like the copilot modal.
	 */
	async *queryTextStream(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string },
	): AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; fullText: string }> {
		const startMs = Date.now();
		const profile = this.requireActiveProfile();
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		let capturedUsage: LLMUsage | undefined;

		if (this.isAgentSdkProfile(profile)) {
			const messages = queryWithProfile(this.app, this.getPluginId(), profile, {
				prompt: userPrompt,
				systemPrompt,
				maxTurns: 1,
				allowedTools: [],
				signal: opts?.signal,
			});

			let fullText = '';
			for await (const raw of messages) {
				const msg = raw as any;
				if (msg.type === 'result' && msg.is_error) {
					const { throwTypedError } = await import('@/core/errors/llm-errors');
					throwTypedError(typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result), fullText || undefined);
				}
				if (msg.type === 'result' && msg.usage) {
					capturedUsage = {
						inputTokens: msg.usage.input_tokens ?? 0,
						outputTokens: msg.usage.output_tokens ?? 0,
						totalTokens: (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0),
						cachedInputTokens: msg.usage.cache_read_input_tokens ?? 0,
					};
				}
				if (msg.type === 'stream_event') {
					const event = msg.event;
					if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta' && typeof event?.delta?.text === 'string') {
						fullText += event.delta.text;
						yield { type: 'delta', text: event.delta.text };
					}
				} else if (msg.type === 'assistant') {
					const blocks = msg.message?.content ?? [];
					for (const block of blocks) {
						if (block.type === 'text' && typeof block.text === 'string' && fullText.length === 0) {
							fullText += block.text;
							yield { type: 'delta', text: block.text };
						}
					}
				}
			}
			yield { type: 'done', fullText };
		} else {
			const { vercelStreamChat } = await import('@/core/providers/vercel');
			const llmMessages: LLMRequestMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: systemPrompt }] },
				{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
			];
			let fullText = '';
			for await (const event of vercelStreamChat(profile, profile.primaryModel, { messages: llmMessages, abortSignal: opts?.signal })) {
				if (event.type === 'text-delta') {
					fullText += event.text;
					yield { type: 'delta', text: event.text };
				} else if (event.type === 'complete') {
					capturedUsage = event.usage;
				}
			}
			yield { type: 'done', fullText };
		}

		this.emitUsage(capturedUsage, startMs, true, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
	}

	/**
	 * Pattern B (streaming): Single-turn LLM call via Agent SDK.
	 * Yields LLMStreamEvents for progressive UI updates.
	 *
	 * @param promptOrText - A PromptId or raw user prompt string
	 * @param variables - Template variables (only used when promptOrText is a PromptId)
	 * @param opts - Optional system prompt override, trigger name, and abort signal
	 */
	async *queryStream(
		promptOrText: string,
		variables?: Record<string, unknown>,
		opts?: { systemPrompt?: string; triggerName?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string },
	): AsyncGenerator<LLMStreamEvent> {
		const startMs = Date.now();
		const profile = this.requireActiveProfile();
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		let capturedUsage: LLMUsage | undefined;

		if (this.isAgentSdkProfile(profile)) {
			for await (const event of translateSdkMessages(
				queryWithProfile(this.app, this.getPluginId(), profile, {
					prompt: userPrompt,
					systemPrompt,
					maxTurns: 1,
					allowedTools: [],
					signal: opts?.signal,
				}),
				{ triggerName: opts?.triggerName as any },
			)) {
				if (event.type === 'complete') {
					capturedUsage = event.usage;
				}
				yield event;
			}
		} else {
			const { vercelStreamChat } = await import('@/core/providers/vercel');
			const llmMessages: LLMRequestMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: systemPrompt }] },
				{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
			];
			for await (const event of vercelStreamChat(profile, profile.primaryModel, { messages: llmMessages, abortSignal: opts?.signal })) {
				if (opts?.triggerName) {
					(event as any).triggerName = opts.triggerName;
				}
				if (event.type === 'complete') {
					capturedUsage = event.usage;
				}
				yield event;
			}
		}

		this.emitUsage(capturedUsage, startMs, true, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
	}

	/**
	 * Pattern C: Structured output via Agent SDK. Returns parsed JSON.
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
		opts?: { systemPrompt?: string; signal?: AbortSignal; usageFeature?: UsageFeature; usageAction?: string; usageSessionId?: string },
	): Promise<T> {
		const startMs = Date.now();
		const profile = this.requireActiveProfile();
		const { userPrompt, systemPrompt } = await this.resolvePromptPair(
			promptOrText,
			variables,
			opts?.systemPrompt,
		);

		if (this.isAgentSdkProfile(profile)) {
			let capturedUsage: LLMUsage | undefined;
			const rawMessages = queryWithProfile(this.app, this.getPluginId(), profile, {
				prompt: userPrompt,
				systemPrompt,
				maxTurns: 1,
				allowedTools: [],
				jsonSchema: schema,
				signal: opts?.signal,
			});
			const teed = this.teeUsageFromSdkStream(rawMessages, u => { capturedUsage = u; });
			const result = await collectJson<T>(teed);
			this.emitUsage(capturedUsage, startMs, false, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
			return result;
		} else {
			// Vercel path: generate text with JSON instruction, then parse
			const { vercelGenerateText } = await import('@/core/providers/vercel');
			const jsonInstruction = schema
				? `\n\nRespond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`
				: '\n\nRespond with valid JSON.';
			const llmMessages: LLMRequestMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: systemPrompt + jsonInstruction }] },
				{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
			];
			const { text, usage } = await vercelGenerateText(profile, profile.primaryModel, llmMessages);
			this.emitUsage(usage, startMs, false, opts?.usageFeature, opts?.usageAction, opts?.usageSessionId);
			// Extract JSON from potential markdown code fences
			const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
			return JSON.parse(jsonMatch[1]!.trim()) as T;
		}
	}

}

