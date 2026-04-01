/**
 * Builds topic-level {@link NavigationHubGroup}s from hub candidates (path/tags/keywords/coverage),
 * then selects navigation groups vs long-tail candidates.
 *
 * Grouping uses **seed expansion** (ordered by quality), not DSU connected components, so weak
 * transitive bridges (e.g. same-root path proximity) cannot collapse the whole vault into one group.
 */

import {
	HUB_NAV_GROUP_SEED_ABSORB_COMBINED_MIN,
	HUB_NAV_GROUP_SEED_SEMANTIC_STRONG,
	HUB_NAV_GROUP_TOP_LEVEL_DEEP_STRUCT,
	HUB_NAVIGATION_LOW_COHESION_FOLDER_PENALTY,
	HUB_NAVIGATION_MANUAL_BONUS,
	HUB_NAVIGATION_PARTITION_MAX,
	HUB_NAVIGATION_PARTITION_MIN,
	HUB_NAVIGATION_SCORE_WEIGHTS,
	HUB_NAVIGATION_TOP_LEVEL_FOLDER_PENALTY,
} from '@/core/constant';
import {
	countBitsNewSince,
	countBitsUint32,
	createUint32Bitset,
	fractionOfBitsNewSince,
	overlapRatioMinUint32,
} from '@/core/utils/bit-util';
import { hashSHA256 } from '@/core/utils/hash-utils';
import { isVaultPathUnderPrefix, vaultFolderPathsNest } from '@/core/utils/hub-path-utils';
import { normalizeVaultPath, parentDirPath, pathSegments } from '@/core/utils/vault-path-utils';
import type {
	HubCandidate,
	HubPartitionMetrics,
	NavigationHubGroup,
} from './types';
import { SOURCE_PRIORITY } from './types';

function tokenizeLabel(s: string): Set<string> {
	const t = s
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
	const out = new Set<string>();
	for (const m of t.matchAll(/[\p{L}\p{N}]+/gu)) {
		const w = m[0];
		if (w.length >= 2) out.add(w);
	}
	return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let inter = 0;
	for (const x of a) {
		if (b.has(x)) inter++;
	}
	const u = a.size + b.size - inter;
	return u > 0 ? inter / u : 0;
}

function anchorKeywords(c: HubCandidate): Set<string> {
	const k = c.assemblyHints?.anchorKeywords ?? [];
	return new Set(k.map((x) => x.toLowerCase().trim()).filter(Boolean));
}

function anchorTopicTags(c: HubCandidate): Set<string> {
	const t = c.assemblyHints?.anchorTopicTags ?? [];
	return new Set(t.map((x) => String(x).trim()).filter(Boolean));
}

/** Vault path depth (segments); empty path => 0. */
function vaultPathDepth(p: string): number {
	return pathSegments(normalizeVaultPath(p)).length;
}

/**
 * True when `child` is exactly one segment under `parent` (folder or file under that folder).
 */
function isDirectChildPath(parent: string, child: string): boolean {
	const pa = normalizeVaultPath(parent);
	const pb = normalizeVaultPath(child);
	if (!pa || !pb) return false;
	if (pb === pa) return true;
	if (!pb.startsWith(`${pa}/`)) return false;
	const rest = pb.slice(pa.length + 1);
	return !rest.includes('/');
}

/**
 * Semantic similarity from labels, anchor keywords, and topic tags only (no path, no coverage).
 */
function semanticAffinity(a: HubCandidate, b: HubCandidate): number {
	const kw = jaccard(anchorKeywords(a), anchorKeywords(b));
	const tag = jaccard(anchorTopicTags(a), anchorTopicTags(b));
	const lab = jaccard(tokenizeLabel(a.label), tokenizeLabel(b.label));
	return 0.4 * kw + 0.35 * tag + 0.25 * lab;
}

/**
 * Path / topology structural score for "seed absorbs member" (0..1). Top-level folder seeds do not
 * get a high score for the entire subtree—only direct children (or strong cluster linkage).
 */
function pathStructuralAbsorbScore(seed: HubCandidate, c: HubCandidate): number {
	const pa = normalizeVaultPath(seed.path ?? '');
	const pb = normalizeVaultPath(c.path ?? '');
	if (!pa || !pb) return 0;
	if (pa === pb) return 1;

	const seedFolderTop = seed.sourceKind === 'folder' && vaultPathDepth(pa) === 1;

	// Cluster member paths vs folder/document paths
	if (seed.sourceKind === 'cluster') {
		for (const mp of seed.clusterMemberPaths ?? []) {
			const m = normalizeVaultPath(mp);
			if (!m) continue;
			if (pb === m || pb.startsWith(`${m}/`) || pa === m || m.startsWith(`${pa}/`)) return 0.78;
		}
	}
	if (c.sourceKind === 'cluster') {
		for (const mp of c.clusterMemberPaths ?? []) {
			const m = normalizeVaultPath(mp);
			if (m && (isVaultPathUnderPrefix(m, pa) || isVaultPathUnderPrefix(pa, m))) return 0.74;
		}
	}

	if (vaultFolderPathsNest(pa, pb) || vaultFolderPathsNest(pb, pa)) {
		if (seedFolderTop) {
			const rel = vaultPathDepth(pb) - vaultPathDepth(pa);
			if (rel === 1 && isDirectChildPath(pa, pb)) return 0.76;
			if (rel >= 2 && isVaultPathUnderPrefix(pb, pa)) return HUB_NAV_GROUP_TOP_LEVEL_DEEP_STRUCT;
			if (rel >= 2 && isVaultPathUnderPrefix(pa, pb)) return HUB_NAV_GROUP_TOP_LEVEL_DEEP_STRUCT;
			return HUB_NAV_GROUP_TOP_LEVEL_DEEP_STRUCT;
		}
		return 0.86;
	}

	const da = parentDirPath(pa);
	const db = parentDirPath(pb);
	if (da && db && da === db) return 0.52;

	const sa = pathSegments(pa);
	const sb = pathSegments(pb);
	if (sa[0] && sb[0] && sa[0] === sb[0]) return 0.1;

	return 0;
}

function pairwiseAffinity(
	a: HubCandidate,
	b: HubCandidate,
	bitsA: Uint32Array,
	bitsB: Uint32Array,
): number {
	const cov = overlapRatioMinUint32(bitsA, bitsB);
	const pathP = pathStructuralAbsorbScore(a, b);
	const kw = jaccard(anchorKeywords(a), anchorKeywords(b));
	const tag = jaccard(anchorTopicTags(a), anchorTopicTags(b));
	const lab = jaccard(tokenizeLabel(a.label), tokenizeLabel(b.label));
	return 0.28 * cov + 0.24 * pathP + 0.18 * kw + 0.16 * tag + 0.14 * lab;
}

/**
 * Whether `c` may join the group led by `seed` (single-step, no transitivity).
 */
function shouldAbsorbIntoSeed(
	seed: HubCandidate,
	c: HubCandidate,
	bitsSeed: Uint32Array,
	bitsC: Uint32Array,
): boolean {
	const struct = pathStructuralAbsorbScore(seed, c);
	const sem = semanticAffinity(seed, c);
	const cov = overlapRatioMinUint32(bitsSeed, bitsC);
	const seedTopFolder = seed.sourceKind === 'folder' && vaultPathDepth(normalizeVaultPath(seed.path ?? '')) === 1;

	const combined = 0.32 * struct + 0.38 * sem + 0.3 * cov;

	if (struct >= 0.82) return true;
	if (sem >= HUB_NAV_GROUP_SEED_SEMANTIC_STRONG) return true;
	if (cov >= 0.62 && sem >= 0.24) return true;

	if (seedTopFolder) {
		if (struct >= 0.7) return true;
		if (combined >= 0.5 && (sem >= 0.28 || cov >= 0.45)) return true;
		return combined >= 0.52;
	}

	if (struct >= 0.45 && sem >= 0.28) return true;
	return combined >= HUB_NAV_GROUP_SEED_ABSORB_COMBINED_MIN;
}

/** Prefer deepest non-top folder hub, else highest source priority + ranking. */
function pickRepresentative(members: HubCandidate[]): HubCandidate {
	const folders = members.filter((m) => m.sourceKind === 'folder');
	const nonTop = folders.filter((m) => vaultPathDepth(m.path ?? '') >= 2);
	if (nonTop.length) {
		return [...nonTop].sort((a, b) => {
			const d = vaultPathDepth(b.path ?? '') - vaultPathDepth(a.path ?? '');
			if (d !== 0) return d;
			const pa = SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind];
			if (pa !== 0) return pa;
			return b.rankingScore - a.rankingScore;
		})[0]!;
	}
	const sorted = [...members].sort((a, b) => {
		const pa = SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind];
		if (pa !== 0) return pa;
		const r = b.rankingScore - a.rankingScore;
		if (r !== 0) return r;
		return a.stableKey.localeCompare(b.stableKey);
	});
	return sorted[0]!;
}

function orBitsTogether(
	members: HubCandidate[],
	bitsByStableKey: Map<string, Uint32Array>,
	docCount: number,
): Uint32Array {
	const u = createUint32Bitset(docCount);
	for (const m of members) {
		const b = bitsByStableKey.get(m.stableKey);
		if (!b) continue;
		const n = Math.min(u.length, b.length);
		for (let i = 0; i < n; i++) u[i] |= b[i] ?? 0;
	}
	return u;
}

function meanInternalAffinity(
	indices: number[],
	candidates: HubCandidate[],
	bitsByStableKey: Map<string, Uint32Array>,
): number {
	if (indices.length < 2) return 1;
	let sum = 0;
	let cnt = 0;
	for (let i = 0; i < indices.length; i++) {
		for (let j = i + 1; j < indices.length; j++) {
			const a = candidates[indices[i]!]!;
			const b = candidates[indices[j]!]!;
			const ba = bitsByStableKey.get(a.stableKey)!;
			const bb = bitsByStableKey.get(b.stableKey)!;
			sum += pairwiseAffinity(a, b, ba, bb);
			cnt++;
		}
	}
	return cnt > 0 ? sum / cnt : 1;
}

function isTopLevelVaultFolderHub(c: HubCandidate): boolean {
	if (c.sourceKind !== 'folder') return false;
	const p = normalizeVaultPath(c.path ?? '');
	return pathSegments(p).length === 1;
}

function navigationFolderCohesionPenalty(c: HubCandidate): number {
	if (c.sourceKind !== 'folder') return 0;
	const coh = c.candidateScore?.cohesionScore;
	if (typeof coh !== 'number' || !Number.isFinite(coh)) return 0;
	return coh < 0.14 ? HUB_NAVIGATION_LOW_COHESION_FOLDER_PENALTY : 0;
}

function mergeHubPartitionUnionBits(union: Uint32Array, add: Uint32Array): void {
	const n = Math.min(union.length, add.length);
	for (let i = 0; i < n; i++) union[i] |= add[i] ?? 0;
}

/**
 * Sort key for picking the next seed: prefers deeper folders, cohesion, coverage, ranking.
 */
function seedQualityScore(c: HubCandidate, bits: Uint32Array | undefined, docTotal: number): number {
	let q = c.rankingScore * 0.52 + c.graphScore * 0.18 + c.sourceConsensusScore * 0.14;
	const coh = c.candidateScore?.cohesionScore;
	if (typeof coh === 'number' && c.sourceKind === 'folder') q += Math.min(0.22, coh * 0.22);
	if (bits && docTotal > 0) {
		q += (countBitsUint32(bits) / docTotal) * 0.1;
	}
	const depth = vaultPathDepth(c.path ?? '');
	if (c.sourceKind === 'folder' && depth >= 3) q += 0.06;
	if (c.sourceKind === 'folder' && depth === 1) q -= 0.38;
	return q;
}

/**
 * Top-level vault folder hubs are poor seeds (they swallow the library); they become singletons unless absorbed.
 */
function isEligibleSeed(c: HubCandidate): boolean {
	if (c.sourceKind === 'manual') return true;
	if (c.sourceKind === 'folder' && vaultPathDepth(c.path ?? '') <= 1) return false;
	return true;
}

/**
 * Clusters candidates by iterative seed expansion: each unassigned hub becomes a seed in quality order
 * and pulls only candidates that pass {@link shouldAbsorbIntoSeed} against that seed.
 */
export function buildNavigationHubGroups(
	candidates: HubCandidate[],
	bitsByStableKey: Map<string, Uint32Array>,
	documentCount: number,
): NavigationHubGroup[] {
	const n = candidates.length;
	if (n === 0) return [];

	const docTotal = Math.max(0, documentCount);
	const sortedIdx = candidates
		.map((_, i) => i)
		.sort((ia, ib) => {
			const a = candidates[ia]!;
			const b = candidates[ib]!;
			const ba = bitsByStableKey.get(a.stableKey);
			const bb = bitsByStableKey.get(b.stableKey);
			const sa = seedQualityScore(a, ba, docTotal);
			const sb = seedQualityScore(b, bb, docTotal);
			if (sb !== sa) return sb - sa;
			return b.rankingScore - a.rankingScore;
		});

	const assigned = new Set<number>();
	const out: NavigationHubGroup[] = [];

	for (const seedIdx of sortedIdx) {
		if (assigned.has(seedIdx)) continue;
		const seed = candidates[seedIdx]!;
		const bitsSeed = bitsByStableKey.get(seed.stableKey);
		if (!bitsSeed) {
			assigned.add(seedIdx);
			out.push(
				buildOneGroup([seedIdx], candidates, bitsByStableKey, documentCount, docTotal),
			);
			continue;
		}

		if (!isEligibleSeed(seed)) {
			assigned.add(seedIdx);
			out.push(
				buildOneGroup([seedIdx], candidates, bitsByStableKey, documentCount, docTotal),
			);
			continue;
		}

		const memberIdx: number[] = [seedIdx];
		assigned.add(seedIdx);

		for (let j = 0; j < n; j++) {
			if (assigned.has(j) || j === seedIdx) continue;
			const c = candidates[j]!;
			const bitsC = bitsByStableKey.get(c.stableKey);
			if (!bitsC) continue;
			if (shouldAbsorbIntoSeed(seed, c, bitsSeed, bitsC)) {
				memberIdx.push(j);
				assigned.add(j);
			}
		}

		out.push(buildOneGroup(memberIdx, candidates, bitsByStableKey, documentCount, docTotal));
	}

	out.sort((a, b) => b.groupScore - a.groupScore);
	return out;
}

function buildOneGroup(
	memberIdx: number[],
	candidates: HubCandidate[],
	bitsByStableKey: Map<string, Uint32Array>,
	documentCount: number,
	docTotal: number,
): NavigationHubGroup {
	const members = memberIdx.map((idx) => candidates[idx]!).sort((a, b) => b.rankingScore - a.rankingScore);
	const memberStableKeys = members.map((m) => m.stableKey);
	const sortedKeys = [...memberStableKeys].sort();
	const groupKey = `navgrp:${hashSHA256(sortedKeys.join('|')).slice(0, 24)}`;
	const rep = pickRepresentative(members);
	const unionBits = orBitsTogether(members, bitsByStableKey, documentCount);
	const unionCoverageSize = countBitsUint32(unionBits);
	const internalAffinityMean = meanInternalAffinity(memberIdx, candidates, bitsByStableKey);
	const maxR = Math.max(...members.map((m) => m.rankingScore));
	const meanR = members.reduce((s, m) => s + m.rankingScore, 0) / members.length;
	const sizeScore = docTotal > 0 ? unionCoverageSize / docTotal : 0;
	const cohesionBoost = Math.max(0, internalAffinityMean);
	const groupScore =
		0.22 * sizeScore + 0.22 * maxR + 0.18 * meanR + 0.38 * cohesionBoost;

	return {
		groupKey,
		title: rep.label,
		representativeStableKey: rep.stableKey,
		representativePath: rep.path,
		representativeLabel: rep.label,
		members,
		memberStableKeys,
		unionCoverageSize,
		internalAffinityMean,
		groupScore,
	};
}

export type PartitionNavigationGroupsResult = {
	navigationHubGroups: NavigationHubGroup[];
	navigationHubs: HubCandidate[];
	longTailHubs: HubCandidate[];
	metrics: HubPartitionMetrics;
};

/**
 * Greedy-selects navigation groups (union coverage, overlap penalty), then assigns non-navigation candidates to long-tail.
 */
export function partitionNavigationGroupsAndLongTail(options: {
	groups: NavigationHubGroup[];
	candidates: HubCandidate[];
	bitsByStableKey: Map<string, Uint32Array>;
	docCoverageIndex: { docCount: number };
}): PartitionNavigationGroupsResult {
	const { groups, candidates, bitsByStableKey, docCoverageIndex } = options;
	const docTotal = Math.max(0, docCoverageIndex.docCount);
	const w = HUB_NAVIGATION_SCORE_WEIGHTS;

	const groupUnionCache = new Map<string, Uint32Array>();
	for (const g of groups) {
		groupUnionCache.set(g.groupKey, orBitsTogether(g.members, bitsByStableKey, docTotal));
	}

	const sorted = [...groups].sort((a, b) => b.groupScore - a.groupScore);
	const union = createUint32Bitset(docTotal);
	const navigationHubGroups: NavigationHubGroup[] = [];
	const selectedGroupKeys = new Set<string>();
	let stoppedReason = 'init';

	while (navigationHubGroups.length < HUB_NAVIGATION_PARTITION_MAX) {
		let best: NavigationHubGroup | null = null;
		let bestScore = -Infinity;
		for (const g of sorted) {
			if (selectedGroupKeys.has(g.groupKey)) continue;
			const bits = groupUnionCache.get(g.groupKey)!;
			const newCount = countBitsNewSince(bits, union);
			let maxOv = 0;
			for (const ng of navigationHubGroups) {
				const nb = groupUnionCache.get(ng.groupKey)!;
				maxOv = Math.max(maxOv, overlapRatioMinUint32(bits, nb));
			}
			const marginal = fractionOfBitsNewSince(bits, union);
			const newRatio = docTotal > 0 ? newCount / docTotal : 0;
			const rep = g.members.find((m) => m.stableKey === g.representativeStableKey) ?? g.members[0]!;
			const quality =
				0.5 * rep.rankingScore + 0.28 * rep.graphScore + 0.22 * Math.min(1, rep.sourceConsensusScore + 0.001);
			let penalty = 0;
			if (isTopLevelVaultFolderHub(rep)) penalty += HUB_NAVIGATION_TOP_LEVEL_FOLDER_PENALTY;
			penalty += navigationFolderCohesionPenalty(rep);
			const bonus = rep.sourceKind === 'manual' ? HUB_NAVIGATION_MANUAL_BONUS : 0;
			let score =
				w.newCoverageRatio * newRatio +
				w.marginalFraction * marginal +
				w.rankingQuality * quality +
				0.12 * g.internalAffinityMean -
				w.overlapPenalty * maxOv -
				penalty +
				bonus;
			if (newCount === 0 && navigationHubGroups.length >= HUB_NAVIGATION_PARTITION_MIN) {
				continue;
			}
			if (newCount === 0 && navigationHubGroups.length < HUB_NAVIGATION_PARTITION_MIN) {
				score = quality * 0.65 - maxOv * 0.25 - penalty + bonus + 0.08 * g.internalAffinityMean;
			}
			if (score > bestScore) {
				bestScore = score;
				best = g;
			}
		}
		if (!best) {
			stoppedReason = 'no_eligible_group';
			break;
		}
		if (bestScore < 0 && navigationHubGroups.length >= HUB_NAVIGATION_PARTITION_MIN) {
			stoppedReason = 'low_score';
			break;
		}
		navigationHubGroups.push(best);
		selectedGroupKeys.add(best.groupKey);
		mergeHubPartitionUnionBits(union, groupUnionCache.get(best.groupKey)!);
		stoppedReason =
			navigationHubGroups.length >= HUB_NAVIGATION_PARTITION_MAX ? 'max_cap' : 'greedy_step';
	}

	let guard = 0;
	while (
		navigationHubGroups.length < HUB_NAVIGATION_PARTITION_MIN &&
		navigationHubGroups.length < groups.length &&
		guard < groups.length
	) {
		guard++;
		let added = false;
		for (const g of sorted) {
			if (selectedGroupKeys.has(g.groupKey)) continue;
			navigationHubGroups.push(g);
			selectedGroupKeys.add(g.groupKey);
			mergeHubPartitionUnionBits(union, groupUnionCache.get(g.groupKey)!);
			added = true;
			stoppedReason = 'fill_min_ranking';
			break;
		}
		if (!added) break;
	}

	const navMemberKeys = new Set<string>();
	for (const g of navigationHubGroups) {
		for (const k of g.memberStableKeys) navMemberKeys.add(k);
	}
	const longTailHubs = candidates.filter((c) => !navMemberKeys.has(c.stableKey));
	const navigationHubs = navigationHubGroups.map((g) =>
		g.members.find((m) => m.stableKey === g.representativeStableKey) ?? g.members[0]!,
	);

	const coveredCount = countBitsUint32(union);
	const navRatio = docTotal > 0 ? coveredCount / docTotal : 0;
	const navigationMemberCount = [...navMemberKeys].length;

	return {
		navigationHubGroups,
		navigationHubs,
		longTailHubs,
		metrics: {
			documentCount: docTotal,
			navigationCount: navigationHubGroups.length,
			navigationMemberCount,
			longTailCount: longTailHubs.length,
			navigationAbsoluteCoverageRatio: navRatio,
			stoppedReason,
			totalGroupCount: groups.length,
		},
	};
}
