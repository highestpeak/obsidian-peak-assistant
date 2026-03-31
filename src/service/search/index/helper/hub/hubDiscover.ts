/**
 * Hub candidate discovery: pool budgets, multi-round selection, round summaries, LLM hints, and orchestration.
 */

import { normalizePath, TAbstractFile, TFile, TFolder } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder, getAIManualHubFolder } from '@/app/settings/types';
import {
	HUB_CLUSTER_V11_CONSOLE_DEBUG,
	HUB_CLUSTER_V11_MIN_AVG_AFFINITY,
	HUB_CLUSTER_V11_MIN_COHESION_SCORE,
	HUB_CLUSTER_V11_MIN_MEMBER_AFFINITY,
	HUB_CLUSTER_V11_REFERENCE_EDGE_DEFAULT_WEIGHT,
	HUB_CLUSTER_V11_RELAXED_MEMBER_AFFINITY,
	HUB_CLUSTER_V11_SEMANTIC_BRIDGE_THRESHOLD,
	HUB_CLUSTER_V11_BRIDGE_MEMBER_AFFINITY,
	HUB_CLUSTER_V11_SEMANTIC_STRONG_THRESHOLD,
	HUB_DISCOVER_CLUSTER_MIN_SIZE,
	HUB_DISCOVER_CLUSTER_REFERENCE_NEIGHBOR_CAP,
	HUB_DISCOVER_CLUSTER_RESERVE_MAX,
	HUB_DISCOVER_CLUSTER_RESERVE_MAX_MEMBER_JACCARD,
	HUB_DISCOVER_CLUSTER_RESERVE_MAX_PER_THEME,
	HUB_DISCOVER_CLUSTER_RESERVE_MIN,
	HUB_DISCOVER_CLUSTER_RESERVE_MIN_GRAPH_SCORE,
	HUB_DISCOVER_CLUSTER_EMIT_DEDUPE_MAX_JACCARD,
	HUB_DISCOVER_CLUSTER_RAW_MAX_PER_THEME,
	HUB_DISCOVER_CLUSTER_SEED_FETCH_MULTIPLIER,
	HUB_DISCOVER_CLUSTER_SEED_TOP_DOC_SCORE_FACTOR,
	HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP,
	HUB_DISCOVER_COVERAGE_FILL_MIN_CLUSTER_NEW_DOCS_WHEN_CONFLICT,
	HUB_DISCOVER_COVERAGE_FILL_MIN_NESTED_FOLDER_NEW_DOCS,
	HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOCS,
	HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOC_RATIO,
	HUB_DISCOVER_COVERAGE_FILL_TARGET_RATIO,
	HUB_DISCOVER_DOCUMENT_FILL_EXTRA_SLOTS,
	HUB_DISCOVER_DOCUMENT_MAX_SELECTED_ABS,
	HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION,
	HUB_DISCOVER_DOCUMENT_MAX_SELECTED_MIN,
	HUB_DISCOVER_FOLDER_FILL_EXTRA_SLOTS,
	FOLDER_HUB_DISCOVER_FETCH_BATCH_MULTIPLIER,
	FOLDER_HUB_DISCOVER_MAX_SCAN_MULTIPLIER,
	FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_LARGE,
	FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_STRONG,
	FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_RATIO,
	FOLDER_HUB_DISCOVER_NEST_COHESION_CHILD_WIN,
	FOLDER_HUB_DISCOVER_NEST_COHESION_NEAR,
	FOLDER_HUB_DISCOVER_NEST_SCORE_CHILD_WIN,
	FOLDER_HUB_DISCOVER_NEST_SCORE_NEAR,
	FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_DOCS,
	FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_RATIO,
	FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_SCORE_EPS,
	FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_BOUNDARY_RATIO,
	FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_MAX_DOCS,
	FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_SCORE_EPS,
	FOLDER_HUB_NEST_PARENT_RESIDUAL_MIN_DOCS,
	FOLDER_HUB_NEST_PARENT_RESIDUAL_RATIO,
	FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_DOCS,
	FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_RATIO,
	FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION,
	FOLDER_HUB_BROAD_MIN_TAG_DOCS,
	FOLDER_HUB_BROAD_MISMATCH_PENALTY,
	FOLDER_HUB_BROAD_ORG_MIN,
	FOLDER_HUB_BROAD_PENALTY_BASE,
	FOLDER_HUB_BROAD_PENALTY_DOC_SCALE,
	FOLDER_HUB_BROAD_PENALTY_MAX,
	FOLDER_HUB_BROAD_SEM_MAX,
	FOLDER_HUB_DISCOVER_QUOTA_POOL_MULTIPLIER,
	FOLDER_HUB_TOP_ROOT_MAX_FRACTION,
	HUB_DISCOVER_FOLDER_MAX_CANDIDATES,
	HUB_DISCOVER_FOLDER_MAX_SELECTED_ABS,
	HUB_DISCOVER_FOLDER_MAX_SELECTED_FRACTION,
	HUB_DISCOVER_GREEDY_SELECTION,
	DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS,
	DOCUMENT_HUB_REPRESENTATIVE_THINNING,
	DOCUMENT_HUB_REPRESENTATIVE_POOL_CAP,
	HUB_DISCOVER_LIMIT_MAX,
	HUB_DISCOVER_LIMIT_MIN,
	HUB_DISCOVER_LIMIT_SQRT_SCALE,
	HUB_DISCOVER_PREFIX_MIN_LENGTH,
	HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT,
	HUB_COVERAGE_INDEX_PAGE_SIZE,
	HUB_SEMANTIC_MERGE_CROSS_KIND_MIN_CONFIDENCE,
	HUB_SEMANTIC_MERGE_MIN_CONFIDENCE,
	HUB_SOURCE_CONSENSUS_MAX,
	HUB_SOURCE_CONSENSUS_PER_EXTRA,
	SLICE_CAPS,
	MANUAL_HUB_FRONTMATTER_KEYS,
} from '@/core/constant';
import { GRAPH_WIKI_REFERENCE_EDGE_TYPES } from '@/core/po/graph.po';
import { hubSemanticMergeLlmSchema, type HubSemanticMergeLlm } from '@/core/schemas/hubDiscoverLlm';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { MobiusNodeFolderHubDiscoveryRow } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import {
	countBitsNewSince,
	countBitsUint32,
	createUint32Bitset,
	fractionOfBitsNewSince,
	hasUint32Bit,
	overlapRatioMinUint32,
	popcountUint32,
	setUint32Bit,
} from '@/core/utils/bit-util';
import { decodeIndexedTagsBlob, graphKeywordTagsForMobius } from '@/core/document/helper/TagService';
import { folderPrefixOfPath } from '@/core/utils/file-utils';
import { hashSHA256 } from '@/core/utils/hash-utils';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import {
	isVaultPathUnderPrefix,
	pathMatchesAnyPrefix,
	vaultFolderPathsNest,
} from '@/core/utils/hub-path-utils';
import { stableHubClusterNodeId } from '@/core/utils/id-utils';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { normalizeVaultPath, parentDirPath, pathSegments } from '@/core/utils/vault-path-utils';
import { PromptId } from '@/service/prompt/PromptId';
import {
	buildClusterAnchorSetsFromBlob,
	computeClusterCohesionFromMembers,
	computeClusterSeedQualityScore,
	computeIntraClusterSemanticDensity,
	computeMemberAffinity,
	extractMeaningfulTitleTokens,
	mergeTitleTokensIntoAnchorKeywords,
	pickClusterHubLabel,
	semanticSupportFromEdgeWeight,
} from './clusterHubSignals';
import type {
	HubAssemblyHints,
	HubAssemblyTopology,
	HubCandidate,
	HubCandidateScore,
	HubCandidateSourceEvidence,
	HubClusterV11Debug,
	HubDiscoverCoverageGap,
	HubDiscoverDocCoverageIndex,
	HubDiscoverOverlapPair,
	HubDiscoverRoundContext,
	HubDiscoverRoundSummary,
	HubDiscoverRoundSummaryHubCard,
	HubChildRoute,
	HubDiscoverSettings,
	HubDiscoverStopDecision,
	HubClusterDiscoveryStats,
	HubRole,
	HubSourceKind,
	MobiusNodeRow,
} from './types';
import { DEFAULT_HUB_DISCOVER_SETTINGS, SOURCE_PRIORITY } from './types';

/**
 * Drops heading/block refs and noise so callers do not pass unusable prefixes to discovery.
 */
function sanitizeHubDiscoverPathPrefixes(prefixes: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of prefixes) {
		let s = String(raw).trim();
		const hashIdx = s.indexOf('#');
		if (hashIdx >= 0) s = s.slice(0, hashIdx);
		s = s.replace(/\^[0-9a-f]{4,}\b/gi, '').trim();
		const p = normalizeVaultPath(s);
		if (!p) continue;
		if (p.includes('#') || p.includes('^')) continue;
		if (p.length < HUB_DISCOVER_PREFIX_MIN_LENGTH) continue;
		if (/^[a-z]$/i.test(p)) continue;
		const key = p.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}

/**
 * True when a path looks like a real vault markdown file (excludes heading anchors / block ids in DB paths).
 * Used so corrupt rows do not keep bogus target prefixes active for cluster discovery.
 */
function isPlausibleVaultDocumentPathForHubSeed(path: string): boolean {
	const noAnchor = String(path).split('#')[0] ?? '';
	const p = normalizeVaultPath(noAnchor);
	if (!p) return false;
	if (p.includes('#') || p.includes('^')) return false;
	return p.toLowerCase().endsWith('.md');
}

/**
 * Gap-bucket prefixes from SQL may include noise; drop before summaries.
 */
function isValidGapPathPrefix(raw: string): boolean {
	const head = String(raw).split('#')[0] ?? '';
	const cleaned = head.replace(/\^[0-9a-f]{4,}\b/gi, '').trim();
	const p = normalizeVaultPath(cleaned);
	if (!p) return false;
	if (p.includes('#') || p.includes('^')) return false;
	if (p.length < HUB_DISCOVER_PREFIX_MIN_LENGTH) return false;
	const segs = p.split('/').filter(Boolean);
	if (segs.length === 0) return false;
	if (segs.length === 1 && /\.md$/i.test(segs[0]!)) return false;
	return true;
}

/**
 * Dedup key for document hub candidates: normalized vault path (not node id) for LLM-readable merge plans.
 */
function documentHubStableKey(vaultPath: string): string {
	return `document:${normalizePath(vaultPath)}`;
}

/**
 * Dedup key for cluster hubs: seed document path (normalized). Graph `nodeId` remains hash-derived.
 */
function clusterHubStableKey(seedVaultPath: string): string {
	return `cluster:${normalizePath(seedVaultPath)}`;
}

/**
 * True if this cluster is too similar to an already-selected cluster (greedy pass diversity).
 */
function clusterGreedyConflictsWithSelected(candidate: HubCandidate, selected: HubCandidate[]): boolean {
	if (candidate.sourceKind !== 'cluster') return false;
	const fam = clusterThemeFamilyKey(candidate);
	for (const sc of selected) {
		if (sc.sourceKind !== 'cluster') continue;
		const j = memberPathJaccard(candidate.clusterMemberPaths, sc.clusterMemberPaths);
		if (j > 0.9) return true;
		if (
			j > HUB_DISCOVER_CLUSTER_RESERVE_MAX_MEMBER_JACCARD &&
			clusterThemeFamilyKey(sc) === fam
		) {
			return true;
		}
	}
	return false;
}

/** Jaccard similarity on member path sets (cluster overlap). */
function memberPathJaccard(a: string[] | undefined, b: string[] | undefined): number {
	const sa = new Set(a ?? []);
	const sb = new Set(b ?? []);
	if (sa.size === 0 && sb.size === 0) return 0;
	let inter = 0;
	for (const x of sa) {
		if (sb.has(x)) inter++;
	}
	const union = sa.size + sb.size - inter;
	return union <= 0 ? 0 : inter / union;
}

/** Slash-separated longest common prefix across vault paths (empty if none). */
function longestCommonVaultPathPrefix(paths: string[]): string {
	if (paths.length === 0) return '';
	const split = paths.map((p) => p.split('/').filter(Boolean));
	let depth = 0;
	outer: for (; ;) {
		const first = split[0]![depth];
		if (first === undefined) break;
		for (let i = 1; i < split.length; i++) {
			if (split[i]![depth] !== first) break outer;
		}
		depth++;
	}
	if (depth === 0) return '';
	return split[0]!.slice(0, depth).join('/');
}

/**
 * Maps noisy anchor text to a coarse topic bucket so related GOF / pattern notes share one family key.
 */
function canonicalClusterTopicFamily(
	c: Pick<HubCandidate, 'label' | 'assemblyHints'>,
): string | null {
	const blob = [
		...(c.assemblyHints?.anchorTopicTags ?? []),
		...(c.assemblyHints?.anchorKeywords ?? []),
		(c.label ?? '').replace(/^cluster:\s*/i, ''),
	].join(' ');
	const s = blob.toLowerCase();
	if (
		/design\s*pattern|设计模式|\bgof\b|gang\s*of\s*four|行为型|结构型|创建型|memento|command\s*pattern|observer|strategy|factory|singleton|adapter|decorator|bridge|prototype|builder|composite|facade|flyweight|iterator|mediator|state|template method|visitor|chain of responsibility/.test(
			s,
		)
	) {
		return 'topic:design-patterns';
	}
	if (/kubernetes|\bk8s\b|kube|helm|istio|containerd|docker|\bpod\b|deployment|service mesh|argocd/.test(s)) {
		return 'topic:k8s-cloud';
	}
	return null;
}

/**
 * Coarse key for reserve diversity: shared member path, canonical topic, then tags/keywords/label.
 */
function clusterThemeFamilyKey(
	c: Pick<HubCandidate, 'label' | 'clusterMemberPaths' | 'assemblyHints'>,
): string {
	const paths = c.clusterMemberPaths;
	if (paths && paths.length >= 2) {
		const lcp = longestCommonVaultPathPrefix(paths);
		if (lcp.length >= 3) {
			const norm = lcp
				.toLowerCase()
				.replace(/[^a-z0-9\u4e00-\u9fff/]+/g, '/')
				.replace(/\/+/g, '/')
				.replace(/^\/+|\/+$/g, '');
			const segs = norm.split('/').filter(Boolean);
			if (segs.length >= 2) {
				return `path:${segs.slice(-2).join('/')}`.slice(0, 64);
			}
			if (segs.length === 1) return `path:${segs[0]}`.slice(0, 64);
		}
	}
	const canon = canonicalClusterTopicFamily(c);
	if (canon) return canon;
	const tags = c.assemblyHints?.anchorTopicTags;
	if (tags && tags.length > 0) {
		const t = tags[0]
			.toLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
			.trim();
		if (t.length >= 2) return `tag:${t.slice(0, 48)}`;
	}
	const kws = c.assemblyHints?.anchorKeywords;
	if (kws && kws.length >= 2) {
		const a = String(kws[0] ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '');
		const b = String(kws[1] ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '');
		if (a.length >= 2 && b.length >= 2) return `kw:${`${a}|${b}`.slice(0, 60)}`;
	}
	const lab = (c.label ?? '').replace(/^cluster:\s*/i, '').trim();
	const words = lab
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length > 2)
		.slice(0, 3);
	return words.join(' ') || 'unknown';
}

/**
 * Drop near-duplicate emitted clusters (high member overlap + same coarse family, or almost identical sets).
 */
function dedupeClusterCandidatesCoarse(candidates: HubCandidate[], maxJaccard: number): { kept: HubCandidate[]; removed: number } {
	const sorted = [...candidates].sort((a, b) => b.graphScore - a.graphScore);
	const kept: HubCandidate[] = [];
	for (const c of sorted) {
		let dup = false;
		for (const k of kept) {
			const j = memberPathJaccard(c.clusterMemberPaths, k.clusterMemberPaths);
			if (j > 0.9) {
				dup = true;
				break;
			}
			if (j > maxJaccard && clusterThemeFamilyKey(c) === clusterThemeFamilyKey(k)) {
				dup = true;
				break;
			}
		}
		if (!dup) kept.push(c);
	}
	return { kept, removed: candidates.length - kept.length };
}

/**
 * Greedy filter: keep high `rankingScore` order but skip near-duplicate clusters (member overlap / theme cap).
 */
function filterClusterCandidatesForReserveDiversity(
	sortedClusters: HubCandidate[],
	maxPerTheme: number,
	maxMemberJaccard: number,
): HubCandidate[] {
	const out: HubCandidate[] = [];
	const themeCounts = new Map<string, number>();
	for (const c of sortedClusters) {
		const fam = clusterThemeFamilyKey(c);
		const tc = themeCounts.get(fam) ?? 0;
		if (tc >= maxPerTheme) continue;
		let tooSimilar = false;
		for (const o of out) {
			if (memberPathJaccard(c.clusterMemberPaths, o.clusterMemberPaths) > maxMemberJaccard) {
				tooSimilar = true;
				break;
			}
		}
		if (tooSimilar) continue;
		out.push(c);
		themeCounts.set(fam, tc + 1);
	}
	return out;
}

// --- Manual hub note YAML hints (`hub_role`, `hub_source_paths`) for discovery only ---

/** Allowed values for `hub_role` on manual hub notes. */
const VALID_MANUAL_HUB_ROLES: ReadonlySet<string> = new Set([
	'authority',
	'index',
	'bridge',
	'cluster_center',
	'folder_anchor',
	'manual',
]);

/**
 * Normalizes frontmatter `hub_source_paths` from string (comma/newline) or string array to vault paths.
 */
function normalizeManualHubSourcePathsList(raw: unknown): string[] {
	const toNorm = (s: string) => normalizeVaultPath(s.trim());
	if (raw == null) return [];
	if (Array.isArray(raw)) {
		return raw
			.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
			.map((x) => toNorm(x))
			.filter(Boolean);
	}
	if (typeof raw === 'string') {
		return raw
			.split(/\r?\n/)
			.flatMap((line) => line.split(','))
			.map((s) => s.trim())
			.filter(Boolean)
			.map(toNorm)
			.filter(Boolean);
	}
	return [];
}

/**
 * Parses optional `hub_role` and `hub_source_paths` from note frontmatter (discovery hints only).
 */
function parseManualHubFrontmatterEnhancements(
	markdown: string,
): { hubRole?: HubRole; hubSourcePaths?: string[] } {
	const parsed = parseFrontmatter<Record<string, unknown>>(markdown);
	if (!parsed) return {};
	const d = parsed.data;
	let hubRole: HubRole | undefined;
	const r = d[MANUAL_HUB_FRONTMATTER_KEYS.hubRole];
	if (typeof r === 'string' && VALID_MANUAL_HUB_ROLES.has(r.trim())) {
		hubRole = r.trim() as HubRole;
	}
	const pathsRaw = d[MANUAL_HUB_FRONTMATTER_KEYS.hubSourcePaths];
	const hubSourcePaths = normalizeManualHubSourcePathsList(pathsRaw);
	const out: { hubRole?: HubRole; hubSourcePaths?: string[] } = {};
	if (hubRole) out.hubRole = hubRole;
	if (hubSourcePaths.length) out.hubSourcePaths = hubSourcePaths;
	return out;
}

// --- Pool budgets + merge utilities ---

/**
 * Hub discovery budgets from indexed document count: sqrt-scaled `limitTotal` plus
 * proportional sub-pools (e.g. at limitTotal≈40 → fetch/exclude caps ≈ 72/24/14/16).
 *
 * Field roles (all scale with vault size via `limitTotal`):
 * - `limitTotal`: cap on hubs finally selected in multi-round selection (merged pool).
 * - `documentFetchLimit` / `folderFetchLimit`: how many top SQL rows to pull for document vs folder candidates.
 * - `clusterLimit`: max cluster **hub candidates** returned from cluster discovery (`limit` arg); pool budget slice.
 * - `topDocExcludeLimit`: top document hubs whose centers are excluded as cluster seeds (overlap with doc hubs).
 * - `clusterSeedFetchLimit`: top documents by semantic PageRank to fetch as cluster seeds before exclusion filtering.
 */
export function computeHubDiscoverBudgets(documentNodeCount: number) {
	const n = Math.max(0, Math.floor(documentNodeCount));
	const raw = Math.floor(Math.sqrt(n) * HUB_DISCOVER_LIMIT_SQRT_SCALE);
	const limitTotal = Math.max(HUB_DISCOVER_LIMIT_MIN, Math.min(HUB_DISCOVER_LIMIT_MAX, raw));
	const documentFetchLimit = Math.max(1, Math.ceil(limitTotal * 1.8));
	const folderFetchLimit = Math.max(1, Math.ceil(limitTotal * 0.6));
	const clusterLimit = Math.max(1, Math.ceil(limitTotal * 0.35));
	const topDocExcludeLimit = Math.max(1, Math.ceil(limitTotal * 0.4));
	// Recall buffer: compensate top-doc exclusion + extra tries for valid clusters.
	const clusterSeedFetchLimit = Math.min(120, Math.max(20, topDocExcludeLimit + clusterLimit * 3));

	return {
		limitTotal,
		documentFetchLimit,
		folderFetchLimit,
		clusterLimit,
		topDocExcludeLimit,
		clusterSeedFetchLimit,
	};
}

/**
 * Target size for document-hub candidate list after representative thinning: derived from the same
 * final document slot budget used in {@link selectHubCandidatesMultiRound}, not from `limitTotal * 1.8`.
 */
export function computeDocumentHubRepresentativeCandidateLimit(
	documentFetchLimit: number,
	limitTotal: number,
): number {
	const maxDocumentSlots = Math.min(
		HUB_DISCOVER_DOCUMENT_MAX_SELECTED_ABS,
		Math.max(
			HUB_DISCOVER_DOCUMENT_MAX_SELECTED_MIN,
			Math.floor(limitTotal * HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION),
		),
	);
	const cap = Math.max(
		maxDocumentSlots + DOCUMENT_HUB_REPRESENTATIVE_POOL_CAP.extraOverMaxSlots,
		Math.ceil(maxDocumentSlots * DOCUMENT_HUB_REPRESENTATIVE_POOL_CAP.multipleOfMaxSlots),
	);
	return Math.max(1, Math.min(Math.max(1, Math.floor(documentFetchLimit)), cap));
}

function orUint32BitsInPlace(union: Uint32Array, add: Uint32Array): void {
	const n = Math.min(union.length, add.length);
	for (let i = 0; i < n; i++) union[i] |= add[i] ?? 0;
}

/**
 * Reduces redundant document-hub candidates that share most of the same one-hop reference coverage.
 * Keeps top seeds, then prefers strong scores, high novelty vs union, or moderate novelty with low overlap.
 */
export async function thinDocumentHubCandidatesRepresentative(options: {
	tenant: IndexTenant;
	raw: HubCandidate[];
	docCoverageIndex: HubDiscoverDocCoverageIndex;
	targetLimit: number;
}): Promise<HubCandidate[]> {
	const { tenant, raw, docCoverageIndex, targetLimit } = options;
	const lim = Math.max(1, Math.floor(targetLimit));
	if (raw.length <= lim) return raw;
	const docTotal = docCoverageIndex.docCount;
	if (docTotal <= 0) return raw.slice(0, lim);

	const TH = DOCUMENT_HUB_REPRESENTATIVE_THINNING;
	const strongThreshold = HUB_DISCOVER_GREEDY_SELECTION.strongHubScore;

	const sorted = [...raw].sort((a, b) => b.rankingScore - a.rankingScore);
	const selected: HubCandidate[] = [];
	const unionBits = createUint32Bitset(docTotal);
	const bitsByKey = new Map<string, Uint32Array>();
	const coverageCache = new Map<string, Uint32Array>();

	async function bitsFor(c: HubCandidate): Promise<Uint32Array> {
		const k = c.stableKey;
		let b = coverageCache.get(k);
		if (!b) {
			b = await estimateCandidateCoverageBits(tenant, c, docCoverageIndex);
			coverageCache.set(k, b);
		}
		return b;
	}

	const seedCap = Math.min(TH.seedKeepCount, lim);

	for (const c of sorted) {
		if (selected.length >= lim) break;
		const bits = await bitsFor(c);
		bitsByKey.set(c.stableKey, bits);
		if (selected.length < seedCap) {
			selected.push(c);
			orUint32BitsInPlace(unionBits, bits);
			continue;
		}

		const novelty = fractionOfBitsNewSince(bits, unionBits);
		let maxOv = 0;
		for (const s of selected) {
			const sb = bitsByKey.get(s.stableKey);
			if (sb) maxOv = Math.max(maxOv, overlapRatioMinUint32(bits, sb));
		}

		const rs = c.rankingScore;
		const keep =
			(rs >= strongThreshold && maxOv < TH.overlapVeryHigh) ||
			novelty >= TH.noveltyHigh ||
			(novelty >= TH.noveltyLow && maxOv < TH.overlapHigh);

		if (!keep) continue;

		selected.push(c);
		orUint32BitsInPlace(unionBits, bits);
	}

	return selected;
}

/**
 * Marginal coverage: |new \\ covered| / max(1, |candidate|).
 */
export function marginalCoverageGain(candidateCov: Set<string>, covered: Set<string>): number {
	let newCount = 0;
	for (const id of candidateCov) {
		if (!covered.has(id)) newCount++;
	}
	return newCount / Math.max(1, candidateCov.size);
}

/** `min(1, graphScore + sourceConsensusScore)` — single place for the ranking formula. */
export function computeHubRankingScore(graphScore: number, sourceConsensusScore: number): number {
	return Math.min(1, graphScore + sourceConsensusScore);
}

/**
 * Merge assembly hints when multiple discovery rows share the same `stableKey`: union lists, OR `stopAtChildHub`,
 * `expectedTopology` from highest-priority `sourceKind` when present.
 */
export function mergeHubAssemblyHintsGroup(group: HubCandidate[]): HubAssemblyHints | undefined {
	const list = group.map((g) => g.assemblyHints).filter((h): h is HubAssemblyHints => !!h);
	if (list.length === 0) return undefined;
	let acc = list[0]!;
	for (let i = 1; i < list.length; i++) {
		const b = list[i]!;
		acc = {
			anchorTopicTags: [...new Set([...acc.anchorTopicTags, ...b.anchorTopicTags])],
			anchorFunctionalTagIds: [...new Set([...acc.anchorFunctionalTagIds, ...b.anchorFunctionalTagIds])],
			anchorKeywords: [...new Set([...acc.anchorKeywords, ...b.anchorKeywords])],
			preferredChildHubNodeIds: [...new Set([...acc.preferredChildHubNodeIds, ...b.preferredChildHubNodeIds])],
			stopAtChildHub: acc.stopAtChildHub || b.stopAtChildHub,
			expectedTopology: acc.expectedTopology,
			deprioritizedBridgeNodeIds: [
				...new Set([...(acc.deprioritizedBridgeNodeIds ?? []), ...(b.deprioritizedBridgeNodeIds ?? [])]),
			],
			rationale: [acc.rationale, b.rationale].filter(Boolean).join(' | ') || undefined,
		};
	}
	const winner = [...group].sort((a, b) => SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind])[0]!;
	const topo = winner.assemblyHints?.expectedTopology;
	return topo ? { ...acc, expectedTopology: topo } : acc;
}

/**
 * JSON-safe cards for {@link PromptId.HubSemanticMerge} (non-manual hubs only).
 */
export function buildSemanticMergeHubCardsPayload(candidates: HubCandidate[]): unknown[] {
	return candidates
		.filter((c) => c.sourceKind !== 'manual')
		.map((c) => ({
			stableKey: c.stableKey,
			nodeId: c.nodeId,
			path: c.path,
			label: c.label,
			role: c.role,
			sourceKind: c.sourceKind,
			sourceKinds: c.sourceKinds,
			graphScore: c.graphScore,
			rankingScore: c.rankingScore,
			docIncomingCnt: c.docIncomingCnt,
			docOutgoingCnt: c.docOutgoingCnt,
			pagerank: c.pagerank ?? null,
			semanticPagerank: c.semanticPagerank ?? null,
			anchorTopicTags: (c.assemblyHints?.anchorTopicTags ?? []).slice(0, 16),
			anchorKeywords: (c.assemblyHints?.anchorKeywords ?? []).slice(0, 24),
			clusterMemberPathsSample: (c.clusterMemberPaths ?? []).slice(0, 8),
		}));
}

function unionClusterMemberPathsForSemanticMerge(members: HubCandidate[], rep: HubCandidate): string[] | undefined {
	const s = new Set<string>();
	for (const m of members) {
		for (const p of m.clusterMemberPaths ?? []) {
			if (p) s.add(p);
		}
		if (m.sourceKind === 'document' && m.path && m.path !== rep.path) s.add(m.path);
	}
	const arr = [...s];
	if (arr.length === 0) return rep.clusterMemberPaths;
	return arr.slice(0, SLICE_CAPS.hub.clusterMemberPaths);
}

function unionChildHubRoutesGroup(members: HubCandidate[]): HubChildRoute[] | undefined {
	const byId = new Map<string, HubChildRoute>();
	for (const m of members) {
		for (const r of m.childHubRoutes ?? []) {
			if (r.nodeId && !byId.has(r.nodeId)) byId.set(r.nodeId, r);
		}
	}
	const out = [...byId.values()];
	return out.length > 0 ? out : undefined;
}

/**
 * Folds multiple hub candidates into one representative row (identity from `representativeStableKey`).
 * Does not change `nodeId`/`path`/`stableKey` of the representative.
 */
export function mergeSemanticHubGroup(
	members: HubCandidate[],
	representativeStableKey: string,
	meta: { reason: string; confidence: number },
): HubCandidate {
	let rep =
		members.find((m) => m.stableKey === representativeStableKey) ??
		[...members].sort((a, b) => SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind])[0]!;
	const absorbed = members.filter((m) => m.stableKey !== rep.stableKey);

	const kindsAcc: HubSourceKind[] = [];
	for (const m of members) kindsAcc.push(...m.sourceKinds);
	const sourceKinds = [...new Set(kindsAcc)].sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a]);

	const evByKind = new Map<HubSourceKind, HubCandidateSourceEvidence>();
	for (const m of members) {
		for (const ev of m.sourceEvidence) {
			const prev = evByKind.get(ev.kind);
			if (!prev) {
				evByKind.set(ev.kind, ev);
				continue;
			}
			const ps = prev.graphScore;
			const s = ev.graphScore;
			if (typeof s === 'number' && (typeof ps !== 'number' || s > ps)) evByKind.set(ev.kind, ev);
		}
	}

	const nUnique = sourceKinds.length;
	const sourceConsensusScore = Math.min(
		HUB_SOURCE_CONSENSUS_MAX,
		Math.max(0, (nUnique - 1) * HUB_SOURCE_CONSENSUS_PER_EXTRA),
	);
	const sourceEvidence = [...evByKind.values()].sort((x, y) => SOURCE_PRIORITY[y.kind] - SOURCE_PRIORITY[x.kind]);
	const mergedHints = mergeHubAssemblyHintsGroup(members);
	const clusterMemberPaths = unionClusterMemberPathsForSemanticMerge(members, rep);
	const childUnion = unionChildHubRoutesGroup(members);
	const nextChildHubRoutes =
		childUnion && childUnion.length > 0 ? childUnion : rep.childHubRoutes;

	return {
		...rep,
		sourceKinds,
		sourceEvidence,
		sourceKind: rep.sourceKind,
		sourceConsensusScore,
		rankingScore: computeHubRankingScore(rep.graphScore, sourceConsensusScore),
		clusterMemberPaths,
		childHubRoutes: nextChildHubRoutes,
		assemblyHints: mergedHints ?? rep.assemblyHints,
		mergedFromStableKeys: absorbed.map((a) => a.stableKey),
		mergedFromPaths: absorbed.map((a) => a.path),
		mergedFromSourceKinds: [...new Set(absorbed.map((a) => a.sourceKind))],
		mergeRationale: meta.reason,
		mergeConfidence: meta.confidence,
	};
}

/**
 * Applies LLM merge plan to the selected hub list. Manual hubs are never absorbed.
 */
export function applySemanticMergePlanToFinalSelected(
	selected: HubCandidate[],
	plan: HubSemanticMergeLlm,
): HubCandidate[] {
	const byKey = new Map(selected.map((c) => [c.stableKey, c]));
	const manualKeys = new Set(selected.filter((c) => c.sourceKind === 'manual').map((c) => c.stableKey));

	const repToMerged = new Map<string, HubCandidate>();
	const absorbed = new Set<string>();

	const groups = [...(plan.mergeGroups ?? [])].sort((a, b) => b.confidence - a.confidence);

	for (const g of groups) {
		if (g.confidence < HUB_SEMANTIC_MERGE_MIN_CONFIDENCE) continue;
		if (g.memberStableKeys.length < 2) continue;
		if (g.memberStableKeys.some((k) => manualKeys.has(k))) continue;
		if (!g.memberStableKeys.includes(g.representativeStableKey)) continue;
		if (g.memberStableKeys.some((k) => absorbed.has(k))) continue;
		if (repToMerged.has(g.representativeStableKey)) continue;

		const members = g.memberStableKeys
			.map((k) => byKey.get(k))
			.filter((c): c is HubCandidate => c !== undefined);
		if (members.length !== g.memberStableKeys.length) continue;
		if (members.some((m) => m.sourceKind === 'manual')) continue;

		const primaryKinds = new Set(members.map((m) => m.sourceKind));
		if (primaryKinds.size > 1 && g.confidence < HUB_SEMANTIC_MERGE_CROSS_KIND_MIN_CONFIDENCE) continue;

		if (g.risks?.includes('disconnected_graph') && g.confidence < 0.9) continue;

		const merged = mergeSemanticHubGroup(members, g.representativeStableKey, {
			reason: g.reason,
			confidence: g.confidence,
		});
		repToMerged.set(g.representativeStableKey, merged);
		for (const k of g.memberStableKeys) {
			if (k !== g.representativeStableKey) absorbed.add(k);
		}
	}

	const out: HubCandidate[] = [];
	for (const c of selected) {
		if (absorbed.has(c.stableKey)) continue;
		const m = repToMerged.get(c.stableKey);
		if (m) {
			out.push(m);
			repToMerged.delete(c.stableKey);
		} else {
			out.push(c);
		}
	}
	return out;
}

/**
 * Build deterministic hints from `tags_json` (and cluster member paths) plus sibling hubs under the same folder prefix.
 */
function buildDeterministicAssemblyHintsForCandidate(
	candidate: HubCandidate,
	allSelected: HubCandidate[],
	hubDocumentNodeIds: Set<string>,
	tagsByNodeId: Map<string, string | null>,
	clusterPathToId: Map<string, string>,
): HubAssemblyHints {
	const topicTags = new Set<string>();
	const functionalIds = new Set<string>();
	const keywords = new Set<string>();
	const mergeBlob = (raw: string | null) => {
		const blob = decodeIndexedTagsBlob(raw);
		for (const t of blob.topicTags) topicTags.add(t);
		for (const e of blob.functionalTagEntries) functionalIds.add(e.id);
		for (const k of graphKeywordTagsForMobius(blob)) keywords.add(k);
		for (const k of blob.textrankKeywordTerms ?? []) keywords.add(k);
	};
	if (candidate.sourceKind === 'cluster') {
		for (const p of (candidate.clusterMemberPaths ?? []).slice(0, 8)) {
			const id = clusterPathToId.get(p);
			if (id) mergeBlob(tagsByNodeId.get(id) ?? null);
		}
	} else {
		mergeBlob(tagsByNodeId.get(candidate.nodeId) ?? null);
	}

	const centerFolder = folderPrefixOfPath(candidate.path);
	const pref = centerFolder ? (centerFolder.endsWith('/') ? centerFolder : `${centerFolder}/`) : '';
	const preferredChildHubNodeIds: string[] = [];
	if (pref) {
		for (const h of allSelected) {
			if (h.nodeId === candidate.nodeId) continue;
			if (!hubDocumentNodeIds.has(h.nodeId)) continue;
			const p = h.path;
			if (!p || p === candidate.path) continue;
			if (p.startsWith(pref)) preferredChildHubNodeIds.push(h.nodeId);
		}
	}
	const preferred = [...new Set(preferredChildHubNodeIds)].slice(0, 48);

	const expectedTopology: HubAssemblyTopology =
		candidate.sourceKind === 'folder'
			? 'hierarchical'
			: candidate.sourceKind === 'cluster'
				? 'clustered'
				: preferred.length > 0
					? 'hierarchical'
					: 'mixed';

	return {
		anchorTopicTags: [...topicTags].slice(0, 48),
		anchorFunctionalTagIds: [...functionalIds].slice(0, 24),
		anchorKeywords: [...keywords].slice(0, 48),
		preferredChildHubNodeIds: preferred,
		stopAtChildHub: true,
		expectedTopology,
		rationale: `deterministic:${candidate.sourceKind}`,
	};
}

/**
 * Attaches deterministic {@link HubAssemblyHints} to each selected hub (tags + child-hub inference).
 */
export async function attachDeterministicAssemblyHints(
	tenant: IndexTenant,
	candidates: HubCandidate[],
): Promise<HubCandidate[]> {
	const repo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const hubDocumentNodeIds = new Set(
		candidates.filter((c) => c.sourceKind === 'document' || c.sourceKind === 'manual').map((c) => c.nodeId),
	);

	const idsToLoad = new Set<string>();
	for (const c of candidates) {
		if (c.sourceKind !== 'cluster') {
			idsToLoad.add(c.nodeId);
		}
	}
	const clusterPaths: string[] = [];
	for (const c of candidates) {
		if (c.sourceKind === 'cluster') {
			for (const p of (c.clusterMemberPaths ?? []).slice(0, 8)) {
				clusterPaths.push(p);
			}
		}
	}
	const clusterPathToId = new Map<string, string>();
	const uniqueClusterPaths = [...new Set(clusterPaths)];
	if (uniqueClusterPaths.length > 0) {
		const pathRows = await repo.listHubOrDocumentNodeIdsByVaultPaths(uniqueClusterPaths);
		for (const r of pathRows) {
			clusterPathToId.set(r.path, r.node_id);
		}
	}
	for (const id of clusterPathToId.values()) {
		idsToLoad.add(id);
	}

	const tagsByNodeId = new Map<string, string | null>();
	if (idsToLoad.size > 0) {
		const rows = await repo.listHubLocalGraphNodeMeta([...idsToLoad]);
		for (const r of rows) {
			tagsByNodeId.set(r.node_id, r.tags_json ?? null);
		}
	}

	return candidates.map((c) => ({
		...c,
		assemblyHints: buildDeterministicAssemblyHintsForCandidate(
			c,
			candidates,
			hubDocumentNodeIds,
			tagsByNodeId,
			clusterPathToId,
		),
	}));
}

/**
 * Deduplicate by `stableKey` and merge rows that refer to the same hub from different discovery pipelines.
 *
 * - **Body (`nodeId`, `path`, `graphScore`, …):** taken from the contributor whose **primary** `sourceKind`
 *   has the highest {@link SOURCE_PRIORITY} (manual > folder > document > cluster). On a tie, the
 *   earlier row in `ordered` wins so behavior matches the old pairwise merge.
 * - **Provenance:** union all `sourceKinds` / `sourceEvidence` across the group; recompute `sourceConsensusScore`
 *   from the number of distinct kinds (multi-source bonus capped by `HUB_SOURCE_CONSENSUS_MAX` in `@/core/constant`).
 * - **Primary `sourceKind`:** after merge, set to the highest-priority kind among the union (same as `sourceKinds[0]`
 *   after sorting kinds by priority descending).
 * - **Assembly hints:** when present on multiple rows, merged via union; topology follows the highest-priority source.
 * Output order: one row per key, then sorted by {@link HubCandidate#rankingScore} descending.
 */
export function mergeCandidatesByPriority(ordered: HubCandidate[]): HubCandidate[] {
	// Collect every candidate that shares the same stableKey (order within each group = order in `ordered`).
	const byKey = new Map<string, HubCandidate[]>();
	for (const c of ordered) {
		let g = byKey.get(c.stableKey);
		if (!g) {
			g = [];
			byKey.set(c.stableKey, g);
		}
		g.push(c);
	}

	const out: HubCandidate[] = [];
	for (const group of byKey.values()) {
		if (group.length === 1) {
			out.push(group[0]!);
			continue;
		}

		// Winner row: max SOURCE_PRIORITY on `sourceKind` (the "primary" label each row already had pre-merge).
		let base = group[0]!;
		for (let i = 1; i < group.length; i++) {
			const c = group[i]!;
			if (SOURCE_PRIORITY[c.sourceKind] > SOURCE_PRIORITY[base.sourceKind]) base = c;
		}

		// Union all contributing kinds and merge per-kind evidence (keep the larger graphScore when duplicate kinds).
		const kindsAcc: HubSourceKind[] = [];
		const evByKind = new Map<HubSourceKind, HubCandidateSourceEvidence>();
		for (const g of group) {
			kindsAcc.push(...g.sourceKinds);
			for (const ev of g.sourceEvidence) {
				const prev = evByKind.get(ev.kind);
				if (!prev) {
					evByKind.set(ev.kind, ev);
					continue;
				}
				const ps = prev.graphScore;
				const s = ev.graphScore;
				if (typeof s === 'number' && (typeof ps !== 'number' || s > ps)) evByKind.set(ev.kind, ev);
			}
		}

		// Dedupe kinds and order by priority (first = primary source for assembly / coverage helpers).
		const sourceKinds = [...new Set(kindsAcc)].sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a]);
		const nUnique = sourceKinds.length;
		// More distinct discovery lines => small bonus for ranking (see HUB_SOURCE_CONSENSUS_* in constant).
		const sourceConsensusScore = Math.min(
			HUB_SOURCE_CONSENSUS_MAX,
			Math.max(0, (nUnique - 1) * HUB_SOURCE_CONSENSUS_PER_EXTRA),
		);
		const sourceEvidence = [...evByKind.values()].sort((x, y) => SOURCE_PRIORITY[y.kind] - SOURCE_PRIORITY[x.kind]);
		const mergedHints = mergeHubAssemblyHintsGroup(group);
		out.push({
			...base,
			sourceKinds,
			sourceEvidence,
			sourceConsensusScore,
			sourceKind: sourceKinds[0]!,
			rankingScore: computeHubRankingScore(base.graphScore, sourceConsensusScore),
			...(mergedHints ? { assemblyHints: mergedHints } : {}),
		});
	}
	return out.sort((a, b) => b.rankingScore - a.rankingScore);
}

// --- Multi-round selection ---

/** First two path segments as a coarse folder key (vault-relative). */
function pathPrefixForGap(path: string): string {
	const parts = path.split('/').filter(Boolean);
	if (parts.length === 0) return '(root)';
	if (parts.length === 1) return parts[0];
	return `${parts[0]}/${parts[1]}`;
}

/**
 * Builds a stable document ordinal index for bitset coverage via keyset pages (avoids one huge SQLite result set).
 */
export async function buildHubDiscoverDocCoverageIndex(tenant: IndexTenant): Promise<HubDiscoverDocCoverageIndex> {
	const repo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const ordinalByNodeId = new Map<string, number>();
	const nodeIdByOrdinal: string[] = [];
	const pathByOrdinal: (string | null)[] = [];
	let afterNodeId: string | null = null;
	let pageIdx = 0;
	for (; ;) {
		const rows = await repo.listDocumentNodeIdPathForCoverageIndexKeyset(afterNodeId, HUB_COVERAGE_INDEX_PAGE_SIZE);
		if (rows.length === 0) break;
		const base = nodeIdByOrdinal.length;
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i]!;
			const ord = base + i;
			ordinalByNodeId.set(r.node_id, ord);
			nodeIdByOrdinal.push(r.node_id);
			pathByOrdinal.push(r.path);
		}
		afterNodeId = rows[rows.length - 1]!.node_id;
		pageIdx++;
		if (pageIdx % 4 === 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	}
	return { docCount: nodeIdByOrdinal.length, ordinalByNodeId, nodeIdByOrdinal, pathByOrdinal };
}

/**
 * Merges candidate coverage into union bitset and updates incremental prefix stats (new bits only).
 */
function mergeCoverageBitsIntoUnion(
	candidateBits: Uint32Array,
	coveredBits: Uint32Array,
	coveredDocumentCount: { value: number },
	coveredPrefixCounts: Map<string, number>,
	pathByOrdinal: (string | null)[],
): void {
	const docWords = coveredBits.length;
	for (let wi = 0; wi < docWords; wi++) {
		const cand = candidateBits[wi] ?? 0;
		const prev = coveredBits[wi] ?? 0;
		const newMask = cand & ~prev;
		if (newMask === 0) continue;
		coveredBits[wi] = prev | cand;
		for (let bitIdx = 0; bitIdx < 32; bitIdx++) {
			if ((newMask & (1 << bitIdx)) === 0) continue;
			const globalOrd = wi * 32 + bitIdx;
			if (globalOrd >= pathByOrdinal.length) continue;
			coveredDocumentCount.value += 1;
			const p = pathByOrdinal[globalOrd] ?? '';
			if (p) {
				const prefix = pathPrefixForGap(p);
				coveredPrefixCounts.set(prefix, (coveredPrefixCounts.get(prefix) ?? 0) + 1);
			}
		}
	}
}

/**
 * Estimate document coverage as a bitset (same semantics as prior Set-based coverage, document ordinals only).
 */
export async function estimateCandidateCoverageBits(
	tenant: IndexTenant,
	c: HubCandidate,
	index: HubDiscoverDocCoverageIndex,
): Promise<Uint32Array> {
	const bits = createUint32Bitset(index.docCount);
	const hubSummaryFolder = getAIHubSummaryFolder();
	const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

	const setOrd = (nodeId: string) => {
		const o = index.ordinalByNodeId.get(nodeId);
		if (o !== undefined) setUint32Bit(bits, o);
	};

	if (c.sourceKind === 'manual' && (c.clusterMemberPaths?.length ?? 0) > 0) {
		const paths = c.clusterMemberPaths ?? [];
		for (const p of paths.slice(0, SLICE_CAPS.hub.discoverRoundPaths)) {
			const id = await nodeRepo.getDocumentNodeIdByVaultPath(p);
			if (id) setOrd(id);
		}
		setOrd(c.nodeId);
		return bits;
	}

	if (c.sourceKind === 'cluster') {
		const paths = c.clusterMemberPaths ?? [];
		if (paths.length === 0) {
			setOrd(c.nodeId);
			return bits;
		}
		for (const p of paths.slice(0, SLICE_CAPS.hub.discoverRoundPaths)) {
			const id = await nodeRepo.getDocumentNodeIdByVaultPath(p);
			if (id) setOrd(id);
		}
		setOrd(c.nodeId);
		return bits;
	}

	if (c.sourceKind === 'folder') {
		setOrd(c.nodeId);
		const prefix = c.path.endsWith('/') ? c.path : `${c.path}/`;
		const rows = await nodeRepo.listDocumentNodeIdPathByPathPrefix(prefix, 2000);
		for (const r of rows) {
			const p = r.path ?? '';
			if (hubSummaryFolder && p && isVaultPathUnderPrefix(p, hubSummaryFolder)) continue;
			setOrd(r.node_id);
		}
		return bits;
	}

	setOrd(c.nodeId);
	const refRows = await edgeRepo.listReferenceEdgesIncidentToNode(c.nodeId, 500);
	for (const e of refRows) {
		const other = e.from_node_id === c.nodeId ? e.to_node_id : e.from_node_id;
		setOrd(other);
	}
	return bits;
}

/**
 * After greedy pass + cluster reserve, add hubs that maximize marginal document coverage until
 * {@link HUB_DISCOVER_COVERAGE_FILL_TARGET_RATIO} or picks fall below the minimum gain threshold.
 */
async function applyHubDiscoverCoverageFillPass(options: {
	rankedPool: HubCandidate[];
	selected: HubCandidate[];
	selectedStableKeys: Set<string>;
	coveredBits: Uint32Array;
	coveredDocumentCount: { value: number };
	coveredPrefixCounts: Map<string, number>;
	docCoverageIndex: HubDiscoverDocCoverageIndex;
	limitTotal: number;
	maxFolderSlots: number;
	maxDocumentSlots: number;
	getCoverageBits: (candidate: HubCandidate) => Promise<Uint32Array>;
}): Promise<void> {
	const docTotal = options.docCoverageIndex.docCount;
	if (docTotal <= 0) return;

	let folderSelectedCount = options.selected.filter((c) => c.sourceKind === 'folder').length;
	let documentSelectedCount = options.selected.filter((c) => c.sourceKind === 'document').length;

	const maxFolderSlotsFill = Math.min(
		options.limitTotal,
		options.maxFolderSlots + HUB_DISCOVER_FOLDER_FILL_EXTRA_SLOTS,
	);
	const maxDocumentSlotsFill = Math.min(
		options.limitTotal,
		options.maxDocumentSlots + HUB_DISCOVER_DOCUMENT_FILL_EXTRA_SLOTS,
	);

	const {
		rankedPool,
		selected,
		selectedStableKeys,
		coveredBits,
		coveredDocumentCount,
		coveredPrefixCounts,
		docCoverageIndex,
		limitTotal,
		getCoverageBits,
	} = options;

	const minNewDocsPerPick = Math.max(
		HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOCS,
		Math.ceil(HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOC_RATIO * docTotal),
	);

	while (selected.length < limitTotal) {
		const ratio = coveredDocumentCount.value / docTotal;
		if (ratio >= HUB_DISCOVER_COVERAGE_FILL_TARGET_RATIO) break;

		let best: HubCandidate | null = null;
		let bestCov: Uint32Array | null = null;
		let bestNewDocs = 0;
		let bestFillScore = -1;

		for (const candidate of rankedPool) {
			if (selectedStableKeys.has(candidate.stableKey)) continue;

			if (candidate.sourceKind === 'folder' && folderSelectedCount >= maxFolderSlotsFill) continue;
			if (candidate.sourceKind === 'document' && documentSelectedCount >= maxDocumentSlotsFill) continue;

			const cov = await getCoverageBits(candidate);
			const newDocs = countBitsNewSince(cov, coveredBits);
			if (newDocs === 0) continue;

			const fp = candidate.path ?? '';
			if (candidate.sourceKind === 'folder') {
				const nestedConflict = selected.some(
					(s) => s.sourceKind === 'folder' && fp && s.path && vaultFolderPathsNest(fp, s.path),
				);
				if (nestedConflict && newDocs < HUB_DISCOVER_COVERAGE_FILL_MIN_NESTED_FOLDER_NEW_DOCS) continue;
			}

			if (
				candidate.sourceKind === 'cluster' &&
				clusterGreedyConflictsWithSelected(candidate, selected) &&
				newDocs < HUB_DISCOVER_COVERAGE_FILL_MIN_CLUSTER_NEW_DOCS_WHEN_CONFLICT
			) {
				continue;
			}

			const uniqueRatio = newDocs / docTotal;
			const fillScore = 0.8 * uniqueRatio + 0.15 * candidate.rankingScore;

			const prevRank = best?.rankingScore ?? -1;
			const tieBreakRank = candidate.rankingScore;
			const better =
				fillScore > bestFillScore ||
				(fillScore === bestFillScore && newDocs > bestNewDocs) ||
				(fillScore === bestFillScore && newDocs === bestNewDocs && tieBreakRank > prevRank);

			if (better) {
				best = candidate;
				bestCov = cov;
				bestNewDocs = newDocs;
				bestFillScore = fillScore;
			}
		}

		if (!best || !bestCov) break;
		if (bestNewDocs < minNewDocsPerPick) break;

		selected.push(best);
		selectedStableKeys.add(best.stableKey);
		if (best.sourceKind === 'folder') folderSelectedCount++;
		if (best.sourceKind === 'document') documentSelectedCount++;
		mergeCoverageBitsIntoUnion(
			bestCov,
			coveredBits,
			coveredDocumentCount,
			coveredPrefixCounts,
			docCoverageIndex.pathByOrdinal,
		);
	}
}

/**
 * Choose which hub candidates from the merged pool become the final hub set (up to `limitTotal`).
 *
 * **Why:** Discovery returns many overlapping candidates (folder, document, cluster, manual). Taking only
 * top `rankingScore` would duplicate the same neighborhood. We approximate each candidate’s document
 * coverage (`estimateCandidateCoverageBits`) and greedily add hubs that either score high enough to keep
 * anyway, or add enough *new* coverage beyond the union of already-selected hubs.
 *
 * **Flow:** (1) Re-apply `seedSelected` so later rounds do not drop hubs accepted earlier. (2) Scan the
 * pool by descending `rankingScore`, skip duplicates, and apply {@link HUB_DISCOVER_GREEDY_SELECTION}
 * so early picks stay permissive and later picks must justify themselves. (3) Emit stop hints for the
 * outer multi-round loop (`continueDiscovery`, round context for LLM review).
 */
async function selectHubCandidatesMultiRound(options: {
	tenant: IndexTenant;
	candidatePool: HubCandidate[];
	limitTotal: number;
	hubDiscoverSettings: HubDiscoverSettings;
	docCoverageIndex: HubDiscoverDocCoverageIndex;
	/** Pinned hubs from prior agent rounds; greedy pass only adds until `limitTotal`. */
	seedSelected?: HubCandidate[];
	/** Outer agent loop index (stored on {@link HubDiscoverRoundContext}). */
	roundIndex?: number;
}): Promise<{ selected: HubCandidate[]; stopDecision: HubDiscoverStopDecision; roundContext: HubDiscoverRoundContext }> {
	const { candidatePool, limitTotal, tenant, hubDiscoverSettings, seedSelected = [], docCoverageIndex } = options;

	const coverageBitCache = new Map<string, Uint32Array>();
	const coveredBits = createUint32Bitset(docCoverageIndex.docCount);
	const coveredDocumentCount = { value: 0 };
	const coveredPrefixCounts = new Map<string, number>();
	async function getCoverageBits(candidate: HubCandidate): Promise<Uint32Array> {
		const k = candidate.stableKey;
		let s = coverageBitCache.get(k);
		if (!s) {
			s = await estimateCandidateCoverageBits(tenant, candidate, docCoverageIndex);
			coverageBitCache.set(k, s);
		}
		return s;
	}

	// 1. Re-apply previously selected hubs (stability across rounds).
	const selected: HubCandidate[] = [];
	const selectedStableKeys = new Set<string>();
	// const seededCandidates = options.seedSelected ?? [];
	for (const candidate of seedSelected) {
		if (selected.length >= limitTotal) break;
		if (selectedStableKeys.has(candidate.stableKey)) continue;
		const coverage = await getCoverageBits(candidate);
		selected.push(candidate);
		selectedStableKeys.add(candidate.stableKey);
		mergeCoverageBitsIntoUnion(
			coverage,
			coveredBits,
			coveredDocumentCount,
			coveredPrefixCounts,
			docCoverageIndex.pathByOrdinal,
		);
	}

	// 2. Greedy pass: strong score or useful marginal coverage, with stricter rules after early fill.
	const rankedPool = [...candidatePool].sort((a, b) => b.rankingScore - a.rankingScore);
	let folderSelectedCount = selected.filter((c) => c.sourceKind === 'folder').length;
	let documentSelectedCount = selected.filter((c) => c.sourceKind === 'document').length;
	const maxFolderSlots = Math.min(
		HUB_DISCOVER_FOLDER_MAX_SELECTED_ABS,
		Math.max(2, Math.floor(limitTotal * HUB_DISCOVER_FOLDER_MAX_SELECTED_FRACTION)),
	);
	const maxDocumentSlots = Math.min(
		HUB_DISCOVER_DOCUMENT_MAX_SELECTED_ABS,
		Math.max(
			HUB_DISCOVER_DOCUMENT_MAX_SELECTED_MIN,
			Math.floor(limitTotal * HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION),
		),
	);
	for (const candidate of rankedPool) {
		if (selected.length >= limitTotal) break;
		if (selectedStableKeys.has(candidate.stableKey)) continue;

		if (candidate.sourceKind === 'document') {
			if (documentSelectedCount >= maxDocumentSlots) continue;
		}
		if (candidate.sourceKind === 'folder') {
			if (folderSelectedCount >= maxFolderSlots) continue;
			const fp = candidate.path ?? '';
			if (
				selected.some(
					(s) => s.sourceKind === 'folder' && fp && s.path && vaultFolderPathsNest(fp, s.path),
				)
			) {
				continue;
			}
		}
		if (clusterGreedyConflictsWithSelected(candidate, selected)) continue;

		const coverage = await getCoverageBits(candidate);
		const marginalGain = fractionOfBitsNewSince(coverage, coveredBits);

		const isEarlyFillSlot = selected.length < HUB_DISCOVER_GREEDY_SELECTION.earlyFillSlots;
		const strongThreshold =
			candidate.sourceKind === 'cluster'
				? HUB_DISCOVER_GREEDY_SELECTION.clusterStrongHubScore
				: HUB_DISCOVER_GREEDY_SELECTION.strongHubScore;
		const isStrongHub = candidate.rankingScore >= strongThreshold;
		const hasUsefulCoverageGain =
			marginalGain >= hubDiscoverSettings.minCoverageGain * HUB_DISCOVER_GREEDY_SELECTION.usefulGainFactor;

		const shouldSkip =
			!isEarlyFillSlot &&
			selected.length >= HUB_DISCOVER_GREEDY_SELECTION.strictFilterStartCount &&
			!isStrongHub &&
			!hasUsefulCoverageGain;

		if (shouldSkip) continue;

		selected.push(candidate);
		selectedStableKeys.add(candidate.stableKey);
		if (candidate.sourceKind === 'folder') folderSelectedCount++;
		if (candidate.sourceKind === 'document') documentSelectedCount++;
		mergeCoverageBitsIntoUnion(
			coverage,
			coveredBits,
			coveredDocumentCount,
			coveredPrefixCounts,
			docCoverageIndex.pathByOrdinal,
		);
	}

	const clusterCountInSelection = () => selected.filter((c) => c.sourceKind === 'cluster').length;
	const reserveMax = Math.min(
		HUB_DISCOVER_CLUSTER_RESERVE_MAX,
		Math.max(HUB_DISCOVER_CLUSTER_RESERVE_MIN, Math.floor(limitTotal * 0.2)),
	);

	const clusterCandidates = rankedPool
		.filter((c) => c.sourceKind === 'cluster' && !selectedStableKeys.has(c.stableKey))
		.sort((a, b) => b.rankingScore - a.rankingScore);
	let poolClusters = clusterCandidates.filter((c) => c.graphScore >= HUB_DISCOVER_CLUSTER_RESERVE_MIN_GRAPH_SCORE);
	// Prefer quality floor; if every emitted cluster scores below it, still allow reserve by rank.
	if (poolClusters.length === 0 && clusterCandidates.length > 0) {
		poolClusters = clusterCandidates;
	}
	const poolClustersBeforeDiversity = poolClusters;
	poolClusters = filterClusterCandidatesForReserveDiversity(
		poolClusters,
		HUB_DISCOVER_CLUSTER_RESERVE_MAX_PER_THEME,
		HUB_DISCOVER_CLUSTER_RESERVE_MAX_MEMBER_JACCARD,
	);
	if (poolClusters.length === 0 && poolClustersBeforeDiversity.length > 0) {
		poolClusters = poolClustersBeforeDiversity;
	}

	/** Rebuild union bitset after swapping candidates (small N). */
	async function reapplyUnionCoverage(list: HubCandidate[]): Promise<void> {
		for (let wi = 0; wi < coveredBits.length; wi++) coveredBits[wi] = 0;
		coveredDocumentCount.value = 0;
		coveredPrefixCounts.clear();
		for (const c of list) {
			const cov = await getCoverageBits(c);
			mergeCoverageBitsIntoUnion(
				cov,
				coveredBits,
				coveredDocumentCount,
				coveredPrefixCounts,
				docCoverageIndex.pathByOrdinal,
			);
		}
	}

	for (const cl of poolClusters) {
		if (clusterCountInSelection() >= reserveMax) break;
		if (selectedStableKeys.has(cl.stableKey)) continue;
		if (selected.length < limitTotal) {
			const cov = await getCoverageBits(cl);
			selected.push(cl);
			selectedStableKeys.add(cl.stableKey);
			mergeCoverageBitsIntoUnion(
				cov,
				coveredBits,
				coveredDocumentCount,
				coveredPrefixCounts,
				docCoverageIndex.pathByOrdinal,
			);
			continue;
		}
		if (clusterCountInSelection() >= reserveMax) break;
		const victim = [...selected]
			.filter((c) => c.sourceKind !== 'manual' && c.sourceKind !== 'cluster')
			.sort((a, b) => a.rankingScore - b.rankingScore)[0];
		if (!victim || cl.rankingScore <= victim.rankingScore) continue;
		const idx = selected.indexOf(victim);
		selected[idx] = cl;
		selectedStableKeys.delete(victim.stableKey);
		selectedStableKeys.add(cl.stableKey);
		await reapplyUnionCoverage(selected);
	}

	while (clusterCountInSelection() < HUB_DISCOVER_CLUSTER_RESERVE_MIN && selected.length > 0) {
		const nextCluster = poolClusters.find((c) => !selectedStableKeys.has(c.stableKey));
		if (!nextCluster) break;
		const victim = [...selected]
			.filter((c) => c.sourceKind !== 'manual' && c.sourceKind !== 'cluster')
			.sort((a, b) => a.rankingScore - b.rankingScore)[0];
		if (!victim || nextCluster.rankingScore <= victim.rankingScore) break;
		const idx = selected.indexOf(victim);
		selected[idx] = nextCluster;
		selectedStableKeys.delete(victim.stableKey);
		selectedStableKeys.add(nextCluster.stableKey);
		await reapplyUnionCoverage(selected);
	}

	await applyHubDiscoverCoverageFillPass({
		rankedPool,
		selected,
		selectedStableKeys,
		coveredBits,
		coveredDocumentCount,
		coveredPrefixCounts,
		docCoverageIndex,
		limitTotal,
		maxFolderSlots,
		maxDocumentSlots,
		getCoverageBits,
	});

	// 3. Stop signal: coarse remaining mass over unselected candidates (not true uncovered coverage).
	let sum = 0;
	for (const c of rankedPool) {
		if (selectedStableKeys.has(c.stableKey)) continue;
		sum += c.rankingScore * HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT;
	}
	const remainingCandidateScore = Math.min(1, sum);
	// Ratio of pool stableKeys not yet selected (reuse marginalCoverageGain on id-like sets).
	const remainingUnselectedKeyRatio = marginalCoverageGain(
		new Set(rankedPool.map((p) => p.stableKey)),
		selectedStableKeys,
	);

	const stopDecision: HubDiscoverStopDecision = {
		continueDiscovery:
			remainingCandidateScore > hubDiscoverSettings.minCoverageGain * 2 && selected.length < limitTotal,
		reason:
			selected.length >= limitTotal
				? 'limit_reached'
				: remainingCandidateScore <= hubDiscoverSettings.minCoverageGain
					? 'low_remaining_potential'
					: 'pool_exhausted',
		remainingPotentialScore: remainingCandidateScore,
		coverageGainEstimate: remainingUnselectedKeyRatio,
	};

	const roundContext: HubDiscoverRoundContext = {
		roundIndex: Math.max(1, options.roundIndex ?? 1),
		maxRounds: hubDiscoverSettings.maxRounds,
		selectedStableKeys,
		coveredDocumentBits: coveredBits,
		docCoverageIndex,
		coverageBitCache,
		remainingPotentialScore: remainingCandidateScore,
		coveredDocumentCount: coveredDocumentCount.value,
		coveredPrefixCounts,
	};

	return { selected, stopDecision, roundContext };
}

// --- Round summary (deterministic metrics for LLM review) ---

function countByKey<T extends string>(items: T[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const k of items) {
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

/**
 * Build a deterministic round report for hub discovery (JSON-safe for LLM / UI).
 *
 * Does not change selection; it explains what was chosen this round:
 * - **Vault coverage:** document count from incremental `roundContext.coveredDocumentCount` / `coveredPrefixCounts` (same union as selection).
 * - **Per-hub cards:** identity, scores, and coverage size (reuses selection `coverageBitCache` when present).
 * - **Gaps:** coarse folder buckets where documents are still uncovered (for next-round hints).
 * - **Overlap:** pairwise overlap between selected hubs’ coverage sets (redundancy signal).
 * - **Echo stop fields:** copies `stopDecision` into the summary for one payload.
 */
async function buildHubDiscoverRoundSummary(options: {
	tenant: IndexTenant;
	documentCount: number;
	mergedPoolSize: number;
	limitTotal: number;
	selected: HubCandidate[];
	stopDecision: HubDiscoverStopDecision;
	roundContext: HubDiscoverRoundContext;
	remainingSlots?: number;
	newlyAddedThisRound?: number;
	clusterDiscovery?: HubClusterDiscoveryStats;
}): Promise<HubDiscoverRoundSummary> {
	const { tenant, documentCount, mergedPoolSize, limitTotal, selected, stopDecision, roundContext } = options;

	const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const idx = roundContext.docCoverageIndex;
	const cache = roundContext.coverageBitCache;
	const isDocumentCovered = (nodeId: string) => {
		const o = idx.ordinalByNodeId.get(nodeId);
		return o !== undefined && hasUint32Bit(roundContext.coveredDocumentBits, o);
	};

	// --- Vault-wide coverage ratio (document nodes only; incremental counts from selection pass) ---
	const coveredDocumentCount = roundContext.coveredDocumentCount;
	const uncoveredDocumentCount = Math.max(0, documentCount - coveredDocumentCount);
	const coverageRatio = documentCount > 0 ? coveredDocumentCount / documentCount : 0;

	// --- Per selected hub: card row + coverage set (sets reused below for overlap pairs) ---
	const hubCards: HubDiscoverRoundSummaryHubCard[] = [];
	const covByKey = new Map<string, Uint32Array>();
	for (const c of selected) {
		let cov = cache.get(c.stableKey);
		if (!cov) {
			cov = await estimateCandidateCoverageBits(tenant, c, idx);
			cache.set(c.stableKey, cov);
		}
		covByKey.set(c.stableKey, cov);
		hubCards.push({
			stableKey: c.stableKey,
			path: c.path,
			label: c.label,
			sourceKind: c.sourceKind,
			sourceKinds: [...c.sourceKinds],
			sourceConsensusScore: c.sourceConsensusScore,
			rankingScore: c.rankingScore,
			role: c.role,
			graphScore: c.graphScore,
			coverageSize: countBitsUint32(cov),
			docIncomingCnt: c.docIncomingCnt,
			docOutgoingCnt: c.docOutgoingCnt,
			pagerank: c.pagerank ?? null,
			semanticPagerank: c.semanticPagerank ?? null,
		});
	}

	// --- Where coverage is missing: vault prefix totals minus incremental covered counts, then sample paths ---
	const vaultPrefixTotals = await nodeRepo.listDocumentGapPrefixCounts();
	const coveredPrefix = roundContext.coveredPrefixCounts;
	const sortedGapCandidates = vaultPrefixTotals
		.filter((row) => isValidGapPathPrefix(row.pathPrefix))
		.map((row) => ({
			pathPrefix: row.pathPrefix,
			uncoveredDocumentCount: row.documentCount - (coveredPrefix.get(row.pathPrefix) ?? 0),
		}))
		.filter((g) => g.uncoveredDocumentCount > 0)
		.sort((a, b) => b.uncoveredDocumentCount - a.uncoveredDocumentCount)
		.slice(0, 12);
	const topUncoveredFolders: HubDiscoverCoverageGap[] = await Promise.all(
		sortedGapCandidates.map(async (g) => ({
			pathPrefix: g.pathPrefix,
			uncoveredDocumentCount: g.uncoveredDocumentCount,
			examplePaths: await nodeRepo.listSampleUncoveredPathsForGapPrefix(g.pathPrefix, isDocumentCovered, 5),
		})),
	);

	// --- Pairwise redundancy: O(n^2) over selected hubs; only pairs with shared nodes are recorded, then top by ratio ---
	const keys = selected.map((c) => c.stableKey);
	const topOverlapPairs: HubDiscoverOverlapPair[] = [];
	for (let i = 0; i < keys.length; i++) {
		const sa = covByKey.get(keys[i])!;
		for (let j = i + 1; j < keys.length; j++) {
			const sb = covByKey.get(keys[j])!;
			let shared = 0;
			const nw = Math.max(sa.length, sb.length);
			for (let wi = 0; wi < nw; wi++) {
				shared += popcountUint32((sa[wi] ?? 0) & (sb[wi] ?? 0));
			}
			const ratio = overlapRatioMinUint32(sa, sb);
			if (shared > 0) {
				topOverlapPairs.push({
					stableKeyA: selected[i].stableKey,
					stableKeyB: selected[j].stableKey,
					overlapRatio: ratio,
					sharedNodeCount: shared,
				});
			}
		}
	}
	topOverlapPairs.sort((a, b) => b.overlapRatio - a.overlapRatio);
	const topOverlapTrimmed = topOverlapPairs.slice(0, 12);

	// Aggregate counts for LLM: how many hubs per source kind / blended kinds / role.
	return {
		documentCount,
		mergedPoolSize,
		limitTotal,
		roundIndex: roundContext.roundIndex,
		maxRounds: roundContext.maxRounds,
		remainingSlots: options.remainingSlots,
		newlyAddedThisRound: options.newlyAddedThisRound,
		selectedHubCount: selected.length,
		selectedBySourceKind: countByKey(selected.map((c) => c.sourceKind)),
		selectedBySourceBlend: countByKey(
			selected.map((c) =>
				[...new Set(c.sourceKinds)]
					.sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a])
					.join('+'),
			),
		),
		selectedByRole: countByKey(selected.map((c) => c.role)),
		coveredDocumentCount,
		uncoveredDocumentCount,
		coverageRatio,
		remainingPotentialScore: stopDecision.remainingPotentialScore,
		coverageGainEstimate: stopDecision.coverageGainEstimate,
		deterministicContinueDiscovery: stopDecision.continueDiscovery,
		deterministicStopReason: stopDecision.reason,
		hubCards,
		topUncoveredFolders,
		topOverlapPairs: topOverlapTrimmed,
		...(options.clusterDiscovery ? { clusterDiscovery: options.clusterDiscovery } : {}),
	};
}

// --- Discovery service ---

/**
 * Lists vault-relative `.md` paths under a folder (recursive).
 */
export function listMarkdownPathsUnderFolder(folderPath: string): string[] {
	const app = AppContext.getApp();
	const normalized = normalizePath(folderPath.trim());
	if (!normalized) return [];
	const abs = app.vault.getAbstractFileByPath(normalized);
	if (!abs || !(abs instanceof TFolder)) return [];
	const out: string[] = [];
	const walk = (f: TAbstractFile) => {
		if (f instanceof TFile && f.extension === 'md') out.push(f.path);
		else if (f instanceof TFolder) for (const ch of f.children) walk(ch);
	};
	walk(abs);
	return out.sort();
}

/** Doc + ref boundary degree on a folder hub discovery row. */
function folderHubRowBoundaryDegree(r: MobiusNodeFolderHubDiscoveryRow): number {
	return (
		Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))) +
		Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)))
	);
}

/**
 * Whether the child qualifies as a strong topic hub vs the parent (legacy "child win" thresholds).
 */
function isStrongTopicChild(
	parent: MobiusNodeFolderHubDiscoveryRow,
	child: MobiusNodeFolderHubDiscoveryRow,
): boolean {
	const pd = Math.max(1, Number(parent.tag_doc_count ?? 0));
	const cd = Math.max(0, Number(child.tag_doc_count ?? 0));
	const ps = Number(parent.hub_graph_score ?? 0);
	const cs = Number(child.hub_graph_score ?? 0);
	const pc = Number(parent.hub_cohesion_effective_score ?? 0);
	const cc = Number(child.hub_cohesion_effective_score ?? 0);
	const pb = folderHubRowBoundaryDegree(parent);
	const cb = folderHubRowBoundaryDegree(child);
	const ratio = cd / pd;

	if (cs >= ps + FOLDER_HUB_DISCOVER_NEST_SCORE_CHILD_WIN) return true;
	if (cc >= pc + FOLDER_HUB_DISCOVER_NEST_COHESION_CHILD_WIN && cd >= FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_STRONG) {
		return true;
	}
	if (
		cd >= FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_LARGE &&
		ratio >= FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_RATIO &&
		cs >= ps - FOLDER_HUB_DISCOVER_NEST_SCORE_NEAR
	) {
		return true;
	}

	if (
		cd <= FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_DOCS &&
		ratio <= FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_RATIO &&
		cs <= ps + FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_SCORE_EPS
	) {
		return false;
	}
	if (cs <= ps + FOLDER_HUB_DISCOVER_NEST_SCORE_NEAR && cc <= pc + FOLDER_HUB_DISCOVER_NEST_COHESION_NEAR) {
		return false;
	}
	if (
		cd <= FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_MAX_DOCS &&
		cb <= pb * FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_BOUNDARY_RATIO &&
		cs <= ps + FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_SCORE_EPS
	) {
		return false;
	}

	return false;
}

/** Direct-child index: parent path → set of child folder paths (from the same candidate pool). */
function buildParentToDirectChildrenMap(
	rows: MobiusNodeFolderHubDiscoveryRow[],
): Map<string, Set<string>> {
	const m = new Map<string, Set<string>>();
	for (const r of rows) {
		const p = normalizeVaultPath(String(r.path ?? ''));
		const par = parentDirPath(p);
		if (!par) continue;
		if (!m.has(par)) m.set(par, new Set());
		m.get(par)!.add(p);
	}
	return m;
}

export type FolderHubNestRelation = 'parent_only' | 'both' | 'child_only';

/**
 * Resolves immediate parent/child: drop weak child, keep both when parent is structural, or drop hollow parent only when child dominates.
 */
export function nestFolderHubRelation(
	parent: MobiusNodeFolderHubDiscoveryRow,
	child: MobiusNodeFolderHubDiscoveryRow,
	parentToDirectChildren: Map<string, Set<string>>,
): FolderHubNestRelation {
	const pp = normalizeVaultPath(String(parent.path ?? ''));
	const cp = normalizeVaultPath(String(child.path ?? ''));
	if (!pp || !cp || parentDirPath(cp) !== pp) return 'both';

	const pd = Math.max(1, Number(parent.tag_doc_count ?? 0));
	const cd = Math.max(0, Number(child.tag_doc_count ?? 0));
	const residualDocs = Math.max(0, pd - cd);
	const residualRatio = residualDocs / pd;
	const sib = parentToDirectChildren.get(pp);
	const siblingCount = Math.max(0, (sib?.size ?? 0) - 1);

	const structural =
		residualDocs >= FOLDER_HUB_NEST_PARENT_RESIDUAL_MIN_DOCS ||
		residualRatio >= FOLDER_HUB_NEST_PARENT_RESIDUAL_RATIO ||
		siblingCount >= 1;

	const shell =
		residualDocs <= FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_DOCS &&
		residualRatio <= FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_RATIO &&
		siblingCount === 0;

	if (!isStrongTopicChild(parent, child)) return 'parent_only';
	if (structural) return 'both';
	if (shell) {
		const ps = Number(parent.hub_graph_score ?? 0);
		const cs = Number(child.hub_graph_score ?? 0);
		if (cs >= ps + FOLDER_HUB_DISCOVER_NEST_SCORE_CHILD_WIN) return 'child_only';
	}
	return 'both';
}

/**
 * Resolves nested folder paths: structural parents and strong children can coexist; only hollow parents drop for a dominant child.
 */
export function compressNestedFolderHubDiscoveryRows(
	rows: MobiusNodeFolderHubDiscoveryRow[],
): MobiusNodeFolderHubDiscoveryRow[] {
	if (rows.length === 0) return [];
	const byPath = new Map<string, MobiusNodeFolderHubDiscoveryRow>();
	for (const r of rows) {
		const p = normalizeVaultPath(String(r.path ?? ''));
		if (p) byPath.set(p, r);
	}
	const parentToDirectChildren = buildParentToDirectChildrenMap(rows);
	let active = new Set(byPath.keys());
	let changed = true;
	while (changed) {
		changed = false;
		for (const childPath of [...active]) {
			const par = parentDirPath(childPath);
			if (!par || !active.has(par)) continue;
			const parent = byPath.get(par);
			const child = byPath.get(childPath);
			if (!parent || !child) continue;
			const rel = nestFolderHubRelation(parent, child, parentToDirectChildren);
			if (rel === 'parent_only' && active.has(childPath)) {
				active.delete(childPath);
				changed = true;
			} else if (rel === 'child_only' && active.has(par)) {
				active.delete(par);
				changed = true;
			}
		}
	}
	const out = [...active].map((p) => byPath.get(p)!);
	out.sort((a, b) => Number(b.hub_graph_score ?? 0) - Number(a.hub_graph_score ?? 0));
	return out;
}

/** First path segment after normalize (vault "top root" for quota), or empty. */
function folderHubTopRootKey(vaultPath: string): string {
	const segs = pathSegments(vaultPath);
	return segs[0] ?? '';
}

/**
 * Soft penalty for structurally broad folders: uses only tag counts and hub_* scores (no path/name lists).
 */
export function folderHubStructuralBroadnessPenalty(r: MobiusNodeFolderHubDiscoveryRow): number {
	const docs = Math.max(0, Number(r.tag_doc_count ?? 0));
	const coh = Math.max(0, Math.min(1, Number(r.hub_cohesion_effective_score ?? 0)));
	const org = Math.max(0, Math.min(1, Number(r.hub_organizational_score ?? 0)));
	const sem = Math.max(0, Math.min(1, Number(r.hub_semantic_centrality_score ?? 0)));
	let p = 0;
	if (docs >= FOLDER_HUB_BROAD_MIN_TAG_DOCS && coh <= FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION) {
		const docExcess = Math.min(1, (docs - FOLDER_HUB_BROAD_MIN_TAG_DOCS) / 220);
		const cohGap = Math.min(
			1,
			(FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION - coh) / FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION,
		);
		p = Math.max(p, FOLDER_HUB_BROAD_PENALTY_BASE + FOLDER_HUB_BROAD_PENALTY_DOC_SCALE * docExcess * cohGap);
	}
	if (
		org >= FOLDER_HUB_BROAD_ORG_MIN &&
		sem <= FOLDER_HUB_BROAD_SEM_MAX &&
		coh <= FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION + 0.04
	) {
		const mismatch = Math.min(1, Math.max(0, org - sem) * 1.15);
		p = Math.max(p, FOLDER_HUB_BROAD_MISMATCH_PENALTY * mismatch);
	}
	return Math.min(FOLDER_HUB_BROAD_PENALTY_MAX, p);
}

/** `hub_graph_score` minus {@link folderHubStructuralBroadnessPenalty} (floored at 0). */
export function folderHubAdjustedGraphScore(r: MobiusNodeFolderHubDiscoveryRow): number {
	const gs = Number(r.hub_graph_score ?? 0);
	return Math.max(0, gs - folderHubStructuralBroadnessPenalty(r));
}

/**
 * Picks up to `limit` folder rows: sort by adjusted score, enforce per top-root cap, then fill remainder by score.
 */
export function selectFolderHubDiscoveryRowsWithTopRootQuota(
	rows: MobiusNodeFolderHubDiscoveryRow[],
	limit: number,
): MobiusNodeFolderHubDiscoveryRow[] {
	const lim = Math.max(1, limit);
	if (rows.length === 0) return [];
	const sorted = [...rows].sort((a, b) => folderHubAdjustedGraphScore(b) - folderHubAdjustedGraphScore(a));
	const maxPerRoot = Math.max(1, Math.ceil(lim * FOLDER_HUB_TOP_ROOT_MAX_FRACTION));
	const picked: MobiusNodeFolderHubDiscoveryRow[] = [];
	const countByRoot = new Map<string, number>();
	const usedPath = new Set<string>();

	for (const row of sorted) {
		if (picked.length >= lim) break;
		const p = String(row.path ?? '');
		if (!p || usedPath.has(p)) continue;
		const key = folderHubTopRootKey(p);
		const c = countByRoot.get(key) ?? 0;
		if (c >= maxPerRoot) continue;
		picked.push(row);
		usedPath.add(p);
		countByRoot.set(key, c + 1);
	}

	if (picked.length < lim) {
		for (const row of sorted) {
			if (picked.length >= lim) break;
			const p = String(row.path ?? '');
			if (!p || usedPath.has(p)) continue;
			picked.push(row);
			usedPath.add(p);
		}
	}

	return picked;
}

/**
 * Loads and ranks hub candidates from graph signals and user-authored notes under `Hub-Summaries/Manual/`.
 */
export class HubCandidateDiscoveryService {
	private inferRole(incoming: number, outgoing: number): HubRole {
		if (incoming >= 5 && outgoing >= 5) return 'bridge';
		if (outgoing > incoming * 1.2 && outgoing >= 4) return 'index';
		if (incoming > outgoing * 1.2 && incoming >= 4) return 'authority';
		if (incoming + outgoing >= 6) return 'folder_anchor';
		return 'authority';
	}

	/**
	 * Role for document hub candidates only. Never `folder_anchor` (reserved for folder hubs).
	 */
	private inferDocumentHubRole(incoming: number, outgoing: number): HubRole {
		if (incoming >= 5 && outgoing >= 5) return 'bridge';
		if (outgoing > incoming * 1.2 && outgoing >= 4) return 'index';
		if (incoming > outgoing * 1.2 && incoming >= 4) return 'authority';
		if (incoming + outgoing >= 6) return 'index';
		return 'authority';
	}

	/** Must stay aligned with {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery} SQL scoring. */
	private scoreDocumentRow(
		r: MobiusNodeRow,
	): { graphScore: number; candidateScore: HubCandidateScore; role: HubRole } {
		const inc = r.doc_incoming_cnt ?? 0;
		const out = r.doc_outgoing_cnt ?? 0;
		const pr = typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0;
		const spr =
			typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
				? r.semantic_pagerank
				: 0;
		const wc = typeof r.word_count === 'number' && Number.isFinite(r.word_count) ? r.word_count : 0;
		const longDocWeak = Math.min(0.08, (wc / 50_000) * 0.08);

		const physicalAuthorityScore = Math.min(1, pr * 2.5 + longDocWeak);
		const organizationalScore = Math.min(
			1,
			inc * DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.incoming + out * DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.outgoing,
		);
		const semanticCentralityScore = Math.min(1, spr * 1.2);
		const manualBoost = 0;
		const graphScore = Math.min(
			1,
			physicalAuthorityScore * 0.35 + organizationalScore * 0.25 + semanticCentralityScore * 0.35 + manualBoost * 0.05,
		);
		const role = this.inferDocumentHubRole(inc, out);
		return {
			graphScore,
			candidateScore: {
				physicalAuthorityScore,
				organizationalScore,
				semanticCentralityScore,
				manualBoost,
			},
			role,
		};
	}

	/**
	 * Sort key for document hub candidates: higher graph score, then incoming degree, shorter path, stable id.
	 */
	private compareDocumentHubCandidatesTieBreak(a: HubCandidate, b: HubCandidate): number {
		const d = (b.graphScore ?? 0) - (a.graphScore ?? 0);
		if (d !== 0) return d;
		const di = (b.docIncomingCnt ?? 0) - (a.docIncomingCnt ?? 0);
		if (di !== 0) return di;
		const lp = (a.path?.length ?? 0) - (b.path?.length ?? 0);
		if (lp !== 0) return lp;
		return a.nodeId.localeCompare(b.nodeId);
	}

	/**
	 * If a candidate parent wiki-links to two or more weak index children in the same folder, remove the children
	 * and bump the parent score slightly. Parent must already be in the pool (no SQL inject).
	 */
	private async applyDocumentHubParentSuppressWeakIndexChildren(options: {
		tenant: IndexTenant;
		candidates: HubCandidate[];
		prefixes: string[];
	}): Promise<HubCandidate[]> {
		const { tenant, candidates, prefixes } = options;
		const candById = new Map(candidates.map((c) => [c.nodeId, c] as const));
		const childLike = candidates.filter(
			(c) =>
				c.sourceKind === 'document' &&
				c.role === 'index' &&
				(c.docIncomingCnt ?? 0) <= 2,
		);
		if (childLike.length < 2) return candidates;

		const childLikeSet = new Set(childLike.map((c) => c.nodeId));
		const ids = [...candById.keys()];
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const wikiTypes = [...GRAPH_WIKI_REFERENCE_EDGE_TYPES];
		const parentToChildren = new Map<string, Set<string>>();
		const chunkSize = 200;
		for (let i = 0; i < ids.length; i += chunkSize) {
			const chunk = ids.slice(i, i + chunkSize);
			const outs = await edgeRepo.getByFromNodesAndTypes(chunk, wikiTypes);
			for (const e of outs) {
				if (!childLikeSet.has(e.to_node_id)) continue;
				if (!candById.has(e.from_node_id)) continue;
				let set = parentToChildren.get(e.from_node_id);
				if (!set) {
					set = new Set();
					parentToChildren.set(e.from_node_id, set);
				}
				set.add(e.to_node_id);
			}
		}

		const suppressed = new Set<string>();
		const parentBoost = new Map<string, number>();

		for (const [parentId, children] of parentToChildren) {
			if (children.size < 2) continue;
			const parent = candById.get(parentId);
			if (!parent) continue;
			const parentPath = parent.path ?? '';
			if (prefixes.length && !pathMatchesAnyPrefix(parentPath, prefixes)) continue;

			const childIds = [...children];
			const dirs = childIds.map((id) => parentDirPath(candById.get(id)?.path ?? ''));
			const d0 = dirs[0];
			if (!d0 || dirs.some((dir) => dir !== d0)) continue;

			let maxChild = 0;
			for (const cid of childIds) {
				const ch = candById.get(cid);
				if (ch) maxChild = Math.max(maxChild, ch.graphScore ?? 0);
			}
			const baseGs = parent.graphScore ?? 0;
			const newGs = Math.min(1, Math.max(baseGs, maxChild) + 0.02);

			for (const cid of childIds) suppressed.add(cid);
			parentBoost.set(parentId, newGs);
		}

		if (!suppressed.size) return candidates;

		const out: HubCandidate[] = [];
		for (const c of candidates) {
			if (suppressed.has(c.nodeId)) continue;
			const boost = parentBoost.get(c.nodeId);
			if (boost !== undefined) {
				const consensus = c.sourceConsensusScore ?? 0;
				out.push({
					...c,
					graphScore: boost,
					rankingScore: computeHubRankingScore(boost, consensus),
				});
				continue;
			}
			out.push(c);
		}
		out.sort((a, b) => this.compareDocumentHubCandidatesTieBreak(a, b));
		if (out.length < candidates.length) {
			console.info('[HubDiscover] document hub parent suppress weak index children', {
				before: candidates.length,
				after: out.length,
			});
		}
		return out;
	}

	/**
	 * Merge wiki-linked candidates that share the same parent directory: one winner per undirected component.
	 */
	private async applyDocumentHubSameFolderWikiLinkDedupe(options: {
		tenant: IndexTenant;
		candidates: HubCandidate[];
	}): Promise<HubCandidate[]> {
		const { tenant, candidates } = options;
		if (candidates.length < 2) return candidates;

		const byId = new Map(candidates.map((c) => [c.nodeId, c] as const));
		const ids = [...byId.keys()];
		const idSet = new Set(ids);
		const ufParent = new Map<string, string>();
		function ufFind(x: string): string {
			let p = ufParent.get(x);
			if (p === undefined) {
				ufParent.set(x, x);
				return x;
			}
			if (p !== x) {
				p = ufFind(p);
				ufParent.set(x, p);
			}
			return p;
		}
		function ufUnion(a: string, b: string): void {
			const ra = ufFind(a);
			const rb = ufFind(b);
			if (ra !== rb) ufParent.set(rb, ra);
		}

		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const wikiTypes = [...GRAPH_WIKI_REFERENCE_EDGE_TYPES];
		const chunkSize = 200;
		for (let i = 0; i < ids.length; i += chunkSize) {
			const chunk = ids.slice(i, i + chunkSize);
			const outs = await edgeRepo.getByFromNodesAndTypes(chunk, wikiTypes);
			for (const e of outs) {
				if (!idSet.has(e.to_node_id)) continue;
				const u = e.from_node_id;
				const v = e.to_node_id;
				if (u === v || !idSet.has(u)) continue;
				const pu = parentDirPath(byId.get(u)?.path ?? '');
				const pv = parentDirPath(byId.get(v)?.path ?? '');
				if (!pu || pu !== pv) continue;
				ufUnion(u, v);
			}
		}

		const groups = new Map<string, HubCandidate[]>();
		for (const id of ids) {
			const r = ufFind(id);
			let arr = groups.get(r);
			if (!arr) {
				arr = [];
				groups.set(r, arr);
			}
			arr.push(byId.get(id)!);
		}

		const keep = new Set<string>();
		for (const group of groups.values()) {
			if (group.length === 1) {
				keep.add(group[0]!.nodeId);
				continue;
			}
			const sorted = [...group].sort((a, b) => this.compareDocumentHubCandidatesTieBreak(a, b));
			keep.add(sorted[0]!.nodeId);
		}

		const out = candidates.filter((c) => keep.has(c.nodeId));
		out.sort((a, b) => this.compareDocumentHubCandidatesTieBreak(a, b));
		if (out.length < candidates.length) {
			console.info('[HubDiscover] document hub same-folder wiki-link dedupe', {
				before: candidates.length,
				after: out.length,
			});
		}
		return out;
	}

	/**
	 * Top document nodes by graph score (no LLM). Ranking is done in SQL via {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery}.
	 * After SQL recall, applies representative thinning (overlapping one-hop reference coverage) unless disabled.
	 * May be called directly for partial discovery or DevTools single-leg runs.
	 */
	async discoverDocumentHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		/** When set, only keep documents under these vault path prefixes (after widening SQL fetch). */
		targetPathPrefixes?: string[];
		/** Multiplier for SQL fetch size when prefix filtering is used. */
		fetchMultiplier?: number;
		/** Reuse a pre-built coverage index (avoids a second full scan when the caller already built it). */
		docCoverageIndex?: HubDiscoverDocCoverageIndex;
		/** Hub discovery `limitTotal` for thinning target; defaults from {@link computeHubDiscoverBudgets} when omitted. */
		limitTotal?: number;
		/** When false, return SQL top-N only (no representative thinning). Default true. */
		representativeThinning?: boolean;
	}): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? 20);
		const representativeThinning = options.representativeThinning !== false;
		const hubFolder = getAIHubSummaryFolder();
		const prefixes = sanitizeHubDiscoverPathPrefixes(
			(options.targetPathPrefixes ?? []).map((p) => String(p).trim()).filter(Boolean),
		);
		const mult = options.fetchMultiplier ?? (prefixes.length ? 3 : 1);
		const fetchLimit = Math.max(limit, Math.ceil(limit * mult));

		const rows = await sqliteStoreManager
			.getMobiusNodeRepo(tenant)
			.listTopDocumentNodesForHubDiscovery(fetchLimit, hubFolder);

		const scored: HubCandidate[] = [];
		for (const r of rows) {
			const path = r.path ?? '';
			if (!path) continue;
			if (prefixes.length && !pathMatchesAnyPrefix(path, prefixes)) continue;
			const inc = r.doc_incoming_cnt ?? 0;
			const out = r.doc_outgoing_cnt ?? 0;
			const role = this.inferDocumentHubRole(inc, out);
			const gs = r.hub_graph_score;
			scored.push({
				nodeId: r.node_id,
				path,
				label: r.label || path,
				role,
				graphScore: gs,
				candidateScore: {
					physicalAuthorityScore: r.hub_physical_authority_score,
					organizationalScore: r.hub_organizational_score,
					semanticCentralityScore: r.hub_semantic_centrality_score,
					manualBoost: 0,
				},
				stableKey: documentHubStableKey(path),
				pagerank: typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0,
				semanticPagerank:
					typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
						? r.semantic_pagerank
						: 0,
				docIncomingCnt: inc,
				docOutgoingCnt: out,
				sourceKind: 'document',
				sourceKinds: ['document'],
				sourceEvidence: [{ kind: 'document', graphScore: gs }],
				sourceConsensusScore: 0,
				rankingScore: computeHubRankingScore(gs, 0),
			});
		}

		scored.sort((a, b) => this.compareDocumentHubCandidatesTieBreak(a, b));
		const afterParent = await this.applyDocumentHubParentSuppressWeakIndexChildren({
			tenant,
			candidates: scored,
			prefixes,
		});
		const afterDedupe = await this.applyDocumentHubSameFolderWikiLinkDedupe({
			tenant,
			candidates: afterParent,
		});
		const raw = afterDedupe.slice(0, limit);
		if (!representativeThinning || raw.length === 0) return raw;

		const docCoverageIndex = options.docCoverageIndex ?? (await buildHubDiscoverDocCoverageIndex(tenant));
		const budgets = computeHubDiscoverBudgets(docCoverageIndex.docCount);
		const limitTotal = options.limitTotal ?? budgets.limitTotal;
		const targetLimit = computeDocumentHubRepresentativeCandidateLimit(limit, limitTotal);
		if (raw.length <= targetLimit) return raw;

		const thinned = await thinDocumentHubCandidatesRepresentative({
			tenant,
			raw,
			docCoverageIndex,
			targetLimit,
		});
		if (thinned.length < raw.length) {
			console.info('[HubDiscover] document hub representative thinning', {
				raw: raw.length,
				targetLimit,
				out: thinned.length,
			});
		}
		return thinned;
	}

	/**
	 * One candidate per indexed markdown under `getAIManualHubFolder()` (first-class user hub notes).
	 *
	 * **Why a DB lookup per path:** discovery here is driven by vault paths from the filesystem, not by
	 * `listTopDocumentNodesForHubDiscovery`. Each manual hub needs `mobius_node` (`node_id`, degrees, PageRank, etc.).
	 * `getIndexedHubOrDocumentRowByPath` resolves path → row (`hub_doc` or `document`). Maintenance runs
	 * `indexDocument` on all Manual notes before discovery; if the row is still missing, skip (we do not inline-index here).
	 *
	 * **Why `scoreDocumentRow`:** hub graph score is not stored on `mobius_node`. Auto document candidates get scores
	 * inside SQL; manual hubs reuse the same formula in TS so merged candidates share comparable `graphScore` /
	 * `candidateScore` for ranking (keep in sync with `MobiusNodeRepo.listTopDocumentNodesForHubDiscovery`).
	 * May be called directly for partial discovery or DevTools single-leg runs.
	 */
	async discoverManualHubCandidates(options: { tenant?: IndexTenant }): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const app = AppContext.getApp();
		const manualRoot = getAIManualHubFolder();
		const hubFolder = getAIHubSummaryFolder();
		if (!manualRoot) return [];

		const paths = listMarkdownPathsUnderFolder(manualRoot);
		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const out: HubCandidate[] = [];

		for (const path of paths) {
			if (!isVaultPathUnderPrefix(path, manualRoot)) continue;
			const row = (await nodeRepo.getIndexedHubOrDocumentRowByPath(path)) as MobiusNodeRow | undefined;
			if (!row?.node_id || !row.path) {
				console.warn(`[discoverManualHubCandidates] Skip (not indexed yet): ${path}`);
				continue;
			}

			let raw = '';
			const f = app.vault.getAbstractFileByPath(path);
			if (f instanceof TFile) {
				try {
					raw = await app.vault.read(f);
				} catch {
					raw = '';
				}
			}
			const fm = parseManualHubFrontmatterEnhancements(raw);
			const inc = row.doc_incoming_cnt ?? 0;
			const outd = row.doc_outgoing_cnt ?? 0;
			const { graphScore, candidateScore, role: inferredRole } = this.scoreDocumentRow(row);
			const role: HubRole = fm.hubRole ?? inferredRole;
			const filteredMembers =
				fm.hubSourcePaths?.filter((p) => p && !(hubFolder && isVaultPathUnderPrefix(p, hubFolder))) ?? [];
			const gs = Math.min(1, graphScore + 0.25);

			out.push({
				nodeId: row.node_id,
				path: row.path,
				label: row.label || path.split('/').pop() || path,
				role,
				graphScore: gs,
				candidateScore: {
					...candidateScore,
					manualBoost: 1,
				},
				stableKey: `manual-hub:${normalizePath(row.path)}`,
				pagerank: typeof row.pagerank === 'number' && Number.isFinite(row.pagerank) ? row.pagerank : 0,
				semanticPagerank:
					typeof row.semantic_pagerank === 'number' && Number.isFinite(row.semantic_pagerank)
						? row.semantic_pagerank
						: 0,
				docIncomingCnt: inc,
				docOutgoingCnt: outd,
				sourceKind: 'manual',
				sourceKinds: ['manual'],
				sourceEvidence: [{ kind: 'manual', graphScore: gs }],
				sourceConsensusScore: 0,
				rankingScore: computeHubRankingScore(gs, 0),
				...(filteredMembers.length ? { clusterMemberPaths: filteredMembers } : {}),
			});
		}
		return out;
	}

	/**
	 * Folder-level hubs from path prefix aggregation.
	 * May be called directly for partial discovery or DevTools single-leg runs.
	 */
	async discoverFolderHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		targetPathPrefixes?: string[];
	}): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? HUB_DISCOVER_FOLDER_MAX_CANDIDATES);
		const hubFolder = getAIHubSummaryFolder();
		const prefixes = sanitizeHubDiscoverPathPrefixes(
			(options.targetPathPrefixes ?? []).map((p) => String(p).trim()).filter(Boolean),
		);

		const batchSize = Math.max(1, Math.ceil(limit * FOLDER_HUB_DISCOVER_FETCH_BATCH_MULTIPLIER));
		const maxScan = Math.max(batchSize, limit * FOLDER_HUB_DISCOVER_MAX_SCAN_MULTIPLIER);
		const poolTarget = Math.max(limit, Math.ceil(limit * FOLDER_HUB_DISCOVER_QUOTA_POOL_MULTIPLIER));
		const prefixArg = prefixes.length ? prefixes : undefined;
		const repo = sqliteStoreManager.getMobiusNodeRepo(tenant);

		const accumulated: MobiusNodeFolderHubDiscoveryRow[] = [];
		let sqlOffset = 0;
		while (sqlOffset < maxScan) {
			const pageLimit = Math.min(batchSize, maxScan - sqlOffset);
			const chunk = await repo.listTopFolderNodesForHubDiscovery(
				pageLimit,
				hubFolder,
				prefixArg,
				sqlOffset,
			);
			if (!chunk.length) break;
			accumulated.push(...chunk);
			sqlOffset += chunk.length;
			const compressed = compressNestedFolderHubDiscoveryRows(accumulated);
			if (compressed.length >= poolTarget) break;
			if (chunk.length < pageLimit) break;
		}

		const compressedFinal = compressNestedFolderHubDiscoveryRows(accumulated);
		const rows = selectFolderHubDiscoveryRowsWithTopRootQuota(compressedFinal, limit);

		const candidates: HubCandidate[] = [];
		for (const r of rows) {
			const folderPath = r.path;
			const label = folderPath.includes('/') ? folderPath.slice(folderPath.lastIndexOf('/') + 1) : folderPath;
			const gs = r.hub_graph_score;
			const broadPenalty = folderHubStructuralBroadnessPenalty(r);
			const rankingBase = Math.max(0, gs - broadPenalty);
			candidates.push({
				nodeId: r.node_id,
				path: folderPath,
				label,
				role: 'folder_anchor',
				graphScore: gs,
				candidateScore: {
					physicalAuthorityScore: r.hub_physical_authority_score,
					organizationalScore: r.hub_organizational_score,
					semanticCentralityScore: r.hub_semantic_centrality_score,
					manualBoost: 0,
					cohesionScore: r.hub_cohesion_effective_score,
				},
				stableKey: `folder:${normalizePath(folderPath)}`,
				pagerank: typeof r.pagerank === 'number' && Number.isFinite(r.pagerank)
					? r.pagerank : 0,
				semanticPagerank: typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
					? r.semantic_pagerank : 0,
				docIncomingCnt: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
				docOutgoingCnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
				sourceKind: 'folder',
				sourceKinds: ['folder'],
				sourceEvidence: [{ kind: 'folder', graphScore: gs }],
				sourceConsensusScore: 0,
				rankingScore: computeHubRankingScore(rankingBase, 0),
			});
		}

		candidates.sort((a, b) => b.rankingScore - a.rankingScore);
		return candidates.slice(0, limit);
	}

	/**
	 * Cluster hubs: ranked seeds (quality, not only semantic_pagerank), semantic + reference recall,
	 * multi-signal affinity, cohesion + intra-cluster semantic density, then emit.
	 * Callers that need the same top-document exclude slice as the first round should fetch document hubs,
	 * take {@link computeHubDiscoverBudgets}.topDocExcludeLimit, then pass those node ids as {@link excludeNodeIds}.
	 */
	async discoverClusterHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		seedFetchLimit?: number;
		excludeNodeIds?: Set<string>;
		targetPathPrefixes?: string[];
	}): Promise<{ candidates: HubCandidate[]; stats: HubClusterDiscoveryStats }> {
		const stats: HubClusterDiscoveryStats = {
			seedsFetched: 0,
			seedsRanked: 0,
			skippedWeakAnchor: 0,
			skippedPathFilter: 0,
			skippedAffinity: 0,
			skippedCohesion: 0,
			emitted: 0,
			skippedByTargetPrefix: 0,
			seedTopDocOverlapSoftPenalty: 0,
			coarseDeduped: 0,
			skippedRawFamilyCap: 0,
		};

		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? 8);
		const seedFetchLimit = Math.max(limit, options.seedFetchLimit ?? limit * 4);
		const hubFolder = getAIHubSummaryFolder() ?? '';
		const exclude = options.excludeNodeIds ?? new Set<string>();
		const prefixes = sanitizeHubDiscoverPathPrefixes(
			(options.targetPathPrefixes ?? []).map((p) => String(p).trim()).filter(Boolean),
		);

		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

		const fetchCap = Math.min(400, Math.max(seedFetchLimit, seedFetchLimit * HUB_DISCOVER_CLUSTER_SEED_FETCH_MULTIPLIER));
		const nSem = Math.max(1, Math.ceil(fetchCap * 0.42));
		const nGraph = Math.max(1, Math.ceil(fetchCap * 0.38));
		const nPr = Math.max(1, Math.ceil(fetchCap * 0.28));
		const [semRows, graphRows, prRows] = await Promise.all([
			nodeRepo.listDocumentNodesForHubClusterSeeds(nSem),
			nodeRepo.listDocumentNodesForHubClusterSeedsByHubGraphScore(nGraph, hubFolder),
			nodeRepo.listDocumentNodesForHubClusterSeedsByPagerank(nPr, hubFolder),
		]);
		const seedById = new Map<string, (typeof semRows)[number]>();
		for (const row of [...semRows, ...graphRows, ...prRows]) {
			if (!seedById.has(row.node_id)) seedById.set(row.node_id, row);
		}
		const seedsRaw = [...seedById.values()];
		stats.seedsFetched = seedsRaw.length;

		const seedMetas = await nodeRepo.listHubLocalGraphNodeMeta(seedsRaw.map((s) => s.node_id));
		const seedMetaById = new Map(seedMetas.map((r) => [r.node_id, r]));

		const scored = seedsRaw.map((s) => {
			const meta = seedMetaById.get(s.node_id);
			const score = computeClusterSeedQualityScore({
				semanticPagerank: typeof s.semantic_pagerank === 'number' ? s.semantic_pagerank : 0,
				pagerank: typeof s.pagerank === 'number' ? s.pagerank : 0,
				docIncoming: s.doc_incoming_cnt ?? 0,
				docOutgoing: s.doc_outgoing_cnt ?? 0,
				tagsJson: meta?.tags_json ?? null,
				seedPath: s.path ?? '',
				seedLabel: s.label,
			});
			return { s, score };
		});
		scored.sort((a, b) => b.score - a.score);
		stats.seedsRanked = scored.length;

		let effectivePrefixes = prefixes;
		if (prefixes.length > 0) {
			const anyMatch = scored.some(({ s }) => {
				const docPath = s.path ?? '';
				return (
					isPlausibleVaultDocumentPathForHubSeed(docPath) &&
					!(hubFolder && isVaultPathUnderPrefix(docPath, hubFolder)) &&
					pathMatchesAnyPrefix(docPath, prefixes)
				);
			});
			if (!anyMatch) {
				effectivePrefixes = [];
			}
		}

		const v11Log = (...args: unknown[]) => {
			if (HUB_CLUSTER_V11_CONSOLE_DEBUG) console.debug('[HubClusterV11]', ...args);
		};

		const maxSemantic = HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP - 1;
		const maxRef = HUB_DISCOVER_CLUSTER_REFERENCE_NEIGHBOR_CAP;

		const out: HubCandidate[] = [];
		/** Raw emit: cap clusters per coarse theme family before dedupe (see `HUB_DISCOVER_CLUSTER_RAW_MAX_PER_THEME`). */
		const rawFamilyEmitCounts = new Map<string, number>();
		for (const { s } of scored) {
			if (out.length >= limit) break;
			const p = s.path ?? '';
			if (!p || (hubFolder && isVaultPathUnderPrefix(p, hubFolder))) continue;
			if (effectivePrefixes.length && !pathMatchesAnyPrefix(p, effectivePrefixes)) {
				stats.skippedByTargetPrefix++;
				continue;
			}

			const neighRows = await edgeRepo.listSemanticRelatedEdgesIncidentToNode(s.node_id, 240);
			const weightByNeighbor = new Map<string, number>();
			const orderedNeighborIds: string[] = [];
			for (const e of neighRows) {
				const other = e.from_node_id === s.node_id ? e.to_node_id : e.from_node_id;
				if (other === s.node_id) continue;
				const w = e.weight;
				const prev = weightByNeighbor.get(other);
				if (prev === undefined || w > prev) weightByNeighbor.set(other, w);
				if (!orderedNeighborIds.includes(other)) orderedNeighborIds.push(other);
				if (orderedNeighborIds.length >= maxSemantic) break;
			}

			const refRows = await edgeRepo.listReferenceEdgesIncidentToNode(s.node_id, maxRef * 4);
			for (const e of refRows) {
				if (orderedNeighborIds.length >= maxSemantic + maxRef) break;
				const other = e.from_node_id === s.node_id ? e.to_node_id : e.from_node_id;
				if (other === s.node_id) continue;
				if (orderedNeighborIds.includes(other)) continue;
				if (!weightByNeighbor.has(other)) weightByNeighbor.set(other, HUB_CLUSTER_V11_REFERENCE_EDGE_DEFAULT_WEIGHT);
				orderedNeighborIds.push(other);
			}

			const idList = [s.node_id, ...orderedNeighborIds];
			const metaRows = await nodeRepo.listHubLocalGraphNodeMeta(idList);
			const metaById = new Map(metaRows.map((r) => [r.node_id, r]));
			const seedMeta = metaById.get(s.node_id);
			if (!seedMeta?.path) {
				stats.skippedPathFilter++;
				continue;
			}

			const seedBlob = decodeIndexedTagsBlob(seedMeta.tags_json ?? null);
			const anchor = buildClusterAnchorSetsFromBlob(seedBlob);
			const seedTitleTokens = extractMeaningfulTitleTokens(seedMeta.path, seedMeta.label ?? s.label);
			mergeTitleTokensIntoAnchorKeywords(anchor, seedTitleTokens);

			const anchorHasNoTags =
				anchor.topics.size === 0 && anchor.functionals.size === 0 && anchor.keywords.size === 0;
			if (anchorHasNoTags && seedTitleTokens.length < 1) {
				stats.skippedWeakAnchor++;
				v11Log('skip weak anchor (no tags/keywords and no title tokens)', s.node_id);
				continue;
			}

			type EvalRow = {
				id: string;
				path: string;
				label: string;
				blob: ReturnType<typeof decodeIndexedTagsBlob>;
				breakdown: ReturnType<typeof computeMemberAffinity>;
				isSeed: boolean;
			};
			const evals: EvalRow[] = [];

			for (const id of idList) {
				const meta = metaById.get(id);
				if (!meta?.path) continue;
				if (hubFolder && isVaultPathUnderPrefix(meta.path, hubFolder)) continue;
				if (effectivePrefixes.length && !pathMatchesAnyPrefix(meta.path, effectivePrefixes)) continue;

				const blob = decodeIndexedTagsBlob(meta.tags_json ?? null);
				const isSeed = id === s.node_id;
				const sem = isSeed
					? 1
					: semanticSupportFromEdgeWeight(weightByNeighbor.get(id) ?? HUB_CLUSTER_V11_REFERENCE_EDGE_DEFAULT_WEIGHT);
				const breakdown = computeMemberAffinity({
					anchor,
					seedPath: seedMeta.path,
					seedTitleTokens,
					memberBlob: blob,
					memberPath: meta.path,
					memberLabel: meta.label,
					semanticSupport: sem,
					isSeed,
				});
				evals.push({
					id,
					path: meta.path,
					label: meta.label ?? '',
					blob,
					breakdown,
					isSeed,
				});
			}

			const afterPathFilterCount = evals.length;
			if (afterPathFilterCount < HUB_DISCOVER_CLUSTER_MIN_SIZE) {
				stats.skippedPathFilter++;
				v11Log('skip path filter', s.node_id, afterPathFilterCount);
				continue;
			}

			const memberDebug: HubClusterV11Debug['members'] = [];
			const kept: EvalRow[] = [];
			for (const ev of evals) {
				if (ev.isSeed) {
					kept.push(ev);
					memberDebug.push({
						nodeId: ev.id,
						path: ev.path,
						affinity: ev.breakdown.affinity,
						semanticSupport: ev.breakdown.semanticSupport,
						kept: true,
					});
					continue;
				}
				const passes =
					ev.breakdown.affinity >= HUB_CLUSTER_V11_MIN_MEMBER_AFFINITY ||
					(ev.breakdown.semanticSupport >= HUB_CLUSTER_V11_SEMANTIC_STRONG_THRESHOLD &&
						ev.breakdown.affinity >= HUB_CLUSTER_V11_RELAXED_MEMBER_AFFINITY) ||
					(ev.breakdown.semanticSupport >= HUB_CLUSTER_V11_SEMANTIC_BRIDGE_THRESHOLD &&
						ev.breakdown.affinity >= HUB_CLUSTER_V11_BRIDGE_MEMBER_AFFINITY);
				if (passes) {
					kept.push(ev);
					memberDebug.push({
						nodeId: ev.id,
						path: ev.path,
						affinity: ev.breakdown.affinity,
						semanticSupport: ev.breakdown.semanticSupport,
						kept: true,
					});
				} else {
					memberDebug.push({
						nodeId: ev.id,
						path: ev.path,
						affinity: ev.breakdown.affinity,
						semanticSupport: ev.breakdown.semanticSupport,
						kept: false,
						reason: 'below_member_affinity_threshold',
					});
				}
			}

			const afterAffinityFilterCount = kept.length;
			if (kept.length < HUB_DISCOVER_CLUSTER_MIN_SIZE) {
				stats.skippedAffinity++;
				v11Log('skip affinity', s.node_id, afterAffinityFilterCount);
				continue;
			}

			const keptIds = kept.map((k) => k.id);
			const intraEdges = await edgeRepo.listSemanticRelatedEdgesWithinNodeSet(keptIds, 1200);
			const intraDensity = computeIntraClusterSemanticDensity(keptIds, intraEdges);

			const cohesion = computeClusterCohesionFromMembers({
				anchor,
				seedTitleTokens,
				intraClusterSemanticDensity: intraDensity,
				members: kept.map((ev) => ({
					blob: ev.blob,
					path: ev.path,
					label: ev.label,
					affinity: ev.breakdown.affinity,
				})),
			});

			const cohesionPass =
				cohesion.cohesionScore >= HUB_CLUSTER_V11_MIN_COHESION_SCORE &&
				cohesion.avgAffinity >= HUB_CLUSTER_V11_MIN_AVG_AFFINITY;

			let rejectReason: string | undefined;
			if (!cohesionPass) {
				rejectReason =
					cohesion.cohesionScore < HUB_CLUSTER_V11_MIN_COHESION_SCORE
						? 'cohesion_score_low'
						: 'avg_affinity_low';
			}

			const clusterV11Debug: HubClusterV11Debug = {
				seedNodeId: s.node_id,
				seedPath: seedMeta.path,
				recallCount: idList.length,
				afterPathFilterCount,
				afterAffinityFilterCount,
				cohesion: {
					avgAffinity: cohesion.avgAffinity,
					topicConsistency: cohesion.topicConsistency,
					keywordConsistency: cohesion.keywordConsistency,
					titleConsensus: cohesion.titleConsensus,
					intraClusterSemanticDensity: cohesion.intraClusterSemanticDensity,
					cohesionScore: cohesion.cohesionScore,
				},
				cohesionPass,
				rejectReason,
				members: memberDebug,
			};

			if (!cohesionPass) {
				stats.skippedCohesion++;
				v11Log('reject', rejectReason, clusterV11Debug);
				continue;
			}

			const memberPaths = kept.map((k) => k.path);
			const sortedKey = [...kept.map((k) => k.id)].sort().join('|');
			const h = hashSHA256(sortedKey).slice(0, SLICE_CAPS.hub.clusterHashHexPrefix);
			const nodeId = stableHubClusterNodeId(tenant, h);
			const spr =
				typeof s.semantic_pagerank === 'number' && Number.isFinite(s.semantic_pagerank) ? s.semantic_pagerank : 0;
			const pr = typeof s.pagerank === 'number' && Number.isFinite(s.pagerank) ? s.pagerank : 0;
			const inc = s.doc_incoming_cnt ?? 0;

			const seedStrength = Math.min(1, spr * 1.25);
			const cohesionBlend = cohesion.cohesionScore;
			const sizeScore = Math.min(1, kept.length * 0.07);
			let graphScore = Math.min(1, seedStrength * 0.28 + cohesionBlend * 0.45 + sizeScore * 0.27);
			if (exclude.has(s.node_id)) {
				graphScore = Math.max(0, graphScore * HUB_DISCOVER_CLUSTER_SEED_TOP_DOC_SCORE_FACTOR);
				stats.seedTopDocOverlapSoftPenalty++;
			}

			const physicalAuthorityScore = Math.min(1, pr * 2);
			const organizationalScore = Math.min(1, kept.length * 0.05);
			const semanticCentralityScore = Math.min(1, seedStrength * 0.55 + cohesionBlend * 0.45);

			const label = pickClusterHubLabel({
				anchor,
				seedLabel: s.label ?? seedMeta.label ?? p,
				memberBlobs: kept.map((k) => k.blob),
			});

			const assemblyHints: HubAssemblyHints = {
				anchorTopicTags: [...anchor.topics].slice(0, 12),
				anchorFunctionalTagIds: [...anchor.functionals].slice(0, 8),
				anchorKeywords: [...anchor.keywords].slice(0, 16),
				preferredChildHubNodeIds: [],
				stopAtChildHub: true,
				expectedTopology: 'clustered',
				rationale: `Cluster V2 cohesion=${cohesion.cohesionScore.toFixed(3)} intra=${intraDensity.toFixed(3)} size=${kept.length}`,
			};

			if (HUB_DISCOVER_CLUSTER_RAW_MAX_PER_THEME > 0) {
				const fam = clusterThemeFamilyKey({
					label,
					clusterMemberPaths: memberPaths,
					assemblyHints,
				});
				const prev = rawFamilyEmitCounts.get(fam) ?? 0;
				if (prev >= HUB_DISCOVER_CLUSTER_RAW_MAX_PER_THEME) {
					stats.skippedRawFamilyCap++;
					v11Log('skip raw family cap', fam, s.node_id);
					continue;
				}
				rawFamilyEmitCounts.set(fam, prev + 1);
			}

			stats.emitted++;
			out.push({
				nodeId,
				path: `__hub_cluster__/${h}`,
				label,
				role: 'cluster_center',
				graphScore,
				candidateScore: {
					physicalAuthorityScore,
					organizationalScore,
					semanticCentralityScore,
					manualBoost: 0,
				},
				stableKey: clusterHubStableKey(seedMeta.path),
				pagerank: pr,
				semanticPagerank: spr,
				docIncomingCnt: inc,
				docOutgoingCnt: kept.length,
				sourceKind: 'cluster',
				sourceKinds: ['cluster'],
				sourceEvidence: [{ kind: 'cluster', graphScore: graphScore }],
				sourceConsensusScore: 0,
				rankingScore: computeHubRankingScore(graphScore, 0),
				clusterMemberPaths: memberPaths,
				assemblyHints,
				clusterV11Debug,
			});
		}

		const deduped = dedupeClusterCandidatesCoarse(out, HUB_DISCOVER_CLUSTER_EMIT_DEDUPE_MAX_JACCARD);
		stats.coarseDeduped = deduped.removed;
		return { candidates: deduped.kept.slice(0, limit), stats };
	}

	/**
	 * Full first-pass discovery (all sources, no path hints).
	 */
	private async discoverHubCandidatesFirstRound(options: {
		tenant: IndexTenant;
		budgets: ReturnType<typeof computeHubDiscoverBudgets>;
		docCoverageIndex: HubDiscoverDocCoverageIndex;
	}): Promise<{ candidates: HubCandidate[]; clusterDiscovery: HubClusterDiscoveryStats }> {
		const { tenant, budgets, docCoverageIndex } = options;
		const [manual, docs, folders] = await Promise.all([
			this.discoverManualHubCandidates({ tenant }),
			this.discoverDocumentHubCandidates({
				tenant,
				limit: budgets.documentFetchLimit,
				docCoverageIndex,
				limitTotal: budgets.limitTotal,
			}),
			this.discoverFolderHubCandidates({ tenant, limit: budgets.folderFetchLimit }),
		]);
		const topDocSlice = docs.slice(0, budgets.topDocExcludeLimit);
		const topDocIds = new Set(topDocSlice.map((d) => d.nodeId));
		const { candidates: clusters, stats: clusterDiscovery } = await this.discoverClusterHubCandidates({
			tenant,
			limit: budgets.clusterLimit,
			seedFetchLimit: budgets.clusterSeedFetchLimit,
			excludeNodeIds: topDocIds,
		});
		return {
			candidates: [...manual, ...folders, ...docs, ...clusters],
			clusterDiscovery,
		};
	}

	/**
	 * Single-pass hub discovery: merge all sources (manual, folder, document, cluster), then greedy selection.
	 * Options come from `AppContext.getInstance().settings.search.hubDiscover` merged with defaults.
	 */
	async discoverAllHubCandidates(options?: {
		tenant?: IndexTenant;
		/** DevTools: called after the round summary is built (deterministic metrics). */
		onRoundComplete?: (summary: HubDiscoverRoundSummary) => void;
	}): Promise<HubCandidate[]> {
		const sw = new Stopwatch('HubDiscover.discoverAllHubCandidates');
		const tenant = options?.tenant ?? 'vault';
		const hubDiscoverSetting: HubDiscoverSettings = AppContext.getInstance().settings.search.hubDiscover!;

		sw.start('buildDocCoverageIndex');
		const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
		sw.stop();

		sw.start('computeHubDiscoverBudgets');
		const docCount = docCoverageIndex.docCount;
		const budgets = computeHubDiscoverBudgets(docCount);
		sw.stop();

		sw.start('round1.discoverBatch');
		const batchResult = await this.discoverHubCandidatesFirstRound({ tenant, budgets, docCoverageIndex });
		sw.stop();

		sw.start('round1.mergeCandidates');
		const candidatePool = mergeCandidatesByPriority(batchResult.candidates);
		sw.stop();
		if (candidatePool.length === 0) {
			sw.print();
			return [];
		}

		sw.start('round1.selectHubCandidates');
		const selection = await selectHubCandidatesMultiRound({
			tenant,
			candidatePool,
			limitTotal: budgets.limitTotal,
			docCoverageIndex,
			hubDiscoverSettings: hubDiscoverSetting,
			roundIndex: 1,
		});
		sw.stop();

		const finalSelected = selection.selected;

		sw.start('round1.buildRoundSummary');
		const summary = await buildHubDiscoverRoundSummary({
			tenant,
			documentCount: docCount,
			mergedPoolSize: candidatePool.length,
			limitTotal: budgets.limitTotal,
			selected: selection.selected,
			stopDecision: selection.stopDecision,
			roundContext: selection.roundContext,
			remainingSlots: budgets.limitTotal - finalSelected.length,
			newlyAddedThisRound: finalSelected.length,
			clusterDiscovery: batchResult.clusterDiscovery,
		});
		sw.stop();
		options?.onRoundComplete?.(summary);

		let finalSelectedForAssembly = finalSelected;
		if (hubDiscoverSetting.enableLlmSemanticMerge && !AppContext.getInstance().isMockEnv) {
			sw.start('round1.semanticMergeHints');
			const withHints = await attachDeterministicAssemblyHints(tenant, finalSelected);
			sw.stop();
			const cards = buildSemanticMergeHubCardsPayload(withHints);
			if (cards.length < 2) {
				sw.print();
				return withHints;
			}
			sw.start('round1.semanticMergeLlm');
			try {
				const mergePlan = await AppContext.getInstance().manager.streamObjectWithPrompt(
					PromptId.HubSemanticMerge,
					{
						hubCardsJson: JSON.stringify(cards),
					},
					hubSemanticMergeLlmSchema,
					{ noReasoning: false },
				);
				finalSelectedForAssembly = applySemanticMergePlanToFinalSelected(withHints, mergePlan);
			} catch (e) {
				console.warn('[discoverAllHubCandidates] Semantic merge failed:', e);
				finalSelectedForAssembly = withHints;
			}
			sw.stop();
		}

		sw.print();
		return attachDeterministicAssemblyHints(tenant, finalSelectedForAssembly);
	}
}