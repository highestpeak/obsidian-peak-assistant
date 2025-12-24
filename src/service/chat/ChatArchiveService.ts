import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ensureFolder } from '@/core/utils/vault-utils';

/**
 * Service for archiving old chat projects and conversations.
 */
export class ChatArchiveService {
	private readonly rootFolder: string;
	private lastCheckTs: number = 0;
	private readonly throttleMs: number = 10 * 60 * 1000; // 10 minutes

	constructor(private readonly app: App, rootFolder: string) {
		this.rootFolder = normalizePath(rootFolder);
	}

	/**
	 * Lightweight check with throttling. Only runs archive if enough time has passed.
	 */
	async maybeArchiveNow(reason: string): Promise<void> {
		const now = Date.now();
		if (now - this.lastCheckTs < this.throttleMs) {
			return; // Skip if within throttle window
		}

		// Check last run from index_state
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo();
		const lastRunKey = 'chat_archive_last_run_ts';
		const lastRun = await indexStateRepo.get(lastRunKey);
		if (lastRun) {
			const lastRunTs = parseInt(lastRun);
			if (now - lastRunTs < this.throttleMs) {
				return; // Skip if last run was recent
			}
		}

		// Update last check time
		this.lastCheckTs = now;
		await indexStateRepo.set(lastRunKey, now.toString());

		// Run archive
		await this.runArchive();
	}

	/**
	 * Execute archive: move old items to Archive/YYYY/MM/ structure.
	 */
	async runArchive(): Promise<void> {
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		// Archive root conversations (older than 3 months or count > 50)
		await this.archiveRootConversations(currentYear, currentMonth);

		// Archive projects (older than 6 months or count > 20)
		await this.archiveProjects(currentYear, currentMonth);
	}

	/**
	 * Archive root conversations that meet criteria.
	 */
	private async archiveRootConversations(currentYear: number, currentMonth: number): Promise<void> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const conversations = await convRepo.listByProject(null, false); // Exclude already archived

		// Filter: older than 3 months or if total count > 50, archive oldest ones
		const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
		const toArchive = conversations
			.filter(c => c.updated_at_ts < threeMonthsAgo)
			.sort((a, b) => a.updated_at_ts - b.updated_at_ts);

		// If we have more than 50, archive excess
		if (conversations.length > 50) {
			const excess = conversations.length - 50;
			const excessToArchive = conversations
				.sort((a, b) => a.updated_at_ts - b.updated_at_ts)
				.slice(0, excess);
			toArchive.push(...excessToArchive);
		}

		// Remove duplicates
		const uniqueToArchive = Array.from(new Map(toArchive.map(c => [c.conversation_id, c])).values());

		for (const conv of uniqueToArchive) {
			await this.archiveConversation(conv.conversation_id, conv.file_rel_path, currentYear, currentMonth);
		}
	}

	/**
	 * Archive projects that meet criteria.
	 */
	private async archiveProjects(currentYear: number, currentMonth: number): Promise<void> {
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const projects = await projectRepo.listProjects(false); // Exclude already archived

		// Filter: older than 6 months or if total count > 20, archive oldest ones
		const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
		const toArchive = projects
			.filter(p => p.updated_at_ts < sixMonthsAgo)
			.sort((a, b) => a.updated_at_ts - b.updated_at_ts);

		// If we have more than 20, archive excess
		if (projects.length > 20) {
			const excess = projects.length - 20;
			const excessToArchive = projects
				.sort((a, b) => a.updated_at_ts - b.updated_at_ts)
				.slice(0, excess);
			toArchive.push(...excessToArchive);
		}

		// Remove duplicates
		const uniqueToArchive = Array.from(new Map(toArchive.map(p => [p.project_id, p])).values());

		for (const project of uniqueToArchive) {
			await this.archiveProject(project.project_id, project.folder_rel_path, currentYear, currentMonth);
		}
	}

	/**
	 * Archive a single conversation.
	 */
	private async archiveConversation(
		conversationId: string,
		fileRelPath: string,
		year: number,
		month: number
	): Promise<void> {
		const archivePath = this.getArchivePath(year, month);
		await ensureFolder(this.app, archivePath);

		const filePath = this.getAbsolutePath(fileRelPath);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			console.warn(`Conversation file not found for archiving: ${filePath}`);
			return;
		}

		const fileName = file.name;
		const newPath = normalizePath(`${archivePath}/${fileName}`);

		// Move file
		await this.app.vault.rename(file, newPath);

		// Update sqlite
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const newFileRelPath = this.getRelativePath(newPath);
		await convRepo.updateFilePath(conversationId, newFileRelPath, newFileRelPath);
	}

	/**
	 * Archive a single project.
	 */
	private async archiveProject(
		projectId: string,
		folderRelPath: string,
		year: number,
		month: number
	): Promise<void> {
		const archivePath = this.getArchivePath(year, month);
		await ensureFolder(this.app, archivePath);

		const folderPath = this.getAbsolutePath(folderRelPath);
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			console.warn(`Project folder not found for archiving: ${folderPath}`);
			return;
		}

		const folderName = folder.name;
		const newPath = normalizePath(`${archivePath}/${folderName}`);

		// Move folder
		await this.app.vault.rename(folder, newPath);

		// Update sqlite
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const newFolderRelPath = this.getRelativePath(newPath);
		await projectRepo.updatePathsOnMove(projectId, newFolderRelPath, newFolderRelPath);

		// Also update all conversations in this project
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const conversations = await convRepo.listByProject(projectId, false);
		for (const conv of conversations) {
			const oldFileRelPath = conv.file_rel_path;
			const oldFilePath = this.getAbsolutePath(oldFileRelPath);
			const newFilePath = oldFilePath.replace(folderPath, newPath);
			const newFileRelPath = this.getRelativePath(newFilePath);
			await convRepo.updateFilePath(conv.conversation_id, newFileRelPath, newFileRelPath);
		}
	}

	/**
	 * Get archive path for year/month.
	 */
	private getArchivePath(year: number, month: number): string {
		const mm = month < 10 ? `0${month}` : `${month}`;
		return normalizePath(`${this.rootFolder}/Archive/${year}/${mm}`);
	}

	/**
	 * Get relative path from vault root.
	 */
	private getRelativePath(absolutePath: string): string {
		const normalized = normalizePath(absolutePath);
		const rootNormalized = normalizePath(this.rootFolder);
		if (normalized.startsWith(rootNormalized)) {
			return normalized.substring(rootNormalized.length).replace(/^\//, '');
		}
		return normalized;
	}

	/**
	 * Get absolute path from relative path.
	 */
	private getAbsolutePath(relativePath: string): string {
		return normalizePath(`${this.rootFolder}/${relativePath}`);
	}
}
