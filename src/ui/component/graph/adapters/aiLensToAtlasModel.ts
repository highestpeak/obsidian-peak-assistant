import type { LensGraphData, LensNodeData, LensType } from '@/core/types/lens-graph';
import { resolveGraphEdgeDirectionality } from '@/core/types/graph-edge';
import type { AtlasGraphEdge, AtlasGraphModel, AtlasGraphNode, AtlasGraphNodeRole } from '../AtlasGraphModel';
import {
	DEFAULT_GRAPH_WORKSPACE_CONFIG,
	type GraphWorkspaceConfig,
} from '@/ui/component/graph-workspace/graphWorkspaceDefaults';
import { computeBridgeAtlasLayout, computeTimelineAtlasLayout } from './aiLensLayouts';

type RawEdge = LensGraphData['edges'][number];
type Position = { x: number; y: number };

function stableNodes(nodes: readonly LensNodeData[]): LensNodeData[] {
	const seen = new Set<string>();
	return nodes.filter((node) => {
		if (!node.path || seen.has(node.path)) return false;
		seen.add(node.path);
		return true;
	});
}

function nodeRole(node: LensNodeData): AtlasGraphNodeRole {
	if (node.artifactKind === 'claim') return 'claim';
	if (node.role) return node.role;
	return 'document';
}

function selectEdges(
	data: LensGraphData,
	lens: LensType,
	nodeCount: number,
	config: GraphWorkspaceConfig['aiLayout'],
): RawEdge[] {
	if (lens === 'thinking-tree') {
		const treeEdges = data.edges.filter((edge) =>
			edge.relationFamily === 'taxonomic'
			|| edge.relationFamily === 'causal'
			|| edge.kind === 'derives'
			|| edge.kind === 'builds_on'
			|| edge.kind === 'applies');
		return treeEdges.length ? treeEdges : data.edges;
	}
	if (lens === 'bridge') {
		const bridgePaths = new Set(data.bridges?.map((bridge) => bridge.node_path) ?? []);
		const bridgeEdges = data.edges.filter((edge) =>
			edge.kind === 'cross-domain'
			|| bridgePaths.has(edge.source)
			|| bridgePaths.has(edge.target));
		return bridgeEdges.length ? bridgeEdges : data.edges;
	}
	if (lens === 'timeline') {
		const timelineEdges = data.edges.filter((edge) =>
			edge.relationFamily === 'temporal' || edge.kind === 'temporal');
		return timelineEdges.length ? timelineEdges : data.edges;
	}
	if (lens === 'gap-analysis') return data.edges;
	const sorted = [...data.edges].sort((a, b) => (b.weight ?? 0.5) - (a.weight ?? 0.5));
	const weighted = sorted.filter((edge) => (edge.weight ?? 0.5) >= config.topologyWeightMin);
	return weighted.slice(0, Math.ceil(nodeCount * config.topologyEdgeCapRatio));
}

function topologyPositions(nodes: readonly LensNodeData[], config: GraphWorkspaceConfig['aiLayout']): Record<string, Position> {
	const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
	return Object.fromEntries(nodes.map((node, index) => [node.path, {
		x: (index % columns) * config.columnGap,
		y: Math.floor(index / columns) * config.rowGap,
	}]));
}

function treePositions(nodes: readonly LensNodeData[], config: GraphWorkspaceConfig['aiLayout']): Record<string, Position> {
	const levelByPath = new Map(nodes.map((node) => [node.path, Math.max(0, node.level ?? 0)]));
	for (const node of nodes) {
		if (node.level !== undefined || !node.parentId) continue;
		levelByPath.set(node.path, (levelByPath.get(node.parentId) ?? 0) + 1);
	}
	const rowByLevel = new Map<number, number>();
	return Object.fromEntries(nodes.map((node) => {
		const level = levelByPath.get(node.path) ?? 0;
		const row = rowByLevel.get(level) ?? 0;
		rowByLevel.set(level, row + 1);
		return [node.path, { x: level * config.columnGap, y: row * config.rowGap }];
	}));
}

function gapPositions(nodes: readonly LensNodeData[], config: GraphWorkspaceConfig['aiLayout']): Record<string, Position> {
	const groups = new Map<string, LensNodeData[]>();
	for (const node of nodes) {
		const group = node.communityId ?? 'ungrouped';
		groups.set(group, [...(groups.get(group) ?? []), node]);
	}
	const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	const positions: Record<string, Position> = {};
	entries.forEach(([, members], groupIndex) => {
		const groupAngle = entries.length === 1 ? 0 : (Math.PI * 2 * groupIndex) / entries.length;
		const centerRadius = entries.length === 1 ? 0 : config.clusterGap;
		const center = { x: Math.cos(groupAngle) * centerRadius, y: Math.sin(groupAngle) * centerRadius };
		members.forEach((node, memberIndex) => {
			const angle = members.length === 1 ? 0 : (Math.PI * 2 * memberIndex) / members.length;
			positions[node.path] = {
				x: center.x + Math.cos(angle) * config.communityRadius,
				y: center.y + Math.sin(angle) * config.communityRadius,
			};
		});
	});
	return positions;
}

function positionsForLens(
	nodes: readonly LensNodeData[],
	lens: LensType,
	config: GraphWorkspaceConfig,
	data: LensGraphData,
): Record<string, Position> {
	if (lens === 'thinking-tree') return treePositions(nodes, config.aiLayout);
	if (lens === 'bridge') return Object.fromEntries(computeBridgeAtlasLayout(data, config).positions);
	if (lens === 'timeline') return Object.fromEntries(computeTimelineAtlasLayout(data, config).positions);
	if (lens === 'gap-analysis') return gapPositions(nodes, config.aiLayout);
	return topologyPositions(nodes, config.aiLayout);
}

function atlasEdge(edge: RawEdge, index: number): AtlasGraphEdge {
	return {
		id: edge.canonicalRelationId ?? `${edge.kind}:${edge.source}:${edge.target}:${index}`,
		source: edge.source,
		target: edge.target,
		role: edge.kind,
		directionality: resolveGraphEdgeDirectionality(edge.kind, edge.directionality),
		weight: edge.weight,
		label: edge.label,
		relationId: edge.canonicalRelationId ?? null,
		accessibleLabel: edge.accessibleLabel ?? null,
		metadata: {
			reviewStatus: edge.reviewStatus,
			confidence: edge.confidence,
			evidenceCount: edge.evidenceCount,
			predicate: edge.predicate,
			relationFamily: edge.relationFamily,
			qualifiers: edge.qualifiers,
			evidenceQuotes: edge.evidenceQuotes,
		},
	};
}

export function aiLensToAtlasModel(
	data: LensGraphData,
	lens: LensType,
	config: GraphWorkspaceConfig = DEFAULT_GRAPH_WORKSPACE_CONFIG,
): AtlasGraphModel {
	const sourceNodes = stableNodes(data.nodes);
	const nodeIds = new Set(sourceNodes.map((node) => node.path));
	const selectedEdges = selectEdges(data, lens, sourceNodes.length, config.aiLayout)
		.filter((edge) => edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target));
	const nodes: AtlasGraphNode[] = sourceNodes.map((node) => ({
		id: node.path,
		label: node.label,
		path: node.path,
		role: nodeRole(node),
		score: node.score ?? node.importance ?? 1,
		communityId: node.communityId ?? node.clusterId ?? null,
		preview: node.summary,
		metadata: node,
	}));
	const edges = selectedEdges.map(atlasEdge);
	if (lens === 'bridge') {
		const known = new Set(edges.map((edge) => `${edge.source}|${edge.target}|${edge.role}`));
		for (const [index, edge] of computeBridgeAtlasLayout(data, config).bridgeEdges.entries()) {
			const key = `${edge.source}|${edge.target}|${edge.kind}`;
			if (known.has(key)) continue;
			edges.push(atlasEdge({ ...edge, directionality: 'undirected' }, selectedEdges.length + index));
		}
	}
	if (lens === 'timeline') {
		const known = new Set(edges.map((edge) => `${edge.source}|${edge.target}|${edge.role}`));
		for (const [index, edge] of computeTimelineAtlasLayout(data, config).chainEdges.entries()) {
			const key = `${edge.source}|${edge.target}|${edge.kind}`;
			if (known.has(key)) continue;
			edges.push(atlasEdge({ ...edge, directionality: 'directed' }, selectedEdges.length + index));
		}
	}
	if (lens === 'gap-analysis') {
		for (const gap of data.gaps ?? []) {
			const source = sourceNodes.find((node) => node.communityId === gap.communityA);
			const target = sourceNodes.find((node) => node.communityId === gap.communityB);
			if (!source || !target) continue;
			edges.push({
				id: `gap:${gap.id}`,
				source: source.path,
				target: target.path,
				role: 'gap',
				directionality: 'undirected',
				weight: gap.score,
				label: `Gap ${gap.score.toFixed(2)}`,
				relationId: null,
				accessibleLabel: `${gap.communityA} knowledge gap ${gap.communityB}`,
				metadata: gap,
			});
		}
	}
	const degree = new Map<string, number>();
	for (const edge of edges) {
		degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
		degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
	}
	return {
		id: `ai-graph:${lens}`,
		nodes,
		edges,
		positions: positionsForLens(sourceNodes, lens, config, data),
		isolationIds: nodes.filter((node) => !degree.has(node.id)).map((node) => node.id),
		overflowCount: 0,
		layerRole: 'evidence',
	};
}
