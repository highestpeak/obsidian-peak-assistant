import { v4 as uuid } from 'uuid';
import { LLMProviderService } from './providers/types';
import { LLMApplicationService } from './service-application';
import { AIModelId, coerceModelId } from './types-models';
import { ChatStorageService } from './storage';
import { LLMMessage } from './providers/types';
import {
	ChatContextWindow,
	ChatConversationMeta,
	ChatMessage,
	ChatProjectMeta,
	ParsedConversationFile,
	ParsedProjectFile,
	StarredMessageRecord,
} from './types';
import { PromptService, PromptTemplate } from './service-prompt';
import { MessageContentComposer } from './utils-message-content';
import { AIStreamEvent } from './providers/types-events';

/**
 * Create a basic chat message with timestamps.
 */
export function createDefaultMessage(role: ChatMessage['role'], content: string, model: AIModelId, timezone: string): ChatMessage {
	const timestamp = Date.now();
	return {
		id: uuid(),
		role,
		content,
		model,
		createdAtTimestamp: timestamp,
		createdAtZone: timezone,
		starred: false,
	};
}

/**
 * Service for managing chat conversations.
 */
export class ConversationService {
	constructor(
		private readonly storage: ChatStorageService,
		private readonly chat: LLMProviderService,
		private readonly application: LLMApplicationService,
		private readonly promptService: PromptService,
		private readonly contentComposer: MessageContentComposer,
		private readonly defaultModelId: AIModelId
	) {}

	/**
	 * List conversations, optionally filtered by project.
	 */
	async listConversations(project?: ChatProjectMeta): Promise<ParsedConversationFile[]> {
		return this.storage.listConversations(project);
	}

	/**
	 * Create a new conversation with optional seed messages.
	 */
	async createConversation(params: {
		title: string;
		project?: ChatProjectMeta | null;
		initialMessages?: ChatMessage[];
	}): Promise<ParsedConversationFile> {
		const timestamp = Date.now();
		const meta: ChatConversationMeta = {
			id: uuid(),
			title: params.title,
			projectId: params.project?.id,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			activeModel: this.defaultModelId,
			tokenUsageTotal: 0,
		};

		const messages = params.initialMessages ?? [];
		const file = await this.storage.saveConversation(params.project ?? null, meta, messages);
		return this.storage.readConversation(file);
	}

	/**
	 * Send a message and wait for the full model response (blocking).
	 */
	async blockChat(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		userContent: string;
		autoSave?: boolean;
	}): Promise<{ conversation: ParsedConversationFile; message: ChatMessage }> {
		const { conversation, project, userContent, autoSave = true } = params;
		const modelId = conversation.meta.activeModel || this.defaultModelId;
		const timezone = this.detectTimezone();
		const userMessage = createDefaultMessage('user', userContent, modelId, timezone);
		const messagesWithUser = [...conversation.messages, userMessage];
		const llmMessages = await this.buildLLMRequestMessages(messagesWithUser);
		const assistant = await this.chat.blockChat({
			model: modelId,
			messages: llmMessages,
		});

		const assistantMessage = createDefaultMessage('assistant', assistant.content, assistant.model, timezone);
		
		if (autoSave) {
			const savedConversation = await this.persistExchange({
				conversation,
				project: project ?? null,
				messages: [...messagesWithUser, assistantMessage],
				model: assistant.model,
				tokenDelta: assistant.usage?.totalTokens ?? 0,
			});
			return { conversation: savedConversation, message: assistantMessage };
		} else {
			const updatedMessages = [...messagesWithUser, assistantMessage];
			const updatedMeta: ChatConversationMeta = {
				...conversation.meta,
				updatedAtTimestamp: Date.now(),
			};
			const unsavedConversation: ParsedConversationFile = {
				meta: updatedMeta,
				messages: updatedMessages,
				content: '',
				file: conversation.file,
			};
			return { conversation: unsavedConversation, message: assistantMessage };
		}
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
		const { conversation, project, userContent, autoSave = true } = params;
		const streamChat = this.chat.streamChat ? this.chat.streamChat.bind(this.chat) : null;
		if (!streamChat) {
			return this.createBlockingStream(conversation, project ?? null, userContent, autoSave);
		}
		return this.createLiveStream({
			conversation,
			project: project ?? null,
			userContent,
			streamChat,
			autoSave,
		});
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
		const { conversation, project, messages, context } = params;
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			updatedAtTimestamp: Date.now(),
		};
		const saved = await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			messages,
			context,
			undefined,
			conversation.file
		);
		return this.storage.readConversation(saved);
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
			id: uuid(),
			sourceMessageId: targetMessage.id,
			conversationId: conversation.meta.id,
			projectId: project?.meta.id,
			createdAt: Date.now(),
			active: starred,
		};
		if (starred) {
			await this.storage.addStar(record);
		} else {
			await this.storage.removeStar(targetMessage.id);
		}

		return this.updateConversationMessages({
			conversation,
			project,
			messages: nextMessages,
			context: conversation.context,
		});
	}

	/**
	 * Load starred message records.
	 */
	async loadStarred(): Promise<StarredMessageRecord[]> {
		return this.storage.readStarredCsv();
	}

	/**
	 * Summarize a conversation chunk with the configured model.
	 */
	async summarizeConversation(modelId: string, text: string): Promise<string> {
		const summaryPrompt = await this.promptService.getPrompt(PromptTemplate.ConversationSummary);
		const payload = summaryPrompt ? `${summaryPrompt}\n\n${text}` : text;
		return this.application.summarize({ model: coerceModelId(modelId), text: payload });
	}

	/**
	 * Compose the full messages array sent to the LLM.
	 */
	private async buildLLMRequestMessages(messages: ChatMessage[]): Promise<LLMMessage[]> {
		const systemPrompt = await this.loadConversationSystemPrompt();
		const result: LLMMessage[] = [];

		if (systemPrompt) {
			result.push({
				role: 'system',
				content: [{ type: 'text', text: systemPrompt }],
			});
		}

		for (const message of messages) {
			const parts = await this.contentComposer.composeContentParts(message);
			result.push({
				role: message.role,
				content: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
			});
		}

		return result;
	}

	/**
	 * Save conversation metadata and messages after an exchange.
	 */
	private async persistExchange(params: {
		conversation: ParsedConversationFile;
		project: ParsedProjectFile | null;
		messages: ChatMessage[];
		model: string;
		tokenDelta: number;
	}): Promise<ParsedConversationFile> {
		const context = await this.buildContextWindow(params.messages, params.model);
		const updatedMeta: ChatConversationMeta = {
			...params.conversation.meta,
			activeModel: params.model,
			updatedAtTimestamp: Date.now(),
			tokenUsageTotal: (params.conversation.meta.tokenUsageTotal ?? 0) + params.tokenDelta,
		};
		const saved = await this.storage.saveConversation(
			params.project?.meta ?? null,
			updatedMeta,
			params.messages,
			context,
			undefined,
			params.conversation.file
		);
		return this.storage.readConversation(saved);
	}

	/**
	 * Produce stream-like events for providers without native streaming.
	 */
	private createBlockingStream(
		conversation: ParsedConversationFile,
		project: ParsedProjectFile | null,
		userContent: string,
		autoSave: boolean
	): AsyncGenerator<AIStreamEvent> {
		const self = this;
		return (async function* (): AsyncGenerator<AIStreamEvent> {
			try {
				const result = await self.blockChat({ conversation, project, userContent, autoSave });
				if (result.message.content) {
					yield { type: 'delta', text: result.message.content };
				}
				yield {
					type: 'complete',
					conversation: result.conversation,
					message: result.message,
					model: result.message.model,
				};
			} catch (error) {
				const normalized = error instanceof Error ? error : new Error(String(error));
				yield { type: 'error', error: normalized };
			}
		})();
	}

	/**
	 * Start a real streaming session against the configured provider.
	 */
	private createLiveStream(params: {
		conversation: ParsedConversationFile;
		project: ParsedProjectFile | null;
		userContent: string;
		streamChat: NonNullable<LLMProviderService['streamChat']>;
		autoSave: boolean;
	}): AsyncGenerator<AIStreamEvent> {
		const self = this;
		return (async function* (): AsyncGenerator<AIStreamEvent> {
			const modelId = params.conversation.meta.activeModel || self.defaultModelId;
			const timezone = self.detectTimezone();
			const userMessage = createDefaultMessage('user', params.userContent, modelId, timezone);
			const messagesWithUser = [...params.conversation.messages, userMessage];
			const llmMessages = await self.buildLLMRequestMessages(messagesWithUser);
			const stream = params.streamChat({
				model: modelId,
				messages: llmMessages,
			});
			yield* self.consumeLLMStream(stream, {
				initialModel: modelId,
				conversation: params.conversation,
				project: params.project,
				messagesWithUser,
				timezone,
				autoSave: params.autoSave,
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
			conversation: ParsedConversationFile;
			project: ParsedProjectFile | null;
			messagesWithUser: ChatMessage[];
			timezone: string;
			autoSave: boolean;
		}
	): AsyncGenerator<AIStreamEvent> {
		let assistantContent = '';
		let currentModel = context.initialModel;
		let tokenDelta = 0;
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
					tokenDelta = chunk.usage?.totalTokens ?? tokenDelta;
					// Provider's complete event doesn't have conversation/message yet
					// We'll emit our own complete event after persistence
				}
			}

			const assistantMessage = createDefaultMessage('assistant', assistantContent, currentModel, context.timezone);
			
			let finalConversation: ParsedConversationFile;
			if (context.autoSave) {
				finalConversation = await this.persistExchange({
					conversation: context.conversation,
					project: context.project,
					messages: [...context.messagesWithUser, assistantMessage],
					model: currentModel,
					tokenDelta,
				});
			} else {
				const updatedMessages = [...context.messagesWithUser, assistantMessage];
				const updatedMeta: ChatConversationMeta = {
					...context.conversation.meta,
					updatedAtTimestamp: Date.now(),
				};
				finalConversation = {
					meta: updatedMeta,
					messages: updatedMessages,
					content: '',
					file: context.conversation.file,
				};
			}
			
			yield {
				type: 'complete',
				conversation: finalConversation,
				message: assistantMessage,
				model: currentModel,
				usage: tokenDelta > 0 ? { promptTokens: 0, completionTokens: 0, totalTokens: tokenDelta } : undefined,
			};
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			yield { type: 'error', error: normalized };
		}
	}

	/**
	 * Build a compact context window for summarization.
	 */
	private async buildContextWindow(messages: ChatMessage[], modelId: string): Promise<ChatContextWindow> {
		if (messages.length === 0) {
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
				summary: '',
			};
		}

		const recent = messages.slice(-10);
		const summaryInput = recent.map((message) => `${message.role}: ${message.content}`).join('\n');
		const summary = await this.summarizeConversation(modelId, summaryInput);
		return {
			lastUpdatedTimestamp: Date.now(),
			recentMessagesWindow: [
				{
					fromMessageId: recent[0].id,
					toMessageId: recent[recent.length - 1].id,
				},
			],
			summary,
		};
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
	 * Fetch system prompt text while silencing prompt errors.
	 */
	private async loadConversationSystemPrompt(): Promise<string | null> {
		try {
			return (await this.promptService.getPrompt(PromptTemplate.ConversationSystem)) ?? null;
		} catch (error) {
			console.error('Failed to load conversation prompt', error);
			return null;
		}
	}
}

