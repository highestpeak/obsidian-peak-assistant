import { App, normalizePath, TFile } from 'obsidian';
import { PromptId, type PromptVariables, PROMPT_REGISTRY } from './PromptId';
import { ensureFolder } from '@/core/utils/vault-utils';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';

/**
 * Unified prompt service with code-first templates and optional file overrides.
 */
export class PromptService {
	private promptFolder: string;
	private readonly cache = new Map<string, string>();
	private chat?: MultiProviderChatService;

	constructor(
		private readonly app: App,
		promptFolder: string,
		chat?: MultiProviderChatService,
	) {
		this.promptFolder = normalizePath(promptFolder);
		this.chat = chat;
	}

	/**
	 * Initialize prompt service and ensure the prompt folder exists.
	 */
	async init(): Promise<void> {
		await ensureFolder(this.app, this.promptFolder);
	}

	/**
	 * Update prompt folder and clear cache.
	 */
	setPromptFolder(folder: string): void {
		this.promptFolder = normalizePath(folder);
		this.cache.clear();
	}

	/**
	 * Set LLM provider service for chat operations.
	 */
	setChatService(chat: MultiProviderChatService): void {
		this.chat = chat;
	}

	/**
	 * Render a prompt template and call blockChat.
	 * @param promptId - The prompt identifier
	 * @param variables - Variables for the prompt template
	 * @param provider - LLM provider name
	 * @param model - Model identifier
	 * @returns The LLM response content
	 */
	async chatWithPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T],
		provider: string,
		model: string
	): Promise<string> {
		if (!this.chat) {
			throw new Error('Chat service not available. Call setChatService() first.');
		}
		const promptText = await this.render(promptId, variables);
		const completion = await this.chat.blockChat({
			provider,
			model,
			messages: [
				{
					role: 'user',
					content: [{ type: 'text', text: promptText }],
				},
			],
		});
		return completion.content.trim();
	}

	/**
	 * Render a prompt with variables.
	 * First checks for file override, then falls back to code template.
	 */
	async render<K extends PromptId>(
		id: K,
		variables: PromptVariables[K],
	): Promise<string> {
		// Try to load override from file
		const override = await this.loadOverride(id);
		if (override) {
			// For overrides, use simple variable substitution (no complex template logic)
			return this.renderSimpleTemplate(override, variables as Record<string, any>);
		}

		// Use code template
		return this.renderCodeTemplate(id, variables);
	}

	/**
	 * Load prompt override from vault file if exists.
	 */
	private async loadOverride(id: PromptId): Promise<string | undefined> {
		const cacheKey = `override:${id}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey);
		}

		const fileName = `${id}.prompt.md`;
		const filePath = normalizePath(`${this.promptFolder}/${fileName}`);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			return undefined;
		}

		try {
			const content = (await this.app.vault.read(file)).trim();
			this.cache.set(cacheKey, content);
			return content;
		} catch (error) {
			console.warn(`Failed to load prompt override for ${id}:`, error);
			return undefined;
		}
	}

	/**
	 * Simple template renderer for file overrides (only {{variable}} substitution).
	 */
	private renderSimpleTemplate(template: string, vars: Record<string, any>): string {
		return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
			const value = this.getNestedValue(vars, varName);
			return value !== undefined && value !== null ? String(value) : '';
		});
	}

	/**
	 * Render code template with variables.
	 */
	private renderCodeTemplate<K extends PromptId>(
		id: K,
		variables: PromptVariables[K],
	): string {
		const template = PROMPT_REGISTRY[id];
		if (!template) {
			throw new Error(`Prompt template not found: ${id}`);
		}

		return this.renderTemplate(template.template, variables as Record<string, any>);
	}

	/**
	 * Render template string with variables.
	 * Supports:
	 * - {{variable}} - variable substitution
	 * - {{#if variable}}...{{/if}} - conditional blocks
	 * - {{#each array}}...{{/each}} - array iteration
	 * - {{@index}} - loop index
	 * - {{#if (eq a b)}}...{{/if}} - equality helper
	 */
	private renderTemplate(template: string, vars: Record<string, any>): string {
		// Handle conditionals and loops first, then simple variables
		let result = template;

		// Process {{#each}} blocks
		result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, varName, block) => {
			const array = this.getNestedValue(vars, varName);
			if (!Array.isArray(array)) {
				return '';
			}
			return array.map((item, index) => {
				const itemVars = { ...vars, [varName]: item, '@index': index };
				return this.renderTemplate(block, itemVars);
			}).join('');
		});

		// Process {{#if}} blocks with equality check
		result = result.replace(/\{\{#if\s+\(eq\s+(\w+)\s+(\w+)\)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, var1, var2, block) => {
			const val1 = this.getNestedValue(vars, var1);
			const val2 = this.getNestedValue(vars, var2);
			if (val1 === val2) {
				return this.renderTemplate(block, vars);
			}
			return '';
		});

		// Process {{#if}} blocks
		result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, block) => {
			const value = this.getNestedValue(vars, varName);
			if (value) {
				return this.renderTemplate(block, vars);
			}
			return '';
		});

		// Process simple variable substitutions {{variable}}
		result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
			const value = this.getNestedValue(vars, varName);
			return value !== undefined && value !== null ? String(value) : '';
		});

		// Process nested variable access {{path.to.value}}
		result = result.replace(/\{\{(\w+(?:\.\w+)+)\}\}/g, (match, path) => {
			const value = this.getNestedValue(vars, path);
			return value !== undefined && value !== null ? String(value) : '';
		});

		return result.trim();
	}

	/**
	 * Get nested value from object using dot notation.
	 */
	private getNestedValue(obj: any, path: string): any {
		const parts = path.split('.');
		let current = obj;
		for (const part of parts) {
			if (current === null || current === undefined) {
				return undefined;
			}
			current = current[part];
		}
		return current;
	}
}
