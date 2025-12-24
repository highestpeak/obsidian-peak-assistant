import { App } from 'obsidian';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { LLMApplicationService } from './service-application';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { PromptApplicationService } from './service-application';
import { ChatStorageService } from '../../core/storage/vault/ChatStore';
import { ChatContextWindow, ChatMessage, ChatProjectMeta, ChatConversation, ChatProject, StarredMessageRecord } from './types';
import { PromptService } from './service-prompt';
import { MessageContentComposer } from './messages/utils-message-content';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AIStreamEvent } from '@/core/providers/types-events';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { ResourceSummaryService } from './resources/ResourceSummaryService';
import { IndexService } from '@/service/search/index/indexService';

/**
 * Manage AI conversations, storage, and model interactions.
 */
export class AIServiceManager {
	private storage: ChatStorageService;
	private contentComposer: MessageContentComposer;
	private multiChat: MultiProviderChatService;
	private application: LLMApplicationService;
	private promptService: PromptService;
	private projectService: ProjectService;
	private conversationService: ConversationService;
	private resourceSummaryService: ResourceSummaryService;

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

		// Message content composer utility
		this.contentComposer = new MessageContentComposer(this.app);

		// === Resource summary service ===
		this.resourceSummaryService = new ResourceSummaryService(this.app, this.settings.rootFolder);

		// === Service construction ===
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		this.multiChat = new MultiProviderChatService({
			providerConfigs,
		});
		this.application = new PromptApplicationService(this.multiChat);
		this.promptService = new PromptService(this.app, {
			promptFolder: this.settings.promptFolder,
		});

		// === Project- and conversation-level services ===
		this.projectService = new ProjectService(
			this.storage,
			this.settings.rootFolder,
			this.promptService,
			this.application
		);
		this.conversationService = new ConversationService(
			this.storage,
			this.multiChat,
			this.application,
			this.promptService,
			this.contentComposer,
			this.settings.defaultModelId,
			this.resourceSummaryService
		);
	}

	/**
	 * Initialize storage resources and run migration if needed.
	 */
	async init(): Promise<void> {
		await this.storage.init();
		await this.promptService.init();
		await this.resourceSummaryService.init();
		
		// Migration is deprecated - new format uses sqlite-only metadata
		// Old data should be manually processed if needed
		// try {
		// 	const migrationResult = await this.migrationService.migrateAll();
		// 	if (migrationResult.conversationsMigrated > 0 || migrationResult.projectsMigrated > 0) {
		// 		console.log(`[AIServiceManager] Migration completed: ${migrationResult.conversationsMigrated} conversations, ${migrationResult.projectsMigrated} projects, ${migrationResult.resourcesCreated} resources created`);
		// 		if (migrationResult.errors.length > 0) {
		// 			console.warn(`[AIServiceManager] Migration had ${migrationResult.errors.length} errors`);
		// 		}
		// 	}
		// } catch (error) {
		// 	console.error('[AIServiceManager] Migration failed:', error);
		// }
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
		this.refreshDefaultServices();
	}

	refreshDefaultServices(): void {
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		this.multiChat = new MultiProviderChatService({
			providerConfigs,
		});
		this.application = new PromptApplicationService(this.multiChat);
		this.projectService = new ProjectService(this.storage, this.settings.rootFolder, this.promptService, this.application);
		this.resourceSummaryService = new ResourceSummaryService(this.app, this.settings.rootFolder);
		this.conversationService = new ConversationService(
			this.storage,
			this.multiChat,
			this.application,
			this.promptService,
			this.contentComposer,
			this.settings.defaultModelId,
			this.resourceSummaryService
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
		return this.projectService.createProject(input);
	}

	/**
	 * List projects managed by the service.
	 */
	async listProjects(): Promise<ChatProject[]> {
		return this.projectService.listProjects();
	}

	/**
	 * List conversations, optionally filtered by project.
	 */
	async listConversations(project?: ChatProjectMeta): Promise<ChatConversation[]> {
		return this.conversationService.listConversations(project);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: { title: string; project?: ChatProjectMeta | null; initialMessages?: ChatMessage[] }): Promise<ChatConversation> {
		return this.conversationService.createConversation(params);
	}

	/**
	 * Send a message and wait for the full model response (blocking).
	 */
	async blockChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
		autoSave?: boolean;
	}): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
		return this.conversationService.blockChat(params);
	}

	/**
	 * Send a message and wait for the full model response (blocking) with auto-save.
	 */
	async blockChatWithSave(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
	}): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
		return this.conversationService.blockChat({ ...params, autoSave: true });
	}

	/**
	 * Send a message and wait for the full model response (blocking) without auto-save.
	 */
	async blockChatWithoutSave(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
	}): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
		return this.conversationService.blockChat({ ...params, autoSave: false });
	}

	/**
	 * Send a message and stream incremental model output.
	 */
	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		autoSave?: boolean;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat(params);
	}

	/**
	 * Send a message and stream incremental model output with auto-save.
	 */
	streamChatWithSave(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat({ ...params, autoSave: true });
	}

	/**
	 * Send a message and stream incremental model output without auto-save.
	 */
	streamChatWithoutSave(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat({ ...params, autoSave: false });
	}

	/**
	 * Update full message list of a conversation.
	 */
	async updateConversationMessages(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		messages: ChatMessage[];
		context?: ChatContextWindow;
	}): Promise<ChatConversation> {
		return this.conversationService.updateConversationMessages(params);
	}

	/**
	 * Update conversation's active model.
	 */
	async updateConversationModel(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		modelId: string;
		provider?: string;
	}): Promise<ChatConversation> {
		return this.conversationService.updateConversationModel(params);
	}

	/**
	 * Update conversation title and mark it as manually edited.
	 */
	async updateConversationTitle(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		title: string;
	}): Promise<ChatConversation> {
		return this.conversationService.updateConversationTitle(params);
	}

	/**
	 * Toggle star status on a message.
	 */
	async toggleStar(params: {
		messageId: string;
		conversation: ChatConversation;
		project?: ChatProject | null;
		starred: boolean;
	}): Promise<ChatConversation> {
		return this.conversationService.toggleStar(params);
	}

	/**
	 * Load starred message records.
	 */
	async loadStarred(): Promise<StarredMessageRecord[]> {
		return this.conversationService.loadStarred();
	}

	/**
	 * Summarize a conversation chunk with the configured model.
	 */
	async summarizeConversation(modelId: string, text: string): Promise<string> {
		return this.conversationService.summarizeConversation(modelId, text);
	}

	/**
	 * Summarize a project by aggregating summaries from all conversations in the project.
	 */
	async summarizeProject(project: ChatProject, modelId: string): Promise<string> {
		return this.projectService.summarizeProject(project, modelId);
	}

	/**
	 * Rename a project by renaming its folder.
	 */
	async renameProject(project: ChatProject, newName: string): Promise<ChatProject> {
		return this.projectService.renameProject(project, newName);
	}

	/**
	 * Get the application service for generating titles and names
	 */
	getApplicationService(): LLMApplicationService {
		return this.application;
	}

	/**
	 * Get all available models from all configured providers
	 * Only returns models from enabled providers and enabled models
	 */
	async getAllAvailableModels(): Promise<ModelInfoForSwitch[]> {
		const allModels = await this.multiChat.getAllAvailableModels();
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		console.log('getAllAvailableModels', allModels, providerConfigs);

		// Filter models by provider and model enabled status
		const filteredModels = allModels
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
				return modelConfig?.enabled !== false;
			})
			.map(m => ({
				id: m.id,
				displayName: m.displayName,
				provider: m.provider,
				icon: m.icon,
			}));
		console.log('getAllAvailableModels done', filteredModels);
		return filteredModels;
	}

}

