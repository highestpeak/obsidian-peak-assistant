import type { AppHandle } from '@/core/ports/AppHandle';
import { PromptId, type PromptVariables, PromptInfo } from '@/core/types/prompt';
import { normalizeVaultPath } from '@/core/utils/path-utils';
import { ensureFolderRecursive, getFileRef, getFolderRef, isFile, writeVaultFile } from '@/core/storage/vault/vault-ops';
import type { AIServiceSettings } from '@/core/config/settingsTypes';
import { getAIPromptFolder } from '@/core/config/folderPaths';
import type { CompiledTemplate } from '@/core/template-engine-helper';
import { compileTemplate } from '@/core/template-engine-helper';
import { LLMStreamEvent, LLMUsage, emptyUsage, MessagePart } from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { getTemplateMetadata, type TemplateId } from '@/core/template/TemplateRegistry';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';

/**
 * Unified prompt service: templates loaded on demand via TemplateManager, with optional vault overrides.
 *
 * Chat methods delegate to AIServiceManager's Peak Harness queryText/queryStream.
 * The active Profile determines the model.
 */
export class PromptService {
	private static readonly MAX_DYNAMIC_TEMPLATE_CACHE_SIZE = 64;
	private promptFolder: string;
	private readonly overrideCache = new Map<string, { content: string; mtime: number | null }>();
	private readonly overrideCompiledCache = new Map<string, CompiledTemplate>();
	private readonly dynamicCompiledCache = new Map<string, CompiledTemplate>();
	private settings?: AIServiceSettings;
	private prompter?: IAgentPrompter;

	constructor(
		private readonly app: AppHandle,
		settings: AIServiceSettings,
		_chat?: unknown, // Legacy parameter — no longer used (was MultiProviderChatService)
		private readonly templateManager?: TemplateManager,
	) {
		this.promptFolder = getAIPromptFolder(settings.rootFolder);
		this.settings = settings;
	}

	/**
	 * T11J B3: AIServiceManager calls this once both it and PromptService are
	 * fully constructed, so PromptService can route chat helpers through the
	 * manager without reaching `AppContext.getInstance()`. Circular ctor
	 * issue means we use a setter rather than a ctor arg.
	 */
	setPrompter(prompter: IAgentPrompter): void {
		this.prompter = prompter;
	}

	async init(): Promise<void> {
		await ensureFolderRecursive(this.promptFolder, this.app);
	}

	setPromptFolder(folder: string): void {
		this.promptFolder = normalizeVaultPath(folder);
		this.clearOverrideCaches();
	}


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
		if (!this.prompter) throw new Error('PromptService: prompter not wired (call setPrompter from AIServiceManager init)');
		return this.prompter.queryText(promptId, variables as any);
	}

	async chatWithPromptWithUsage<T extends PromptId>(
		promptId: T,
		variables: PromptVariables[T] | null,
		_provider?: string,
		_model?: string,
		_extraParts?: MessagePart[],
	): Promise<{ text: string; usage: LLMUsage; provider: string; model: string }> {
		if (!this.prompter) throw new Error('PromptService: prompter not wired (call setPrompter from AIServiceManager init)');
		const text = await this.prompter.queryText(promptId, variables as any);
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
			if (!this.prompter) throw new Error('PromptService: prompter not wired (call setPrompter from AIServiceManager init)');
			const stream = this.prompter.queryStream(promptId, variables as any);
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

	getPromptFolder(): string {
		return this.promptFolder;
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

	/**
	 * Render a caller-owned dynamic template through the same Handlebars owner
	 * as built-in PromptId templates and Vault overrides.
	 *
	 * Dynamic definitions (currently Custom Prompts) already own their source
	 * file, so this method intentionally does not invent a second override
	 * store. It preserves the legacy literal-text behaviour of `{{content}}`:
	 * these strings are sent to an LLM, not inserted into an HTML document.
	 */
	renderDynamicTemplate(template: string, variables: Record<string, unknown>): string {
		let compiled = this.dynamicCompiledCache.get(template);
		if (!compiled) {
			if (this.dynamicCompiledCache.size >= PromptService.MAX_DYNAMIC_TEMPLATE_CACHE_SIZE) {
				const oldestTemplate = this.dynamicCompiledCache.keys().next().value;
				if (oldestTemplate !== undefined) this.dynamicCompiledCache.delete(oldestTemplate);
			}
			compiled = compileTemplate(template, { noEscape: true });
			this.dynamicCompiledCache.set(template, compiled);
		}
		return compiled(variables).trim();
	}

	/** Check if an override file exists for the given template id. */
	checkOverrideExists(id: TemplateId): boolean {
		const filePath = normalizeVaultPath(`${this.promptFolder}/${id}.prompt.md`);
		return getFileRef(filePath, this.app) != null;
	}

	/**
	 * Return the exact template a person is about to edit in AI Control Center.
	 * The returned text is either the live Vault override or the bundled
	 * default; callers never need to read the prompt folder themselves.
	 */
	async getEditablePrompt(id: PromptId): Promise<{ content: string; overridden: boolean }> {
		const override = await this.loadOverride(id);
		if (override !== undefined) return { content: override, overridden: true };
		if (!this.templateManager) {
			throw new Error('TemplateManager not set; cannot load a prompt for editing.');
		}
		return { content: await this.templateManager.getTemplate(id), overridden: false };
	}

	/**
	 * Persist a Vault override for a built-in prompt. The next render re-reads
	 * the file by mtime, so this is an actual runtime control rather than a
	 * separate UI-only settings value.
	 */
	async savePromptOverride(id: PromptId, content: string): Promise<string> {
		const trimmed = content.trim();
		if (!trimmed) throw new Error('A prompt cannot be empty. Restore the default instead.');
		const filePath = normalizeVaultPath(`${this.promptFolder}/${id}.prompt.md`);
		await ensureFolderRecursive(this.promptFolder, this.app);
		const file = getFileRef(filePath, this.app);
		await writeVaultFile(file, filePath, `${this.buildPromptMetaBlock(id)}\n\n${trimmed}\n`, this.app);
		this.clearOverrideCache(id);
		return filePath;
	}

	/** Scan the prompts folder and return a set of template ids that have override files. */
	scanOverrides(): Set<string> {
		const folder = getFolderRef(this.promptFolder, this.app);
		const result = new Set<string>();
		if (!folder) return result;
		const children = (folder as { children?: ReadonlyArray<unknown> }).children ?? [];
		for (const child of children) {
			if (isFile(child)) {
				const f = child as { name: string; extension: string };
				if (f.extension === 'md' && f.name.endsWith('.prompt.md')) {
					const id = f.name.replace(/\.prompt\.md$/, '');
					result.add(id);
				}
			}
		}
		return result;
	}

	/** Create an override file in the vault with the default template content + prompt-meta header. */
	async createOverrideFile(id: TemplateId): Promise<string> {
		const filePath = normalizeVaultPath(`${this.promptFolder}/${id}.prompt.md`);

		if (getFileRef(filePath, this.app)) return filePath;

		const defaultContent = this.templateManager
			? await this.templateManager.getTemplate(id)
			: '';

		const fileContent = `${this.buildPromptMetaBlock(id)}\n\n${defaultContent}`;

		await ensureFolderRecursive(this.promptFolder, this.app);
		await this.app.vault.create(filePath, fileContent);
		return filePath;
	}

	/** Delete an override file and clear its cache entry. */
	async deleteOverride(id: TemplateId): Promise<void> {
		const filePath = normalizeVaultPath(`${this.promptFolder}/${id}.prompt.md`);
		const file = getFileRef(filePath, this.app);
		if (file) {
			await this.app.vault.delete(file);
		}
		this.clearOverrideCache(id);
	}

	private async loadOverride(id: PromptId): Promise<string | undefined> {
		const cacheKey = `override:${id}`;
		const fileName = `${id}.prompt.md`;
		const filePath = normalizeVaultPath(`${this.promptFolder}/${fileName}`);
		const file = getFileRef(filePath, this.app);

		if (!file) {
			this.clearOverrideCache(id);
			return undefined;
		}

		const mtime = typeof file.stat?.mtime === 'number' ? file.stat.mtime : null;
		const cached = this.overrideCache.get(cacheKey);
		if (cached && cached.mtime === mtime) return cached.content;
		if (cached) this.clearOverrideCache(id);

		try {
			const raw = (await this.app.vault.read(file)).trim();
			const content = this.stripPromptMeta(raw);
			this.overrideCache.set(cacheKey, { content, mtime });
			return content;
		} catch (error) {
			console.warn(`Failed to load prompt override for ${id}:`, error);
			return undefined;
		}
	}

	private clearOverrideCache(id: TemplateId): void {
		const cacheKey = `override:${id}`;
		const cached = this.overrideCache.get(cacheKey);
		if (cached) this.overrideCompiledCache.delete(cached.content);
		this.overrideCache.delete(cacheKey);
	}

	private buildPromptMetaBlock(id: TemplateId): string {
		const meta = getTemplateMetadata(id);
		return [
			'```prompt-meta',
			`id: ${id}`,
			meta.label ? `label: ${meta.label}` : null,
			meta.description ? `description: ${meta.description}` : null,
			'note: Changes take effect immediately. Delete this file to restore the default.',
			'```',
		].filter(Boolean).join('\n');
	}

	private clearOverrideCaches(): void {
		this.overrideCache.clear();
		this.overrideCompiledCache.clear();
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

	/**
	 * Strips the prompt-meta documentation block from override file content.
	 * Block must start at the first line. Content after closing fence is the template.
	 */
	private stripPromptMeta(content: string): string {
		const lines = content.split('\n');
		const firstLine = lines[0]?.trim();
		if (!firstLine?.startsWith('```prompt-meta')) {
			return content;
		}
		const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '```');
		if (closeIndex === -1) {
			return content;
		}
		return lines.slice(closeIndex + 1).join('\n').trimStart();
	}
}
