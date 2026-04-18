import type { Node, Edge } from '@xyflow/react';

export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline';

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
}

export type LensNode = Node<LensNodeData, 'lensNode'>;

export interface LensEdgeData extends Record<string, unknown> {
	kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain'
		| 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
	weight?: number;
	edgeLabel?: string;
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
}
