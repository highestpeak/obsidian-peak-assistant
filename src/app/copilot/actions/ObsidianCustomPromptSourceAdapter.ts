// T11B: Concrete custom prompt source — scans the configured Obsidian
// folder, reads each markdown file, and parses it via the service-side
// {@link parseCustomPromptFile}. Service code never imports Obsidian
// `App` / `TFile` / `TFolder` / `normalizePath` for custom prompts.

import { type App, TFile, TFolder, normalizePath } from 'obsidian';
import {
	parseCustomPromptFile,
	type CustomPromptDef,
} from '@/service/copilot/CustomPromptRegistry';
import type { CopilotCustomPromptPort } from '@/service/copilot/actions/CopilotActionPorts';

export interface ObsidianCustomPromptSourceAdapterOptions {
	app: App;
	/** Resolve the configured custom prompts folder at call time so a settings change is picked up. */
	resolveFolder: () => string;
}

export class ObsidianCustomPromptSourceAdapter implements CopilotCustomPromptPort {
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
