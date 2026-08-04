// T11B / T11Y-7d: concrete custom prompt source — scans the configured
// Obsidian folder, reads each markdown file, and parses it via the
// service-side {@link parseCustomPromptFile}. Service code never imports
// Obsidian `App` / `TFile` / `TFolder` / `normalizePath` for custom
// prompts.
//
// T11Y-7d (2026-06-30): the Copilot action runtime is the sole consumer
// of this adapter today, so it lives next to its composer. The shared
// {@link CustomPromptSourcePort} contract still lives in core/ports, so
// future consumers can construct their own source without coupling to
// this adapter's location.

import { type App, type EventRef, TFile, TFolder, normalizePath } from 'obsidian';
import {
	normalizeCustomPromptSlug,
	parseCustomPromptFile,
	type CustomPromptDef,
} from '@/service/copilot/CustomPromptRegistry';
import type { CustomPromptEditorPort } from '@/core/ports/CustomPromptSourcePort';
import { ensureFolderRecursive } from '@/core/storage/vault/vault-ops';

export interface ObsidianCustomPromptSourceAdapterOptions {
	app: App;
	/** Resolve the configured custom prompts folder at call time so a settings change is picked up. */
	resolveFolder: () => string;
}

export class ObsidianCustomPromptSourceAdapter implements CustomPromptEditorPort {
	constructor(private readonly opts: ObsidianCustomPromptSourceAdapterOptions) {}

	async loadAll(): Promise<CustomPromptDef[]> {
		const { app, resolveFolder } = this.opts;
		const folder = resolveFolder();
		const normalizedFolder = normalizePath(folder);
		const folderRef = app.vault.getAbstractFileByPath(normalizedFolder);
		if (!folderRef || !(folderRef instanceof TFolder)) return [];

		const files = folderRef.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md',
		);

		const defs: CustomPromptDef[] = [];
		for (const file of files) {
			try {
				const content = await app.vault.cachedRead(file);
				const parsed = parseCustomPromptFile(file.basename, file.path, content);
				if (parsed) defs.push(parsed);
			} catch (e) {
				console.warn(`[ObsidianCustomPromptSourceAdapter] Failed to parse ${file.path}:`, e);
			}
		}
		return defs;
	}

	/**
	 * Notify the runtime only when a direct markdown child of the configured
	 * Custom Prompts folder changes. `loadAll()` deliberately scans that same
	 * one-level scope, so watching arbitrary Vault changes or nested files
	 * would cause reloads without changing the action catalog.
	 */
	watch(onChange: () => void): () => void {
		const notifyIfRelevant = (path: string, oldPath?: string): void => {
			if (!this.isDirectPromptFile(path) && !(oldPath && this.isDirectPromptFile(oldPath))) return;
			onChange();
		};
		const { app } = this.opts;
		const refs: EventRef[] = [
			app.vault.on('create', (file) => notifyIfRelevant(file.path)),
			app.vault.on('modify', (file) => notifyIfRelevant(file.path)),
			app.vault.on('delete', (file) => notifyIfRelevant(file.path)),
			app.vault.on('rename', (file, oldPath) => notifyIfRelevant(file.path, oldPath)),
		];
		return () => refs.forEach((ref) => app.vault.offref(ref));
	}

	async create(input: {
		label: string;
		description?: string;
		category?: CustomPromptDef['category'];
		template: string;
		modelId?: string;
	}): Promise<CustomPromptDef> {
		const folder = normalizePath(this.opts.resolveFolder());
		const label = input.label.trim();
		const template = input.template.trim();
		if (!label) throw new Error('A Custom Prompt needs a name.');
		if (!template) throw new Error('A Custom Prompt cannot be empty.');
		await this.ensureFolder(folder);
		const slug = normalizeCustomPromptSlug(label);
		const filePath = normalizePath(`${folder}/${slug}.md`);
		if (this.opts.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error(`A Custom Prompt named "${label}" already exists.`);
		}
		await this.opts.app.vault.create(filePath, this.serialize(input));
		return this.requireParsed(filePath, label, this.serialize(input));
	}

	async update(input: {
		filePath: string;
		label: string;
		description?: string;
		category?: CustomPromptDef['category'];
		template: string;
		modelId?: string;
	}): Promise<CustomPromptDef> {
		const file = this.opts.app.vault.getAbstractFileByPath(normalizePath(input.filePath));
		if (!(file instanceof TFile)) throw new Error('This Custom Prompt no longer exists.');
		const label = input.label.trim();
		const template = input.template.trim();
		if (!label) throw new Error('A Custom Prompt needs a name.');
		if (!template) throw new Error('A Custom Prompt cannot be empty.');
		const content = this.serialize(input);
		const folder = normalizePath(this.opts.resolveFolder());
		const nextPath = normalizePath(`${folder}/${normalizeCustomPromptSlug(label)}.md`);
		const existing = this.opts.app.vault.getAbstractFileByPath(nextPath);
		if (existing && existing !== file) {
			throw new Error(`A Custom Prompt named "${label}" already exists.`);
		}
		if (file.path !== nextPath) await this.opts.app.vault.rename(file, nextPath);
		await this.opts.app.vault.modify(file, content);
		return this.requireParsed(nextPath, label, content);
	}

	async delete(filePath: string): Promise<void> {
		const file = this.opts.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (!(file instanceof TFile) || !this.isDirectPromptFile(file.path)) {
			throw new Error('This Custom Prompt no longer exists in the configured folder.');
		}
		await this.opts.app.vault.delete(file);
	}

	private async ensureFolder(folder: string): Promise<void> {
		const current = this.opts.app.vault.getAbstractFileByPath(folder);
		if (current instanceof TFolder) return;
		if (current) throw new Error('The Custom Prompts path is not a folder.');
		await ensureFolderRecursive(folder, this.opts.app);
	}

	private serialize(input: {
		label: string;
		description?: string;
		category?: CustomPromptDef['category'];
		template: string;
		modelId?: string;
	}): string {
		const frontmatter = [
			'---',
			`description: ${JSON.stringify(input.description?.trim() ?? '')}`,
			`category: ${input.category ?? 'writing'}`,
			input.modelId?.trim() ? `model: ${JSON.stringify(input.modelId.trim())}` : null,
			'---',
		].filter(Boolean).join('\n');
		return `${frontmatter}\n\n${input.template.trim()}\n`;
	}

	private requireParsed(filePath: string, label: string, content: string): CustomPromptDef {
		const parsed = parseCustomPromptFile(label, filePath, content);
		if (!parsed) throw new Error('The Custom Prompt could not be parsed after saving.');
		return parsed;
	}

	private isDirectPromptFile(path: string): boolean {
		const normalizedPath = normalizePath(path);
		if (!normalizedPath.toLowerCase().endsWith('.md')) return false;
		const separator = normalizedPath.lastIndexOf('/');
		const parentPath = separator < 0 ? '' : normalizedPath.slice(0, separator);
		return parentPath === normalizePath(this.opts.resolveFolder());
	}
}
