import type { LensType } from '@/core/types/lens-graph';
import type { AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { ResultBrowserView } from '@/ui/component/result-browser/model/types';

export type GraphWorkspaceHostId =
	| 'world-search'
	| 'file-atlas'
	| 'ai-sources'
	| 'composer'
	| 'ai-graph-artifact';

export type GraphWorkspaceScope = 'one-hop' | 'two-hop' | 'ai';

export interface GraphWorkspaceActionManifest {
	semanticLayer: boolean;
	nodeList: boolean;
	copyMermaid: boolean;
	copyImage: boolean;
	zoom: boolean;
	fit: boolean;
	readableView: boolean;
	fullscreen: boolean;
	miniMap: boolean;
}

export interface GraphWorkspaceManifest {
	hostId: GraphWorkspaceHostId;
	views: readonly ResultBrowserView[];
	scopes: readonly GraphWorkspaceScope[];
	physicalProjections: readonly AtlasGraphPreset[];
	aiLenses: readonly LensType[];
	actions: GraphWorkspaceActionManifest;
	readOnly: boolean;
}

const COMPLETE_ACTIONS: GraphWorkspaceActionManifest = {
	semanticLayer: true,
	nodeList: true,
	copyMermaid: true,
	copyImage: true,
	zoom: true,
	fit: true,
	readableView: true,
	fullscreen: true,
	miniMap: true,
};

const PHYSICAL_PROJECTIONS = [
	'constellation',
	'community',
	'flow-lr',
	'flow-tb',
	'folder',
	'orbit',
] as const;

const AI_LENSES = ['topology', 'thinking-tree', 'bridge', 'timeline', 'gap-analysis'] as const;
const GRAPH_SCOPES = ['one-hop', 'two-hop', 'ai'] as const;

export const GRAPH_WORKSPACE_MANIFESTS: Readonly<Record<GraphWorkspaceHostId, GraphWorkspaceManifest>> = {
	'world-search': {
		hostId: 'world-search',
		views: ['list', 'tree', 'graph'],
		scopes: [],
		physicalProjections: PHYSICAL_PROJECTIONS,
		aiLenses: [],
		actions: COMPLETE_ACTIONS,
		readOnly: true,
	},
	'file-atlas': {
		hostId: 'file-atlas',
		views: ['tree', 'graph'],
		scopes: GRAPH_SCOPES,
		physicalProjections: PHYSICAL_PROJECTIONS,
		aiLenses: AI_LENSES,
		actions: COMPLETE_ACTIONS,
		readOnly: true,
	},
	'ai-sources': {
		hostId: 'ai-sources',
		views: ['list', 'tree', 'graph'],
		scopes: GRAPH_SCOPES,
		physicalProjections: PHYSICAL_PROJECTIONS,
		aiLenses: AI_LENSES,
		actions: COMPLETE_ACTIONS,
		readOnly: true,
	},
	composer: {
		hostId: 'composer',
		views: ['list', 'tree', 'graph'],
		scopes: GRAPH_SCOPES,
		physicalProjections: PHYSICAL_PROJECTIONS,
		aiLenses: AI_LENSES,
		actions: COMPLETE_ACTIONS,
		readOnly: true,
	},
	'ai-graph-artifact': {
		hostId: 'ai-graph-artifact',
		views: ['graph'],
		scopes: [],
		physicalProjections: [],
		aiLenses: AI_LENSES,
		actions: COMPLETE_ACTIONS,
		readOnly: true,
	},
};

export function resolveGraphWorkspaceManifest(hostId: GraphWorkspaceHostId): GraphWorkspaceManifest {
	return GRAPH_WORKSPACE_MANIFESTS[hostId];
}
