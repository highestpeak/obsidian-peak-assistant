import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';
import type { ChatMessage } from '@/service/chat/types';
import { hashMD5 } from '@/core/utils/hash-utils';

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
		starred: number;
		is_error: number;
		is_visible: number;
		gen_time_ms: number | null;
		token_usage_json: string | null;
		thinking: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_message')
			.values(message)
			.execute();
	}

	/**
	 * Update existing chat message by message_id.
	 */
	async updateByMessageId(messageId: string, updates: Partial<Pick<DbSchema['chat_message'], 'conversation_id' | 'role' | 'content_hash' | 'created_at_ts' | 'created_at_zone' | 'model' | 'provider' | 'starred' | 'is_error' | 'is_visible' | 'gen_time_ms' | 'token_usage_json' | 'thinking'>>): Promise<void> {
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
				starred: msg.starred ? 1 : 0,
				is_error: msg.isErrorMessage ? 1 : 0,
				is_visible: msg.isVisible !== false ? 1 : 0,
				gen_time_ms: msg.genTimeMs ?? null,
				token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
				thinking: msg.thinking ?? null,
			};

			const exists = await this.existsByMessageId(msg.id);

			if (exists) {
				// Update existing message
				await this.updateByMessageId(msg.id, {
					conversation_id: conversationId,
					role: msg.role,
					content_hash: hashMD5(msg.content),
					created_at_ts: msg.createdAtTimestamp,
					created_at_zone: msg.createdAtZone,
					model: msg.model ?? null,
					provider: msg.provider ?? null,
					starred: msg.starred ? 1 : 0,
					is_error: msg.isErrorMessage ? 1 : 0,
					is_visible: msg.isVisible !== false ? 1 : 0,
					gen_time_ms: msg.genTimeMs ?? null,
					token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
					thinking: msg.thinking ?? null,
				});
			} else {
				// Insert new message
				await this.insert(messageData);
			}
		}
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
}
