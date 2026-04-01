/**
 * Virtual folder clusters (prefix / topic) for messy directories.
 */

import { basenameFromPath } from '@/core/utils/file-utils';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { BackboneFolderNode, BackboneVirtualNode } from './types';
import { formatTopWeightedTopics, isDirectDocInFolder, topicPurityFromCounts } from './digestLoader';
import type { TagGlobalStats } from './tagDisplayRank';
import {
	mergeKeywordFunctionalForPicked,
	pickCountsForWeightedLine,
	rankKeywordTagsForDisplay,
	rankTopicTagsForDisplay,
} from './tagDisplayRank';

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
export async function buildVirtualNodesForMessyFolders(
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
					topTopics = rankTopicTagsForDisplay(topicTagCounts, tagGlobalStats, 4);
					topKeywords = rankKeywordTagsForDisplay(keywordTagCounts, functionalTagCounts, tagGlobalStats, 5);
					const tp = pickCountsForWeightedLine(topicTagCounts, topTopics);
					const kp = mergeKeywordFunctionalForPicked(keywordTagCounts, functionalTagCounts, topKeywords);
					const weighted = formatTopWeightedTopics(tp, kp, 3);
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
