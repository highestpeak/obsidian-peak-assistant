/**
 * Peak Composer — Obsidian adapters for the service ports (WP1).
 *
 * This is the ONE composer file allowed to touch Obsidian's vault/workspace.
 * It maps Obsidian events onto the framework-neutral `ComposerFileEventsPort`
 * and `ComposerSourcePort` the controller consumes. All DOM/event wiring here
 * is workspace-level (not window-level), so detached popouts are unaffected.
 */

import type { App, EventRef, TAbstractFile, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import type { ComposerFileEvent, ComposerFileEventsPort, ComposerSourcePort } from '@/service/composer';

/** Reads document bytes via the vault's cached read. */
export class ObsidianComposerSourceAdapter implements ComposerSourcePort {
	constructor(private readonly app: App) {}

	async readSource(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof ObsidianTFile)) {
			throw new Error(`Composer source not found: ${filePath}`);
		}
		return this.app.vault.cachedRead(file);
	}
}

const MARKDOWN_EXT = 'md';

/**
 * Bridges Obsidian workspace/vault events to the composer file-events port.
 * `dispose()` detaches every registered `EventRef` so a hot-reloaded bundle
 * does not leak listeners.
 */
export class ObsidianComposerFileEventsAdapter implements ComposerFileEventsPort {
	private readonly refs: EventRef[] = [];

	constructor(private readonly app: App) {}

	getActiveFilePath(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file && file.extension === MARKDOWN_EXT ? file.path : null;
	}

	onActiveFileChange(cb: (path: string | null) => void): () => void {
		const handler = (): void => cb(this.getActiveFilePath());
		const ref = this.app.workspace.on('active-leaf-change', handler);
		this.refs.push(ref);
		return () => this.app.workspace.offref(ref);
	}

	onFileEvent(cb: (event: ComposerFileEvent) => void): () => void {
		const modifyRef = this.app.vault.on('modify', (file: TAbstractFile) => {
			if (isMarkdown(file)) cb({ type: 'modify', path: file.path });
		});
		const renameRef = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			if (isMarkdown(file)) cb({ type: 'rename', path: file.path, oldPath });
		});
		const deleteRef = this.app.vault.on('delete', (file: TAbstractFile) => {
			if (isMarkdown(file)) cb({ type: 'delete', path: file.path });
		});
		this.refs.push(modifyRef, renameRef, deleteRef);
		return () => {
			this.app.vault.offref(modifyRef);
			this.app.vault.offref(renameRef);
			this.app.vault.offref(deleteRef);
		};
	}

	dispose(): void {
		for (const ref of this.refs) {
			this.app.vault.offref(ref);
			this.app.workspace.offref(ref);
		}
		this.refs.length = 0;
	}
}

function isMarkdown(file: TAbstractFile): file is TFile {
	return file instanceof ObsidianTFile && file.extension === MARKDOWN_EXT;
}
