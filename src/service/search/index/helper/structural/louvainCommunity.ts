/**
 * Louvain (Blondel et al. 2008) community detection for undirected weighted graphs.
 *
 * Deterministic: traverses nodes in sorted node_id order.
 * Post-process: communities < LOUVAIN_MIN_COMMUNITY_SIZE are merged into nearest.
 */

import type { AnalysisGraph } from './types';
import { LOUVAIN_MIN_COMMUNITY_SIZE } from '@/core/constant';

interface LouvainResult {
	communities: Map<string, string>;  // nodeId -> communityId
	modularityQ: number;
}

/**
 * Compute total edge weight (m) = sum of all edge weights / 2 (since undirected, each stored once in adjacency per direction).
 */
function totalWeight(adjacency: Map<string, Map<string, number>>): number {
	let total = 0;
	for (const neighbors of adjacency.values()) {
		for (const w of neighbors.values()) {
			total += w;
		}
	}
	return total / 2; // Each edge counted twice in undirected adjacency
}

/**
 * Compute current modularity Q.
 */
function computeModularity(
	adjacency: Map<string, Map<string, number>>,
	community: Map<string, string>,
	m: number,
): number {
	if (m === 0) return 0;

	// Compute degree of each node (sum of edge weights)
	const degree = new Map<string, number>();
	for (const [nodeId, neighbors] of adjacency) {
		let k = 0;
		for (const w of neighbors.values()) k += w;
		degree.set(nodeId, k);
	}

	let Q = 0;
	for (const [i, neighbors] of adjacency) {
		const ci = community.get(i)!;
		const ki = degree.get(i)!;
		for (const [j, wij] of neighbors) {
			if (community.get(j) !== ci) continue;
			const kj = degree.get(j)!;
			Q += wij - (ki * kj) / (2 * m);
		}
	}
	return Q / (2 * m);
}

export function louvain(
	graph: AnalysisGraph,
	resolution: number,
): LouvainResult {
	if (graph.nodeCount === 0) {
		return { communities: new Map(), modularityQ: 0 };
	}

	const { adjacency } = graph;

	// Initialize: each node in its own community
	const community = new Map<string, string>();
	for (const node of graph.nodes) {
		community.set(node.id, node.id);
	}

	// Precompute node degrees
	const degree = new Map<string, number>();
	for (const [nodeId, neighbors] of adjacency) {
		let k = 0;
		for (const w of neighbors.values()) k += w;
		degree.set(nodeId, k);
	}

	const m = totalWeight(adjacency);
	if (m === 0) {
		// No edges: each node is its own community
		let idx = 0;
		for (const node of graph.nodes) {
			community.set(node.id, `c_${idx++}`);
		}
		return { communities: community, modularityQ: 0 };
	}

	// Phase 1: Local moves
	// Sort node IDs for deterministic traversal
	const sortedNodeIds = Array.from(adjacency.keys()).sort();

	let improved = true;
	let iterations = 0;
	const maxIterations = 100;

	while (improved && iterations < maxIterations) {
		improved = false;
		iterations++;

		for (const nodeId of sortedNodeIds) {
			const currentCommunity = community.get(nodeId)!;
			const ki = degree.get(nodeId)!;
			const neighbors = adjacency.get(nodeId);
			if (!neighbors || neighbors.size === 0) continue;

			// Compute weights to each neighboring community
			const communityWeights = new Map<string, number>();
			let kiIn = 0; // weight from node to its current community

			for (const [neighbor, weight] of neighbors) {
				const neighborCom = community.get(neighbor)!;
				communityWeights.set(neighborCom, (communityWeights.get(neighborCom) ?? 0) + weight);
				if (neighborCom === currentCommunity) {
					kiIn += weight;
				}
			}

			// Compute Sigma_tot for current community
			let sigmaCurrentTot = 0;
			for (const [nId, k] of degree) {
				if (community.get(nId) === currentCommunity) {
					sigmaCurrentTot += k;
				}
			}

			// Remove node from current community for delta-Q calculation
			const sigmaCurrentTotWithout = sigmaCurrentTot - ki;

			let bestCommunity = currentCommunity;
			let bestDeltaQ = 0;

			for (const [targetCom, kVIn] of communityWeights) {
				if (targetCom === currentCommunity) continue;

				// Compute Sigma_tot for target community
				let sigmaTargetTot = 0;
				for (const [nId, k] of degree) {
					if (community.get(nId) === targetCom) {
						sigmaTargetTot += k;
					}
				}

				// Delta Q = [kVIn / m - resolution * ki * sigmaTargetTot / (2 * m^2)]
				//         - [-kiIn / m + resolution * ki * sigmaCurrentTotWithout / (2 * m^2)]
				const deltaQ =
					(kVIn / m - resolution * ki * sigmaTargetTot / (2 * m * m))
					- (-kiIn / m + resolution * ki * sigmaCurrentTotWithout / (2 * m * m));

				if (deltaQ > bestDeltaQ) {
					bestDeltaQ = deltaQ;
					bestCommunity = targetCom;
				}
			}

			if (bestCommunity !== currentCommunity) {
				community.set(nodeId, bestCommunity);
				improved = true;
			}
		}
	}

	// Post-process: merge small communities into nearest by inter-community edge weight
	const communityMembers = new Map<string, string[]>();
	for (const [nodeId, comId] of community) {
		if (!communityMembers.has(comId)) communityMembers.set(comId, []);
		communityMembers.get(comId)!.push(nodeId);
	}

	for (const [comId, members] of communityMembers) {
		if (members.length >= LOUVAIN_MIN_COMMUNITY_SIZE) continue;

		// Find nearest community by total edge weight
		const neighborCommunityWeights = new Map<string, number>();
		for (const nodeId of members) {
			const neighbors = adjacency.get(nodeId);
			if (!neighbors) continue;
			for (const [neighbor, weight] of neighbors) {
				const neighborCom = community.get(neighbor)!;
				if (neighborCom === comId) continue;
				neighborCommunityWeights.set(neighborCom, (neighborCommunityWeights.get(neighborCom) ?? 0) + weight);
			}
		}

		// Find community with max weight
		let bestTarget = comId;
		let bestWeight = 0;
		for (const [targetCom, weight] of neighborCommunityWeights) {
			if (weight > bestWeight) {
				bestWeight = weight;
				bestTarget = targetCom;
			}
		}

		// Merge
		if (bestTarget !== comId) {
			for (const nodeId of members) {
				community.set(nodeId, bestTarget);
			}
		}
	}

	// Rename communities to c_0, c_1, ... (deterministic: sort by first member's node_id)
	const finalCommunities = new Map<string, string[]>();
	for (const [nodeId, comId] of community) {
		if (!finalCommunities.has(comId)) finalCommunities.set(comId, []);
		finalCommunities.get(comId)!.push(nodeId);
	}

	const sortedCommunityIds = Array.from(finalCommunities.keys()).sort((a, b) => {
		const aFirst = finalCommunities.get(a)!.sort()[0]!;
		const bFirst = finalCommunities.get(b)!.sort()[0]!;
		return aFirst.localeCompare(bFirst);
	});

	const renameMap = new Map<string, string>();
	sortedCommunityIds.forEach((oldId, idx) => {
		renameMap.set(oldId, `c_${idx}`);
	});

	const renamedCommunity = new Map<string, string>();
	for (const [nodeId, comId] of community) {
		renamedCommunity.set(nodeId, renameMap.get(comId)!);
	}

	const modularityQ = computeModularity(adjacency, renamedCommunity, m);

	return { communities: renamedCommunity, modularityQ };
}
