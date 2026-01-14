import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for chat_project table.
 */
export class ChatProjectRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if project exists by project_id.
	 */
	async existsByProjectId(projectId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('chat_project')
			.select('project_id')
			.where('project_id', '=', projectId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new chat project.
	 */
	async insert(project: {
		project_id: string;
		name: string;
		folder_rel_path: string;
		created_at_ts: number;
		updated_at_ts: number;
		archived_rel_path: string | null;
		meta_json: string | null;
	}): Promise<void> {
		await this.db
			.insertInto('chat_project')
			.values(project)
			.execute();
	}

	/**
	 * Update existing chat project by project_id.
	 */
	async updateByProjectId(projectId: string, updates: Partial<Pick<DbSchema['chat_project'], 'name' | 'folder_rel_path' | 'updated_at_ts' | 'archived_rel_path' | 'meta_json'>>): Promise<void> {
		await this.db
			.updateTable('chat_project')
			.set(updates)
			.where('project_id', '=', projectId)
			.execute();
	}

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
		const exists = await this.existsByProjectId(params.projectId);

		if (exists) {
			// Update existing project
			await this.updateByProjectId(params.projectId, {
				name: params.name,
				folder_rel_path: params.folderRelPath,
				updated_at_ts: params.updatedAtTs,
				archived_rel_path: params.archivedRelPath ?? null,
				meta_json: params.metaJson ?? null,
			});
		} else {
			// Insert new project
			await this.insert({
				project_id: params.projectId,
				name: params.name,
				folder_rel_path: params.folderRelPath,
				created_at_ts: params.createdAtTs,
				updated_at_ts: params.updatedAtTs,
				archived_rel_path: params.archivedRelPath ?? null,
				meta_json: params.metaJson ?? null,
			});
		}
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
