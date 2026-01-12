import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_conversation table.
 */
export class ChatConversationRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert conversation metadata.
	 */
	async upsertConversation(params: {
		conversationId: string;
		projectId?: string | null;
		title: string;
		fileRelPath: string;
		createdAtTs: number;
		updatedAtTs: number;
		activeModel?: string | null;
		activeProvider?: string | null;
		tokenUsageTotal?: number | null;
		titleManuallyEdited?: boolean;
		titleAutoUpdated?: boolean;
		contextLastUpdatedTimestamp?: number | null;
		contextLastMessageIndex?: number | null;
		archivedRelPath?: string | null;
		metaJson?: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_conversation')
			.values({
				conversation_id: params.conversationId,
				project_id: params.projectId ?? null,
				title: params.title,
				file_rel_path: params.fileRelPath,
				created_at_ts: params.createdAtTs,
				updated_at_ts: params.updatedAtTs,
				active_model: params.activeModel ?? null,
				active_provider: params.activeProvider ?? null,
				token_usage_total: params.tokenUsageTotal ?? null,
				title_manually_edited: params.titleManuallyEdited ? 1 : 0,
				title_auto_updated: params.titleAutoUpdated ? 1 : 0,
				context_last_updated_ts: params.contextLastUpdatedTimestamp ?? null,
				context_last_message_index: params.contextLastMessageIndex ?? null,
				archived_rel_path: params.archivedRelPath ?? null,
				meta_json: params.metaJson ?? null,
			})
			.onConflict((oc) =>
				oc.column('conversation_id').doUpdateSet((eb) => ({
					project_id: eb.ref('excluded.project_id'),
					title: eb.ref('excluded.title'),
					file_rel_path: eb.ref('excluded.file_rel_path'),
					updated_at_ts: eb.ref('excluded.updated_at_ts'),
					active_model: eb.ref('excluded.active_model'),
					active_provider: eb.ref('excluded.active_provider'),
					token_usage_total: eb.ref('excluded.token_usage_total'),
					title_manually_edited: eb.ref('excluded.title_manually_edited'),
					title_auto_updated: eb.ref('excluded.title_auto_updated'),
					context_last_updated_ts: eb.ref('excluded.context_last_updated_ts'),
					context_last_message_index: eb.ref('excluded.context_last_message_index'),
					archived_rel_path: eb.ref('excluded.archived_rel_path'),
					meta_json: eb.ref('excluded.meta_json'),
				})),
			)
			.execute();
	}

	/**
	 * Get conversation by ID.
	 */
	async getById(conversationId: string): Promise<DbSchema['chat_conversation'] | null> {
		const row = await this.db
			.selectFrom('chat_conversation')
			.selectAll()
			.where('conversation_id', '=', conversationId)
			.executeTakeFirst();
		return row ?? null;
	}

	/**
	 * List conversations by project (null for root conversations).
	 */
	async listByProject(
		projectId: string | null,
		includeArchived: boolean = false,
		limit?: number,
		offset?: number
	): Promise<DbSchema['chat_conversation'][]> {
		let query = this.db.selectFrom('chat_conversation').selectAll();
		if (projectId === null) {
			query = query.where('project_id', 'is', null);
		} else {
			query = query.where('project_id', '=', projectId);
		}
		if (!includeArchived) {
			query = query.where('archived_rel_path', 'is', null);
		}
		query = query.orderBy('updated_at_ts', 'desc');

		if (offset !== undefined) {
			query = query.offset(offset);
		}
		if (limit !== undefined) {
			query = query.limit(limit);
		}

		return query.execute();
	}

	/**
	 * Count conversations by project (null for root conversations).
	 */
	async countByProject(
		projectId: string | null,
		includeArchived: boolean = false
	): Promise<number> {
		let query = this.db.selectFrom('chat_conversation').select(this.db.fn.countAll().as('count'));
		if (projectId === null) {
			query = query.where('project_id', 'is', null);
		} else {
			query = query.where('project_id', '=', projectId);
		}
		if (!includeArchived) {
			query = query.where('archived_rel_path', 'is', null);
		}
		const result = await query.executeTakeFirst();
		return Number(result?.count ?? 0);
	}

	/**
	 * Update file path when conversation is moved/renamed.
	 */
	async updateFilePath(conversationId: string, newFileRelPath: string, newArchivedRelPath?: string | null): Promise<void> {
		await this.db
			.updateTable('chat_conversation')
			.set({
				file_rel_path: newFileRelPath,
				archived_rel_path: newArchivedRelPath ?? null,
			})
			.where('conversation_id', '=', conversationId)
			.execute();
	}
}
