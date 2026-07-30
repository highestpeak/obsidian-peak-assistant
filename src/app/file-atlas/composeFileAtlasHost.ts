/**
 * File Atlas — host port composition (app layer).
 *
 * Builds the {@link FileAtlasHostPort} the standalone File Atlas surface needs
 * from the Obsidian runtime: enumerating file-backed Markdown / Composer tabs,
 * reading recent-use signals, revealing a line, clipboard, and resolving image
 * resources. Runtime ownership stays in the app layer — the UI only sees the port.
 *
 * `loadNeighborhood` delegates to a pure direction-preserving graph builder;
 * this composition layer only supplies the live index readers.
 */

import { MarkdownView, Notice, TFile } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import type {
	AtlasGraphData,
	AtlasImageInfo,
	AtlasCopilotSuggestion,
	FileAtlasHostPort,
	OpenDocMeta,
} from '@/ui/view/file-atlas/FileAtlasHostPort';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getConnectedLinks, getDiscoveredConnections } from '@/service/search/inspectorService';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from '@/app/composer/viewType';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import { buildFileAtlasNeighborhood } from './buildFileAtlasNeighborhood';
import { composerTargetBlockId } from '@/core/composer';
import { NativeMarkdownIntelligenceModal } from '@/app/composer/NativeMarkdownIntelligenceModal';
import { openQuickSearch } from '@/app/commands/PeakCommandActions';

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
			return buildFileAtlasNeighborhood(path, opts, {
				getConnectedLinks,
				getDiscoveredConnections,
			});
		},

		async loadCopilotSuggestions(path: string): Promise<AtlasCopilotSuggestion[]> {
			const owner = appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
			if (!owner) return [];
			const controller = owner.createController(`file-atlas-${crypto.randomUUID()}`);
			controller.start(path);
			try {
				await controller.settled();
				const intelligence = controller.getIntelligence();
				if (!intelligence) return [];
				intelligence.refreshBrief();
				return intelligence.findings.briefItems().map((finding): AtlasCopilotSuggestion => {
					const targetBlockId = composerTargetBlockId(finding.target);
					const targetBlock = targetBlockId
						? controller.getRuntime()?.session.snapshot.blocks.find(
							(candidate) => candidate.blockId === targetBlockId,
						)
						: undefined;
					const targetLabel = targetBlockId ?? finding.target.kind;
					return {
						findingId: finding.findingId,
						targetBlockId,
						targetFrom: targetBlock?.source.from ?? null,
						targetTo: targetBlock?.source.to ?? null,
						title: finding.brief?.title ?? finding.reason,
						summary: finding.brief?.summary ?? '',
						targetLabel: finding.brief?.targetLabel ?? targetLabel,
						evidenceLabel: finding.brief?.evidenceLabel ?? finding.evidenceRevision,
						state: finding.state === 'stale' ? 'stale' : 'active',
						priority: finding.brief?.priority ?? Number.MAX_SAFE_INTEGER,
					};
				}).sort((left, right) => left.priority - right.priority);
			} finally {
				controller.stop();
			}
		},

		openCopilot(path: string, context): void {
			new NativeMarkdownIntelligenceModal(appContext, path, context).open();
		},

		openAIGraphs(graphId?: string): void {
			const path = activeFileContextPath();
			const file = path ? app.vault.getAbstractFileByPath(path) : null;
			openQuickSearch({
				aiMode: 'graph',
				...(graphId ? { graphId } : {}),
				...(path
					? {
						selectedVaultPaths: [path],
						graphCreateOrigin: {
							surface: 'file-atlas',
							contextRef: {
								kind: 'atlas-file',
								ref: path,
								label: file instanceof TFile ? file.basename : path,
								locator: path,
							},
						},
					}
					: {}),
			});
		},
	};
}
