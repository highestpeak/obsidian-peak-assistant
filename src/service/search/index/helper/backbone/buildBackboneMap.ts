/**
 * Builds a deterministic backbone map: folder tree, optional virtual clusters, cross-folder highways.
 *
 * This file consolidates the backbone build pipeline (previously spread across 9 files):
 *   tagDisplayRank, vaultFolderScan, digestLoader, supernodeResolve,
 *   backboneEdges, pagerankMass, virtualFolders, renderBackboneMarkdown,
 *   and the original buildBackboneMap orchestrator.
 */

import ignore from 'ignore';
import { TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { basenameFromPath } from '@/core/utils/file-utils';
import { normalizeVaultPath, parentDirPath } from '@/core/utils/vault-path-utils';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IgnoreService } from '@/service/search/IgnoreService';
import type {
	BackboneEdge,
	BackboneFolderNode,
	BackboneMapResult,
	BackbonePage,
	BackboneVirtualNode,
	BuildBackboneMapOptions,
} from './types';


// ═══════════════════════════════════════════════════════════════════════════════
// § tagDisplayRank — TF × folder-IDF × root-IDF × type priors tag ranking
// ═══════════════════════════════════════════════════════════════════════════════

/** Tag category for scoring priors (functional tags are usually workflow noise). */
export type TagRankCategory = 'topic' | 'keyword' | 'functional';

const TYPE_PRIOR: Record<TagRankCategory, number> = {
	topic: 1,
	keyword: 0.82,
	functional: 0.22,
};

/** Normalized labels that are workflow / state, not thematic (always stripped from tree columns). */
const STATIC_ROW_NOISE: ReadonlySet<string> = new Set([
	'todo',
	'todolist',
	'todo-list',
	'mess',
	'messy',
	'waiting',
	'pending',
	'later',
	'done',
	'doing',
	'inbox',
	'index',
	'archive',
	'draft',
	'wip',
]);

/** Hide tags that appear on direct files in at least this fraction of scanned folders. */
const MAX_FOLDER_COVERAGE_FOR_ROW = 0.1;

function normalizeTagKey(tag: string): string {
	return tag.trim().toLowerCase();
}

function getDfForTag(tag: string, dfMap: Map<string, number>): number {
	const d = dfMap.get(tag);
	if (d !== undefined) return d;
	const k = normalizeTagKey(tag);
	for (const [t, df] of dfMap) {
		if (normalizeTagKey(t) === k) return df;
	}
	return 0;
}

/**
 * Tags removed from per-folder kw/topics columns; listed separately in the backbone markdown legend.
 */
function shouldHideTagFromFolderRows(tag: string, stats: TagGlobalStats): boolean {
	if (!tag.trim()) return false;
	if (STATIC_ROW_NOISE.has(normalizeTagKey(tag))) return true;
	const N = stats.folderCount;
	if (N <= 0) return false;
	const df = getDfForTag(tag, stats.tagFolderDf);
	if (df <= 0) return false;
	return df / N >= MAX_FOLDER_COVERAGE_FOR_ROW;
}

/**
 * One-line legend entries: hidden tags with folder-DF, most frequent first.
 */
function buildVaultNoiseTagLegend(stats: TagGlobalStats, maxEntries = 80): string[] {
	if (stats.folderCount <= 0) return [];
	const items: Array<{ tag: string; df: number }> = [];
	const seen = new Set<string>();
	for (const [tag, df] of stats.tagFolderDf) {
		if (df <= 0) continue;
		if (!shouldHideTagFromFolderRows(tag, stats)) continue;
		const k = normalizeTagKey(tag);
		if (seen.has(k)) continue;
		seen.add(k);
		items.push({ tag, df });
	}
	items.sort((a, b) => b.df - a.df);
	return items.slice(0, maxEntries).map(({ tag, df }) => `${tag} (${df} folders)`);
}

/** Global presence stats over scanned folders (direct files only). */
export type TagGlobalStats = {
	/** Number of scanned folder rows (denominator for folder coverage). */
	folderCount: number;
	/** Distinct first path segments among scanned folders. */
	rootBucketCount: number;
	/** Tag label -> number of folders where it appears on at least one direct file. */
	tagFolderDf: Map<string, number>;
	/** Tag label -> number of distinct first-path buckets where it appears. */
	tagRootDf: Map<string, number>;
};

/** First path segment after normalization (vault "area" bucket). */
function firstVaultPathSegment(path: string): string {
	const n = normalizeVaultPath(path);
	const parts = n.split('/').filter(Boolean);
	return parts[0] ?? '';
}

function smoothIdf(df: number, n: number): number {
	if (n <= 0) return 1;
	return Math.log((n + 1) / (df + 1)) + 1;
}

/**
 * Computes folder/root document frequency for tags from direct-file tag counts per folder.
 */
function buildTagGlobalStats(
	folders: Array<{
		folderPath: string;
		topicTagCounts: Map<string, number>;
		keywordTagCounts: Map<string, number>;
		functionalTagCounts: Map<string, number>;
	}>,
): TagGlobalStats {
	const tagFolderSets = new Map<string, Set<string>>();
	const tagRootSets = new Map<string, Set<string>>();
	const allRoots = new Set<string>();

	const getOrCreate = <V>(m: Map<string, Set<V>>, k: string) => { let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } return s; };

	for (const f of folders) {
		const root = firstVaultPathSegment(f.folderPath) || '_';
		allRoots.add(root);
		const seen = new Set<string>();
		for (const counts of [f.topicTagCounts, f.keywordTagCounts, f.functionalTagCounts]) {
			for (const [tag, c] of counts) {
				if (c > 0 && tag && !seen.has(tag)) {
					seen.add(tag);
					getOrCreate(tagFolderSets, tag).add(f.folderPath);
					getOrCreate(tagRootSets, tag).add(root);
				}
			}
		}
	}

	const tagFolderDf = new Map<string, number>();
	const tagRootDf = new Map<string, number>();
	for (const [tag, set] of tagFolderSets) tagFolderDf.set(tag, set.size);
	for (const [tag, set] of tagRootSets) tagRootDf.set(tag, set.size);

	return { folderCount: folders.length, rootBucketCount: Math.max(1, allRoots.size), tagFolderDf, tagRootDf };
}

function scoreTag(tf: number, tag: string, category: TagRankCategory, stats: TagGlobalStats): number {
	if (tf <= 0) return 0;
	const idfFolder = smoothIdf(getDfForTag(tag, stats.tagFolderDf), stats.folderCount);
	const idfRoot = smoothIdf(getDfForTag(tag, stats.tagRootDf), stats.rootBucketCount);
	return tf * idfFolder * idfRoot * TYPE_PRIOR[category];
}

function rankMapByScore(
	counts: Map<string, number>,
	category: TagRankCategory,
	stats: TagGlobalStats,
	limit: number,
): string[] {
	const scored = [...counts.entries()]
		.filter(([, c]) => c > 0)
		.map(([tag, tf]) => ({ tag, s: scoreTag(tf, tag, category, stats) }))
		.sort((a, b) => b.s - a.s || a.tag.localeCompare(b.tag));
	const out: string[] = [];
	for (const x of scored) {
		if (shouldHideTagFromFolderRows(x.tag, stats)) continue;
		out.push(x.tag);
		if (out.length >= limit) break;
	}
	return out;
}

/** Merge keyword + functional counts into a single map. */
function mergeKwFunctionalCounts(kw: Map<string, number>, fn: Map<string, number>): Map<string, number> {
	const m = new Map<string, number>();
	for (const [t, c] of kw) if (c > 0) m.set(t, c + (fn.get(t) ?? 0));
	for (const [t, c] of fn) if (c > 0 && !m.has(t)) m.set(t, c);
	return m;
}

/** Pick counts for given names from a full map, used for weighted % formatting. */
function pickCounts(full: Map<string, number>, names: readonly string[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const n of names) { const c = full.get(n); if (c && c > 0) m.set(n, c); }
	return m;
}



// ═══════════════════════════════════════════════════════════════════════════════
// § vaultFolderScan — Vault folder DFS scan (same exclusions as hub snapshot)
// ═══════════════════════════════════════════════════════════════════════════════

export type FolderScanRow = { path: string; depth: number; childFolderCount: number };

export function normalizeVaultFolderPath(folderPath: unknown): string {
	const raw = folderPath == null ? '' : String(folderPath).trim();
	if (raw === '' || raw === '/') return '';
	return raw.replace(/^\/+|\/+$/g, '');
}

export function getBackboneExcludedPrefixes(): string[] {
	const settings = AppContext.getInstance().settings;
	const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
	if (!enabled) return [];
	const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
	const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
	return [...new Set([rootFolder, autoSaveFolder].filter(Boolean))];
}

export function isPathExcludedByPrefixes(path: string, excludedPathPrefixes: string[]): boolean {
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

export function shouldIgnoreFolderForBackbone(path: string): boolean {
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

export function visibleChildFolders(folder: TFolder, excludedPathPrefixes: string[]): TFolder[] {
	const subs = folder.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	return subs.filter(
		(s) =>
			!isPathExcludedByPrefixes(s.path, excludedPathPrefixes) && !shouldIgnoreFolderForBackbone(s.path),
	);
}

type FolderScanResult = {
	rows: FolderScanRow[];
	subtreeStats: Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>;
};

/**
 * Single DFS pass: collects folder rows (respecting maxDepth/maxFolders) AND computes subtree depth stats.
 * Subtree stats are computed for all reachable folders (no depth/count cap).
 */
export function scanFolderTree(
	root: TFolder,
	maxDepth: number,
	maxFolders: number,
	excludedPathPrefixes: string[],
): FolderScanResult {
	const rows: FolderScanRow[] = [];
	const subtreeStats = new Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>();

	function dfs(folder: TFolder, depth: number, collectRows: boolean): { sumDepths: number; count: number; maxDepth: number } {
		const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
		if (collectRows && rows.length < maxFolders) {
			rows.push({ path: folder.path, depth, childFolderCount: visibleSubs.length });
		}
		const childCollect = collectRows && depth < maxDepth && rows.length < maxFolders;
		let sumDepths = depth, count = 1, max = depth;
		for (const sub of visibleSubs) {
			const a = dfs(sub, depth + 1, childCollect);
			sumDepths += a.sumDepths;
			count += a.count;
			max = Math.max(max, a.maxDepth);
		}
		subtreeStats.set(normalizeVaultPath(folder.path), {
			subtreeMaxDepth: max,
			subtreeAvgDepth: count > 0 ? sumDepths / count : depth,
		});
		return { sumDepths, count, maxDepth: max };
	}

	const top = root.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const ch of top) {
		if (isPathExcludedByPrefixes(ch.path, excludedPathPrefixes) || shouldIgnoreFolderForBackbone(ch.path)) continue;
		dfs(ch, 1, true);
	}
	return { rows, subtreeStats };
}


// ═══════════════════════════════════════════════════════════════════════════════
// § digestLoader — Per-folder stats from SQLite + graph aggregates
// ═══════════════════════════════════════════════════════════════════════════════

/** Strips last extension segment from a file basename (e.g. `note.md` -> `note`). */
function stripFileExtensionBasename(basename: string): string {
	const i = basename.lastIndexOf('.');
	if (i <= 0) return basename;
	return basename.slice(0, i);
}

/**
 * Splits a single basename into tokens: delimiters + simple camelCase boundaries.
 * Latin tokens are lowercased and must be length >= 2; CJK segments kept up to 32 chars.
 */
function tokenizeHubDigestBasename(rawBasename: string): string[] {
	const base = stripFileExtensionBasename(rawBasename.trim());
	if (!base) return [];
	const withCamel = base
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
	const parts = withCamel.split(/[\s\-_/\.，、]+/).filter(Boolean);
	const out: string[] = [];
	for (const p of parts) {
		const t = p.trim();
		if (!t) continue;
		if (/^[\x00-\x7f]+$/.test(t)) {
			const low = t.toLowerCase();
			if (low.length >= 2) out.push(low);
		} else if (t.length <= 32) {
			out.push(t.toLowerCase());
		}
	}
	return out;
}

/** Aggregates tokens from many basenames, returns top `maxTokens` by frequency (then lexicographic). */
export function topTokensFromBasenames(basenames: string[], maxTokens: number): string[] {
	const counts = new Map<string, number>();
	for (const name of basenames) {
		for (const tok of tokenizeHubDigestBasename(name)) {
			counts.set(tok, (counts.get(tok) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, Math.max(0, maxTokens))
		.map(([t]) => t);
}

const NAME_TOKEN_TOP = 6;

/** Weighted topic/keyword line for stats column. */
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

/** Herfindahl concentration on topic mass share [0,1]; higher = more single-topic. */
function topicPurityFromCounts(topicTagCounts: Map<string, number>): number {
	const total = [...topicTagCounts.values()].reduce((a, b) => a + b, 0);
	if (total <= 0) return 1;
	let h = 0;
	for (const v of topicTagCounts.values()) {
		const p = v / total;
		h += p * p;
	}
	return h;
}

function buildFolderDescription(f: { topicPurity: number; docCount: number; docOutgoing: number; childFolderCount: number; topTopics: string[] }): string {
	const theme = f.topTopics.slice(0, 2).join(', ') || 'mixed topics';
	if (f.topicPurity >= 0.5) return `Cohesive thematic branch around ${theme}.`;
	if (f.docOutgoing > 40) return `Strong outbound links (${f.docOutgoing}); likely cross-folder corridor.`;
	if (f.childFolderCount > 6) return `Wide container (${f.childFolderCount} subfolders); landing layer.`;
	return `Mixed coverage (${theme}); ${f.docCount} indexed notes in subtree.`;
}

type LoadedFolderDigests = {
	folderNodes: BackboneFolderNode[];
	/** Recursive indexed docs per folder path (for PageRank mass + edges). */
	recursiveMapsByFolder: Map<string, Array<{ id: string; path: string }>>;
	/** Global tag presence for TF-IDF-style ranking (virtual clusters reuse this). */
	tagGlobalStats: TagGlobalStats;
};

/**
 * Loads {@link BackboneFolderNode} rows for scanned folders; assigns stable `F-###` ids by scan order.
 */
async function loadBackboneFolderNodes(
	rows: FolderScanRow[],
	excludedPathPrefixes: string[],
	subtreeStatsMap: Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>,
): Promise<LoadedFolderDigests> {
	if (!sqliteStoreManager.isInitialized() || rows.length === 0) {
		return { folderNodes: [], recursiveMapsByFolder: new Map(), tagGlobalStats: { folderCount: 0, rootBucketCount: 1, tagFolderDf: new Map(), tagRootDf: new Map() } };
	}

	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const graphRepo = sqliteStoreManager.getGraphRepo();
	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo();

	const paths = rows.map((r) => r.path);
	const degreeMap = await mobiusRepo.listFolderDocDegreesByVaultPaths(paths);

	const vault = AppContext.getInstance().app.vault;
	const recursiveMapsByFolder = new Map<string, Array<{ id: string; path: string }>>();

	type RawRow = {
		row: FolderScanRow;
		np: string;
		maps: Array<{ id: string; path: string }>;
		topicTagCounts: Map<string, number>;
		keywordTagCounts: Map<string, number>;
		functionalTagCounts: Map<string, number>;
		deg: { incoming: number; outgoing: number };
	};

	const rawRows: RawRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		const np = normalizeVaultPath(row.path);
		const deg = degreeMap.get(np) ?? { incoming: 0, outgoing: 0 };
		let maps: Array<{ id: string; path: string }> = [];
		let topicTagCounts = new Map<string, number>();
		let keywordTagCounts = new Map<string, number>();
		let functionalTagCounts = new Map<string, number>();

		try {
			maps = await indexedDocumentRepo.getIdsByFolderPath(row.path);
			recursiveMapsByFolder.set(np, maps);
			const directMaps = maps.filter((m) => isDirectDocInFolder(m.path, row.path));
			if (directMaps.length > 0) {
				const docIds = directMaps.map((m) => m.id);
				const t = await graphRepo.getTagsByDocIds(docIds);
				topicTagCounts = t.topicTagCounts;
				keywordTagCounts = t.keywordTagCounts;
				functionalTagCounts = t.functionalTagCounts;
			}
		} catch {
			maps = [];
			recursiveMapsByFolder.set(np, []);
		}

		rawRows.push({ row, np, maps, topicTagCounts, keywordTagCounts, functionalTagCounts, deg });
	}

	const tagGlobalStats = buildTagGlobalStats(
		rawRows.map((r) => ({
			folderPath: r.np,
			topicTagCounts: r.topicTagCounts,
			keywordTagCounts: r.keywordTagCounts,
			functionalTagCounts: r.functionalTagCounts,
		})),
	);

	const TOP_TOPIC = 5;
	const TOP_KEYWORD = 6;
	const out: BackboneFolderNode[] = [];

	for (let i = 0; i < rawRows.length; i++) {
		const { row, np, maps, topicTagCounts, keywordTagCounts, functionalTagCounts, deg } = rawRows[i]!;
		const topTopics = rankMapByScore(topicTagCounts, 'topic', tagGlobalStats, TOP_TOPIC);
		const mergedKw = mergeKwFunctionalCounts(keywordTagCounts, functionalTagCounts);
		const topKeywords = rankMapByScore(mergedKw, 'keyword', tagGlobalStats, TOP_KEYWORD);
		const directFileMaps = maps.filter((m) => isDirectDocInFolder(m.path, row.path));
		const fileBasenames = directFileMaps.map((m) => basenameFromPath(m.path));
		let subfolderNameTokenSample: string[] = [];
		if (row.childFolderCount > 0) {
			const af = vault.getAbstractFileByPath(row.path);
			if (af instanceof TFolder) {
				subfolderNameTokenSample = topTokensFromBasenames(
					visibleChildFolders(af, excludedPathPrefixes).map((f) => basenameFromPath(f.path)), NAME_TOKEN_TOP);
			}
		}
		const st = subtreeStatsMap.get(np);
		out.push({
			id: `F-${String(i + 1).padStart(3, '0')}`,
			path: row.path,
			displayName: basenameFromPath(row.path) || row.path,
			depth: row.depth,
			childFolderCount: row.childFolderCount,
			subtreeMaxDepth: st?.subtreeMaxDepth ?? row.depth,
			subtreeAvgDepth: st?.subtreeAvgDepth ?? row.depth,
			docCount: maps.length,
			directDocCount: directFileMaps.length,
			topKeywords,
			topTopics,
			topTopicsWeighted: formatTopWeightedTopics(pickCounts(topicTagCounts, topTopics), pickCounts(mergedKw, topKeywords), 3),
			topicPurity: topicPurityFromCounts(topicTagCounts),
			docOutgoing: deg.outgoing,
			docIncoming: deg.incoming,
			fileNameTokenSample: fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, NAME_TOKEN_TOP) : [],
			subfolderNameTokenSample,
			pageRankMass: 0, semanticPageRankMass: 0, cityScore: 0, isCity: false, description: '',
		});
	}

	for (const n of out) {
		n.description = buildFolderDescription(n);
	}

	return { folderNodes: out, recursiveMapsByFolder, tagGlobalStats };
}

/** Maps document path -> immediate parent folder path (normalized). */
function parentFolderOfDocPath(docPath: string): string {
	return normalizeVaultPath(parentDirPath(docPath));
}

/** True when `docPath` is a direct file under `folderPath` (not in a subfolder). */
function isDirectDocInFolder(docPath: string, folderPath: string): boolean {
	return parentFolderOfDocPath(docPath) === normalizeVaultPath(folderPath);
}


// ═══════════════════════════════════════════════════════════════════════════════
// § supernodeResolve — Maps document paths to backbone supernodes
// ═══════════════════════════════════════════════════════════════════════════════

function parentFolderPath(folderPath: string): string {
	const segs = normalizeVaultPath(folderPath).split('/').filter(Boolean);
	return segs.length <= 1 ? '' : segs.slice(0, -1).join('/');
}

type SupernodeResolver = { resolve: (docPath: string) => string | undefined; label: (id: string) => string };

/** Builds a resolver: virtual members override folder assignment. */
function buildSupernodeResolver(folderNodes: BackboneFolderNode[], virtualNodes: BackboneVirtualNode[]): SupernodeResolver {
	const pathToFolder = new Map<string, BackboneFolderNode>();
	for (const f of folderNodes) pathToFolder.set(normalizeVaultPath(f.path), f);

	const docPathToVirtualId = new Map<string, string>();
	for (const v of virtualNodes) for (const p of v.memberDocPaths) {
		const np = normalizeVaultPath(p);
		if (!docPathToVirtualId.has(np)) docPathToVirtualId.set(np, v.id);
	}

	const idToLabel = new Map<string, string>();
	for (const f of folderNodes) idToLabel.set(f.id, `${f.displayName}/`);
	for (const v of virtualNodes) idToLabel.set(v.id, v.displayName);

	return {
		resolve: (docPath: string) => {
			const np = normalizeVaultPath(docPath);
			const vid = docPathToVirtualId.get(np);
			if (vid) return vid;
			let p = parentFolderOfDocPath(docPath);
			while (p) { const n = pathToFolder.get(p); if (n) return n.id; p = parentFolderPath(p); }
			return pathToFolder.get('')?.id;
		},
		label: (supernodeId: string) => idToLabel.get(supernodeId) ?? supernodeId,
	};
}


// ═══════════════════════════════════════════════════════════════════════════════
// § backboneEdges — Aggregates cross-supernode edges
// ═══════════════════════════════════════════════════════════════════════════════

type PairAgg = {
	from: string;
	to: string;
	referenceCount: number;
	semanticWeightSum: number;
	bridgePageRankMass: number;
};

function pairKey(from: string, to: string): string {
	return `${from}=>${to}`;
}

/**
 * Scans wiki reference + semantic edges; keeps directed cross-supernode pairs, then ranks by weight.
 */
async function buildBackboneEdges(options: {
	validDocIdSet: Set<string>;
	nodeIdToPath: Map<string, string>;
	prMap: Map<string, { pr: number; spr: number }>;
	resolver: SupernodeResolver;
	topK: number;
}): Promise<{ edges: BackboneEdge[]; pairCount: number }> {
	const { validDocIdSet, nodeIdToPath, prMap, resolver, topK } = options;
	const aggs = new Map<string, PairAgg>();

	function bump(
		fromId: string,
		toId: string,
		kind: 'ref' | 'sem',
		semW: number,
	): void {
		if (!validDocIdSet.has(fromId) || !validDocIdSet.has(toId)) return;
		const pFrom = nodeIdToPath.get(fromId);
		const pTo = nodeIdToPath.get(toId);
		if (!pFrom || !pTo) return;
		const s1 = resolver.resolve(pFrom);
		const s2 = resolver.resolve(pTo);
		if (!s1 || !s2 || s1 === s2) return;

		const prF = prMap.get(fromId)?.pr ?? 0;
		const prT = prMap.get(toId)?.pr ?? 0;
		const bridge = 0.5 * (prF + prT);

		const key = pairKey(s1, s2);
		let a = aggs.get(key);
		if (!a) {
			a = { from: s1, to: s2, referenceCount: 0, semanticWeightSum: 0, bridgePageRankMass: 0 };
			aggs.set(key, a);
		}
		if (kind === 'ref') {
			a.referenceCount += 1;
			a.bridgePageRankMass += bridge;
		} else {
			const w = Number.isFinite(semW) && semW > 0 ? semW : 0;
			a.semanticWeightSum += w;
			a.bridgePageRankMass += bridge * Math.min(1, w);
		}
	}

	if (!sqliteStoreManager.isInitialized()) {
		return { edges: [], pairCount: 0 };
	}

	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

	for await (const batch of edgeRepo.iterateReferenceEdgeBatches(2000)) {
		for (const e of batch) {
			bump(e.from_node_id, e.to_node_id, 'ref', 0);
		}
	}

	for await (const batch of edgeRepo.iterateSemanticRelatedEdgeBatches(2000)) {
		for (const e of batch) {
			bump(e.from_node_id, e.to_node_id, 'sem', e.weight);
		}
	}

	const scored = [...aggs.values()].map((a) => {
		const weight =
			a.referenceCount + 0.35 * a.semanticWeightSum + 0.5 * Math.min(50, a.bridgePageRankMass);
		const label = shortEdgeLabel(a.referenceCount, a.semanticWeightSum);
		return { ...a, weight, label };
	});

	scored.sort((x, y) => y.weight - x.weight);
	const picked = scored.slice(0, Math.max(1, topK));

	const edges: BackboneEdge[] = picked.map((a, i) => ({
		id: `H-${String(i + 1).padStart(3, '0')}`,
		fromId: a.from,
		toId: a.to,
		fromLabel: resolver.label(a.from),
		toLabel: resolver.label(a.to),
		weight: a.weight,
		referenceCount: a.referenceCount,
		semanticWeightSum: a.semanticWeightSum,
		bridgePageRankMass: a.bridgePageRankMass,
		label: a.label,
	}));

	return { edges, pairCount: aggs.size };
}

function shortEdgeLabel(ref: number, sem: number): string {
	if (ref > 0 && sem > 0) return 'refs + semantic';
	if (ref > 0) return 'references';
	return 'semantic';
}


// ═══════════════════════════════════════════════════════════════════════════════
// § pagerankMass — Batch-loads PageRank scalars from `mobius_node`
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns pagerank / semantic_pagerank per node id (0 when missing). */
async function loadDocPageranks(docIds: string[]): Promise<Map<string, { pr: number; spr: number }>> {
	const out = new Map<string, { pr: number; spr: number }>();
	if (!docIds.length || !sqliteStoreManager.isInitialized()) return out;
	const kdb = sqliteStoreManager.getIndexContext('vault');
	const safeNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
	for (let i = 0; i < docIds.length; i += 900) {
		const rows = await kdb.selectFrom('mobius_node').select(['node_id', 'pagerank', 'semantic_pagerank'])
			.where('node_id', 'in', docIds.slice(i, i + 900)).execute();
		for (const r of rows) out.set(String(r.node_id), { pr: safeNum(r.pagerank), spr: safeNum(r.semantic_pagerank) });
	}
	return out;
}


// ═══════════════════════════════════════════════════════════════════════════════
// § virtualFolders — Virtual folder clusters (prefix / topic) for messy dirs
// ═══════════════════════════════════════════════════════════════════════════════

const MIN_DIRECT = 8;
const MAX_PURITY = 0.42;
const MIN_CLUSTER = 3;
const MIN_RATIO = 0.18;

/** Leading alphanumeric run (lowercase) for prefix clustering. */
function prefixKeyFromBasename(basename: string): string {
	const noExt = basename.replace(/\.[^.]+$/, '');
	const m = noExt.match(/^([a-zA-Z][a-zA-Z0-9]{2,})/);
	if (m) return m[1]!.toLowerCase();
	const parts = noExt.split(/[-_\s]+/).filter(Boolean);
	return (parts[0] ?? '').toLowerCase().slice(0, 32);
}

/**
 * Builds virtual nodes for folders that look messy (many direct docs, low topic purity).
 */
async function buildVirtualNodesForMessyFolders(
	folderNodes: BackboneFolderNode[],
	enableVirtualFolders: boolean,
	tagGlobalStats: TagGlobalStats,
): Promise<BackboneVirtualNode[]> {
	if (!enableVirtualFolders || !sqliteStoreManager.isInitialized() || folderNodes.length === 0) {
		return [];
	}

	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const graphRepo = sqliteStoreManager.getGraphRepo();
	const out: BackboneVirtualNode[] = [];
	let vCounter = 0;

	for (const folder of folderNodes) {
		if (folder.directDocCount < MIN_DIRECT || folder.topicPurity > MAX_PURITY) continue;

		let maps: Array<{ id: string; path: string }> = [];
		try {
			maps = await indexedDocumentRepo.getIdsByFolderPath(folder.path);
		} catch {
			continue;
		}
		const direct = maps.filter((m) => isDirectDocInFolder(m.path, folder.path));
		if (direct.length < MIN_DIRECT) continue;

		const byPrefix = new Map<string, string[]>();
		for (const m of direct) {
			const base = basenameFromPath(m.path);
			const key = prefixKeyFromBasename(base);
			if (key.length < 3) continue;
			const arr = byPrefix.get(key) ?? [];
			arr.push(m.path);
			byPrefix.set(key, arr);
		}

		const nDirect = direct.length;
		for (const [key, paths] of byPrefix) {
			if (paths.length < MIN_CLUSTER) continue;
			if (paths.length / nDirect < MIN_RATIO) continue;
			vCounter++;
			const id = `V-${String(vCounter).padStart(3, '0')}`;
			let topTopics: string[] = [];
			let topKeywords: string[] = [];
			let topTopicsWeighted = '';
			let topicPurity = 1;
			try {
				const docIds = await indexedDocumentRepo.getIdsByPaths(paths);
				const ids = docIds.map((x) => x.id);
				if (ids.length) {
					const { topicTagCounts, keywordTagCounts, functionalTagCounts } = await graphRepo.getTagsByDocIds(ids);
					topicPurity = topicPurityFromCounts(topicTagCounts);
					topTopics = rankMapByScore(topicTagCounts, 'topic', tagGlobalStats, 4);
					const mkw = mergeKwFunctionalCounts(keywordTagCounts, functionalTagCounts);
					topKeywords = rankMapByScore(mkw, 'keyword', tagGlobalStats, 5);
					const weighted = formatTopWeightedTopics(pickCounts(topicTagCounts, topTopics), pickCounts(mkw, topKeywords), 3);
					if (weighted) topTopicsWeighted = weighted;
				}
			} catch {
				// keep empty
			}

			const displayName = `virtual-${key}/`;
			out.push({
				id,
				parentFolderPath: normalizeVaultPath(folder.path),
				displayName,
				kind: 'prefix',
				memberDocPaths: [...paths].sort(),
				memberCount: paths.length,
				parentDirectDocCount: nDirect,
				topKeywords,
				topTopics,
				topTopicsWeighted,
				topicPurity,
				docOutgoing: 0,
				pageRankMass: 0,
				description: `Filename prefix cluster "${key}" (${paths.length} notes).`,
			});
		}
	}

	return out;
}


// ═══════════════════════════════════════════════════════════════════════════════
// § renderBackboneMarkdown — Renders backbone map markdown (folder tree + highways)
// ═══════════════════════════════════════════════════════════════════════════════

type HighwayBlock = { sortKey: string; lines: string[] };

/**
 * Renders backbone edges: reciprocal pairs as `<==>`; same-source fan-out with aligned `==>` and `: label` on each line.
 */
function buildHighwayBodyLines(edgesOrdered: BackboneEdge[]): string[] {
	const byTriple = new Map<string, BackboneEdge>();
	for (const e of edgesOrdered) {
		byTriple.set(`${e.fromId}\0${e.toId}\0${e.label}`, e);
	}

	const consumed = new Set<string>();
	const reciprocalRows: Array<{ left: string; right: string; label: string; sortKey: string }> = [];

	for (const e of edgesOrdered) {
		if (consumed.has(e.id)) continue;
		const rev = byTriple.get(`${e.toId}\0${e.fromId}\0${e.label}`);
		if (rev && rev.id !== e.id) {
			const left = e.fromId.localeCompare(e.toId) <= 0 ? e.fromId : e.toId;
			const right = e.fromId.localeCompare(e.toId) <= 0 ? e.toId : e.fromId;
			const sortKey = `${left}\0${right}\0${e.label}`;
			reciprocalRows.push({
				left,
				right,
				label: e.label,
				sortKey,
			});
			consumed.add(e.id);
			consumed.add(rev.id);
		}
	}

	const remaining: BackboneEdge[] = [];
	for (const e of edgesOrdered) {
		if (!consumed.has(e.id)) remaining.push(e);
	}

	const byFrom = new Map<string, BackboneEdge[]>();
	for (const e of remaining) {
		const arr = byFrom.get(e.fromId) ?? [];
		arr.push(e);
		byFrom.set(e.fromId, arr);
	}
	for (const arr of byFrom.values()) {
		arr.sort((a, b) => {
			if (b.weight !== a.weight) return b.weight - a.weight;
			return a.toId.localeCompare(b.toId);
		});
	}

	const blocks: HighwayBlock[] = [];

	for (const r of reciprocalRows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
		blocks.push({
			sortKey: r.sortKey,
			lines: [`[${r.left}] <==> [${r.right}] : ${r.label}`],
		});
	}

	for (const fromId of [...byFrom.keys()].sort((a, b) => a.localeCompare(b))) {
		const arr = byFrom.get(fromId)!;
		const lines: string[] = [];
		if (arr.length === 1) {
			const e = arr[0]!;
			lines.push(`[${e.fromId}] ==> [${e.toId}] : ${e.label}`);
		} else {
			lines.push(`[${fromId}] ==> [${arr[0]!.toId}] : ${arr[0]!.label}`);
			const pad = ' '.repeat(`[${fromId}] `.length);
			for (let i = 1; i < arr.length; i++) {
				lines.push(`${pad}==> [${arr[i]!.toId}] : ${arr[i]!.label}`);
			}
		}
		blocks.push({
			sortKey: `${fromId}\0fan`,
			lines,
		});
	}

	blocks.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

	const out: string[] = [];
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) out.push('');
		out.push(...blocks[i]!.lines);
	}
	return out;
}

const sc = (s: string) => s.replace(/\|/g, ' ');
const purTier = (p: number) => (p >= 0.5 ? 'High' : p >= 0.28 ? 'Med' : 'Low');

function formatStatsGrid(direct: number, total: number, purity: number, subfolders: number, docOut: number, kwCol: string, topicCol: string): string {
	return `<| ${direct}/${total} | ${purity.toFixed(2)} (${purTier(purity)}) | ${subfolders} | ${docOut} | ${kwCol} | ${topicCol} |>`;
}

function fmtKwCol(keywords: string[], subTokens: string[], hasChildren: boolean): string {
	const kw = keywords.slice(0, 8).map(sc).filter(Boolean).join(', ');
	if (hasChildren && subTokens.length > 0) {
		const sub = subTokens.slice(0, 8).map(sc).join(', ');
		return kw ? `sub:${sub} | kw:${kw}` : `sub:${sub}`;
	}
	return kw || '—';
}

function fmtTopicCol(weighted: string, topics: string[]): string {
	const t = weighted.trim() || topics.slice(0, 4).join(', ');
	return t ? sc(t) : '—';
}

function nodeTreeLine(id: string, displayName: string, depth: number, bold: boolean, stats: string, endpointIds: Set<string>): string {
	const indent = '  '.repeat(Math.max(0, depth - 1));
	const name = displayName.endsWith('/') ? displayName.slice(0, -1) : displayName;
	const label = bold ? `**${name}/**` : `${name}/`;
	const hi = endpointIds.has(id) ? ' `[==>]`' : '';
	return `${indent}${id} ${label} ${stats}${hi}`;
}

const COLUMN_LEGEND = [
	'## Column legend (stats grid)', '',
	'`<| direct/total | topic purity (tier) | subfolders | doc-out | keywords | topics |>`', '',
	'- **direct/total** — Notes directly in this folder / all indexed notes in this folder subtree (recursive).',
	'- **topic purity (tier)** — Herfindahl concentration on **topic** tags of direct files only; tier High / Med / Low.',
	'- **subfolders** — Immediate child folder count (always **0** on `V-###` virtual rows).',
	'- **doc-out** — Outgoing wiki-style doc links: materialized on the folder node, or summed over member notes for virtual rows.',
	'- **keywords** — `sub:` tokens from immediate child folder names; `kw:` keyword tags from direct files (after global de-noising).',
	'- **topics** — Topic tags from direct files; may show weighted `name(%)` when available.',
	'- **`[==>]`** — This `F-###` or `V-###` is an endpoint of at least one High-Speed Link in the section below.', '',
];

/**
 * Renders full markdown and paginated folder-tree sections.
 */
function renderBackboneMarkdown(options: {
	folderNodes: BackboneFolderNode[];
	virtualNodes: BackboneVirtualNode[];
	backboneEdges: BackboneEdge[];
	maxNodesPerPage: number;
	/** Tags stripped from per-row kw/topics; shown once under the tree header. */
	noiseTagLegendLines?: string[];
}): { markdown: string; pages: BackbonePage[] } {
	const { folderNodes, virtualNodes, backboneEdges, maxNodesPerPage, noiseTagLegendLines = [] } = options;

	const edgesOrdered = [...backboneEdges].sort((a, b) => a.fromId.localeCompare(b.fromId) || b.weight - a.weight || a.toId.localeCompare(b.toId));

	const endpointIds = new Set<string>();
	for (const e of edgesOrdered) { endpointIds.add(e.fromId); endpointIds.add(e.toId); }

	const virtualByParent = new Map<string, BackboneVirtualNode[]>();
	for (const v of virtualNodes) {
		const p = normalizeVaultPath(v.parentFolderPath);
		const arr = virtualByParent.get(p) ?? [];
		arr.push(v);
		virtualByParent.set(p, arr);
	}
	for (const arr of virtualByParent.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

	const treeLines: string[] = ['# Folder Tree', ''];
	if (noiseTagLegendLines.length > 0) {
		treeLines.push('## Global status & high-frequency tags (not shown in folder rows)', '', noiseTagLegendLines.join(', '), '');
	}
	treeLines.push(...COLUMN_LEGEND);

	for (const f of folderNodes) {
		const stats = formatStatsGrid(f.directDocCount, f.docCount, f.topicPurity, f.childFolderCount, f.docOutgoing,
			fmtKwCol(f.topKeywords, f.subfolderNameTokenSample, f.childFolderCount > 0), fmtTopicCol(f.topTopicsWeighted, f.topTopics));
		treeLines.push(nodeTreeLine(f.id, f.displayName, f.depth, f.isCity, stats, endpointIds));
		const kids = virtualByParent.get(normalizeVaultPath(f.path));
		if (kids?.length) {
			for (const v of kids) {
				const vs = formatStatsGrid(v.memberCount, v.parentDirectDocCount, v.topicPurity, 0, v.docOutgoing,
					v.topKeywords.slice(0, 8).map(sc).filter(Boolean).join(', ') || '—', fmtTopicCol(v.topTopicsWeighted, v.topTopics));
				treeLines.push(nodeTreeLine(v.id, v.displayName, f.depth + 1, true, vs, endpointIds));
			}
		}
	}

	const highwayBody = buildHighwayBodyLines(edgesOrdered);

	const highwayLines: string[] = ['', '# High-Speed Links (The Backbone)', '', ...highwayBody];

	const fullMarkdown = [...treeLines, ...highwayLines].join('\n');

	const lim = Math.max(40, Math.min(500, maxNodesPerPage));
	const pageBodies: string[] = [];
	for (let i = 0; i < treeLines.length; i += lim) {
		pageBodies.push(treeLines.slice(i, i + lim).join('\n'));
	}

	const totalPages = Math.max(1, pageBodies.length);
	const pages: BackbonePage[] = pageBodies.map((markdown, pageIndex) => ({
		pageIndex,
		totalPages,
		markdown:
			pageIndex === totalPages - 1
				? `${markdown}\n${highwayLines.join('\n')}`
				: `${markdown}\n\n_(continued…)_\n`,
	}));

	return { markdown: fullMarkdown, pages };
}


// ═══════════════════════════════════════════════════════════════════════════════
// § buildBackboneMap — Main orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

function markCities(
	folderNodes: Array<{ pageRankMass: number; isCity: boolean; cityScore: number }>,
	cityPercentile: number,
): void {
	if (folderNodes.length === 0) return;
	const sorted = [...folderNodes].sort((a, b) => b.pageRankMass - a.pageRankMass);
	const n = Math.max(1, Math.ceil(sorted.length * Math.min(0.5, Math.max(0.01, cityPercentile))));
	const threshold = sorted[n - 1]!.pageRankMass;
	for (const f of folderNodes) {
		f.cityScore = f.pageRankMass;
		f.isCity = f.pageRankMass > 0 && f.pageRankMass >= threshold;
	}
}

/**
 * Builds the full backbone map from the vault index (SQLite + graph edges).
 */
export async function buildBackboneMap(options?: BuildBackboneMapOptions): Promise<BackboneMapResult> {
	const maxDepth = options?.maxDepth ?? 10;
	const maxFolders = options?.maxFolders ?? 8000;
	const maxNodesPerPage = options?.maxNodesPerPage ?? 120;
	const topBackboneEdges = options?.topBackboneEdges ?? 32;
	const cityPercentile = options?.cityPercentile ?? 0.05;
	const enableVirtualFolders = options?.enableVirtualFolders ?? true;
	const extraExclude = (options?.extraExcludePathPrefixes ?? []).map((p) => normalizeVaultPath(String(p)));

	const empty: BackboneMapResult = {
		folderNodes: [],
		virtualNodes: [],
		backboneEdges: [],
		metrics: {
			totalFolders: 0,
			totalVirtualNodes: 0,
			totalIndexedDocuments: 0,
			backboneEdgeCount: 0,
			cityFolderCount: 0,
		},
		markdown: '_SQLite index not ready; backbone map is empty._\n',
		pages: [],
		noiseTagLegend: [],
		debug: { folderIdByPath: {}, docCount: 0, edgeWeightSamples: [] },
	};

	if (!sqliteStoreManager.isInitialized()) {
		return empty;
	}

	const vault = AppContext.getInstance().app.vault;
	const root = vault.getRoot();
	const excluded = [...getBackboneExcludedPrefixes(), ...extraExclude.filter(Boolean)];
	const { rows, subtreeStats } = scanFolderTree(root, maxDepth, maxFolders, excluded);

	const { folderNodes, recursiveMapsByFolder, tagGlobalStats } = await loadBackboneFolderNodes(
		rows,
		excluded,
		subtreeStats,
	);

	const allDocIds = new Set<string>();
	const nodeIdToPath = new Map<string, string>();
	for (const maps of recursiveMapsByFolder.values()) {
		for (const m of maps) {
			allDocIds.add(m.id);
			nodeIdToPath.set(m.id, m.path);
		}
	}

	const virtualNodes = await buildVirtualNodesForMessyFolders(folderNodes, enableVirtualFolders, tagGlobalStats);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
	const virtualMemberRows = new Map<string, Array<{ id: string; path: string }>>();
	for (const v of virtualNodes) {
		const idRows = await indexedDocumentRepo.getIdsByPaths(v.memberDocPaths);
		virtualMemberRows.set(v.id, idRows);
		for (const r of idRows) {
			allDocIds.add(r.id);
			nodeIdToPath.set(r.id, r.path);
		}
		const memberIds = idRows.map((r) => r.id);
		v.docOutgoing = await mobiusNodeRepo.sumDocumentOutgoingByNodeIds(memberIds);
	}

	const prMap = await loadDocPageranks([...allDocIds]);

	for (const f of folderNodes) {
		const maps = recursiveMapsByFolder.get(normalizeVaultPath(f.path)) ?? [];
		let mass = 0;
		let smass = 0;
		for (const m of maps) {
			const p = prMap.get(m.id);
			mass += p?.pr ?? 0;
			smass += p?.spr ?? 0;
		}
		f.pageRankMass = mass;
		f.semanticPageRankMass = smass;
	}

	for (const v of virtualNodes) {
		const idRows = virtualMemberRows.get(v.id) ?? [];
		v.pageRankMass = idRows.reduce((s, r) => s + (prMap.get(r.id)?.pr ?? 0), 0);
	}

	markCities(folderNodes, cityPercentile);

	const resolver = buildSupernodeResolver(folderNodes, virtualNodes);

	const { edges: backboneEdges, pairCount } = await buildBackboneEdges({
		validDocIdSet: allDocIds,
		nodeIdToPath,
		prMap,
		resolver,
		topK: topBackboneEdges,
	});

	const noiseTagLegendLines = buildVaultNoiseTagLegend(tagGlobalStats);
	const { markdown, pages } = renderBackboneMarkdown({
		folderNodes,
		virtualNodes,
		backboneEdges,
		maxNodesPerPage,
		noiseTagLegendLines,
	});

	let totalIndexedDocuments = allDocIds.size;
	try {
		totalIndexedDocuments = await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows();
	} catch {
		// keep allDocIds.size
	}

	const folderIdByPath: Record<string, string> = {};
	for (const f of folderNodes) {
		folderIdByPath[normalizeVaultPath(f.path)] = f.id;
	}

	return {
		folderNodes,
		virtualNodes,
		backboneEdges,
		metrics: {
			totalFolders: folderNodes.length,
			totalVirtualNodes: virtualNodes.length,
			totalIndexedDocuments,
			backboneEdgeCount: backboneEdges.length,
			cityFolderCount: folderNodes.filter((f) => f.isCity).length,
		},
		markdown,
		pages,
		noiseTagLegend: noiseTagLegendLines,
		debug: {
			folderIdByPath,
			docCount: allDocIds.size,
			pairCountBeforeTopK: pairCount,
			edgeWeightSamples: backboneEdges.slice(0, 16).map((e) => ({
				fromId: e.fromId,
				toId: e.toId,
				weight: e.weight,
				referenceCount: e.referenceCount,
				semanticWeightSum: e.semanticWeightSum,
			})),
		},
	};
}
