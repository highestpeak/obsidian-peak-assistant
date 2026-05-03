/**
 * Shared types for structural analysis: betweenness centrality, community detection, gap analysis.
 */

export type StructuralMetric = {
	nodeId: string;
	betweenness: number;      // normalized [0, 1]
	burtConstraint: number;   // [0, 1], lower = more structural hole
	communityId: number;
};

export type CommunityData = {
	communityId: number;
	label: string | null;
	memberCount: number;
	avgBetweenness: number;
	centroidEmbedding: number[] | null;
};

export type GapPair = {
	communityA: number;
	communityB: number;
	gapScore: number;         // semanticSim * (1 - interDensity)
	semanticSim: number;
	interDensity: number;
	bridgeCandidates: string[];  // node IDs
	status: 'open' | 'addressed' | 'dismissed';
};

/** Options for Brandes betweenness computation. */
export type BrandesOptions = {
	/** Use k-source sampling for approximate betweenness (recommended for V > 20K). */
	approximate?: boolean;
	/** Number of source nodes to sample (default: sqrt(V)). Only used when approximate=true. */
	kSources?: number;
};

/** Options for Louvain community detection. */
export type LouvainOptions = {
	/** Resolution parameter γ (default 1.0). Higher = more, smaller communities. */
	resolution?: number;
	/** Max iterations per pass (default 100). */
	maxIterations?: number;
};
