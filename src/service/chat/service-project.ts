import { App } from 'obsidian';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { ChatProject, ChatProjectMeta } from './types';
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
		private readonly app: App,
		private readonly storage: ChatStorageService,
		private readonly rootFolder: string,
		private readonly promptService?: PromptService,
		private readonly chat?: LLMProviderService,
	) {}

	/**
	 * Create a new project on disk.
	 */
	async createProject(input: Partial<ChatProjectMeta>): Promise<ChatProject> {
		const timestamp = Date.now();
		const projectId = generateUuidWithoutHyphens();
		const name = input.name || `New`;
		const folderPath = this.storage.buildProjectFolderRelPath(
			name,
			timestamp,
			projectId,
			input.folderPath
		);
		const project: ChatProjectMeta = {
			id: projectId,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			name: name,
			folderPath: folderPath,
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
	async summarizeProject(project: ChatProject): Promise<string> {
		if (!this.chat) {
			console.warn('[ProjectService] No LLM service available for project summary');
			return DEFAULT_SUMMARY;
		}

		try {
			// Get all conversations in this project
			const conversations = await this.storage.listConversations(project.meta.id);
			
			// Build conversations array with summaries
			const conversationsArray = conversations.map((conv) => ({
				title: conv.meta.title,
				shortSummary: conv.context?.shortSummary,
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
			const shortSummary = await this.promptService.chatWithPrompt(
				PromptId.ProjectSummaryShort,
				{
					conversations: conversationsArray,
					resources: resourcesArray.length > 0 ? resourcesArray : undefined,
				},
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
	async renameProject(projectId: string, newName: string): Promise<ChatProject> {
		const project = await this.storage.readProject(projectId);
		if (!project) {
			throw new Error('Project not found');
		}

		// Rename folder and get new relative path
		const newFolderPath = await this.storage.renameProjectFolder(projectId, newName);

		// Update project meta with new folder path and name
		const updatedMeta: ChatProjectMeta = {
			...project.meta,
			name: newName,
			folderPath: newFolderPath,
			updatedAtTimestamp: Date.now(),
		};

		// Save updated project meta
		return await this.storage.saveProject(updatedMeta, project.context);
	}
}

