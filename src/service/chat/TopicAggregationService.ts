import type { ChatConversation, ChatMessage } from './types';
import type { AIServiceManager } from './service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const MIN_UNGROUPED_MESSAGES = 6; // 3 rounds of conversation
const MESSAGE_SUMMARY_LIMIT = 150; // chars per message in the prompt

interface TopicGroup {
	topic: string;
	messageIds: string[];
}

/**
 * Automatic LLM-driven topic aggregation for chat conversations.
 * Groups ungrouped messages into topics when enough accumulate.
 */
export class TopicAggregationService {
	private pendingConversations = new Set<string>();

	constructor(private readonly manager: AIServiceManager) {}

	/**
	 * Check if aggregation should run and trigger it if needed.
	 * Called after each assistant message is persisted.
	 * Returns the updated conversation if topics were assigned, null otherwise.
	 */
	async maybeAggregate(conversation: ChatConversation): Promise<ChatConversation | null> {
		const conversationId = conversation.meta.id;

		// Prevent concurrent aggregation for the same conversation
		if (this.pendingConversations.has(conversationId)) return null;

		const ungrouped = conversation.messages.filter(m =>
			!m.topic && (m.role === 'user' || m.role === 'assistant')
		);

		if (ungrouped.length < MIN_UNGROUPED_MESSAGES) return null;

		this.pendingConversations.add(conversationId);
		try {
			return await this.runAggregation(conversation, ungrouped);
		} finally {
			this.pendingConversations.delete(conversationId);
		}
	}

	private async runAggregation(
		conversation: ChatConversation,
		ungroupedMessages: ChatMessage[],
	): Promise<ChatConversation | null> {
		// Build a compact message list for the prompt
		const messageList = ungroupedMessages.map(m => {
			const content = (m.content || '').slice(0, MESSAGE_SUMMARY_LIMIT);
			return `[${m.id}] ${m.role.toUpperCase()}: ${content}`;
		}).join('\n');

		try {
			const groups = await this.manager.queryStructured<TopicGroup[]>(
				PromptId.ChatTopicAggregation,
				{ messages: messageList },
			);

			if (!Array.isArray(groups) || groups.length === 0) return null;

			// Build assignment list
			const assignments: Array<{ messageId: string; topic: string }> = [];
			const topicByMessageId = new Map<string, string>();

			for (const group of groups) {
				if (!group.topic || !Array.isArray(group.messageIds)) continue;
				for (const id of group.messageIds) {
					// Verify the message ID exists in ungrouped
					if (ungroupedMessages.some(m => m.id === id)) {
						assignments.push({ messageId: id, topic: group.topic });
						topicByMessageId.set(id, group.topic);
					}
				}
			}

			if (assignments.length === 0) return null;

			// Persist to SQLite
			const messageRepo = sqliteStoreManager.isInitialized()
				? sqliteStoreManager.getChatMessageRepo()
				: null;
			if (messageRepo) {
				await messageRepo.updateTopics(assignments);
			}

			// Update in-memory conversation
			const updatedMessages = conversation.messages.map(m => {
				const topic = topicByMessageId.get(m.id);
				return topic ? { ...m, topic } : m;
			});

			return {
				...conversation,
				messages: updatedMessages,
			};
		} catch (error) {
			console.error('[TopicAggregation] Failed:', error);
			return null;
		}
	}
}
