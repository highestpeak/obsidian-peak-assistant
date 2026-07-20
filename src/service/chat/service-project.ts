import type { AppHandle } from '@/core/ports/AppHandle';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { ChatProject, ChatProjectMeta } from './types';
import type { ProjectPlanRef } from '@/core/types/chat-studio';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY } from '@/core/constant';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/core/types/prompt';

/**
 * Service for managing chat projects.
 */
export class ProjectService {
	constructor(
		private readonly app: AppHandle,
		private readonly storage: ChatStorageService,
		private readonly rootFolder: string,
		private readonly promptService?: PromptService,
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
	 * Delete a project and all its conversations.
	 */
	async deleteProject(projectId: string): Promise<void> {
		await this.storage.deleteProject(projectId);
	}

	/**
	 * Update the USER-OWNED project description (chat-studio RUN-05). Only
	 * called from an explicit user Save — AI drafts stay in UI state until
	 * the user confirms.
	 */
	async updateProjectDescription(projectId: string, description: string): Promise<ChatProject> {
		return this.updateUserOwnedContext(projectId, { description });
	}

	/** Update the USER-OWNED project instructions. */
	async updateProjectInstructions(projectId: string, instructions: string): Promise<ChatProject> {
		return this.updateUserOwnedContext(projectId, { instructions });
	}

	private async updateUserOwnedContext(
		projectId: string,
		patch: { description?: string; instructions?: string }
	): Promise<ChatProject> {
		const project = await this.storage.readProject(projectId);
		if (!project) throw new Error('Project not found');
		const updatedMeta: ChatProjectMeta = {
			...project.meta,
			updatedAtTimestamp: Date.now(),
		};
		return this.storage.saveProject(updatedMeta, {
			...project.context,
			lastUpdatedTimestamp: Date.now(),
			...patch,
		});
	}

	// Project plans (chat-studio §9.1) — durable refs, not tool steps ---------

	async listPlans(projectId: string): Promise<ProjectPlanRef[]> {
		return this.storage.listProjectPlans(projectId);
	}

	async createPlan(input: {
		projectId: string;
		title: string;
		source: ProjectPlanRef['source'];
		status?: ProjectPlanRef['status'];
	}): Promise<ProjectPlanRef> {
		const plan: ProjectPlanRef = {
			id: generateUuidWithoutHyphens(),
			projectId: input.projectId,
			title: input.title,
			status: input.status ?? 'planned',
			source: input.source,
			updatedAt: Date.now(),
		};
		await this.storage.saveProjectPlan(plan);
		return plan;
	}

	async updatePlan(plan: ProjectPlanRef): Promise<ProjectPlanRef> {
		const updated: ProjectPlanRef = { ...plan, updatedAt: Date.now() };
		await this.storage.saveProjectPlan(updated);
		return updated;
	}

	async deletePlan(planId: string): Promise<void> {
		await this.storage.deleteProjectPlan(planId);
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

