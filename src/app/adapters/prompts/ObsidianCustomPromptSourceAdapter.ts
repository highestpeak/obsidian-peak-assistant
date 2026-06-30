// T11B / T11Y-7d: concrete custom prompt source — scans the configured
// Obsidian folder, reads each markdown file, and parses it via the
// service-side {@link parseCustomPromptFile}. Service code never imports
// Obsidian `App` / `TFile` / `TFolder` / `normalizePath` for custom
// prompts.
//
// T11Y-7d (2026-06-30): relocated under `src/app/adapters/prompts/`
// because scanning user prompt folders is not a Copilot-action concern
// — it's one consumer. The action runtime now takes the shared
// {@link CustomPromptSourcePort} as input.

import { type App, TFile, TFolder, normalizePath } from 'obsidian';
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
}
