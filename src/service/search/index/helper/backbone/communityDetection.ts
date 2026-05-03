/**
 * Louvain community detection algorithm.
 * Pure functions: no SQLite imports; safe to unit test.
 *
 * Louvain maximizes modularity Q by iteratively moving nodes between communities.
 * Resolution parameter γ controls granularity: higher γ → more, smaller communities.
 */

import type { LouvainOptions } from './structuralTypes';

const DEFAULT_RESOLUTION = 1.0;
const DEFAULT_MAX_ITER = 100;
const MIN_MODULARITY_GAIN = 1e-6;

/**
 * Detect communities using the Louvain algorithm.
 *
 * @param nodeIds All node IDs
 * @param scanEdges Callback streaming edges
 * @param options Resolution and iteration limits
 * @returns Map of nodeId → communityId (0-indexed)
 */
export async function detectCommunities(
	nodeIds: readonly string[],
	scanEdges: (visit: (from: string, to: string, weight: number) => void) => Promise<void>,
	options?: LouvainOptions,
): Promise<Map<string, number>> {
	const n = nodeIds.length;
	if (n === 0) return new Map();

	const resolution = options?.resolution ?? DEFAULT_RESOLUTION;
	const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) idToIndex.set(nodeIds[i]!, i);

	// Build weighted adjacency (undirected)
	const adj: Array<Array<{ target: number; weight: number }>> = Array.from({ length: n }, () => []);
	let totalWeight = 0;

	await scanEdges((from, to, weight) => {
		const fi = idToIndex.get(from);
		const ti = idToIndex.get(to);
		if (fi !== undefined && ti !== undefined && fi !== ti) {
			adj[fi]!.push({ target: ti, weight });
			adj[ti]!.push({ target: fi, weight });
			totalWeight += weight; // each undirected edge counted once here
		}
	});

	if (totalWeight === 0) {
		// No edges: each node is its own community
		return new Map(nodeIds.map((id, i) => [id, i]));
	}

	// m = total edge weight (each undirected edge counted once in scanEdges, but adj stores both directions)
	const m = totalWeight;

	// Phase 1: Local moving — assign each node to its own community, then greedily move
	const community = new Int32Array(n);
	for (let i = 0; i < n; i++) community[i] = i;

	// Community aggregates
	// sigmaTot[c] = sum of degrees of all nodes in community c
	const sigmaTot = new Float64Array(n);
	// Degree of each node
	const degree = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let d = 0;
		for (const e of adj[i]!) d += e.weight;
		degree[i] = d;
		sigmaTot[i] = d; // initially each node is its own community
	}

	let improved = true;
	let iter = 0;
	while (improved && iter < maxIter) {
		improved = false;
		iter++;

		for (let i = 0; i < n; i++) {
			const currentCom = community[i]!;
			const ki = degree[i]!;

			// Compute weight of edges from i to each neighboring community
			const neighborComWeights = new Map<number, number>();
			let kiIn = 0; // edges from i to its own community
			for (const { target, weight } of adj[i]!) {
				const c = community[target]!;
				neighborComWeights.set(c, (neighborComWeights.get(c) ?? 0) + weight);
				if (c === currentCom) kiIn += weight;
			}

			// Remove i from its current community
			sigmaTot[currentCom] -= ki;

			// Find best community to move i into
			let bestCom = currentCom;
			let bestDeltaQ = 0;

			for (const [c, kiC] of neighborComWeights) {
				// ΔQ = [kiC/m - resolution * sigmaTot[c]*ki / (2*m²)]
				const deltaQ = kiC / m - resolution * (sigmaTot[c]! * ki) / (2 * m * m);
				if (deltaQ > bestDeltaQ) {
					bestDeltaQ = deltaQ;
					bestCom = c;
				}
			}

			// Also consider staying (deltaQ for removing from current)
			const deltaQStay = kiIn / m - resolution * (sigmaTot[currentCom]! * ki) / (2 * m * m);
			if (deltaQStay >= bestDeltaQ) {
				bestCom = currentCom;
			}

			// Move i to best community
			community[i] = bestCom;
			sigmaTot[bestCom] += ki;

			if (bestCom !== currentCom) {
				improved = true;
			}
		}
	}

	// Renumber communities to be contiguous 0..k-1
	const communityRemap = new Map<number, number>();
	let nextId = 0;
	const result = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		const c = community[i]!;
		if (!communityRemap.has(c)) {
			communityRemap.set(c, nextId++);
		}
		result.set(nodeIds[i]!, communityRemap.get(c)!);
	}

	return result;
}

/**
 * Compute modularity Q for a given community assignment.
 * Q = (1/2m) Σ_ij [A_ij - γ * ki*kj/(2m)] δ(ci, cj)
 */
export async function computeModularity(
	nodeIds: readonly string[],
	communityMap: Map<string, number>,
	scanEdges: (visit: (from: string, to: string, weight: number) => void) => Promise<void>,
	resolution: number = 1.0,
): Promise<number> {
	const n = nodeIds.length;
	if (n === 0) return 0;

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) idToIndex.set(nodeIds[i]!, i);

	const degree = new Float64Array(n);
	let m = 0;
	let intraEdgeWeight = 0;

	await scanEdges((from, to, weight) => {
		const fi = idToIndex.get(from);
		const ti = idToIndex.get(to);
		if (fi !== undefined && ti !== undefined && fi !== ti) {
			degree[fi] += weight;
			degree[ti] += weight;
			m += weight;

			const ci = communityMap.get(from);
			const cj = communityMap.get(to);
			if (ci === cj) {
				intraEdgeWeight += weight; // counted once per undirected edge
			}
		}
	});

	if (m === 0) return 0;

	// Sum of (ki * kj) for all pairs in same community
	const communityDegreeSum = new Map<number, number>();
	for (let i = 0; i < n; i++) {
		const c = communityMap.get(nodeIds[i]!)!;
		communityDegreeSum.set(c, (communityDegreeSum.get(c) ?? 0) + degree[i]!);
	}

	let expectedEdges = 0;
	for (const sum of communityDegreeSum.values()) {
		expectedEdges += sum * sum;
	}

	// Q = intraEdgeWeight/m - γ * Σ_c (Σ_c_degree / 2m)²
	return intraEdgeWeight / m - resolution * expectedEdges / (4 * m * m);
}
