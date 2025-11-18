import { normalizePath } from 'obsidian';
import { generateUuidWithoutHyphens } from './utils';
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
		const projectId = generateUuidWithoutHyphens();
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
		// Mock implementation - return default summary
		return 'defaultSummary';
	}
}

