import { App } from 'obsidian';
import { LLMProviderService, LLMProvider } from './providers/types';
import { LLMApplicationService } from './service-application';
import { ModelConfig } from './types-models';
import { MultiProviderChatService } from './providers/MultiProviderChatService';
import { PromptApplicationService } from './service-application';
import { AIModelId, OpenAIModelId, coerceModelId } from './types-models';
import { ChatStorageService } from './storage';
import { ChatContextWindow, ChatMessage, ChatProjectMeta, ParsedConversationFile, ParsedProjectFile, RootMode, StarredMessageRecord } from './types';
import { PromptService } from './service-prompt';
import { MessageContentComposer } from './utils-message-content';
import { ProjectService } from './service-project';
import { ConversationService } from './service-conversation';
import { AIStreamEvent } from './providers/types-events';

export interface AIServiceSettings {
	rootFolder: string;
	rootMode: RootMode;
	defaultModelId: AIModelId;
	models: ModelConfig[];
	llmProviderConfigs: Record<string, { apiKey: string; baseUrl?: string }>;
	promptFolder: string;
	uploadFolder: string;
}

export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	rootMode: 'conversation-first',
	defaultModelId: OpenAIModelId.GPT_4_1_MINI,
	models: [],
	llmProviderConfigs: {},
	promptFolder: 'A-control/PeakAssistantPrompts',
	uploadFolder: 'ChatFolder/Attachments',
};

/**
 * Manage AI conversations, storage, and model interactions.
 */
export class AIServiceManager {
	private storage: ChatStorageService;
	private contentComposer: MessageContentComposer;
	private chat: LLMProviderService;
	private application: LLMApplicationService;
	private promptService: PromptService;
	private projectService: ProjectService;
	private conversationService: ConversationService;

	constructor(
		private readonly app: App,
		private settings: AIServiceSettings
	) {
		// === Settings initialization ===
		// Merge given settings with defaults
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...settings };

		// Coerce model IDs for safety/consistency
		this.settings.defaultModelId = coerceModelId(this.settings.defaultModelId as unknown as string);
		this.settings.models = (this.settings.models ?? []).map((model) => ({
			...model,
			id: coerceModelId(model.id as unknown as string),
		}));

		// === Core services initialization ===
		// Storage service for chat data
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
			starredCsvPath: `${this.settings.rootFolder}/Starred.csv`,
		});

		// Message content composer utility
		this.contentComposer = new MessageContentComposer(this.app);

		// === Service construction ===
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		this.chat = new MultiProviderChatService({
			models: this.settings.models ?? [],
			providerConfigs,
		});
		this.application = new PromptApplicationService(this.chat);
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
			this.chat,
			this.application,
			this.promptService,
			this.contentComposer,
			this.settings.defaultModelId
		);
	}

	/**
	 * Initialize storage resources.
	 */
	async init(): Promise<void> {
		await this.storage.init();
		await this.promptService.init();
	}

	/**
	 * Return current AI service settings snapshot.
	 */
	getSettings(): AIServiceSettings {
		return this.settings;
	}

	/**
	 * Update settings and rebuild storage handlers.
	 */
	updateSettings(next: AIServiceSettings): void {
		this.settings = { ...DEFAULT_AI_SERVICE_SETTINGS, ...next };
		this.settings.defaultModelId = coerceModelId(this.settings.defaultModelId as unknown as string);
		this.settings.models = (this.settings.models ?? []).map((model) => ({
			...model,
			id: coerceModelId(model.id as unknown as string),
		}));
		this.storage = new ChatStorageService(this.app, {
			rootFolder: this.settings.rootFolder,
			starredCsvPath: `${this.settings.rootFolder}/Starred.csv`,
		});
		this.promptService.setPromptFolder(this.settings.promptFolder);
		this.refreshDefaultServices();
	}

	refreshDefaultServices(): void {
		const providerConfigs = this.settings.llmProviderConfigs ?? {};
		this.chat = new MultiProviderChatService({
			models: this.settings.models ?? [],
			providerConfigs,
		});
		this.application = new PromptApplicationService(this.chat);
		this.projectService = new ProjectService(this.storage, this.settings.rootFolder, this.promptService, this.application);
		this.conversationService = new ConversationService(
			this.storage,
			this.chat,
			this.application,
			this.promptService,
			this.contentComposer,
			this.settings.defaultModelId
		);
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
		modelId: AIModelId;
		provider?: LLMProvider;
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
	async summarizeProject(project: ParsedProjectFile, modelId: AIModelId): Promise<string> {
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
	 */
	async getAllAvailableModels(): Promise<Array<{ id: AIModelId; displayName: string; provider: string }>> {
		const models = await (this.chat as MultiProviderChatService).getAllAvailableModels();
		return models.map(m => ({
			id: m.id,
			displayName: m.displayName,
			provider: m.provider,
		}));
	}

}

