/**
 * Builds a deterministic backbone map: folder tree, optional virtual clusters, cross-folder highways.
 */

import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { buildBackboneEdges } from './backboneEdges';
import { loadBackboneFolderNodes } from './digestLoader';
import { loadDocPageranks } from './pagerankMass';
import { renderBackboneMarkdown } from './renderBackboneMarkdown';
import { buildVaultNoiseTagLegend } from './tagDisplayRank';
import { buildSupernodeResolver } from './supernodeResolve';
import type { BackboneMapResult, BuildBackboneMapOptions } from './types';
import {
	buildFolderSubtreeStatsMap,
	collectFolderTreeRows,
	getBackboneExcludedPrefixes,
} from './vaultFolderScan';
import { buildVirtualNodesForMessyFolders } from './virtualFolders';

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
	const rows = collectFolderTreeRows(root, maxDepth, maxFolders, excluded);
	const subtreeStats = buildFolderSubtreeStatsMap(root, excluded);

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
