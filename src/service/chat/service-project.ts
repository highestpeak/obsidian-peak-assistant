import { normalizePath } from 'obsidian';
import { v4 as uuid } from 'uuid';
import { ChatProjectMeta, ParsedProjectFile, ParsedConversationFile } from './types';
import { ChatStorageService } from './storage';
import { slugify } from './utils';
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
		const slug = slugify(input.name);
		const projectId = uuid();
		const normalizedRootFolder = normalizePath(this.rootFolder);
		const projectFolder = normalizePath(input.folderPath?.trim() || `${normalizedRootFolder}/Project-${slug || projectId}`);
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
		if (!this.promptService || !this.application) {
			throw new Error('PromptService and ApplicationService are required for project summarization');
		}

		const conversations = await this.storage.listConversations(project.meta);
		if (conversations.length === 0) {
			return `Project "${project.meta.name}" has no conversations yet.`;
		}

		const conversationSummaries: string[] = [];
		for (const conversation of conversations) {
			const summary = conversation.context?.summary || conversation.meta.title;
			const conversationInfo = `[Conversation: ${conversation.meta.title}]\n${summary}`;
			conversationSummaries.push(conversationInfo);
		}

		const projectContent = `Project: ${project.meta.name}\n\nConversations:\n${conversationSummaries.join('\n\n')}`;
		const summaryPrompt = await this.promptService.getPrompt(PromptTemplate.ProjectSummary);
		const payload = summaryPrompt ? `${summaryPrompt}\n\n${projectContent}` : projectContent;
		return this.application.summarize({ model: coerceModelId(modelId), text: payload });
	}
}

