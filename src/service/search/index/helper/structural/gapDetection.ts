/**
 * Structural hole identification, gap scoring, and bridge candidate selection.
 *
 * Uses community detection results from Louvain, betweenness from Brandes,
 * and constraint from Burt to identify gaps between knowledge communities.
 */

import { createHash } from 'crypto';
import type {
	AnalysisGraph,
	CommunityInfo,
	BridgeNode,
	PotentialBridge,
	StructuralHole,
} from './types';
import {
	GAP_DENSITY_THRESHOLD,
	GAP_INTRA_DENSITY_MIN,
	GAP_COMMUNITY_SIZE_MIN,
	GAP_SEMANTIC_THRESHOLD,
	GAP_WEIGHT_SEMANTIC,
	GAP_WEIGHT_SIZE,
	GAP_WEIGHT_ISOLATION,
} from '@/core/constant';

/** Stable gap ID = sha256(sorted([communityA.id, communityB.id]).join(':')) */
function stableGapId(a: string, b: string): string {
	const sorted = [a, b].sort();
	return createHash('sha256').update(sorted.join(':')).digest('hex').slice(0, 16);
}

/** Compute inter-community density: |edges(A,B)| / (|A| x |B|) */
function interCommunityDensity(
	graph: AnalysisGraph,
	membersA: Set<string>,
	membersB: Set<string>,
): { density: number; edgeCount: number } {
	let edgeCount = 0;
	for (const a of membersA) {
		const neighbors = graph.adjacency.get(a);
		if (!neighbors) continue;
		for (const [neighbor] of neighbors) {
			if (membersB.has(neighbor)) edgeCount++;
		}
	}
	const maxEdges = membersA.size * membersB.size;
	return { density: maxEdges > 0 ? edgeCount / maxEdges : 0, edgeCount };
}

/** Classify gap type based on edge patterns. */
function classifyGapType(
	interEdgeCount: number,
	bridgeNodes: BridgeNode[],
	_graph: AnalysisGraph,
	_membersA: Set<string>,
	_membersB: Set<string>,
): StructuralHole['gapType'] {
	if (interEdgeCount === 0) return 'missing_bridge';
	if (interEdgeCount === 1) return 'weak_bridge';

	// Check for decaying bridges (bridge with high BC, we'd need updated_at which
	// is beyond this scope — fallback to weak_bridge if few bridges exist)
	if (bridgeNodes.length > 0 && bridgeNodes.some(b => b.fragility === 'critical')) {
		return 'weak_bridge';
	}

	return 'missing_bridge';
}

/** Identify existing bridge nodes between two communities. */
function findExistingBridges(
	graph: AnalysisGraph,
	membersA: Set<string>,
	membersB: Set<string>,
	betweenness: Map<string, number>,
	constraint: Map<string, number>,
	nodeLabels: Map<string, string>,
): BridgeNode[] {
	const bridgeNodes: BridgeNode[] = [];

	// Bridge node: has edges into both communities
	const allMembers = new Set([...membersA, ...membersB]);
	for (const nodeId of allMembers) {
		const neighbors = graph.adjacency.get(nodeId);
		if (!neighbors) continue;

		let connectsToA = membersA.has(nodeId);
		let connectsToB = membersB.has(nodeId);

		for (const [neighbor] of neighbors) {
			if (membersA.has(neighbor)) connectsToA = true;
			if (membersB.has(neighbor)) connectsToB = true;
		}

		if (connectsToA && connectsToB) {
			bridgeNodes.push({
				path: nodeId,
				label: nodeLabels.get(nodeId) ?? nodeId,
				betweenness: betweenness.get(nodeId) ?? 0,
				constraint: constraint.get(nodeId) ?? 1,
				communitiesConnected: [], // Will be filled by caller context
				fragility: 'moderate', // Will be refined below
			});
		}
	}

	// Set fragility based on count
	const count = bridgeNodes.length;
	for (const bridge of bridgeNodes) {
		if (count === 1) bridge.fragility = 'critical';
		else if (count <= 3) bridge.fragility = 'moderate';
		else bridge.fragility = 'stable';
	}

	return bridgeNodes;
}

export interface GapDetectionInput {
	graph: AnalysisGraph;
	betweenness: Map<string, number>;
	communities: Map<string, string>;
	constraint: Map<string, number>;
	communityInfos: CommunityInfo[];
	/** Map of nodeId -> label for display */
	nodeLabels: Map<string, string>;
	/** Cross-community centroid cosine similarities: `${comA}:${comB}` -> similarity */
	centroidSimilarities?: Map<string, number>;
}

/**
 * Detect structural holes between communities.
 * Returns list of StructuralHole objects sorted by gap_score DESC.
 */
export function detectStructuralHoles(input: GapDetectionInput): StructuralHole[] {
	const { graph, betweenness, communities, constraint, communityInfos, nodeLabels, centroidSimilarities } = input;

	// Build community membership sets
	const communityMembers = new Map<string, Set<string>>();
	for (const [nodeId, comId] of communities) {
		if (!communityMembers.has(comId)) communityMembers.set(comId, new Set());
		communityMembers.get(comId)!.add(nodeId);
	}

	// Filter communities that meet size requirements
	const eligibleCommunities = communityInfos.filter(
		c => c.memberCount >= GAP_COMMUNITY_SIZE_MIN && c.internalDensity >= GAP_INTRA_DENSITY_MIN,
	);

	const holes: StructuralHole[] = [];

	// Check all community pairs
	for (let i = 0; i < eligibleCommunities.length; i++) {
		for (let j = i + 1; j < eligibleCommunities.length; j++) {
			const comA = eligibleCommunities[i]!;
			const comB = eligibleCommunities[j]!;

			const membersA = communityMembers.get(comA.id);
			const membersB = communityMembers.get(comB.id);
			if (!membersA || !membersB) continue;

			// Gap detection criterion 1: low inter-community density
			const { density: interDensity, edgeCount: interEdgeCount } = interCommunityDensity(graph, membersA, membersB);
			if (interDensity >= GAP_DENSITY_THRESHOLD) continue;

			// Semantic proximity check
			const simKey = [comA.id, comB.id].sort().join(':');
			const semanticSim = centroidSimilarities?.get(simKey) ?? 0;

			// Gap scoring
			const maxCommunitySize = Math.max(...communityInfos.map(c => c.memberCount));
			const sizeFactor = maxCommunitySize > 1
				? Math.log(comA.memberCount + comB.memberCount) / Math.log(maxCommunitySize)
				: 0;
			const isolationSeverity = 1 - interDensity;

			const gapScore =
				GAP_WEIGHT_SEMANTIC * semanticSim +
				GAP_WEIGHT_SIZE * sizeFactor +
				GAP_WEIGHT_ISOLATION * isolationSeverity;

			// Find existing bridges
			const existingBridges = findExistingBridges(
				graph, membersA, membersB, betweenness, constraint, nodeLabels,
			);
			for (const bridge of existingBridges) {
				bridge.communitiesConnected = [comA.id, comB.id];
			}

			// Classify gap type
			const gapType = classifyGapType(interEdgeCount, existingBridges, graph, membersA, membersB);

			// Potential bridges (placeholder — would use embeddings for real semantic matching)
			const potentialBridges: PotentialBridge[] = [];

			holes.push({
				id: stableGapId(comA.id, comB.id),
				communityA: comA,
				communityB: comB,
				gapScore,
				gapType,
				semanticBridgePotential: semanticSim,
				existingBridges,
				potentialBridges,
			});
		}
	}

	// Also detect topic blind spots: communities with near-zero external density
	for (const com of eligibleCommunities) {
		const members = communityMembers.get(com.id);
		if (!members) continue;

		let totalExternalEdges = 0;
		let totalExternalPossible = 0;

		for (const other of eligibleCommunities) {
			if (other.id === com.id) continue;
			const otherMembers = communityMembers.get(other.id);
			if (!otherMembers) continue;
			const { edgeCount } = interCommunityDensity(graph, members, otherMembers);
			totalExternalEdges += edgeCount;
			totalExternalPossible += members.size * otherMembers.size;
		}

		const externalDensity = totalExternalPossible > 0 ? totalExternalEdges / totalExternalPossible : 0;
		if (externalDensity < 0.005 && eligibleCommunities.length > 1) {
			// Topic blind spot: community isolated from all others
			// We represent this as a gap between this community and the largest other community
			const largest = eligibleCommunities
				.filter(c => c.id !== com.id)
				.sort((a, b) => b.memberCount - a.memberCount)[0];
			if (!largest) continue;

			const gapId = stableGapId(com.id, `blindspot_${largest.id}`);
			// Avoid duplicates
			if (holes.some(h => h.id === gapId)) continue;

			holes.push({
				id: gapId,
				communityA: com,
				communityB: largest,
				gapScore: 0.8, // High priority
				gapType: 'topic_blind_spot',
				semanticBridgePotential: 0,
				existingBridges: [],
				potentialBridges: [],
			});
		}
	}

	// Sort by gap score descending
	holes.sort((a, b) => b.gapScore - a.gapScore);

	return holes;
}
