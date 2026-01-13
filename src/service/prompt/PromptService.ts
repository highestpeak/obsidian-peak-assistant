import { App, normalizePath, TFile } from 'obsidian';
import { PromptId, type PromptVariables, PROMPT_REGISTRY } from './PromptId';
import { ensureFolder } from '@/core/utils/vault-utils';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import type { AIServiceSettings } from '@/app/settings/types';
import Handlebars from 'handlebars';
import { StreamingCallbacks, StreamType } from '@/service/chat/types';
import { MessagePart } from '@/core/providers/types';

/**
 * Unified prompt service with code-first templates and optional file overrides.
 */
export class PromptService {
	private promptFolder: string;
	private readonly cache = new Map<string, string>();
	private readonly templateCache = new Map<string, HandlebarsTemplateDelegate>();
	private chat?: MultiProviderChatService;
	private settings?: AIServiceSettings;

	constructor(
		private readonly app: App,
		settings: AIServiceSettings,
		chat?: MultiProviderChatService,
	) {
		this.promptFolder = normalizePath(settings.promptFolder);
		this.chat = chat;
		this.settings = settings;
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
	 * Update settings for prompt model configuration.
	 */
	setSettings(settings: AIServiceSettings): void {
		this.settings = settings;
	}

	/**
	 * Render a prompt template and call blockChat.
	 * @param promptId - The prompt identifier
	 * @param variables - Variables for the prompt template
	 * @param provider - LLM provider name
	 * @param model - Model identifier
	 * @param extraPart - Extra parts to add to the message. some times like image, file, etc.
	 * @returns The LLM response content
	 */
	async chatWithPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		provider?: string,
		model?: string,
		extraParts?: MessagePart[]
	): Promise<string> {
		if (!this.chat) {
			throw new Error('Chat service not available. Call setChatService() first.');
		}
		const promptText = await this.render(promptId, variables);

		// Get model configuration: use provided params, then check promptModelMap, then fallback to defaultModel
		if (!provider || !model) {
			// Check promptModelMap first
			if (this.settings?.promptModelMap?.[promptId]) {
				const promptModel = this.settings.promptModelMap[promptId];
				provider = promptModel.provider;
				model = promptModel.modelId;
			} else if (this.settings?.defaultModel) {
				// Fallback to defaultModel from settings
				provider = this.settings.defaultModel.provider;
				model = this.settings.defaultModel.modelId;
			} else {
				throw new Error('No model configuration available. Please configure defaultModel in settings.');
			}
		}

		const completion = await this.chat.blockChat({
			provider,
			model,
			messages: [
				{
					role: 'user',
					// MessageParts should be a flat array of MessagePart, which may contain text or other types (image, etc)
					content: [
						...(extraParts ?? []),
						{ type: 'text', text: promptText },
					],
				},
			],
		});
		return completion.content.map(part => part.type === 'text' ? part.text : '').join('').trim();
	}

	/**
	 * Render a prompt template and call streamChat with streaming callbacks.
	 * @param promptId - The prompt identifier
	 * @param variables - Variables for the prompt template
	 * @param callbacks - Streaming callbacks for handling progress
	 * @param streamType - Stream type identifier (default: 'content')
	 * @param provider - LLM provider name
	 * @param model - Model identifier
	 * @returns The complete LLM response content
	 */
	async chatWithPromptStream<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		callbacks: StreamingCallbacks,
		streamType: StreamType = 'content',
		provider?: string,
		model?: string
	): Promise<string> {
		if (!this.chat) {
			throw new Error('Chat service not available. Call setChatService() first.');
		}
		const promptText = await this.render(promptId, variables);

		// Get model configuration: use provided params, then check promptModelMap, then fallback to defaultModel
		if (!provider || !model) {
			// Check promptModelMap first
			if (this.settings?.promptModelMap?.[promptId]) {
				const promptModel = this.settings.promptModelMap[promptId];
				provider = promptModel.provider;
				model = promptModel.modelId;
			} else if (this.settings?.defaultModel) {
				// Fallback to defaultModel from settings
				provider = this.settings.defaultModel.provider;
				model = this.settings.defaultModel.modelId;
			} else {
				throw new Error('No model configuration available. Please configure defaultModel in settings.');
			}
		}

		callbacks.onStart?.(streamType);

		let fullContent = '';
		try {
			const stream = this.chat.streamChat({
				provider,
				model,
				messages: [
					{
						role: 'user',
						content: [{ type: 'text', text: promptText }],
					},
				],
			});

			for await (const event of stream) {
				if (event.type === 'text-delta') {
					fullContent += event.text;
					callbacks.onDelta?.(streamType, event.text);
				} else if (event.type === 'complete') {
					const finalContent = fullContent.trim();
					callbacks.onComplete?.(streamType, finalContent, {
						estimatedTokens: event.usage?.totalTokens,
						usage: event.usage,
					});
					return finalContent;
				} else if (event.type === 'error') {
					callbacks.onError?.(streamType, event.error);
					throw event.error;
				}
			}

			// If stream ends without complete event, return what we have
			const finalContent = fullContent.trim();
			callbacks.onComplete?.(streamType, finalContent);
			return finalContent;
		} catch (error) {
			callbacks.onError?.(streamType, error);
			throw error;
		}
	}

	/**
	 * Render a prompt with variables using Handlebars.
	 * First checks for file override, then falls back to code template.
	 * 
	 * If variables are null, returns the template without variables.
	 */
	async render<K extends PromptId>(
		id: K,
		variables: PromptVariables[K] | null,
	): Promise<string> {
		// Try to load override from file
		const override = await this.loadOverride(id);
		if (override) {
			if (!variables) {
				return override;
			}
			return this.renderHandlebarsTemplate(override, variables as Record<string, any>);
		}

		// Use code template
		return this.renderCodeTemplate(id, variables);
	}

	/**
	 * Load prompt override from vault file if exists.
	 */
	private async loadOverride(id: PromptId): Promise<string | undefined> {
		console.debug(`[PromptService] Loading prompt override for: ${id}`);
		const cacheKey = `override:${id}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey);
		}

		const fileName = `${id}.prompt.md`;
		const filePath = normalizePath(`${this.promptFolder}/${fileName}`);
		console.debug(`[PromptService] Checking for prompt override at: ${filePath}`);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			return undefined;
		}

		try {
			const content = (await this.app.vault.read(file)).trim();
			console.debug(`[PromptService] Loaded prompt override for: ${id}`, { content });
			this.cache.set(cacheKey, content);
			return content;
		} catch (error) {
			console.warn(`Failed to load prompt override for ${id}:`, error);
			return undefined;
		}
	}

	/**
	 * Render code template with variables using Handlebars.
	 */
	private renderCodeTemplate<K extends PromptId>(
		id: K,
		variables: PromptVariables[K] | null,
	): string {
		const template = PROMPT_REGISTRY[id];
		if (!template) {
			throw new Error(`Prompt template not found: ${id}`);
		}
		if (!variables) {
			return template.template;
		}

		return this.renderHandlebarsTemplate(template.template, variables as Record<string, any>);
	}

	/**
	 * Render template using Handlebars.
	 */
	private renderHandlebarsTemplate(template: string, vars: Record<string, any>): string {
		// Check cache first
		if (!this.templateCache.has(template)) {
			const compiled = Handlebars.compile(template);
			this.templateCache.set(template, compiled);
		}

		const compiled = this.templateCache.get(template)!;
		const result = compiled(vars).trim();

		// Debug: log if messages array exists but wasn't rendered
		if (vars.messages && Array.isArray(vars.messages) && vars.messages.length > 0) {
			const hasMessagesInResult = result.includes(vars.messages[0]?.content || '');
			if (!hasMessagesInResult) {
				console.warn('[PromptService] Messages may not have been rendered correctly:', {
					messageCount: vars.messages.length,
					resultPreview: result.substring(0, 200),
				});
			}
		}

		return result;
	}
}
