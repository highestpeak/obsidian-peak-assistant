import { ToolEvent, type LLMRequestMessage, type LLMStreamEvent, type MessagePart } from '@/core/providers/types';
import type { ChatConversation, ChatProject, ChatMessage, ChatResourceRef } from '../types';
import type { ResourceSummaryService } from './ResourceSummaryService';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';
import type { UserProfileService } from '@/service/chat/context/UserProfileService';
import type { ModelCapabilities } from '@/core/providers/types';
import type { App } from 'obsidian';
import { getImageMimeType, getFileMimeType } from '@/core/document/helper/FileTypeUtils';
import { readFileAsBase64 } from '@/core/utils/obsidian-utils';
import Handlebars from 'handlebars';
import * as contextMemoryTemplate from '@/service/prompt/templates/context-memory';
import * as userProfileTemplate from '@/service/prompt/templates/user-profile-context';
import * as messageResourcesTemplate from '@/service/prompt/templates/message-resources';

/**
 * Context building options
 */
export interface ContextBuilderOptions {
	/**
	 * Maximum number of recent messages to include
	 */
	maxRecentMessages?: number;
	/**
	 * Whether to include user profile prompt
	 */
	includeUserProfile?: boolean;
	/**
	 * Token budget for context (approximate, used for summary selection)
	 */
	tokenBudget?: number;
}

const DEFAULT_MAX_RECENT_MESSAGES = 10;
const DEFAULT_TOKEN_BUDGET = 16000;

/**
 * Builds the final messages array to send to LLM, including context memory.
 * Combines system prompts, project/conv summaries, recent messages, and resource summaries.
 */
export class ContextBuilder {
	private readonly contextMemoryTemplate: HandlebarsTemplateDelegate;
	private readonly userProfileTemplate: HandlebarsTemplateDelegate;
	private readonly messageResourcesTemplate: HandlebarsTemplateDelegate;

	constructor(
		private readonly promptService: PromptService,
		private readonly resourceSummaryService: ResourceSummaryService,
		private readonly userProfileService?: UserProfileService,
	) {
		// Pre-compile templates during initialization
		this.contextMemoryTemplate = Handlebars.compile(contextMemoryTemplate.template);
		this.userProfileTemplate = Handlebars.compile(userProfileTemplate.template);
		this.messageResourcesTemplate = Handlebars.compile(messageResourcesTemplate.template);

		// Register custom helpers
		Handlebars.registerHelper('join', (array: any[], separator: string) => array.join(separator));
	}

	/**
	 * Build LLM request messages with full context
	 */
	async *buildContextMessages(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		messages: ChatMessage[];
		options?: ContextBuilderOptions;
		modelCapabilities?: ModelCapabilities;
		attachmentHandlingMode?: 'direct' | 'degrade_to_text';
		app?: App;
	}): AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void> {
		const startTime = Date.now();
		yield { type: 'tool-call', toolName: ToolEvent.BUILD_CONTEXT_MESSAGES, input: { startTimestamp: startTime } };
		const options = {
			maxRecentMessages: DEFAULT_MAX_RECENT_MESSAGES,
			includeUserProfile: true, // Default to true if memory/profile services are available
			tokenBudget: DEFAULT_TOKEN_BUDGET,
			...params.options,
		};

		const result: LLMRequestMessage[] = [];

		// 1. System prompt (ConversationSystem)
		yield { type: 'tool-call', toolName: ToolEvent.LOAD_SYSTEM_PROMPT, input: { promptId: PromptId.ConversationSystem } };
		const systemPrompt = await this.promptService.render(PromptId.ConversationSystem, {});
		if (systemPrompt) {
			result.push({
				role: 'system',
				content: [{ type: 'text', text: systemPrompt }],
			});
		}
		yield { type: 'tool-result', toolName: ToolEvent.LOAD_SYSTEM_PROMPT, input: { promptId: PromptId.ConversationSystem }, output: systemPrompt };

		// 2. User profile and memories (if enabled)
		if (options.includeUserProfile && this.userProfileService) {
			yield { type: 'tool-call', toolName: ToolEvent.LOAD_USER_PROFILE };
			const userProfileMessage = await this.buildUserProfileMessage();
			if (userProfileMessage) {
				result.push(userProfileMessage);
			}
			yield { type: 'tool-result', toolName: ToolEvent.LOAD_USER_PROFILE, output: userProfileMessage };
		}

		// 3. Context Memory system message
		yield { type: 'tool-call', toolName: ToolEvent.BUILD_CONTEXT_MEMORY };
		const contextMemory = await this.buildContextMemoryMessage(params, options);
		if (contextMemory) {
			result.push(contextMemory);
		}
		yield { type: 'tool-result', toolName: ToolEvent.BUILD_CONTEXT_MEMORY, output: contextMemory };

		// 4. Recent raw messages (last N messages) (include the latest user message)
		yield { type: 'tool-call', toolName: ToolEvent.COLLECT_RECENT_MESSAGES, input: { maxRecentMessages: options.maxRecentMessages! } };
		const recentMessagesCollected: LLMRequestMessage[] = [];
		const recentMessages = params.messages.slice(-options.maxRecentMessages!);
		for (let i = 0; i < recentMessages.length; i++) {
			const message = recentMessages[i];
			const messageContent = await this.buildMessageContent(message, i, recentMessages.length, params);
			if (messageContent) {
				recentMessagesCollected.push(messageContent);
			}
		}
		result.push(...recentMessagesCollected);
		yield { type: 'tool-result', toolName: ToolEvent.COLLECT_RECENT_MESSAGES, input: { maxRecentMessages: options.maxRecentMessages! }, output: recentMessagesCollected };

		yield {
			type: 'tool-result', toolName: ToolEvent.BUILD_CONTEXT_MESSAGES,
			input: { startTimestamp: startTime },
			output: { messageCount: result.length, durationMs: Date.now() - startTime }
		};

		return result;
	}

	/**
	 * Build context memory system message
	 */
	private async buildContextMemoryMessage(
		params: {
			conversation: ChatConversation;
			project?: ChatProject | null;
		},
		options: Required<ContextBuilderOptions>
	): Promise<LLMRequestMessage | null> {
		// Prepare template variables
		const projectSummary = params.project?.context?.fullSummary || params.project?.context?.shortSummary;
		const convSummary = params.conversation.context?.fullSummary || params.conversation.context?.shortSummary;

		const templateVars = {
			hasProject: !!params.project && !!projectSummary,
			projectName: params.project?.meta.name || '',
			projectSummary: projectSummary || '',
			projectResources: (params.project?.context?.resourceIndex || []).map(resource => ({
				displayName: resource.title || resource.id,
				displaySummary: resource.shortSummary || resource.source,
			})),
			hasConversation: !!convSummary,
			conversationSummary: convSummary || '',
			conversationTopics: params.conversation.context?.topics || [],
			conversationResources: (params.conversation.context?.resourceIndex || []).map(resource => ({
				displayName: resource.title || resource.id,
				displaySummary: resource.shortSummary || resource.source,
			})),
		};

		// Render using pre-compiled template
		const contextText = this.contextMemoryTemplate(templateVars).trim();

		if (!contextText) {
			return null;
		}

		return {
			role: 'system',
			content: [{ type: 'text', text: contextText }],
		};
	}

	/**
	 * Build user profile system message
	 */
	private async buildUserProfileMessage(): Promise<LLMRequestMessage | null> {
		// Load unified context
		const contextMap = await this.userProfileService!.loadContext();
		if (contextMap.size === 0) {
			return null;
		}

		const templateVars = {
			contextEntries: Array.from(contextMap.entries()).map(([category, texts]) => ({
				category,
				texts: texts.join(', '),
			})),
		};

		// Render using pre-compiled template
		const contextText = this.userProfileTemplate(templateVars).trim();

		return {
			role: 'user',
			content: [{ type: 'text', text: contextText }],
		};
	}


	/**
	 * Build message content for a single message
	 */
	private async buildMessageContent(
		message: ChatMessage,
		messageIndex: number,
		totalMessages: number,
		params: {
			attachmentHandlingMode?: 'direct' | 'degrade_to_text';
			modelCapabilities?: ModelCapabilities;
			app?: App;
		}
	): Promise<LLMRequestMessage | null> {
		// Build message content
		const contentParts: MessagePart[] = [];

		// Add text content
		if (message.content) {
			contentParts.push({ type: 'text', text: message.content });
		}

		// we need to let the model know if there are any file attached to the message.
		if (message.resources) {
			// for not the latest message, we send the summary of the resource.
			const isLatestMessage = messageIndex === totalMessages - 1;
			if (isLatestMessage && params.attachmentHandlingMode === 'direct') {
				for (const resource of message.resources) {
					const contentPart = await this.buildDirectResourceContent(resource, params.modelCapabilities, params.app!);
					if (contentPart) {
						contentParts.push(contentPart);
					}
				}
			} else {
				// Use pre-compiled template for message resources
				const attachmentText = this.messageResourcesTemplate({
					resources: message.resources.map(resource => ({ id: resource.id }))
				});
				contentParts.push({
					type: 'text',
					text: attachmentText
				});
			}
		}

		if (contentParts.length === 0) {
			return null;
		}

		return {
			role: message.role,
			content: contentParts,
		};
	}

	/**
	 * Build direct resource content for message parts
	 */
	private async buildDirectResourceContent(
		resource: ChatResourceRef,
		modelCapabilities?: ModelCapabilities,
		app?: App
	): Promise<MessagePart | null> {
		if (modelCapabilities?.vision && resource.kind === 'image') {
			// Vision model + direct mode: convert image to data URL and add to message content
			try {
				const ext = resource.source.split('.').pop()?.toLowerCase() || '';
				const base64 = await readFileAsBase64(app!, resource.source);
				if (base64) {
					const mimeType = getImageMimeType(ext);
					const dataUrl = `data:${mimeType};base64,${base64}`;
					return { type: 'image', data: dataUrl, mediaType: mimeType };
				}
			} catch (error) {
				console.warn(`[ChatService] Failed to convert image ${resource.source} to data URL:`, error);
				// Fallback: will use summary from context memory
				// todo yield error event.
			}
		} else if (modelCapabilities?.pdfInput && resource.kind === 'pdf') {
			try {
				const base64 = await readFileAsBase64(app!, resource.source);
				if (base64) {
					return { type: 'file', data: base64, mediaType: 'application/pdf' };
				}
			} catch (error) {
			}
		} else {
			const base64 = await readFileAsBase64(app!, resource.source);
			if (base64) {
				const ext = resource.source.split('.').pop()?.toLowerCase() || '';
				const mediaType = getFileMimeType(ext);
				return { type: 'file', data: base64, mediaType };
			}
		}
		return null;
	}
}

