/**
 * Graph visualization config and constants.
 */

export type SemanticEdgeStyle = 'solid' | 'dashed' | 'dotted';

export interface GraphConfig {
	/** Center force strength (Obsidian: Center force). */
	centerStrength: number;
	/** Repulsion strength (Obsidian: Repel force). */
	chargeStrength: number;
	/** Link force strength (Obsidian: Link force). */
	linkStrength: number;
	/** Link distance (Obsidian: Link distance). */
	linkDistance: number;
	collisionRadius: number;

	semanticLinkStroke: string;
	semanticNodeFill: string;
	semanticEdgeStyle: SemanticEdgeStyle;
	semanticEdgeOpacity: number;
	semanticEdgeWidthScale: number;

	physicalLinkStroke: string;
	physicalNodeFill: string;
	physicalEdgeStyle: SemanticEdgeStyle;
	/** Physical edge opacity (0–1). */
	physicalEdgeOpacity: number;
	/** Physical edge width scale. */
	physicalEdgeWidthScale: number;

	/** Show tag nodes and their edges; when false, tags and cascade-isolated nodes are hidden. */
	showTags: boolean;
	/** Show semantic edges in the visible graph. */
	showSemanticEdges: boolean;

	/** Fill color for tag-type nodes. */
	tagNodeFill: string;
	/** Fill color for concept-type nodes. Only shown in settings when graph has concept nodes. */
	conceptNodeFill: string;
	/** Highlight high-degree (hub) nodes with a halo. */
	highlightHubs: boolean;
	/** Number of top-degree nodes to highlight as hubs. */
	hubTopN: number;
	/** Hub halo color (CSS color). */
	hubColor: string;
	/** Show only maximum spanning tree edges (skeleton mode). */
	skeletonMode: boolean;
	/** MST edge stroke color (skeleton mode). */
	mstColor: string;
	/** MST edge style: solid/dashed/dotted (skeleton mode). */
	mstEdgeStyle: SemanticEdgeStyle;
	/** MST edge opacity 0–1 (skeleton mode). */
	mstEdgeOpacity: number;
	/** MST edge width scale (skeleton mode). */
	mstWidthScale: number;
	/** Show community hulls (convex hull per community). */
	communityMode: boolean;
	/** Enable Option/Alt+click to pick path A/B and highlight shortest path. */
	pathMode: boolean;
	/** Path overlay line and node glow color (CSS color). */
	pathColor: string;
	/** Pull nodes toward their community centroid (uses LPA community detection). */
	clusterLayout: boolean;
	/** Cluster force strength (how strongly nodes are pulled toward community center). 0.01–0.15. */
	clusterForceStrength: number;
	/** Repulsion between cluster centroids so groups don't overlap. 0 = off. */
	clusterRepulsionStrength: number;
	/** Repulsion between connected components (multiple MSTs). Pushes separate components apart. 0 = off. */
	componentRepulsionStrength: number;
	/** MST edges: link strength multiplier (stronger spring for tree backbone). */
	mstLinkStrengthScale: number;
	/** Non-MST edges: link strength multiplier (weaker so layout follows tree). */
	nonMstLinkStrengthScale: number;
	/** MST edges: link distance scale (shorter = tighter). */
	mstLinkDistanceScale: number;
	/** Non-MST edges: link distance scale (longer = looser). */
	nonMstLinkDistanceScale: number;

	/** Base radius for physical nodes (Tag/Concept follow this). */
	nodeBaseRadiusPhysical: number;
	/** Base radius for semantic nodes. */
	nodeBaseRadiusSemantic: number;
	/** Extra radius added when degree goes from min to max (degree-based scaling). */
	nodeDegreeBoost: number;

	/** MST prune depth (0=no prune; 1–3=iteratively remove leaf nodes). Higher = sparser trunk. */
	mstPruneDepth: number;
	/** When true, show only the 2-core of the MST (central spine), no branches. */
	skeletonBackboneOnly: boolean;
	/** Min nodes in smaller subtree for an edge to count as "branch" (MST style); else terminal (original style). */
	skeletonMinBranchNodes: number;
	/** Leaf edge opacity in skeleton mode (dimmed relative to backbone). */
	mstLeafOpacity: number;
	/** Leaf edge width scale in skeleton mode. */
	mstLeafWidthScale: number;
	/** Draw breathing/pulse animations for MindFlow states (exploring, thinking, verified). */
	mindflowAnimations: boolean;
}

/** Defaults tuned for clustered layout (related nodes stay together) and Obsidian-like colors. */
export const DEFAULT_CONFIG: GraphConfig = {
	centerStrength: 0.25,
	chargeStrength: -200,
	linkStrength: 0.55,
	linkDistance: 95,
	collisionRadius: 42,
	semanticLinkStroke: '#a78bfa',
	physicalLinkStroke: '#4b5563',
	semanticNodeFill: '#7c3aed',
	physicalNodeFill: '#4b5563',
	showTags: true,
	showSemanticEdges: true,
	tagNodeFill: '#d97706',
	conceptNodeFill: '#0ea5e9',
	semanticEdgeStyle: 'dashed',
	semanticEdgeOpacity: 0.35,
	semanticEdgeWidthScale: 1,
	physicalEdgeStyle: 'solid',
	physicalEdgeOpacity: 0.35,
	physicalEdgeWidthScale: 1,
	highlightHubs: false,
	hubTopN: 5,
	hubColor: '#f59e0b',
	skeletonMode: false,
	mstColor: '#001eff',
	mstEdgeStyle: 'solid',
	mstEdgeOpacity: 0.7,
	mstWidthScale: 2.5,
	communityMode: false,
	pathMode: true,
	pathColor: '#dc2626',
	clusterLayout: true,
	clusterForceStrength: 0.02,
	clusterRepulsionStrength: 0.12,
	componentRepulsionStrength: 0.6,
	mstLinkStrengthScale: 1.5,
	nonMstLinkStrengthScale: 0.3,
	mstLinkDistanceScale: 0.7,
	nonMstLinkDistanceScale: 1.25,
	nodeBaseRadiusPhysical: 6,
	nodeBaseRadiusSemantic: 7,
	nodeDegreeBoost: 16,
	mstPruneDepth: 2,
	skeletonBackboneOnly: false,
	skeletonMinBranchNodes: 3,
	mstLeafOpacity: 0.25,
	mstLeafWidthScale: 0.6,
	mindflowAnimations: true,
};

/** Slider shows 0-100; actual force value = sliderValue * SCALE (0-1). */
export const FORCE_SLIDER_SCALE = 100;

export const SLIDER_CONFIGS = {
	centerStrength: { min: 0, max: 100, step: 1 },
	linkDistance: { min: 40, max: 400, step: 10 },
	chargeStrength: { min: -400, max: 20, step: 10 },
	linkStrength: { min: 0, max: 100, step: 1 },
	collisionRadius: { min: 12, max: 120, step: 2 },
	clusterForceStrength: { min: 1, max: 15, step: 1 },
	nodeBaseRadiusPhysical: { min: 3, max: 28, step: 2 },
	nodeBaseRadiusSemantic: { min: 3, max: 28, step: 2 },
	nodeDegreeBoost: { min: 0, max: 60, step: 2 },
	mstPruneDepth: { min: 0, max: 3, step: 1 },
	skeletonMinBranchNodes: { min: 1, max: 20, step: 1 },
	mstLeafOpacity: { min: 0.05, max: 1, step: 0.05 },
	mstLeafWidthScale: { min: 0.2, max: 1.5, step: 0.1 },
} as const;

export type GraphCopyFormat = 'markdown' | 'json' | 'mermaid';
