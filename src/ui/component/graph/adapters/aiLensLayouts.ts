import type { LensGraphData, LensNodeData } from '@/core/types/lens-graph';
import {
	DEFAULT_GRAPH_WORKSPACE_CONFIG,
	type GraphWorkspaceConfig,
} from '@/ui/component/graph-workspace/graphWorkspaceDefaults';

export type AtlasPosition = { x: number; y: number };

export interface TimelineAtlasLayout {
	positions: Map<string, AtlasPosition>;
	chainEdges: Array<{ source: string; target: string; kind: 'temporal'; chainIndex: number }>;
	timeTicks: Array<{ y: number; label: string; timestamp: number }>;
	unassignedGroup?: { count: number; label: string };
}

export function computeTimelineAtlasLayout(
	input: Pick<LensGraphData, 'nodes' | 'evolutionChains'>,
	config: GraphWorkspaceConfig = DEFAULT_GRAPH_WORKSPACE_CONFIG,
): TimelineAtlasLayout {
	const positions = new Map<string, AtlasPosition>();
	const chainEdges: TimelineAtlasLayout['chainEdges'] = [];
	const timedNodes = input.nodes.filter((node) => node.createdAt != null);
	const unassignedNodes = input.nodes.filter((node) => node.createdAt == null);
	const nodeByPath = new Map(input.nodes.map((node) => [node.path, node]));
	const chains = input.evolutionChains ?? [];
	const chainColumns: LensNodeData[][] = [];
	const activeChainIndexes: number[] = [];
	for (let index = 0; index < chains.length; index += 1) {
		const members = chains[index].chain
			.map((path) => nodeByPath.get(path))
			.filter((node): node is LensNodeData => node?.createdAt != null);
		if (!members.length) continue;
		chainColumns.push(members);
		activeChainIndexes.push(index);
	}
	const placed = new Set(chainColumns.flatMap((column) => column.map((node) => node.path)));
	const soloNodes = timedNodes.filter((node) => !placed.has(node.path));
	const entries: Array<{ node: LensNodeData; column: number }> = [];
	chainColumns.forEach((column, index) => column.forEach((node) => entries.push({ node, column: index })));
	soloNodes.forEach((node) => entries.push({ node, column: chainColumns.length }));
	entries.sort((a, b) => a.node.createdAt! - b.node.createdAt! || a.node.path.localeCompare(b.node.path));
	const nextRow = new Map<number, number>();
	let globalRow = 0;
	for (const entry of entries) {
		const row = Math.max(globalRow, nextRow.get(entry.column) ?? 0);
		positions.set(entry.node.path, {
			x: config.aiLayout.timelineFirstColumnLeft + entry.column * config.aiLayout.bridgeColumnGap,
			y: config.aiLayout.canvasPadding + row * config.aiLayout.rowGap,
		});
		nextRow.set(entry.column, row + 1);
		globalRow = row + 1;
	}
	const unassignedColumn = chainColumns.length + (soloNodes.length ? 1 : 0);
	unassignedNodes.forEach((node, index) => positions.set(node.path, {
		x: config.aiLayout.timelineFirstColumnLeft + unassignedColumn * config.aiLayout.bridgeColumnGap,
		y: config.aiLayout.canvasPadding + index * config.aiLayout.rowGap,
	}));
	chainColumns.forEach((_, column) => {
		const chainIndex = activeChainIndexes[column];
		const visible = chains[chainIndex].chain.filter((path) => positions.has(path));
		for (let index = 0; index < visible.length - 1; index += 1) {
			chainEdges.push({ source: visible[index], target: visible[index + 1], kind: 'temporal', chainIndex });
		}
	});
	const timeTicks = timelineTicks(timedNodes, positions);
	return {
		positions,
		chainEdges,
		timeTicks,
		...(unassignedNodes.length ? {
			unassignedGroup: {
				count: unassignedNodes.length,
				label: `${config.labels.timelineUnassigned} · ${unassignedNodes.length}`,
			},
		} : {}),
	};
}

function timelineTicks(
	nodes: readonly LensNodeData[],
	positions: ReadonlyMap<string, AtlasPosition>,
): TimelineAtlasLayout['timeTicks'] {
	const dated = nodes
		.filter((node): node is LensNodeData & { createdAt: number } => node.createdAt != null)
		.sort((a, b) => a.createdAt - b.createdAt);
	if (!dated.length) return [];
	const dayMs = 86_400_000;
	const range = dated[dated.length - 1].createdAt - dated[0].createdAt;
	const interval = range < 14 * dayMs ? dayMs : range < 90 * dayMs ? 7 * dayMs : 30 * dayMs;
	const format = (timestamp: number) => {
		const date = new Date(timestamp);
		return range < 90 * dayMs
			? `${date.getMonth() + 1}/${date.getDate()}`
			: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	};
	const result: TimelineAtlasLayout['timeTicks'] = [];
	for (let timestamp = Math.ceil(dated[0].createdAt / interval) * interval;
		timestamp <= dated[dated.length - 1].createdAt + interval;
		timestamp += interval) {
		const closest = dated.reduce((best, node) =>
			Math.abs(node.createdAt - timestamp) < Math.abs(best.createdAt - timestamp) ? node : best);
		const y = positions.get(closest.path)?.y ?? 0;
		if (result.length && Math.abs(result[result.length - 1].y - y) <= 20) continue;
		result.push({ y, label: format(timestamp), timestamp });
	}
	return result;
}

export interface BridgeAtlasLayout {
	positions: Map<string, AtlasPosition>;
	bridgeEdges: Array<{ source: string; target: string; kind: 'cross-domain'; label?: string }>;
}

export function computeBridgeAtlasLayout(
	input: Pick<LensGraphData, 'nodes' | 'clusters' | 'bridges'>,
	config: GraphWorkspaceConfig = DEFAULT_GRAPH_WORKSPACE_CONFIG,
): BridgeAtlasLayout {
	const positions = new Map<string, AtlasPosition>();
	const bridgeEdges: BridgeAtlasLayout['bridgeEdges'] = [];
	const bridgePaths = new Set(input.bridges?.map((bridge) => bridge.node_path) ?? []);
	const bridgeNodes = input.nodes.filter((node) => bridgePaths.has(node.path));
	const groups = new Map<string, LensNodeData[]>();
	for (const node of input.nodes) {
		if (bridgePaths.has(node.path)) continue;
		const group = node.clusterId ?? node.group ?? node.communityId ?? 'unknown';
		groups.set(group, [...(groups.get(group) ?? []), node]);
	}
	const preferredOrder = input.clusters?.map((cluster) => cluster.id).filter((id) => groups.has(id)) ?? [];
	const groupIds = preferredOrder.length ? preferredOrder : [...groups.keys()].sort();
	const middle = Math.ceil(groupIds.length / 2);
	const orderedColumns = [...groupIds.slice(0, middle), '__bridges__', ...groupIds.slice(middle)];
	orderedColumns.forEach((group, column) => {
		const members = group === '__bridges__' ? bridgeNodes : groups.get(group) ?? [];
		members.forEach((node, row) => positions.set(node.path, {
			x: config.aiLayout.canvasPadding + column * config.aiLayout.bridgeColumnGap,
			y: config.aiLayout.canvasPadding + config.aiLayout.rowGap + row * config.aiLayout.rowGap,
		}));
	});
	for (const bridge of input.bridges ?? []) {
		for (const group of bridge.connects) {
			const target = groups.get(group)?.[0];
			if (!target) continue;
			bridgeEdges.push({
				source: bridge.node_path,
				target: target.path,
				kind: 'cross-domain',
				label: bridge.explanation,
			});
		}
	}
	return { positions, bridgeEdges };
}
