import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';

export type AtlasGraphNodeRole =
	| 'document'
	| 'hub'
	| 'root'
	| 'bridge'
	| 'leaf'
	| 'orphan'
	| 'claim'
	| 'source'
	| 'question';

export interface AtlasGraphNode {
	id: string;
	label: string;
	path: string;
	role: AtlasGraphNodeRole;
	score?: number;
	communityId?: string | null;
	folder?: string;
	preview?: string;
	signals?: string[];
	incomingLinks?: number;
	outgoingLinks?: number;
	constituentCount?: number;
	metadata?: Readonly<Record<string, unknown>>;
}

export interface AtlasGraphEdge {
	id: string;
	source: string;
	target: string;
	role: string;
	directionality?: GraphEdgeDirectionality;
	weight?: number;
	label?: string;
	relationId: string | null;
	accessibleLabel?: string | null;
	metadata?: Readonly<Record<string, unknown>>;
}

export interface AtlasGraphModel {
	id: string;
	nodes: readonly AtlasGraphNode[];
	edges: readonly AtlasGraphEdge[];
	positions?: Readonly<Record<string, { x: number; y: number }>>;
	communities?: ResultSubgraphOutput['communities'];
	isolationIds?: readonly string[];
	overflowCount?: number;
	layerRole: 'semantic' | 'evidence';
}

export function atlasGraphModelToResultSubgraph(model: AtlasGraphModel): ResultSubgraphOutput {
	return {
		resultNodes: model.nodes.filter((node) => node.role !== 'hub').map((node) => ({
			id: node.id,
			path: node.path,
			title: node.label,
			score: node.score ?? 1,
			communityId: node.communityId ?? null,
			folder: node.folder ?? node.path.split('/')[0] ?? '',
			preview: node.preview,
			signals: node.signals,
			incomingLinks: node.incomingLinks,
			outgoingLinks: node.outgoingLinks,
		})),
		hubAnchors: model.nodes.filter((node) => node.role === 'hub').map((node) => ({
			id: node.id,
			path: node.path,
			title: node.label,
			constituentCount: node.constituentCount ?? 0,
		})),
		edges: model.edges.map((edge) => ({
			from: edge.source,
			to: edge.target,
			kind: edge.role === 'semantic' ? 'semantic' : edge.role === 'hub_constituent' ? 'hub_constituent' : 'reference',
			directionality: edge.directionality,
			weight: edge.weight,
		})),
		isolatedDocIds: [...(model.isolationIds ?? [])],
		overflowCount: model.overflowCount ?? 0,
		communities: model.communities ?? [],
	};
}
