import { App } from 'obsidian';
import { ModelInfoForSwitch, LLMUsage, LLMOutputControlSettings, LLMStreamEvent, MessagePart } from '@/core/providers/types';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { ChatConversation, ChatMessage, ChatProject, ChatProjectMeta, StarredMessageRecord, ChatResourceRef } from './types';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId, PromptVariables } from '@/service/prompt/PromptId';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { IndexService } from '@/service/search/index/indexService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { ContextUpdateService } from './context/ContextUpdateService';
import { EventBus } from '@/core/eventBus';
import { createChatMessage } from './utils/chat-message-builder';

/**
 * Manage AI conversations, storage, and model interactions.
 */
export class AIServiceManager {
	private storage: ChatStorageService;
	private multiChat: MultiProviderChatService;
	private promptService: PromptService;
	private projectService?: ProjectService;
	private conversationService?: ConversationService;
	private resourceSummaryService: ResourceSummaryService;
	private profileService?: UserProfileService;
	private contextUpdateService?: ContextUpdateService;

	constructor(
		private readonly app: App,
		private settings: AIServiceSettings
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
			this.settings.resourcesSummaryFolder
		);

		// === Service construction ===
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		this.multiChat = new MultiProviderChatService({
			providerConfigs,
			defaultOutputControl: this.settings.defaultOutputControl,
		});
		// Create prompt service
		this.promptService = new PromptService(this.app, this.settings, this.multiChat);

		// Initialize context service if profile is enabled
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				this.multiChat,
				this.settings.profileFilePath || `${this.settings.rootFolder}/User-Profile.md`,
			);
		}

		// Note: ProjectService and ConversationService are initialized in init() method
		// to avoid circular dependency with DocumentLoaderManager
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
			this.multiChat
		);
		this.conversationService = new ConversationService(
			this.app,
			this.storage,
			this.multiChat,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.profileService,
			this.settings,
		);

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
	 * Get MultiProviderChatService instance for embedding generation.
	 */
	getMultiChat(): MultiProviderChatService {
		return this.multiChat;
	}

	/**
	 * Update settings and rebuild storage handlers.
	 */
	updateSettings(next: AIServiceSettings): void {
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...next };
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
		});
		this.promptService.setPromptFolder(this.settings.promptFolder);
		this.promptService.setSettings(this.settings);
		this.refreshDefaultServices();
	}

	refreshDefaultServices(): void {
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		// Refresh provider services with new configurations
		// This clears existing services and recreates them with updated configs
		this.multiChat.refresh(providerConfigs, this.settings.defaultOutputControl ?? DEFAULT_AI_SERVICE_SETTINGS.defaultOutputControl!);
		this.promptService.setChatService(this.multiChat);

		// Reinitialize context service if profile is enabled
		if (this.settings.profileEnabled) {
			this.profileService = new UserProfileService(
				this.app,
				this.promptService,
				this.multiChat,
				this.settings.profileFilePath || `${this.settings.rootFolder}/User-Profile.md`,
			);
		}

		this.projectService = new ProjectService(
			this.app,
			this.storage, this.settings.rootFolder, this.promptService, this.multiChat
		);
		this.resourceSummaryService = new ResourceSummaryService(
			this.app,
			this.settings.rootFolder,
			this.settings.resourcesSummaryFolder
		);
		this.conversationService = new ConversationService(
			this.app,
			this.storage,
			this.multiChat,
			this.promptService,
			this.settings.defaultModel,
			this.resourceSummaryService,
			this,
			this.profileService,
			this.settings,
		);

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

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: { title: string; project?: ChatProjectMeta | null; initialMessages?: ChatMessage[]; modelId?: string; provider?: string }): Promise<ChatConversation> {
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
		sources: Array<{ path: string; title: string; highlight?: { text?: string } | null }>;
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
		const sourcesList = params.sources.slice(0, 10).map((s, i) => {
			const link = `[[${s.path}|${s.title}]]`;
			const snippet = s.highlight?.text ? `\n  - ${s.highlight.text.substring(0, 200)}...` : '';
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
	 * Rename a project by renaming its folder.
	 */
	async renameProject(projectId: string, newName: string): Promise<ChatProject> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.renameProject(projectId, newName);
	}

	async renderPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null
	): Promise<string> {
		return this.promptService.render(promptId, variables);
	}

	/**
	 * Chat with a prompt template.
	 * Renders the prompt and calls the LLM with the rendered text.
	 */
	async chatWithPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		provider?: string,
		model?: string,
		extraParts?: MessagePart[]
	): Promise<string> {
		return this.promptService.chatWithPrompt(promptId, variables, provider, model, extraParts);
	}

	/**
	 * Stream chat with prompt using streaming callbacks.
	 * @param promptId - The prompt identifier
	 * @param variables - Variables for the prompt template
	 * @param callbacks - Streaming callbacks for handling progress
	 * @param provider - LLM provider name
	 * @param model - Model identifier
	 * @returns The complete LLM response content
	 */
	async *chatWithPromptStream<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		provider?: string,
		model?: string
	): AsyncGenerator<LLMStreamEvent> {
		return this.promptService.chatWithPromptStream(promptId, variables, provider, model);
	}

	/**
	 * Search for external prompts using AI
	 * This is a placeholder implementation that should be replaced with actual AI-powered prompt search
	 */
	async searchPrompts(query: string): Promise<Array<{ id: string; label: string; description: string; value: string; icon: string; showArrow: boolean }>> {
		// TODO: Implement actual AI-powered prompt search
		// This could involve:
		// 1. Searching through prompt templates
		// 2. Using embeddings to find similar prompts
		// 3. Querying external prompt databases
		// 4. Using LLM to generate relevant prompts based on query

		// For now, return empty array as placeholder
		console.debug('[AIServiceManager] searchPrompts called with query:', query);
		return [];
	}

	/**
	 * Get all available models from all configured providers
	 * Only returns models from enabled providers and enabled models
	 */
	async getAllAvailableModels(): Promise<ModelInfoForSwitch[]> {
		const allModels = await this.multiChat.getAllAvailableModels();
		const providerConfigs = this.settings.llmProviderConfigs ?? {};

		// Filter models by provider and model enabled status
		return allModels
			.filter(model => {
				const providerConfig = providerConfigs[model.provider];

				// Skip if provider is not enabled
				if (providerConfig?.enabled !== true) {
					return false;
				}

				// Check model enabled status
				// If modelConfigs doesn't exist or model is not in modelConfigs, default to enabled
				const modelConfigs = providerConfig.modelConfigs;
				if (!modelConfigs) {
					return true; // Default enabled if no modelConfigs
				}

				const modelConfig = modelConfigs[model.id];
				// If model is explicitly configured, check its enabled status
				// If not configured, default to enabled
				return modelConfig?.enabled === true;
			})
			.map(m => ({
					id: m.id,
					displayName: m.displayName,
					provider: m.provider,
					icon: m.icon,
				capabilities: m.capabilities, // Pass through capabilities from provider
			}));
	}

	async getModelInfo(modelId: string, provider: string): Promise<ModelInfoForSwitch | undefined> {
		const allModels = await this.getAllAvailableModels();
		return allModels.find(m => m.id === modelId && m.provider === provider);
	}

}

