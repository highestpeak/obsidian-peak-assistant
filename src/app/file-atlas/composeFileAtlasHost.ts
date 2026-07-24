/**
 * File Atlas — host port composition (app layer).
 *
 * Builds the {@link FileAtlasHostPort} the standalone File Atlas surface needs
 * from the Obsidian runtime: enumerating open markdown tabs, reading a note,
 * revealing a line, clipboard, and resolving image resources. Runtime ownership
 * stays in the app layer per CLAUDE.md — the UI only ever sees the port.
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

	const resolveImageFile = (target: string, sourcePath: string): TFile | null => {
		const clean = cleanImageTarget(target);
		const dest = app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
		if (dest) return dest;
		const byPath = app.vault.getAbstractFileByPath(clean);
		return byPath instanceof TFile ? byPath : null;
	};

	return {
		listOpenDocs(): OpenDocMeta[] {
			const activeFile = app.workspace.getActiveFile();
			const seen = new Set<string>();
			const docs: OpenDocMeta[] = [];
			for (const leaf of app.workspace.getLeavesOfType('markdown')) {
				const file = (leaf.view as MarkdownView | undefined)?.file;
				if (!file || seen.has(file.path)) continue;
				seen.add(file.path);
				docs.push({ path: file.path, title: file.basename, active: activeFile?.path === file.path });
			}
			return docs;
		},

		subscribeOpenDocs(cb: () => void): () => void {
			const wsRefs = [
				app.workspace.on('layout-change', cb),
				app.workspace.on('active-leaf-change', cb),
			];
			const vRef = app.vault.on('rename', cb);
			return () => {
				wsRefs.forEach((r) => app.workspace.offref(r));
				app.vault.offref(vRef);
			};
		},

		async readDoc(path: string): Promise<string> {
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile ? app.vault.cachedRead(file) : '';
		},

		activateDoc(path: string): void {
			void app.workspace.openLinkText(path, '', false);
		},

		openLink(target: string, sourcePath: string, external: boolean): void {
			if (external) {
				appContext.vaultNavigation.openExternalUrl(target);
				return;
			}
			// `openLinkText` resolves wikilink targets (note / note#heading / note#^block)
			// relative to the source note, matching Obsidian's own link navigation.
			void app.workspace.openLinkText(target, sourcePath, false);
		},

		closeDoc(path: string): void {
			for (const leaf of app.workspace.getLeavesOfType('markdown')) {
				const file = (leaf.view as MarkdownView | undefined)?.file;
				if (file?.path === path) leaf.detach();
			}
		},

		revealLine(path: string, line: number): Promise<void> {
			return appContext.vaultNavigation.openVaultPathAtLine(path, { line, newLeaf: false });
		},

		getCursorLine(path: string): number | null {
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
