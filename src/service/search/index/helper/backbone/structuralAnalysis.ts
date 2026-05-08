/**
 * Structural analysis: betweenness centrality, community detection, gap detection.
 *
 * This file consolidates three previously separate modules:
 *   structuralMetrics, communityDetection, gapDetection.
 * Pure functions: no SQLite imports; safe to unit test.
 */

import type { BrandesOptions, GapPair, LouvainOptions } from './structuralTypes';


// ═══════════════════════════════════════════════════════════════════════════════
// § structuralMetrics — Brandes betweenness centrality + Burt structural constraint
// ═══════════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════════
// § communityDetection — Louvain community detection algorithm
// ═══════════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════════
// § gapDetection — Structural hole / gap detection between communities
// ═══════════════════════════════════════════════════════════════════════════════

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
