import ignore from 'ignore';
import { TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { basenameFromPath } from '@/core/utils/file-utils';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { IgnoreService } from '@/service/search/IgnoreService';
import { buildFolderHubEnrichmentMap } from '@/service/search/index/helper/hub/hubDiscover';
import type { MobiusNodeFolderHubDiscoveryRow } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { topTokensFromBasenames } from './hubDigestNameTokens';
import type {
	DocumentHubShortlistRow,
	FolderTreeNodeDigest,
	HubFolderTreePage,
	HubWorldSnapshot,
	WorldMetricsDigest,
} from './types';

/** How many top name tokens to keep for digest / compact tree. */
const HUB_DIGEST_NAME_TOKEN_TOP = 6;

/** Weighted top tags for the observation panel (topic + keyword mass shares). */
function formatTopWeightedTopics(
	topicTagCounts: Map<string, number>,
	keywordTagCounts: Map<string, number>,
	maxTopics: number,
): string {
	const merged = new Map<string, number>();
	for (const [k, v] of topicTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
	for (const [k, v] of keywordTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
	const total = [...merged.values()].reduce((a, b) => a + b, 0);
	if (total <= 0) return '';
	const top = [...merged.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxTopics);
	return top.map(([name, c]) => `${name}(${Math.round((100 * c) / total)}%)`).join(', ');
}

function normalizeVaultFolderPath(folderPath: unknown): string {
	const raw = folderPath == null ? '' : String(folderPath).trim();
	if (raw === '' || raw === '/') return '';
	return raw.replace(/^\/+|\/+$/g, '');
}

/** Settings-driven prefixes excluded from hub snapshot / explore (e.g. autosave). */
export function getExploreFolderExcludedPrefixes(): string[] {
	const settings = AppContext.getInstance().settings;
	const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
	if (!enabled) return [];
	const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
	const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
	return [...new Set([rootFolder, autoSaveFolder].filter(Boolean))];
}

function isPathExcludedByPrefixes(path: string, excludedPathPrefixes: string[]): boolean {
	if (!excludedPathPrefixes.length) return false;
	const p = normalizeVaultFolderPath(path);
	if (p === '') return false;
	const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
	if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
	for (const raw of excludedPathPrefixes) {
		const prefix = normalizeVaultFolderPath(raw);
		if (!prefix) continue;
		if (p === prefix) return true;
		if (p.startsWith(`${prefix}/`)) return true;
	}
	return false;
}

/**
 * True when the folder path matches search.ignorePatterns (same rules as indexing).
 * Hub summary subtree is never ignored here (consistent with prefix exclusions).
 */
function shouldIgnoreFolderForHubSnapshot(path: string): boolean {
	const p = normalizeVaultFolderPath(path);
	const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
	if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
	try {
		return IgnoreService.getInstance().shouldIgnore(path);
	} catch {
		const patterns = AppContext.getInstance().settings.search.ignorePatterns ?? [];
		if (!patterns.length) return false;
		const ig = ignore();
		ig.add(patterns);
		const clean = String(path).replace(/\\/g, '/').replace(/^\//, '');
		return ig.ignores(clean);
	}
}

type FolderScanRow = { path: string; depth: number; childFolderCount: number };

/** Aggregates subtree depth metrics: max absolute depth and mean absolute depth over all folders in subtree. */
type SubtreeDepthAgg = { sumDepths: number; count: number; maxDepth: number };

/**
 * One DFS over the vault (same exclusions as snapshot) to compute per-folder subtree depth stats.
 * Depth matches folder digest rows: top-level domain folders under vault root use depth 1.
 */
function buildFolderSubtreeStatsMap(
	root: TFolder,
	excludedPathPrefixes: string[],
): Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }> {
	const map = new Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>();

	function dfs(folder: TFolder, depth: number): SubtreeDepthAgg {
		const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
		let sumDepths = depth;
		let count = 1;
		let maxDepth = depth;
		for (const sub of visibleSubs) {
			const a = dfs(sub, depth + 1);
			sumDepths += a.sumDepths;
			count += a.count;
			maxDepth = Math.max(maxDepth, a.maxDepth);
		}
		map.set(normalizeVaultPath(folder.path), {
			subtreeMaxDepth: maxDepth,
			subtreeAvgDepth: count > 0 ? sumDepths / count : depth,
		});
		return { sumDepths, count, maxDepth };
	}

	const top = root.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const ch of top) {
		dfs(ch, 1);
	}
	return map;
}

function visibleChildFolders(
	folder: TFolder,
	excludedPathPrefixes: string[],
): TFolder[] {
	const subs = folder.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	return subs.filter(
		(s) =>
			!isPathExcludedByPrefixes(s.path, excludedPathPrefixes) && !shouldIgnoreFolderForHubSnapshot(s.path),
	);
}

/**
 * Depth-first pre-order so flat lines + indent reflect true parent/child structure (BFS breaks this).
 */
function collectFoldersDfsPreorder(
	folder: TFolder,
	depth: number,
	maxDepth: number,
	maxFolders: number,
	excludedPathPrefixes: string[],
	out: FolderScanRow[],
): void {
	if (out.length >= maxFolders) return;
	if (isPathExcludedByPrefixes(folder.path, excludedPathPrefixes)) return;
	if (shouldIgnoreFolderForHubSnapshot(folder.path)) return;

	const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
	const childFolderCount = visibleSubs.length;
	out.push({ path: folder.path, depth, childFolderCount });
	if (out.length >= maxFolders) return;
	if (depth >= maxDepth) return;

	for (const sub of visibleSubs) {
		collectFoldersDfsPreorder(sub, depth + 1, maxDepth, maxFolders, excludedPathPrefixes, out);
		if (out.length >= maxFolders) return;
	}
}

function collectFolderTreeRows(
	root: TFolder,
	maxDepth: number,
	maxFolders: number,
	excludedPathPrefixes: string[],
): FolderScanRow[] {
	const out: FolderScanRow[] = [];
	const top = root.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const ch of top) {
		collectFoldersDfsPreorder(ch, 1, maxDepth, maxFolders, excludedPathPrefixes, out);
		if (out.length >= maxFolders) break;
	}
	return out;
}

/** Avoid breaking markdown table cells if a rare token contains `|`. */
function sanitizeDigestCell(text: string): string {
	return text.replace(/\|/g, ' ');
}

/** Joins token list for compact tree lines; truncates long runs. */
function compactTokenSampleList(tokens: string[], maxChars: number): string {
	if (!tokens.length) return '—';
	const s = tokens.join(', ');
	const t = s.length <= maxChars ? s : `${s.slice(0, Math.max(0, maxChars - 1))}…`;
	return sanitizeDigestCell(t);
}

async function chunkPages(
	nodes: FolderTreeNodeDigest[],
	maxNodesPerPage: number,
	tm: TemplateManager,
): Promise<HubFolderTreePage[]> {
	const lim = Math.max(64, Math.min(2000, Math.max(1, Math.floor(maxNodesPerPage))));
	if (nodes.length === 0) {
		const compactTreeMarkdown = await tm.render(IndexingTemplateId.HubDiscoveryFolderTreeEmpty, {});
		return [
			{
				pageId: 'folder-page-empty',
				pageIndex: 0,
				totalPages: 1,
				compactTreeMarkdown,
				pathsOnPage: [],
			},
		];
	}
	const pages: HubFolderTreePage[] = [];
	for (let i = 0; i < nodes.length; i += lim) {
		const slice = nodes.slice(i, i + lim);
		const pageIndex = pages.length;
		const compactTreeMarkdown = await tm.render(IndexingTemplateId.HubDiscoveryFolderTreePage, {
			folderRows: slice.map((n) => ({
				displayName: n.name || basenameFromPath(n.path) || n.path,
				depthMinusOne: Math.max(0, n.depth - 1),
				docCount: n.docCount,
				topKeywords: n.topKeywords,
				topTopics: n.topTopics,
				docOutgoing: n.docOutgoing,
				docIncoming: n.docIncoming,
				childFolderCount: n.childFolderCount,
				subtreeMaxDepth: n.subtreeMaxDepth,
				subtreeAvgDepthDisplay: n.subtreeAvgDepth.toFixed(1),
				fileTokenSampleCompact: compactTokenSampleList(n.fileNameTokenSample, 120),
				subfolderTokenSampleCompact: compactTokenSampleList(n.subfolderNameTokenSample, 120),
			})),
		});
		pages.push({
			pageId: `folder-page-${pageIndex}`,
			pageIndex,
			totalPages: 0,
			compactTreeMarkdown,
			pathsOnPage: slice.map((n) => n.path),
		});
	}
	const nPages = pages.length;
	for (const p of pages) p.totalPages = nPages;
	return pages;
}

async function buildWorldMetrics(nodes: FolderTreeNodeDigest[]): Promise<WorldMetricsDigest> {
	const vault = AppContext.getInstance().app.vault;
	const root = vault.getRoot();
	const topLevelBranchCount = root.children.filter((c): c is TFolder => c instanceof TFolder).length;

	let totalIndexedDocuments = 0;
	let orphanHardSampleCount = 0;
	if (sqliteStoreManager.isInitialized()) {
		totalIndexedDocuments = await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows();
		const orphanIds = await sqliteStoreManager.getMobiusEdgeRepo().getHardOrphanNodeIds(3000);
		orphanHardSampleCount = orphanIds.length;
	}

	const topOutgoingFolders = [...nodes]
		.map((n) => ({ path: n.path, outgoing: n.docOutgoing }))
		.sort((a, b) => b.outgoing - a.outgoing)
		.slice(0, 12);

	let orphanRiskHint: WorldMetricsDigest['orphanRiskHint'] = 'low';
	if (totalIndexedDocuments > 0) {
		const ratio = orphanHardSampleCount / Math.min(totalIndexedDocuments, 3000);
		if (ratio > 0.15) orphanRiskHint = 'high';
		else if (ratio > 0.05) orphanRiskHint = 'medium';
	}

	return {
		totalIndexedDocuments,
		totalFoldersScanned: nodes.length,
		topLevelBranchCount,
		orphanHardSampleCount,
		orphanRiskHint,
		topOutgoingFolders,
	};
}

/**
 * Builds paginated compact folder tree pages and metrics. Markdown bodies use indexing templates.
 */
export async function buildHubWorldSnapshot(
	options: {
		maxDepth: number;
		maxFolders: number;
		maxNodesPerPage: number;
		extraExcludePathPrefixes?: string[];
	},
	templateManager: TemplateManager,
): Promise<HubWorldSnapshot> {
	const { maxDepth, maxFolders, maxNodesPerPage, extraExcludePathPrefixes = [] } = options;
	if (!sqliteStoreManager.isInitialized()) {
		return {
			pages: [],
			metrics: {
				totalIndexedDocuments: 0,
				totalFoldersScanned: 0,
				topLevelBranchCount: 0,
				orphanHardSampleCount: 0,
				orphanRiskHint: 'low',
				topOutgoingFolders: [],
			},
			nodes: [],
		};
	}

	const vault = AppContext.getInstance().app.vault;
	const root = vault.getRoot();
	const excluded = [...getExploreFolderExcludedPrefixes(), ...extraExcludePathPrefixes.map((p) => normalizeVaultFolderPath(p))];
	const rows = collectFolderTreeRows(root, maxDepth, maxFolders, excluded);
	const subtreeStatsMap = buildFolderSubtreeStatsMap(root, excluded);
	const paths = rows.map((r) => r.path);
	const degreeMap = await sqliteStoreManager.getMobiusNodeRepo().listFolderDocDegreesByVaultPaths(paths);

	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const graphRepo = sqliteStoreManager.getGraphRepo();
	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo();

	const nodes: FolderTreeNodeDigest[] = [];
	for (const row of rows) {
		const np = normalizeVaultPath(row.path);
		const deg = degreeMap.get(np) ?? { incoming: 0, outgoing: 0 };
		let docCount = 0;
		let topKeywords: string[] = [];
		let topTopics: string[] = [];
		let topTopicsWeighted: string | undefined;
		let maps: Array<{ id: string; path: string }> = [];
		try {
			maps = await indexedDocumentRepo.getIdsByFolderPath(row.path);
			docCount = maps.length;
			if (docCount > 0) {
				const docIds = maps.map((m) => m.id);
				const { topicTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
				topTopics = [...topicTagCounts.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([name]) => name);
				topKeywords = [...keywordTagCounts.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 6)
					.map(([name]) => name);
				const weighted = formatTopWeightedTopics(topicTagCounts, keywordTagCounts, 3);
				if (weighted) topTopicsWeighted = weighted;
			}
		} catch {
			docCount = 0;
			maps = [];
		}
		let directDocCount = 0;
		try {
			directDocCount = await indexedDocumentRepo.countDirectDocumentsInFolder(row.path);
		} catch {
			directDocCount = 0;
		}
		const fileBasenames = maps.map((m) => basenameFromPath(m.path));
		const fileNameTokenSample =
			fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, HUB_DIGEST_NAME_TOKEN_TOP) : [];
		let subfolderNameTokenSample: string[] = [];
		if (row.childFolderCount > 0) {
			const af = vault.getAbstractFileByPath(row.path);
			if (af instanceof TFolder) {
				const childNames = visibleChildFolders(af, excluded).map((f) => basenameFromPath(f.path));
				subfolderNameTokenSample = topTokensFromBasenames(childNames, HUB_DIGEST_NAME_TOKEN_TOP);
			}
		}
		const st = subtreeStatsMap.get(np);
		const subtreeMaxDepth = st?.subtreeMaxDepth ?? row.depth;
		const subtreeAvgDepth = st?.subtreeAvgDepth ?? row.depth;
		nodes.push({
			path: row.path,
			name: basenameFromPath(row.path),
			depth: row.depth,
			childFolderCount: row.childFolderCount,
			subtreeMaxDepth,
			subtreeAvgDepth,
			docCount,
			directDocCount,
			topKeywords,
			topTopics,
			topTopicsWeighted,
			docOutgoing: deg.outgoing,
			docIncoming: deg.incoming,
			fileNameTokenSample,
			subfolderNameTokenSample,
		});
	}

	const hubFolder = getAIHubSummaryFolder();
	let folderRows: MobiusNodeFolderHubDiscoveryRow[] = [];
	try {
		folderRows = await mobiusRepo.listFolderHubDiscoveryRowsByPaths(paths, hubFolder, { relaxMinDocs: true });
	} catch {
		folderRows = [];
	}
	const enrichMap =
		folderRows.length > 0 ? await buildFolderHubEnrichmentMap(mobiusRepo, folderRows) : new Map();
	const folderRowByPath = new Map(
		folderRows.map((r) => [normalizeVaultPath(String(r.path ?? '')), r] as const),
	);
	for (const n of nodes) {
		const np = normalizeVaultPath(n.path);
		const e = enrichMap.get(np);
		if (e) {
			n.topicPurity = e.topicPurity;
			n.containerPenalty = e.containerPenalty;
			n.strongChildDocShare = e.strongChildDocShare;
			n.residualRatio = e.residualRatio;
			n.folderRank = e.folderRank;
			n.strongChildCount = e.strongChildCount;
		}
		const fr = folderRowByPath.get(np);
		if (fr && typeof fr.hub_graph_score === 'number') {
			n.hubGraphScore = fr.hub_graph_score;
		}
	}

	const metrics = await buildWorldMetrics(nodes);
	const pages = await chunkPages(nodes, maxNodesPerPage, templateManager);
	return { pages, metrics, nodes };
}

/** SQL-ranked document candidates for hub discovery (excludes AI hub output folder). */
export async function buildDocumentHubShortlist(limit: number): Promise<DocumentHubShortlistRow[]> {
	if (!sqliteStoreManager.isInitialized()) return [];
	const hubFolder = getAIHubSummaryFolder();
	const rows = await sqliteStoreManager
		.getMobiusNodeRepo()
		.listTopDocumentNodesForHubDiscovery(Math.max(1, limit), hubFolder);
	return rows.map((r) => ({
		path: String(r.path ?? ''),
		label: String(r.label ?? ''),
		hubGraphScore: typeof r.hub_graph_score === 'number' ? r.hub_graph_score : 0,
		docIncoming: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
		docOutgoing: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
	}));
}
