import { App } from 'obsidian';
import { ModelInfoForSwitch, LLMUsage, LLMOutputControlSettings } from '@/core/providers/types';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { ChatConversation, ChatMessage, ChatProject, ChatProjectMeta, StarredMessageRecord, ChatResourceRef } from './types';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId, PromptVariables } from '@/service/prompt/PromptId';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AIStreamEvent } from '@/core/providers/types-events';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { IndexService } from '@/service/search/index/indexService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { ContextUpdateService } from './context/ContextUpdateService';
import { EventBus } from '@/core/eventBus';

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
		this.multiChat.refresh(providerConfigs);
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
	 */
	async listConversations(projectId: string | null | undefined): Promise<ChatConversation[]> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.listConversations(projectId ?? null);
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
	 * Send a message and wait for the full model response (blocking).
	 * Returns the assistant message and usage without persisting. Call addMessage to persist.
	 */
	async blockChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): Promise<{ message: ChatMessage; usage?: LLMUsage }> {
		if (!this.conversationService) {
			throw new Error('ConversationService not initialized. Call init() first.');
		}
		return this.conversationService.blockChat(params);
	}

	/**
	 * Send a message and stream incremental model output.
	 */
	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): AsyncGenerator<AIStreamEvent> {
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
	 * Rename a project by renaming its folder.
	 */
	async renameProject(projectId: string, newName: string): Promise<ChatProject> {
		if (!this.projectService) {
			throw new Error('ProjectService not initialized. Call init() first.');
		}
		return this.projectService.renameProject(projectId, newName);
	}

	/**
	 * Chat with a prompt template.
	 * Renders the prompt and calls the LLM with the rendered text.
	 */
	async chatWithPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T],
		provider?: string,
		model?: string
	): Promise<string> {
		return this.promptService.chatWithPrompt(promptId, variables, provider, model);
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
			}));
	}

}

