import { App } from 'obsidian';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { LLMApplicationService } from './service-application';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { PromptApplicationService } from './service-application';
import { ChatStorageService } from './storage';
import { ChatContextWindow, ChatMessage, ChatProjectMeta, ParsedConversationFile, ParsedProjectFile, StarredMessageRecord } from './types';
import { PromptService } from './service-prompt';
import { MessageContentComposer } from './messages/utils-message-content';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AIStreamEvent } from '@/core/providers/types-events';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { ResourceSummaryService } from './resources/ResourceSummaryService';
import { ChatMigrationService } from './migration';
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
	private migrationService: ChatMigrationService;

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
			starredCsvPath: `${this.settings.rootFolder}/Starred.csv`,
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

		// === Migration service ===
		this.migrationService = new ChatMigrationService(
			this.app,
			this.storage,
			this.resourceSummaryService
		);

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
		
		// Run migration
		try {
			const migrationResult = await this.migrationService.migrateAll();
			if (migrationResult.conversationsMigrated > 0 || migrationResult.projectsMigrated > 0) {
				console.log(`[AIServiceManager] Migration completed: ${migrationResult.conversationsMigrated} conversations, ${migrationResult.projectsMigrated} projects, ${migrationResult.resourcesCreated} resources created`);
				if (migrationResult.errors.length > 0) {
					console.warn(`[AIServiceManager] Migration had ${migrationResult.errors.length} errors`);
				}
			}
		} catch (error) {
			console.error('[AIServiceManager] Migration failed:', error);
		}
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
			starredCsvPath: `${this.settings.rootFolder}/Starred.csv`,
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
	async createProject(input: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'>): Promise<ParsedProjectFile> {
		return this.projectService.createProject(input);
	}

	/**
	 * List projects managed by the service.
	 */
	async listProjects(): Promise<ParsedProjectFile[]> {
		return this.projectService.listProjects();
	}

	/**
	 * List conversations, optionally filtered by project.
	 */
	async listConversations(project?: ChatProjectMeta): Promise<ParsedConversationFile[]> {
		return this.conversationService.listConversations(project);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: { title: string; project?: ChatProjectMeta | null; initialMessages?: ChatMessage[] }): Promise<ParsedConversationFile> {
		return this.conversationService.createConversation(params);
	}

	/**
	 * Send a message and wait for the full model response (blocking).
	 */
	async blockChat(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
		attachments?: string[];
		autoSave?: boolean;
	}): Promise<{ conversation: ParsedConversationFile; message: ChatMessage }> {
		return this.conversationService.blockChat(params);
	}

	/**
	 * Send a message and wait for the full model response (blocking) with auto-save.
	 */
	async blockChatWithSave(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
	}): Promise<{ conversation: ParsedConversationFile; message: ChatMessage }> {
		return this.conversationService.blockChat({ ...params, autoSave: true });
	}

	/**
	 * Send a message and wait for the full model response (blocking) without auto-save.
	 */
	async blockChatWithoutSave(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
	}): Promise<{ conversation: ParsedConversationFile; message: ChatMessage }> {
		return this.conversationService.blockChat({ ...params, autoSave: false });
	}

	/**
	 * Send a message and stream incremental model output.
	 */
	streamChat(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
		autoSave?: boolean;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat(params);
	}

	/**
	 * Send a message and stream incremental model output with auto-save.
	 */
	streamChatWithSave(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat({ ...params, autoSave: true });
	}

	/**
	 * Send a message and stream incremental model output without auto-save.
	 */
	streamChatWithoutSave(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
	}): AsyncGenerator<AIStreamEvent> {
		return this.conversationService.streamChat({ ...params, autoSave: false });
	}

	/**
	 * Update full message list of a conversation.
	 */
	async updateConversationMessages(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		messages: ChatMessage[];
		context?: ChatContextWindow;
	}): Promise<ParsedConversationFile> {
		return this.conversationService.updateConversationMessages(params);
	}

	/**
	 * Update conversation's active model.
	 */
	async updateConversationModel(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		modelId: string;
		provider?: string;
	}): Promise<ParsedConversationFile> {
		return this.conversationService.updateConversationModel(params);
	}

	/**
	 * Update conversation title and mark it as manually edited.
	 */
	async updateConversationTitle(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		title: string;
	}): Promise<ParsedConversationFile> {
		return this.conversationService.updateConversationTitle(params);
	}

	/**
	 * Toggle star status on a message.
	 */
	async toggleStar(params: {
		messageId: string;
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		starred: boolean;
	}): Promise<ParsedConversationFile> {
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
	async summarizeProject(project: ParsedProjectFile, modelId: string): Promise<string> {
		return this.projectService.summarizeProject(project, modelId);
	}

	/**
	 * Rename a project by renaming its folder.
	 */
	async renameProject(project: ParsedProjectFile, newName: string): Promise<ParsedProjectFile> {
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

