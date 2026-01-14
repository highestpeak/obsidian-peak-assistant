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
	 * Check if star record exists by source_message_id.
	 */
	async existsBySourceMessageId(sourceMessageId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('chat_star')
			.select('source_message_id')
			.where('source_message_id', '=', sourceMessageId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new chat star record.
	 */
	async insert(star: {
		source_message_id: string;
		id: string;
		conversation_id: string;
		project_id: string | null;
		created_at_ts: number;
		active: number;
	}): Promise<void> {
		await this.db
			.insertInto('chat_star')
			.values(star)
			.execute();
	}

	/**
	 * Update existing chat star record by source_message_id.
	 */
	async updateBySourceMessageId(sourceMessageId: string, updates: Partial<Pick<DbSchema['chat_star'], 'conversation_id' | 'project_id' | 'active'>>): Promise<void> {
		await this.db
			.updateTable('chat_star')
			.set(updates)
			.where('source_message_id', '=', sourceMessageId)
			.execute();
	}

	/**
	 * Upsert a star record (keyed by source_message_id).
	 */
	async upsert(params: {
		sourceMessageId: string;
		id: string;
		conversationId: string;
		projectId?: string | null;
		createdAtTs: number;
		active: boolean;
	}): Promise<void> {
		const exists = await this.existsBySourceMessageId(params.sourceMessageId);

		if (exists) {
			// Update existing star record
			await this.updateBySourceMessageId(params.sourceMessageId, {
				conversation_id: params.conversationId,
				project_id: params.projectId ?? null,
				active: params.active ? 1 : 0,
			});
		} else {
			// Insert new star record
			await this.insert({
				source_message_id: params.sourceMessageId,
				id: params.id,
				conversation_id: params.conversationId,
				project_id: params.projectId ?? null,
				created_at_ts: params.createdAtTs,
				active: params.active ? 1 : 0,
			});
		}
	}

	/**
	 * Set star active flag for a message.
	 */
	async setActive(sourceMessageId: string, active: boolean): Promise<void> {
		await this.db
			.updateTable('chat_star')
			.set({ active: active ? 1 : 0 })
			.where('source_message_id', '=', sourceMessageId)
			.execute();
	}

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
	 * Get star record by message id.
	 */
	async getBySourceMessageId(sourceMessageId: string): Promise<DbSchema['chat_star'] | null> {
		const row = await this.db
			.selectFrom('chat_star')
			.selectAll()
			.where('source_message_id', '=', sourceMessageId)
			.executeTakeFirst();
		return row ?? null;
	}
}

