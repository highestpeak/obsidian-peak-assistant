// T8: pure cosine-distance helper retained for `ambientSearch` and
// the `test/ambient-push.test.ts` integration assertions.
//
// The previous `serendipitySearch(...)` orchestrator reached
// `sqliteStoreManager.getMobiusNodeRepo()` / `getMobiusEdgeRepo()` /
// `getEmbeddingRepo('vault')` directly. That graph + embedding access
// moved to `src/app/ambient/SearchAmbientSearchAdapter.ts`, where it
// satisfies `AmbientSearchDeps.searchSerendipity`. Detectors and the
// orchestrator never see sqlite again.

import type { AmbientPushItem } from './types';

/**
 * A serendipity candidate: a note that is 2-hops away in the graph
 * but maximally distant in embedding space.
 */
export interface SerendipityCandidate {
	/** File path of the candidate note */
	path: string;
	/** Node ID in the graph */
	nodeId: string;
	/** The bridge note that connects source to this candidate (1-hop intermediary) */
	bridgeNodeId: string;
	bridgePath: string | null;
	bridgeLabel: string;
	/** Embedding distance from source (higher = more serendipitous) */
	embeddingDistance: number;
}

/** Helper return type the adapter projects into `AmbientPushItem`. */
export type SerendipityResultItem = Pick<AmbientPushItem, 'filePath' | 'title' | 'excerpt' | 'score' | 'explanation' | 'explanationType' | 'signals' | 'timestamp'>;

/**
 * Compute cosine distance between two vectors: 1 - cosine_similarity.
 * Returns 0 for identical vectors, 2 for opposite vectors.
 */
export function cosineDistance(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 1;

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) return 1;

	return 1 - dotProduct / denominator;
}
