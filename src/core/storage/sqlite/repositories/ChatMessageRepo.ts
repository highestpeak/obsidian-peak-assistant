import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';
import type { ChatMessage } from '@/core/types/chat';
import { MessageStatus } from '@/core/types/chat';
import { hashMD5 } from '@/core/utils/hash-utils';

/**
 * Build the persisted meta_json blob for a message (turn relationships).
 * Returns null when there is nothing to persist so legacy rows stay null.
 */
export function buildMessageMetaJson(msg: ChatMessage): string | null {
	const extras: Record<string, unknown> = {};
	if (msg.replyToMessageId) extras.replyToMessageId = msg.replyToMessageId;
	if (msg.branchFromMessageId) extras.branchFromMessageId = msg.branchFromMessageId;
	if (msg.revisionOfMessageId) extras.revisionOfMessageId = msg.revisionOfMessageId;
	// Tool calls drive the persisted Agent Run surface. Previously they only
	// lived on the in-memory streaming message, so the entire execution timeline
	// disappeared after switching conversations or reloading Obsidian.
	if (msg.toolCalls && msg.toolCalls.length > 0) extras.toolCalls = msg.toolCalls;
	if (Object.keys(extras).length === 0) return null;
	try {
		return JSON.stringify(extras);
	} catch {
		// A provider may return a non-serializable tool payload. Keep the durable
		// relationship metadata instead of failing the whole message write.
		delete extras.toolCalls;
		return Object.keys(extras).length > 0 ? JSON.stringify(extras) : null;
	}
}

/**
 * Persist only FINAL non-success statuses (error/cancelled/timeout) so a
 * reload can render the failure receipt. Null = completed (legacy default).
 */
function buildPersistedStatus(msg: ChatMessage): string | null {
	if (msg.status === MessageStatus.ERROR || msg.status === MessageStatus.CANCELLED || msg.status === MessageStatus.TIMEOUT) {
		return msg.status;
	}
	return null;
}

/**
 * Repository for chat_message table.
 */
export class ChatMessageRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if message exists by message_id.
	 */
	async existsByMessageId(messageId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('chat_message')
			.select('message_id')
			.where('message_id', '=', messageId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new chat message.
	 */
	async insert(message: {
		message_id: string;
		conversation_id: string;
		role: string;
		content_hash: string;
		created_at_ts: number;
		created_at_zone: string;
		model: string | null;
		provider: string | null;
		topic: string | null;
		starred: number;
		is_error: number;
		is_visible: number;
		gen_time_ms: number | null;
		token_usage_json: string | null;
		thinking: string | null;
		suggested_followups_json: string | null;
		status: string | null;
		meta_json: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_message')
			.values(message)
			.execute();
	}

	/**
	 * Update existing chat message by message_id.
	 */
	async updateByMessageId(messageId: string, updates: Partial<Pick<DbSchema['chat_message'], 'conversation_id' | 'role' | 'content_hash' | 'created_at_ts' | 'created_at_zone' | 'model' | 'provider' | 'topic' | 'starred' | 'is_error' | 'is_visible' | 'gen_time_ms' | 'token_usage_json' | 'thinking' | 'suggested_followups_json' | 'status' | 'meta_json'>>): Promise<void> {
		await this.db
			.updateTable('chat_message')
			.set(updates)
			.where('message_id', '=', messageId)
			.execute();
	}

	/**
	 * Upsert messages for a conversation.
	 */
	async upsertMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
		if (messages.length === 0) return;

		for (const msg of messages) {
			const messageData = {
				message_id: msg.id,
				conversation_id: conversationId,
				role: msg.role,
				content_hash: hashMD5(msg.content),
				created_at_ts: msg.createdAtTimestamp,
				created_at_zone: msg.createdAtZone,
				model: msg.model ?? null,
				provider: msg.provider ?? null,
				topic: msg.topic?.trim() || null,
				starred: msg.starred ? 1 : 0,
				is_error: msg.isErrorMessage ? 1 : 0,
				is_visible: msg.isVisible !== false ? 1 : 0,
				gen_time_ms: msg.genTimeMs ?? null,
				token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
				thinking: msg.reasoning?.content ?? null,
				suggested_followups_json: msg.suggestedFollowups && msg.suggestedFollowups.length > 0
					? JSON.stringify(msg.suggestedFollowups)
					: null,
				status: buildPersistedStatus(msg),
				meta_json: buildMessageMetaJson(msg),
			};

			const exists = await this.existsByMessageId(msg.id);

			if (exists) {
				const { message_id: _id, ...updates } = messageData;
				await this.updateByMessageId(msg.id, updates);
			} else {
				// Insert new message
				await this.insert(messageData);
			}
		}
	}

	/**
	 * Update the persisted suggestedFollowups for a single message.
	 * Used after async followup generation completes post-stream.
	 */
	async updateSuggestedFollowups(messageId: string, followups: string[]): Promise<void> {
		const json = followups.length > 0 ? JSON.stringify(followups) : null;
		await this.db
			.updateTable('chat_message')
			.set({ suggested_followups_json: json })
			.where('message_id', '=', messageId)
			.execute();
	}

	/**
	 * List messages for a conversation, ordered by creation time.
	 */
	async listByConversation(conversationId: string): Promise<DbSchema['chat_message'][]> {
		return this.db
			.selectFrom('chat_message')
			.selectAll()
			.where('conversation_id', '=', conversationId)
			.orderBy('created_at_ts', 'asc')
			.execute();
	}

	/**
	 * Update starred status for a message.
	 * Optionally updates content preview and attachment summary when starring.
	 */
	async updateStarred(
		messageId: string,
		starred: boolean,
		contentPreview?: string | null,
		attachmentSummary?: string | null
	): Promise<void> {
		const updateData: {
			starred: number;
			content_preview?: string | null;
			attachment_summary?: string | null;
		} = {
			starred: starred ? 1 : 0,
		};

		// Only update preview fields when starring (not when unstarring)
		if (starred) {
			if (contentPreview !== undefined) {
				updateData.content_preview = contentPreview || null;
			}
			if (attachmentSummary !== undefined) {
				updateData.attachment_summary = attachmentSummary || null;
			}
		} else {
			// When unstarring, clear preview fields
			updateData.content_preview = null;
			updateData.attachment_summary = null;
		}

		await this.db
			.updateTable('chat_message')
			.set(updateData)
			.where('message_id', '=', messageId)
			.execute();
	}

	/**
	 * List starred messages for a project by joining with chat_conversation table.
	 */
	async listStarredByProject(projectId: string): Promise<DbSchema['chat_message'][]> {
		return this.db
			.selectFrom('chat_message')
			.innerJoin('chat_conversation', 'chat_message.conversation_id', 'chat_conversation.conversation_id')
			.selectAll('chat_message')
			.where('chat_conversation.project_id', '=', projectId)
			.where('chat_message.starred', '=', 1)
			.orderBy('chat_message.created_at_ts', 'desc')
			.execute();
	}

	/**
	 * Count messages for a conversation (lightweight operation).
	 */
	async countByConversation(conversationId: string): Promise<number> {
		const result = await this.db
			.selectFrom('chat_message')
			.select(({ fn }) => fn.count<number>('message_id').as('count'))
			.where('conversation_id', '=', conversationId)
			.where('is_visible', '=', 1)
			.executeTakeFirst();

		return result?.count ?? 0;
	}

	/**
	 * Batch-update topic field for multiple messages.
	 */
	async updateTopics(assignments: Array<{ messageId: string; topic: string }>): Promise<void> {
		for (const { messageId, topic } of assignments) {
			await this.db
				.updateTable('chat_message')
				.set({ topic })
				.where('message_id', '=', messageId)
				.execute();
		}
	}

	/**
	 * Delete all messages for the given conversation IDs.
	 */
	async deleteByConversationIds(conversationIds: string[]): Promise<void> {
		if (conversationIds.length === 0) return;
		await this.db
			.deleteFrom('chat_message')
			.where('conversation_id', 'in', conversationIds)
			.execute();
	}
}
