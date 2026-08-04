import type {
	ConnectedLink,
	DiscoveredConnection,
} from '@/service/search/inspectorService';
import type {
	AtlasGraphData,
	AtlasGraphEdge,
	AtlasGraphNode,
} from '@/ui/view/file-atlas/FileAtlasHostPort';
import { coalesceGraphEdges } from '@/core/types/graph-edge';

const NEIGHBORHOOD_CAP = 60;

interface FileAtlasNeighborhoodDeps {
	getConnectedLinks(path: string): Promise<ConnectedLink[]>;
	getDiscoveredConnections(path: string): Promise<DiscoveredConnection[]>;
}

function basenameOf(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

/**
 * Builds the File Atlas neighborhood without changing the direction returned
 * by the index. Traversal is intentionally direction-agnostic; rendered edges
 * are not.
 */
export async function buildFileAtlasNeighborhood(
	path: string,
	opts: { hops: 1 | 2; semantic: boolean },
	deps: FileAtlasNeighborhoodDeps,
): Promise<AtlasGraphData> {
	const nodes = new Map<string, AtlasGraphNode>();
	const rawEdges: AtlasGraphEdge[] = [];
	nodes.set(path, { id: path, label: basenameOf(path), hop: 0, path });

	const addNode = (nodePath: string, hop: 1 | 2): boolean => {
		if (nodes.has(nodePath)) return true;
		if (nodes.size >= NEIGHBORHOOD_CAP) return false;
		nodes.set(nodePath, {
			id: nodePath,
			label: basenameOf(nodePath),
			hop,
			path: nodePath,
			sub: `Vault note · ${hop}-hop`,
		});
		return true;
	};

	const addEdge = (edge: AtlasGraphEdge): void => {
		if (!nodes.has(edge.from) || !nodes.has(edge.to)) return;
		rawEdges.push(edge);
	};

	const addReference = (centerPath: string, link: ConnectedLink): void => {
		const from = link.direction === 'in' ? link.path : centerPath;
		const to = link.direction === 'in' ? centerPath : link.path;
		addEdge({ from, to, kind: 'reference', directionality: 'directed' });
	};

	const oneHop = await deps.getConnectedLinks(path).catch(() => []);
	const firstRing = new Set<string>();
	for (const link of oneHop) {
		if (link.path === path) continue;
		if (!addNode(link.path, 1)) continue;
		addReference(path, link);
		firstRing.add(link.path);
	}

	if (opts.semantic) {
		const discovered = await deps.getDiscoveredConnections(path).catch(() => []);
		for (const connection of discovered) {
			if (connection.type !== 'SEM' || connection.path === path) continue;
			if (!addNode(connection.path, 1)) continue;
			addEdge({
				from: path,
				to: connection.path,
				kind: 'semantic',
				directionality: 'undirected',
			});
		}
	}

	if (opts.hops === 2) {
		for (const sourcePath of firstRing) {
			if (nodes.size >= NEIGHBORHOOD_CAP) break;
			const neighbors = await deps.getConnectedLinks(sourcePath).catch(() => []);
			for (const neighbor of neighbors) {
				if (neighbor.path === path || neighbor.path === sourcePath) continue;
				if (!addNode(neighbor.path, 2)) continue;
				addReference(sourcePath, neighbor);
			}
		}
	}

	return {
		nodes: [...nodes.values()],
		hubAnchors: [],
		edges: coalesceGraphEdges(rawEdges),
	};
}
