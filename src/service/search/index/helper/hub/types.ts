/**
 * Shared types for hub discovery, multi-round selection, and weighted local hub graphs.
 */

/** Progress events during hub maintenance. */
export type HubMaintenanceProgress = {
	phase: 'hub_discovery' | 'hub_materialize' | 'hub_index';
	batchIndex: number;
	idsInBatch: number;
};

/**
 * Semantic label for UI / frontmatter (`hub_role`). Not a DB tier.
 */
export type HubRole =
	| 'authority'
	| 'index'
	| 'bridge'
	| 'cluster_center'
	| 'folder_anchor'
	| 'manual';

/** Origin of a hub candidate. */
export type HubSourceKind = 'folder' | 'document' | 'cluster' | 'manual';

/** One discovery line that contributed to a merged {@link HubCandidate}. */
export type HubCandidateSourceEvidence = {
	kind: HubSourceKind;
	/** Graph score from that source line when the candidate was mined (0..1). */
	graphScore?: number;
};

/** Layered scores for ranking and frontmatter (0..1 each). */
export type HubCandidateScore = {
	physicalAuthorityScore: number;
	organizationalScore: number;
	semanticCentralityScore: number;
	/** Extra weight from manual / policy (0..1). */
	manualBoost: number;
};

/** Expected shape of navigation around a hub (assembly hints). */
export type HubAssemblyTopology = 'hierarchical' | 'clustered' | 'mixed';

/**
 * Deterministic or LLM-derived hints from hub discovery for local graph assembly and HubDoc.
 * Stored on {@link HubCandidate} so build steps can reuse without another LLM pass.
 */
export type HubAssemblyHints = {
	/** Canonical topic tag ids for anchor alignment. */
	anchorTopicTags: string[];
	/** Canonical functional tag ids. */
	anchorFunctionalTagIds: string[];
	/** Keyword-like tokens (user keywords + optional TextRank terms). */
	anchorKeywords: string[];
	/** Child hub document node ids to treat as frontier boundaries when present. */
	preferredChildHubNodeIds: string[];
	/**
	 * When true (default), do not expand into peer hubs or {@link preferredChildHubNodeIds}.
	 * When false, boundaries are still recorded but expansion may continue into those nodes.
	 */
	stopAtChildHub: boolean;
	expectedTopology: HubAssemblyTopology;
	/** Optional node ids to down-rank in local hub graph scoring. */
	deprioritizedBridgeNodeIds?: string[];
	/** Short rationale for debugging / downstream HubDoc LLM. */
	rationale?: string;
};

/**
 * Candidate scored for generating a HubDoc (not persisted until materialized).
 */
export type HubCandidate = {
	nodeId: string;
	path: string;
	label: string;
	role: HubRole;
	/** 0..1 combined ranking score. */
	graphScore: number;
	candidateScore?: HubCandidateScore;
	/** Stable id for filenames and deduplication (kind-specific). */
	stableKey: string;
	pagerank?: number;
	/** Weighted semantic graph centrality (`mobius_node.semantic_pagerank`). */
	semanticPagerank?: number;
	docIncomingCnt: number;
	docOutgoingCnt: number;
	/** Primary source for assembly / coverage rules; highest {@link SOURCE_PRIORITY} among {@link sourceKinds} after merge. */
	sourceKind: HubSourceKind;
	/** Distinct discovery sources that contributed (same `stableKey` merges union here). */
	sourceKinds: HubSourceKind[];
	/** Per-source scores for debugging, LLM context, and future weighting (one row per contributing kind after merge). */
	sourceEvidence: HubCandidateSourceEvidence[];
	/** Multi-source agreement bonus (capped); added to `graphScore` for ranking in discovery. */
	sourceConsensusScore: number;
	/** `min(1, graphScore + sourceConsensusScore)`; set when the candidate is built or merged. */
	rankingScore: number;
	/**
	 * Member doc paths: cluster hubs (semantic neighbors); manual hubs (`hub_source_paths` after filters).
	 * Full list for discovery/assembly; UI/LLM/frontmatter truncate at render time.
	 */
	clusterMemberPaths?: string[];
	/** Child hub routes when expansion hits another hub (document hubs). */
	childHubRoutes?: HubChildRoute[];
	/**
	 * Assembly hints from discovery (tag anchors, child hubs, topology). Used by local graph build and HubDoc metadata.
	 */
	assemblyHints?: HubAssemblyHints;
};

export type HubChildRoute = { nodeId: string; path: string; label: string };

export type HubDocArtifactParams = {
	candidate: HubCandidate;
	generatedAt: number;
	/** Optional expansion context (routes, members, local graph). */
	assembly?: HubDocAssemblyContext;
};

/** Extra sections populated from bounded graph expansion / clustering / local graph. */
export type HubDocAssemblyContext = {
	childHubRoutes?: HubChildRoute[];
	clusterMemberPaths?: string[];
	memberPathsSample?: string[];
	/** Weighted neighborhood view for this hub (optional). */
	localHubGraph?: LocalHubGraph;
};

export type AntiExplosionInput = {
	addedNodes: number;
	novelTokenCount: number;
	hubBoundaryHit?: boolean;
};

export type MobiusNodeRow = {
	node_id: string;
	path: string | null;
	label: string;
	type: string;
	doc_incoming_cnt: number | null;
	doc_outgoing_cnt: number | null;
	pagerank: number | null;
	semantic_pagerank: number | null;
	word_count: number | null;
};

/** Role hint for nodes inside a hub-local subgraph. */
export type LocalHubNodeRole = 'core' | 'child_hub' | 'bridge' | 'leaf' | 'noise' | 'boundary' | 'folder';

/** One node in a hub-local weighted graph. */
export type LocalHubGraphNode = {
	nodeId: string;
	path: string;
	label: string;
	type: string;
	depth: number;
	/** Combined importance within this hub view (0..1). */
	hubNodeWeight: number;
	distancePenalty: number;
	cohesionScore: number;
	bridgePenalty: number;
	roleHint: LocalHubNodeRole;
	expandPriority?: number;
};

/** One edge in a hub-local weighted graph. */
export type LocalHubGraphEdge = {
	fromNodeId: string;
	toNodeId: string;
	edgeType: string;
	hubEdgeWeight: number;
	edgeTypeWeight: number;
	semanticSupport: number;
	crossBoundaryPenalty: number;
};

/** Why expansion stopped and what lies on the frontier. */
export type LocalHubFrontierSummary = {
	stoppedAtDepth: number;
	reason: string;
	boundaryNodeIds: string[];
};

/** High-level coverage hints for the hub neighborhood. */
export type LocalHubCoverageSummary = {
	topFolderPrefixes: string[];
	documentCount: number;
};

/** Weighted local view around a hub center. */
export type LocalHubGraph = {
	centerNodeId: string;
	nodes: LocalHubGraphNode[];
	edges: LocalHubGraphEdge[];
	frontierSummary: LocalHubFrontierSummary;
	coverageSummary: LocalHubCoverageSummary;
};

/** Optional features for ranking beyond base graphScore (0..1 where applicable). */
export type HubFeatureVector = {
	kHopReachableMass?: number;
	folderConcentration?: number;
	semanticContinuity?: number;
	tagConcentration?: number;
	bridgePenalty?: number;
	leafPollutionRatio?: number;
	coverageGainPotential?: number;
};

/**
 * One-time document index for hub coverage bitsets: ordinal = row index in
 * {@link MobiusNodeRepo.listDocumentNodeIdPathForCoverageIndex} order.
 */
export type HubDiscoverDocCoverageIndex = {
	docCount: number;
	ordinalByNodeId: Map<string, number>;
	nodeIdByOrdinal: string[];
	pathByOrdinal: (string | null)[];
};

/** State for multi-round hub candidate mining. */
export type HubDiscoverRoundContext = {
	roundIndex: number;
	maxRounds: number;
	selectedStableKeys: Set<string>;
	/** Union of covered document ordinals (packed bitset). */
	coveredDocumentBits: Uint32Array;
	/** Same index used for {@link coveredDocumentBits} ordinals. */
	docCoverageIndex: HubDiscoverDocCoverageIndex;
	/** Reused by round summary for hub cards / overlap (stableKey → coverage bits). */
	coverageBitCache: Map<string, Uint32Array>;
	remainingPotentialScore: number;
	/** Document nodes in union coverage (incremental; avoids full-table scans in round summary). */
	coveredDocumentCount: number;
	/** Covered document count per gap path prefix (first two path segments; same rule as hubDiscover + MobiusNodeRepo). */
	coveredPrefixCounts: Map<string, number>;
};

/** Decision after a round: continue mining or stop. */
export type HubDiscoverStopDecision = {
	continueDiscovery: boolean;
	reason: string;
	remainingPotentialScore: number;
	coverageGainEstimate: number;
};

/** One selected hub row for round summary (LLM + metrics). */
export type HubDiscoverRoundSummaryHubCard = {
	stableKey: string;
	path: string;
	label: string;
	sourceKind: HubSourceKind;
	sourceKinds: HubSourceKind[];
	sourceConsensusScore: number;
	rankingScore: number;
	role: HubRole;
	graphScore: number;
	coverageSize: number;
};

/** Uncovered mass grouped by path prefix (deterministic gap hint). */
export type HubDiscoverCoverageGap = {
	pathPrefix: string;
	uncoveredDocumentCount: number;
	examplePaths: string[];
};

/** Pairwise overlap between two hubs’ estimated coverage sets. */
export type HubDiscoverOverlapPair = {
	stableKeyA: string;
	stableKeyB: string;
	overlapRatio: number;
	sharedNodeCount: number;
};

/**
 * Deterministic snapshot after greedy selection: vault scale, coverage, gaps, overlaps.
 * Safe to JSON.stringify for LLM input.
 */
export type HubDiscoverRoundSummary = {
	documentCount: number;
	mergedPoolSize: number;
	limitTotal: number;
	roundIndex: number;
	maxRounds: number;
	/** Slots left after this round’s selection (`limitTotal - selectedHubCount`). */
	remainingSlots?: number;
	/** How many hubs were appended this agent round vs previous final set. */
	newlyAddedThisRound?: number;
	selectedHubCount: number;
	selectedBySourceKind: Record<string, number>;
	/** Count by sorted `sourceKinds` joined with `+` (e.g. `document+folder`). */
	selectedBySourceBlend: Record<string, number>;
	selectedByRole: Record<string, number>;
	coveredDocumentCount: number;
	uncoveredDocumentCount: number;
	/** 0..1 share of document nodes touched by union coverage estimate. */
	coverageRatio: number;
	remainingPotentialScore: number;
	coverageGainEstimate: number;
	deterministicContinueDiscovery: boolean;
	deterministicStopReason: string;
	hubCards: HubDiscoverRoundSummaryHubCard[];
	topUncoveredFolders: HubDiscoverCoverageGap[];
	topOverlapPairs: HubDiscoverOverlapPair[];
};

/**
 * LLM review of a full hub-discovery round (structured output; see zod schema).
 * Kept in domain types for documentation; runtime validation uses `hubDiscoverRoundReviewLlmSchema` in `hubDiscoverLlm.ts`.
 */
export type HubDiscoverRoundReview = {
	coverageSufficient: boolean;
	quality: 'good' | 'acceptable' | 'poor';
	needAnotherRound: boolean;
	confidence: number;
	summary: string;
	strengths: string[];
	issues: string[];
	nextDirections: string[];
	suggestedDiscoveryModes: Array<'folder' | 'document' | 'cluster' | 'manual_seed'>;
	targetPathPrefixes: string[];
	stopReason: string;
};

/** Discovery mode hints for the agent loop (includes manual hubs as `manual_seed`). */
export type HubDiscoverAgentMode = 'folder' | 'document' | 'cluster' | 'manual_seed';

/**
 * Executable hints for the next hub-discovery iteration (from LLM review and/or deterministic gaps).
 */
export type HubDiscoverNextRoundHints = {
	roundIndex: number;
	remainingSlots: number;
	targetPathPrefixes: string[];
	suggestedDiscoveryModes: HubDiscoverAgentMode[];
	nextDirections: string[];
};

export const SOURCE_PRIORITY: Record<HubSourceKind, number> = {
	manual: 4,
	folder: 3,
	document: 2,
	cluster: 1,
};

/** User-tunable hub discovery (SearchSettings.hubDiscover). */
export type HubDiscoverSettings = {
	/** When true, run one structured LLM review over the round summary (does not remove hubs). */
	enableLlmJudge: boolean;
	/** Reserved (legacy gray-zone per-candidate judge); not used by round review. */
	maxJudgeCalls: number;
	/** Min marginal coverage gain (0..1) to keep adding hubs in multi-round. */
	minCoverageGain: number;
	/** Max discovery rounds (each round may add candidates until limit). */
	maxRounds: number;
	/** Gray zone: min graphScore to consider for judge. */
	judgeGrayZoneMin: number;
	/** Gray zone: max graphScore to consider for judge. */
	judgeGrayZoneMax: number;
};

export const DEFAULT_HUB_DISCOVER_SETTINGS: HubDiscoverSettings = {
	enableLlmJudge: false,
	maxJudgeCalls: 20,
	minCoverageGain: 0.04,
	maxRounds: 3,
	judgeGrayZoneMin: 0.32,
	judgeGrayZoneMax: 0.58,
};
