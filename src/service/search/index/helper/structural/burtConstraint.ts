/**
 * Burt (1992) structural constraint coefficient.
 *
 * For each node i:
 *   C(i) = sum_j (p_ij + sum_q p_iq * p_qj)^2
 * where p_ij = w_ij / sum_k w_ik
 *
 * Low constraint = structural hole occupant (diverse, non-redundant contacts).
 * High constraint = embedded in single dense group.
 *
 * Isolated nodes (no neighbors): constraint = 1.0.
 * Typical range: 0.05 - 1.0.
 */

import type { AnalysisGraph } from './types';

export function computeConstraint(graph: AnalysisGraph): Map<string, number> {
	const { adjacency } = graph;
	const result = new Map<string, number>();

	for (const node of graph.nodes) {
		const neighbors = adjacency.get(node.id);
		if (!neighbors || neighbors.size === 0) {
			result.set(node.id, 1.0);
			continue;
		}

		// Compute total weight for node i
		let totalWeight = 0;
		for (const w of neighbors.values()) {
			totalWeight += w;
		}

		if (totalWeight === 0) {
			result.set(node.id, 1.0);
			continue;
		}

		// p_ij = w_ij / totalWeight(i)
		const p_i = new Map<string, number>();
		for (const [j, w] of neighbors) {
			p_i.set(j, w / totalWeight);
		}

		let constraint = 0;

		for (const [j, p_ij] of p_i) {
			// Compute indirect path through mutual neighbors q
			let indirect = 0;
			for (const [q, p_iq] of p_i) {
				if (q === j) continue;
				// Check if q is connected to j
				const qNeighbors = adjacency.get(q);
				if (!qNeighbors || !qNeighbors.has(j)) continue;

				// p_qj = w_qj / sum_k w_qk
				let qTotalWeight = 0;
				for (const w of qNeighbors.values()) {
					qTotalWeight += w;
				}
				if (qTotalWeight === 0) continue;

				const p_qj = qNeighbors.get(j)! / qTotalWeight;
				indirect += p_iq * p_qj;
			}

			const total = p_ij + indirect;
			constraint += total * total;
		}

		result.set(node.id, constraint);
	}

	return result;
}
