import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_assistant table — durable user-owned Assistant
 * definitions (chat-studio §8.6). The full definition lives in
 * definition_json; name/timestamps are denormalized for listing.
 */
export class ChatAssistantRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async upsert(row: DbSchema['chat_assistant']): Promise<void> {
		const exists = await this.db
			.selectFrom('chat_assistant')
			.select('assistant_id')
			.where('assistant_id', '=', row.assistant_id)
			.executeTakeFirst();
		if (exists) {
			await this.db
				.updateTable('chat_assistant')
				.set({
					name: row.name,
					definition_json: row.definition_json,
					updated_at_ts: row.updated_at_ts,
					archived: row.archived,
				})
				.where('assistant_id', '=', row.assistant_id)
				.execute();
			return;
		}
		await this.db.insertInto('chat_assistant').values(row).execute();
	}

	async getById(assistantId: string): Promise<DbSchema['chat_assistant'] | null> {
		const row = await this.db
			.selectFrom('chat_assistant')
			.selectAll()
			.where('assistant_id', '=', assistantId)
			.executeTakeFirst();
		return row ?? null;
	}

	async list(includeArchived: boolean = false): Promise<DbSchema['chat_assistant'][]> {
		let query = this.db.selectFrom('chat_assistant').selectAll();
		if (!includeArchived) query = query.where('archived', '=', 0);
		return query.orderBy('updated_at_ts', 'desc').execute();
	}

	async setArchived(assistantId: string, archived: boolean, updatedAtTs: number): Promise<void> {
		await this.db
			.updateTable('chat_assistant')
			.set({ archived: archived ? 1 : 0, updated_at_ts: updatedAtTs })
			.where('assistant_id', '=', assistantId)
			.execute();
	}

	async deleteById(assistantId: string): Promise<void> {
		await this.db
			.deleteFrom('chat_assistant')
			.where('assistant_id', '=', assistantId)
			.execute();
	}
}
