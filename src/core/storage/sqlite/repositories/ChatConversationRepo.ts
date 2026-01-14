import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_conversation table.
 */
export class ChatConversationRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if conversation exists by conversation_id.
	 */
	async existsByConversationId(conversationId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('chat_conversation')
			.select('conversation_id')
			.where('conversation_id', '=', conversationId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new chat conversation.
	 */
	async insert(conversation: {
		conversation_id: string;
		project_id: string | null;
		title: string;
		file_rel_path: string;
		created_at_ts: number;
		updated_at_ts: number;
		active_model: string | null;
		active_provider: string | null;
		token_usage_total: number | null;
		title_manually_edited: number;
		title_auto_updated: number;
		context_last_updated_ts: number | null;
		context_last_message_index: number | null;
		archived_rel_path: string | null;
		meta_json: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_conversation')
			.values(conversation)
			.execute();
	}

	/**
	 * Update existing chat conversation by conversation_id.
	 */
	async updateByConversationId(conversationId: string, updates: Partial<Pick<DbSchema['chat_conversation'], 'project_id' | 'title' | 'file_rel_path' | 'updated_at_ts' | 'active_model' | 'active_provider' | 'token_usage_total' | 'title_manually_edited' | 'title_auto_updated' | 'context_last_updated_ts' | 'context_last_message_index' | 'archived_rel_path' | 'meta_json'>>): Promise<void> {
		await this.db
			.updateTable('chat_conversation')
			.set(updates)
			.where('conversation_id', '=', conversationId)
			.execute();
	}

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
		const exists = await this.existsByConversationId(params.conversationId);

		if (exists) {
			// Update existing conversation
			await this.updateByConversationId(params.conversationId, {
				project_id: params.projectId ?? null,
				title: params.title,
				file_rel_path: params.fileRelPath,
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
			});
		} else {
			// Insert new conversation
			await this.insert({
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
			});
		}
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
