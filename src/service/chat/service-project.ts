import { normalizePath, TFolder } from 'obsidian';
import { buildTimestampedName, generateUuidWithoutHyphens } from './utils';
import { ChatProjectMeta, ParsedProjectFile, ParsedConversationFile } from './types';
import { ChatStorageService } from './storage';
import { LLMApplicationService } from './service-application';
import { PromptService, PromptTemplate } from './service-prompt';
import { AIModelId, coerceModelId } from './types-models';

/**
 * Service for managing chat projects.
 */
export class ProjectService {
	constructor(
		private readonly storage: ChatStorageService,
		private readonly rootFolder: string,
		private readonly promptService?: PromptService,
		private readonly application?: LLMApplicationService
	) {}

	/**
	 * Create a new project on disk.
	 */
	async createProject(input: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'>): Promise<ParsedProjectFile> {
		const timestamp = Date.now();
		const projectId = generateUuidWithoutHyphens();
		const normalizedRootFolder = normalizePath(this.rootFolder);
		const folderName = buildTimestampedName('Project', input.name, timestamp, projectId);
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
		return this.storage.readProject(file);
	}

	/**
	 * List all projects managed by the service.
	 */
	async listProjects(): Promise<ParsedProjectFile[]> {
		return this.storage.listProjects();
	}

	/**
	 * Summarize a project by aggregating summaries from all conversations in the project.
	 */
	async summarizeProject(project: ParsedProjectFile, modelId: AIModelId): Promise<string> {
		// Mock implementation - return default summary
		return 'defaultSummary';
	}

	/**
	 * Rename a project by renaming its folder.
	 */
	async renameProject(project: ParsedProjectFile, newName: string): Promise<ParsedProjectFile> {
		const folder = this.resolveProjectFolder(project);
		if (!folder) {
			throw new Error('Project folder not found');
		}

		const timestamp = Date.now();
		const newFolderName = buildTimestampedName('Project', newName, timestamp, project.meta.id);
		const parentPath = folder.parent?.path ?? this.rootFolder;
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

		// Save updated project meta
		const file = await this.storage.saveProject(updatedMeta, project.context, undefined);
		return this.storage.readProject(file);
	}

	/**
	 * Locate a project folder by id, falling back to the parsed project file when needed.
	 */
	private resolveProjectFolder(project: ParsedProjectFile): TFolder | null {
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

