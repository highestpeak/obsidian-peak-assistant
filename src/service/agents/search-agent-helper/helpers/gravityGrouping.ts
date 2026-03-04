/**
 * Gravity-merge grouping for consolidated tasks.
 *
 * Pipeline (design for "find well, merge well"):
 *   1. Data: parent-dir file counts, per-path links/tags, pairwise similarity (all from index/DB).
 *   2. Affinity matrix A: symmetric N×N from direct link (+5), same parent (+5×IDF), co-citation (+3), shared tags (+2), similarity sweet spot. Cross-dir decay and saturation applied.
 *   3. Louvain on adjacency list (sparse): initial communities by parent path; γ > 1 for more, smaller tight communities.
 *   4. Capacity balance: any group over maxCapacity is 2-way split at path boundaries with min-cut so affinity structure is preserved.
 *   5. Final merge: if group count > maxGroups, merge pairs by balanced score (affinity / load with capacity bonus/penalty), not by "smallest first".
 *
 * All data is loaded internally (no external affinity provider).
 *
 * --- Optimization and design notes ---
 * • Sparsification: edges below MIN_AFFINITY_THRESHOLD are dropped so Louvain only iterates strong edges (avoids O(N²) inner loops).
 * • Adjacency-list Louvain: k_i and k_i,in from edgesForEachMember[i] only; single-pass weightsToComms per node; numerator-only ΔQ comparison.
 * • Score saturation: scale*tanh(raw/scale) to avoid gravity black holes; cross-directory decay (CROSS_DIR_DECAY) to favour same-dir cohesion.
 * • Preset initial community by parent path so directory structure is preserved from the start.
 * • Capacity split: path-boundary only, min-cut among valid splits; fallback to task-count split when a single path.
 * • Resolution γ (LOUVAIN_GAMMA): slightly > 1 yields more small communities; final phase then merges by affinity so "Louvain finds well, balance merges well".
 * • Balanced gravitational consolidation: group–group affinity precomputed from A; merge the pair that maximizes affinity/(load+1) with 2× bonus under cap and squared penalty over cap; update affinity board so each round is O(groups²).
 */

import type { ConsolidatedTaskWithId } from '@/core/schemas/agents/search-agent-schemas';
import { EMPTY_MAP } from '@/core/utils/collection-utils';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { getPathFromNode } from '@/service/tools/search-graph-inspector/common';

// --- Affinity score constants ---
const AFFINITY_DIRECT_LINK = 5;
const AFFINITY_SAME_PARENT_BASE = 5;
const AFFINITY_COCITATION = 3;
const AFFINITY_SHARED_TAGS = 2;
/** Peak score for similarity sweet spot (60–85%). */
const AFFINITY_SIMILARITY_PEAK = 10;
/** IDF-style decay: Score = 5 * log10(C / (N_files_in_dir + 1)). */
const PARENT_IDF_C = 1000;
const EDGE_LIMIT = 100;

// --- Optimization-related constants ---
/** Sparsification threshold: edges with weight < this are not stored; use 4–5 to avoid weak ties and speed convergence. */
const MIN_AFFINITY_THRESHOLD = 4.0;
/** Saturation scale: final score = scale * tanh(raw/scale) so very high raw scores do not create gravity black holes. */
const AFFINITY_SATURATION_SCALE = 10;
/** Cross-directory decay: when parentPath(i) !== parentPath(j), affinity × this; lower = stronger penalty (e.g. 0.3 builds high walls between dirs). */
const CROSS_DIR_DECAY = 0.55;
/** 
 * Louvain resolution: γ > 1 penalizes large communities, yielding more smaller tight communities. 
 * gamma = 1.0: standard modularity, tends to discover communities formed by natural gravity.
 * gamma > 1.0 (e.g. 1.5): algorithm will become very "very picky"，thinks that the total weight of the community (Σ_tot) is a burden, and to compensate for this burden, it must break up the large community.
 * gamma < 1.0 (e.g. 0.5): algorithm will become "very tolerant"，tends to merge all related groups into a giant community.
 * */
const LOUVAIN_GAMMA = 0.8;
/** Do not move node unless ΔQ exceeds this (avoids thrashing from negligible gains). */
const DELTA_Q_THRESHOLD = 1e-6;
/** If fewer than this fraction of nodes moved in a round, stop (convergence). */
const MIN_MOVE_RATIO = 0.01;
/** Max Louvain rounds; most gain is in the first few rounds. */
const MAX_LOUVAIN_ITERATIONS = 10;

/** Used to cap maxGroups; final merge phase reduces groups to at most this. */
const MAX_EVIDENCE_CONCURRENCY = 12;
/** Used to compute maxGroups = ceil(totalScore / targetLoadPerGroup) so we don't force too few groups. */
const TARGET_LOAD_PER_GROUP = 8;

export interface GroupingOptions {
	maxCapacity?: number;
	targetLoadPerGroup?: number;
	maxEvidenceConcurrency?: number;
}

export interface AffinityData {
	outlinks: string[];
	backlinks: string[];
	tags: string[];
}

/** Task load score for capacity (high=3, medium=2, low=1). */
export function taskLoadScore(t: ConsolidatedTaskWithId): number {
	const load = t.task_load ?? 'medium';
	return load === 'high' ? 3 : load === 'low' ? 1 : 2;
}

/** Parent path (dirname) for path-based clustering. */
export function parentPath(t: ConsolidatedTaskWithId): string {
	const p = t.path.replace(/\\/g, '/');
	const idx = p.lastIndexOf('/');
	return idx >= 0 ? p.slice(0, idx) : '';
}

/**
 * Run gravity-merge grouping: load data → build affinity matrix → LPA communities → capacity balance.
 * No external provider; all data from index/DB.
 */
export async function groupConsolidatedTasksGravity(
	tasks: ConsolidatedTaskWithId[],
	opts: GroupingOptions = {},
): Promise<ConsolidatedTaskWithId[][]> {
	const maxCapacity = opts.maxCapacity ?? 15;
	if (tasks.length === 0) return [];

	const N = tasks.length;
	const paths = tasks.map((t) => t.path);

	// --- Phase 1: Compute required values ---
	const parentSet = new Set(paths.map((p) => parentPathFromPath(p)));
	const parentPathToFileCount = await getFileCountPerParentPath(parentSet);
	const pathToLinksAndTags = await getLinksAndTagsForPaths(paths);
	const similarityCache = await getPairwiseSimilarityScores(paths);
	// console.debug('[groupConsolidatedTasksGravity] similarityCache:', JSON.stringify(similarityCache));

	// --- Phase 2: Build N×N symmetric affinity matrix A (cross-dir decay + saturation applied inside) ---
	const A = buildAffinityMatrix(
		N,
		paths,
		pathToLinksAndTags,
		parentPathToFileCount,
		(i, j) => (i === j ? 0 : (similarityCache[i]?.[j] ?? 0)),
	);
	// --- Phase 3: Sparsify (drop weak edges) then Louvain on adjacency list; initial communities by parent path ---
	const adj = buildAdjacencyFromMatrix(N, A, MIN_AFFINITY_THRESHOLD);
	// console.debug('[groupConsolidatedTasksGravity] adj:', JSON.stringify(adj));
	const communityByIndex = louvainFromAdjacency(N, adj, paths);

	// key is community index, value is array of node indices in the community.
	const indexByCommunity = new Map<number, number[]>();
	for (let i = 0; i < N; i++) {
		const c = communityByIndex.get(i) ?? i;
		if (!indexByCommunity.has(c)) indexByCommunity.set(c, []);
		indexByCommunity.get(c)!.push(i);
	}
	let groups: ConsolidatedTaskWithId[][] = [];
	for (const indices of indexByCommunity.values()) {
		groups.push(indices.map((i) => tasks[i]));
	}
	// console.debug('[groupConsolidatedTasksGravity] groups:', groups);

	// --- Phase 4: Capacity balance — split overloaded groups at path boundaries, choose split by min-cut (preserves affinity), recursive ---
	const pathToIndex = new Map(paths.map((p, i) => [p, i]));
	const capacityBalancedGroups = capacityBalance(groups, maxCapacity, pathToIndex, A);

	// --- Phase 5: Cap total number of groups via affinity-guided merge (not "merge two smallest") ---
	const targetLoadPerGroup = opts.targetLoadPerGroup ?? TARGET_LOAD_PER_GROUP;
	const maxEvidenceConcurrency = opts.maxEvidenceConcurrency ?? MAX_EVIDENCE_CONCURRENCY;
	const activeDimensions = new Set(tasks.flatMap((t) => (t.relevant_dimension_ids ?? []).map((d) => d.id))).size;
	const totalScore = tasks.reduce((s, t) => s + taskLoadScore(t), 0);
	const maxGroups = Math.min(
		activeDimensions * 2,
		maxEvidenceConcurrency,
		Math.max(1, Math.ceil(totalScore / targetLoadPerGroup)),
	);
	console.debug('[groupConsolidatedTasksGravity] maxGroups:', {
		maxGroups,
		targetLoadPerGroup,
		maxEvidenceConcurrency,
		activeDimensions,
		totalScore,
		groups,
		capacityBalancedGroups,
	});
	const finalGroups = balancedGravitationalConsolidation(
		capacityBalancedGroups,
		maxGroups,
		maxCapacity,
		pathToIndex,
		A,
	);
	console.debug('[groupConsolidatedTasksGravity] final groups:', finalGroups);
	return finalGroups;
}

function parentPathFromPath(path: string): string {
	const p = path.replace(/\\/g, '/');
	const idx = p.lastIndexOf('/');
	return idx >= 0 ? p.slice(0, idx) : '';
}

/** Batch load file count per parent path (by tenant). */
async function getFileCountPerParentPath(parentPaths: Set<string>): Promise<Map<string, number>> {
	if (parentPaths.size === 0) return EMPTY_MAP as Map<string, number>;
	const tenantToPaths = new Map<IndexTenant, string[]>();
	for (const p of parentPaths) {
		const tenant = getIndexTenantForPath(p + '/dummy.md');
		if (!tenantToPaths.has(tenant)) tenantToPaths.set(tenant, []);
		tenantToPaths.get(tenant)!.push(p);
	}
	const out = new Map<string, number>();
	await Promise.all(
		[...tenantToPaths.entries()].map(async ([tenant, paths]) => {
			const repo = sqliteStoreManager.getDocMetaRepo(tenant);
			for (const p of paths) {
				const count = await repo.countByFolderPath(p);
				out.set(p, Math.max(1, count));
			}
		}),
	);
	return out;
}

/** Load outlinks, backlinks, tags for each path (from graph + doc_meta). */
async function getLinksAndTagsForPaths(paths: string[]): Promise<Map<string, AffinityData>> {
	const out = new Map<string, AffinityData>();
	if (paths.length === 0) return out;
	const empty: AffinityData = { outlinks: [], backlinks: [], tags: [] };
	await Promise.all(
		paths.map(async (path) => {
			try {
				const tenant: IndexTenant = getIndexTenantForPath(path);
				const docMetaRepo = sqliteStoreManager.getDocMetaRepo(tenant);
				const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo(tenant);
				const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo(tenant);
				const docMeta = await docMetaRepo.getByPath(path);
				if (!docMeta?.id) {
					out.set(path, { ...empty, tags: parseTags(docMeta?.tags ?? null) });
					return;
				}
				const edges = await graphEdgeRepo.getAllEdgesForNode(docMeta.id, EDGE_LIMIT);
				const inIds = edges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
				const outIds = edges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
				const allIds = [...new Set([...inIds, ...outIds])];
				const nodesMap = await graphNodeRepo.getByIds(allIds);
				const outlinks: string[] = [];
				const backlinks: string[] = [];
				for (const node of nodesMap.values()) {
					if (node.type === 'document' && node.label) {
						const p = getPathFromNode(node);
						if (p) {
							if (outIds.includes(node.id)) outlinks.push(p);
							if (inIds.includes(node.id)) backlinks.push(p);
						}
					}
				}
				out.set(path, { outlinks, backlinks, tags: parseTags(docMeta.tags) });
			} catch {
				out.set(path, empty);
			}
		}),
	);
	return out;
}

/** Pairwise similarity score (sweet spot 0–60% = 0, 60–85% = linear to peak, 85–100% = drop). Returns N×N cache, symmetric, 0 on diagonal. */
async function getPairwiseSimilarityScores(paths: string[]): Promise<number[][]> {
	const N = paths.length;
	const scoreCache: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
	if (N === 0) return scoreCache;
	const pathToDocId = new Map<string, string>();
	const pathToTenant = new Map<string, IndexTenant>();
	await Promise.all(
		paths.map(async (p) => {
			const tenant = getIndexTenantForPath(p);
			pathToTenant.set(p, tenant);
			try {
				const repo = sqliteStoreManager.getDocMetaRepo(tenant);
				const meta = await repo.getByPath(p);
				if (meta?.id) pathToDocId.set(p, meta.id);
			} catch {
				// skip
			}
		}),
	);
	const tenantToDocIds = new Map<IndexTenant, string[]>();
	for (const [path, docId] of pathToDocId) {
		const t = pathToTenant.get(path)!;
		if (!tenantToDocIds.has(t)) tenantToDocIds.set(t, []);
		tenantToDocIds.get(t)!.push(docId);
	}
	const docIdToVec = new Map<string, number[]>();
	await Promise.all(
		[...tenantToDocIds.entries()].map(async ([tenant, docIds]) => {
			const embRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
			for (const id of docIds) {
				const vec = await embRepo.getAverageEmbeddingForDoc(id);
				if (vec && vec.length) docIdToVec.set(id, vec);
			}
		}),
	);
	const pathToVec = new Map<string, number[]>();
	for (const p of paths) {
		const docId = pathToDocId.get(p);
		if (docId) {
			const vec = docIdToVec.get(docId);
			if (vec) pathToVec.set(p, vec);
		}
	}
	for (let i = 0; i < N; i++) {
		const vi = pathToVec.get(paths[i]);
		if (!vi) continue;
		for (let j = i + 1; j < N; j++) {
			const vj = pathToVec.get(paths[j]);
			if (!vj) continue;
			const sim = cosineSimilarity(vi, vj);
			const score = similaritySweetSpot(sim);
			scoreCache[i][j] = score;
			scoreCache[j][i] = score;
		}
	}
	return scoreCache;
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0, na = 0, nb = 0;
	for (let k = 0; k < a.length; k++) {
		dot += a[k] * b[k];
		na += a[k] * a[k];
		nb += b[k] * b[k];
	}
	const norm = Math.sqrt(na) * Math.sqrt(nb);
	return norm === 0 ? 0 : Math.max(0, Math.min(1, dot / norm));
}

/** 0–60% → 0; 60–85% → linear to AFFINITY_SIMILARITY_PEAK; 85–100% → drop. */
function similaritySweetSpot(sim: number): number {
	if (sim < 0.6) return 0;
	if (sim <= 0.85) return (AFFINITY_SIMILARITY_PEAK * (sim - 0.6)) / 0.25;
	return (AFFINITY_SIMILARITY_PEAK * (1 - sim)) / 0.15;
}

function parseTags(tagsJson: string | null | undefined): string[] {
	if (!tagsJson) return [];
	try {
		const parsed = JSON.parse(tagsJson);
		return Array.isArray(parsed)
			? parsed.filter((t: unknown): t is string => typeof t === 'string').map((t) => String(t).trim()).filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

/** Set-based view for O(1) lookup in the inner loop. */
type AffinitySets = { outlinksSet: Set<string>; backlinksSet: Set<string>; tagsSet: Set<string> };

function toAffinitySets(d: AffinityData): AffinitySets {
	return {
		outlinksSet: new Set(d.outlinks),
		backlinksSet: new Set(d.backlinks),
		tagsSet: new Set(d.tags),
	};
}

/**
 * Build symmetric N×N affinity matrix. Design: each pair (i,j) gets points from direct link, same parent (IDF decay),
 * co-citation, shared tags, and similarity sweet spot; then cross-dir decay (different parent → × CROSS_DIR_DECAY) and
 * saturation (scale*tanh(raw/scale)) so the graph is suitable for Louvain and capacity/min-cut.
 */
function buildAffinityMatrix(
	N: number,
	paths: string[],
	pathToData: Map<string, AffinityData>,
	parentPathToFileCount: Map<string, number>,
	getSimilarity: (i: number, j: number) => number,
): number[][] {
	const parentPathFromPath = (p: string) => {
		const idx = p.replace(/\\/g, '/').lastIndexOf('/');
		return idx >= 0 ? p.slice(0, idx) : '';
	};
	const emptySets: AffinitySets = { outlinksSet: new Set(), backlinksSet: new Set(), tagsSet: new Set() };
	const pathToSets = new Map<string, AffinitySets>();
	for (const [path, d] of pathToData) {
		pathToSets.set(path, toAffinitySets(d));
	}
	const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
	for (let i = 0; i < N; i++) {
		for (let j = i + 1; j < N; j++) {
			const pi = paths[i];
			const pj = paths[j];
			const di = pathToSets.get(pi) ?? emptySets;
			const dj = pathToSets.get(pj) ?? emptySets;
			let score = 0;
			// Direct link: i→j or j→i (O(1) with Set)
			const direct =
				di.outlinksSet.has(pj) || di.backlinksSet.has(pj) ||
				dj.outlinksSet.has(pi) || dj.backlinksSet.has(pi);
			if (direct) score += AFFINITY_DIRECT_LINK;
			// Same parent: +5 * log10(C / (N_files+1))
			const parentI = parentPathFromPath(pi);
			const parentJ = parentPathFromPath(pj);
			if (parentI && parentI === parentJ) {
				const n = parentPathToFileCount.get(parentI) ?? 1;
				score += AFFINITY_SAME_PARENT_BASE * Math.max(0, Math.log10(PARENT_IDF_C / (n + 1)));
			}
			// Co-citation: iterate smaller set, O(1) has on the other
			const cociteOut = di.outlinksSet.size <= dj.outlinksSet.size
				? [...di.outlinksSet].some((x) => dj.outlinksSet.has(x))
				: [...dj.outlinksSet].some((x) => di.outlinksSet.has(x));
			const cociteBack = di.backlinksSet.size <= dj.backlinksSet.size
				? [...di.backlinksSet].some((x) => dj.backlinksSet.has(x))
				: [...dj.backlinksSet].some((x) => di.backlinksSet.has(x));
			if (cociteOut || cociteBack) score += AFFINITY_COCITATION;
			// Shared tags: iterate smaller set
			const sharedTag = di.tagsSet.size <= dj.tagsSet.size
				? [...di.tagsSet].some((t) => dj.tagsSet.has(t))
				: [...dj.tagsSet].some((t) => di.tagsSet.has(t));
			if (sharedTag) score += AFFINITY_SHARED_TAGS;
			// Similarity sweet spot (async getSimilarity is already resolved)
			score += getSimilarity(i, j);
			// Optimization: cross-directory decay — same dir keeps full score; different dirs get CROSS_DIR_DECAY so cohesion stays local.
			if (parentI !== parentJ) score *= CROSS_DIR_DECAY;
			// Optimization: saturation — cap raw score with scale*tanh(raw/scale) to avoid gravity black holes from very high values.
			score = AFFINITY_SATURATION_SCALE * Math.tanh(score / AFFINITY_SATURATION_SCALE);
			A[i][j] = score;
			A[j][i] = score;
		}
	}
	return A;
}

/**
 * Sparsify matrix into adjacency list: only edges with weight >= minScore are kept.
 * Design: Louvain then only iterates edgesForEachMember[i], so inner loops are O(degree) not O(N); critical for large N.
 * Edge weights are rounded to integers when stored.
 */
function buildAdjacencyFromMatrix(
	N: number,
	A: number[][],
	minScore: number,
): { to: number; weight: number }[][] {
	const edgesForEachMember = Array.from({ length: N }, () => [] as { to: number; weight: number }[]);
	for (let i = 0; i < N; i++) {
		for (let j = 0; j < N; j++) {
			if (i !== j && A[i][j] >= minScore) {
				edgesForEachMember[i].push({ to: j, weight: Math.round(A[i][j]) });
			}
		}
	}
	return edgesForEachMember;
}

/**
 * Louvain community detection on adjacency list (sparse).
 * Design: initial communities by parent path; ΔQ uses resolution γ (LOUVAIN_GAMMA) so γ > 1 yields more, smaller communities;
 * k_i and k_i,in from single pass over edgesForEachMember[i] (weightsToComms); compare ΔQ by numerator only; stop when move ratio < threshold or max iterations.
 * @return map from node index to final community index (0-based contiguous).
 */
function louvainFromAdjacency(
	N: number,
	edgesForEachMember: { to: number; weight: number }[][],
	paths: string[],
): Map<number, number> {
	// k[i] = weighted degree of node i (sum of edge weights from i). 
	// twoM = 2 * total edge weight (each edge counted at both ends).
	const k = edgesForEachMember.map((edges) => edges.reduce((s, e) => s + e.weight, 0));
	const twoM = k.reduce((a, b) => a + b, 0);
	if (twoM <= 0) {
		// No edges: assign each node to its own community and return (avoids division by zero below).
		const out = new Map<number, number>();
		for (let i = 0; i < N; i++) out.set(i, i);
		return out;
	}

	// Optimization
	const parentToComm = new Map<string, number>();
	let commId = 0;
	// inital community by parent path, so same dir starts together and directory structure is preserved.
	const community = paths.map((p) => {
		const parent = parentPathFromPath(p);
		if (!parentToComm.has(parent)) parentToComm.set(parent, commId++);
		return parentToComm.get(parent)!;
	});
	// Per-community: calculate three quantities for each community: member set, sum_tot, sum_in.
	// members: set of node indices in the community.
	// sum_tot: sum of k[i] for all nodes in the community. represents the community's "total outward degree".
	// sum_in: sum of internal edge weights for all nodes in the community.
	const commMembers = new Map<number, Set<number>>();
	const commSumTot = new Map<number, number>();
	const commSumIn = new Map<number, number>();
	for (let i = 0; i < N; i++) {
		const c = community[i];
		if (!commMembers.has(c)) commMembers.set(c, new Set());
		commMembers.get(c)!.add(i);
	}
	for (const [c, members] of commMembers) {
		commSumTot.set(c, [...members].reduce((s, i) => s + k[i], 0));
		let sumIn = 0;
		for (const i of members) {
			for (const e of edgesForEachMember[i]) {
				if (members.has(e.to) && e.to > i) sumIn += e.weight;
			}
		}
		commSumIn.set(c, sumIn);
	}
	// Greedy modularity optimization: repeatedly try moving each node to a neighbor community if ΔQ > threshold.
	const twoMSq = twoM * twoM;
	const deltaQNumeratorThreshold = DELTA_Q_THRESHOLD * twoMSq;
	let iter = 0;
	while (iter < MAX_LOUVAIN_ITERATIONS) {
		iter++;
		let movedCount = 0;

		const order = Array.from({ length: N }, (_, i) => i);
		for (let t = order.length - 1; t > 0; t--) {
			const r = Math.floor(Math.random() * (t + 1));
			[order[t], order[r]] = [order[r], order[t]];
		}

		for (const i of order) {
			const D = community[i];
			// Single pass: compute k_i,in for each neighbor community (avoids repeated scans of edges).
			const weightsToComms = new Map<number, number>();
			for (const e of edgesForEachMember[i]) {
				const commOfNeighbor = community[e.to];
				weightsToComms.set(commOfNeighbor, (weightsToComms.get(commOfNeighbor) ?? 0) + e.weight);
			}
			const kIInD = weightsToComms.get(D) ?? 0;

			let bestC = D;
			let bestNumerator = 0;
			let bestKIInC = 0;
			const sumTotD = commSumTot.get(D)!;
			for (const [C, kIInC] of weightsToComms) {
				if (C === D) continue;
				const sumTotC = commSumTot.get(C)!;
				// ΔQ numerator = (k_i,in_C - k_i,in_D)*(2m) - γ*k_i*(Σ_tot_C - Σ_tot_D); γ > 1 favours smaller communities.
				const numerator = (kIInC - kIInD) * twoM - LOUVAIN_GAMMA * k[i] * (sumTotC - sumTotD);
				if (numerator > bestNumerator) {
					bestNumerator = numerator;
					bestC = C;
					bestKIInC = kIInC;
				}
			}
			if (bestNumerator > deltaQNumeratorThreshold && bestC !== D) {
				commMembers.get(D)!.delete(i);
				commMembers.get(bestC)!.add(i);
				commSumTot.set(D, commSumTot.get(D)! - k[i]);
				commSumTot.set(bestC, commSumTot.get(bestC)! + k[i]);
				commSumIn.set(D, commSumIn.get(D)! - kIInD);
				commSumIn.set(bestC, commSumIn.get(bestC)! + bestKIInC);
				community[i] = bestC;
				movedCount++;
			}
		}

		if (movedCount === 0 || movedCount / N < MIN_MOVE_RATIO) break;
	}

	// Normalize community ids to 0-based contiguous.
	const canon = new Map<number, number>();
	let id = 0;
	for (let i = 0; i < N; i++) {
		const c = community[i];
		if (!canon.has(c)) canon.set(c, id++);
	}
	const out = new Map<number, number>();
	for (let i = 0; i < N; i++) out.set(i, canon.get(community[i])!);
	return out;
}

/**
 * Recursively 2-way partition any group whose total load > maxCapacity.
 * Design: split only at path boundaries (splitGroupByPathAndAffinity) so same-path tasks stay together;
 * among valid splits we minimize affinity cut (min-cut) when A is provided, preserving Louvain community structure.
 */
function capacityBalance(
	groups: ConsolidatedTaskWithId[][],
	maxCapacity: number,
	pathToIndex?: Map<string, number>,
	A?: number[][],
): ConsolidatedTaskWithId[][] {
	const result: ConsolidatedTaskWithId[][] = [];
	for (const g of groups) {
		const totalLoad = g.reduce((s, t) => s + taskLoadScore(t), 0);
		if (totalLoad <= maxCapacity) {
			result.push(g);
			continue;
		}
		const { left, right } = splitGroupByPathAndAffinity(g, maxCapacity, pathToIndex, A);
		result.push(...capacityBalance([left, right], maxCapacity, pathToIndex, A));
	}
	return result;
}

/**
 * Final phase: "收编" (absorption) — repeatedly pick the weakest group and merge it into the best receiver.
 *
 * Design:
 * • Average line: averageLoad = totalScore / maxGroups; group is "too small" if load < averageLoad * 0.7.
 * • Each round: find G_min (group with minimum load). If (count > maxGroups) OR (G_min.load < averageLoad * 0.7), G_min must/suggest be merged.
 * • Receiver: among groups that can take G_min without exceeding maxCapacity, pick the one with highest affinity to G_min; tie-break by lowest load.
 * • Update affinity board and remove G_min; repeat until no too-small group or no valid receiver.
 */
function balancedGravitationalConsolidation(
	groups: ConsolidatedTaskWithId[][],
	maxGroups: number,
	maxCapacity: number,
	pathToIndex: Map<string, number>,
	A: number[][],
): ConsolidatedTaskWithId[][] {
	if (groups.length <= 1) return groups;

	const groupCount = groups.length;
	const groupAffinity = Array.from({ length: groupCount }, () => new Float64Array(groupCount));
	for (let i = 0; i < groupCount; i++) {
		for (let j = i + 1; j < groupCount; j++) {
			let sum = 0;
			for (const tA of groups[i]) {
				const idxA = pathToIndex.get(tA.path);
				if (idxA === undefined) continue;
				for (const tB of groups[j]) {
					const idxB = pathToIndex.get(tB.path);
					if (idxB !== undefined) sum += A[idxA][idxB];
				}
			}
			groupAffinity[i][j] = groupAffinity[j][i] = sum;
		}
	}

	let currentGroups = groups.map((g, i) => ({
		id: i,
		tasks: g,
		load: g.reduce((s, t) => s + taskLoadScore(t), 0),
	}));

	while (true) {
		const totalScore = currentGroups.reduce((s, g) => s + g.load, 0);
		const averageLoad = totalScore / maxGroups;
		const floor = averageLoad * 0.7;
		const gMin = currentGroups.reduce((a, b) => (a.load <= b.load ? a : b));
		const mustMerge = currentGroups.length > maxGroups;
		const tooSmall = gMin.load < floor;
		if (!mustMerge && !tooSmall) break;
		if (currentGroups.length <= 1) break;

		const candidates = currentGroups.filter(
			(g) => g.id !== gMin.id && g.load + gMin.load <= maxCapacity,
		);
		if (candidates.length === 0) break;

		const bestReceiver = candidates.reduce((best, c) => {
			const aff = groupAffinity[gMin.id][c.id];
			const bestAff = groupAffinity[gMin.id][best.id];
			if (aff > bestAff) return c;
			if (aff < bestAff) return best;
			return c.load < best.load ? c : best;
		});

		for (const other of currentGroups) {
			if (other.id !== bestReceiver.id && other.id !== gMin.id) {
				const updated = groupAffinity[bestReceiver.id][other.id] + groupAffinity[gMin.id][other.id];
				groupAffinity[bestReceiver.id][other.id] = groupAffinity[other.id][bestReceiver.id] = updated;
			}
		}
		bestReceiver.tasks = [...bestReceiver.tasks, ...gMin.tasks];
		bestReceiver.load += gMin.load;
		currentGroups = currentGroups.filter((g) => g.id !== gMin.id);
	}

	return currentGroups.map((g) => g.tasks);
}

/**
 * Split one overloaded group into left/right without breaking directory continuity or Louvain structure.
 *
 * Design:
 * 1. Path-boundary only: we sort by path and consider split points only between distinct paths (orderedPaths).
 *    So tasks with the same path always stay in the same half — no "same file in two groups".
 * 2. Capacity: for each candidate split k (left = paths [0..k-1], right = [k..n-1]), we require both
 *    leftLoad and rightLoad <= maxCapacity; invalid k are skipped.
 * 3. Best k: among valid splits we minimize either
 *    - (when A is provided) the affinity cut: sum of A[i][j] for i in left, j in right. Smaller cut
 *      means we cut weak ties and keep high-affinity pairs together (preserves Louvain clustering).
 *    - (when A is missing) |leftLoad - rightLoad| so the two sides are as balanced as possible.
 * 4. Fallback: if the group has only one path (n <= 1), we cannot split by path; we split tasks
 *    by count (first half / second half) so recursion can still reduce group size.
 */
function splitGroupByPathAndAffinity(
	g: ConsolidatedTaskWithId[],
	maxCapacity: number,
	pathToIndex?: Map<string, number>,
	A?: number[][],
): { left: ConsolidatedTaskWithId[]; right: ConsolidatedTaskWithId[] } {
	// Build path-sorted unique path list: split points k are indices into this list (between paths, not inside).
	const sorted = [...g].sort((a, b) => a.path.localeCompare(b.path));
	const orderedPaths: string[] = [];
	for (const t of sorted) {
		if (orderedPaths[orderedPaths.length - 1] !== t.path) orderedPaths.push(t.path);
	}
	const n = orderedPaths.length;
	if (n <= 1) {
		// Single path: cannot split by path boundary; split tasks by count so capacityBalance can recurse.
		const mid = Math.ceil(g.length / 2);
		return { left: g.slice(0, mid), right: g.slice(mid) };
	}
	// Per-path total load (sum of task_load score for all tasks on that path) for capacity checks.
	const pathLoad = new Map<string, number>();
	for (const t of g) pathLoad.set(t.path, (pathLoad.get(t.path) ?? 0) + taskLoadScore(t));
	const load = orderedPaths.map((p) => pathLoad.get(p) ?? 0);
	// Enumerate k = 1..n-1; left = paths [0..k-1], right = [k..n-1]. Choose k with valid capacity and best score.
	let bestK = 1;
	let bestScore = Infinity;
	for (let k = 1; k < n; k++) {
		const leftLoad = load.slice(0, k).reduce((a, b) => a + b, 0);
		const rightLoad = load.slice(k).reduce((a, b) => a + b, 0);
		if (leftLoad > maxCapacity || rightLoad > maxCapacity) continue;
		let score: number;
		if (A && pathToIndex) {
			// Min-cut: total affinity between left paths and right paths; minimize to preserve community structure.
			let cut = 0;
			for (let i = 0; i < k; i++) {
				const gi = pathToIndex.get(orderedPaths[i]);
				if (gi === undefined) continue;
				for (let j = k; j < n; j++) {
					const gj = pathToIndex.get(orderedPaths[j]);
					if (gj !== undefined) cut += A[gi][gj];
				}
			}
			score = cut;
		} else {
			score = Math.abs(leftLoad - rightLoad);
		}
		if (score < bestScore) {
			bestScore = score;
			bestK = k;
		}
	}
	// Assign tasks to left/right by path membership (same path → same side).
	const leftPaths = new Set(orderedPaths.slice(0, bestK));
	const rightPaths = new Set(orderedPaths.slice(bestK));
	const left = g.filter((t) => leftPaths.has(t.path));
	const right = g.filter((t) => rightPaths.has(t.path));
	return { left, right };
}
