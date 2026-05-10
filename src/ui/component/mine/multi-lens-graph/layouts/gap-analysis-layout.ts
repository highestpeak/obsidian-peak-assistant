/**
 * Gap analysis layout for MultiLensGraph.
 *
 * - Nodes sized proportionally to betweenness centrality
 * - Nodes colored by communityId
 * - Communities arranged on a circle with radius proportional to sqrt(memberCount)
 * - Member nodes positioned in sub-circles within each community group
 * - Structural hole arcs rendered as cross-domain edges with isGapArc marker
 */

import type { LensGraphData, LensNodeData, LensNode, LensEdge } from '../types';
import { COMMUNITY_NODE_SIZE_MIN, COMMUNITY_NODE_SIZE_MAX, COMMUNITY_COLORS_FALLBACK } from '@/core/constant';

function hashString(s: string): number {
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) | 0;
	}
	return Math.abs(hash);
}

function getCommunityColor(communityId: string, communityMetrics?: LensGraphData['communityMetrics']): string {
	if (communityMetrics) {
		const metric = communityMetrics.find(m => m.id === communityId);
		if (metric?.color) return metric.color;
	}
	return COMMUNITY_COLORS_FALLBACK[hashString(communityId) % COMMUNITY_COLORS_FALLBACK.length]!;
}

export function computeGapAnalysisLayout(
	data: LensGraphData,
): { nodes: LensNode[]; edges: LensEdge[] } {
	const { nodes: nodeData, communityMetrics, gaps, bridges } = data;

	// Group nodes by community
	const communityGroups = new Map<string, LensNodeData[]>();
	for (const node of nodeData) {
		const comId = node.communityId ?? 'ungrouped';
		if (!communityGroups.has(comId)) communityGroups.set(comId, []);
		communityGroups.get(comId)!.push(node);
	}

	// Bridge node paths for marking
	const bridgePaths = new Set(bridges?.map(b => b.node_path) ?? []);

	// Arrange communities on a circle
	const communityIds = Array.from(communityGroups.keys()).sort();
	const communityCount = communityIds.length;
	const baseRadius = 300 + communityCount * 50;

	const positions = new Map<string, { x: number; y: number }>();

	for (let ci = 0; ci < communityCount; ci++) {
		const comId = communityIds[ci]!;
		const members = communityGroups.get(comId)!;
		const angle = (2 * Math.PI * ci) / communityCount;

		// Community center
		const cx = baseRadius * Math.cos(angle);
		const cy = baseRadius * Math.sin(angle);

		// Sub-circle radius proportional to sqrt(memberCount)
		const subRadius = Math.max(80, Math.sqrt(members.length) * 40);

		// Position members in sub-circle
		for (let mi = 0; mi < members.length; mi++) {
			const memberAngle = (2 * Math.PI * mi) / members.length;
			const x = cx + subRadius * Math.cos(memberAngle);
			const y = cy + subRadius * Math.sin(memberAngle);
			positions.set(members[mi]!.path, { x, y });
		}
	}

	// Build LensNode array
	const lensNodes: LensNode[] = nodeData.map(n => {
		const bc = n.betweenness ?? 0;
		const isBridge = bridgePaths.has(n.path);

		return {
			id: n.path,
			type: 'lensNode' as const,
			position: positions.get(n.path) ?? { x: 0, y: 0 },
			data: {
				...n,
				role: isBridge ? 'bridge' : (bc > 0.5 ? 'hub' : 'leaf'),
			},
		};
	});

	// Build edges from data
	const lensEdges: LensEdge[] = data.edges.map((e, i) => ({
		id: `e-${i}-${e.source}-${e.target}`,
		source: e.source,
		target: e.target,
		type: 'lensEdge',
		data: {
			kind: e.kind,
			weight: e.weight,
		},
	}));

	// Add gap arc edges
	if (gaps) {
		for (const gap of gaps) {
			// Find representative nodes from each community
			const comANodes = communityGroups.get(gap.communityA);
			const comBNodes = communityGroups.get(gap.communityB);
			if (!comANodes?.length || !comBNodes?.length) continue;

			const sourceNode = comANodes[0]!;
			const targetNode = comBNodes[0]!;

			lensEdges.push({
				id: `gap-${gap.id}`,
				source: sourceNode.path,
				target: targetNode.path,
				type: 'lensEdge',
				data: {
					kind: 'cross-domain',
					edgeLabel: `Gap: ${gap.score.toFixed(2)}`,
					isGapArc: true,
				} as any,
			});
		}
	}

	return { nodes: lensNodes, edges: lensEdges };
}
