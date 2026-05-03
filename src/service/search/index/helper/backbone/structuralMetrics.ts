/**
 * Brandes betweenness centrality + Burt structural constraint coefficient.
 * Pure functions: no SQLite imports; safe to unit test.
 *
 * Streaming variant: edge data provided via callback, same pattern as documentPageRank.ts.
 */

import type { BrandesOptions } from './structuralTypes';

// ─── Brandes Betweenness Centrality ──────────────────────────────────────────

/**
 * Compute betweenness centrality for all nodes using Brandes' algorithm.
 * O(V*E) for unweighted graphs.
 *
 * For large graphs (V > 20K), use `approximate: true` with k-source sampling.
 *
 * @param nodeIds All node IDs in the graph
 * @param scanEdges Callback that streams all edges via visit(from, to, weight)
 * @param options Approximation options
 * @returns Map of nodeId → normalized betweenness centrality [0, 1]
 */
export async function computeBrandesBetweenness(
	nodeIds: readonly string[],
	scanEdges: (visit: (from: string, to: string, weight: number) => void) => Promise<void>,
	options?: BrandesOptions,
): Promise<Map<string, number>> {
	const n = nodeIds.length;
	if (n < 2) return new Map(nodeIds.map(id => [id, 0]));

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) idToIndex.set(nodeIds[i]!, i);

	// Build adjacency list (undirected — merge both directions)
	const adj: Array<Array<{ target: number; weight: number }>> = Array.from({ length: n }, () => []);
	await scanEdges((from, to, weight) => {
		const fi = idToIndex.get(from);
		const ti = idToIndex.get(to);
		if (fi !== undefined && ti !== undefined && fi !== ti) {
			adj[fi]!.push({ target: ti, weight });
			adj[ti]!.push({ target: fi, weight });
		}
	});

	// Betweenness accumulator
	const CB = new Float64Array(n);

	// Determine source set
	let sources: number[];
	if (options?.approximate && n > 100) {
		const k = options.kSources ?? Math.ceil(Math.sqrt(n));
		sources = sampleSources(n, Math.min(k, n));
	} else {
		sources = Array.from({ length: n }, (_, i) => i);
	}

	// Scale factor for approximation
	const scaleFactor = options?.approximate ? n / sources.length : 1;

	// Brandes main loop
	for (const s of sources) {
		// BFS from source s (unweighted — ignore edge weights for shortest path counting)
		const stack: number[] = [];
		const pred: number[][] = Array.from({ length: n }, () => []);
		const sigma = new Float64Array(n); // # shortest paths
		const dist = new Int32Array(n).fill(-1);
		const delta = new Float64Array(n);

		sigma[s] = 1;
		dist[s] = 0;
		const queue: number[] = [s];
		let head = 0;

		while (head < queue.length) {
			const v = queue[head++]!;
			stack.push(v);

			for (const { target: w } of adj[v]!) {
				// First visit?
				if (dist[w] < 0) {
					dist[w] = dist[v]! + 1;
					queue.push(w);
				}
				// Shortest path via v?
				if (dist[w] === dist[v]! + 1) {
					sigma[w] += sigma[v]!;
					pred[w]!.push(v);
				}
			}
		}

		// Back-propagation of dependencies
		delta.fill(0);
		while (stack.length > 0) {
			const w = stack.pop()!;
			for (const v of pred[w]!) {
				delta[v] += (sigma[v]! / sigma[w]!) * (1 + delta[w]!);
			}
			if (w !== s) {
				CB[w] += delta[w]! * scaleFactor;
			}
		}
	}

	// Normalize: divide by (n-1)(n-2) for undirected graph
	const normFactor = (n - 1) * (n - 2);
	const result = new Map<string, number>();
	if (normFactor > 0) {
		for (let i = 0; i < n; i++) {
			// Undirected: Brandes counts each pair twice, so divide by 2
			result.set(nodeIds[i]!, (CB[i]! / normFactor) * 2);
		}
	} else {
		for (let i = 0; i < n; i++) result.set(nodeIds[i]!, 0);
	}

	return result;
}

/** Fisher-Yates partial shuffle to sample k indices from [0, n). */
function sampleSources(n: number, k: number): number[] {
	const indices = Array.from({ length: n }, (_, i) => i);
	for (let i = 0; i < k; i++) {
		const j = i + Math.floor(Math.random() * (n - i));
		[indices[i], indices[j]] = [indices[j]!, indices[i]!];
	}
	return indices.slice(0, k);
}

// ─── Burt's Structural Constraint ───────────────────────────────────────────

/**
 * Compute Burt's structural constraint coefficient for all nodes.
 * C_i = Σ_j (p_ij + Σ_q p_iq * p_qj)²
 * where p_ij = strength(i→j) / Σ_k strength(i→k)
 *
 * Low constraint (< 0.3) = structural hole occupant (bridges diverse groups).
 * High constraint (> 0.7) = deeply embedded in a single cluster.
 *
 * @param nodeIds All node IDs
 * @param scanEdges Callback streaming edges
 * @returns Map of nodeId → constraint [0, 1+]
 */
export async function computeBurtConstraint(
	nodeIds: readonly string[],
	scanEdges: (visit: (from: string, to: string, weight: number) => void) => Promise<void>,
): Promise<Map<string, number>> {
	const n = nodeIds.length;
	if (n < 2) return new Map(nodeIds.map(id => [id, 1]));

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) idToIndex.set(nodeIds[i]!, i);

	// Build weighted adjacency (undirected, merge weights)
	const neighbors: Map<number, number>[] = Array.from({ length: n }, () => new Map());
	await scanEdges((from, to, weight) => {
		const fi = idToIndex.get(from);
		const ti = idToIndex.get(to);
		if (fi !== undefined && ti !== undefined && fi !== ti) {
			neighbors[fi]!.set(ti, (neighbors[fi]!.get(ti) ?? 0) + weight);
			neighbors[ti]!.set(fi, (neighbors[ti]!.get(fi) ?? 0) + weight);
		}
	});

	const result = new Map<string, number>();

	for (let i = 0; i < n; i++) {
		const nbrs = neighbors[i]!;
		if (nbrs.size === 0) {
			result.set(nodeIds[i]!, 1); // isolated node = fully constrained
			continue;
		}

		// Total strength from i
		let totalStrength = 0;
		for (const w of nbrs.values()) totalStrength += w;

		// p_ij = strength(i→j) / totalStrength
		let constraint = 0;
		for (const [j, wij] of nbrs) {
			const pij = wij / totalStrength;

			// Indirect constraint: Σ_q p_iq * p_qj
			let indirect = 0;
			for (const [q, wiq] of nbrs) {
				if (q === j) continue;
				const piq = wiq / totalStrength;
				const qNbrs = neighbors[q]!;
				const wqj = qNbrs.get(j);
				if (wqj !== undefined) {
					// p_qj = strength(q→j) / Σ_k strength(q→k)
					let qTotal = 0;
					for (const w of qNbrs.values()) qTotal += w;
					const pqj = wqj / qTotal;
					indirect += piq * pqj;
				}
			}

			constraint += (pij + indirect) ** 2;
		}

		result.set(nodeIds[i]!, constraint);
	}

	return result;
}
