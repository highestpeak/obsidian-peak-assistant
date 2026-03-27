/**
 * Vault-level PageRank on the directed document reference subgraph.
 * Pure functions: no SQLite imports; safe to unit test.
 *
 * Streaming variant: no adjacency map in memory — each iteration scans edges via `scanReferenceEdges`.
 */

export type VaultPageRankOptions = {
	/** Teleport probability (default 0.15 → damping 0.85). */
	damping?: number;
	maxIterations?: number;
	tolerance?: number;
};

const DEFAULT_DAMPING = 0.85;
const DEFAULT_MAX_ITER = 100;
const DEFAULT_TOL = 1e-6;

/**
 * Global PageRank with dangling-node redistribution; O(N) state, O(E) work per iteration via edge scan.
 *
 * `outDeg[i]` must match the number of `references` edges from `nodeIds[i]` to another document-like
 * vertex (same subgraph as filtering both endpoints). Prefer fresh `doc_outgoing_cnt` after aggregates.
 *
 * @param scanReferenceEdges Invoked once per iteration; caller streams `mobius_edge` batches and calls `visit(from,to)` for each row.
 * @returns Final PageRank score per `node_id`. Persistence uses dedicated `mobius_node` columns (not JSON).
 */
export async function computeVaultPageRankStreaming(
	nodeIds: readonly string[],
	outDeg: Int32Array,
	scanReferenceEdges: (
		visit: (from: string, to: string) => void,
		iterIndex: number,
	) => Promise<void>,
	options?: VaultPageRankOptions,
): Promise<Map<string, number>> {
	const d = options?.damping ?? DEFAULT_DAMPING;
	const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
	const tol = options?.tolerance ?? DEFAULT_TOL;
	const n = nodeIds.length;
	if (n === 0) {
		return new Map();
	}
	if (outDeg.length !== n) {
		throw new Error('computeVaultPageRankStreaming: outDeg length must match nodeIds');
	}

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		idToIndex.set(nodeIds[i]!, i);
	}

	let r = new Float64Array(n);
	const invN = 1 / n;
	r.fill(invN);
	const base = (1 - d) / n;

	for (let iter = 0; iter < maxIter; iter++) {
		const rNext = new Float64Array(n);
		rNext.fill(base);
		let danglingMass = 0;
		for (let j = 0; j < n; j++) {
			if (outDeg[j] === 0) {
				danglingMass += r[j]!;
			}
		}

		await scanReferenceEdges((from, to) => {
			const fi = idToIndex.get(from);
			const ti = idToIndex.get(to);
			if (fi === undefined || ti === undefined) return;
			const deg = outDeg[fi]!;
			if (deg > 0) {
				rNext[ti]! += (d * r[fi]!) / deg;
			}
		}, iter);

		if (danglingMass > 0) {
			const add = (d * danglingMass) / n;
			for (let i = 0; i < n; i++) {
				rNext[i]! += add;
			}
		}

		let diff = 0;
		for (let i = 0; i < n; i++) {
			diff += Math.abs(rNext[i]! - r[i]!);
		}
		r = rNext;
		if (diff < tol) break;
	}

	const scores = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		scores.set(nodeIds[i]!, r[i]!);
	}
	return scores;
}

/**
 * One pass over all `semantic_related` edges: per-vertex sum of outgoing weights to other doc-like vertices.
 */
export async function accumulateSemanticOutgoingWeightSums(
	nodeIds: readonly string[],
	scanAllSemanticEdges: (visit: (from: string, to: string, weight: number) => void) => Promise<void>,
): Promise<Float64Array> {
	const n = nodeIds.length;
	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		idToIndex.set(nodeIds[i]!, i);
	}
	const sums = new Float64Array(n);
	await scanAllSemanticEdges((from, to, w) => {
		const fi = idToIndex.get(from);
		const ti = idToIndex.get(to);
		if (fi === undefined || ti === undefined) return;
		const ww = Number.isFinite(w) && w > 0 ? w : 0;
		if (ww > 0) sums[fi]! += ww;
	});
	return sums;
}

/**
 * Weighted PageRank on the `semantic_related` subgraph: mass from `from` splits by `weight / sumOutgoingWeight[from]`.
 *
 * `outgoingWeightSum[i]` must be the sum of edge weights from `nodeIds[i]` to other document-like vertices
 * (same vertex set). Build it with one streaming pass over `semantic_related` before calling this.
 */
export async function computeSemanticPageRankStreaming(
	nodeIds: readonly string[],
	outgoingWeightSum: Float64Array,
	scanSemanticEdges: (
		visit: (from: string, to: string, weight: number) => void,
		iterIndex: number,
	) => Promise<void>,
	options?: VaultPageRankOptions,
): Promise<Map<string, number>> {
	const d = options?.damping ?? DEFAULT_DAMPING;
	const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
	const tol = options?.tolerance ?? DEFAULT_TOL;
	const n = nodeIds.length;
	if (n === 0) {
		return new Map();
	}
	if (outgoingWeightSum.length !== n) {
		throw new Error('computeSemanticPageRankStreaming: outgoingWeightSum length must match nodeIds');
	}

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		idToIndex.set(nodeIds[i]!, i);
	}

	let r = new Float64Array(n);
	const invN = 1 / n;
	r.fill(invN);
	const base = (1 - d) / n;

	for (let iter = 0; iter < maxIter; iter++) {
		const rNext = new Float64Array(n);
		rNext.fill(base);
		let danglingMass = 0;
		for (let j = 0; j < n; j++) {
			if (outgoingWeightSum[j]! <= 0) {
				danglingMass += r[j]!;
			}
		}

		await scanSemanticEdges((from, to, weight) => {
			const fi = idToIndex.get(from);
			const ti = idToIndex.get(to);
			if (fi === undefined || ti === undefined) return;
			const sumW = outgoingWeightSum[fi]!;
			if (sumW <= 0) return;
			const w = Number.isFinite(weight) && weight > 0 ? weight : 0;
			if (w <= 0) return;
			rNext[ti]! += (d * r[fi]! * w) / sumW;
		}, iter);

		if (danglingMass > 0) {
			const add = (d * danglingMass) / n;
			for (let i = 0; i < n; i++) {
				rNext[i]! += add;
			}
		}

		let diff = 0;
		for (let i = 0; i < n; i++) {
			diff += Math.abs(rNext[i]! - r[i]!);
		}
		r = rNext;
		if (diff < tol) break;
	}

	const scores = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		scores.set(nodeIds[i]!, r[i]!);
	}
	return scores;
}
