import { App, normalizePath, TFile } from 'obsidian';
import { PromptId, type PromptVariables, PromptInfo } from './PromptId';
import { ensureFolder } from '@/core/utils/vault-utils';
import type { AIServiceSettings } from '@/app/settings/types';
import { getAIPromptFolder } from '@/app/settings/types';
import type { CompiledTemplate } from '@/core/template-engine-helper';
import { compileTemplate } from '@/core/template-engine-helper';
import { LLMStreamEvent, LLMUsage, emptyUsage, MessagePart } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';
import { AppContext } from '@/app/context/AppContext';

/**
 * Unified prompt service: templates loaded on demand via TemplateManager, with optional vault overrides.
 *
 * Chat methods (chatWithPrompt, chatWithPromptStream) delegate to AIServiceManager's
 * Agent SDK-based queryText/queryStream. The provider/model params are ignored — the
 * active Profile determines the model.
 */
export class PromptService {
	private promptFolder: string;
	private readonly overrideCache = new Map<string, string>();
	private readonly overrideCompiledCache = new Map<string, CompiledTemplate>();
	private settings?: AIServiceSettings;

	constructor(
		private readonly app: App,
		settings: AIServiceSettings,
		_chat?: unknown, // Legacy parameter — no longer used (was MultiProviderChatService)
		private readonly templateManager?: TemplateManager,
	) {
		this.promptFolder = getAIPromptFolder(settings.rootFolder);
		this.settings = settings;
	}

	async init(): Promise<void> {
		await ensureFolder(this.promptFolder);
	}

	setPromptFolder(folder: string): void {
		this.promptFolder = normalizePath(folder);
		this.overrideCache.clear();
	}

	/** @deprecated No longer needed — delegates to AIServiceManager via AppContext. */
	setChatService(_chat: unknown): void { /* no-op */ }

	setSettings(settings: AIServiceSettings): void {
		this.settings = settings;
	}

	// ---------------------------------------------------------------------------
	// Chat methods — delegate to AIServiceManager.queryText / queryStream
	// ---------------------------------------------------------------------------

	async chatWithPrompt<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		_provider?: string,
		_model?: string,
		_extraParts?: MessagePart[],
	): Promise<string> {
		return AppContext.getInstance().manager.queryText(promptId, variables as any);
	}

	async chatWithPromptWithUsage<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		_provider?: string,
		_model?: string,
		_extraParts?: MessagePart[],
	): Promise<{ text: string; usage: LLMUsage; provider: string; model: string }> {
		const text = await AppContext.getInstance().manager.queryText(promptId, variables as any);
		return { text, usage: emptyUsage(), provider: 'agent-sdk', model: 'profile-active' };
	}

	async *chatWithPromptStream<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		_provider?: string,
		_model?: string,
	): AsyncGenerator<LLMStreamEvent> {
		const toolCallId = generateUuidWithoutHyphens();
		yield { type: 'prompt-stream-start', id: toolCallId, promptId, variables };

		const contentChunks: string[] = [];
		const startTime = Date.now();
		try {
			const stream = AppContext.getInstance().manager.queryStream(promptId, variables as any);
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

	// ---------------------------------------------------------------------------
	// Prompt info / render — unchanged
	// ---------------------------------------------------------------------------

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
