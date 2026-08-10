/**
 * Shared types for structural hole / hub detection analysis pipeline.
 * Covers: Brandes betweenness, Louvain community detection, Burt constraint,
 * gap detection, and bridge candidate identification.
 */

export interface AnalysisNode {
	id: string;       // mobius_node.node_id
	path: string;
}

export interface CommunitySignal {
	key: string;
	label: string;
	kind: 'tag' | 'term';
	idf: number;
}

export interface CommunityDescriptor {
	key: string;
	label: string;
	kind: 'tag' | 'term';
	support: number;
	score: number;
}

export interface AnalysisEdge {
	from: string;
	to: string;
	weight: number;   // physical references dominate; semantic_related uses weak direct similarity
}

export interface AnalysisGraph {
	nodes: AnalysisNode[];
	/** Weighted undirected adjacency map: nodeId -> Map<neighborId, weight> */
	adjacency: Map<string, Map<string, number>>;
	nodeCount: number;
	edgeCount: number;
	/** Total eligible vault nodes before the configured analysis budget. */
	totalNodeCount: number;
	analysisMode: 'exact' | 'bounded';
	/** Eligible deterministic tag/term signals after DF suppression. */
	signalsByNode: Map<string, CommunitySignal[]>;
	/** Directed physical-reference rows retained in the analyzed scope. */
	referenceEdges: Array<{ from: string; to: string }>;
}

export interface CommunityInfo {
	id: string;               // e.g. "c_0", "c_5"
	label: string;            // derived from dominant topic tags
	memberCount: number;
	internalDensity: number;
	topNodes: Array<{ path: string; label: string; betweenness: number }>;
	dominantTopics: string[];
	/** Evidence-rich fields added in analysis v2; optional for legacy fixtures/readers. */
	descriptors?: CommunityDescriptor[];
	fingerprint?: string;
	internalReferenceCount?: number;
	analysisVersion?: number;
	analysisMode?: 'exact' | 'bounded';
	analyzedNodeCount?: number;
	totalNodeCount?: number;
}

export interface BridgeNode {
	path: string;
	label: string;
	betweenness: number;
	constraint: number;
	communitiesConnected: string[];
	fragility: 'critical' | 'moderate' | 'stable';
}

export interface PotentialBridge {
	sourceNode: { path: string; label: string; community: string };
	targetNode: { path: string; label: string; community: string };
	semanticSimilarity: number;
	suggestedAction: 'add_link' | 'create_note';
	rationale: string;
}

export interface StructuralHole {
	id: string;
	communityA: CommunityInfo;
	communityB: CommunityInfo;
	gapScore: number;
	gapType: 'missing_bridge' | 'weak_bridge' | 'latent_connection' | 'topic_blind_spot' | 'decaying_bridge';
	semanticBridgePotential: number;
	existingBridges: BridgeNode[];
	potentialBridges: PotentialBridge[];
	explanation?: string;
}

export interface StructuralAnalysisResult {
	betweenness: Map<string, number>;         // nodeId -> normalized [0,1]
	communities: Map<string, string>;         // nodeId -> communityId
	constraint: Map<string, number>;          // nodeId -> constraint coefficient
	communityInfos: CommunityInfo[];
	structuralHoles: StructuralHole[];
	modularityQ: number;
	analysisVersion: number;
	computedAt: number;
}
