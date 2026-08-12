import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { LensType } from '@/core/types/lens-graph';
import type { AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { ResultBrowserView } from '@/ui/component/result-browser/model/types';
import type { GraphWorkspaceScope } from './GraphWorkspaceManifest';

export interface GraphWorkspaceConfig {
	motion: {
		viewThumbMs: number;
		scopeThumbMs: number;
		projectionThumbMs: number;
		labelCompressMs: number;
		scopeExpandMs: number;
		scopeStaggerMs: number;
		semanticSwitchMs: number;
		easing: [number, number, number, number];
	};
	labels: {
		views: Record<ResultBrowserView, string>;
		scopes: Record<GraphWorkspaceScope, string>;
		physicalProjections: Record<AtlasGraphPreset, string>;
		aiLenses: Record<LensType, string>;
		timelineUnassigned: string;
	};
	aiLayout: {
		columnGap: number;
		rowGap: number;
		clusterGap: number;
		communityRadius: number;
		canvasPadding: number;
		bridgeColumnWidth: number;
		bridgeColumnGap: number;
		timelineFirstColumnLeft: number;
		topologyWeightMin: number;
		topologyEdgeCapRatio: number;
	};
}

export const DEFAULT_GRAPH_WORKSPACE_CONFIG: GraphWorkspaceConfig = {
	motion: {
		viewThumbMs: 90,
		scopeThumbMs: 95,
		projectionThumbMs: 105,
		labelCompressMs: 75,
		scopeExpandMs: 105,
		scopeStaggerMs: 12,
		semanticSwitchMs: 100,
		easing: [0.2, 0.8, 0.2, 1],
	},
	labels: {
		views: {
			list: 'List',
			tree: 'Tree',
			graph: 'Graph',
		},
		scopes: {
			'one-hop': 'One hop',
			'two-hop': 'Two hop',
			ai: 'AI Graph',
		},
		physicalProjections: {
			constellation: 'Constellation',
			community: 'Community',
			'flow-lr': 'Flow →',
			'flow-tb': '↓',
			folder: 'Folders',
			orbit: 'Orbit',
		},
		aiLenses: {
			topology: 'Topology',
			'thinking-tree': 'Thinking tree',
			bridge: 'Bridges',
			timeline: 'Timeline',
			'gap-analysis': 'Gaps',
		},
		timelineUnassigned: 'No date / Unassigned',
	},
	aiLayout: {
		columnGap: 220,
		rowGap: 96,
		clusterGap: 300,
		communityRadius: 150,
		canvasPadding: 40,
		bridgeColumnWidth: 280,
		bridgeColumnGap: 320,
		timelineFirstColumnLeft: 120,
		topologyWeightMin: 0.4,
		topologyEdgeCapRatio: 1.5,
	},
};

function finiteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringRecord<K extends string>(
	value: unknown,
	fallback: Record<K, string>,
): Record<K, string> {
	if (!value || typeof value !== 'object') return fallback;
	const candidate = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(fallback).map(([key, label]) => [
			key,
			typeof candidate[key] === 'string' ? candidate[key] : label,
		]),
	) as Record<K, string>;
}

export function parseGraphWorkspaceConfig(value: unknown): GraphWorkspaceConfig {
	if (!value || typeof value !== 'object') return DEFAULT_GRAPH_WORKSPACE_CONFIG;
	const record = value as Record<string, unknown>;
	const motion = record.motion && typeof record.motion === 'object'
		? record.motion as Record<string, unknown>
		: {};
	const labels = record.labels && typeof record.labels === 'object'
		? record.labels as Record<string, unknown>
		: {};
	const aiLayout = record.aiLayout && typeof record.aiLayout === 'object'
		? record.aiLayout as Record<string, unknown>
		: {};
	const easing = Array.isArray(motion.easing) && motion.easing.length === 4
		? motion.easing.map((item, index) => finiteNumber(item, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.easing[index]!)) as [number, number, number, number]
		: DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.easing;
	return {
		motion: {
			viewThumbMs: finiteNumber(motion.viewThumbMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.viewThumbMs),
			scopeThumbMs: finiteNumber(motion.scopeThumbMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.scopeThumbMs),
			projectionThumbMs: finiteNumber(motion.projectionThumbMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.projectionThumbMs),
			labelCompressMs: finiteNumber(motion.labelCompressMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.labelCompressMs),
			scopeExpandMs: finiteNumber(motion.scopeExpandMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.scopeExpandMs),
			scopeStaggerMs: finiteNumber(motion.scopeStaggerMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.scopeStaggerMs),
			semanticSwitchMs: finiteNumber(motion.semanticSwitchMs, DEFAULT_GRAPH_WORKSPACE_CONFIG.motion.semanticSwitchMs),
			easing,
		},
		labels: {
			views: stringRecord(labels.views, DEFAULT_GRAPH_WORKSPACE_CONFIG.labels.views),
			scopes: stringRecord(labels.scopes, DEFAULT_GRAPH_WORKSPACE_CONFIG.labels.scopes),
			physicalProjections: stringRecord(labels.physicalProjections, DEFAULT_GRAPH_WORKSPACE_CONFIG.labels.physicalProjections),
			aiLenses: stringRecord(labels.aiLenses, DEFAULT_GRAPH_WORKSPACE_CONFIG.labels.aiLenses),
			timelineUnassigned: typeof labels.timelineUnassigned === 'string' ? labels.timelineUnassigned : DEFAULT_GRAPH_WORKSPACE_CONFIG.labels.timelineUnassigned,
		},
		aiLayout: {
			columnGap: finiteNumber(aiLayout.columnGap, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.columnGap),
			rowGap: finiteNumber(aiLayout.rowGap, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.rowGap),
			clusterGap: finiteNumber(aiLayout.clusterGap, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.clusterGap),
			communityRadius: finiteNumber(aiLayout.communityRadius, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.communityRadius),
			canvasPadding: finiteNumber(aiLayout.canvasPadding, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.canvasPadding),
			bridgeColumnWidth: finiteNumber(aiLayout.bridgeColumnWidth, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.bridgeColumnWidth),
			bridgeColumnGap: finiteNumber(aiLayout.bridgeColumnGap, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.bridgeColumnGap),
			timelineFirstColumnLeft: finiteNumber(aiLayout.timelineFirstColumnLeft, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.timelineFirstColumnLeft),
			topologyWeightMin: finiteNumber(aiLayout.topologyWeightMin, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.topologyWeightMin),
			topologyEdgeCapRatio: finiteNumber(aiLayout.topologyEdgeCapRatio, DEFAULT_GRAPH_WORKSPACE_CONFIG.aiLayout.topologyEdgeCapRatio),
		},
	};
}

export async function loadGraphWorkspaceConfig(): Promise<GraphWorkspaceConfig> {
	try {
		const manager = TemplateManager.getInstance();
		if (!manager) return DEFAULT_GRAPH_WORKSPACE_CONFIG;
		return parseGraphWorkspaceConfig(
			await manager.loadJson<unknown>(ConfigTemplateId.GraphWorkspace),
		);
	} catch {
		return DEFAULT_GRAPH_WORKSPACE_CONFIG;
	}
}
