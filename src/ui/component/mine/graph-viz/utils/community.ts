/**
 * Label propagation for community detection. Returns node id -> community id (0-based).
 */
import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId } from './link-key';

/**
 * Simple label propagation: each node adopts the most frequent label among neighbors.
 * Undirected; runs for maxIterations or until stable.
 */
export function labelPropagation(
	nodes: GraphVizNode[],
	links: GraphVizLink[],
	maxIterations = 20
): Map<string, number> {
	const idToIdx = new Map<string, number>();
	nodes.forEach((n, i) => idToIdx.set(n.id, i));
	const idxToId = nodes.map((n) => n.id);

	const neighborIdx: number[][] = Array.from({ length: nodes.length }, () => []);
	for (const l of links) {
		const a = getLinkEndpointId(l.source);
		const b = getLinkEndpointId(l.target);
		const ai = idToIdx.get(a);
		const bi = idToIdx.get(b);
		if (ai !== undefined && bi !== undefined && ai !== bi) {
			if (!neighborIdx[ai].includes(bi)) neighborIdx[ai].push(bi);
			if (!neighborIdx[bi].includes(ai)) neighborIdx[bi].push(ai);
		}
	}

	let label = nodes.map((_, i) => i);
	for (let iter = 0; iter < maxIterations; iter++) {
		const next = [...label];
		let changed = false;
		for (let i = 0; i < nodes.length; i++) {
			const counts = new Map<number, number>();
			for (const j of neighborIdx[i]) {
				const l = label[j];
				counts.set(l, (counts.get(l) ?? 0) + 1);
			}
			if (counts.size === 0) continue;
			const maxCount = Math.max(...counts.values());
			const best = [...counts.entries()].filter(([, c]) => c === maxCount).sort((a, b) => a[0] - b[0])[0][0];
			if (best !== label[i]) {
				next[i] = best;
				changed = true;
			}
		}
		label = next;
		if (!changed) break;
	}

	const communityByNode = new Map<string, number>();
	label.forEach((c, i) => communityByNode.set(idxToId[i], c));
	return communityByNode;
}
