import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_turn_receipt table — per-turn execution receipts
 * (chat-studio §12.1). Written when a turn starts; finalized on
 * completion/error/cancel/timeout. Full receipt lives in receipt_json.
 */
export class ChatTurnReceiptRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async upsert(row: DbSchema['chat_turn_receipt']): Promise<void> {
		const exists = await this.db
			.selectFrom('chat_turn_receipt')
			.select('request_id')
			.where('request_id', '=', row.request_id)
			.executeTakeFirst();
		if (exists) {
			await this.db
				.updateTable('chat_turn_receipt')
				.set({
					conversation_id: row.conversation_id,
					message_id: row.message_id,
					run_id: row.run_id,
					status: row.status,
					receipt_json: row.receipt_json,
					finished_at_ts: row.finished_at_ts,
				})
				.where('request_id', '=', row.request_id)
				.execute();
			return;
		}
		await this.db.insertInto('chat_turn_receipt').values(row).execute();
	}

	async getByRequestId(requestId: string): Promise<DbSchema['chat_turn_receipt'] | null> {
		const row = await this.db
			.selectFrom('chat_turn_receipt')
			.selectAll()
			.where('request_id', '=', requestId)
			.executeTakeFirst();
		return row ?? null;
	}

	async getByMessageId(messageId: string): Promise<DbSchema['chat_turn_receipt'] | null> {
		const row = await this.db
			.selectFrom('chat_turn_receipt')
			.selectAll()
			.where('message_id', '=', messageId)
			.orderBy('started_at_ts', 'desc')
			.executeTakeFirst();
		return row ?? null;
	}

	async listByConversation(conversationId: string): Promise<DbSchema['chat_turn_receipt'][]> {
		return this.db
			.selectFrom('chat_turn_receipt')
			.selectAll()
			.where('conversation_id', '=', conversationId)
			.orderBy('started_at_ts', 'asc')
			.execute();
	}

	async deleteByConversationIds(conversationIds: string[]): Promise<void> {
		if (conversationIds.length === 0) return;
		await this.db
			.deleteFrom('chat_turn_receipt')
			.where('conversation_id', 'in', conversationIds)
			.execute();
	}
}
