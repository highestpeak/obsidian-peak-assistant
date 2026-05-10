/**
 * Loads document nodes and edges from SQLite into a weighted undirected adjacency map
 * for structural analysis (Brandes, Louvain, Burt).
 *
 * Edge weighting:
 *   - references      = 1.0
 *   - references_resource = 1.0
 *   - semantic_related = max(0.1, 1 - edge.weight) (inverted for path distance)
 *
 * Undirected: both A->B and B->A are inserted with the same weight.
 */

import type { AnalysisGraph, AnalysisNode } from './types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const INCLUDED_NODE_TYPES = ['document', 'hub_doc'] as const;
const INCLUDED_EDGE_TYPES = ['references', 'references_resource', 'semantic_related'] as const;

function edgeWeight(edgeType: string, rawWeight: number): number {
	if (edgeType === 'semantic_related') {
		return Math.max(0.1, 1 - rawWeight);
	}
	return 1.0;
}

export async function buildAnalysisGraph(): Promise<AnalysisGraph> {
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

	// Load all document/hub_doc nodes
	const kdb = sqliteStoreManager.getIndexContext('vault');
	const nodeRows = await kdb
		.selectFrom('mobius_node')
		.select(['node_id', 'path'])
		.where('type', 'in', [...INCLUDED_NODE_TYPES])
		.execute();

	const nodeIdSet = new Set<string>();
	const nodes: AnalysisNode[] = [];
	for (const row of nodeRows) {
		nodeIdSet.add(row.node_id);
		nodes.push({ id: row.node_id, path: row.path ?? row.node_id });
	}

	// Load all relevant edges
	const edgeRows = await kdb
		.selectFrom('mobius_edge')
		.select(['from_node_id', 'to_node_id', 'type', 'weight'])
		.where('type', 'in', [...INCLUDED_EDGE_TYPES])
		.execute();

	// Build undirected adjacency map
	const adjacency = new Map<string, Map<string, number>>();
	for (const node of nodes) {
		adjacency.set(node.id, new Map());
	}

	let edgeCount = 0;
	for (const edge of edgeRows) {
		// Only include edges where both endpoints are in our node set
		if (!nodeIdSet.has(edge.from_node_id) || !nodeIdSet.has(edge.to_node_id)) continue;
		if (edge.from_node_id === edge.to_node_id) continue; // skip self-loops

		const w = edgeWeight(edge.type, edge.weight);

		// Undirected: insert both directions, keeping max weight if duplicate
		const fromAdj = adjacency.get(edge.from_node_id)!;
		const toAdj = adjacency.get(edge.to_node_id)!;

		const existing = fromAdj.get(edge.to_node_id);
		if (existing === undefined || w > existing) {
			fromAdj.set(edge.to_node_id, w);
			toAdj.set(edge.from_node_id, w);
		}
		edgeCount++;
	}

	return {
		nodes,
		adjacency,
		nodeCount: nodes.length,
		edgeCount,
	};
}
