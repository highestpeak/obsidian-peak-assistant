/**
 * Pure degree-based node radius and hub detection. No D3, no DOM.
 */

import type { GraphVizNode, GraphVizLink } from '../types';

/**
 * Count degree per node from links (using resolved source/target ids).
 */
export function computeDegreeMap(
	nodes: GraphVizNode[],
	links: GraphVizLink[]
): Map<string, number> {
	const degree = new Map<string, number>();
	for (const n of nodes) degree.set(n.id, 0);
	for (const link of links) {
		const a = (link.source as GraphVizNode).id;
		const b = (link.target as GraphVizNode).id;
		degree.set(a, (degree.get(a) ?? 0) + 1);
		degree.set(b, (degree.get(b) ?? 0) + 1);
	}
	return degree;
}

/**
 * Assign node.r by linear interpolation of degree in [minR, maxR].
 */
export function assignRadiusByDegree(
	nodes: GraphVizNode[],
	degreeMap: Map<string, number>,
	options: { minR?: number; maxR?: number } = {}
): void {
	const { minR = 6, maxR = 22 } = options;
	const degrees = Array.from(degreeMap.values());
	const minD = Math.min(...degrees, 0);
	const maxD = Math.max(...degrees, 1);
	for (const node of nodes) {
		const d = degreeMap.get(node.id) ?? 0;
		const t = maxD > minD ? (d - minD) / (maxD - minD) : 0;
		node.r = minR + t * (maxR - minR);
	}
}

/** Options for base + degreeBoost radius assignment. */
export interface AssignRadiusByConfigOptions {
	nodeBaseRadiusPhysical: number;
	nodeBaseRadiusSemantic: number;
	nodeDegreeBoost: number;
}

/**
 * Assign node.r = base + t * degreeBoost. Base is semantic or physical per incident edge kind.
 * Tag/Concept nodes use physical base.
 */
export function assignRadiusByConfig(
	nodes: GraphVizNode[],
	degreeMap: Map<string, number>,
	nodeIdsWithSemanticLink: Set<string>,
	options: AssignRadiusByConfigOptions
): void {
	const { nodeBaseRadiusPhysical, nodeBaseRadiusSemantic, nodeDegreeBoost } = options;
	const degrees = Array.from(degreeMap.values());
	const minD = Math.min(...degrees, 0);
	const maxD = Math.max(...degrees, 1);
	for (const node of nodes) {
		const d = degreeMap.get(node.id) ?? 0;
		const t = maxD > minD ? (d - minD) / (maxD - minD) : 0;
		const base = nodeIdsWithSemanticLink.has(node.id) ? nodeBaseRadiusSemantic : nodeBaseRadiusPhysical;
		node.r = base + t * nodeDegreeBoost;
	}
}

/**
 * Return top N node ids by degree (descending).
 * Excludes leaf/edge nodes (degree <= 1) since they are not structural hubs.
 */
export function computeHubNodeIds(
	nodes: GraphVizNode[],
	degreeMap: Map<string, number>,
	topN: number
): string[] {
	return [...nodes]
		.filter((n) => (degreeMap.get(n.id) ?? 0) > 1)
		.sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
		.slice(0, Math.max(1, Math.min(topN, nodes.length)))
		.map((n) => n.id);
}
