import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_project table.
 */
export class ChatProjectRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert project metadata.
	 */
	async upsertProject(params: {
		projectId: string;
		name: string;
		folderRelPath: string;
		createdAtTs: number;
		updatedAtTs: number;
		archivedRelPath?: string | null;
		metaJson?: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_project')
			.values({
				project_id: params.projectId,
				name: params.name,
				folder_rel_path: params.folderRelPath,
				created_at_ts: params.createdAtTs,
				updated_at_ts: params.updatedAtTs,
				archived_rel_path: params.archivedRelPath ?? null,
				meta_json: params.metaJson ?? null,
			})
			.onConflict((oc) =>
				oc.column('project_id').doUpdateSet((eb) => ({
					name: eb.ref('excluded.name'),
					folder_rel_path: eb.ref('excluded.folder_rel_path'),
					updated_at_ts: eb.ref('excluded.updated_at_ts'),
					archived_rel_path: eb.ref('excluded.archived_rel_path'),
					meta_json: eb.ref('excluded.meta_json'),
				})),
			)
			.execute();
	}

	/**
	 * Get project by ID.
	 */
	async getById(projectId: string): Promise<DbSchema['chat_project'] | null> {
		const row = await this.db
			.selectFrom('chat_project')
			.selectAll()
			.where('project_id', '=', projectId)
			.executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get project by folder path.
	 */
	async getByFolderPath(folderRelPath: string): Promise<DbSchema['chat_project'] | null> {
		const row = await this.db
			.selectFrom('chat_project')
			.selectAll()
			.where('folder_rel_path', '=', folderRelPath)
			.executeTakeFirst();
		return row ?? null;
	}

	/**
	 * List all projects (excluding archived by default).
	 */
	async listProjects(includeArchived: boolean = false): Promise<DbSchema['chat_project'][]> {
		let query = this.db.selectFrom('chat_project').selectAll();
		if (!includeArchived) {
			query = query.where('archived_rel_path', 'is', null);
		}
		return query.orderBy('updated_at_ts', 'desc').execute();
	}

	/**
	 * Update folder path when project is moved/renamed.
	 */
	async updatePathsOnMove(
		projectId: string,
		newFolderRelPath: string,
		newArchivedRelPath?: string | null
	): Promise<void> {
		await this.db
			.updateTable('chat_project')
			.set({
				folder_rel_path: newFolderRelPath,
				archived_rel_path: newArchivedRelPath ?? null,
			})
			.where('project_id', '=', projectId)
			.execute();
	}
}
