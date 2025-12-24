import { normalizePath, TFolder } from 'obsidian';
import { generateUuidWithoutHyphens } from '../../core/utils/id-utils';
import { ChatProjectMeta, ChatProject, ChatConversation } from './types';
import { ChatStorageService } from '../../core/storage/vault/ChatStore';
import { LLMApplicationService } from './service-application';
import { PromptService } from './service-prompt';
import { ChatDocName } from '@/core/storage/vault/chat-docs/ChatDocName';
import { ChatArchiveService } from './ChatArchiveService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Service for managing chat projects.
 */
export class ProjectService {
	private readonly archiveService: ChatArchiveService;

	constructor(
		private readonly storage: ChatStorageService,
		private readonly rootFolder: string,
		private readonly promptService?: PromptService,
		private readonly application?: LLMApplicationService
	) {
		this.archiveService = new ChatArchiveService(storage.getApp(), rootFolder);
	}

	/**
	 * Create a new project on disk.
	 */
	async createProject(input: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'>): Promise<ChatProject> {
		const timestamp = Date.now();
		const projectId = generateUuidWithoutHyphens();
		const normalizedRootFolder = normalizePath(this.rootFolder);
		const folderName = await ChatDocName.buildProjectFolderName(
			timestamp,
			input.name,
			this.storage.getApp().vault,
			normalizedRootFolder
		);
		const projectFolder = normalizePath(
			input.folderPath?.trim() || `${normalizedRootFolder}/${folderName}`
		);
		const project: ChatProjectMeta = {
			id: projectId,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			name: input.name,
			folderPath: projectFolder,
		};
		const file = await this.storage.saveProject(project);
		const result = await this.storage.readProject(project.id);
		// Trigger archive check
		await this.archiveService.maybeArchiveNow('createProject');
		return result;
	}

	/**
	 * List all projects managed by the service.
	 */
	async listProjects(): Promise<ChatProject[]> {
		return this.storage.listProjects();
	}

	/**
	 * Summarize a project by aggregating summaries from all conversations in the project.
	 */
	async summarizeProject(project: ChatProject, modelId: string): Promise<string> {
		// Mock implementation - return default summary
		return 'defaultSummary';
	}

	/**
	 * Rename a project by renaming its folder.
	 */
	async renameProject(project: ChatProject, newName: string): Promise<ChatProject> {
		const folder = this.resolveProjectFolder(project);
		if (!folder) {
			throw new Error('Project folder not found');
		}

		const timestamp = Date.now();
		const parentPath = folder.parent?.path ?? this.rootFolder;
		const newFolderName = await ChatDocName.buildProjectFolderName(
			timestamp,
			newName,
			this.storage.getApp().vault,
			parentPath
		);
		const newFolderPath = normalizePath(`${parentPath}/${newFolderName}`);

		// Rename the folder
		await this.storage.getApp().vault.rename(folder, newFolderName);

		// Update project meta with new folder path and name
		const updatedMeta: ChatProjectMeta = {
			...project.meta,
			name: newName,
			folderPath: newFolderPath,
			updatedAtTimestamp: timestamp,
		};

		// Update sqlite paths
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const newFolderRelPath = this.storage.getRootFolder() ? 
			newFolderPath.replace(this.storage.getRootFolder() + '/', '') : newFolderPath;
		await projectRepo.updatePathsOnMove(project.meta.id, newFolderRelPath);

		// Save updated project meta
		const file = await this.storage.saveProject(updatedMeta, project.context);
		return this.storage.readProject(project.meta.id);
	}

	/**
	 * Locate a project folder by id, falling back to the parsed project file when needed.
	 */
	private resolveProjectFolder(project: ChatProject): TFolder | null {
		const folderById = this.findProjectFolderById(project.meta.id);
		if (folderById) {
			return folderById;
		}
		return project.file.parent instanceof TFolder ? project.file.parent : null;
	}

	/**
	 * Search the configured root folder for a child folder whose name contains the project id suffix.
	 */
	private findProjectFolderById(projectId: string): TFolder | null {
		const rootFolder = this.storage.getApp().vault.getAbstractFileByPath(this.rootFolder);
		if (!(rootFolder instanceof TFolder)) {
			return null;
		}

		for (const child of rootFolder.children) {
			if (child instanceof TFolder && child.name.startsWith('Project-') && child.name.endsWith(`-${projectId}`)) {
				return child;
			}
		}

		return null;
	}
}

