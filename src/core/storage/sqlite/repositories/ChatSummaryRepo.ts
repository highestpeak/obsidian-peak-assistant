import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_summary table.
 */
export class ChatSummaryRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert summary for a project or conversation.
	 */
	async upsert(params: {
		scope: 'project' | 'conversation';
		scopeId: string;
		shortSummary?: string | null;
		fullSummary?: string | null;
		topics?: string[] | null;
		resourceIndex?: unknown[] | null;
		lastUpdatedTs: number;
	}): Promise<void> {
		const id = `${params.scope}:${params.scopeId}`;
		await this.db
			.insertInto('chat_summary')
			.values({
				id,
				scope: params.scope,
				scope_id: params.scopeId,
				short_summary: params.shortSummary ?? null,
				full_summary: params.fullSummary ?? null,
				topics_json: params.topics ? JSON.stringify(params.topics) : null,
				resource_index_json: params.resourceIndex ? JSON.stringify(params.resourceIndex) : null,
				last_updated_ts: params.lastUpdatedTs,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet((eb) => ({
					short_summary: eb.ref('excluded.short_summary'),
					full_summary: eb.ref('excluded.full_summary'),
					topics_json: eb.ref('excluded.topics_json'),
					resource_index_json: eb.ref('excluded.resource_index_json'),
					last_updated_ts: eb.ref('excluded.last_updated_ts'),
				})),
			)
			.execute();
	}

	/**
	 * Get summary by scope and scope ID.
	 */
	async get(scope: 'project' | 'conversation', scopeId: string): Promise<DbSchema['chat_summary'] | null> {
		const id = `${scope}:${scopeId}`;
		const row = await this.db
			.selectFrom('chat_summary')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();
		return row ?? null;
	}
}
