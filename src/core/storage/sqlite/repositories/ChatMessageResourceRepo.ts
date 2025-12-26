import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { ChatResourceRef } from '@/service/chat/types';

/**
 * Repository for chat_message_resource table.
 */
export class ChatMessageResourceRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Replace all resources for a message (delete old, insert new).
	 */
	async replaceForMessage(messageId: string, resources: ChatResourceRef[]): Promise<void> {
		await this.db.transaction().execute(async (trx) => {
			// Delete existing resources
			await trx.deleteFrom('chat_message_resource').where('message_id', '=', messageId).execute();

			// Insert new resources
			if (resources.length > 0) {
				const values = resources.map((res) => ({
					id: res.id || `${messageId}-${res.source}`,
					message_id: messageId,
					source: res.source,
					kind: res.kind ?? null,
					summary_note_rel_path: res.summaryNotePath ?? null,
					meta_json: null, // Reserved for future extension
				}));
				await trx.insertInto('chat_message_resource').values(values).execute();
			}
		});
	}

	/**
	 * Get all resources for a message.
	 */
	async getByMessageId(messageId: string): Promise<DbSchema['chat_message_resource'][]> {
		return this.db
			.selectFrom('chat_message_resource')
			.selectAll()
			.where('message_id', '=', messageId)
			.execute();
	}

	/**
	 * Get resources for multiple messages.
	 */
	async getByMessageIds(messageIds: string[]): Promise<Map<string, DbSchema['chat_message_resource'][]>> {
		if (messageIds.length === 0) return new Map();
		const rows = await this.db
			.selectFrom('chat_message_resource')
			.selectAll()
			.where('message_id', 'in', messageIds)
			.execute();
		const result = new Map<string, DbSchema['chat_message_resource'][]>();
		for (const row of rows) {
			const existing = result.get(row.message_id) || [];
			existing.push(row);
			result.set(row.message_id, existing);
		}
		return result;
	}
}
