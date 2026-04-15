import { buildSourcesGraphWithDiscoveredEdges } from '@/service/tools/search-graph-inspector/build-sources-graph';
import type { SearchResultItem } from '@/service/search/types';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

/**
 * Convert SearchResultItems into LensGraphData by discovering physical + semantic edges
 * via the SourcesGraph builder, then mapping to the multi-lens-graph format.
 */
export async function buildLensGraphFromSources(sources: SearchResultItem[]): Promise<LensGraphData> {
	const sg = await buildSourcesGraphWithDiscoveredEdges(sources);

	if (!sg) {
		return { nodes: [], edges: [], availableLenses: [] };
	}

	const nodes = sg.nodes.map((n) => ({
		label: n.label,
		path: n.attributes?.path ?? n.id,
		role: 'leaf' as const,
		group: (n.attributes?.path ?? n.id).split('/').slice(0, -1).join('/'),
	}));

	const edges = sg.edges.map((e) => ({
		source: e.from_node_id,
		target: e.to_node_id,
		kind: (e.kind === 'semantic' ? 'semantic' : 'link') as 'semantic' | 'link',
	}));

	return { nodes, edges, availableLenses: ['topology'] };
}

/**
 * Enrich a LensGraphData with thinking-tree structure (AI-inferred parent-child hierarchy).
 * Placeholder — implemented in Task 7.
 */
export async function enrichWithThinkingTree(currentData: LensGraphData): Promise<LensGraphData> {
	// Task 7 will implement AI-inferred thinking tree enrichment.
	// For now, return data as-is.
	return currentData;
}
