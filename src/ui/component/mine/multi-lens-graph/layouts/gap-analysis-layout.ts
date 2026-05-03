import type { LensNodeData, LensGraphData } from '../types';

export interface GapAnalysisLayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string; weight?: number }>;
	clusters?: LensGraphData['clusters'];
	structuralHoles?: LensGraphData['structuralHoles'];
	communityMetrics?: LensGraphData['communityMetrics'];
}

export interface GapAnalysisLayoutResult {
	[key: string]: unknown;
	positions: Map<string, { x: number; y: number }>;
	/** Dashed gap arcs between community centroids */
	gapEdges?: Array<{ source: string; target: string; kind: string; label?: string }>;
	/** Community hull backgrounds */
	swimlanes?: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>;
}

const COMMUNITY_RADIUS = 200;
const COMMUNITY_GAP = 150;
const NODE_SPACING = 80;

/**
 * Community-cluster layout for gap analysis.
 * Places communities in a circular arrangement, nodes within each community in a sub-circle.
 * Gap arcs connect community centroids where structural holes exist.
 */
export function computeGapAnalysisLayout(input: GapAnalysisLayoutInput): GapAnalysisLayoutResult {
	const { nodes, clusters, structuralHoles, communityMetrics } = input;
	const positions = new Map<string, { x: number; y: number }>();

	if (nodes.length === 0) return { positions };

	// Group nodes by cluster (community)
	const clusterMap = new Map<string, LensNodeData[]>();
	for (const n of nodes) {
		const cId = n.clusterId ?? 'unclustered';
		let group = clusterMap.get(cId);
		if (!group) { group = []; clusterMap.set(cId, group); }
		group.push(n);
	}

	const clusterIds = [...clusterMap.keys()];
	const numClusters = clusterIds.length;

	// Position community centroids in a circle
	const centerX = 0;
	const centerY = 0;
	const clusterRadius = numClusters <= 1
		? 0
		: (COMMUNITY_RADIUS + COMMUNITY_GAP) * numClusters / (2 * Math.PI);

	const clusterCentroids = new Map<string, { x: number; y: number }>();
	const swimlanes: GapAnalysisLayoutResult['swimlanes'] = [];

	clusterIds.forEach((cId, i) => {
		const angle = (2 * Math.PI * i) / Math.max(numClusters, 1);
		const cx = centerX + clusterRadius * Math.cos(angle);
		const cy = centerY + clusterRadius * Math.sin(angle);
		clusterCentroids.set(cId, { x: cx, y: cy });

		const members = clusterMap.get(cId)!;
		const memberCount = members.length;

		// Position nodes within each community in a sub-circle
		const subRadius = Math.max(50, memberCount * NODE_SPACING / (2 * Math.PI));
		members.forEach((n, j) => {
			const subAngle = (2 * Math.PI * j) / memberCount;
			positions.set(n.path, {
				x: cx + subRadius * Math.cos(subAngle),
				y: cy + subRadius * Math.sin(subAngle),
			});
		});

		// Swimlane hull for community
		const clusterInfo = clusters?.find(c => c.id === cId);
		const metricInfo = communityMetrics?.find(c => c.id === cId);
		const name = clusterInfo?.name ?? metricInfo?.name ?? `Community ${cId}`;
		const hullPad = 40;
		swimlanes.push({
			id: cId,
			name: `${name} (${memberCount})`,
			x: cx - subRadius - hullPad,
			y: cy - subRadius - hullPad,
			width: (subRadius + hullPad) * 2,
			height: (subRadius + hullPad) * 2,
		});
	});

	// Build gap edges between community centroids
	const gapEdges: GapAnalysisLayoutResult['gapEdges'] = [];
	if (structuralHoles) {
		for (const hole of structuralHoles) {
			const centA = clusterCentroids.get(hole.communityA);
			const centB = clusterCentroids.get(hole.communityB);
			if (centA && centB) {
				// Create virtual nodes at centroids for gap arc rendering
				const srcId = `gap-src-${hole.communityA}-${hole.communityB}`;
				const tgtId = `gap-tgt-${hole.communityA}-${hole.communityB}`;
				positions.set(srcId, centA);
				positions.set(tgtId, centB);
				gapEdges.push({
					source: srcId,
					target: tgtId,
					kind: 'cross-domain',
					label: `Gap: ${hole.gapScore.toFixed(2)}`,
				});
			}
		}
	}

	return { positions, gapEdges, swimlanes };
}
