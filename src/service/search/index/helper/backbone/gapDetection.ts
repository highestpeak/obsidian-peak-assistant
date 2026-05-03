/**
 * Structural hole / gap detection between communities.
 * Pure functions: no SQLite imports; safe to unit test.
 *
 * A structural hole exists between communities that are semantically related
 * but structurally disconnected — ideas that *should* be connected but aren't.
 */

import type { GapPair } from './structuralTypes';

const GAP_THRESHOLD = 0.4;
const MAX_BRIDGE_CANDIDATES = 5;

/**
 * Detect structural holes (gaps) between communities.
 *
 * For each pair of communities, computes:
 *   gap_score = semantic_similarity * (1 - inter_density)
 *
 * High gap_score = semantically related but structurally disconnected → structural hole.
 *
 * @param communityMap nodeId → communityId
 * @param edges Array of { from, to, weight } edges
 * @param getEmbedding Function to get embedding vector for a node (null if unavailable)
 * @param minGapScore Minimum gap score to report (default 0.4)
 * @returns Sorted array of gap pairs, highest gap score first
 */
export function detectStructuralHoles(
	communityMap: Map<string, number>,
	edges: Array<{ from: string; to: string; weight: number }>,
	getEmbedding: (nodeId: string) => number[] | null,
	minGapScore: number = GAP_THRESHOLD,
): GapPair[] {
	// Group nodes by community
	const communityMembers = new Map<number, string[]>();
	for (const [nodeId, comId] of communityMap) {
		let members = communityMembers.get(comId);
		if (!members) {
			members = [];
			communityMembers.set(comId, members);
		}
		members.push(nodeId);
	}

	const communityIds = [...communityMembers.keys()].sort((a, b) => a - b);
	if (communityIds.length < 2) return [];

	// Count inter-community edges
	const interEdgeCounts = new Map<string, number>();
	const interEdgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

	for (const { from, to } of edges) {
		const ca = communityMap.get(from);
		const cb = communityMap.get(to);
		if (ca !== undefined && cb !== undefined && ca !== cb) {
			const key = interEdgeKey(ca, cb);
			interEdgeCounts.set(key, (interEdgeCounts.get(key) ?? 0) + 1);
		}
	}

	// Compute community centroids from embeddings
	const centroids = new Map<number, number[]>();
	for (const [comId, members] of communityMembers) {
		const embeddings: number[][] = [];
		for (const nodeId of members) {
			const emb = getEmbedding(nodeId);
			if (emb) embeddings.push(emb);
		}
		if (embeddings.length > 0) {
			centroids.set(comId, averageVectors(embeddings));
		}
	}

	// Evaluate all community pairs
	const gaps: GapPair[] = [];

	for (let i = 0; i < communityIds.length; i++) {
		for (let j = i + 1; j < communityIds.length; j++) {
			const ca = communityIds[i]!;
			const cb = communityIds[j]!;
			const membersA = communityMembers.get(ca)!;
			const membersB = communityMembers.get(cb)!;

			// Skip tiny communities (< 3 members) — likely noise
			if (membersA.length < 3 || membersB.length < 3) continue;

			// Inter-density
			const key = interEdgeKey(ca, cb);
			const interEdges = interEdgeCounts.get(key) ?? 0;
			const maxPossibleEdges = membersA.length * membersB.length;
			const interDensity = interEdges / maxPossibleEdges;

			// Semantic similarity between centroids
			const centA = centroids.get(ca);
			const centB = centroids.get(cb);
			const semanticSim = (centA && centB) ? cosineSimilarity(centA, centB) : 0;

			// Gap score
			const gapScore = semanticSim * (1 - interDensity);
			if (gapScore < minGapScore) continue;

			// Find bridge candidates: nodes in each community closest to the other's centroid
			const bridgeCandidates = findBridgeCandidates(
				membersA, membersB, centA, centB, getEmbedding,
			);

			gaps.push({
				communityA: ca,
				communityB: cb,
				gapScore,
				semanticSim,
				interDensity,
				bridgeCandidates,
				status: 'open',
			});
		}
	}

	// Sort by gap score descending
	gaps.sort((a, b) => b.gapScore - a.gapScore);
	return gaps;
}

/**
 * Find bridge candidate nodes — nodes in each community that are closest
 * (by embedding similarity) to the other community's centroid.
 */
function findBridgeCandidates(
	membersA: string[],
	membersB: string[],
	centroidA: number[] | undefined,
	centroidB: number[] | undefined,
	getEmbedding: (nodeId: string) => number[] | null,
): string[] {
	const candidates: Array<{ nodeId: string; similarity: number }> = [];

	// Nodes in A closest to centroid of B
	if (centroidB) {
		for (const nodeId of membersA) {
			const emb = getEmbedding(nodeId);
			if (emb) {
				candidates.push({ nodeId, similarity: cosineSimilarity(emb, centroidB) });
			}
		}
	}

	// Nodes in B closest to centroid of A
	if (centroidA) {
		for (const nodeId of membersB) {
			const emb = getEmbedding(nodeId);
			if (emb) {
				candidates.push({ nodeId, similarity: cosineSimilarity(emb, centroidA) });
			}
		}
	}

	// Return top-K by similarity
	candidates.sort((a, b) => b.similarity - a.similarity);
	return candidates.slice(0, MAX_BRIDGE_CANDIDATES).map(c => c.nodeId);
}

function cosineSimilarity(a: number[], b: number[]): number {
	const len = Math.min(a.length, b.length);
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < len; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

function averageVectors(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const dim = vectors[0]!.length;
	const avg = new Array<number>(dim).fill(0);
	for (const v of vectors) {
		for (let i = 0; i < dim; i++) avg[i] += v[i]!;
	}
	const n = vectors.length;
	for (let i = 0; i < dim; i++) avg[i] /= n;
	return avg;
}
