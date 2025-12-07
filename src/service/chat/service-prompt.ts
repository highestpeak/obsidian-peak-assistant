import { App, normalizePath, TFile } from 'obsidian';
import { ensureFolder } from '@/service/chat/utils';

/**
 * Predefined prompt template filenames for consistent lookup.
 */
export enum PromptTemplate {
	ConversationSystem = 'conversation-system',
	ConversationSummary = 'conversation-summary',
	ProjectSummary = 'project-summary',
}

const DEFAULT_FILE_EXTENSION = '.prompt.md';

export interface PromptServiceOptions {
	/** Base folder that stores prompt files. */
	promptFolder: string;
}

/**
 * PromptService loads and caches predefined prompt templates.
 */
export class PromptService {
	private promptFolder: string;
	private readonly cache = new Map<PromptTemplate, string>();

	constructor(private readonly app: App, options: PromptServiceOptions) {
		this.promptFolder = normalizePath(options.promptFolder);
	}

	/**
	 * Initialize prompt service and ensure the prompt folder exists.
	 */
	async init(): Promise<void> {
		await ensureFolder(this.app, this.promptFolder);
	}

	/**
	 * Update prompt folder and clear in-memory cache.
	 */
	setPromptFolder(folder: string): void {
		this.promptFolder = normalizePath(folder);
		this.cache.clear();
	}

	/**
	 * Load a single prompt template, trim whitespace, and memoize the result.
	 */
	async getPrompt(template: PromptTemplate): Promise<string | undefined> {
		if (this.cache.has(template)) {
			return this.cache.get(template);
		}

		const file = this.app.vault.getAbstractFileByPath(this.buildPromptPath(template));
		if (!(file instanceof TFile)) {
			return undefined;
		}

		const content = (await this.app.vault.read(file)).trim();
		this.cache.set(template, content);
		return content;
	}

	private buildPromptPath(template: PromptTemplate): string {
		const fileName = `${template}${DEFAULT_FILE_EXTENSION}`;
		return normalizePath(`${this.promptFolder}/${fileName}`);
	}
}


