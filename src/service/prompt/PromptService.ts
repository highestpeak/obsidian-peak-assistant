import { App, normalizePath, TFile } from 'obsidian';
import { PromptId, type PromptVariables, PromptInfo } from './PromptId';
import { ensureFolder } from '@/core/utils/vault-utils';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import type { AIServiceSettings } from '@/app/settings/types';
import { getAIPromptFolder } from '@/app/settings/types';
import type { CompiledTemplate } from '@/core/template-engine-helper';
import { compileTemplate } from '@/core/template-engine-helper';
import { LLMStreamEvent, LLMUsage, MessagePart } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';

/** Exact `promptModelMap[promptId]` only; callers use `defaultModel` when missing. */
function pickPromptModelEntry(
	settings: AIServiceSettings | undefined,
	promptId: PromptId,
): { provider: string; modelId: string } | undefined {
	return settings?.promptModelMap?.[promptId];
}

/**
 * Unified prompt service: templates loaded on demand via TemplateManager, with optional vault overrides.
 */
export class PromptService {
	private promptFolder: string;
	private readonly overrideCache = new Map<string, string>();
	private readonly overrideCompiledCache = new Map<string, CompiledTemplate>();
	private chat?: MultiProviderChatService;
	private settings?: AIServiceSettings;

	constructor(
		private readonly app: App,
		settings: AIServiceSettings,
		chat?: MultiProviderChatService,
		private readonly templateManager?: TemplateManager,
	) {
		this.promptFolder = getAIPromptFolder(settings.rootFolder);
		this.chat = chat;
		this.settings = settings;
	}

	/**
	 * Initialize prompt service and ensure the prompt folder exists.
	 */
	async init(): Promise<void> {
		await ensureFolder(this.promptFolder);
	}

	/**
	 * Update prompt folder and clear cache.
	 */
	setPromptFolder(folder: string): void {
		this.promptFolder = normalizePath(folder);
		this.overrideCache.clear();
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
		const { text } = await this.chatWithPromptWithUsage(promptId, variables, provider, model, extraParts);
		return text;
	}

	/**
	 * Same as {@link chatWithPrompt} but returns token usage for billing / progress estimates.
	 */
	async chatWithPromptWithUsage<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		provider?: string,
		model?: string,
		extraParts?: MessagePart[]
	): Promise<{ text: string; usage: LLMUsage; provider: string; model: string }> {
		if (!this.chat) {
			throw new Error('Chat service not available. Call setChatService() first.');
		}
		const meta = getTemplateMetadata(promptId);
		const systemPrompt = meta.systemPromptId && this.templateManager
			? await this.templateManager.getTemplate(meta.systemPromptId)
			: undefined;
		const promptText = await this.render(promptId, variables);

		if (!provider || !model) {
			const promptModel = pickPromptModelEntry(this.settings, promptId);
			if (promptModel) {
				provider = promptModel.provider;
				model = promptModel.modelId;
			} else if (this.settings?.defaultModel) {
				provider = this.settings.defaultModel.provider;
				model = this.settings.defaultModel.modelId;
			} else {
				throw new Error('No model configuration available. Please configure defaultModel in settings.');
			}
		}

		const completion = await this.chat.blockChat({
			provider,
			model,
			...(systemPrompt ? { system: systemPrompt } : {}),
			messages: [
				{
					role: 'user',
					content: [
						...(extraParts ?? []),
						{ type: 'text', text: promptText },
					],
				},
			],
		});
		const text = completion.content.map(part => part.type === 'text' ? part.text : '').join('').trim();
		const usage = (completion.totalUsage ?? completion.usage) as LLMUsage;
		return { text, usage, provider, model };
	}

	/**
	 * Render a prompt template and call streamChat with streaming callbacks.
	 * @param promptId - The prompt identifier
	 * @param variables - Variables for the prompt template
	 * @param provider - LLM provider name
	 * @param model - Model identifier
	 * @returns The complete LLM response content
	 */
	async *chatWithPromptStream<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		provider?: string,
		model?: string
	): AsyncGenerator<LLMStreamEvent> {
		console.log('[PromptService] chatWithPromptStream ENTRY - METHOD STARTED');
		console.debug('[PromptService] chatWithPromptStream ENTRY', { promptId, hasVariables: !!variables, provider, model, hasChat: !!this.chat });

		if (!this.chat) {
			throw new Error('Chat service not available. Call setChatService() first.');
		}
		const meta = getTemplateMetadata(promptId);
		const systemPrompt = meta.systemPromptId && this.templateManager
			? await this.templateManager.getTemplate(meta.systemPromptId)
			: undefined;
		const promptText = await this.render(promptId, variables);

		// Get model configuration: use provided params, then check promptModelMap, then fallback to defaultModel
		if (!provider || !model) {
			const promptModel = pickPromptModelEntry(this.settings, promptId);
			if (promptModel) {
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

		const toolCallId = generateUuidWithoutHyphens();
		console.debug('[PromptService] chatWithPromptStream started', {promptText});
		yield { type: 'prompt-stream-start', id: toolCallId, promptId, variables };

		const contentChunks: string[] = [];
		const startTime = Date.now();
		try {
			const stream = this.chat.streamChat({
				provider,
				model,
				...(systemPrompt ? { system: systemPrompt } : {}),
				messages: [
					{
						role: 'user',
						content: [{ type: 'text', text: promptText }],
					},
				],
			});
			console.debug('[PromptService] chatWithPromptStream stream created');

			for await (const event of stream) {
				if (event.type === 'text-delta') {
					contentChunks.push(event.text);
					yield { type: 'prompt-stream-delta', id: toolCallId, promptId, delta: event.text };
				} else if (event.type === 'complete') {
					const finalContent = contentChunks.join('').trim();
					yield { type: 'prompt-stream-result', id: toolCallId, promptId, output: finalContent, usage: event.usage };
				} else if (event.type === 'error') {
					yield { type: 'error', error: event.error, durationMs: Date.now() - startTime };
				}
			}
		} catch (error) {
			yield { type: 'error', error, durationMs: Date.now() - startTime };
			throw error;
		}
	}

	async getPromptInfo<T extends PromptId>(
		promptId: T
	): Promise<PromptInfo> {
		const meta = getTemplateMetadata(promptId);
		const template = this.templateManager
			? await this.templateManager.getTemplate(promptId)
			: '';
		return {
			template,
			expectsJson: meta.expectsJson,
			jsonConstraint: meta.jsonConstraint,
			systemPromptId: meta.systemPromptId,
		};
	}

	/**
	 * Render a prompt with variables using Handlebars.
	 * First checks for vault file override, then uses TemplateManager.
	 */
	async render<K extends PromptId>(
		id: K,
		variables: PromptVariables[K] | null,
	): Promise<string> {
		const override = await this.loadOverride(id);
		if (override) {
			if (!variables) return override;
			return this.renderHandlebarsTemplate(override, variables as Record<string, unknown>, true);
		}
		if (!this.templateManager) {
			throw new Error('TemplateManager not set; cannot render prompt.');
		}
		const data = (variables ?? {}) as Record<string, unknown>;
		return this.templateManager.render(id, data);
	}

	/**
	 * Load prompt override from vault file if exists.
	 */
	private async loadOverride(id: PromptId): Promise<string | undefined> {
		const cacheKey = `override:${id}`;
		if (this.overrideCache.has(cacheKey)) {
			return this.overrideCache.get(cacheKey);
		}

		const fileName = `${id}.prompt.md`;
		const filePath = normalizePath(`${this.promptFolder}/${fileName}`);
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			return undefined;
		}

		try {
			const content = (await this.app.vault.read(file)).trim();
			this.overrideCache.set(cacheKey, content);
			return content;
		} catch (error) {
			console.warn(`Failed to load prompt override for ${id}:`, error);
			return undefined;
		}
	}

	/**
	 * Render a string template with Handlebars. Used for vault overrides.
	 */
	private renderHandlebarsTemplate(
		template: string,
		vars: Record<string, unknown>,
		useOverrideCache: boolean,
	): string {
		let compiled: CompiledTemplate;
		if (useOverrideCache) {
			if (!this.overrideCompiledCache.has(template)) {
				this.overrideCompiledCache.set(template, compileTemplate(template));
			}
			compiled = this.overrideCompiledCache.get(template)!;
		} else {
			compiled = compileTemplate(template);
		}
		const result = compiled(vars).trim();

		if (vars.messages && Array.isArray(vars.messages) && vars.messages.length > 0) {
			const firstContent = (vars.messages[0] as { content?: string })?.content || '';
			if (!result.includes(firstContent)) {
				console.warn('[PromptService] Messages may not have been rendered correctly:', {
					messageCount: (vars.messages as unknown[]).length,
					resultPreview: result.substring(0, 200),
				});
			}
		}

		return result;
	}
}
