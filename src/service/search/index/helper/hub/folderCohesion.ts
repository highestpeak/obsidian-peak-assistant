/**
 * Folder cohesion (0..1): how tightly documents under a vault folder agree in tags/keywords/titles
 * and internal semantic_related density. Aligns with cluster {@link computeClusterCohesionFromMembers}
 * but uses the highest-semantic-PageRank document as a pseudo-seed (no separate cluster pipeline).
 */

import type { IndexedTagsBlob } from '@/core/document/helper/TagService';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import {
	buildClusterAnchorSetsFromBlob,
	computeClusterCohesionFromMembers,
	computeIntraClusterSemanticDensity,
	computeMemberAffinity,
	extractMeaningfulTitleTokens,
	mergeTitleTokensIntoAnchorKeywords,
	semanticSupportFromEdgeWeight,
} from './clusterHubSignals';

/** One document under a folder subtree (maintenance scan). */
export type FolderCohesionDocRef = {
	node_id: string;
	path: string;
	label: string | null;
	tags_json: string | null;
	semantic_pagerank: number | null;
};

/**
 * Computes folder cohesion from a capped list of documents under the same folder prefix.
 * Returns null when fewer than two documents (undefined pairwise semantics).
 */
export function computeFolderCohesionScore(
	docs: FolderCohesionDocRef[],
	intraEdges: Array<{ from_node_id: string; to_node_id: string; weight: number }>,
): number | null {
	if (docs.length < 2) return null;

	let seed = docs[0]!;
	for (const d of docs) {
		const spr =
			typeof d.semantic_pagerank === 'number' && Number.isFinite(d.semantic_pagerank)
				? d.semantic_pagerank
				: 0;
		const seedSpr =
			typeof seed.semantic_pagerank === 'number' && Number.isFinite(seed.semantic_pagerank)
				? seed.semantic_pagerank
				: 0;
		if (spr > seedSpr) seed = d;
		else if (spr === seedSpr && d.path < seed.path) seed = d;
	}

	const seedBlob = decodeIndexedTagsBlob(seed.tags_json ?? null);
	const anchor = buildClusterAnchorSetsFromBlob(seedBlob);
	const seedTitleTokens = extractMeaningfulTitleTokens(seed.path, seed.label ?? undefined);
	mergeTitleTokensIntoAnchorKeywords(anchor, seedTitleTokens);

	const seedId = seed.node_id;
	const supportByMember = new Map<string, number>();
	supportByMember.set(seedId, 1);
	for (const e of intraEdges) {
		const w = semanticSupportFromEdgeWeight(e.weight);
		if (e.from_node_id === seedId && e.to_node_id !== seedId) {
			const prev = supportByMember.get(e.to_node_id) ?? 0;
			if (w > prev) supportByMember.set(e.to_node_id, w);
		}
		if (e.to_node_id === seedId && e.from_node_id !== seedId) {
			const prev = supportByMember.get(e.from_node_id) ?? 0;
			if (w > prev) supportByMember.set(e.from_node_id, w);
		}
	}

	const members: Array<{ blob: IndexedTagsBlob; path: string; label?: string; affinity: number }> = [];
	for (const d of docs) {
		const blob = decodeIndexedTagsBlob(d.tags_json ?? null);
		const isSeed = d.node_id === seedId;
		const semanticSupport = isSeed ? 1 : supportByMember.get(d.node_id) ?? 0;
		const aff = computeMemberAffinity({
			anchor,
			seedPath: seed.path,
			seedTitleTokens,
			memberBlob: blob,
			memberPath: d.path,
			memberLabel: d.label ?? undefined,
			semanticSupport,
			isSeed,
		});
		members.push({ blob, path: d.path, label: d.label ?? undefined, affinity: aff.affinity });
	}

	const ids = docs.map((d) => d.node_id);
	const intraDensity = computeIntraClusterSemanticDensity(ids, intraEdges);

	const metrics = computeClusterCohesionFromMembers({
		anchor,
		seedTitleTokens,
		intraClusterSemanticDensity: intraDensity,
		members,
	});
	return metrics.cohesionScore;
}
