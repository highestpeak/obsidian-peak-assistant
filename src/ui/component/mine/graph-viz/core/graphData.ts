/**
 * Pure graph data operations: upsert nodes/edges, apply patch (remove, position, filter).
 * GraphDataCache maintains persistent Map<id, node> / Map<key, link> for incremental updates.
 */

import type { GraphVizNode, GraphVizLink } from '../types';
import { getLinkEndpointId } from '../utils/link-key';
import type { GraphPatch } from '../utils/graphPatches';

export type UpsertNodeInput = { id: string; label: string; type?: string; badges?: string[] };

type LinkRecord = { source: string; target: string; kind: string; weight: number };

export type GraphDataCacheOpts = {
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number };
	normalizeNodeId: (id: string) => string;
	defaultNodeType: string;
	defaultEdgeKind: string;
};

/**
 * Persistent cache of nodes and links for incremental applyPatch. Cleared on clear().
 */
export function createGraphDataCache() {
	const nodeById = new Map<string, GraphVizNode>();
	const linkByKey = new Map<string, LinkRecord>();

	function linkKey(s: string, t: string, kind: string, normalizeNodeId: (id: string) => string) {
		return `${normalizeNodeId(s)}::${normalizeNodeId(t)}::${kind}`;
	}

	return {
		applyPatch(
			patch: GraphPatch,
			opts: GraphDataCacheOpts
		): { nodes: GraphVizNode[]; links: GraphVizLink[] } {
			const { getNodeStyle, normalizeNodeId, defaultNodeType, defaultEdgeKind } = opts;

			// Upsert nodes into nodeById
			for (const n of patch.upsertNodes ?? []) {
				const id = String(n.id);
				const nodeType = String(n.type ?? defaultNodeType);
				const existing = nodeById.get(id);
				const style = getNodeStyle({
					id,
					label: String(n.label ?? id),
					type: nodeType,
					badges: n.badges,
					r: 0,
				} as GraphVizNode);
				const r = style.r ?? 10;
				if (existing) {
					existing.label = String(n.label ?? existing.label);
					existing.type = nodeType;
					existing.badges = n.badges ?? existing.badges;
				} else {
					nodeById.set(id, {
						id,
						label: String(n.label ?? id),
						type: nodeType,
						badges: n.badges,
						r,
						enterTime: typeof performance !== 'undefined' ? performance.now() : 0,
					} as GraphVizNode);
				}
			}

			// Upsert edges; ensure nodes exist
			const ensureNode = (id: string) => {
				if (nodeById.has(id)) return;
				const label = id.replace(/^(node:|concept:|tag:|file:)/i, '').replace(/-/g, ' ');
				const style = getNodeStyle({ id, label, type: defaultNodeType, badges: [], r: 0 } as GraphVizNode);
				const r = style.r ?? 10;
				nodeById.set(id, {
					id,
					label,
					type: defaultNodeType,
					badges: [] as string[],
					r,
					enterTime: typeof performance !== 'undefined' ? performance.now() : 0,
				} as GraphVizNode);
			};
			for (const e of patch.upsertEdges ?? []) {
				const source = String(e.from_node_id);
				const target = String(e.to_node_id);
				ensureNode(source);
				ensureNode(target);
				const kind = String(e.kind ?? defaultEdgeKind);
				// Keep edge weights finite; NaN would break downstream pathfinding cost comparisons.
				const weight = typeof e.weight === 'number' && Number.isFinite(e.weight) ? e.weight : 1;
				const k = linkKey(source, target, kind, normalizeNodeId);
				const existing = linkByKey.get(k);
				if (existing) existing.weight = weight;
				else linkByKey.set(k, { source, target, kind, weight });
			}

			// Remove nodes
			if (patch.removeNodeIds?.length) {
				const removeSet = new Set(patch.removeNodeIds.map(String));
				for (const id of removeSet) nodeById.delete(id);
				for (const [key, rec] of Array.from(linkByKey.entries())) {
					if (removeSet.has(rec.source) || removeSet.has(rec.target)) linkByKey.delete(key);
				}
			}

			const nodes = Array.from(nodeById.values());

			// Position new nodes near neighbors
			const nodeByIdLookup = new Map(nodes.map((n) => [n.id, n]));
			const spread = 90;
			for (const rec of linkByKey.values()) {
				const a = nodeByIdLookup.get(rec.source);
				const b = nodeByIdLookup.get(rec.target);
				if (!a || !b) continue;
				if ((a.x === undefined || a.y === undefined) && b.x !== undefined && b.y !== undefined) {
					a.x = b.x + (Math.random() - 0.5) * spread;
					a.y = b.y + (Math.random() - 0.5) * spread;
				}
				if ((b.x === undefined || b.y === undefined) && a.x !== undefined && a.y !== undefined) {
					b.x = a.x + (Math.random() - 0.5) * spread;
					b.y = a.y + (Math.random() - 0.5) * spread;
				}
			}

			const nodeIds = new Set(nodes.map((n) => n.id));
			const links: GraphVizLink[] = [];
			for (const rec of linkByKey.values()) {
				if (!nodeIds.has(rec.source) || !nodeIds.has(rec.target)) continue;
				const srcNode = nodeByIdLookup.get(rec.source);
				const tgtNode = nodeByIdLookup.get(rec.target);
				if (!srcNode || !tgtNode) continue;
				links.push({
					source: srcNode,
					target: tgtNode,
					kind: rec.kind,
					weight: Number.isFinite(rec.weight) ? rec.weight : 1,
				} as GraphVizLink);
			}

			return { nodes, links };
		},
		clear() {
			nodeById.clear();
			linkByKey.clear();
		},
	};
}

/**
 * Merge patch nodes into current nodes; assign radius from getNodeStyle.
 */
export function upsertNodes(
	currentNodes: GraphVizNode[],
	patchNodes: UpsertNodeInput[],
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number },
	defaultNodeType: string
): GraphVizNode[] {
	const map = new Map(currentNodes.map((n) => [n.id, n]));
	for (const n of patchNodes) {
		const id = String(n.id);
		const existing = map.get(id);
		const nodeType = String(n.type ?? defaultNodeType);
		const style = getNodeStyle({
			id,
			label: String(n.label ?? id),
			type: nodeType,
			badges: n.badges,
			r: 0,
		} as GraphVizNode);
		const r = style.r ?? 10;
		if (existing) {
			existing.label = String(n.label ?? existing.label);
			existing.type = nodeType;
			existing.badges = n.badges ?? existing.badges;
		} else {
			map.set(id, {
				id,
				label: String(n.label ?? id),
				type: nodeType,
				badges: n.badges,
				r,
			} as GraphVizNode);
		}
	}
	return Array.from(map.values());
}

export type UpsertEdgeInput = { from_node_id: string; to_node_id: string; weight?: number; kind?: string };

/**
 * Merge patch edges into current links; ensure nodes exist (create placeholder nodes if missing).
 * Returns updated nodes (with any new placeholders) and links with source/target as node refs.
 */
export function upsertEdges(
	currentNodes: GraphVizNode[],
	currentLinks: GraphVizLink[],
	patchEdges: UpsertEdgeInput[],
	normalizeNodeId: (id: string) => string,
	defaultNodeType: string,
	defaultEdgeKind: string,
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number }
): { nodes: GraphVizNode[]; links: GraphVizLink[] } {
	const nodeById = new Map(currentNodes.map((n) => [n.id, n]));
	const edgeKeyFromLink = (l: GraphVizLink): string => {
		const s = normalizeNodeId(getLinkEndpointId(l.source));
		const t = normalizeNodeId(getLinkEndpointId(l.target));
		return `${s}::${t}::${l.kind}`;
	};
	const map = new Map(currentLinks.map((l) => [edgeKeyFromLink(l), l]));

	function ensureNode(id: string): void {
		if (nodeById.has(id)) return;
		const label = id.replace(/^(node:|concept:|tag:|file:)/i, '').replace(/-/g, ' ');
		const style = getNodeStyle({ id, label, type: defaultNodeType, badges: [], r: 0 } as GraphVizNode);
		const r = style.r ?? 10;
		const newNode = { id, label, type: defaultNodeType, badges: [] as string[], r } as GraphVizNode;
		nodeById.set(id, newNode);
	}

	for (const e of patchEdges) {
		const source = String(e.from_node_id);
		const target = String(e.to_node_id);
		ensureNode(source);
		ensureNode(target);
		const kind = String(e.kind ?? defaultEdgeKind);
		const weight = typeof e.weight === 'number' ? e.weight : 1;
		const k = `${normalizeNodeId(source)}::${normalizeNodeId(target)}::${kind}`;
		if (!map.has(k)) {
			map.set(k, { source, target, kind, weight });
		} else {
			const existing = map.get(k)!;
			existing.weight = weight;
		}
	}

	const nodes = Array.from(nodeById.values());
	const result: GraphVizLink[] = [];
	for (const l of map.values()) {
		const srcId = getLinkEndpointId(l.source);
		const tgtId = getLinkEndpointId(l.target);
		const srcNode = nodeById.get(srcId);
		const tgtNode = nodeById.get(tgtId);
		if (srcNode && tgtNode) {
			result.push({ ...l, source: srcNode, target: tgtNode } as GraphVizLink);
		} else {
			result.push(l);
		}
	}
	return { nodes, links: result };
}

/**
 * Apply patch: upsert nodes/edges, remove nodes, position new nodes near neighbors, filter invalid links.
 * Returns { nodes, links } for caller to assign to refs.
 */
export function applyPatchLogic(
	currentNodes: GraphVizNode[],
	currentLinks: GraphVizLink[],
	patch: GraphPatch,
	opts: {
		getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number };
		normalizeNodeId: (id: string) => string;
		defaultNodeType: string;
		defaultEdgeKind: string;
	}
): { nodes: GraphVizNode[]; links: GraphVizLink[] } {
	let nodes = upsertNodes(
		currentNodes,
		patch.upsertNodes ?? [],
		opts.getNodeStyle,
		opts.defaultNodeType
	);
	const edgesResult = upsertEdges(
		nodes,
		currentLinks,
		(patch.upsertEdges ?? []).map((e) => ({
			from_node_id: e.from_node_id,
			to_node_id: e.to_node_id,
			weight: e.weight,
			kind: String(e.kind ?? opts.defaultEdgeKind),
		})),
		opts.normalizeNodeId,
		opts.defaultNodeType,
		opts.defaultEdgeKind,
		opts.getNodeStyle
	);
	nodes = edgesResult.nodes;
	let links = edgesResult.links;

	if (patch.removeNodeIds?.length) {
		const removeSet = new Set(patch.removeNodeIds.map(String));
		nodes = nodes.filter((n) => !removeSet.has(n.id));
		links = links.filter(
			(l) =>
				!removeSet.has(getLinkEndpointId(l.source)) && !removeSet.has(getLinkEndpointId(l.target))
		);
	}

	const nodeById = new Map(nodes.map((n) => [n.id, n]));
	const spread = 90;
	for (const l of links) {
		const a = nodeById.get(getLinkEndpointId(l.source));
		const b = nodeById.get(getLinkEndpointId(l.target));
		if (!a || !b) continue;
		if ((a.x === undefined || a.y === undefined) && b.x !== undefined && b.y !== undefined) {
			a.x = b.x + (Math.random() - 0.5) * spread;
			a.y = b.y + (Math.random() - 0.5) * spread;
		}
		if ((b.x === undefined || b.y === undefined) && a.x !== undefined && a.y !== undefined) {
			b.x = a.x + (Math.random() - 0.5) * spread;
			b.y = a.y + (Math.random() - 0.5) * spread;
		}
	}

	const nodeIds = new Set(nodes.map((n) => n.id));
	links = links.filter((link) => {
		const valid =
			nodeIds.has(getLinkEndpointId(link.source)) && nodeIds.has(getLinkEndpointId(link.target));
		if (!valid) {
			console.warn(
				`[GraphVisualization] Removing invalid edge: source="${getLinkEndpointId(link.source)}", target="${getLinkEndpointId(link.target)}"`
			);
		}
		return valid;
	});

	return { nodes, links };
}
