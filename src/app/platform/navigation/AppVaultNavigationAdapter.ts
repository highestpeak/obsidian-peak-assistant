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

import { App, MarkdownView, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import type {
	OpenVaultPathAtLocationOptions,
	OpenVaultPathAtLineOptions,
	VaultNavigationOpenOptions,
	VaultNavigationPort,
} from '@/core/ports/VaultNavigationPort';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerDocumentRouter } from '@/app/composer/ComposerDocumentRouter';
import { revealMarkdownLocation } from '@/app/composer/DocumentLocationReveal';
import { hubIdFromVirtualPath } from '@/service/hub/HubRecordStore';

function isFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export class AppVaultNavigationAdapter implements VaultNavigationPort {
	constructor(
		private readonly app: App,
		private readonly getComposerRouter: () => ComposerDocumentRouter | null = () => null,
		private readonly openVirtualHub: (hubId: string) => Promise<void> = async () => {},
	) {}

	async openLink(path: string, opts: VaultNavigationOpenOptions = {}): Promise<void> {
		const virtualHubId = hubIdFromVirtualPath(path);
		if (virtualHubId) {
			await this.openVirtualHub(virtualHubId);
			return;
		}
		const newLeaf = opts.newLeaf ?? 'tab';
		const sourcePath = opts.sourcePath ?? this.app.workspace.getActiveFile()?.path ?? '';
		const { linkPath, fragment } = splitVaultLinkTarget(path);
		const direct = this.app.vault.getAbstractFileByPath(linkPath || sourcePath);
		const file = isFile(direct)
			? direct
			: this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		if (isFile(file)) {
			const line = fragment ? this.sourceLineForFragment(file, fragment) : null;
			if (line !== null) {
				await this.openVaultPathAtLocation(file.path, {
					newLeaf,
					location: { line },
				});
				return;
			}
			if (await this.openMarkdownThroughPolicy(file, newLeaf, 'wikilink')) return;
			await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
			return;
		}
		// Fallback for unresolved paths / wikilink targets — let Obsidian's
		// metadata cache figure it out.
		await this.app.workspace.openLinkText(path, sourcePath, newLeaf as any);
	}

	async openVaultPath(path: string, opts: VaultNavigationOpenOptions = {}): Promise<boolean> {
		const virtualHubId = hubIdFromVirtualPath(path);
		if (virtualHubId) {
			await this.openVirtualHub(virtualHubId);
			return true;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) return false;
		const newLeaf = opts.newLeaf ?? false;
		if (await this.openMarkdownThroughPolicy(file, newLeaf, 'search')) return true;
		await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
		return true;
	}

	async openVaultPathAtLine(path: string, opts: OpenVaultPathAtLineOptions): Promise<void> {
		await this.openVaultPathAtLocation(path, {
			...opts,
			location: { line: opts.line },
		});
	}

	async openVaultPathAtLocation(
		path: string,
		opts: OpenVaultPathAtLocationOptions,
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!isFile(file)) {
			console.warn(`[vault-nav] File not found: ${path}`);
			return false;
		}
		const newLeaf = opts.newLeaf ?? false;
		const router = this.getComposerRouter();
		if (file.extension === 'md' && router && newLeaf !== 'window') {
			const revealed = await router.revealLocation({
				filePath: file.path,
				location: opts.location,
				disposition: newLeaf === true || newLeaf === 'tab' ? 'new-tab' : 'reuse-existing',
				reason: 'search',
			});
			if (revealed) return true;
		}
		const leaf = this.app.workspace.getLeaf(newLeaf as any);
		await leaf.openFile(file);

		// Non-Markdown and detached-window fallbacks remain native. Give an
		// available Markdown editor one brief mount boundary before locating.
		await new Promise((resolve) => setTimeout(resolve, 100));
		return leaf.view instanceof MarkdownView
			? revealMarkdownLocation(leaf.view, opts.location)
			: false;
	}

	async openSearchResult(
		item: SearchResultItem | string,
		opts: VaultNavigationOpenOptions = {},
	): Promise<void> {
		if (typeof item === 'object' && item.loc?.line) {
			await this.openVaultPathAtLocation(item.path, {
				...opts,
				location: { line: item.loc.line - 1 },
			});
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

	private sourceLineForFragment(file: TFile, fragment: string): number | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return null;
		const decoded = safeDecodeURIComponent(fragment);
		if (decoded.startsWith('^')) {
			const block = cache.blocks?.[decoded.slice(1)];
			return block ? Math.max(0, block.position.start.line) : null;
		}
		const heading = cache.headings?.find(
			(candidate) => normalizeHeadingFragment(candidate.heading) === normalizeHeadingFragment(decoded),
		);
		return heading ? Math.max(0, heading.position.start.line) : null;
	}
}

function splitVaultLinkTarget(target: string): { linkPath: string; fragment: string | null } {
	const index = target.indexOf('#');
	if (index < 0) return { linkPath: target, fragment: null };
	return {
		linkPath: target.slice(0, index),
		fragment: target.slice(index + 1) || null,
	};
}

function normalizeHeadingFragment(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
