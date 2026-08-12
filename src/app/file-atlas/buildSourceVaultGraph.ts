import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import type { FileAtlasHostPort } from '@/ui/view/file-atlas/FileAtlasHostPort';

export type SourceVaultGraphScope = 'evidence' | 'one-hop' | 'two-hop';

const EMPTY_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: [],
	hubAnchors: [],
	edges: [],
	isolatedDocIds: [],
	overflowCount: 0,
};

/**
 * App-layer adapter shared by AI Sources and Composer. It materializes a
 * complete, immutable ResultSubgraph for the requested scope; switching a
 * presentation after this promise settles never re-runs search.
 */
export async function buildSourceVaultGraph(
	host: Pick<FileAtlasHostPort, 'loadNeighborhood'>,
	paths: readonly string[],
	scope: SourceVaultGraphScope,
): Promise<ResultSubgraphOutput> {
	const uniquePaths = [...new Set(paths.filter(Boolean))];
	if (uniquePaths.length === 0 || !host.loadNeighborhood) return EMPTY_SUBGRAPH;
	const hops = scope === 'two-hop' ? 2 : 1;
	const neighborhoods = await Promise.all(
		uniquePaths.map((path) => host.loadNeighborhood!(path, { hops, semantic: true })),
	);
	const sourceSet = new Set(uniquePaths);
	const nodes = new Map<string, ResultSubgraphOutput['resultNodes'][number]>();
	const edges = new Map<string, ResultSubgraphOutput['edges'][number]>();

	for (const graph of neighborhoods) {
		for (const node of graph.nodes) {
			const path = node.path ?? node.id;
			if (scope === 'evidence' && !sourceSet.has(path)) continue;
			const score = sourceSet.has(path) ? 1 : node.hop === 1 ? 0.6 : 0.3;
			nodes.set(node.id, {
				id: node.id,
				path,
				title: node.label,
				score,
				communityId: node.communityId ?? null,
				folder: path.split('/')[0] ?? '',
				...(node.summary ? { preview: node.summary } : {}),
				...(node.signals?.length ? { signals: node.signals } : {}),
				...(typeof node.incomingLinks === 'number' ? { incomingLinks: node.incomingLinks } : {}),
				...(typeof node.outgoingLinks === 'number' ? { outgoingLinks: node.outgoingLinks } : {}),
			});
		}
		for (const edge of graph.edges) {
			if (edge.kind === 'hub_constituent') continue;
			if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
			const key = `${edge.from}|${edge.to}|${edge.kind}`;
			edges.set(key, {
				from: edge.from,
				to: edge.to,
				kind: edge.kind,
				directionality: edge.directionality,
			});
		}
	}

	const connected = new Set<string>();
	for (const edge of edges.values()) {
		connected.add(edge.from);
		connected.add(edge.to);
	}
	return {
		resultNodes: [...nodes.values()],
		hubAnchors: [],
		edges: [...edges.values()],
		isolatedDocIds: [...nodes.keys()].filter((id) => !connected.has(id)),
		overflowCount: 0,
		communities: neighborhoods.flatMap((graph) => graph.communities ?? []),
	};
}
