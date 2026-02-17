/**
 * Maximum spanning forest (Kruskal) for skeleton mode: keep highest-weight edges that connect nodes.
 * All MST edges are shown; leaf (degree-1) edges keep semantic/physical style, backbone edges use MST style.
 */
import type { GraphVizLink } from '../types';
import { getLinkEndpointId } from './link-key';

function ufFind(parent: Map<string, string>, id: string): string {
	if (!parent.has(id)) parent.set(id, id);
	const p = parent.get(id)!;
	if (p === id) return id;
	const root = ufFind(parent, p);
	parent.set(id, root);
	return root;
}

function ufUnion(parent: Map<string, string>, a: string, b: string): void {
	const ra = ufFind(parent, a);
	const rb = ufFind(parent, b);
	if (ra !== rb) parent.set(ra, rb);
}

/**
 * Normalize raw weight to [0,1] for MST selection.
 * - semantic: 0..1 unchanged; 0..100 as percent; larger values log-compressed.
 * - physical: log(1+w) compressed.
 */
export function normalizeEdgeWeight(kind: string, rawWeight: number): number {
	const w = typeof rawWeight === 'number' && rawWeight >= 0 ? rawWeight : 1;
	if (kind === 'semantic') {
		if (w <= 1) return w;
		if (w <= 100) return w / 100;
		return Math.min(1, Math.log(1 + w) / Math.log(1 + 1000));
	}
	return Math.min(1, Math.log(1 + w) / Math.log(1 + 100));
}

/** Returns the set of link keys that belong to a maximum spanning forest. */
export function computeMstEdgeKeys(
	links: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	getWeight?: (l: GraphVizLink) => number
): Set<string> {
	const parent = new Map<string, string>();
	const edgeByKey = new Map<string, { link: GraphVizLink; weight: number }>();

	for (const l of links) {
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		if (a === b) continue;
		const key = a < b ? `${a}::${b}` : `${b}::${a}`;
		const rawW = typeof l.weight === 'number' ? l.weight : 1;
		const w = getWeight ? getWeight(l) : rawW;
		const existing = edgeByKey.get(key);
		if (!existing || w > existing.weight) edgeByKey.set(key, { link: l, weight: w });
	}

	const sorted = [...edgeByKey.entries()].sort((x, y) => y[1].weight - x[1].weight);
	const result = new Set<string>();

	for (const [_key, { link }] of sorted) {
		const a = getLinkEndpointId(link.source);
		const b = getLinkEndpointId(link.target);
		if (ufFind(parent, a) === ufFind(parent, b)) continue;
		ufUnion(parent, a, b);
		result.add(linkKeyFn(link));
	}

	return result;
}

/**
 * Prune leaf nodes from MST iteratively. Returns reduced set of MST edge keys.
 * depth 0: no pruning; 1-3: remove leaves that many times.
 */
export function pruneMstEdgeKeys(
	mstKeys: Set<string>,
	links: GraphVizLink[],
	depth: number,
	linkKeyFn: (l: GraphVizLink) => string
): Set<string> {
	if (depth <= 0) return new Set(mstKeys);
	const mstLinks = links.filter((l) => mstKeys.has(linkKeyFn(l)));
	let currentKeys = new Set(mstKeys);
	for (let i = 0; i < depth; i++) {
		const degree = new Map<string, number>();
		for (const l of mstLinks) {
			if (!currentKeys.has(linkKeyFn(l))) continue;
			const a = getLinkEndpointId(l.source);
			const b = getLinkEndpointId(l.target);
			degree.set(a, (degree.get(a) ?? 0) + 1);
			degree.set(b, (degree.get(b) ?? 0) + 1);
		}
		const leaves = new Set<string>();
		for (const [id, d] of degree) if (d === 1) leaves.add(id);
		if (leaves.size === 0) break;
		const nextKeys = new Set<string>();
		for (const l of mstLinks) {
			const k = linkKeyFn(l);
			if (!currentKeys.has(k)) continue;
			const a = getLinkEndpointId(l.source);
			const b = getLinkEndpointId(l.target);
			if (!leaves.has(a) && !leaves.has(b)) nextKeys.add(k);
		}
		currentKeys = nextKeys;
	}
	return currentKeys;
}

/**
 * Backbone = 2-core of the MST: keep removing leaves until none remain.
 * Returns the set of edge keys that form the central spine (sparse, clear trunk).
 */
export function computeMstBackboneEdgeKeys(
	mstKeys: Set<string>,
	links: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string
): Set<string> {
	const mstLinks = links.filter((l) => mstKeys.has(linkKeyFn(l)));
	let currentKeys = new Set(mstKeys);
	for (;;) {
		const degree = new Map<string, number>();
		for (const l of mstLinks) {
			if (!currentKeys.has(linkKeyFn(l))) continue;
			const a = getLinkEndpointId(l.source);
			const b = getLinkEndpointId(l.target);
			degree.set(a, (degree.get(a) ?? 0) + 1);
			degree.set(b, (degree.get(b) ?? 0) + 1);
		}
		const leaves = new Set<string>();
		for (const [id, d] of degree) if (d === 1) leaves.add(id);
		if (leaves.size === 0) break;
		const nextKeys = new Set<string>();
		for (const l of mstLinks) {
			const k = linkKeyFn(l);
			if (!currentKeys.has(k)) continue;
			const a = getLinkEndpointId(l.source);
			const b = getLinkEndpointId(l.target);
			if (!leaves.has(a) && !leaves.has(b)) nextKeys.add(k);
		}
		if (nextKeys.size === currentKeys.size) break;
		currentKeys = nextKeys;
	}
	return currentKeys;
}

/** Returns link keys incident to leaf (degree-1) nodes in the MST. Leaf edges keep semantic/physical style in skeleton mode. */
export function computeMstLeafEdgeKeys(
	links: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	mstKeys: Set<string>
): Set<string> {
	const degree = new Map<string, number>();
	for (const l of links) {
		if (!mstKeys.has(linkKeyFn(l))) continue;
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		degree.set(a, (degree.get(a) ?? 0) + 1);
		degree.set(b, (degree.get(b) ?? 0) + 1);
	}
	const leafKeys = new Set<string>();
	for (const l of links) {
		if (!mstKeys.has(linkKeyFn(l))) continue;
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		if ((degree.get(a) ?? 0) === 1 || (degree.get(b) ?? 0) === 1) leafKeys.add(linkKeyFn(l));
	}
	return leafKeys;
}

/**
 * For each MST edge, the size of the smaller subtree when the edge is removed.
 * Used to treat only "real branches" (subtree size >= n) as backbone; smaller twigs use original style.
 */
export function computeMstMinSubtreeSizes(
	mstLinks: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string
): Map<string, number> {
	const result = new Map<string, number>();
	const nodeIds = new Set<string>();
	for (const l of mstLinks) {
		nodeIds.add(getLinkEndpointId(l.source));
		nodeIds.add(getLinkEndpointId(l.target));
	}
	const total = nodeIds.size;
	if (total === 0) return result;

	const adj = new Map<string, string[]>();
	for (const l of mstLinks) {
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		if (!adj.has(a)) adj.set(a, []);
		adj.get(a)!.push(b);
		if (!adj.has(b)) adj.set(b, []);
		adj.get(b)!.push(a);
	}

	function countReachable(from: string, exclude: string): number {
		const visited = new Set<string>();
		const stack = [from];
		visited.add(from);
		while (stack.length) {
			const u = stack.pop()!;
			for (const v of adj.get(u) ?? []) {
				if (v === exclude || visited.has(v)) continue;
				visited.add(v);
				stack.push(v);
			}
		}
		return visited.size;
	}

	for (const l of mstLinks) {
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		const k = linkKeyFn(l);
		const sizeA = countReachable(a, b);
		const sizeB = total - sizeA;
		result.set(k, Math.min(sizeA, sizeB));
	}
	return result;
}

/**
 * Backbone nodes = nodes incident to backbone edges (2-core of MST).
 */
export function computeMstBackboneNodeIds(
	mstLinks: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	backboneEdgeKeys: Set<string>
): Set<string> {
	const ids = new Set<string>();
	for (const l of mstLinks) {
		if (!backboneEdgeKeys.has(linkKeyFn(l))) continue;
		ids.add(getLinkEndpointId(l.source));
		ids.add(getLinkEndpointId(l.target));
	}
	return ids;
}

/**
 * For each node, the "branch root" = backbone node where this node's branch attaches.
 * Used to lay out branches in separate sectors so they don't overlap.
 */
export function computeMstBranchRootMap(
	mstLinks: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	backboneEdgeKeys: Set<string>
): Map<string, string> {
	const backboneIds = computeMstBackboneNodeIds(mstLinks, linkKeyFn, backboneEdgeKeys);
	const adj = new Map<string, string[]>();
	for (const l of mstLinks) {
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		if (!adj.has(a)) adj.set(a, []);
		adj.get(a)!.push(b);
		if (!adj.has(b)) adj.set(b, []);
		adj.get(b)!.push(a);
	}
	const result = new Map<string, string>();
	for (const start of backboneIds) result.set(start, start);
	const queue = Array.from(backboneIds);
	const visited = new Set(backboneIds);
	while (queue.length > 0) {
		const u = queue.shift()!;
		const root = result.get(u) ?? u;
		for (const v of adj.get(u) ?? []) {
			if (visited.has(v)) continue;
			visited.add(v);
			result.set(v, root);
			queue.push(v);
		}
	}
	return result;
}

/**
 * Edges that should use original (non-MST) style: leaves plus edges whose smaller subtree has fewer than minBranchNodes.
 */
export function computeMstTerminalEdgeKeys(
	links: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	mstKeys: Set<string>,
	minBranchNodes: number
): Set<string> {
	const mstLinks = links.filter((l) => mstKeys.has(linkKeyFn(l)));
	const leafKeys = computeMstLeafEdgeKeys(links, linkKeyFn, mstKeys);
	if (minBranchNodes <= 1) return leafKeys;
	const minSizes = computeMstMinSubtreeSizes(mstLinks, linkKeyFn);
	const terminal = new Set(leafKeys);
	for (const l of mstLinks) {
		const k = linkKeyFn(l);
		if (terminal.has(k)) continue;
		const minSize = minSizes.get(k) ?? 1;
		if (minSize < minBranchNodes) terminal.add(k);
	}
	return terminal;
}
