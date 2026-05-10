/**
 * Brandes (2001) betweenness centrality for undirected weighted graphs.
 *
 * Exact algorithm: O(VE)
 * For vaults > STRUCTURAL_ANALYSIS_APPROX_THRESHOLD nodes, uses k-sample approximation.
 *
 * Returns normalized betweenness centrality values in [0, 1].
 */

import type { AnalysisGraph } from './types';
import {
	STRUCTURAL_ANALYSIS_APPROX_THRESHOLD,
	STRUCTURAL_ANALYSIS_APPROX_K,
} from '@/core/constant';

/**
 * Single-source shortest-path BFS pass for Brandes algorithm.
 * Uses BFS (unweighted shortest paths) since our graph uses weights as adjacency indicators.
 */
function brandeSingleSource(
	graph: AnalysisGraph,
	s: string,
	CB: Map<string, number>,
): void {
	const adj = graph.adjacency;
	const stack: string[] = [];
	const P = new Map<string, string[]>();    // predecessors
	const sigma = new Map<string, number>();  // shortest path counts
	const d = new Map<string, number>();      // distance from source
	const delta = new Map<string, number>();  // dependency accumulator

	// Init
	for (const node of graph.nodes) {
		P.set(node.id, []);
		sigma.set(node.id, 0);
		d.set(node.id, -1);
		delta.set(node.id, 0);
	}

	sigma.set(s, 1);
	d.set(s, 0);

	// BFS
	const queue: string[] = [s];
	let head = 0;

	while (head < queue.length) {
		const v = queue[head++]!;
		stack.push(v);

		const dv = d.get(v)!;
		const sv = sigma.get(v)!;
		const neighbors = adj.get(v);
		if (!neighbors) continue;

		for (const [w] of neighbors) {
			const dw = d.get(w)!;
			// w found for the first time?
			if (dw < 0) {
				queue.push(w);
				d.set(w, dv + 1);
			}
			// Is edge (v, w) on a shortest path to w?
			if (d.get(w) === dv + 1) {
				sigma.set(w, sigma.get(w)! + sv);
				P.get(w)!.push(v);
			}
		}
	}

	// Backward pass: accumulate dependencies
	while (stack.length > 0) {
		const w = stack.pop()!;
		const sw = sigma.get(w)!;
		const dw = delta.get(w)!;
		for (const v of P.get(w)!) {
			const sv = sigma.get(v)!;
			const addition = (sv / sw) * (1 + dw);
			delta.set(v, delta.get(v)! + addition);
		}
		if (w !== s) {
			CB.set(w, CB.get(w)! + delta.get(w)!);
		}
	}
}

/**
 * Compute betweenness centrality using Brandes algorithm.
 * Returns Map<nodeId, normalizedBetweenness> in [0, 1].
 */
export function brandes(graph: AnalysisGraph): Map<string, number> {
	const n = graph.nodeCount;
	if (n <= 2) {
		const result = new Map<string, number>();
		for (const node of graph.nodes) result.set(node.id, 0);
		return result;
	}

	const CB = new Map<string, number>();
	for (const node of graph.nodes) CB.set(node.id, 0);

	// Determine source set: all nodes for exact, k-sample for approximate
	let sources: string[];
	let scaleFactor = 1;

	if (n > STRUCTURAL_ANALYSIS_APPROX_THRESHOLD) {
		// k-sample approximation
		const k = Math.min(STRUCTURAL_ANALYSIS_APPROX_K, n);
		const allIds = graph.nodes.map(n => n.id);
		// Fisher-Yates partial shuffle for k samples
		const shuffled = [...allIds];
		for (let i = 0; i < k; i++) {
			const j = i + Math.floor(Math.random() * (shuffled.length - i));
			[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
		}
		sources = shuffled.slice(0, k);
		scaleFactor = n / k;
	} else {
		sources = graph.nodes.map(n => n.id);
	}

	// Run single-source BFS for each source
	for (const s of sources) {
		brandeSingleSource(graph, s, CB);
	}

	// For undirected graphs, each pair is counted twice; divide by 2
	// Also apply scale factor for approximate mode
	for (const [nodeId, val] of CB) {
		CB.set(nodeId, (val / 2) * scaleFactor);
	}

	// Normalize by (n-1)(n-2) — standard betweenness normalization for undirected graphs
	const normFactor = (n - 1) * (n - 2);
	if (normFactor > 0) {
		for (const [nodeId, val] of CB) {
			CB.set(nodeId, val / normFactor);
		}
	}

	// Final normalization to [0, 1] by dividing by max
	let maxBC = 0;
	for (const val of CB.values()) {
		if (val > maxBC) maxBC = val;
	}
	if (maxBC > 0) {
		for (const [nodeId, val] of CB) {
			CB.set(nodeId, val / maxBC);
		}
	}

	return CB;
}
