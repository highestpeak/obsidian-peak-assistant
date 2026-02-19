/**
 * Topology-first layout: compute community, hubs, MST from graph structure (no coordinates),
 * then assign initial positions by group so force simulation starts with clusters spread.
 */

import type { GraphVizNode, GraphVizLink } from '../types';
import { labelPropagation } from './community';
import { computeMstEdgeKeys, normalizeEdgeWeight } from './mst';
import { linkKey } from './link-key';
import { computeDegreeMap, computeHubNodeIds } from '../core/degreeRadius';

export type TopologyResult = {
	communityMap: Map<string, number>;
	degreeMap: Map<string, number>;
	hubNodeIds: string[];
	mstEdgeKeys: Set<string>;
};

/**
 * Compute community (LPA), degree, hubs, and MST edge set from nodes and links only.
 * No node coordinates required; used before any layout.
 */
export function computeTopology(
	nodes: GraphVizNode[],
	links: GraphVizLink[],
	normalizeNodeId: (id: string) => string,
	options: { hubTopN?: number } = {}
): TopologyResult {
	const hubTopN = Math.max(1, options.hubTopN ?? 5);

	const degreeMap = computeDegreeMap(nodes, links);
	const hubNodeIds = computeHubNodeIds(nodes, degreeMap, hubTopN);

	const communityMap =
		nodes.length > 0 && links.length > 0
			? labelPropagation(nodes, links)
			: new Map<string, number>();

	const getWeight = (l: GraphVizLink) =>
		normalizeEdgeWeight(l.kind ?? 'physical', typeof l.weight === 'number' ? l.weight : 1);
	const mstEdgeKeys = computeMstEdgeKeys(links, (l) => linkKey(l, normalizeNodeId), getWeight);

	return { communityMap, degreeMap, hubNodeIds, mstEdgeKeys };
}

/**
 * Assign x,y to nodes that don't have positions, spreading groups across the canvas.
 * When branchRootMap is provided (skeleton mode), group by branch so main branches sit in separate sectors.
 */
export function assignInitialPositionsByGroup(
	nodes: GraphVizNode[],
	communityMap: Map<string, number>,
	width: number,
	height: number,
	padding: number = 80,
	branchRootMap?: Map<string, string>
): void {
	const spanX = Math.max(100, width - padding * 2);
	const spanY = Math.max(100, height - padding * 2);
	const cx = width / 2;
	const cy = height / 2;

	// Use branch root for grouping in skeleton mode so branches don't overlap; else community
	const byGroup = new Map<string, GraphVizNode[]>();
	for (const n of nodes) {
		const g = branchRootMap != null
			? (branchRootMap.get(n.id) ?? n.id)
			: String(communityMap.get(n.id) ?? 0);
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g)!.push(n);
	}

	const groups = Array.from(byGroup.entries());
	const numGroups = Math.max(1, groups.length);
	// Elliptical ring: wide horizontal, flat vertical (monitor-like, use lateral space)
	const radiusX = spanX * 0.52;
	const radiusY = spanY * 0.22;
	const angleStep = (2 * Math.PI) / numGroups;

	for (let i = 0; i < groups.length; i++) {
		const [_gid, groupNodes] = groups[i];
		const angle = i * angleStep - Math.PI / 2;
		const gx = cx + radiusX * Math.cos(angle);
		const gy = cy + radiusY * Math.sin(angle);
		const jitterX = Math.min(60, radiusX * 0.28);
		const jitterY = Math.min(24, radiusY * 0.22);
		for (const n of groupNodes) {
			// Treat (0,0) or near-origin as unset so we don't keep a cluster at top-left
			if (n.x != null && n.y != null && (Math.abs(n.x) > 20 || Math.abs(n.y) > 20)) continue;
			n.x = gx + (Math.random() - 0.5) * 2 * jitterX;
			n.y = gy + (Math.random() - 0.5) * 2 * jitterY;
		}
	}

	for (const n of nodes) {
		if (n.x != null && n.y != null && (Math.abs(n.x) > 20 || Math.abs(n.y) > 20)) continue;
		n.x = padding + Math.random() * spanX;
		n.y = padding + Math.random() * spanY;
	}
}
