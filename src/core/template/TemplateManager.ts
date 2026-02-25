import type { CompiledTemplate } from '@/core/template-engine-helper';
import { compileTemplate } from '@/core/template-engine-helper';
import type { TemplateId } from '@/core/template/TemplateRegistry';
import {
	getTemplateMetadata,
	TEMPLATE_METADATA,
	type TemplateMetadata,
} from '@/core/template/TemplateRegistry';

/**
 * Loads raw template content by path. Implementations may read from plugin dir or vault.
 */
export interface TemplateContentProvider {
	load(relativePath: string): Promise<string>;
}

/**
 * On-demand template loader with caching and Handlebars rendering.
 * Use clear() on plugin unload to release memory.
 */
export class TemplateManager {
	private readonly contentCache = new Map<TemplateId, string>();
	private readonly compiledCache = new Map<TemplateId, CompiledTemplate>();
	private customOverrides: Partial<Record<TemplateId, string>> = {};

	constructor(
		private readonly provider: TemplateContentProvider,
		customOverrides?: Partial<Record<TemplateId, string>>,
	) {
		if (customOverrides) this.customOverrides = customOverrides;
	}

	/** Set user overrides (e.g. from settings). Replaces existing overrides. */
	setCustomOverrides(overrides: Partial<Record<TemplateId, string>>): void {
		this.customOverrides = overrides;
	}

	/**
	 * Get raw template content. Checks overrides, then cache, then loads via provider.
	 */
	async getTemplate(id: TemplateId): Promise<string> {
		const override = this.customOverrides[id];
		if (override !== undefined && override !== '') return override;

		const cached = this.contentCache.get(id);
		if (cached !== undefined) return cached;

		const meta = getTemplateMetadata(id);
		const content = await this.provider.load(meta.path);
		const trimmed = content.trim();
		this.contentCache.set(id, trimmed);
		return trimmed;
	}

	/**
	 * Render template with Handlebars. Compilation result is cached by id.
	 */
	async render(id: TemplateId, data: Record<string, unknown> = {}): Promise<string> {
		const raw = await this.getTemplate(id);
		let compiled = this.compiledCache.get(id);
		if (!compiled) {
			compiled = compileTemplate(raw);
			this.compiledCache.set(id, compiled);
		}
		return compiled(data).trim();
	}

	/** Metadata for a template (path, category, options). */
	getMetadata(id: TemplateId): TemplateMetadata {
		return getTemplateMetadata(id);
	}

	/** Whether this id is registered (including prompts). */
	has(id: string): id is TemplateId {
		return id in TEMPLATE_METADATA;
	}

	/** Clear all caches. Call on plugin unload. */
	clear(): void {
		this.contentCache.clear();
		this.compiledCache.clear();
	}
}
