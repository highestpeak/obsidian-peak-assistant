/**
 * Personalized PageRank via Forward Push (Andersen, Chung, Lang 2006).
 *
 * Pure function — no SQLite, no side effects. The caller supplies a
 * `getOutEdges` callback (sync or async) that returns weighted out-edges
 * for a given node.
 */

import {
	PPR_ALPHA,
	PPR_EPSILON,
	PPR_MAX_PUSH_OPS,
	PPR_MAX_MS,
} from '@/core/constant';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MultiLayerEdge = { to: string; weight: number };

export type PPRSeed = { nodeId: string; weight: number };

export type PPRResult = {
	scores: Map<string, number>;
	pushOps: number;
	nodesExplored: number;
	elapsedMs: number;
	truncated: boolean;
};

export type PPRConfig = {
	alpha?: number;
	epsilon?: number;
	maxPushOps?: number;
	maxMs?: number;
};

// ---------------------------------------------------------------------------
// Algorithm
// ---------------------------------------------------------------------------

/**
 * Compute Personalized PageRank scores using the Forward Push algorithm.
 *
 * @param seeds      - Seed nodes with initial weight distribution (weights need not sum to 1; normalized internally).
 * @param getOutEdges - Callback returning weighted out-edges for a node (sync or async).
 * @param config     - Optional overrides for alpha, epsilon, push-op cap, and time cap.
 */
export async function computePPR(
	seeds: PPRSeed[],
	getOutEdges: (nodeId: string) => MultiLayerEdge[] | Promise<MultiLayerEdge[]>,
	config: PPRConfig,
): Promise<PPRResult> {
	const alpha = config.alpha ?? PPR_ALPHA;
	const epsilon = config.epsilon ?? PPR_EPSILON;
	const maxPushOps = config.maxPushOps ?? PPR_MAX_PUSH_OPS;
	const maxMs = config.maxMs ?? PPR_MAX_MS;

	const startMs = Date.now();

	// Fast path: no seeds → empty result.
	if (seeds.length === 0) {
		return { scores: new Map(), pushOps: 0, nodesExplored: 0, elapsedMs: 0, truncated: false };
	}

	// Normalize seed weights to sum = 1.
	const totalSeedWeight = seeds.reduce((s, sd) => s + sd.weight, 0);
	if (totalSeedWeight <= 0) {
		return { scores: new Map(), pushOps: 0, nodesExplored: 0, elapsedMs: 0, truncated: false };
	}

	// State: estimate p[v], residual r[v].
	const p = new Map<string, number>();
	const r = new Map<string, number>();

	// Edge cache to avoid refetching.
	const edgeCache = new Map<string, MultiLayerEdge[]>();
	const nodesExplored = new Set<string>();

	// Normalized seed weights for dead-end teleport.
	const normalizedSeeds: Array<{ nodeId: string; w: number }> = seeds.map((s) => ({
		nodeId: s.nodeId,
		w: s.weight / totalSeedWeight,
	}));

	// Initialize residuals from seeds.
	for (const ns of normalizedSeeds) {
		r.set(ns.nodeId, (r.get(ns.nodeId) ?? 0) + ns.w);
		nodesExplored.add(ns.nodeId);
	}

	// Helper: get cached out-edges.
	async function getCachedOutEdges(nodeId: string): Promise<MultiLayerEdge[]> {
		let edges = edgeCache.get(nodeId);
		if (edges === undefined) {
			edges = await getOutEdges(nodeId);
			edgeCache.set(nodeId, edges);
			nodesExplored.add(nodeId);
		}
		return edges;
	}

	let pushOps = 0;
	let truncated = false;

	// Push loop.
	while (true) {
		// Check termination conditions.
		if (pushOps >= maxPushOps) {
			truncated = true;
			break;
		}
		if (Date.now() - startMs >= maxMs) {
			truncated = true;
			break;
		}

		// Find node v with max r[v] / outDegree(v) exceeding epsilon.
		let bestNode: string | null = null;
		let bestValue = 0;

		for (const [v, rv] of r) {
			if (rv <= 0) continue;
			const edges = await getCachedOutEdges(v);
			const outDegree = Math.max(edges.length, 1); // treat isolated nodes as degree 1
			const value = rv / outDegree;
			if (value > epsilon && value > bestValue) {
				bestValue = value;
				bestNode = v;
			}
		}

		if (bestNode === null) break; // converged

		const rv = r.get(bestNode)!;
		const edges = await getCachedOutEdges(bestNode);

		// 1. p[v] += alpha * r[v]
		p.set(bestNode, (p.get(bestNode) ?? 0) + alpha * rv);

		// 2. r[v] = 0  (must happen before distributing to avoid double-counting self-loops)
		r.set(bestNode, 0);

		// 3. Distribute (1 - alpha) * r[v] to neighbors proportional to edge weights.
		//    Dead-end nodes (no outgoing edges) teleport back to seed distribution,
		//    matching the random-walk semantics where a dead end forces a restart.
		const spread = (1 - alpha) * rv;
		if (edges.length > 0) {
			const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
			if (totalWeight > 0) {
				for (const edge of edges) {
					const fraction = edge.weight / totalWeight;
					const delta = spread * fraction;
					r.set(edge.to, (r.get(edge.to) ?? 0) + delta);
					nodesExplored.add(edge.to);
				}
			} else {
				// All-zero weights: teleport to seeds.
				for (const ns of normalizedSeeds) {
					r.set(ns.nodeId, (r.get(ns.nodeId) ?? 0) + spread * ns.w);
				}
			}
		} else {
			// Dead-end node: teleport (1-alpha)*r[v] back to seed distribution.
			for (const ns of normalizedSeeds) {
				r.set(ns.nodeId, (r.get(ns.nodeId) ?? 0) + spread * ns.w);
			}
		}

		pushOps++;
	}

	// Absorb remaining residual into estimates. Covers both:
	// - truncation: budget exhausted before convergence
	// - convergence: below-threshold residuals that were not worth pushing
	for (const [v, rv] of r) {
		if (rv > 0) {
			p.set(v, (p.get(v) ?? 0) + rv);
		}
	}

	const elapsedMs = Date.now() - startMs;

	return {
		scores: p,
		pushOps,
		nodesExplored: nodesExplored.size,
		elapsedMs,
		truncated,
	};
}
