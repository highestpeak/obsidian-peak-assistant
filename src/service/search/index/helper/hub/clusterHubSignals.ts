/**
 * Deterministic multi-signal scoring for semantic cluster hub discovery (Cluster V1.1).
 * Pure helpers: title tokens, tag alignment vs seed anchor, cohesion metrics.
 */

import type { IndexedTagsBlob } from '@/core/document/helper/TagService';
import { graphKeywordTagsForMobius } from '@/core/document/helper/TagService';
import {
	HUB_CLUSTER_V11_MEMBER_WEIGHTS,
	HUB_CLUSTER_V11_SEMANTIC_WEIGHT_CAP,
} from '@/core/constant';
import { getClusterHubWeakTitleTokens } from '@/core/utils/markdown-utils';

/** Topic / functional / keyword sets derived from the seed document (cluster anchor). */
export type ClusterAnchorSets = {
	topics: Set<string>;
	functionals: Set<string>;
	keywords: Set<string>;
};

/**
 * Jaccard similarity for two string sets (0..1).
 * Empty vs empty is 0: no evidence of overlap (cluster scoring must not treat missing tags as a perfect match).
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) {
		if (b.has(x)) inter++;
	}
	const union = a.size + b.size - inter;
	return union > 0 ? inter / union : 0;
}

/**
 * Basename and optional label → lowercase tokens (ASCII-focused; drops very short / noisy tokens).
 */
export function extractMeaningfulTitleTokens(path: string, label?: string): string[] {
	const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	const stripExt = base.replace(/\.(md|markdown|txt)$/i, '');
	const parts = `${stripExt} ${label ?? ''}`
		.toLowerCase()
		.split(/[^a-z0-9\u4e00-\u9fff]+/g)
		.map((s) => s.trim())
		.filter(Boolean);

	const out: string[] = [];
	const seen = new Set<string>();
	for (const p of parts) {
		if (p.length < 2) continue;
		if (/^\d+$/.test(p)) continue;
		if (getClusterHubWeakTitleTokens().has(p)) continue;
		if (seen.has(p)) continue;
		seen.add(p);
		out.push(p);
		if (out.length >= 24) break;
	}
	return out;
}

/**
 * Builds anchor keyword/topic sets from the seed blob (same idea as hub-local `anchorSetsFromBlob`).
 */
export function buildClusterAnchorSetsFromBlob(blob: IndexedTagsBlob): ClusterAnchorSets {
	const topics = new Set<string>(blob.topicTags ?? []);
	for (const e of blob.topicTagEntries ?? []) topics.add(e.id);
	const functionals = new Set(blob.functionalTagEntries.map((e) => e.id));
	const kwUser = graphKeywordTagsForMobius(blob);
	const kwTr = blob.textrankKeywordTerms ?? [];
	const keywords = new Set<string>([...kwUser, ...kwTr]);
	return { topics, functionals, keywords };
}

/**
 * Topic / functional Jaccard vs anchor.
 */
export function computeTopicOverlap(anchor: ClusterAnchorSets, blob: IndexedTagsBlob): number {
	const nodeTopics = new Set<string>(blob.topicTags ?? []);
	for (const e of blob.topicTagEntries ?? []) nodeTopics.add(e.id);
	return jaccardSimilarity(anchor.topics, nodeTopics);
}

export function computeFunctionalOverlap(anchor: ClusterAnchorSets, blob: IndexedTagsBlob): number {
	const nodeF = new Set(blob.functionalTagEntries.map((e) => e.id));
	return jaccardSimilarity(anchor.functionals, nodeF);
}

/**
 * Keyword overlap: union of user + textrank on the member vs anchor keyword set.
 */
export function computeKeywordOverlap(anchor: ClusterAnchorSets, blob: IndexedTagsBlob): number {
	const memberKw = new Set<string>([
		...graphKeywordTagsForMobius(blob),
		...(blob.textrankKeywordTerms ?? []),
	]);
	return jaccardSimilarity(anchor.keywords, memberKw);
}

/**
 * Title token overlap between seed and member (Jaccard on token sets).
 */
export function computeTitleLexicalAffinity(seedTokens: string[], memberTokens: string[]): number {
	return jaccardSimilarity(new Set(seedTokens), new Set(memberTokens));
}

/**
 * Shared path prefix depth ratio (0..1) for light structural agreement.
 */
export function computeStructuralSupport(seedPath: string, memberPath: string): number {
	const a = seedPath.split('/').filter(Boolean);
	const b = memberPath.split('/').filter(Boolean);
	if (a.length === 0 || b.length === 0) return 0;
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const maxLen = Math.max(a.length, b.length);
	return maxLen > 0 ? i / maxLen : 0;
}

/**
 * Maps semantic edge weight to 0..1 support for the neighbor.
 */
export function semanticSupportFromEdgeWeight(weight: number): number {
	const w = typeof weight === 'number' && Number.isFinite(weight) ? weight : 1;
	const c = HUB_CLUSTER_V11_SEMANTIC_WEIGHT_CAP;
	return Math.min(1, Math.max(0, w / c));
}

export type MemberAffinityBreakdown = {
	semanticSupport: number;
	topicOverlap: number;
	functionalOverlap: number;
	keywordOverlap: number;
	titleLexical: number;
	structural: number;
	affinity: number;
};

const W = HUB_CLUSTER_V11_MEMBER_WEIGHTS;

/**
 * Combined member affinity vs seed anchor (0..1). For the seed node, pass `isSeed: true` and semanticSupport 1.
 */
export function computeMemberAffinity(input: {
	anchor: ClusterAnchorSets;
	seedPath: string;
	seedTitleTokens: string[];
	memberBlob: IndexedTagsBlob;
	memberPath: string;
	memberLabel?: string;
	semanticSupport: number;
	isSeed: boolean;
}): MemberAffinityBreakdown {
	const { anchor, seedTitleTokens, memberBlob, memberPath, memberLabel, semanticSupport, isSeed } = input;
	const memberTokens = extractMeaningfulTitleTokens(memberPath, memberLabel);

	const topicOverlap = isSeed ? 1 : computeTopicOverlap(anchor, memberBlob);
	const functionalOverlap = isSeed ? 1 : computeFunctionalOverlap(anchor, memberBlob);
	const keywordOverlap = isSeed ? 1 : computeKeywordOverlap(anchor, memberBlob);
	const titleLexical = isSeed ? 1 : computeTitleLexicalAffinity(seedTitleTokens, memberTokens);
	const structural = isSeed ? 1 : computeStructuralSupport(input.seedPath, memberPath);

	const affinity =
		W.semantic * semanticSupport +
		W.topic * topicOverlap +
		W.functional * functionalOverlap +
		W.keyword * keywordOverlap +
		W.titleLexical * titleLexical +
		W.structural * structural;

	return {
		semanticSupport,
		topicOverlap,
		functionalOverlap,
		keywordOverlap,
		titleLexical,
		structural,
		affinity: Math.min(1, Math.max(0, affinity)),
	};
}

export type ClusterCohesionMetrics = {
	avgAffinity: number;
	topicConsistency: number;
	keywordConsistency: number;
	titleConsensus: number;
	cohesionScore: number;
};

/**
 * Cohesion using full member paths/labels (preferred).
 */
export function computeClusterCohesionFromMembers(input: {
	anchor: ClusterAnchorSets;
	seedTitleTokens: string[];
	members: Array<{ blob: IndexedTagsBlob; path: string; label?: string; affinity: number }>;
}): ClusterCohesionMetrics {
	const { anchor, seedTitleTokens, members } = input;
	const affinities = members.map((m) => m.affinity);
	const n = affinities.length;
	const avgAffinity = n > 0 ? affinities.reduce((a, b) => a + b, 0) / n : 0;

	let topicSum = 0;
	let kwSum = 0;
	const seedSet = new Set(seedTitleTokens);
	let titleShare = 0;

	for (const m of members) {
		topicSum += computeTopicOverlap(anchor, m.blob);
		kwSum += computeKeywordOverlap(anchor, m.blob);
		const mt = extractMeaningfulTitleTokens(m.path, m.label);
		if (mt.some((t) => seedSet.has(t))) titleShare++;
	}

	const mlen = members.length || 1;
	const topicConsistency = topicSum / mlen;
	const keywordConsistency = kwSum / mlen;
	const titleConsensus = members.length > 0 ? titleShare / members.length : 0;

	const cohesionScore =
		0.38 * avgAffinity + 0.28 * topicConsistency + 0.22 * keywordConsistency + 0.12 * titleConsensus;

	return {
		avgAffinity,
		topicConsistency,
		keywordConsistency,
		titleConsensus,
		cohesionScore: Math.min(1, Math.max(0, cohesionScore)),
	};
}

/**
 * Pick a short human label: shared topic id, else top shared keyword, else seed label snippet.
 */
export function pickClusterHubLabel(input: {
	anchor: ClusterAnchorSets;
	seedLabel: string;
	memberBlobs: IndexedTagsBlob[];
}): string {
	const { anchor, seedLabel, memberBlobs } = input;
	const topicCounts = new Map<string, number>();
	for (const blob of memberBlobs) {
		for (const t of blob.topicTags ?? []) {
			topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
		}
		for (const e of blob.topicTagEntries ?? []) {
			topicCounts.set(e.id, (topicCounts.get(e.id) ?? 0) + 1);
		}
	}
	const thresh = Math.max(2, Math.floor(memberBlobs.length * 0.45));
	let bestTopic = '';
	let bestTc = 0;
	for (const [id, c] of topicCounts) {
		if (c >= thresh && c > bestTc && anchor.topics.has(id)) {
			bestTc = c;
			bestTopic = id;
		}
	}
	if (bestTopic) {
		const short = bestTopic.length > 48 ? `${bestTopic.slice(0, 45)}...` : bestTopic;
		return `Cluster: ${short}`;
	}

	const anchorKwLower = new Set([...anchor.keywords].map((k) => k.toLowerCase()));
	const kwCounts = new Map<string, number>();
	for (const blob of memberBlobs) {
		for (const k of [...graphKeywordTagsForMobius(blob), ...(blob.textrankKeywordTerms ?? [])]) {
			const kk = k.toLowerCase();
			if (anchorKwLower.has(kk)) {
				kwCounts.set(kk, (kwCounts.get(kk) ?? 0) + 1);
			}
		}
	}
	let bestKw = '';
	let bestK = 0;
	for (const [k, c] of kwCounts) {
		if (c >= thresh && c > bestK) {
			bestK = c;
			bestKw = k;
		}
	}
	if (bestKw) return `Cluster: ${bestKw}`;

	const fallback = seedLabel.trim() || 'Cluster';
	const fs = fallback.length > 56 ? `${fallback.slice(0, 53)}...` : fallback;
	return `Cluster (${memberBlobs.length}) ${fs}`;
}
