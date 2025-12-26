import { normalizePath, TFile, TFolder } from 'obsidian';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { LLMProviderService, LLMUsage } from '@/core/providers/types';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY } from '@/core/constant';
import { EventBus, MessageSentEvent, ConversationCreatedEvent } from '@/core/eventBus';
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
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { ResourceLoaderManager } from '@/core/document/resource/helper/ResourceLoaderManager';

/**
 * Create a basic chat message with timestamps.
 */
export function createMessage(role: ChatMessage['role'], content: string, model: string, provider: string, timezone: string): ChatMessage {
	const timestamp = Date.now();
	return {
		id: generateUuidWithoutHyphens(),
		role,
		content,
		model,
		provider,
		createdAtTimestamp: timestamp,
		createdAtZone: timezone,
		starred: false,
	};
}

/**
 * Service for managing chat conversations.
 */
export class ConversationService {
	private readonly contextBuilder: ContextBuilder;
	private readonly resourceLoaderManager: ResourceLoaderManager;

	constructor(
		private readonly storage: ChatStorageService,
		private readonly chat: LLMProviderService,
		private readonly promptService: PromptService,
		private readonly defaultModel: { provider: string; modelId: string },
		private readonly resourceSummaryService?: ResourceSummaryService,
		private readonly profileService?: UserProfileService,
	) {
		this.resourceLoaderManager = new ResourceLoaderManager(storage.getApp(), DocumentLoaderManager.getInstance());
		// Initialize context builder
		this.contextBuilder = new ContextBuilder(
			this.promptService,
			this.resourceSummaryService || new ResourceSummaryService(
				storage.getApp(),
				storage.getRootFolder(),
				DEFAULT_AI_SERVICE_SETTINGS.resourcesSummaryFolder
			),
			this.profileService,
		);
	}

	/**
	 * List conversations, optionally filtered by project.
	 */
	async listConversations(project?: ChatProjectMeta): Promise<ChatConversation[]> {
		return this.storage.listConversations(project);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: {
		title: string;
		project?: ChatProjectMeta | null;
		initialMessages?: ChatMessage[];
	}): Promise<ChatConversation> {
		const timestamp = Date.now();
		const meta: ChatConversationMeta = {
			id: generateUuidWithoutHyphens(),
			title: params.title,
			projectId: params.project?.id,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			activeModel: this.defaultModel.modelId,
			activeProvider: this.defaultModel.provider,
			tokenUsageTotal: 0,
		};

		const messages = params.initialMessages ?? [];
		const conversation = await this.storage.saveConversation(params.project ?? null, meta, messages);

		// Trigger conversation created event
		const eventBus = EventBus.getInstance(this.storage.getApp());
		eventBus.dispatch(new ConversationCreatedEvent({
			conversationId: conversation.meta.id,
			projectId: conversation.meta.projectId ?? null,
		}));

		return conversation;
	}

	/**
	 * Send a message and wait for the full model response (blocking).
	 */
	async blockChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
		const { conversation, project } = params;
		const prepared = await this.prepareChatRequest(params);
		const assistant = await this.chat.blockChat({
			provider: prepared.provider,
			model: prepared.modelId,
			messages: prepared.llmMessages,
		});

		const assistantMessage = createMessage('assistant', assistant.content, assistant.model, prepared.provider, prepared.timezone);
		assistantMessage.tokenUsage = assistant.usage;

		const savedConversation = await this.persistExchange({
			conversation,
			project: project ?? null,
			messages: [...prepared.messagesWithUser, assistantMessage],
			model: assistant.model,
			provider: prepared.provider,
			tokenDelta: assistant.usage?.totalTokens ?? 0,
		});
		return { conversation: savedConversation, message: assistantMessage };
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
	 * Reduce streaming deltas and persist the final assistant reply.
	 */
	private async *consumeLLMStream(
		stream: AsyncGenerator<AIStreamEvent>,
		context: {
			initialModel: string;
			initialProvider: string;
			conversation: ChatConversation;
			project: ChatProject | null;
			messagesWithUser: ChatMessage[];
			timezone: string;
		}
	): AsyncGenerator<AIStreamEvent> {
		let assistantContent = '';
		let currentModel = context.initialModel;
		let currentProvider = context.initialProvider;
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
					// Provider's complete event doesn't have conversation/message yet
					// We'll emit our own complete event after persistence
				}
			}

			const assistantMessage = createMessage('assistant', assistantContent, currentModel, currentProvider, context.timezone);
			assistantMessage.tokenUsage = usage;

			const finalConversation = await this.persistExchange({
				conversation: context.conversation,
				project: context.project,
				messages: [...context.messagesWithUser, assistantMessage],
				model: currentModel,
				provider: currentProvider,
				tokenDelta: usage?.totalTokens ?? 0,
			});

			yield {
				type: 'complete',
				conversation: finalConversation,
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
	}> {
		const { conversation, project, userContent, attachments } = params;
		const modelId = conversation.meta.activeModel || this.defaultModel.modelId;
		const provider = conversation.meta.activeProvider || this.defaultModel.provider;
		const timezone = this.detectTimezone();
		const userMessage = createMessage('user', userContent, modelId, provider, timezone);

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

		return {
			modelId,
			provider,
			timezone,
			userMessage,
			messagesWithUser,
			llmMessages,
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
	}): Promise<ChatConversation> {
		const { conversation, project, context } = params;
		// Update context but keep messages unchanged
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			updatedAtTimestamp: Date.now(),
		};
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			conversation.messages,
			context,
			conversation.file
		);
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
		const { conversation, project, modelId, provider } = params;
		// Use provided provider or keep existing provider, fallback to chat service default
		const finalProvider = provider || conversation.meta.activeProvider || this.chat.getProviderId();

		// Update meta with new active model and provider
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			activeModel: modelId,
			activeProvider: finalProvider,
			updatedAtTimestamp: Date.now(),
		};

		// Save updated meta
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			conversation.messages,
			conversation.context,
			conversation.file
		);
	}

	/**
	 * Update conversation title by renaming the file.
	 */
	async updateConversationTitle(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		title: string;
	}): Promise<ChatConversation> {
		const { conversation, project, title } = params;

		const folder = conversation.file.parent;
		const fileToRename = this.findConversationFile(folder, conversation) ?? conversation.file;

		// Build new filename with the updated title
		const newFileName = this.storage.buildConversationFileName({
			...conversation.meta,
			title,
		});
		const newPath = normalizePath(
			folder?.path?.trim()
				? `${folder!.path}/${newFileName}.md`
				: `${newFileName}.md`
		);

		// Rename the file by id to keep names in sync
		await this.storage.getApp().vault.rename(fileToRename, newPath);

		// Update meta to mark as manually edited
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			title,
			titleManuallyEdited: true,
			updatedAtTimestamp: Date.now(),
		};

		// Get the renamed file
		const renamedFile = this.storage.getApp().vault.getAbstractFileByPath(newPath) as TFile | null;
		if (!renamedFile) {
			throw new Error('Failed to find renamed conversation file');
		}

		// Save updated meta
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			conversation.messages,
			conversation.context,
			renamedFile
		);
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
		const { messageId, conversation, project, starred } = params;
		let targetMessage: ChatMessage | null = null;
		const nextMessages: ChatMessage[] = [];
		for (const message of conversation.messages) {
			const next = message.id === messageId ? { ...message, starred } : message;
			if (next.id === messageId) {
				targetMessage = next;
			}
			nextMessages.push(next);
		}
		if (!targetMessage) {
			return conversation;
		}

		const record: StarredMessageRecord = {
			id: generateUuidWithoutHyphens(),
			sourceMessageId: targetMessage.id,
			conversationId: conversation.meta.id,
			projectId: project?.meta.id ?? conversation.meta.projectId,
			createdAt: Date.now(),
			active: starred,
		};
		if (starred) {
			await this.storage.addStar(record);
		} else {
			await this.storage.removeStar(targetMessage.id);
		}

		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			updatedAtTimestamp: Date.now(),
		};
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			nextMessages,
			conversation.context,
			conversation.file
		);
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
	 * Save conversation metadata and messages after an exchange.
	 */
	private async persistExchange(params: {
		conversation: ChatConversation;
		project: ChatProject | null;
		messages: ChatMessage[];
		model: string;
		provider?: string;
		tokenDelta: number;
	}): Promise<ChatConversation> {
		const context = await this.buildContextWindow(params.messages, params.model, params.project);

		// Keep the existing title, don't auto-generate from messages
		// Title generation will be handled by a separate service later
		const title = params.conversation.meta.title;

		// Get provider from last message or params or conversation meta
		const lastMessage = params.messages[params.messages.length - 1];
		const provider = params.provider || lastMessage?.provider || params.conversation.meta.activeProvider || this.chat.getProviderId();

		const updatedMeta: ChatConversationMeta = {
			...params.conversation.meta,
			title,
			activeModel: params.model,
			activeProvider: provider,
			updatedAtTimestamp: Date.now(),
			tokenUsageTotal: (params.conversation.meta.tokenUsageTotal ?? 0) + params.tokenDelta,
		};
		const saved = await this.storage.saveConversation(
			params.project?.meta ?? null,
			updatedMeta,
			params.messages,
			context,
			params.conversation.file
		);

		// Trigger message sent event
		const eventBus = EventBus.getInstance(this.storage.getApp());
		eventBus.dispatch(new MessageSentEvent({
			conversationId: saved.meta.id,
			projectId: saved.meta.projectId ?? null,
		}));

		// Update memory and profile asynchronously (don't block save)
		if (this.profileService && params.messages.length >= 2) {
			const userMessage = params.messages[params.messages.length - 2];
			const assistantMessage = params.messages[params.messages.length - 1];
			if (userMessage && assistantMessage && userMessage.role === 'user' && assistantMessage.role === 'assistant') {
				// Extract context candidates
				const contextMap: Record<string, string> = {};
				if (params.project) {
					contextMap.project = `Project: ${params.project.meta.name}${params.project.context?.shortSummary ? `\n${params.project.context.shortSummary}` : ''}`;
				}
				if (context.shortSummary) {
					contextMap.conversation = context.shortSummary;
				}

				this.profileService?.extractCandidates({
					userMessage: userMessage.content,
					assistantReply: assistantMessage.content,
					context: Object.keys(contextMap).length > 0 ? contextMap : undefined,
					provider,
					model: params.model,
				}).then((candidates) => {
					// Update context with all candidates
					if (candidates.length > 0) {
						this.profileService?.updateProfile({
							newItems: candidates,
							provider,
							model: params.model,
						}).catch((error) => {
							console.warn('[ConversationService] Failed to update context:', error);
						});
					}
				}).catch((error) => {
					console.warn('[ConversationService] Failed to extract context candidates:', error);
				});
			}
		}

		// Update context from conversations periodically (every 10 messages)
		if (this.profileService && params.messages.length > 0 && params.messages.length % 10 === 0) {
			const recentConversations = await this.storage.listConversations(params.project?.meta);
			const recentSummaries = recentConversations
				.slice(-5)
				.map((conv) => ({
					summary: conv.context?.shortSummary || '',
					topics: conv.context?.topics,
				}));
		}

		return saved;
	}

	/**
	 * Build a compact context window for summarization.
	 */
	async buildContextWindow(
		messages: ChatMessage[],
		modelId: string,
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
			const provider = this.chat.getProviderId();
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
				provider,
				modelId
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
					provider,
					modelId
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
			const provider = this.chat.getProviderId();
			const modelId = this.defaultModel.modelId;

			const summary = await this.resourceLoaderManager.getSummary(
				sourcePath,
				resourceRef.kind,
				this.promptService,
				provider,
				modelId
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

	/**
	 * Locate the conversation file under the provided folder by matching the id suffix.
	 */
	private findConversationFile(folder: TFolder | null | undefined, conversation: ChatConversation): TFile | null {
		if (!folder) {
			return null;
		}

		const suffix = `-${conversation.meta.id}`;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== 'md') {
				continue;
			}
			if (child.basename === conversation.file.basename) {
				return child;
			}
			if (child.basename.startsWith('Conv-') && child.basename.endsWith(suffix)) {
				return child;
			}
		}

		return null;
	}
}
