/**
 * Builds deterministic prep context: backbone map, hub world snapshot, folder digests, doc shortlist.
 */

import ignore from 'ignore';
import { TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { basenameFromPath } from '@/core/utils/file-utils';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { computeHubDiscoverBudgets } from '@/service/search/index/helper/hub/hubDiscover';
import { buildFolderHubEnrichmentMap } from '@/service/search/index/helper/hub/hubDiscover';
import type { MobiusNodeFolderHubDiscoveryRow } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { IgnoreService } from '@/service/search/IgnoreService';
import { buildBackboneMap } from '@/service/search/index/helper/backbone';
import { topTokensFromBasenames } from '@/service/search/index/helper/backbone/digestLoader';
import type { BackboneMapResult } from '@/service/search/index/helper/backbone';
import type {
	DocumentHubShortlistRow,
	FolderTreeNodeDigest,
	HubFolderTreePage,
	HubWorldSnapshot,
	WorldMetricsDigest,
} from './types';
import type { IntuitionPrepContext } from './types';

const BACKBONE_MARKDOWN_EXCERPT_MAX = 14_000;
/** Slightly tighter caps for intuition plan prompt token budget. */
const PLAN_FOLDER_DIGEST_MAX = 80;
const PLAN_DEEP_FOLDER_DIGEST_MAX = 48;
const PLAN_DOC_SHORTLIST_MAX = 80;
const HUB_DIGEST_NAME_TOKEN_TOP = 6;

// ─── Folder snapshot helpers ──────────────────────────────────────────────────

/** Settings-driven prefixes excluded from hub snapshot / explore (e.g. autosave). */
export function getExploreFolderExcludedPrefixes(): string[] {
	const settings = AppContext.getInstance().settings;
	const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
	if (!enabled) return [];
	const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
	const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
	return [...new Set([rootFolder, autoSaveFolder].filter(Boolean))];
}

function normalizeVaultFolderPath(folderPath: unknown): string {
	const raw = folderPath == null ? '' : String(folderPath).trim();
	if (raw === '' || raw === '/') return '';
	return raw.replace(/^\/+|\/+$/g, '');
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
type SubtreeDepthAgg = { sumDepths: number; count: number; maxDepth: number };

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

function visibleChildFolders(folder: TFolder, excludedPathPrefixes: string[]): TFolder[] {
	return folder.children
		.filter((c): c is TFolder => c instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path))
		.filter(
			(s) =>
				!isPathExcludedByPrefixes(s.path, excludedPathPrefixes) &&
				!shouldIgnoreFolderForHubSnapshot(s.path),
		);
}

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
	out.push({ path: folder.path, depth, childFolderCount: visibleSubs.length });
	if (out.length >= maxFolders || depth >= maxDepth) return;
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

function sanitizeDigestCell(text: string): string {
	return text.replace(/\|/g, ' ');
}

function compactTokenSampleList(tokens: string[], maxChars: number): string {
	if (!tokens.length) return '—';
	const s = tokens.join(', ');
	const t = s.length <= maxChars ? s : `${s.slice(0, Math.max(0, maxChars - 1))}…`;
	return sanitizeDigestCell(t);
}

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
	return [...merged.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxTopics)
		.map(([name, c]) => `${name}(${Math.round((100 * c) / total)}%)`)
		.join(', ');
}

async function chunkPages(
	nodes: FolderTreeNodeDigest[],
	maxNodesPerPage: number,
	tm: TemplateManager,
): Promise<HubFolderTreePage[]> {
	const lim = Math.max(64, Math.min(2000, Math.max(1, Math.floor(maxNodesPerPage))));
	if (nodes.length === 0) {
		const compactTreeMarkdown = await tm.render(IndexingTemplateId.HubDiscoveryFolderTreeEmpty, {});
		return [{ pageId: 'folder-page-empty', pageIndex: 0, totalPages: 1, compactTreeMarkdown, pathsOnPage: [] }];
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
		pages.push({ pageId: `folder-page-${pageIndex}`, pageIndex, totalPages: 0, compactTreeMarkdown, pathsOnPage: slice.map((n) => n.path) });
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
	return { totalIndexedDocuments, totalFoldersScanned: nodes.length, topLevelBranchCount, orphanHardSampleCount, orphanRiskHint, topOutgoingFolders };
}

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
		return { pages: [], metrics: { totalIndexedDocuments: 0, totalFoldersScanned: 0, topLevelBranchCount: 0, orphanHardSampleCount: 0, orphanRiskHint: 'low', topOutgoingFolders: [] }, nodes: [] };
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
				topTopics = [...topicTagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
				topKeywords = [...keywordTagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
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
		const fileNameTokenSample = fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, HUB_DIGEST_NAME_TOKEN_TOP) : [];
		let subfolderNameTokenSample: string[] = [];
		if (row.childFolderCount > 0) {
			const af = vault.getAbstractFileByPath(row.path);
			if (af instanceof TFolder) {
				const childNames = visibleChildFolders(af, excluded).map((f) => basenameFromPath(f.path));
				subfolderNameTokenSample = topTokensFromBasenames(childNames, HUB_DIGEST_NAME_TOKEN_TOP);
			}
		}
		const st = subtreeStatsMap.get(np);
		nodes.push({
			path: row.path,
			name: basenameFromPath(row.path),
			depth: row.depth,
			childFolderCount: row.childFolderCount,
			subtreeMaxDepth: st?.subtreeMaxDepth ?? row.depth,
			subtreeAvgDepth: st?.subtreeAvgDepth ?? row.depth,
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
	const enrichMap = folderRows.length > 0 ? await buildFolderHubEnrichmentMap(mobiusRepo, folderRows) : new Map();
	const folderRowByPath = new Map(folderRows.map((r) => [normalizeVaultPath(String(r.path ?? '')), r] as const));
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
		if (fr && typeof fr.hub_graph_score === 'number') n.hubGraphScore = fr.hub_graph_score;
	}
	const metrics = await buildWorldMetrics(nodes);
	const pages = await chunkPages(nodes, maxNodesPerPage, templateManager);
	return { pages, metrics, nodes };
}

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

// ─── Folder digest helpers (for plan prompts) ────────────────────────────────

function purityDigestCell(n: FolderTreeNodeDigest): string {
	const p = n.topicPurity;
	if (p === undefined || Number.isNaN(p)) return '—';
	const tier = p >= 0.65 ? 'High' : p >= 0.35 ? 'Med' : 'Low';
	return `${p.toFixed(2)} (${tier})`;
}

function containerDigestCell(n: FolderTreeNodeDigest): string {
	if (n.containerPenalty === undefined && n.strongChildDocShare === undefined && n.residualRatio === undefined) return '—';
	const pen = n.containerPenalty !== undefined ? n.containerPenalty.toFixed(2) : '—';
	const sc = n.strongChildDocShare !== undefined ? `${Math.round(n.strongChildDocShare * 100)}%` : '—';
	const res = n.residualRatio !== undefined ? `${Math.round(n.residualRatio * 100)}%` : '—';
	return `pen ${pen} · child ${sc} · res ${res}`;
}

function rankDigestCell(n: FolderTreeNodeDigest): string {
	const fr = n.folderRank;
	const hg = n.hubGraphScore;
	if (fr !== undefined && hg !== undefined) return `${fr.toFixed(2)} / ${hg.toFixed(2)}`;
	if (fr !== undefined) return fr.toFixed(2);
	if (hg !== undefined) return hg.toFixed(2);
	return '—';
}

function compareFolderDigestRows(a: FolderTreeNodeDigest, b: FolderTreeNodeDigest): number {
	const ra = a.folderRank ?? a.hubGraphScore ?? 0;
	const rb = b.folderRank ?? b.hubGraphScore ?? 0;
	if (rb !== ra) return rb - ra;
	const pa = a.topicPurity ?? 0;
	const pb = b.topicPurity ?? 0;
	if (pb !== pa) return pb - pa;
	return (a.containerPenalty ?? 0) - (b.containerPenalty ?? 0) || b.docCount - a.docCount;
}

export function buildFolderDigestMarkdown(nodes: FolderTreeNodeDigest[], maxLines: number): string {
	const sorted = [...nodes].sort(compareFolderDigestRows);
	const lines = sorted.slice(0, maxLines).map((n) => {
		const dt = `${n.directDocCount}/${n.docCount}`;
		const topics = n.topTopicsWeighted?.trim() || n.topTopics.slice(0, 3).join(', ') || '—';
		const safe = (s: string) => s.replace(/\|/g, ' ');
		return `| \`${n.path}\` | ${n.depth} | ${dt} | ${purityDigestCell(n)} | ${containerDigestCell(n)} | ${rankDigestCell(n)} | ${safe(topics)} | in ${n.docIncoming} / out ${n.docOutgoing} |`;
	});
	return [
		'| Path | Depth | Docs (direct/total) | Purity | Container | Rank (fr / hub) | Top topics (weighted) | Degrees (in/out) |',
		'| --- | ---: | --- | --- | --- | --- | --- | ---: |',
		...lines,
	].join('\n');
}

export function buildDeepFolderDigestMarkdown(nodes: FolderTreeNodeDigest[], maxLines: number): string {
	const scored = nodes
		.filter((n) => n.depth >= 3)
		.map((n) => ({
			node: n,
			score:
				(n.folderRank ?? n.hubGraphScore ?? 0) * 140
				+ (n.topicPurity ?? 0) * 55
				+ n.docCount * 0.45
				+ n.docOutgoing * 0.1
				+ Math.max(0, n.depth - 2) * 12
				+ Math.max(0, n.childFolderCount - 1) * 4
				- (n.containerPenalty ?? 0) * 30,
		}))
		.sort((a, b) => b.score - a.score || compareFolderDigestRows(a.node, b.node));
	const lines = scored.slice(0, maxLines).map(({ node: n }) => {
		const keywords = n.topKeywords.slice(0, 6).join(', ') || '—';
		const topics = n.topTopicsWeighted?.trim() || n.topTopics.slice(0, 4).join(', ') || '—';
		const safe = (s: string) => s.replace(/\|/g, ' ');
		return `| \`${n.path}\` | ${n.depth} | ${n.directDocCount}/${n.docCount} | ${purityDigestCell(n)} | ${n.childFolderCount} | ${n.docOutgoing} | ${safe(keywords)} | ${safe(topics)} |`;
	});
	if (lines.length === 0) return '_(No depth >= 3 folder candidates found in snapshot.)_';
	return [
		'| Path | Depth | Docs (d/t) | Purity | Subdirs | Out | Keywords | Topics |',
		'| --- | ---: | --- | --- | ---: | ---: | --- | --- |',
		...lines,
	].join('\n');
}

// ─── Prep context builders ────────────────────────────────────────────────────

function buildFolderTreePagesMarkdown(world: HubWorldSnapshot): string {
	if (world.pages.length === 0) return '_(No folder tree pages available.)_';
	return world.pages
		.map((p) => `### Folder tree page ${p.pageIndex + 1}/${p.totalPages}\n\n${p.compactTreeMarkdown}`)
		.join('\n\n');
}

function buildBackboneEdgesJson(backbone: BackboneMapResult): string {
	const edges = backbone.backboneEdges.slice(0, 24).map((e) => ({
		fromId: e.fromId,
		toId: e.toId,
		fromLabel: e.fromLabel,
		toLabel: e.toLabel,
		label: e.label,
		weight: e.weight,
		referenceCount: e.referenceCount,
	}));
	return JSON.stringify(edges);
}

function buildVaultSummaryMarkdown(
	world: HubWorldSnapshot,
	backbone: BackboneMapResult,
	indexBudgetRaw: ReturnType<typeof computeHubDiscoverBudgets>,
): string {
	const m = world.metrics;
	const b = backbone.metrics;
	const topOut = m.topOutgoingFolders
		.slice(0, 3)
		.map((x) => `\`${x.path}\` (${x.outgoing})`)
		.join(', ');
	return [
		`- Indexed documents (world): ${m.totalIndexedDocuments}`,
		`- Folders scanned (world): ${m.totalFoldersScanned}`,
		`- Top-level branches: ${m.topLevelBranchCount}`,
		`- Orphan risk: ${m.orphanRiskHint} (hard samples: ${m.orphanHardSampleCount})`,
		`- Top outgoing folders: ${topOut || '—'}`,
		`- Backbone: folders ${b.totalFolders}, virtual nodes ${b.totalVirtualNodes}, backbone edges ${b.backboneEdgeCount}, city folders ${b.cityFolderCount}`,
		`- Indexed documents (backbone): ${b.totalIndexedDocuments}`,
		`- Index budget limitTotal: ${indexBudgetRaw.limitTotal}`,
	].join('\n');
}

function buildBackboneEdgesMarkdown(backbone: BackboneMapResult): string {
	const edges = backbone.backboneEdges.slice(0, 24);
	if (edges.length === 0) return '_(No backbone edges in excerpt.)_';
	return edges
		.map((e) => {
			const w = typeof e.weight === 'number' && !Number.isNaN(e.weight) ? e.weight.toFixed(3) : String(e.weight);
			return `- ${e.fromLabel} → ${e.toLabel} · w ${w} · refs ${e.referenceCount} · ${e.label}`;
		})
		.join('\n');
}

function buildDocumentShortlistMarkdown(rows: DocumentHubShortlistRow[], maxLines: number): string {
	if (rows.length === 0) return '_(No document shortlist; index may be empty.)_';
	return rows
		.slice(0, maxLines)
		.map(
			(r) =>
				`- \`${r.path}\` · hub ${r.hubGraphScore.toFixed(2)} · in/out ${r.docIncoming}/${r.docOutgoing} · ${r.label}`,
		)
		.join('\n');
}

function buildBaselineExcludedMarkdown(prefixes: string[]): string {
	if (prefixes.length === 0) return '_(none)_';
	return prefixes.map((p) => `- \`${p}\``).join('\n');
}

function computeEntryPointsTargetCount(foldersScanned: number): number {
	const r = Math.round(foldersScanned / 11);
	return Math.min(24, Math.max(4, r));
}

function buildVaultScaleHintMarkdown(world: HubWorldSnapshot, backbone: BackboneMapResult): string {
	const m = world.metrics;
	const b = backbone.metrics;
	const f = m.totalFoldersScanned;
	const n = computeEntryPointsTargetCount(f);
	return [
		`- **Folders scanned** (snapshot) = **F**: ${f}`,
		`- **Target entry point count N** (host-computed): **${n}** — emit **exactly ${n}** distinct \`entryPoints\` objects.`,
		`- **Indexed documents** (world): ${m.totalIndexedDocuments}`,
		`- **Top-level branches**: ${m.topLevelBranchCount}`,
		`- **Backbone folder nodes** (map): ${b.totalFolders}`,
		`- **City folders** (navigation hubs): ${b.cityFolderCount}`,
	].join('\n');
}

function buildFolderSignalsMarkdown(folderTable: string, deepTable: string): string {
	return [
		'### Ranked folders (sample)',
		'',
		folderTable,
		'',
		'### Deep folder candidates (depth ≥ 3)',
		'',
		deepTable,
	].join('\n');
}

/**
 * Prepares template-ready context for knowledge intuition prompts.
 */
export async function prepareIntuitionContext(options: {
	userGoal: string;
	vaultName: string;
	currentDateLabel: string;
	tm: TemplateManager;
}): Promise<IntuitionPrepContext> {
	const { userGoal, vaultName, currentDateLabel, tm } = options;

	const documentNodeCount = sqliteStoreManager.isInitialized()
		? await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows()
		: 0;
	const indexBudgetRaw = computeHubDiscoverBudgets(documentNodeCount);
	const { limitTotal, documentFetchLimit, folderFetchLimit } = indexBudgetRaw;

	const globalTreeMaxDepth = Math.min(10, Math.max(6, 6 + Math.floor(limitTotal / 100)));
	const maxFoldersInSnapshot = Math.min(8000, Math.max(400, Math.floor(folderFetchLimit * 28)));
	const maxNodesPerPage = Math.min(2000, Math.max(320, Math.floor(limitTotal * 7)));
	const docShortlistLimit = Math.min(500, Math.max(50, Math.floor(documentFetchLimit * 2)));

	const baselineExcludedPrefixes = getExploreFolderExcludedPrefixes();

	const world = await buildHubWorldSnapshot(
		{
			maxDepth: globalTreeMaxDepth,
			maxFolders: maxFoldersInSnapshot,
			maxNodesPerPage,
			extraExcludePathPrefixes: [],
		},
		tm,
	);

	const backbone = await buildBackboneMap({
		maxDepth: globalTreeMaxDepth,
		maxFolders: maxFoldersInSnapshot,
		maxNodesPerPage,
		topBackboneEdges: Math.min(48, Math.max(16, Math.floor(limitTotal / 8))),
		extraExcludePathPrefixes: [],
	});

	const documentShortlist = await buildDocumentHubShortlist(docShortlistLimit);

	const folderDigestMarkdown = buildFolderDigestMarkdown(world.nodes, PLAN_FOLDER_DIGEST_MAX);
	const deepFolderDigestMarkdown = buildDeepFolderDigestMarkdown(world.nodes, PLAN_DEEP_FOLDER_DIGEST_MAX);
	const folderSignalsMarkdown = buildFolderSignalsMarkdown(folderDigestMarkdown, deepFolderDigestMarkdown);

	const folderTreeMarkdown = buildFolderTreePagesMarkdown(world);

	const backboneMarkdownExcerpt =
		backbone.markdown.length <= BACKBONE_MARKDOWN_EXCERPT_MAX
			? backbone.markdown
			: `${backbone.markdown.slice(0, BACKBONE_MARKDOWN_EXCERPT_MAX)}\n\n_(truncated)_`;

	const backboneEdgesJson = buildBackboneEdgesJson(backbone);
	const backboneEdgesMarkdown = buildBackboneEdgesMarkdown(backbone);
	const vaultSummaryMarkdown = buildVaultSummaryMarkdown(world, backbone, indexBudgetRaw);
	const documentShortlistMarkdown = buildDocumentShortlistMarkdown(documentShortlist, PLAN_DOC_SHORTLIST_MAX);
	const baselineExcludedMarkdown = buildBaselineExcludedMarkdown(baselineExcludedPrefixes);
	const vaultScaleHintMarkdown = buildVaultScaleHintMarkdown(world, backbone);

	const worldMetricsForPrompt: Record<string, unknown> = {
		...world.metrics,
		indexBudgetRaw,
		backboneMetrics: backbone.metrics,
	};

	return {
		tm,
		userGoal,
		vaultName,
		currentDateLabel,
		baselineExcludedPrefixes,
		worldMetricsForPrompt,
		backbone,
		world,
		documentShortlist,
		folderSignalsMarkdown,
		vaultSummaryMarkdown,
		backboneEdgesMarkdown,
		documentShortlistMarkdown,
		baselineExcludedMarkdown,
		vaultScaleHintMarkdown,
		folderTreeMarkdown,
		backboneMarkdownExcerpt,
		backboneEdgesJson,
		indexBudgetRaw,
	};
}
