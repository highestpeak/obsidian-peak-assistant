import type { LLMRequestMessage } from '@/core/providers/types';
import type { ChatConversation, ChatProject, ChatMessage } from '../types';
import type { PromptService } from '../service-prompt';
import type { ResourceSummaryService } from '../resources/ResourceSummaryService';
import { PromptTemplate } from '../service-prompt';

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
	constructor(
		private readonly promptService: PromptService,
		private readonly resourceSummaryService: ResourceSummaryService
	) {}

	/**
	 * Build LLM request messages with full context
	 */
	async buildContextMessages(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		messages: ChatMessage[];
		options?: ContextBuilderOptions;
	}): Promise<LLMRequestMessage[]> {
		const startTime = Date.now();
		const options = {
			maxRecentMessages: DEFAULT_MAX_RECENT_MESSAGES,
			includeUserProfile: false,
			tokenBudget: DEFAULT_TOKEN_BUDGET,
			...params.options,
		};

		const result: LLMRequestMessage[] = [];

		// 1. System prompt (ConversationSystem)
		const systemPrompt = await this.promptService.getPrompt(PromptTemplate.ConversationSystem);
		if (systemPrompt) {
			result.push({
				role: 'system',
				content: [{ type: 'text', text: systemPrompt }],
			});
		}

		// 2. User profile prompt (optional)
		if (options.includeUserProfile) {
			// User profile prompt would be loaded from a prompt file if it exists
			// For now, we'll skip it as it's optional
		}

		// 3. Context Memory system message
		const contextMemory = await this.buildContextMemoryMessage(params, options);
		if (contextMemory) {
			result.push(contextMemory);
		}

		// 4. Recent raw messages (last N messages)
		const recentMessages = params.messages.slice(-options.maxRecentMessages!);
		for (const message of recentMessages) {
			// Use original content only (runtime fields like contextText are handled by ChatMessageVO)
			if (message.content) {
				result.push({
					role: message.role,
					content: [{ type: 'text', text: message.content }],
				});
			}
		}

		const buildTime = Date.now() - startTime;
		console.log(`[ContextBuilder] Built context in ${buildTime}ms`);

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
		const sections: string[] = [];

		// Project context
		if (params.project) {
			sections.push('## Project Context');
			const projectSummary = params.project.context?.fullSummary || params.project.context?.shortSummary || params.project.context?.summary || params.project.shortSummary;
			if (projectSummary) {
				sections.push(`### Project: ${params.project.meta.name}`);
				sections.push(projectSummary);

				// Resource index
				if (params.project.context?.resourceIndex && params.project.context.resourceIndex.length > 0) {
					sections.push('### Project Resources');
					for (const resource of params.project.context.resourceIndex) {
						sections.push(`- ${resource.title || resource.id}: ${resource.shortSummary || resource.source}`);
					}
				}
			}
		}

		// Conversation context
		sections.push('## Conversation Context');
		const convSummary = params.conversation.context?.fullSummary || params.conversation.context?.shortSummary || params.conversation.context?.summary;
		if (convSummary) {
			sections.push(`### Summary: ${convSummary}`);

			// Topics
			if (params.conversation.context?.topics && params.conversation.context.topics.length > 0) {
				sections.push(`### Topics: ${params.conversation.context.topics.join(', ')}`);
			}

			// Resource index
			if (params.conversation.context?.resourceIndex && params.conversation.context.resourceIndex.length > 0) {
				sections.push('### Conversation Resources');
				for (const resource of params.conversation.context.resourceIndex) {
					sections.push(`- ${resource.title || resource.id}: ${resource.shortSummary || resource.source}`);
				}
			}
		}

		// Resource summaries for current message resources
		const resourceSummaries = await this.buildResourceSummariesSection(params);
		if (resourceSummaries) {
			sections.push(resourceSummaries);
		}

		if (sections.length === 0) {
			return null;
		}

		const contextText = sections.join('\n\n');
		return {
			role: 'system',
			content: [{ type: 'text', text: `# Context Memory\n\n${contextText}` }],
		};
	}

	/**
	 * Build resource summaries section for resources in current conversation/messages
	 */
	private async buildResourceSummariesSection(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
	}): Promise<string | null> {
		const resourceIds = new Set<string>();

		// Collect resource IDs from conversation messages
		for (const message of params.conversation.messages) {
			if (message.resources) {
				for (const resource of message.resources) {
					resourceIds.add(resource.id);
				}
			}
		}

		// Collect from context resource index
		if (params.conversation.context?.resourceIndex) {
			for (const resource of params.conversation.context.resourceIndex) {
				resourceIds.add(resource.id);
			}
		}

		if (params.project?.context?.resourceIndex) {
			for (const resource of params.project.context.resourceIndex) {
				resourceIds.add(resource.id);
			}
		}

		if (resourceIds.size === 0) {
			return null;
		}

		const sections: string[] = ['## Available Resources'];
		sections.push('You can reference these resources. Each has a summary you can use.');
		sections.push('To get full content, use the appropriate tool if available.');

		for (const resourceId of resourceIds) {
			const summary = await this.resourceSummaryService.readResourceSummary(resourceId);
			if (summary) {
				sections.push(`### ${summary.meta.title || summary.meta.id}`);
				sections.push(`**Source:** ${summary.meta.source}`);
				sections.push(`**Summary:** ${summary.meta.shortSummary || summary.meta.fullSummary || 'No summary available'}`);
			}
		}

		return sections.join('\n\n');
	}
}

