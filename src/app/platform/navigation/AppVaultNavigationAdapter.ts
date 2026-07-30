// T11N: Concrete Obsidian implementation of `VaultNavigationPort`. The
// only place in the codebase that closes over `app.workspace.openLinkText`
// for the non-Copilot UI surface (BriefingCard, PushCard, chat-view
// OpenLink event, VaultAutoRunModal history helper).
//
// T11P (Track D): Adapter now also fulfils the user-level vault
// navigation actions that replaced the legacy `view-utils.ts`,
// `vault-utils.openAttachment`, `obsidian-utils.openFileAtLine`, and the
// search `createOpenSourceCallback`. Adapter may use raw Obsidian
// primitives internally — the port intentionally hides them.

import { App, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import type {
	OpenVaultPathAtLineOptions,
	VaultNavigationOpenOptions,
	VaultNavigationPort,
} from '@/core/ports/VaultNavigationPort';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerDocumentRouter } from '@/app/composer/ComposerDocumentRouter';

function isFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export class AppVaultNavigationAdapter implements VaultNavigationPort {
	constructor(
		private readonly app: App,
		private readonly getComposerRouter: () => ComposerDocumentRouter | null = () => null,
	) {}

	async openLink(path: string, opts: VaultNavigationOpenOptions = {}): Promise<void> {
		const newLeaf = opts.newLeaf ?? 'tab';
		const sourcePath = opts.sourcePath ?? this.app.workspace.getActiveFile()?.path ?? '';
		const file = this.app.vault.getAbstractFileByPath(path);
		if (isFile(file)) {
			if (await this.openMarkdownThroughPolicy(file, newLeaf, 'wikilink')) return;
			await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
			return;
		}
		// Fallback for unresolved paths / wikilink targets — let Obsidian's
		// metadata cache figure it out.
		await this.app.workspace.openLinkText(path, sourcePath, newLeaf as any);
	}

	async openVaultPath(path: string, opts: VaultNavigationOpenOptions = {}): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) return false;
		const newLeaf = opts.newLeaf ?? false;
		if (await this.openMarkdownThroughPolicy(file, newLeaf, 'search')) return true;
		await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
		return true;
	}

	async openVaultPathAtLine(path: string, opts: OpenVaultPathAtLineOptions): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) {
			console.warn(`[vault-nav] File not found: ${path}`);
			return;
		}
		const newLeaf = opts.newLeaf ?? false;
		const leaf = this.app.workspace.getLeaf(newLeaf as any);
		await leaf.openFile(file);

		// Wait briefly for the editor view to mount before we set the cursor.
		await new Promise((resolve) => setTimeout(resolve, 100));

		const view = leaf.view as any;
		const editor = view?.editor;
		if (!editor || typeof editor.setCursor !== 'function') return;

		let safeLine = opts.line;
		try {
			let lineCount = 0;
			if (typeof editor.lineCount === 'function') {
				lineCount = editor.lineCount();
			} else if (editor.state?.doc) {
				lineCount = editor.state.doc.lines;
			}
			if (lineCount > 0 && safeLine >= lineCount) {
				safeLine = Math.max(0, lineCount - 1);
			}
		} catch (e) {
			console.warn('[vault-nav] line-count probe failed', e);
		}

		try {
			editor.setCursor({ line: safeLine, ch: 0 });
		} catch (e) {
			console.warn('[vault-nav] setCursor failed', e);
		}

		try {
			if (typeof editor.scrollIntoView === 'function') {
				editor.scrollIntoView({ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } }, true);
			}
		} catch (e) {
			console.warn('[vault-nav] scrollIntoView failed', e);
		}
	}

	async openSearchResult(
		item: SearchResultItem | string,
		opts: VaultNavigationOpenOptions = {},
	): Promise<void> {
		if (typeof item === 'object' && item.loc?.line) {
			await this.openVaultPathAtLine(item.path, { ...opts, line: item.loc.line - 1 });
			return;
		}
		const path = typeof item === 'string' ? item : item.path;
		await this.openVaultPath(path, opts);
	}

	openAttachmentSource(href: string): void {
		if (!href) return;
		const cleaned = href.replace(/^\[\[|\]\]$/g, '');
		const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
		void this.app.workspace.openLinkText(normalized, '', true);
	}

	openExternalUrl(url: string): void {
		if (!url) return;
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	async openSourceFile(file: unknown): Promise<boolean> {
		if (!isFile(file)) return false;

		const app = this.app;
		const existingMarkdownLeaves = app.workspace.getLeavesOfType('markdown');
		let centerLeaf: WorkspaceLeaf | null = null;

		if (existingMarkdownLeaves.length > 0) {
			centerLeaf = existingMarkdownLeaves[0];
		} else {
			centerLeaf = app.workspace.getLeaf(false);
		}

		if (!centerLeaf) return false;

		const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: true } as ViewState;
		const fallbackRight: ViewState = { type: 'outline', state: {}, active: true } as ViewState;

		const existingFileExplorerLeaves = app.workspace.getLeavesOfType('file-explorer');
		const leftLeaf = existingFileExplorerLeaves[0] ?? app.workspace.getLeftLeaf(false);
		if (leftLeaf) {
			await leftLeaf.setViewState({ ...fallbackLeft, active: false });
		}

		const existingOutlineLeaves = app.workspace.getLeavesOfType('outline');
		const rightLeaf = existingOutlineLeaves[0] ?? app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({ ...fallbackRight, active: false });
		}

		await centerLeaf.openFile(file);
		await centerLeaf.setViewState({ type: 'markdown', active: true });
		app.workspace.revealLeaf(centerLeaf);
		return true;
	}

	revealFolderInFileExplorer(folderPath: string): void {
		if (!folderPath) return;
		const app = this.app;
		const leaves = app.workspace.getLeavesOfType('file-explorer');
		if (leaves.length === 0) return;
		const leaf = leaves[0];
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (!folder) return;
		// `revealInFolder` isn't part of the public typings but has been
		// stable in Obsidian 1.x — used by countless community plugins.
		const view = leaf.view as unknown as { revealInFolder?: (f: unknown) => void };
		if (typeof view.revealInFolder === 'function') {
			view.revealInFolder(folder);
		}
		app.workspace.revealLeaf(leaf);
	}

	private async openMarkdownThroughPolicy(
		file: TFile,
		newLeaf: boolean | 'tab' | 'window',
		reason: 'wikilink' | 'search',
	): Promise<boolean> {
		if (file.extension !== 'md' || newLeaf === 'window') return false;
		const router = this.getComposerRouter();
		if (!router) return false;
		const disposition =
			newLeaf === 'tab' || newLeaf === true
				? 'new-tab'
				: 'reuse-existing';
		const leaf = await router.open({
			filePath: file.path,
			disposition,
			reason,
		});
		return Boolean(leaf);
	}
}
