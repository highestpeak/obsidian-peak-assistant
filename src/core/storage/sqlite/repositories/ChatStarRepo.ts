import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_star table.
 *
 * This keeps a stable list of starred messages without relying on a CSV file.
 */
export class ChatStarRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * List all active starred messages.
	 */
	async listActive(): Promise<DbSchema['chat_star'][]> {
		return this.db
			.selectFrom('chat_star')
			.selectAll()
			.where('active', '=', 1)
			.orderBy('created_at_ts', 'desc')
			.execute();
	}

	/**
	 * Delete star records for the given conversation IDs.
	 */
	async deleteByConversationIds(conversationIds: string[]): Promise<void> {
		if (conversationIds.length === 0) return;
		await this.db
			.deleteFrom('chat_star')
			.where('conversation_id', 'in', conversationIds)
			.execute();
	}
}

