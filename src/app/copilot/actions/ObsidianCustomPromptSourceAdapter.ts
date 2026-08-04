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
	parseCustomPromptFile,
	type CustomPromptDef,
} from '@/service/copilot/CustomPromptRegistry';
import type { CustomPromptSourcePort } from '@/core/ports/CustomPromptSourcePort';

export interface ObsidianCustomPromptSourceAdapterOptions {
	app: App;
	/** Resolve the configured custom prompts folder at call time so a settings change is picked up. */
	resolveFolder: () => string;
}

export class ObsidianCustomPromptSourceAdapter implements CustomPromptSourcePort {
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

	private isDirectPromptFile(path: string): boolean {
		const normalizedPath = normalizePath(path);
		if (!normalizedPath.toLowerCase().endsWith('.md')) return false;
		const separator = normalizedPath.lastIndexOf('/');
		const parentPath = separator < 0 ? '' : normalizedPath.slice(0, separator);
		return parentPath === normalizePath(this.opts.resolveFolder());
	}
}
