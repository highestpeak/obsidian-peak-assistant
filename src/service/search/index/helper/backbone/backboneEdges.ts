/**
 * Aggregates cross-supernode edges from reference + semantic_related streams.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { BackboneEdge } from './types';
import type { SupernodeResolver } from './supernodeResolve';

type PairAgg = {
	from: string;
	to: string;
	referenceCount: number;
	semanticWeightSum: number;
	bridgePageRankMass: number;
};

function pairKey(from: string, to: string): string {
	return `${from}=>${to}`;
}

/**
 * Scans wiki reference + semantic edges; keeps directed cross-supernode pairs, then ranks by weight.
 */
export async function buildBackboneEdges(options: {
	validDocIdSet: Set<string>;
	nodeIdToPath: Map<string, string>;
	prMap: Map<string, { pr: number; spr: number }>;
	resolver: SupernodeResolver;
	topK: number;
}): Promise<{ edges: BackboneEdge[]; pairCount: number }> {
	const { validDocIdSet, nodeIdToPath, prMap, resolver, topK } = options;
	const aggs = new Map<string, PairAgg>();

	function bump(
		fromId: string,
		toId: string,
		kind: 'ref' | 'sem',
		semW: number,
	): void {
		if (!validDocIdSet.has(fromId) || !validDocIdSet.has(toId)) return;
		const pFrom = nodeIdToPath.get(fromId);
		const pTo = nodeIdToPath.get(toId);
		if (!pFrom || !pTo) return;
		const s1 = resolver.resolve(pFrom);
		const s2 = resolver.resolve(pTo);
		if (!s1 || !s2 || s1 === s2) return;

		const prF = prMap.get(fromId)?.pr ?? 0;
		const prT = prMap.get(toId)?.pr ?? 0;
		const bridge = 0.5 * (prF + prT);

		const key = pairKey(s1, s2);
		let a = aggs.get(key);
		if (!a) {
			a = { from: s1, to: s2, referenceCount: 0, semanticWeightSum: 0, bridgePageRankMass: 0 };
			aggs.set(key, a);
		}
		if (kind === 'ref') {
			a.referenceCount += 1;
			a.bridgePageRankMass += bridge;
		} else {
			const w = Number.isFinite(semW) && semW > 0 ? semW : 0;
			a.semanticWeightSum += w;
			a.bridgePageRankMass += bridge * Math.min(1, w);
		}
	}

	if (!sqliteStoreManager.isInitialized()) {
		return { edges: [], pairCount: 0 };
	}

	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

	for await (const batch of edgeRepo.iterateReferenceEdgeBatches(2000)) {
		for (const e of batch) {
			bump(e.from_node_id, e.to_node_id, 'ref', 0);
		}
	}

	for await (const batch of edgeRepo.iterateSemanticRelatedEdgeBatches(2000)) {
		for (const e of batch) {
			bump(e.from_node_id, e.to_node_id, 'sem', e.weight);
		}
	}

	const scored = [...aggs.values()].map((a) => {
		const weight =
			a.referenceCount + 0.35 * a.semanticWeightSum + 0.5 * Math.min(50, a.bridgePageRankMass);
		const label = shortEdgeLabel(a.referenceCount, a.semanticWeightSum);
		return { ...a, weight, label };
	});

	scored.sort((x, y) => y.weight - x.weight);
	const picked = scored.slice(0, Math.max(1, topK));

	const edges: BackboneEdge[] = picked.map((a, i) => ({
		id: `H-${String(i + 1).padStart(3, '0')}`,
		fromId: a.from,
		toId: a.to,
		fromLabel: resolver.label(a.from),
		toLabel: resolver.label(a.to),
		weight: a.weight,
		referenceCount: a.referenceCount,
		semanticWeightSum: a.semanticWeightSum,
		bridgePageRankMass: a.bridgePageRankMass,
		label: a.label,
	}));

	return { edges, pairCount: aggs.size };
}

function shortEdgeLabel(ref: number, sem: number): string {
	if (ref > 0 && sem > 0) return 'refs + semantic';
	if (ref > 0) return 'references';
	return 'semantic';
}
