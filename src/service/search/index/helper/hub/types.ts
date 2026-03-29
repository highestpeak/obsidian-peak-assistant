/**
 * Shared types for hub discovery, multi-round selection, and weighted local hub graphs.
 */

/** Progress events during hub maintenance. */
export type HubMaintenanceProgress = {
	phase: 'hub_discovery' | 'hub_materialize' | 'hub_index';
	progressTextSuffix: string;
	/** Set when `phase === 'hub_discovery'` and a round just finished (greedy selection snapshot). */
	roundSummary?: HubDiscoverRoundSummary;
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
 * Cross-stage transport object for hub discovery → merge → selection → HubDoc materialization.
 * Not persisted as a row; survives until a HubDoc file is written.
 *
 * **Field groups**
 * - **Identity:** who this hub centers on (`nodeId`, `path`, `label`, `role`, `stableKey`).
 * - **Intrinsic score:** how “hub-like” the node is (`graphScore`, optional `candidateScore` breakdown, raw signals).
 * - **Provenance:** how it was found and merged across pipelines (`sourceKind`, `sourceKinds`, `sourceEvidence`,
 *   `sourceConsensusScore`, `rankingScore`). See {@link mergeCandidatesByPriority} in `hubDiscover.ts`.
 * - **Assembly:** neighborhood hints for local graph + HubDoc (`clusterMemberPaths`, `childHubRoutes`, `assemblyHints`).
 *
 * **Scores:** `graphScore` = one blended 0..1 hub strength; `candidateScore` = optional breakdown of that blend.
 * `rankingScore` = discovery sort key: `min(1, graphScore + sourceConsensusScore)` after merge.
 */
export type HubCandidate = {

	// Identity

	/** Mobius graph node id for the hub center. */
	nodeId: string;
	/** Vault path of the center note (or representative path for non-document hubs). */
	path: string;
	/** Display title; may differ from file basename after LLM or label sources. */
	label: string;
	/** Semantic role for YAML / UI; inferred or overridden (e.g. manual frontmatter). */
	role: HubRole;
	/**
	 * Dedup key across discovery lines (`document:…`, `manual-hub:…`, folder/cluster shapes).
	 * Used for merge and stable HubDoc naming; not always interchangeable with `nodeId`.
	 */
	stableKey: string;

	// Scores. Intrinsic score

	/**
	 * Single blended “how hub-like is this node?” score in 0..1 (PageRank + link degrees + semantic centrality, etc.).
	 * When several discovery rows merge into one `stableKey`, this number is taken from the primary source row only.
	 * It does **not** include the extra “several pipelines agreed” bump — that is folded into `rankingScore` instead.
	 */
	graphScore: number;
	/**
	 * Same hub as four named components (authority / links / semantic / manual boost), each 0..1.
	 * They explain and tune `graphScore`; omit when only the final blend was computed.
	 */
	candidateScore?: HubCandidateScore;

	// Provenance. how it was found and merged across pipelines

	/** Document graph PageRank from `mobius_node.pagerank` (raw signal; also part of `candidateScore` blend). */
	pagerank?: number;
	/** Semantic graph centrality (`mobius_node.semantic_pagerank`); raw signal for `candidateScore`. */
	semanticPagerank?: number;
	/** Obsidian link-ish incoming edge count on the document graph (organizational signal). */
	docIncomingCnt: number;
	/** Obsidian link-ish outgoing edge count on the document graph (organizational signal). */
	docOutgoingCnt: number;
	/** Primary kind after merge: max {@link SOURCE_PRIORITY} among contributing lines; drives assembly/coverage behavior. */
	sourceKind: HubSourceKind;
	/** All distinct discovery kinds that contributed before/after merge (union for the same `stableKey`). */
	sourceKinds: HubSourceKind[];
	/** One evidence row per contributing kind after merge; used for debugging and LLM context. */
	sourceEvidence: HubCandidateSourceEvidence[];
	/** Multi-source agreement bonus (capped); boosts `rankingScore` when several pipelines agree. */
	sourceConsensusScore: number;
	/** Discovery selection score: `min(1, graphScore + sourceConsensusScore)`; sort hubs by this, not raw `graphScore`. */
	rankingScore: number;

	// Assembly

	/**
	 * Member vault paths: cluster hubs (semantic neighbors); manual hubs from filtered `hub_source_paths`.
	 * Full list for assembly; UI / LLM / frontmatter slice at render time.
	 */
	clusterMemberPaths?: string[];
	/** Frontier exits to other hub documents during expansion (see `localGraphAssembler` / HubDoc “Topology Routes”). */
	childHubRoutes?: HubChildRoute[];
	/**
	 * Deterministic or merged hints (tags, child-hub boundaries, topology) for local graph build and HubDoc JSON metadata.
	 */
	assemblyHints?: HubAssemblyHints;
	/** Cluster V1.1 only: scoring / cohesion / reject reason for debugging. */
	clusterV11Debug?: HubClusterV11Debug;
};

/**
 * Deterministic cluster hub discovery diagnostics (multi-signal affinity + cohesion gate).
 */
export type HubClusterV11Debug = {
	seedNodeId: string;
	seedPath: string;
	recallCount: number;
	afterPathFilterCount: number;
	afterAffinityFilterCount: number;
	cohesion: {
		avgAffinity: number;
		topicConsistency: number;
		keywordConsistency: number;
		titleConsensus: number;
		cohesionScore: number;
	};
	cohesionPass: boolean;
	rejectReason?: string;
	members: Array<{
		nodeId: string;
		path: string;
		affinity: number;
		semanticSupport: number;
		kept: boolean;
		reason?: string;
	}>;
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
 * One-time document index for hub coverage bitsets: ordinal = index in `node_id` ascending order
 * (same as {@link MobiusNodeRepo.listDocumentNodeIdPathForCoverageIndexKeyset} full scan).
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
