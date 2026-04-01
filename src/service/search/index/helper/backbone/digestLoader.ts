/**
 * Loads per-folder stats from SQLite + graph aggregates for backbone nodes.
 */

import { TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { basenameFromPath } from '@/core/utils/file-utils';
import { normalizeVaultPath, parentDirPath } from '@/core/utils/vault-path-utils';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { topTokensFromBasenames } from '@/service/agents/hub-helper/hubDigestNameTokens';
import type { BackboneFolderNode } from './types';
import type { FolderScanRow } from './vaultFolderScan';
import { visibleChildFolders } from './vaultFolderScan';
import type { TagGlobalStats } from './tagDisplayRank';
import {
	buildTagGlobalStats,
	emptyTagGlobalStats,
	mergeKeywordFunctionalForPicked,
	pickCountsForWeightedLine,
	rankKeywordTagsForDisplay,
	rankTopicTagsForDisplay,
} from './tagDisplayRank';

export type { TagGlobalStats } from './tagDisplayRank';

const NAME_TOKEN_TOP = 6;

/** Weighted topic/keyword line for stats column. */
export function formatTopWeightedTopics(
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
export function topicPurityFromCounts(topicTagCounts: Map<string, number>): number {
	const total = [...topicTagCounts.values()].reduce((a, b) => a + b, 0);
	if (total <= 0) return 1;
	let h = 0;
	for (const v of topicTagCounts.values()) {
		const p = v / total;
		h += p * p;
	}
	return h;
}

function buildFolderDescription(f: {
	topicPurity: number;
	docCount: number;
	docOutgoing: number;
	childFolderCount: number;
	topTopics: string[];
}): string {
	const theme = f.topTopics.slice(0, 2).join(', ') || 'mixed topics';
	if (f.topicPurity >= 0.5) {
		return `Cohesive thematic branch around ${theme}.`;
	}
	if (f.docOutgoing > 40) {
		return `Strong outbound links (${f.docOutgoing}); likely cross-folder corridor.`;
	}
	if (f.childFolderCount > 6) {
		return `Wide container (${f.childFolderCount} subfolders); landing layer.`;
	}
	return `Mixed coverage (${theme}); ${f.docCount} indexed notes in subtree.`;
}

export type LoadedFolderDigests = {
	folderNodes: BackboneFolderNode[];
	/** Recursive indexed docs per folder path (for PageRank mass + edges). */
	recursiveMapsByFolder: Map<string, Array<{ id: string; path: string }>>;
	/** Global tag presence for TF-IDF-style ranking (virtual clusters reuse this). */
	tagGlobalStats: TagGlobalStats;
};

/**
 * Loads {@link BackboneFolderNode} rows for scanned folders; assigns stable `F-###` ids by scan order.
 */
export async function loadBackboneFolderNodes(
	rows: FolderScanRow[],
	excludedPathPrefixes: string[],
	subtreeStatsMap: Map<string, { subtreeMaxDepth: number; subtreeAvgDepth: number }>,
): Promise<LoadedFolderDigests> {
	if (!sqliteStoreManager.isInitialized() || rows.length === 0) {
		return { folderNodes: [], recursiveMapsByFolder: new Map(), tagGlobalStats: emptyTagGlobalStats() };
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
		const raw = rawRows[i]!;
		const row = raw.row;
		const np = raw.np;
		const maps = raw.maps;
		const docCount = maps.length;
		const topicPurity = topicPurityFromCounts(raw.topicTagCounts);
		const topTopics = rankTopicTagsForDisplay(raw.topicTagCounts, tagGlobalStats, TOP_TOPIC);
		const topKeywords = rankKeywordTagsForDisplay(
			raw.keywordTagCounts,
			raw.functionalTagCounts,
			tagGlobalStats,
			TOP_KEYWORD,
		);
		const topicPick = pickCountsForWeightedLine(raw.topicTagCounts, topTopics);
		const kwPick = mergeKeywordFunctionalForPicked(raw.keywordTagCounts, raw.functionalTagCounts, topKeywords);
		const weighted = formatTopWeightedTopics(topicPick, kwPick, 3);
		const topTopicsWeighted = weighted || '';

		let directDocCount = 0;
		try {
			directDocCount = await indexedDocumentRepo.countDirectDocumentsInFolder(row.path);
		} catch {
			directDocCount = 0;
		}

		const directFileMaps = maps.filter((m) => isDirectDocInFolder(m.path, row.path));
		const fileBasenames = directFileMaps.map((m) => basenameFromPath(m.path));
		const fileNameTokenSample =
			fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, NAME_TOKEN_TOP) : [];

		let subfolderNameTokenSample: string[] = [];
		if (row.childFolderCount > 0) {
			const af = vault.getAbstractFileByPath(row.path);
			if (af instanceof TFolder) {
				const childNames = visibleChildFolders(af, excludedPathPrefixes).map((f) => basenameFromPath(f.path));
				subfolderNameTokenSample = topTokensFromBasenames(childNames, NAME_TOKEN_TOP);
			}
		}

		const st = subtreeStatsMap.get(np);
		const subtreeMaxDepth = st?.subtreeMaxDepth ?? row.depth;
		const subtreeAvgDepth = st?.subtreeAvgDepth ?? row.depth;

		const id = `F-${String(i + 1).padStart(3, '0')}`;
		const displayName = basenameFromPath(row.path) || row.path;

		out.push({
			id,
			path: row.path,
			displayName,
			depth: row.depth,
			childFolderCount: row.childFolderCount,
			subtreeMaxDepth,
			subtreeAvgDepth,
			docCount,
			directDocCount,
			topKeywords,
			topTopics,
			topTopicsWeighted,
			topicPurity,
			docOutgoing: raw.deg.outgoing,
			docIncoming: raw.deg.incoming,
			fileNameTokenSample,
			subfolderNameTokenSample,
			pageRankMass: 0,
			semanticPageRankMass: 0,
			cityScore: 0,
			isCity: false,
			description: '',
		});
	}

	for (const n of out) {
		n.description = buildFolderDescription(n);
	}

	return { folderNodes: out, recursiveMapsByFolder, tagGlobalStats };
}

/** Maps document path -> immediate parent folder path (normalized). */
export function parentFolderOfDocPath(docPath: string): string {
	return normalizeVaultPath(parentDirPath(docPath));
}

/** True when `docPath` is a direct file under `folderPath` (not in a subfolder). */
export function isDirectDocInFolder(docPath: string, folderPath: string): boolean {
	return parentFolderOfDocPath(docPath) === normalizeVaultPath(folderPath);
}
