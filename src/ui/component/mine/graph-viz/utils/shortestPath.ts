/**
 * Dijkstra shortest path on visible graph. Undirected; cost = 1 / max(weight, eps).
 * When normalizeNodeId is provided, node set and link endpoints use normalized ids so pathfinding is consistent.
 */
import { SLICE_CAPS } from '@/core/constant';
import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId } from './link-key';

const EPS = 1e-6;

/**
 * Returns path as ordered node ids (in same space as sourceId/targetId) and set of link keys.
 * Link key format must match caller's (e.g. linkKey(l, normalizeNodeId)).
 * If normalizeNodeId is provided, sourceId/targetId and graph are interpreted in normalized id space.
 */
export function shortestPath(
	sourceId: string,
	targetId: string,
	nodes: GraphVizNode[],
	links: GraphVizLink[],
	linkKeyFn: (l: GraphVizLink) => string,
	normalizeNodeId?: (id: string) => string
): { pathNodeIds: string[]; pathLinkKeys: Set<string> } {
	const norm = normalizeNodeId ?? ((id: string) => id);
	const nodeIds = new Set(nodes.map((n) => norm(n.id)));
	if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
		console.debug('[GraphViz:Path:shortestPath] Early exit: source or target not in node set', JSON.stringify({
			sourceId,
			targetId,
			nodeCount: nodeIds.size,
			hasSource: nodeIds.has(sourceId),
			hasTarget: nodeIds.has(targetId),
		}));
		return { pathNodeIds: [], pathLinkKeys: new Set() };
	}

	const adj = new Map<string, Array<{ id: string; cost: number; link: GraphVizLink }>>();
	for (const id of nodeIds) adj.set(id, []);
	let linksSkipped = 0;
	for (const l of links) {
		const a = norm(getLinkEndpointId(l.source));
		const b = norm(getLinkEndpointId(l.target));
		if (!nodeIds.has(a) || !nodeIds.has(b)) {
			linksSkipped += 1;
			continue;
		}
		// Guard against NaN/Infinity weights; NaN would break Dijkstra relax comparisons (alt becomes NaN).
		const rawW = typeof l.weight === 'number' && Number.isFinite(l.weight) ? l.weight : 1;
		const w = Math.max(EPS, rawW > 0 ? rawW : 1);
		const cost = 1 / w;
		adj.get(a)!.push({ id: b, cost, link: l });
		adj.get(b)!.push({ id: a, cost, link: l });
	}
	const totalEdges = [...adj.values()].reduce((sum, arr) => sum + arr.length, 0);
	const sourceDegree = adj.get(sourceId)?.length ?? 0;
	console.debug('[GraphViz:Path:shortestPath] Graph built', {
		nodeCount: nodeIds.size,
		linkCount: links.length,
		linksSkipped,
		totalEdgesInAdj: totalEdges,
		sourceId,
		targetId,
		sourceDegree,
	});
	console.debug('[GraphViz:Path:shortestPath] Source neighbors sample', {
		sourceId,
		sourceDegree,
		neighbors: (adj.get(sourceId) ?? []).slice(0, SLICE_CAPS.graphViz.shortestPathNeighbors).map((x) => x.id),
	});

	// Dijkstra with a real heap (lazy updates). Do NOT pre-fill heap with Infinity nodes:
	// without heapify, extractMin may pop Infinity first and stop immediately.
	const dist = new Map<string, number>();
	const prev = new Map<string, { nodeId: string; link: GraphVizLink }>();
	const heap: Array<{ id: string; d: number }> = [];
	const less = (a: { id: string; d: number }, b: { id: string; d: number }) => {
		if (a.d === b.d) return false;
		return a.d < b.d;
	};
	const heapSwap = (i: number, j: number) => {
		const t = heap[i];
		heap[i] = heap[j];
		heap[j] = t;
	};
	const heapPush = (x: { id: string; d: number }) => {
		heap.push(x);
		let idx = heap.length - 1;
		while (idx > 0) {
			const p = (idx - 1) >> 1;
			if (!less(heap[idx], heap[p])) break;
			heapSwap(idx, p);
			idx = p;
		}
	};
	const heapPop = (): { id: string; d: number } | null => {
		if (heap.length === 0) return null;
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length > 0) {
			heap[0] = last;
			let idx = 0;
			while (true) {
				let best = idx;
				const l = 2 * idx + 1;
				const r = 2 * idx + 2;
				if (l < heap.length && less(heap[l], heap[best])) best = l;
				if (r < heap.length && less(heap[r], heap[best])) best = r;
				if (best === idx) break;
				heapSwap(idx, best);
				idx = best;
			}
		}
		return top;
	};

	dist.set(sourceId, 0);
	heapPush({ id: sourceId, d: 0 });

	let reachedTarget = false;
	while (heap.length > 0) {
		const u = heapPop();
		if (!u) break;
		const bestD = dist.get(u.id);
		if (bestD == null || u.d !== bestD) continue; // stale entry
		if (u.id === targetId) {
			reachedTarget = true;
			break;
		}
		const neighbors = adj.get(u.id);
		if (!neighbors) continue;
		for (const { id: v, cost, link } of neighbors) {
			const alt = u.d + cost;
			const cur = dist.get(v) ?? Infinity;
			if (alt < cur) {
				dist.set(v, alt);
				prev.set(v, { nodeId: u.id, link });
				heapPush({ id: v, d: alt });
			}
		}
	}

	const pathNodeIds: string[] = [];
	const pathLinkKeys = new Set<string>();
	let cur: string | undefined = targetId;
	while (cur) {
		pathNodeIds.unshift(cur);
		const p = prev.get(cur);
		if (!p) break;
		pathLinkKeys.add(linkKeyFn(p.link));
		cur = p.nodeId;
	}
	const pathValid = pathNodeIds[0] === sourceId;
	if (!pathValid) {
		console.debug('[GraphViz:Path:shortestPath] No path: Dijkstra result', JSON.stringify({
			reachedTarget,
			pathLength: pathNodeIds.length,
			pathFirst: pathNodeIds[0],
			sourceId,
			targetId,
			visitedCount: prev.size,
		}));
		return { pathNodeIds: [], pathLinkKeys: new Set() };
	}
	console.debug('[GraphViz:Path:shortestPath] Path found', JSON.stringify({ pathLength: pathNodeIds.length, pathNodeIds: pathNodeIds.slice(0, SLICE_CAPS.graphViz.shortestPathDebugIds) }));
	return { pathNodeIds, pathLinkKeys };
}
