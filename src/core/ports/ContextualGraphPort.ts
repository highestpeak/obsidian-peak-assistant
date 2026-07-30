import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';

export interface ContextualHubRef {
	path: string;
	label: string;
	status: 'primary' | 'candidate';
	confidence: number | null;
}

export interface ContextualSourceRef {
	path: string;
	label: string;
	direction: 'source' | 'outgoing';
}

export interface ContextualGraphNode {
	id: string;
	label: string;
	path: string | null;
	role: 'current' | 'neighbor' | 'hub' | 'bridge';
}

export interface ContextualGraphEdge {
	source: string;
	target: string;
	kind: 'reference' | 'semantic' | 'hub';
	directionality: GraphEdgeDirectionality;
}

export interface DocumentGraphContext {
	filePath: string;
	hubs: ContextualHubRef[];
	sources: ContextualSourceRef[];
	nodes: ContextualGraphNode[];
	edges: ContextualGraphEdge[];
	orphanStatus: 'connected' | 'soft-orphan' | 'orphan';
}

/**
 * Read-only contextual graph capability shared by Document Copilot and Search.
 * It projects existing index truth; it never mutates links, hubs, or notes.
 */
export interface ContextualGraphPort {
	loadDocumentContext(filePath: string): Promise<DocumentGraphContext>;
}
