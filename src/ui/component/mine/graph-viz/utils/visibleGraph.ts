/**
 * Derives visible nodes and links from master graph + config (tags, semantic, fold).
 * Used before simulation and render so only visible subgraph is laid out and drawn.
 */
import type { GraphConfig } from '../config';
import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId, linkKey } from './link-key';

const defaultNormalize = (id: string) => id;

/**
 * Returns visible node ids and link keys. Cascade-prunes isolated nodes after hiding tags/folded.
 * When showTags is true, tag and other non-document nodes are included (MST/layout can use them).
 */
export function getVisibleGraph(
	nodes: GraphVizNode[],
	links: GraphVizLink[],
	config: Pick<GraphConfig, 'showTags' | 'showSemanticEdges'>,
	foldedSet: Set<string>,
	normalizeNodeId: (id: string) => string = defaultNormalize
): { visibleNodeIds: Set<string>; visibleLinkKeys: Set<string> } {
	const nodeById = new Map(nodes.map((n) => [n.id, n]));

	// 1) Build link list with endpoint ids; filter by showSemanticEdges
	const linkEntries: { key: string; from: string; to: string }[] = [];
	for (const l of links) {
		const from = getLinkEndpointId(l.source);
		const to = getLinkEndpointId(l.target);
		if (!nodeById.has(from) || !nodeById.has(to)) continue;
		if (!config.showSemanticEdges && l.kind === 'semantic') continue;
		linkEntries.push({ key: linkKey(l, normalizeNodeId), from, to });
	}

	// 2) Start with all node ids, then remove tags if !showTags, then remove folded
	let visibleNodeIds = new Set(nodes.map((n) => n.id));
	if (!config.showTags) {
		const tagIds = new Set(nodes.filter((n) => (n.type ?? '').toLowerCase() === 'tag').map((n) => n.id));
		visibleNodeIds = new Set(visibleNodeIds);
		tagIds.forEach((id) => visibleNodeIds.delete(id));
	}
	foldedSet.forEach((id) => visibleNodeIds.delete(id));

	// 3) Restrict links to those whose endpoints are in visibleNodeIds
	const linksInScope = linkEntries.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));

	// 4) Cascade: remove nodes that have degree 0 in the current visible graph until fixpoint
	let degree = new Map<string, number>();
	for (const id of visibleNodeIds) degree.set(id, 0);
	for (const e of linksInScope) {
		degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
		degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const id of visibleNodeIds) {
			if ((degree.get(id) ?? 0) === 0) {
				visibleNodeIds.delete(id);
				degree.set(id, -1);
				changed = true;
				for (const e of linksInScope) {
					if (e.from === id || e.to === id) {
						const other = e.from === id ? e.to : e.from;
						degree.set(other, Math.max(0, (degree.get(other) ?? 0) - 1));
					}
				}
			}
		}
	}

	// 5) Final visible link keys: both endpoints in visibleNodeIds
	const visibleLinkKeys = new Set<string>();
	for (const e of linksInScope) {
		if (visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)) visibleLinkKeys.add(e.key);
	}
	return { visibleNodeIds, visibleLinkKeys };
}

/**
 * Returns ids of "leaf" neighbors of root in the visible graph: neighbors with degree 1.
 * Used for fold mode (double-click to fold/unfold leaves).
 */
export function getLeavesOf(
	rootId: string,
	nodes: GraphVizNode[],
	links: GraphVizLink[],
	config: Pick<GraphConfig, 'showTags' | 'showSemanticEdges'>,
	foldedSet: Set<string>,
	normalizeNodeId: (id: string) => string = defaultNormalize
): string[] {
	const { visibleNodeIds, visibleLinkKeys } = getVisibleGraph(nodes, links, config, foldedSet, normalizeNodeId);
	if (!visibleNodeIds.has(rootId)) return [];
	const degree = new Map<string, number>();
	const neighbors = new Map<string, Set<string>>();
	for (const id of visibleNodeIds) {
		degree.set(id, 0);
		neighbors.set(id, new Set());
	}
	for (const l of links) {
		if (!visibleLinkKeys.has(linkKey(l, normalizeNodeId))) continue;
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		if (!visibleNodeIds.has(a) || !visibleNodeIds.has(b)) continue;
		degree.set(a, (degree.get(a) ?? 0) + 1);
		degree.set(b, (degree.get(b) ?? 0) + 1);
		neighbors.get(a)!.add(b);
		neighbors.get(b)!.add(a);
	}
	const rootNeighbors = neighbors.get(rootId);
	if (!rootNeighbors) return [];
	return [...rootNeighbors].filter((id) => (degree.get(id) ?? 0) === 1);
}
