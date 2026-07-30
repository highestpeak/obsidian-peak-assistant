/**
 * Presentation-independent edge direction semantics shared by every graph
 * surface. `from` / `to` are meaningful only for directed edges; undirected
 * and bidirectional edges are coalesced by their unordered endpoint pair.
 */
export type GraphEdgeDirectionality = 'directed' | 'undirected' | 'bidirectional';

export interface DirectionalGraphEdge {
	from: string;
	to: string;
	kind: string;
	directionality?: GraphEdgeDirectionality;
}

const UNDIRECTED_EDGE_KINDS = new Set([
	'semantic',
	'semantic_related',
	'complements',
	'contrasts',
	'cross-domain',
]);

export function resolveGraphEdgeDirectionality(
	kind: string,
	explicit?: GraphEdgeDirectionality,
): GraphEdgeDirectionality {
	if (explicit) return explicit;
	return UNDIRECTED_EDGE_KINDS.has(kind) ? 'undirected' : 'directed';
}

interface EdgeGroup<T extends DirectionalGraphEdge> {
	first: T;
	firstDirected: T | null;
	hasForward: boolean;
	hasReverse: boolean;
	hasUndirected: boolean;
	hasBidirectional: boolean;
}

/**
 * Deduplicate graph edges without erasing direction:
 * - duplicate A -> B rows collapse;
 * - A -> B plus B -> A becomes one bidirectional edge;
 * - semantic/relation edges declared undirected collapse by unordered pair.
 */
export function coalesceGraphEdges<T extends DirectionalGraphEdge>(
	edges: readonly T[],
): Array<T & { directionality: GraphEdgeDirectionality }> {
	const groups = new Map<string, EdgeGroup<T>>();

	for (const edge of edges) {
		const directionality = resolveGraphEdgeDirectionality(edge.kind, edge.directionality);
		const low = edge.from <= edge.to ? edge.from : edge.to;
		const high = edge.from <= edge.to ? edge.to : edge.from;
		const key = `${edge.kind}\u0000${low}\u0000${high}`;
		let group = groups.get(key);
		if (!group) {
			group = {
				first: edge,
				firstDirected: null,
				hasForward: false,
				hasReverse: false,
				hasUndirected: false,
				hasBidirectional: false,
			};
			groups.set(key, group);
		}

		if (directionality === 'undirected') {
			group.hasUndirected = true;
			continue;
		}
		if (directionality === 'bidirectional') {
			group.hasBidirectional = true;
			continue;
		}

		group.firstDirected ??= edge;
		if (edge.from === low && edge.to === high) {
			group.hasForward = true;
		} else {
			group.hasReverse = true;
		}
	}

	const result: Array<T & { directionality: GraphEdgeDirectionality }> = [];
	for (const group of groups.values()) {
		if (group.hasBidirectional || (group.hasForward && group.hasReverse)) {
			result.push({ ...(group.firstDirected ?? group.first), directionality: 'bidirectional' });
			continue;
		}
		if (group.hasUndirected) {
			result.push({ ...group.first, directionality: 'undirected' });
			continue;
		}
		result.push({ ...(group.firstDirected ?? group.first), directionality: 'directed' });
	}
	return result;
}
