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

import { MarkdownView, Notice, requestUrl, TFile, type WorkspaceLeaf } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import type {
	AtlasGraphData,
	AtlasExternalLinkPreview,
	AtlasImageInfo,
	AtlasVaultLinkPreview,
	AtlasCopilotSuggestion,
	AtlasCopilotSuggestionSnapshot,
	AtlasQuickActionSnapshot,
	FileAtlasHostPort,
	OpenDocMeta,
} from '@/ui/view/file-atlas/FileAtlasHostPort';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getConnectedLinks, getDiscoveredConnections, getHubsForDoc } from '@/service/search/inspectorService';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from '@/app/composer/viewType';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import { buildFileAtlasNeighborhood } from './buildFileAtlasNeighborhood';
import { composerTargetBlockId } from '@/core/composer';
import type { ComposerCapabilityId } from '@/core/composer';
import { assembleComposerContextSnapshot } from '@/service/composer/capabilities/contextAssembler';
import { NativeMarkdownIntelligenceModal } from '@/app/composer/NativeMarkdownIntelligenceModal';
import { virtualHubPath } from '@/service/hub/HubRecordStore';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import {
	composerBlockForAtlasLocation,
	projectFileAtlasQuickActions,
} from './fileAtlasComposerActions';
import type { DocumentComposerController } from '@/app/composer/DocumentComposerController';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { DEFAULT_FILE_ATLAS_CONFIG } from '@/ui/view/file-atlas/config/fileAtlasConfig';
import { communityFingerprint } from '@/service/search/index/helper/structural/communityEvidence';
import type { ResultGraphCommunitySummary } from '@/service/search/graph/resultSubgraph';

const VAULT_PREVIEW_CONTENT_KINDS = new Set<DocumentBlock['kind']>([
	RawBlockKind.Paragraph,
	RawBlockKind.List,
	RawBlockKind.ListItem,
	RawBlockKind.Task,
	RawBlockKind.Quote,
	RawBlockKind.Callout,
]);

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

function safeExternalUrl(raw: string, base?: string): URL | null {
	try {
		const url = base ? new URL(raw, base) : new URL(raw);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url;
	} catch {
		return null;
	}
}

function firstVaultPreviewSource(blocks: DocumentBlock[]): string {
	for (const block of blocks) {
		if (VAULT_PREVIEW_CONTENT_KINDS.has(block.kind) && block.source.trim()) {
			return block.source;
		}
		const nested = firstVaultPreviewSource(block.children ?? []);
		if (nested) return nested;
	}
	return '';
}

function metadataContent(doc: Document, selectors: string[]): string | undefined {
	for (const selector of selectors) {
		const value = doc.querySelector<HTMLMetaElement>(selector)?.content?.trim();
		if (value) return value;
	}
	return undefined;
}

function externalLinkPreview(
	url: URL,
	html: string,
	ownerDocument: Document,
): AtlasExternalLinkPreview {
	const DOMParserCtor = ownerDocument.defaultView?.DOMParser ?? DOMParser;
	const doc = new DOMParserCtor().parseFromString(html, 'text/html');
	const title = metadataContent(doc, [
		'meta[property="og:title"]',
		'meta[name="twitter:title"]',
	]) ?? doc.querySelector('title')?.textContent?.trim() ?? url.hostname;
	const description = metadataContent(doc, [
		'meta[property="og:description"]',
		'meta[name="twitter:description"]',
		'meta[name="description"]',
	]);
	const siteName = metadataContent(doc, ['meta[property="og:site_name"]']);
	const rawImage = metadataContent(doc, [
		'meta[property="og:image"]',
		'meta[name="twitter:image"]',
		'meta[name="twitter:image:src"]',
	]);
	const rawFavicon = doc.querySelector<HTMLLinkElement>(
		'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
	)?.href;
	const imageUrl = rawImage ? safeExternalUrl(rawImage, url.href)?.href : undefined;
	const faviconUrl = safeExternalUrl(rawFavicon ?? '/favicon.ico', url.href)?.href;
	return {
		url: url.href,
		domain: url.hostname.startsWith('www.') ? url.hostname.slice(4) : url.hostname,
		title,
		...(description ? { description } : {}),
		...(siteName ? { siteName } : {}),
		...(imageUrl ? { imageUrl } : {}),
		...(faviconUrl ? { faviconUrl } : {}),
	};
}

export function composeFileAtlasHost(appContext: AppContext): FileAtlasHostPort {
	const app = appContext.app;
	const sessionViews = new Map<string, { lastViewedAt: number; viewCount: number }>();
	const externalPreviewCache = new Map<string, AtlasExternalLinkPreview | null>();
	let cacheCapacity = DEFAULT_FILE_ATLAS_CONFIG.rail.capacity;
	let lastActivePath: string | null = null;
	let activationQueue: Promise<void> = Promise.resolve();
	let documentReadQueue: Promise<void> = Promise.resolve();

	const setBounded = <T>(map: Map<string, T>, key: string, value: T): void => {
		map.delete(key);
		map.set(key, value);
		while (map.size > cacheCapacity) {
			const oldestKey = map.keys().next().value as string | undefined;
			if (!oldestKey) return;
			map.delete(oldestKey);
		}
	};

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
		setBounded(sessionViews, path, {
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

	const withComposerBlock = async <T>(
		path: string,
		location: DocumentSourceLocation,
		project: (
			controller: DocumentComposerController,
			blockId: string,
		) => T | Promise<T>,
		options: { transient?: boolean; signal?: AbortSignal } = {},
	): Promise<T | null> => {
		if (options.signal?.aborted) return null;
		const owner = appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (!owner) return null;
		const hostId = `file-atlas-action-${crypto.randomUUID()}`;
		const controller = options.transient
			? owner.createTransientController(hostId, 'markdown', { capabilities: true })
			: owner.createController(hostId);
		const stop = (): void => controller.stop();
		options.signal?.addEventListener('abort', stop, { once: true });
		try {
			controller.start(path);
			await controller.settled();
			if (options.signal?.aborted) return null;
			const snapshot = controller.getState().snapshot;
			const block = snapshot ? composerBlockForAtlasLocation(snapshot, location) : null;
			if (!block) return null;
			return await project(controller, block.blockId);
		} finally {
			options.signal?.removeEventListener('abort', stop);
			controller.stop();
		}
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
			cacheCapacity = safeLimit;
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

		readDoc(path: string, signal?: AbortSignal): Promise<string> {
			let content = '';
			const read = async (): Promise<void> => {
				if (signal?.aborted) return;
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) return;
				const loaded = await app.vault.cachedRead(file);
				if (!signal?.aborted) content = loaded;
			};
			const request = documentReadQueue.then(read, read);
			documentReadQueue = request.then(() => undefined, () => undefined);
			return request.then(() => content);
		},

		activateDoc(path: string): Promise<void> {
			const activate = async (): Promise<void> => {
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
					const openedLeaf = await router.open({
						filePath: file.path,
						disposition: 'new-tab',
						reason: 'file-atlas',
					});
					const openedView = openedLeaf?.view as {
						whenDocumentSettled?: () => Promise<void>;
					} | undefined;
					await openedView?.whenDocumentSettled?.();
					recordActiveView();
					return;
				}
				let leaf: WorkspaceLeaf;
				try {
					leaf = app.workspace.getLeaf('tab');
				} catch {
					leaf = app.workspace.getLeaf(false);
				}
				await leaf.openFile(file, { active: true });
				recordActiveView();
			};
			activationQueue = activationQueue.then(activate, activate);
			return activationQueue;
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

		async loadExternalLinkPreview(rawUrl: string): Promise<AtlasExternalLinkPreview | null> {
			const url = safeExternalUrl(rawUrl);
			if (!url) return null;
			if (externalPreviewCache.has(url.href)) return externalPreviewCache.get(url.href) ?? null;
			try {
				const response = await requestUrl({
					url: url.href,
					method: 'GET',
					headers: {
						Accept: 'text/html,application/xhtml+xml',
						'Cache-Control': 'no-store',
					},
					throw: false,
				});
				if (response.status < 200 || response.status >= 400) {
					setBounded(externalPreviewCache, url.href, null);
					return null;
				}
				const preview = externalLinkPreview(url, response.text, app.workspace.containerEl.ownerDocument);
				setBounded(externalPreviewCache, url.href, preview);
				return preview;
			} catch {
				setBounded(externalPreviewCache, url.href, null);
				return null;
			}
		},

		async loadVaultLinkPreview(
			target: string,
			sourcePath: string,
		): Promise<AtlasVaultLinkPreview | null> {
			const cleanTarget = cleanImageTarget(target).split('#')[0];
			const file = app.metadataCache.getFirstLinkpathDest(cleanTarget, sourcePath);
			if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') return null;
			const content = await app.vault.cachedRead(file);
			const parsed = parseDocumentBlocks(content, file.path);
			const firstHeading = parsed.blocks.find((block) => block.kind === RawBlockKind.Heading);
			return {
				path: file.path,
				title: firstHeading?.title ?? file.basename,
				excerpt: firstVaultPreviewSource(parsed.blocks),
			};
		},

		async loadQuickActions(
			path: string,
			location: DocumentSourceLocation,
			signal?: AbortSignal,
		): Promise<AtlasQuickActionSnapshot> {
			const actions = await withComposerBlock(path, location, (controller, blockId) => {
				const runtime = controller.getRuntime();
				if (!runtime?.projection) return null;
				const snapshot = assembleComposerContextSnapshot(
					runtime.session,
					{ kind: 'block', blockId },
					{ nearbyChars: 400 },
				);
				const projected = runtime.projection.actionsFor(snapshot, 'block-row')
					.filter((action) => action.group === 'ai')
					.map((action) => ({
						capabilityId: action.capabilityId,
						title: action.title,
						...(action.description ? { description: action.description } : {}),
						...(action.lucideIcon ? { lucideIcon: action.lucideIcon } : {}),
						...(action.disabledReason ? { disabledReason: action.disabledReason } : {}),
					}));
				return projectFileAtlasQuickActions(projected);
			}, { transient: true, signal });
			return actions ? { status: 'ready', actions } : { status: 'unavailable', actions: [] };
		},

		async runQuickAction(
			path: string,
			location: DocumentSourceLocation,
			capabilityId: ComposerCapabilityId,
		): Promise<boolean> {
			const owner = appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
			const router = owner?.navigation;
			if (!owner || !router) return false;
			const leaf = await router.open({
				filePath: path,
				view: 'composer',
				disposition: 'reuse-existing',
				reason: 'file-atlas',
			});
			if (!leaf) return false;
			await router.revealLocation({
				filePath: path,
				location,
				disposition: 'reuse-existing',
				reason: 'file-atlas',
			});
			const invoked = await withComposerBlock(path, location, (controller, blockId) => {
				const runtime = controller.getRuntime();
				if (!runtime?.projection) return false;
				const snapshot = assembleComposerContextSnapshot(
					runtime.session,
					{ kind: 'block', blockId },
					{ nearbyChars: 400 },
				);
				const action = runtime.projection.actionsFor(snapshot, 'block-row')
					.find((candidate) => candidate.capabilityId === capabilityId);
				if (!action || action.disabledReason) return false;
				runtime.projection.invoke(capabilityId, snapshot);
				return true;
			});
			return invoked ?? false;
		},

		async loadNeighborhood(
			path: string,
			opts: { hops: 1 | 2; semantic: boolean },
			signal?: AbortSignal,
		): Promise<AtlasGraphData> {
			if (signal?.aborted) return { nodes: [], hubAnchors: [], edges: [] };
			if (!sqliteStoreManager.isInitialized()) return { nodes: [], hubAnchors: [], edges: [] };
			const neighborhood = await buildFileAtlasNeighborhood(path, opts, {
				getConnectedLinks,
				getDiscoveredConnections,
			});
			if (signal?.aborted) return { nodes: [], hubAnchors: [], edges: [] };
			const evidenceRows = await Promise.all(neighborhood.nodes.map(async (node) => {
				if (!node.path) return [node.id, null] as const;
				const tenant = getIndexTenantForPath(node.path);
				const row = await sqliteStoreManager.getMobiusNodeRepo(tenant).getByPath(node.path).catch(() => null);
				return [node.id, row] as const;
			}));
			const evidenceById = new Map(evidenceRows);
			const communityIds = [...new Set(evidenceRows.flatMap(([, row]) => (
				row?.community_id ? [row.community_id] : []
			)))];
			const structuralRepo = sqliteStoreManager.getStructuralAnalysisRepo();
			const communityRows = await Promise.all(communityIds.map(async (communityId) => (
				[communityId, await structuralRepo.getCommunityById(communityId).catch(() => null)] as const
			)));
			const communityById = new Map(communityRows.filter((entry) => entry[1] !== null));
			const enrichedNeighborhood = {
				...neighborhood,
				nodes: neighborhood.nodes.map((node) => {
					const row = evidenceById.get(node.id);
					if (!row) return node;
					const tags = decodeIndexedTagsBlob(row.tags_json);
					const signals = [...new Set([
						...tags.topicTags,
						...(tags.userKeywordTags ?? tags.keywordTags),
						...(tags.textrankKeywordTerms ?? []),
					].map((item) => item.trim()).filter(Boolean))];
					return {
						...node,
						summary: row.summary ?? undefined,
						signals,
						incomingLinks: row.doc_incoming_cnt ?? 0,
						outgoingLinks: row.doc_outgoing_cnt ?? 0,
						communityId: row.community_id && communityById.has(row.community_id)
							? row.community_id
							: null,
					};
				}),
			};
			const communities: ResultGraphCommunitySummary[] = [];
			for (const [communityId, info] of communityById) {
				if (!info) continue;
				const visibleMemberIds = enrichedNeighborhood.nodes
					.filter((node) => node.communityId === communityId)
					.map((node) => node.id);
				if (!visibleMemberIds.length) continue;
				const descriptors = info.descriptors ?? info.dominantTopics.map((label) => ({
					key: `legacy:${label.toLocaleLowerCase()}`,
					label,
					kind: 'tag' as const,
					support: 0,
					score: 0,
				}));
				communities.push({
					id: communityId,
					displayLabel: `Community ${String(communities.length + 1).padStart(2, '0')}`,
					fingerprint: info.fingerprint || communityFingerprint({
						memberIds: info.topNodes.map((node) => node.path),
						descriptorKeys: descriptors.map((descriptor) => descriptor.key),
						analysisVersion: info.analysisVersion ?? 1,
					}),
					memberCount: info.memberCount,
					visibleMemberIds,
					descriptors,
					internalReferenceCount: info.internalReferenceCount ?? 0,
					analysisVersion: info.analysisVersion ?? 1,
					analysisMode: info.analysisMode ?? 'exact',
					analyzedNodeCount: info.analyzedNodeCount ?? info.memberCount,
					totalNodeCount: info.totalNodeCount ?? info.memberCount,
					representativeNotes: info.topNodes.map((node) => ({ path: node.path, label: node.label })),
				});
			}
			if (signal?.aborted) return { nodes: [], hubAnchors: [], edges: [] };
			const hubs = await getHubsForDoc(path).catch(() => []);
			const hubRuntime = appContext.runtimeRegistry.tryGetHubGenerationRuntime();
			const resolvedHubs = await Promise.all(hubs.map(async (hub) => {
				const manifest = await hubRuntime?.readManifest(hub.hubId).catch(() => null) ?? null;
				return {
					id: hub.hubId,
					path: manifest?.materialization.path ?? virtualHubPath(hub.hubId),
					label: manifest?.label?.trim() || hub.label || hub.hubId,
					constituentCount: manifest?.members.length ?? 1,
				};
			}));
			if (signal?.aborted) return { nodes: [], hubAnchors: [], edges: [] };
			return {
				...enrichedNeighborhood,
				communities,
				hubAnchors: resolvedHubs,
				edges: [
					...enrichedNeighborhood.edges,
					...resolvedHubs.map((hub) => ({
						from: hub.id,
						to: path,
						kind: 'hub_constituent' as const,
						directionality: 'undirected' as const,
					})),
				],
			};
		},

		async loadCopilotSuggestions(
			path: string,
			signal?: AbortSignal,
		): Promise<AtlasCopilotSuggestionSnapshot> {
			if (signal?.aborted) return { status: 'unavailable', suggestions: [] };
			const owner = appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
			if (!owner) return { status: 'unavailable', suggestions: [] };
			const controller = owner.createTransientController(
				`file-atlas-${crypto.randomUUID()}`,
				'markdown',
				{ intelligence: true },
			);
			const stop = (): void => controller.stop();
			signal?.addEventListener('abort', stop, { once: true });
			try {
				controller.start(path);
				await controller.settled();
				if (signal?.aborted) return { status: 'unavailable', suggestions: [] };
				const intelligence = controller.getIntelligence();
				if (!intelligence) return { status: 'unavailable', suggestions: [] };
				intelligence.refreshBrief();
				const suggestions = intelligence.findings.briefItems().map((finding): AtlasCopilotSuggestion => {
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
				return { status: 'ready', suggestions };
			} finally {
				signal?.removeEventListener('abort', stop);
				controller.stop();
			}
		},

		openCopilot(path: string, context): void {
			new NativeMarkdownIntelligenceModal(appContext, path, context).open();
		},

	};
}
