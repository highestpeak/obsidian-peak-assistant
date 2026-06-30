// T11M: Concrete Obsidian implementation of `CopilotPanelVaultPort`.
//
// This is the ONLY place that closes over `app.vault.*`, `app.workspace.*`,
// and `app.fileManager.*` for the Copilot result-panel write surface. UI
// panels consume operations like `appendToFile` / `applyArtifacts` /
// `writeFrontmatterTags` and never see the raw Obsidian primitives.
//
// The adapter is constructed once at plugin boot
// (`src/app/copilot/panels/composeCopilotPanelVault.ts`) and bound onto
// `AppContext` so the React `ServiceProvider` can publish it through
// `useServiceContext().copilotPanelVault`.

import type { App, TFile, TFolder } from 'obsidian';
import { Notice } from 'obsidian';
import type { CopilotPanelVaultPort } from '@/core/ports/CopilotPanelPorts';
import {
	applyCopilotArtifactsToContext,
	type ApplyCopilotArtifactsOps,
} from '@/service/copilot/CopilotArtifactApply';
import { writeTagsToFrontmatter } from '@/service/copilot/frontmatterTagWriter';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { CopilotRunArtifacts } from '@/service/copilot/CopilotRunArtifacts';

function isFolder(f: unknown): f is TFolder {
	return !!f && typeof f === 'object' && 'children' in (f as Record<string, unknown>);
}

function isFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export class AppCopilotPanelVaultAdapter implements CopilotPanelVaultPort {
	constructor(private readonly app: App) {}

	findFileByPath(path: string): TFile | null {
		const f = this.app.vault.getAbstractFileByPath(path);
		return isFile(f) ? f : null;
	}

	getActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	readFileContent(file: TFile): Promise<string> {
		return this.app.vault.cachedRead(file);
	}

	replaceFileContent(file: TFile, content: string): Promise<void> {
		return this.app.vault.modify(file, content);
	}

	async appendToFile(file: TFile, text: string): Promise<void> {
		const current = await this.app.vault.read(file);
		const separator = current.endsWith('\n') ? '' : '\n';
		await this.app.vault.modify(file, current + separator + text);
	}

	async appendToFileAtPath(path: string, text: string): Promise<boolean> {
		const file = this.findFileByPath(path);
		if (!file) return false;
		const content = await this.app.vault.read(file);
		const newContent = content.trimEnd() + '\n\n' + text + '\n';
		await this.app.vault.modify(file, newContent);
		return true;
	}

	async createNoteInFolder(folder: string, title: string, content: string): Promise<string> {
		const existing = this.app.vault.getAbstractFileByPath(folder);
		if (!existing) await this.app.vault.createFolder(folder);
		else if (!isFolder(existing)) throw new Error(`Path exists but is not a folder: ${folder}`);
		const path = `${folder}/${title}.md`;
		await this.app.vault.create(path, content);
		return path;
	}

	applyArtifacts(input: {
		ctx: DocumentContext;
		artifacts: CopilotRunArtifacts;
		selectedOnly?: boolean;
	}): Promise<{ appliedBlocks: number }> {
		const ops: ApplyCopilotArtifactsOps = {
			readFile: (file) => this.app.vault.read(file),
			writeFile: (file, text) => this.app.vault.modify(file, text),
			getEditorSelection: () => {
				const editor = this.app.workspace.activeEditor?.editor;
				if (!editor) return null;
				return editor.getSelection();
			},
			replaceEditorSelection: (text) => {
				const editor = this.app.workspace.activeEditor?.editor;
				editor?.replaceSelection(text);
			},
		};
		return applyCopilotArtifactsToContext({ ...input, ops });
	}

	writeFrontmatterTags(file: TFile, tags: string[]): Promise<void> {
		return writeTagsToFrontmatter(
			file,
			tags,
			(f, mutator) => this.app.fileManager.processFrontMatter(f, mutator),
		);
	}

	trashFile(file: TFile): Promise<void> {
		return this.app.vault.trash(file, true);
	}

	async openNote(path: string, opts?: { newLeaf?: boolean | 'tab' | 'window' }): Promise<void> {
		const file = this.findFileByPath(path);
		const newLeaf = opts?.newLeaf ?? 'tab';
		if (file) {
			await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
			return;
		}
		// Fallback for non-existent paths or wikilinks — let Obsidian resolve.
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? '';
		try {
			await this.app.workspace.openLinkText(path, sourcePath, newLeaf as any);
		} catch (e) {
			new Notice(`Failed to open: ${path}`);
			throw e;
		}
	}
}
