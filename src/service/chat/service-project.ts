import { normalizePath, TFolder } from 'obsidian';
import { buildTimestampedName, generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { ChatProject, ChatProjectMeta, ChatConversation } from './types';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY } from '@/core/constant';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';
import type { LLMProviderService } from '@/core/providers/types';

/**
 * Service for managing chat projects.
 */
export class ProjectService {
	constructor(
		private readonly storage: ChatStorageService,
		private readonly rootFolder: string,
		private readonly promptService?: PromptService,
		private readonly chat?: LLMProviderService,
	) {}

	/**
	 * Create a new project on disk.
	 */
	async createProject(input: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'>): Promise<ChatProject> {
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
		return await this.storage.saveProject(project);
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
	async summarizeProject(project: ChatProject, modelId: string, provider?: string): Promise<string> {
		if (!this.chat) {
			console.warn('[ProjectService] No LLM service available for project summary');
			return DEFAULT_SUMMARY;
		}

		try {
			// Get all conversations in this project
			const conversations = await this.storage.listConversations(project.meta);
			
			// Build conversations array with summaries
			const conversationsArray = conversations.map((conv) => ({
				title: conv.meta.title,
				shortSummary: conv.context?.shortSummary || conv.context?.summary,
				fullSummary: conv.context?.fullSummary,
			}));

			// Build resources array if available
			const resourcesArray = project.context?.resourceIndex?.map((r) => ({
				title: r.title || r.id,
				source: r.source,
				shortSummary: r.shortSummary,
			})) || [];

			// Generate short summary
			if (!this.promptService) {
				return DEFAULT_SUMMARY;
			}
			const finalProvider = provider || this.chat.getProviderId();
			const shortSummary = await this.promptService.chatWithPrompt(
				PromptId.ProjectSummaryShort,
				{
					conversations: conversationsArray,
					resources: resourcesArray.length > 0 ? resourcesArray : undefined,
				},
				finalProvider,
				modelId
			) || DEFAULT_SUMMARY;

			// Generate full summary if project has multiple conversations
			if (conversations.length > 1) {
				const fullSummary = await this.promptService.chatWithPrompt(
					PromptId.ProjectSummaryFull,
					{
						conversations: conversationsArray,
						resources: resourcesArray.length > 0 ? resourcesArray : undefined,
						shortSummary,
					},
					finalProvider,
					modelId
				);
				return fullSummary || shortSummary;
			}

			return shortSummary;
		} catch (error) {
			console.warn('[ProjectService] Failed to generate project summary:', error);
			return DEFAULT_SUMMARY;
		}
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
		return await this.storage.saveProject(updatedMeta, project.context);
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

