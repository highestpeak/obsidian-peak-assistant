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
		await this.db
			.insertInto('chat_star')
			.values({
				source_message_id: params.sourceMessageId,
				id: params.id,
				conversation_id: params.conversationId,
				project_id: params.projectId ?? null,
				created_at_ts: params.createdAtTs,
				active: params.active ? 1 : 0,
			})
			.onConflict((oc) =>
				oc.column('source_message_id').doUpdateSet((eb) => ({
					conversation_id: eb.ref('excluded.conversation_id'),
					project_id: eb.ref('excluded.project_id'),
					active: eb.ref('excluded.active'),
					// Keep original created_at_ts & id.
				})),
			)
			.execute();
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

