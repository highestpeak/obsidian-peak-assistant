import { App } from 'obsidian';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { LLMProviderService, LLMUsage, LLMOutputControlSettings } from '@/core/providers/types';
import { AIServiceSettings } from '@/app/settings/types';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY } from '@/core/constant';
import { EventBus, MessageSentEvent, ConversationCreatedEvent, ConversationUpdatedEvent } from '@/core/eventBus';
import { LLMRequestMessage } from '@/core/providers/types';
import {
	ChatContextWindow,
	ChatConversation,
	ChatConversationMeta,
	ChatMessage,
	ChatProject,
	ChatProjectMeta,
	StarredMessageRecord,
	ChatResourceRef,
} from './types';
import { PromptService } from '@/service/prompt/PromptService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { PromptId } from '@/service/prompt/PromptId';
import { AIStreamEvent } from '@/core/providers/types-events';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { ContextBuilder } from './context/ContextBuilder';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { ResourceLoaderManager } from '@/core/document/resource/helper/ResourceLoaderManager';
import type { AIServiceManager } from './service-manager';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { generateContentPreview, generateAttachmentSummary } from '@/core/utils/message-preview-utils';

/**
 * Service for managing chat conversations.
 */
export class ConversationService {
	private readonly contextBuilder: ContextBuilder;
	private readonly resourceLoaderManager: ResourceLoaderManager;

	constructor(
		private readonly app: App,
		private readonly storage: ChatStorageService,
		private readonly chat: LLMProviderService,
		private readonly promptService: PromptService,
		private readonly defaultModel: { provider: string; modelId: string },
		private readonly resourceSummaryService: ResourceSummaryService,
		private readonly aiServiceManager: AIServiceManager,
		private readonly profileService?: UserProfileService,
		private readonly settings?: AIServiceSettings,
	) {
		this.resourceLoaderManager = new ResourceLoaderManager(this.app, this.aiServiceManager, DocumentLoaderManager.getInstance());
		// Initialize context builder
		this.contextBuilder = new ContextBuilder(
			this.promptService,
			this.resourceSummaryService,
			this.profileService,
		);
	}

	/**
	 * List conversations, optionally filtered by project.
	 */
	async listConversations(projectId: string | null): Promise<ChatConversation[]> {
		return this.storage.listConversations(projectId);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: {
		title: string;
		project?: ChatProjectMeta | null;
		initialMessages?: ChatMessage[];
		modelId?: string;
		provider?: string;
	}): Promise<ChatConversation> {
		const timestamp = Date.now();
		const meta: ChatConversationMeta = {
			id: generateUuidWithoutHyphens(),
			title: params.title,
			projectId: params.project?.id,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			activeModel: params.modelId || this.defaultModel.modelId,
			activeProvider: params.provider || this.defaultModel.provider,
			tokenUsageTotal: 0,
		};

		const messages = params.initialMessages ?? [];
		const conversation = await this.storage.saveConversation(
			params.project ?? null,
			meta,
			undefined, // context
			messages // messages
		);

		// Trigger conversation created event
		const eventBus = EventBus.getInstance(this.app);
		eventBus.dispatch(new ConversationCreatedEvent({
			conversationId: conversation.meta.id,
			projectId: conversation.meta.projectId ?? null,
		}));

		return conversation;
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
		const { conversation, project } = params;
		const prepared = await this.prepareChatRequest(params);
		const assistant = await this.chat.blockChat({
			provider: prepared.provider,
			model: prepared.modelId,
			messages: prepared.llmMessages,
			outputControl: prepared.outputControl,
		});

		const assistantMessage = createChatMessage('assistant', assistant.content, assistant.model, prepared.provider, prepared.timezone);
		assistantMessage.tokenUsage = assistant.usage;

		return {
			message: assistantMessage,
			usage: assistant.usage,
		};
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
		const self = this;
		return (async function* (): AsyncGenerator<AIStreamEvent> {
			const prepared = await self.prepareChatRequest(params);
			const stream = self.chat.streamChat({
				provider: prepared.provider,
				model: prepared.modelId,
				messages: prepared.llmMessages,
				outputControl: prepared.outputControl,
			});
			yield* self.consumeLLMStream(stream, {
				initialModel: prepared.modelId,
				initialProvider: prepared.provider,
				conversation: params.conversation,
				project: params.project ?? null,
				messagesWithUser: prepared.messagesWithUser,
				timezone: prepared.timezone,
			});
		})();
	}

	/**
	 * Reduce streaming deltas and return the final assistant reply.
	 * Does not persist. Call saveExchange to persist.
	 */
	private async *consumeLLMStream(
		stream: AsyncGenerator<AIStreamEvent>,
		params: {
			initialModel: string;
			initialProvider: string;
			conversation: ChatConversation;
			project: ChatProject | null;
			messagesWithUser: ChatMessage[];
			timezone: string;
		}
	): AsyncGenerator<AIStreamEvent> {
		let assistantContent = '';
		let currentModel = params.initialModel;
		let currentProvider = params.initialProvider;
		let usage: LLMUsage | undefined;
		try {
			for await (const chunk of stream) {
				if (chunk.type === 'delta') {
					assistantContent += chunk.text;
					if (chunk.model) {
						currentModel = chunk.model;
					}
					yield { type: 'delta', text: chunk.text };
				} else if (chunk.type === 'complete') {
					currentModel = chunk.model || currentModel;
					if (chunk.usage) {
						usage = chunk.usage;
					}
				}
			}

			const assistantMessage = createChatMessage('assistant', assistantContent, currentModel, currentProvider, params.timezone);
			assistantMessage.tokenUsage = usage;

			yield {
				type: 'complete',
				message: assistantMessage,
				model: currentModel,
				usage,
			};
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			yield { type: 'error', error: normalized };
		}
	}

	/**
	 * Upload files and create resource references.
	 * Uploads files to vault and creates resourceRef for each file.
	 * 
	 * @param files Files to upload
	 * @returns Array of resource references
	 */
	async uploadFilesAndCreateResources(files: File[]): Promise<ChatResourceRef[]> {
		if (!files || files.length === 0) {
			return [];
		}

		// Get upload folder from settings
		const uploadFolder = this.settings?.uploadFolder || 'uploads';
		
		// Upload files to vault
		const { uploadFilesToVault } = await import('@/core/utils/vault-utils');
		const uploadedPaths = await uploadFilesToVault(this.app, files, uploadFolder);

		// Create resource references for uploaded files
		const resources: ChatResourceRef[] = [];
		for (const filePath of uploadedPaths) {
			const resourceRef = this.resourceSummaryService!.createResourceRef(filePath);
			const summaryPath = this.resourceSummaryService!.getResourceSummaryPath(resourceRef.id);
			resourceRef.summaryNotePath = summaryPath;

			// Ensure resource summary exists, generate if missing
			await this.ensureResourceSummary(filePath, resourceRef);

			resources.push(resourceRef);
		}

		return resources;
	}

	/**
	 * Prepare chat request: create user message, process attachments, build LLM messages
	 */
	private async prepareChatRequest(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): Promise<{
		modelId: string;
		provider: string;
		timezone: string;
		userMessage: ChatMessage;
		messagesWithUser: ChatMessage[];
		llmMessages: LLMRequestMessage[];
		outputControl?: LLMOutputControlSettings;
	}> {
		const { conversation, project, userContent, attachments } = params;
		const modelId = conversation.meta.activeModel || this.defaultModel.modelId;
		const provider = conversation.meta.activeProvider || this.defaultModel.provider;
		const timezone = this.detectTimezone();
		const userMessage = createChatMessage('user', userContent, modelId, provider, timezone);

		// Convert legacy attachments to resources if provided
		if (attachments && attachments.length > 0) {
			const resources = [];
			for (const attachment of attachments) {
				const resourceRef = this.resourceSummaryService!.createResourceRef(attachment);
				const summaryPath = this.resourceSummaryService!.getResourceSummaryPath(resourceRef.id);
				resourceRef.summaryNotePath = summaryPath;

				// Ensure resource summary exists, generate if missing
				await this.ensureResourceSummary(attachment, resourceRef);

				resources.push(resourceRef);
			}
			userMessage.resources = resources;
		}

		const messagesWithUser = [...conversation.messages, userMessage];
		const llmMessages = await this.buildLLMRequestMessages(messagesWithUser, conversation, project);

		// Get output control settings: priority: conversation override > global default
		let outputControl: LLMOutputControlSettings | undefined;
		if (conversation.meta.outputControlOverride) {
			outputControl = conversation.meta.outputControlOverride;
		} else if (this.settings?.defaultOutputControl) {
			outputControl = this.settings.defaultOutputControl;
		}

		return {
			modelId,
			provider,
			timezone,
			userMessage,
			messagesWithUser,
			llmMessages,
			outputControl,
		};
	}

	/**
	 * Update conversation context only (summary), keeping messages unchanged.
	 * Uses optimistic locking by checking updatedAtTimestamp.
	 */
	async updateConversationContext(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		context: ChatContextWindow;
		messageIndex: number; // Message index when context was updated
	}): Promise<ChatConversation> {
		const { conversation, project, context, messageIndex } = params;
		// Update context but keep messages unchanged
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			updatedAtTimestamp: Date.now(),
			contextLastUpdatedTimestamp: Date.now(),
			contextLastMessageIndex: messageIndex,
		};
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			context
		);
	}

	/**
	 * Update conversation's active model.
	 */
	async updateConversationModel(params: {
		conversationId: string;
		modelId: string;
		provider: string;
	}): Promise<void> {
		const { conversationId, modelId, provider } = params;

		// Save updated meta
		await this.storage.upsertConversationMeta(
			conversationId,
			{
				activeModel: modelId,
				activeProvider: provider,
				updatedAtTimestamp: Date.now(),
			}
		);
	}

	/**
	 * Update conversation's output control override settings.
	 */
	async updateConversationOutputControl(params: {
		conversationId: string;
		outputControlOverride?: LLMOutputControlSettings;
	}): Promise<void> {
		const { conversationId, outputControlOverride } = params;

		// Save updated meta
		await this.storage.upsertConversationMeta(
			conversationId,
			{
				outputControlOverride: outputControlOverride && Object.keys(outputControlOverride).length > 0 ? outputControlOverride : undefined,
				updatedAtTimestamp: Date.now(),
			}
		);
	}

	/**
	 * Update conversation title by renaming the file.
	 * @param params.titleManuallyEdited - If true, marks the title as manually edited (default: true)
	 * @param params.titleAutoUpdated - If true, marks the title as auto-updated (default: false)
	 */
	async updateConversationTitle(params: {
		conversationId: string;
		title: string;
		titleManuallyEdited?: boolean;
		titleAutoUpdated?: boolean;
	}): Promise<void> {
		const { conversationId, title, titleManuallyEdited = true, titleAutoUpdated = false } = params;

		// Rename file and get new relative path
		const newFileRelPath = await this.storage.renameConversationFile(conversationId, title);

		// Save updated meta (file path is updated in sqlite)
		await this.storage.upsertConversationMeta(conversationId, {
			id: conversationId,
			title,
			titleManuallyEdited,
			titleAutoUpdated,
			fileRelPath: newFileRelPath,
		});

		// Trigger conversation updated event
		const updatedConversation = await this.storage.readConversation(conversationId, false);
		if (updatedConversation) {
			const eventBus = EventBus.getInstance(this.app);
			eventBus.dispatch(new ConversationUpdatedEvent({
				conversation: updatedConversation,
			}));
		}
	}

	/**
	 * Toggle star status on a message.
	 * When starring, generates and saves content preview and attachment summary.
	 */
	async toggleStar(params: {
		messageId: string;
		conversationId: string;
		starred: boolean;
	}): Promise<void> {
		const { messageId, starred, conversationId } = params;

		let contentPreview: string | null = null;
		let attachmentSummary: string | null = null;

		// When starring, load message content to generate preview
		if (starred) {
			const conversation = await this.storage.readConversation(conversationId, true);
			if (conversation) {
				const message = conversation.messages.find((m) => m.id === messageId);
				if (message) {
					// Generate preview and summary
					contentPreview = generateContentPreview(message.content);
					attachmentSummary = generateAttachmentSummary(message.resources);
				}
			}
		}

		// Update starred status with preview data
		await this.storage.updateMessageStarred(messageId, starred, contentPreview, attachmentSummary);
	}

	/**
	 * Load starred message records.
	 */
	async loadStarred(): Promise<StarredMessageRecord[]> {
		return this.storage.listStarred();
	}

	/**
	 * Compose the full messages array sent to the LLM.
	 */
	private async buildLLMRequestMessages(
		messages: ChatMessage[],
		conversation: ChatConversation,
		project?: ChatProject | null
	): Promise<LLMRequestMessage[]> {
		// Use ContextBuilder to build messages with full context
		return this.contextBuilder.buildContextMessages({
			conversation,
			project,
			messages,
		});
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
		const { conversationId, message, model, provider, usage } = params;

		// Save message to storage (low-level operation: updates DB and file)
		await this.storage.saveNewMessage(conversationId, message);

		// Update conversation meta only (model, provider, token usage, updated timestamp)
		// This is a lightweight operation that doesn't rebuild context
		const updatedMeta = await this.storage.upsertConversationMeta(conversationId, {
			activeModel: model,
			activeProvider: provider,
			tokenUsageTotal: usage?.totalTokens ?? 0,
		});
		if (!updatedMeta) {
			throw new Error(`Failed to update conversation meta: ${conversationId}`);
		}

		// Trigger message sent event
		const eventBus = EventBus.getInstance(this.app);
		eventBus.dispatch(new MessageSentEvent({
			conversationId: conversationId,
			projectId: null,
		}));
	}

	/**
	 * Generate a title for conversation based on messages and context.
	 * Uses the ApplicationGenerateTitle prompt to generate a concise title.
	 */
	async generateConversationTitle(messages: ChatMessage[], context: ChatContextWindow): Promise<string | null> {
		if (messages.length === 0) {
			return null;
		}

		try {
			// Use first few messages to generate title (to keep it focused on the initial topic)
			const messagesForTitle = messages.slice(0, Math.min(5, messages.length));
			const messagesForPrompt = messagesForTitle.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			// Use context summary if available to provide better context for title generation
			const contextInfo = context.shortSummary && context.shortSummary !== DEFAULT_SUMMARY
				? `Context: ${context.shortSummary}`
				: undefined;

			const title = await this.promptService.chatWithPrompt(
				PromptId.ApplicationGenerateTitle,
				{
					messages: messagesForPrompt,
					contextInfo,
				}
			);

			// Clean up title: remove quotes, trim, and limit length
			const cleanedTitle = title
				.replace(/^["']|["']$/g, '') // Remove surrounding quotes
				.trim()
				.substring(0, 50); // Limit to 50 characters

			return cleanedTitle || null;
		} catch (error) {
			console.warn('[ConversationService] Failed to generate title:', error);
			return null;
		}
	}


	/**
	 * Build a compact context window for summarization.
	 */
	async buildContextWindow(
		messages: ChatMessage[],
		project?: ChatProject | null,
	): Promise<ChatContextWindow> {
		if (messages.length === 0) {
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
				shortSummary: DEFAULT_SUMMARY,
			};
		}

		const recent = messages.slice(-10);
		const recentMessagesWindow = [
			{
				fromMessageId: recent[0].id,
				toMessageId: recent[recent.length - 1].id,
			},
		];

		// Generate real summary using LLM
		try {
			const messagesForSummary = recent.map((m) => ({
				role: m.role,
				content: m.content,
			}));

			// Build project context if available
			const projectContext = project
				? `Project: ${project.meta.name}${project.context?.shortSummary ? `\n${project.context.shortSummary}` : ''}`
				: undefined;

			// Generate short summary
			const shortSummary = await this.promptService.chatWithPrompt(
				PromptId.ConversationSummaryShort,
				{
					messages: messagesForSummary,
					projectContext,
				},
			) || DEFAULT_SUMMARY;

			// Generate full summary if conversation is substantial
			let fullSummary: string | undefined;
			if (messages.length > 5) {
				fullSummary = await this.promptService.chatWithPrompt(
					PromptId.ConversationSummaryFull,
					{
						messages: messagesForSummary,
						projectContext,
						shortSummary,
					},
				);
			}

			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow,
				shortSummary,
				fullSummary,
			};
		} catch (error) {
			console.warn('[ConversationService] Failed to generate summary:', error);
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow,
				shortSummary: DEFAULT_SUMMARY,
			};
		}
	}

	/**
	 * Ensure resource summary exists, generate if missing
	 */
	private async ensureResourceSummary(sourcePath: string, resourceRef: ChatResourceRef): Promise<void> {
		if (!this.resourceSummaryService) {
			return;
		}

		// Check if summary already exists
		const existing = await this.resourceSummaryService.readResourceSummary(resourceRef.id);
		if (existing?.meta.shortSummary || existing?.meta.fullSummary) {
			// Summary already exists
			return;
		}

		// Generate summary
		try {
			const summary = await this.resourceLoaderManager.getSummary(
				sourcePath,
				resourceRef.kind,
			) || { shortSummary: `Resource: ${sourcePath}` };

			// Save summary
			await this.resourceSummaryService.saveResourceSummary({
				resourceId: resourceRef.id,
				source: resourceRef.source,
				kind: resourceRef.kind,
				shortSummary: summary.shortSummary,
				fullSummary: summary.fullSummary,
			});
		} catch (error) {
			console.warn(`[ConversationService] Failed to generate resource summary for ${sourcePath}:`, error);
			// Create summary with error information
			const errorReason = error instanceof Error ? error.message : String(error);
			const errorDate = new Date().toISOString();
			const errorSummary = `GenSummaryFailed.[${errorReason}][${errorDate}]`;
			await this.resourceSummaryService.saveResourceSummary({
				resourceId: resourceRef.id,
				source: resourceRef.source,
				kind: resourceRef.kind,
				shortSummary: errorSummary,
			});
		}
	}

	/**
	 * Detect the local timezone or fall back to UTC.
	 */
	private detectTimezone(): string {
		try {
			const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
			return detected || 'UTC';
		} catch (error) {
			return 'UTC';
		}
	}

}
