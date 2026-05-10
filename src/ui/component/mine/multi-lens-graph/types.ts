import type { Node, Edge } from '@xyflow/react';

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

export type LensNode = Node<LensNodeData, 'lensNode'>;

export interface LensEdgeData extends Record<string, unknown> {
	kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain'
		| 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
	weight?: number;
	edgeLabel?: string;
	/** True when edge count > 1.2x node count — suppresses labels unless hovered */
	dense?: boolean;
}

export type LensEdge = Edge<LensEdgeData>;

export interface LensGraphData {
	nodes: LensNodeData[];
	edges: Array<{
		source: string;
		target: string;
		kind: LensEdgeData['kind'];
		weight?: number;
		label?: string;
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
