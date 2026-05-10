/**
 * Structural analysis pipeline orchestrator.
 *
 * Pipeline:
 * 1. Check staleness — skip if fresh and unchanged by < 10%
 * 2. buildAnalysisGraph() — load from vault SQLite
 * 3. brandes(graph) — betweenness centrality
 * 4. louvain(graph, resolution) — community detection
 * 5. computeConstraint(graph) — Burt constraint
 * 6. Build CommunityInfo array
 * 7. detectStructuralHoles() — gap identification
 * 8. Persist via StructuralAnalysisRepo
 * 9. Return StructuralAnalysisResult
 */

import type { CommunityInfo, StructuralAnalysisResult } from './types';
import { buildAnalysisGraph } from './buildAnalysisGraph';
import { brandes } from './brandesBetweenness';
import { louvain } from './louvainCommunity';
import { computeConstraint } from './burtConstraint';
import { detectStructuralHoles } from './gapDetection';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { LOUVAIN_RESOLUTION } from '@/core/constant';

/** Module-level debounce timer for incremental dirty recompute. */
let dirtyRecomputeTimer: ReturnType<typeof setTimeout> | null = null;

export interface RunStructuralAnalysisOptions {
	forceFullRecompute?: boolean;
	louvainResolution?: number;
}

export async function runStructuralAnalysis(
	options?: RunStructuralAnalysisOptions,
): Promise<StructuralAnalysisResult> {
	const resolution = options?.louvainResolution ?? LOUVAIN_RESOLUTION;
	const force = options?.forceFullRecompute ?? false;

	const repo = sqliteStoreManager.getStructuralAnalysisRepo();

	// Check freshness — skip if recent and unchanged by < 10%
	if (!force) {
		const lastComputedAt = await repo.getState('last_computed_at');
		const storedNodeCount = await repo.getState('node_count_at_computation');
		if (lastComputedAt && storedNodeCount) {
			const elapsed = Date.now() - Number(lastComputedAt);
			const hoursSinceCompute = elapsed / (1000 * 60 * 60);
			// Skip if computed within last 6 hours
			if (hoursSinceCompute < 6) {
				// Check node count change
				const currentKdb = sqliteStoreManager.getIndexContext('vault');
				const countResult = await currentKdb
					.selectFrom('mobius_node')
					.select(({ fn }) => fn.countAll<number>().as('cnt'))
					.where('type', 'in', ['document', 'hub_doc'])
					.executeTakeFirst();
				const currentCount = countResult?.cnt ?? 0;
				const storedCount = Number(storedNodeCount);
				const changeRatio = storedCount > 0 ? Math.abs(currentCount - storedCount) / storedCount : 1;
				if (changeRatio < 0.1) {
					// Return cached result
					const communities = await repo.getCommunities();
					const holes = await repo.getTopHoles(100);
					return {
						betweenness: new Map(),
						communities: new Map(),
						constraint: new Map(),
						communityInfos: communities,
						structuralHoles: holes,
						modularityQ: 0,
						analysisVersion: Number(await repo.getState('analysis_version') ?? '0'),
						computedAt: Number(lastComputedAt),
					};
				}
			}
		}
	}

	console.log('[structural-analysis] Starting structural analysis pipeline...');
	const startTime = Date.now();

	// Step 1: Build graph
	const graph = await buildAnalysisGraph();
	console.log(`[structural-analysis] Graph: ${graph.nodeCount} nodes, ${graph.edgeCount} edges`);

	if (graph.nodeCount === 0) {
		return {
			betweenness: new Map(),
			communities: new Map(),
			constraint: new Map(),
			communityInfos: [],
			structuralHoles: [],
			modularityQ: 0,
			analysisVersion: 0,
			computedAt: Date.now(),
		};
	}

	// Step 2: Brandes betweenness
	const betweenness = brandes(graph);

	// Step 3: Louvain community detection
	const { communities, modularityQ } = louvain(graph, resolution);

	// Step 4: Burt constraint
	const constraintMap = computeConstraint(graph);

	// Step 5: Build CommunityInfo array
	const communityMembers = new Map<string, string[]>();
	for (const [nodeId, comId] of communities) {
		if (!communityMembers.has(comId)) communityMembers.set(comId, []);
		communityMembers.get(comId)!.push(nodeId);
	}

	// Build node labels map
	const nodeLabels = new Map<string, string>();
	for (const node of graph.nodes) {
		// Use path-derived label
		const parts = node.path.split('/');
		const filename = parts[parts.length - 1] ?? node.path;
		nodeLabels.set(node.id, filename.replace(/\.md$/, ''));
	}

	const communityInfos: CommunityInfo[] = [];
	for (const [comId, members] of communityMembers) {
		// Internal density
		let internalEdges = 0;
		const memberSet = new Set(members);
		for (const nodeId of members) {
			const neighbors = graph.adjacency.get(nodeId);
			if (!neighbors) continue;
			for (const [neighbor] of neighbors) {
				if (memberSet.has(neighbor)) internalEdges++;
			}
		}
		// Each internal edge counted twice (undirected)
		internalEdges = internalEdges / 2;
		const maxInternalEdges = (members.length * (members.length - 1)) / 2;
		const internalDensity = maxInternalEdges > 0 ? internalEdges / maxInternalEdges : 0;

		// Top nodes by betweenness
		const topNodes = members
			.map(id => ({
				path: graph.nodes.find(n => n.id === id)?.path ?? id,
				label: nodeLabels.get(id) ?? id,
				betweenness: betweenness.get(id) ?? 0,
			}))
			.sort((a, b) => b.betweenness - a.betweenness)
			.slice(0, 5);

		communityInfos.push({
			id: comId,
			label: `Community ${comId.replace('c_', '')}`,
			memberCount: members.length,
			internalDensity,
			topNodes,
			dominantTopics: [], // Would require tagged_topic edge analysis
		});
	}

	// Step 6: Gap detection
	const structuralHoles = detectStructuralHoles({
		graph,
		betweenness,
		communities,
		constraint: constraintMap,
		communityInfos,
		nodeLabels,
	});

	// Step 7: Persist results
	const currentVersion = Number(await repo.getState('analysis_version') ?? '0') + 1;

	// Batch update mobius_node structural metrics
	const batchRows = graph.nodes.map(node => ({
		nodeId: node.id,
		betweenness: betweenness.get(node.id) ?? 0,
		constraint: constraintMap.get(node.id) ?? 1,
		communityId: communities.get(node.id) ?? '',
		version: currentVersion,
	}));
	await repo.batchUpdateStructuralMetrics(batchRows);

	// Upsert community metadata
	await repo.upsertCommunities(communityInfos, currentVersion);

	// Upsert structural holes
	await repo.upsertHoles(structuralHoles, currentVersion);

	// Update state
	await repo.setState('last_computed_at', String(Date.now()));
	await repo.setState('node_count_at_computation', String(graph.nodeCount));
	await repo.setState('analysis_version', String(currentVersion));

	const elapsed = Date.now() - startTime;
	console.log(`[structural-analysis] Complete in ${elapsed}ms: ${communityInfos.length} communities, ${structuralHoles.length} holes, Q=${modularityQ.toFixed(3)}`);

	return {
		betweenness,
		communities,
		constraint: constraintMap,
		communityInfos,
		structuralHoles,
		modularityQ,
		analysisVersion: currentVersion,
		computedAt: Date.now(),
	};
}

/**
 * Mark a node and its 1-hop neighbors as structurally dirty.
 * Triggers debounced full recompute if dirty count exceeds 20%.
 */
export async function markStructuralDirty(nodeId: string): Promise<void> {
	try {
		const repo = sqliteStoreManager.getStructuralAnalysisRepo();
		const kdb = sqliteStoreManager.getIndexContext('vault');

		// Get 1-hop neighbors from mobius_edge
		const neighborEdges = await kdb
			.selectFrom('mobius_edge')
			.select(['from_node_id', 'to_node_id'])
			.where(eb => eb.or([
				eb('from_node_id', '=', nodeId),
				eb('to_node_id', '=', nodeId),
			]))
			.execute();

		const dirtyIds = new Set([nodeId]);
		for (const edge of neighborEdges) {
			dirtyIds.add(edge.from_node_id);
			dirtyIds.add(edge.to_node_id);
		}

		await repo.markNodesDirty(Array.from(dirtyIds));

		// Check if dirty count exceeds threshold for automatic recompute
		const storedNodeCount = await repo.getState('node_count_at_computation');
		if (storedNodeCount) {
			const totalCount = Number(storedNodeCount);
			// Simple heuristic: if more than 20% dirty, schedule recompute
			if (dirtyIds.size / totalCount > 0.2) {
				if (dirtyRecomputeTimer) clearTimeout(dirtyRecomputeTimer);
				dirtyRecomputeTimer = setTimeout(() => {
					runStructuralAnalysis({ forceFullRecompute: true }).catch(console.error);
					dirtyRecomputeTimer = null;
				}, 30_000); // 30s debounce
			}
		}
	} catch (e) {
		console.warn('[structural-analysis] markStructuralDirty error (non-fatal):', e);
	}
}
