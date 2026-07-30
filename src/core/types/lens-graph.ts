// T11H (2026-06-26): framework-agnostic Lens graph data types.
//
// Moved from `src/ui/component/mine/multi-lens-graph/types.ts` so
// service- and core-layer code that produces or persists Lens graph
// data (AIGraphAgent, ai-graph helpers, AiGraphDoc, etc.) does not
// need to import from `src/ui/`. The UI types module re-exports these
// and additionally declares the ReactFlow-coupled `LensNode` / `LensEdge`
// aliases for the React component layer.
import type { GraphEdgeDirectionality } from './graph-edge';

export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline' | 'gap-analysis';

export interface LensNodeData extends Record<string, unknown> {
	label: string;
	path: string;
	role?: 'root' | 'hub' | 'bridge' | 'leaf' | 'orphan';
	group?: string;
	createdAt?: number;
	modifiedAt?: number;
	level?: number;
	parentId?: string;
	summary?: string;
	score?: number;
	clusterId?: string;
	importance?: number;
	betweenness?: number;     // [0,1] — drives node sizing in gap-analysis lens
	constraint?: number;      // Burt coefficient — drives opacity
	communityId?: string;     // Louvain community — drives color
}

export interface LensEdgeData extends Record<string, unknown> {
	kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain'
		| 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
	weight?: number;
	edgeLabel?: string;
	directionality?: GraphEdgeDirectionality;
	/** Stable domain relation identity retained through transient lens layout. */
	canonicalRelationId?: string;
	/** Non-visual source → predicate → target description for inspectors and AT. */
	accessibleLabel?: string;
	/** True when edge count > 1.2x node count — suppresses labels unless hovered */
	dense?: boolean;
}

export interface LensGraphData {
	nodes: LensNodeData[];
	edges: Array<{
		source: string;
		target: string;
		kind: LensEdgeData['kind'];
		weight?: number;
		label?: string;
		directionality?: GraphEdgeDirectionality;
		canonicalRelationId?: string;
		accessibleLabel?: string;
	}>;
	availableLenses: LensType[];
	clusters?: Array<{ id: string; name: string; description: string }>;
	bridges?: Array<{ node_path: string; connects: [string, string]; explanation: string }>;
	evolutionChains?: Array<{ chain: string[]; theme: string }>;
	insights?: {
		topology?: string;
		bridges?: string;
		timeline?: string;
	};
	gaps?: Array<{
		id: string;
		communityA: string;
		communityB: string;
		score: number;
		suggestedBridges: number;
		gapType: string;
	}>;
	communityMetrics?: Array<{
		id: string;
		label: string;
		memberCount: number;
		color: string;
	}>;
}
