/**
 * File Atlas — host port composition (app layer).
 *
 * Builds the {@link FileAtlasHostPort} the standalone File Atlas surface needs
 * from the Obsidian runtime: enumerating file-backed Markdown / Composer tabs,
 * reading recent-use signals, revealing a line, clipboard, and resolving image
 * resources. Runtime ownership stays in the app layer — the UI only sees the port.
 *
 * `loadNeighborhood` (the read-only graph data) is intentionally omitted here;
 * it lands with the graph subview slice that reuses the vault Result Graph.
 */

import { MarkdownView, Notice, TFile } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import type {
	AtlasGraphData,
	AtlasGraphEdge,
	AtlasGraphNode,
	AtlasImageInfo,
	FileAtlasHostPort,
	OpenDocMeta,
} from '@/ui/view/file-atlas/FileAtlasHostPort';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getConnectedLinks, getDiscoveredConnections } from '@/service/search/inspectorService';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from '@/app/composer/viewType';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';

/** Neighborhood node cap — matches the Result Graph's NODE_CAP so both stay legible. */
const NEIGHBORHOOD_CAP = 60;

function basenameOf(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

/** Strip `![[ ]]` / `![]()` wrappers and any `|alias` so we have a bare link target. */
function cleanImageTarget(raw: string): string {
	return raw
		.replace(/^!?\[\[/, '')
		.replace(/\]\]$/, '')
		.replace(/^!\[[^\]]*\]\(/, '')
		.replace(/\)$/, '')
		.split('|')[0]
		.trim();
}

export function composeFileAtlasHost(appContext: AppContext): FileAtlasHostPort {
	const app = appContext.app;
	const sessionViews = new Map<string, { lastViewedAt: number; viewCount: number }>();
	let lastActivePath: string | null = null;

	const sourcePathForView = (view: unknown): string | null => {
		if (view instanceof MarkdownView) return view.file?.path ?? null;
		const sourceAwareView = view as { getSourceFilePath?: () => string | null };
		return sourceAwareView?.getSourceFilePath?.() ?? null;
	};

	const fileContextLeaves = (): Array<{
		path: string;
		active: boolean;
		view: 'markdown' | 'composer';
		detach: () => void;
		reveal: () => Promise<void>;
	}> => {
		const activeLeaf = app.workspace.activeLeaf;
		const preferredView = activeLeaf?.view instanceof MarkdownView
			? 'markdown'
			: activeLeaf?.getViewState().type === DOCUMENT_COMPOSER_VIEW_TYPE
				? 'composer'
				: null;
		const leaves = [
			...app.workspace.getLeavesOfType('markdown'),
			...app.workspace.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE),
		];
		return leaves.flatMap((leaf) => {
			const path = sourcePathForView(leaf.view);
			if (!path) return [];
			const view: 'markdown' | 'composer' =
				leaf.view instanceof MarkdownView ? 'markdown' : 'composer';
			return [{
				path,
				active: leaf === activeLeaf,
				view,
				detach: () => leaf.detach(),
				reveal: () => app.workspace.revealLeaf(leaf),
			}];
		}).sort((a, b) =>
			Number(b.active) - Number(a.active)
			|| Number(b.view === preferredView) - Number(a.view === preferredView));
	};

	const activeFileContextPath = (): string | null => {
		const activeLeafPath = sourcePathForView(app.workspace.activeLeaf?.view);
		return activeLeafPath ?? app.workspace.getActiveFile()?.path ?? null;
	};

	const recordActiveView = (): void => {
		const path = activeFileContextPath();
		if (!path || path === lastActivePath) return;
		lastActivePath = path;
		const current = sessionViews.get(path);
		sessionViews.set(path, {
			lastViewedAt: Date.now(),
			viewCount: (current?.viewCount ?? 0) + 1,
		});
	};

	recordActiveView();

	const resolveImageFile = (target: string, sourcePath: string): TFile | null => {
		const clean = cleanImageTarget(target);
		const dest = app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
		if (dest) return dest;
		const byPath = app.vault.getAbstractFileByPath(clean);
		return byPath instanceof TFile ? byPath : null;
	};

	return {
		getActiveDocumentPath(): string | null {
			return activeFileContextPath();
		},

		listOpenDocs(): OpenDocMeta[] {
			const seen = new Set<string>();
			const docs: OpenDocMeta[] = [];
			for (const leaf of fileContextLeaves()) {
				if (seen.has(leaf.path)) continue;
				const file = app.vault.getAbstractFileByPath(leaf.path);
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') continue;
				seen.add(file.path);
				const session = sessionViews.get(file.path);
				docs.push({
					path: file.path,
					title: file.basename,
					open: true,
					active: leaf.active,
					lastViewedAt: session?.lastViewedAt ?? 0,
					viewCount: session?.viewCount ?? 0,
				});
			}
			return docs;
		},

		async listHistoryDocs(limit: number): Promise<OpenDocMeta[]> {
			const safeLimit = Math.max(1, limit);
			const byPath = new Map<string, OpenDocMeta>();

			if (sqliteStoreManager.isInitialized()) {
				const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
				const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
				const [recent, frequent] = await Promise.all([
					mobiusNodeRepo.getRecent(safeLimit),
					mobiusNodeRepo.getMostUsed(safeLimit),
				]);
				const signals = new Map<string, { lastOpenTs: number; openCount: number }>();
				for (const row of [...recent, ...frequent]) {
					const current = signals.get(row.docId);
					signals.set(row.docId, {
						lastOpenTs: Math.max(current?.lastOpenTs ?? 0, row.lastOpenTs),
						openCount: Math.max(current?.openCount ?? 0, row.openCount),
					});
				}
				const metadata = await indexedDocumentRepo.getByIds([...signals.keys()]);
				for (const meta of metadata) {
					if (!meta.path.toLowerCase().endsWith('.md')) continue;
					const file = app.vault.getAbstractFileByPath(meta.path);
					if (!(file instanceof TFile)) continue;
					const signal = signals.get(meta.id);
					byPath.set(file.path, {
						path: file.path,
						title: file.basename,
						open: false,
						active: false,
						lastViewedAt: signal?.lastOpenTs ?? 0,
						viewCount: signal?.openCount ?? 0,
					});
				}
			}

			const workspaceWithHistory = app.workspace as typeof app.workspace & {
				getLastOpenFiles?: () => string[];
			};
			let fallbackPaths: string[] = [];
			try {
				fallbackPaths = workspaceWithHistory.getLastOpenFiles?.() ?? [];
			} catch {
				fallbackPaths = [];
			}
			const fallbackNow = Date.now();
			for (const [index, path] of fallbackPaths.entries()) {
				if (byPath.has(path)) continue;
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') continue;
				byPath.set(path, {
					path,
					title: file.basename,
					open: false,
					active: false,
					lastViewedAt: fallbackNow - index,
					viewCount: 0,
				});
			}

			for (const [path, session] of sessionViews) {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') continue;
				const current = byPath.get(path);
				byPath.set(path, {
					path,
					title: file.basename,
					open: current?.open ?? false,
					active: current?.active ?? false,
					lastViewedAt: Math.max(current?.lastViewedAt ?? 0, session.lastViewedAt),
					viewCount: Math.max(current?.viewCount ?? 0, session.viewCount),
				});
			}

			return [...byPath.values()];
		},

		subscribeOpenDocs(cb: () => void): () => void {
			const onWorkspaceChange = (): void => {
				recordActiveView();
				cb();
			};
			const wsRefs = [
				app.workspace.on('layout-change', onWorkspaceChange),
				app.workspace.on('active-leaf-change', onWorkspaceChange),
				app.workspace.on('file-open', onWorkspaceChange),
			];
			const vRef = app.vault.on('rename', onWorkspaceChange);
			return () => {
				wsRefs.forEach((r) => app.workspace.offref(r));
				app.vault.offref(vRef);
			};
		},

		async readDoc(path: string): Promise<string> {
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile ? app.vault.cachedRead(file) : '';
		},

		async activateDoc(path: string): Promise<void> {
			for (const leaf of fileContextLeaves()) {
				if (leaf.path !== path) continue;
				await leaf.reveal();
				recordActiveView();
				return;
			}

			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return;
			const router = appContext.runtimeRegistry.tryGetDocumentComposerRuntime()?.navigation;
			if (router && file.extension === 'md') {
				await router.open({
					filePath: file.path,
					disposition: 'new-tab',
					reason: 'file-atlas',
				});
				recordActiveView();
				return;
			}
			let leaf;
			try {
				leaf = app.workspace.getLeaf('tab');
			} catch {
				leaf = app.workspace.getLeaf(false);
			}
			await leaf.openFile(file, { active: true });
			recordActiveView();
		},

		openLink(target: string, sourcePath: string, external: boolean): void {
			if (external) {
				appContext.vaultNavigation.openExternalUrl(target);
				return;
			}
			// `openLinkText` resolves wikilink targets (note / note#heading / note#^block)
			// relative to the source note, matching Obsidian's own link navigation.
			void appContext.vaultNavigation.openLink(target, { sourcePath, newLeaf: false });
		},

		closeDoc(path: string): void {
			for (const leaf of fileContextLeaves()) {
				if (leaf.path === path) leaf.detach();
			}
		},

		async revealLocation(path: string, location: DocumentSourceLocation): Promise<boolean> {
			return appContext.vaultNavigation.openVaultPathAtLocation(path, {
				location,
				newLeaf: false,
			});
		},

		getCursorLine(path: string): number | null {
			const composerLeaves = app.workspace
				.getLeavesOfType(DOCUMENT_COMPOSER_VIEW_TYPE)
				.sort((left, right) =>
					Number(right === app.workspace.activeLeaf) - Number(left === app.workspace.activeLeaf));
			for (const leaf of composerLeaves) {
				const view = leaf.view as {
					getSourceFilePath?: () => string | null;
					getCursorLine?: () => number | null;
				};
				if (view.getSourceFilePath?.() !== path) continue;
				const line = view.getCursorLine?.();
				if (typeof line === 'number') return line;
			}
			// Read the last cursor position from the note's open editor (works even
			// when File Atlas is the frontmost modal). Editor lines are 0-based; anchor
			// line ranges are 1-based, so shift up by one to match.
			for (const leaf of app.workspace.getLeavesOfType('markdown')) {
				const view = leaf.view as MarkdownView | undefined;
				if (view?.file?.path !== path) continue;
				const line = view.editor?.getCursor()?.line;
				return typeof line === 'number' ? line + 1 : null;
			}
			return null;
		},

		copyToClipboard(text: string): void {
			void navigator.clipboard?.writeText(text);
		},

		notify(message: string): void {
			new Notice(message);
		},

		async resolveImage(target: string, sourcePath: string): Promise<AtlasImageInfo | null> {
			const file = resolveImageFile(target, sourcePath);
			if (!file) return null;
			let sizeBytes: number | null = null;
			try {
				const stat = await app.vault.adapter.stat(file.path);
				sizeBytes = stat?.size ?? null;
			} catch {
				sizeBytes = null;
			}
			return { src: app.vault.getResourcePath(file), sizeBytes, format: file.extension.toUpperCase() };
		},

		async copyImage(target: string, sourcePath: string): Promise<void> {
			const file = resolveImageFile(target, sourcePath);
			if (!file) {
				new Notice('Image not found in vault.');
				return;
			}
			try {
				const buf = await app.vault.readBinary(file);
				const ext = file.extension.toLowerCase();
				const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
				const blob = new Blob([buf], { type });
				await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
			} catch {
				new Notice('Copying images to the clipboard is not supported here.');
			}
		},

		async loadNeighborhood(
			path: string,
			opts: { hops: 1 | 2; semantic: boolean },
		): Promise<AtlasGraphData> {
			if (!sqliteStoreManager.isInitialized()) return { nodes: [], edges: [] };

			const nodes = new Map<string, AtlasGraphNode>();
			const edges: AtlasGraphEdge[] = [];
			nodes.set(path, { id: path, label: basenameOf(path), hop: 0, path });

			const addNode = (p: string, hop: 1 | 2): boolean => {
				if (nodes.has(p)) return true;
				if (nodes.size >= NEIGHBORHOOD_CAP) return false;
				nodes.set(p, { id: p, label: basenameOf(p), hop, path: p, sub: `Vault note · ${hop}-hop` });
				return true;
			};
			const addEdge = (from: string, to: string, kind: AtlasGraphEdge['kind']): void => {
				if (nodes.has(from) && nodes.has(to)) edges.push({ from, to, kind });
			};

			// 1-hop reference links.
			const oneHop = await getConnectedLinks(path).catch(() => []);
			const firstRing: string[] = [];
			for (const link of oneHop) {
				if (link.path === path) continue;
				if (addNode(link.path, 1)) {
					addEdge(path, link.path, 'reference');
					firstRing.push(link.path);
				}
			}

			// Optional semantic (index-discovered) edges.
			if (opts.semantic) {
				const discovered = await getDiscoveredConnections(path).catch(() => []);
				for (const d of discovered) {
					if (d.type !== 'SEM' || d.path === path) continue;
					if (addNode(d.path, 1)) addEdge(path, d.path, 'semantic');
				}
			}

			// 2-hop expansion off the reference ring.
			if (opts.hops === 2) {
				for (const src of firstRing) {
					if (nodes.size >= NEIGHBORHOOD_CAP) break;
					const neighbors = await getConnectedLinks(src).catch(() => []);
					for (const n of neighbors) {
						if (n.path === path || n.path === src) continue;
						if (addNode(n.path, 2)) addEdge(src, n.path, 'reference');
					}
				}
			}

			return { nodes: [...nodes.values()], edges };
		},
	};
}
