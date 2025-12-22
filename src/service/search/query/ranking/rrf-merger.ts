/**
 * Merge hybrid search results using Reciprocal Rank Fusion (RRF).
 */
export function mergeHybridResultsWithRRF<T extends { path: string }>(params: {
	textHits: Array<T & { score: number }>;
	vectorHits: Array<T & { score: number }>;
	limit: number;
}): Array<T & { score: number }> {
	const k = 60;
	const textWeight = 0.6;
	const vectorWeight = 0.4;

	const scores = new Map<string, { score: number; hit: T & { score: number } }>();

	for (let rank = 1; rank <= params.textHits.length; rank++) {
		const hit = params.textHits[rank - 1]!;
		const id = hit.path;
		const rrf = textWeight / (k + rank);
		const existing = scores.get(id);
		if (existing) {
			existing.score += rrf;
			existing.hit = hit;
		} else {
			scores.set(id, { score: rrf, hit });
		}
	}

	for (let rank = 1; rank <= params.vectorHits.length; rank++) {
		const hit = params.vectorHits[rank - 1]!;
		const id = hit.path;
		const rrf = vectorWeight / (k + rank);
		const existing = scores.get(id);
		if (existing) {
			existing.score += rrf;
		} else {
			scores.set(id, { score: rrf, hit });
		}
	}

	return Array.from(scores.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, params.limit)
		.map((x) => ({ ...x.hit, score: x.score }));
}

