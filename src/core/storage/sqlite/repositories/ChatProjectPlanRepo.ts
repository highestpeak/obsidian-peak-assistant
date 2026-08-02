import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_project_plan table — durable ProjectPlanRef index
 * (chat-studio §9.1). Plans point at conversation- or vault-backed sources;
 * this table is the project-level index, not a task list.
 */
export class ChatProjectPlanRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async upsert(row: DbSchema['chat_project_plan']): Promise<void> {
		const exists = await this.db
			.selectFrom('chat_project_plan')
			.select('plan_id')
			.where('plan_id', '=', row.plan_id)
			.executeTakeFirst();
		if (exists) {
			await this.db
				.updateTable('chat_project_plan')
				.set({
					project_id: row.project_id,
					title: row.title,
					status: row.status,
					source_json: row.source_json,
					progress_json: row.progress_json,
					updated_at_ts: row.updated_at_ts,
				})
				.where('plan_id', '=', row.plan_id)
				.execute();
			return;
		}
		await this.db.insertInto('chat_project_plan').values(row).execute();
	}

	async getById(planId: string): Promise<DbSchema['chat_project_plan'] | null> {
		const row = await this.db
			.selectFrom('chat_project_plan')
			.selectAll()
			.where('plan_id', '=', planId)
			.executeTakeFirst();
		return row ?? null;
	}

	async listByProject(projectId: string, includeArchived: boolean = false): Promise<DbSchema['chat_project_plan'][]> {
		let query = this.db
			.selectFrom('chat_project_plan')
			.selectAll()
			.where('project_id', '=', projectId);
		if (!includeArchived) query = query.where('status', '!=', 'archived');
		return query.orderBy('updated_at_ts', 'desc').execute();
	}

	async listAll(): Promise<DbSchema['chat_project_plan'][]> {
		return this.db
			.selectFrom('chat_project_plan')
			.selectAll()
			.orderBy('updated_at_ts', 'desc')
			.execute();
	}

	async deleteById(planId: string): Promise<void> {
		await this.db
			.deleteFrom('chat_project_plan')
			.where('plan_id', '=', planId)
			.execute();
	}

	async deleteByProjectId(projectId: string): Promise<void> {
		await this.db
			.deleteFrom('chat_project_plan')
			.where('project_id', '=', projectId)
			.execute();
	}
}
