import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_artifact_receipt table — Chat-facing artifact
 * association receipts (chat-studio §12.2). Bodies stay in ArtifactPort
 * storage; this table joins artifacts to conversation/message/project and
 * carries the persisted view state.
 */
export class ChatArtifactReceiptRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async upsert(row: DbSchema['chat_artifact_receipt']): Promise<void> {
		const exists = await this.db
			.selectFrom('chat_artifact_receipt')
			.select('artifact_id')
			.where('artifact_id', '=', row.artifact_id)
			.executeTakeFirst();
		if (exists) {
			await this.db
				.updateTable('chat_artifact_receipt')
				.set({
					run_id: row.run_id,
					message_id: row.message_id,
					conversation_id: row.conversation_id,
					project_id: row.project_id,
					direction: row.direction,
					kind: row.kind,
					state: row.state,
					title: row.title,
					receipt_json: row.receipt_json,
				})
				.where('artifact_id', '=', row.artifact_id)
				.execute();
			return;
		}
		await this.db.insertInto('chat_artifact_receipt').values(row).execute();
	}

	async getById(artifactId: string): Promise<DbSchema['chat_artifact_receipt'] | null> {
		const row = await this.db
			.selectFrom('chat_artifact_receipt')
			.selectAll()
			.where('artifact_id', '=', artifactId)
			.executeTakeFirst();
		return row ?? null;
	}

	async listByConversation(conversationId: string): Promise<DbSchema['chat_artifact_receipt'][]> {
		return this.db
			.selectFrom('chat_artifact_receipt')
			.selectAll()
			.where('conversation_id', '=', conversationId)
			.orderBy('created_at_ts', 'asc')
			.execute();
	}

	async listByMessage(messageId: string): Promise<DbSchema['chat_artifact_receipt'][]> {
		return this.db
			.selectFrom('chat_artifact_receipt')
			.selectAll()
			.where('message_id', '=', messageId)
			.orderBy('created_at_ts', 'asc')
			.execute();
	}

	async listByProject(projectId: string): Promise<DbSchema['chat_artifact_receipt'][]> {
		return this.db
			.selectFrom('chat_artifact_receipt')
			.selectAll()
			.where('project_id', '=', projectId)
			.orderBy('created_at_ts', 'desc')
			.execute();
	}

	/**
	 * Zero-gap Track D (2026-07-21): scan all reminder receipts across the
	 * database. Used by the app-owned ReminderSchedulerService to detect
	 * pending reminders at boot + on each poll. Small table (bounded by user
	 * behavior) so an unfiltered scan is fine; the `kind='reminder'` filter
	 * keeps it cheap even when the artifact set grows.
	 */
	async listByKind(kind: string): Promise<DbSchema['chat_artifact_receipt'][]> {
		return this.db
			.selectFrom('chat_artifact_receipt')
			.selectAll()
			.where('kind', '=', kind)
			.orderBy('created_at_ts', 'desc')
			.execute();
	}

	async deleteByConversationIds(conversationIds: string[]): Promise<void> {
		if (conversationIds.length === 0) return;
		await this.db
			.deleteFrom('chat_artifact_receipt')
			.where('conversation_id', 'in', conversationIds)
			.execute();
	}
}
