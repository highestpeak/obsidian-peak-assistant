import { normalizePath, TFile, TFolder } from 'obsidian';
import { generateUuidWithoutHyphens } from './utils';
import { LLMProviderService, LLMProvider } from './providers/types';
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
export function createDefaultMessage(role: ChatMessage['role'], content: string, model: AIModelId, provider: LLMProvider, timezone: string): ChatMessage {
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
		const defaultProvider = this.chat.getProviderId();
		const meta: ChatConversationMeta = {
			id: generateUuidWithoutHyphens(),
			title: params.title,
			projectId: params.project?.id,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			activeModel: this.defaultModelId,
			activeProvider: defaultProvider,
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
		attachments?: string[];
		autoSave?: boolean;
	}): Promise<{ conversation: ParsedConversationFile; message: ChatMessage }> {
		const { conversation, project, userContent, attachments, autoSave = true } = params;
		const modelId = conversation.meta.activeModel || this.defaultModelId;
		const provider = conversation.meta.activeProvider || this.chat.getProviderId();
		const timezone = this.detectTimezone();
		const userMessage = createDefaultMessage('user', userContent, modelId, provider, timezone);
		if (attachments && attachments.length > 0) {
			userMessage.attachments = attachments;
		}
		const messagesWithUser = [...conversation.messages, userMessage];
		const llmMessages = await this.buildLLMRequestMessages(messagesWithUser);
		const assistant = await this.chat.blockChat({
			provider,
			model: modelId,
			messages: llmMessages,
		});

		const assistantMessage = createDefaultMessage('assistant', assistant.content, assistant.model, provider, timezone);
		
		if (autoSave) {
			const savedConversation = await this.persistExchange({
				conversation,
				project: project ?? null,
				messages: [...messagesWithUser, assistantMessage],
				model: assistant.model,
				provider: provider,
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
	 * Update conversation's active model.
	 */
	async updateConversationModel(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		modelId: AIModelId;
		provider?: LLMProvider;
	}): Promise<ParsedConversationFile> {
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
		const saved = await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			conversation.messages,
			conversation.context,
			undefined,
			conversation.file
		);
		return this.storage.readConversation(saved);
	}

	/**
	 * Update conversation title by renaming the file.
	 */
	async updateConversationTitle(params: {
		conversation: ParsedConversationFile;
		project?: ParsedProjectFile | null;
		title: string;
	}): Promise<ParsedConversationFile> {
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
		const saved = await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			conversation.messages,
			conversation.context,
			undefined,
			renamedFile
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
		// Mock implementation - return default summary
		return 'defaultSummary';
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
		provider?: LLMProvider;
		tokenDelta: number;
	}): Promise<ParsedConversationFile> {
		const context = await this.buildContextWindow(params.messages, params.model);
		
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
			const provider = params.conversation.meta.activeProvider || self.chat.getProviderId();
			const timezone = self.detectTimezone();
			const userMessage = createDefaultMessage('user', params.userContent, modelId, provider, timezone);
			const messagesWithUser = [...params.conversation.messages, userMessage];
			const llmMessages = await self.buildLLMRequestMessages(messagesWithUser);
			const stream = params.streamChat({
				provider,
				model: modelId,
				messages: llmMessages,
			});
			yield* self.consumeLLMStream(stream, {
				initialModel: modelId,
				initialProvider: provider,
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
			initialProvider: LLMProvider;
			conversation: ParsedConversationFile;
			project: ParsedProjectFile | null;
			messagesWithUser: ChatMessage[];
			timezone: string;
			autoSave: boolean;
		}
	): AsyncGenerator<AIStreamEvent> {
		let assistantContent = '';
		let currentModel = context.initialModel;
		let currentProvider = context.initialProvider;
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

			const assistantMessage = createDefaultMessage('assistant', assistantContent, currentModel, currentProvider, context.timezone);
			
			let finalConversation: ParsedConversationFile;
			if (context.autoSave) {
				finalConversation = await this.persistExchange({
					conversation: context.conversation,
					project: context.project,
					messages: [...context.messagesWithUser, assistantMessage],
					model: currentModel,
					provider: currentProvider,
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
				summary: 'defaultSummary',
			};
		}

		const recent = messages.slice(-10);
		return {
			lastUpdatedTimestamp: Date.now(),
			recentMessagesWindow: [
				{
					fromMessageId: recent[0].id,
					toMessageId: recent[recent.length - 1].id,
				},
			],
			summary: 'defaultSummary',
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

	/**
	 * Locate the conversation file under the provided folder by matching the id suffix.
	 */
	private findConversationFile(folder: TFolder | null | undefined, conversation: ParsedConversationFile): TFile | null {
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

