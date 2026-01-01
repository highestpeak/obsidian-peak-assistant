import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';
import type { ChatMessage } from '@/service/chat/types';
import { hashStringBase36 } from '@/core/utils/hash-utils';

/**
 * Repository for chat_message table.
 */
export class ChatMessageRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert messages for a conversation.
	 */
	async upsertMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
		if (messages.length === 0) return;

		const values = messages.map((msg) => ({
			message_id: msg.id,
			conversation_id: conversationId,
			role: msg.role,
			content_hash: hashStringBase36(msg.content),
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
		}));

		await this.db
			.insertInto('chat_message')
			.values(values)
			.onConflict((oc) =>
				oc.column('message_id').doUpdateSet((eb) => ({
					conversation_id: eb.ref('excluded.conversation_id'),
					role: eb.ref('excluded.role'),
					content_hash: eb.ref('excluded.content_hash'),
					created_at_ts: eb.ref('excluded.created_at_ts'),
					created_at_zone: eb.ref('excluded.created_at_zone'),
					model: eb.ref('excluded.model'),
					provider: eb.ref('excluded.provider'),
					starred: eb.ref('excluded.starred'),
					is_error: eb.ref('excluded.is_error'),
					is_visible: eb.ref('excluded.is_visible'),
					gen_time_ms: eb.ref('excluded.gen_time_ms'),
					token_usage_json: eb.ref('excluded.token_usage_json'),
					thinking: eb.ref('excluded.thinking'),
				})),
			)
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
}
