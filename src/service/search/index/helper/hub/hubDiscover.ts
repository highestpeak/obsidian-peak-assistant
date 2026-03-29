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
	HUB_CLUSTER_V11_RELAXED_MEMBER_AFFINITY,
	HUB_CLUSTER_V11_SEMANTIC_STRONG_THRESHOLD,
	HUB_DISCOVER_CLUSTER_MIN_SIZE,
	HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP,
	HUB_DISCOVER_FOLDER_MAX_CANDIDATES,
	HUB_DISCOVER_GREEDY_SELECTION,
	HUB_DISCOVER_LIMIT_MAX,
	HUB_DISCOVER_LIMIT_MIN,
	HUB_DISCOVER_LIMIT_SQRT_SCALE,
	HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT,
	HUB_COVERAGE_INDEX_PAGE_SIZE,
	HUB_SOURCE_CONSENSUS_MAX,
	HUB_SOURCE_CONSENSUS_PER_EXTRA,
	SLICE_CAPS,
	MANUAL_HUB_FRONTMATTER_KEYS,
} from '@/core/constant';
import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import { hubDiscoverRoundReviewLlmSchema } from '@/core/schemas/hubDiscoverLlm';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import {
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
import { isVaultPathUnderPrefix, pathMatchesAnyPrefix } from '@/core/utils/hub-path-utils';
import { stableHubClusterNodeId } from '@/core/utils/id-utils';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import { PromptId } from '@/service/prompt/PromptId';
import {
	buildClusterAnchorSetsFromBlob,
	computeClusterCohesionFromMembers,
	computeMemberAffinity,
	extractMeaningfulTitleTokens,
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
	HubDiscoverAgentMode,
	HubDiscoverCoverageGap,
	HubDiscoverDocCoverageIndex,
	HubDiscoverNextRoundHints,
	HubDiscoverOverlapPair,
	HubDiscoverRoundContext,
	HubDiscoverRoundReview,
	HubDiscoverRoundSummary,
	HubDiscoverRoundSummaryHubCard,
	HubDiscoverSettings,
	HubDiscoverStopDecision,
	HubRole,
	HubSourceKind,
	MobiusNodeRow,
} from './types';
import { DEFAULT_HUB_DISCOVER_SETTINGS, SOURCE_PRIORITY } from './types';

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
 * Provenance for a candidate from exactly one discovery line (spread into {@link HubCandidate}).
 */
export function singleSourceHubProvenance(
	kind: HubSourceKind,
	graphScore: number,
): Pick<HubCandidate, 'sourceKind' | 'sourceKinds' | 'sourceEvidence' | 'sourceConsensusScore' | 'rankingScore'> {
	const sourceConsensusScore = 0;
	return {
		sourceKind: kind,
		sourceKinds: [kind],
		sourceEvidence: [{ kind, graphScore }],
		sourceConsensusScore,
		rankingScore: computeHubRankingScore(graphScore, sourceConsensusScore),
	};
}

/**
 * Merge assembly hints when multiple discovery rows share the same `stableKey`: union lists, OR `stopAtChildHub`,
 * `expectedTopology` from highest-priority `sourceKind` when present.
 */
function mergeHubAssemblyHintsGroup(group: HubCandidate[]): HubAssemblyHints | undefined {
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
	for (const candidate of rankedPool) {
		if (selected.length >= limitTotal) break;
		if (selectedStableKeys.has(candidate.stableKey)) continue;

		const coverage = await getCoverageBits(candidate);
		const marginalGain = fractionOfBitsNewSince(coverage, coveredBits);

		const isEarlyFillSlot = selected.length < HUB_DISCOVER_GREEDY_SELECTION.earlyFillSlots;
		const isStrongHub = candidate.rankingScore >= HUB_DISCOVER_GREEDY_SELECTION.strongHubScore;
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
		mergeCoverageBitsIntoUnion(
			coverage,
			coveredBits,
			coveredDocumentCount,
			coveredPrefixCounts,
			docCoverageIndex.pathByOrdinal,
		);
	}

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
		});
	}

	// --- Where coverage is missing: vault prefix totals minus incremental covered counts, then sample paths ---
	const vaultPrefixTotals = await nodeRepo.listDocumentGapPrefixCounts();
	const coveredPrefix = roundContext.coveredPrefixCounts;
	const sortedGapCandidates = vaultPrefixTotals
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
	};
}

// --- Next-round hints (LLM review + deterministic gaps) ---

const DEFAULT_MODES_ALL: HubDiscoverAgentMode[] = ['manual_seed', 'folder', 'document', 'cluster'];

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
		const organizationalScore = Math.min(1, inc * 0.035 + out * 0.055);
		const semanticCentralityScore = Math.min(1, spr * 1.2);
		const manualBoost = 0;
		const graphScore = Math.min(
			1,
			physicalAuthorityScore * 0.35 + organizationalScore * 0.25 + semanticCentralityScore * 0.35 + manualBoost * 0.05,
		);
		const role = this.inferRole(inc, out);
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
	 * Top document nodes by graph score (no LLM). Ranking is done in SQL via {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery}.
	 */
	private async discoverDocumentHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		/** When set, only keep documents under these vault path prefixes (after widening SQL fetch). */
		targetPathPrefixes?: string[];
		/** Multiplier for SQL fetch size when prefix filtering is used. */
		fetchMultiplier?: number;
	}): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? 20);
		const hubFolder = getAIHubSummaryFolder();
		const prefixes = (options.targetPathPrefixes ?? []).map((p) => normalizePath(p.trim())).filter(Boolean);
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
			const role = this.inferRole(inc, out);
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
				stableKey: `document:${r.node_id}`,
				pagerank: typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0,
				semanticPagerank:
					typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
						? r.semantic_pagerank
						: 0,
				docIncomingCnt: inc,
				docOutgoingCnt: out,
				...singleSourceHubProvenance('document', gs),
			});
		}

		scored.sort((a, b) => b.graphScore - a.graphScore);
		return scored.slice(0, limit);
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
	 */
	private async discoverManualHubCandidates(options: { tenant?: IndexTenant }): Promise<HubCandidate[]> {
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
				...singleSourceHubProvenance('manual', gs),
				...(filteredMembers.length ? { clusterMemberPaths: filteredMembers } : {}),
			});
		}
		return out;
	}

	/**
	 * Folder-level hubs from path prefix aggregation.
	 */
	private async discoverFolderHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		targetPathPrefixes?: string[];
		fetchMultiplier?: number;
	}): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? HUB_DISCOVER_FOLDER_MAX_CANDIDATES);
		const hubFolder = getAIHubSummaryFolder();
		const prefixes = (options.targetPathPrefixes ?? []).map((p) => normalizePath(p.trim())).filter(Boolean);
		const mult = options.fetchMultiplier ?? (prefixes.length ? 3 : 1);
		const fetchLimit = Math.max(limit, Math.ceil(limit * mult));

		const rows = await sqliteStoreManager
			.getMobiusNodeRepo(tenant)
			.listTopFolderNodesForHubDiscovery(fetchLimit, hubFolder);

		const candidates: HubCandidate[] = [];
		for (const r of rows) {
			const folderPath = r.path;
			if (prefixes.length && !pathMatchesAnyPrefix(folderPath, prefixes)) continue;
			const label =
				folderPath.includes('/') ? folderPath.slice(folderPath.lastIndexOf('/') + 1) : folderPath;
			const avgPr = typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0;
			const avgSpr =
				typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
					? r.semantic_pagerank
					: 0;
			const gs = r.hub_graph_score;
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
				},
				stableKey: `folder:${normalizePath(folderPath)}`,
				pagerank: avgPr,
				semanticPagerank: avgSpr,
				docIncomingCnt: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
				docOutgoingCnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
				...singleSourceHubProvenance('folder', gs),
			});
		}

		candidates.sort((a, b) => b.graphScore - a.graphScore);
		return candidates.slice(0, limit);
	}

	/**
	 * Cluster hubs: semantic PageRank seeds + weighted 1-hop semantic edges, then Cluster V1.1 multi-signal
	 * member scoring and cohesion gating (tags, keywords, title tokens, path structure).
	 * Stops when `out.length` reaches `limit` (`clusterLimit` from `computeHubDiscoverBudgets`).
	 */
	private async discoverClusterHubCandidates(options: {
		tenant?: IndexTenant;
		limit?: number;
		/** How many top semantic documents to fetch as seeds; defaults to `max(limit, limit*4)` if omitted. */
		seedFetchLimit?: number;
		excludeNodeIds?: Set<string>;
		targetPathPrefixes?: string[];
	}): Promise<HubCandidate[]> {
		const tenant = options.tenant ?? 'vault';
		const limit = Math.max(1, options.limit ?? 8);
		const seedFetchLimit = Math.max(limit, options.seedFetchLimit ?? limit * 4);
		const hubFolder = getAIHubSummaryFolder();
		const exclude = options.excludeNodeIds ?? new Set<string>();
		const prefixes = (options.targetPathPrefixes ?? []).map((p) => normalizePath(p.trim())).filter(Boolean);

		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const seeds = await nodeRepo.listDocumentNodesForHubClusterSeeds(seedFetchLimit);

		const v11Log = (...args: unknown[]) => {
			if (HUB_CLUSTER_V11_CONSOLE_DEBUG) console.debug('[HubClusterV11]', ...args);
		};

		const out: HubCandidate[] = [];
		for (const s of seeds) {
			if (out.length >= limit) break;
			const p = s.path ?? '';
			if (!p || (hubFolder && isVaultPathUnderPrefix(p, hubFolder))) continue;
			if (prefixes.length && !pathMatchesAnyPrefix(p, prefixes)) continue;
			if (exclude.has(s.node_id)) continue;

			const neighRows = await edgeRepo.listSemanticRelatedEdgesIncidentToNode(s.node_id, 200);
			const weightByNeighbor = new Map<string, number>();
			const orderedNeighborIds: string[] = [];
			for (const e of neighRows) {
				const other = e.from_node_id === s.node_id ? e.to_node_id : e.from_node_id;
				if (other === s.node_id) continue;
				const w = e.weight;
				const prev = weightByNeighbor.get(other);
				if (prev === undefined || w > prev) weightByNeighbor.set(other, w);
				if (!orderedNeighborIds.includes(other)) orderedNeighborIds.push(other);
				if (orderedNeighborIds.length >= HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP - 1) break;
			}

			const idList = [s.node_id, ...orderedNeighborIds];
			const metaRows = await nodeRepo.listHubLocalGraphNodeMeta(idList);
			const metaById = new Map(metaRows.map((r) => [r.node_id, r]));
			const seedMeta = metaById.get(s.node_id);
			if (!seedMeta?.path) continue;

			const seedBlob = decodeIndexedTagsBlob(seedMeta.tags_json ?? null);
			const anchor = buildClusterAnchorSetsFromBlob(seedBlob);
			const seedTitleTokens = extractMeaningfulTitleTokens(seedMeta.path, seedMeta.label ?? s.label);

			const anchorHasNoTags =
				anchor.topics.size === 0 && anchor.functionals.size === 0 && anchor.keywords.size === 0;
			if (anchorHasNoTags && seedTitleTokens.length < 2) {
				v11Log('skip weak anchor (no tags/keywords and <2 title tokens)', s.node_id);
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
				if (prefixes.length && !pathMatchesAnyPrefix(meta.path, prefixes)) continue;

				const blob = decodeIndexedTagsBlob(meta.tags_json ?? null);
				const isSeed = id === s.node_id;
				const sem = isSeed ? 1 : semanticSupportFromEdgeWeight(weightByNeighbor.get(id) ?? 1);
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
						ev.breakdown.affinity >= HUB_CLUSTER_V11_RELAXED_MEMBER_AFFINITY);
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
				v11Log('skip affinity', s.node_id, afterAffinityFilterCount);
				continue;
			}

			const cohesion = computeClusterCohesionFromMembers({
				anchor,
				seedTitleTokens,
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
					cohesionScore: cohesion.cohesionScore,
				},
				cohesionPass,
				rejectReason,
				members: memberDebug,
			};

			if (!cohesionPass) {
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
			const graphScore = Math.min(1, seedStrength * 0.28 + cohesionBlend * 0.45 + sizeScore * 0.27);

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
				rationale: `Cluster V1.1 cohesion=${cohesion.cohesionScore.toFixed(3)} size=${kept.length}`,
			};

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
				stableKey: `cluster:${h}`,
				pagerank: pr,
				semanticPagerank: spr,
				docIncomingCnt: inc,
				docOutgoingCnt: kept.length,
				...singleSourceHubProvenance('cluster', graphScore),
				clusterMemberPaths: memberPaths,
				assemblyHints,
				clusterV11Debug,
			});
		}

		return out.slice(0, limit);
	}

	/**
	 * Full first-pass discovery (all sources, no path hints).
	 */
	private async discoverHubCandidatesFirstRound(options: {
		tenant: IndexTenant;
		budgets: ReturnType<typeof computeHubDiscoverBudgets>;
	}): Promise<HubCandidate[]> {
		const { tenant, budgets } = options;
		const [manual, docs, folders] = await Promise.all([
			this.discoverManualHubCandidates({ tenant }),
			this.discoverDocumentHubCandidates({ tenant, limit: budgets.documentFetchLimit }),
			this.discoverFolderHubCandidates({ tenant, limit: budgets.folderFetchLimit }),
		]);
		const topDocSlice = docs.slice(0, budgets.topDocExcludeLimit);
		const topDocIds = new Set(topDocSlice.map((d) => d.nodeId));
		const clusters = await this.discoverClusterHubCandidates({
			tenant,
			limit: budgets.clusterLimit,
			seedFetchLimit: budgets.clusterSeedFetchLimit,
			excludeNodeIds: topDocIds,
		});
		return [...manual, ...folders, ...docs, ...clusters];
	}

	/**
	 * Targeted discovery for follow-up agent rounds from hints (modes + path prefixes).
	 */
	private async discoverHubCandidatesFollowUpRound(options: {
		tenant: IndexTenant;
		budgets: ReturnType<typeof computeHubDiscoverBudgets>;
		hints: HubDiscoverNextRoundHints;
	}): Promise<HubCandidate[]> {
		const { tenant, budgets, hints } = options;
		const modes = hints.suggestedDiscoveryModes;
		const has = (m: HubDiscoverAgentMode) => modes.includes(m);
		const prefixes = hints.targetPathPrefixes;

		const hubFolder = getAIHubSummaryFolder();
		const rows = await sqliteStoreManager
			.getMobiusNodeRepo(tenant)
			.listTopDocumentNodesForHubDiscovery(Math.max(1, budgets.topDocExcludeLimit), hubFolder);
		const topDocIds = new Set(rows.map((r) => r.node_id));
		const out: HubCandidate[] = [];
		if (has('manual_seed')) {
			out.push(...(await this.discoverManualHubCandidates({ tenant })));
		}
		if (has('document')) {
			out.push(
				...(await this.discoverDocumentHubCandidates({
					tenant,
					limit: budgets.documentFetchLimit,
					targetPathPrefixes: prefixes,
				})),
			);
		}
		if (has('folder')) {
			out.push(
				...(await this.discoverFolderHubCandidates({
					tenant,
					limit: budgets.folderFetchLimit,
					targetPathPrefixes: prefixes,
				})),
			);
		}
		if (has('cluster')) {
			out.push(
				...(await this.discoverClusterHubCandidates({
					tenant,
					limit: budgets.clusterLimit,
					seedFetchLimit: budgets.clusterSeedFetchLimit,
					excludeNodeIds: topDocIds,
					targetPathPrefixes: prefixes,
				})),
			);
		}
		return out;
	}

	/**
	 * Merge sources with priority manual > folder > document > cluster (per stableKey),
	 * agent loop: accumulate pool, greedy selection with pinned hubs, round LLM review drives targeted follow-up.
	 * Resolves hub discovery options from `AppContext.getInstance().settings.search.hubDiscover` merged with defaults.
	 */
	async discoverAllHubCandidates(options?: {
		tenant?: IndexTenant;
		/** DevTools: called after each round summary is built (deterministic metrics). */
		onRoundComplete?: (summary: HubDiscoverRoundSummary) => void;
	}): Promise<HubCandidate[]> {
		const sw = new Stopwatch('HubDiscover.discoverAllHubCandidates');
		const tenant = options?.tenant ?? 'vault';
		const hubDiscoverSetting: HubDiscoverSettings = AppContext.getInstance().settings.search.hubDiscover!;

		// calculate budgets based on document count (how many hub candidates we can discover)
		sw.start('buildDocCoverageIndex');
		const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
		sw.stop();

		sw.start('computeHubDiscoverBudgets');
		const docCount = docCoverageIndex.docCount;
		const budgets = computeHubDiscoverBudgets(docCount);
		sw.stop();

		// possible hubs that had beed discovered several rounds ago.
		let candidatePool: HubCandidate[] = [];
		// hubs that was decided to be kept so far
		let finalSelected: HubCandidate[] = [];
		let hints: HubDiscoverNextRoundHints = {
			roundIndex: 1,
			remainingSlots: budgets.limitTotal,
			targetPathPrefixes: [],
			suggestedDiscoveryModes: [...DEFAULT_MODES_ALL],
			nextDirections: [],
		}
		let roundIndex = 0;
		let discoveryRounds = 0;
		// iterate over rounds
		while (true) {
			roundIndex++;
			const remainingSlots = budgets.limitTotal - finalSelected.length;
			if (remainingSlots <= 0) break;
			if (roundIndex > hubDiscoverSetting.maxRounds) break;

			// discover hub candidates for this round
			discoveryRounds++;
			sw.start(`round${roundIndex}.discoverBatch`);
			const newBatch = roundIndex === 1
				? await this.discoverHubCandidatesFirstRound({ tenant, budgets })
				: await this.discoverHubCandidatesFollowUpRound({
					tenant,
					budgets,
					hints,
				});
			sw.stop();

			// merge candidates with priority manual > folder > document > cluster
			sw.start(`round${roundIndex}.mergeCandidates`);
			candidatePool = mergeCandidatesByPriority([...candidatePool, ...newBatch]);
			sw.stop();
			if (candidatePool.length === 0) break;

			// select hub candidates for this round
			sw.start(`round${roundIndex}.selectHubCandidates`);
			const selection = await selectHubCandidatesMultiRound({
				tenant,
				candidatePool,
				limitTotal: budgets.limitTotal,
				docCoverageIndex,
				// "in the next round, put the ones that were decided to be kept last round first"
				seedSelected: finalSelected.length > 0 ? finalSelected : undefined,
				hubDiscoverSettings: hubDiscoverSetting,
				roundIndex,
			});
			sw.stop();
			const prevKeys = new Set(finalSelected.map((c) => c.stableKey));
			const newlyAdded = selection.selected.filter((c) => !prevKeys.has(c.stableKey));
			finalSelected = selection.selected;

			// Deterministic metrics + gap/overlap hints for this round; fed to `applyHubDiscoverRoundReview` next.
			sw.start(`round${roundIndex}.buildRoundSummary`);
			const summary = await buildHubDiscoverRoundSummary({
				tenant,
				documentCount: docCount,
				mergedPoolSize: candidatePool.length,
				limitTotal: budgets.limitTotal,
				selected: selection.selected,
				stopDecision: selection.stopDecision,
				roundContext: selection.roundContext,
				remainingSlots: budgets.limitTotal - finalSelected.length,
				newlyAddedThisRound: newlyAdded.length,
			});
			sw.stop();
			options?.onRoundComplete?.(summary);

			// LLM review of the round summary
			let review: HubDiscoverRoundReview | null = null;
			if (hubDiscoverSetting!.enableLlmJudge) {
				sw.start(`round${roundIndex}.llmRoundReview`);
				try {
					review = await AppContext.getInstance().manager.streamObjectWithPrompt(
						PromptId.HubDiscoverRoundReview,
						{ roundSummaryJson: JSON.stringify(summary) },
						hubDiscoverRoundReviewLlmSchema,
						{ noReasoning: false },
					);
				} catch (e) {
					console.warn('[applyHubDiscoverRoundReview] Round review failed:', e);
				}
				sw.stop();
			}

			// break checks
			const contDet = selection.stopDecision.continueDiscovery && finalSelected.length < budgets.limitTotal;
			const contLlm = hubDiscoverSetting.enableLlmJudge && review?.needAnotherRound === true;
			console.debug('[discoverAllHubCandidates] break checks', {
				finalSelectedLength: finalSelected.length,
				budgetsLimitTotal: budgets.limitTotal,
				roundIndex,
				maxRounds: hubDiscoverSetting.maxRounds,
				contDet,
				contLlm,
			});
			if (finalSelected.length >= budgets.limitTotal) break;
			if (roundIndex >= hubDiscoverSetting.maxRounds) break;
			if (!contDet && !contLlm) break;
			if (newlyAdded.length === 0 && !contLlm) break;

			// next hints for the next round
			const nextRemaining = budgets.limitTotal - finalSelected.length;
			sw.start(`round${roundIndex}.buildNextRoundHints`);
			hints = await buildNextRoundHints(hubDiscoverSetting, review, summary, nextRemaining, roundIndex + 1);
			console.debug('[buildNextRoundHints] next hints', hints);
			sw.stop();
		}

		sw.print();
		return attachDeterministicAssemblyHints(tenant, finalSelected);
	}
}

/**
 * Builds next-round discovery hints: when LLM judge is on and review exists, merges review fields
 * with summary fallbacks; otherwise uses uncovered-folder stats from the round summary.
 * Deterministic `nextDirections` render `IndexingTemplateId.HubDiscoverNextDirections` with `{ gapPrefixes }`.
 */
async function buildNextRoundHints(
	hubDiscoverSetting: HubDiscoverSettings,
	review: HubDiscoverRoundReview | null,
	summary: HubDiscoverRoundSummary,
	remainingSlots: number,
	nextRoundIndex: number,
): Promise<HubDiscoverNextRoundHints> {
	if (hubDiscoverSetting.enableLlmJudge && review) {
		let modes = (review.suggestedDiscoveryModes ?? []) as HubDiscoverAgentMode[];
		if (!modes.length) {
			modes = summary.topUncoveredFolders.length ? ['folder', 'document', 'cluster'] : [...DEFAULT_MODES_ALL];
		}
		let prefixes = (review.targetPathPrefixes ?? []).map((p) => normalizePath(p.trim())).filter(Boolean);
		if (!prefixes.length && summary.topUncoveredFolders.length) {
			prefixes = summary.topUncoveredFolders.slice(0, 5).map((g) => g.pathPrefix);
		}
		return {
			roundIndex: nextRoundIndex,
			remainingSlots,
			targetPathPrefixes: prefixes,
			suggestedDiscoveryModes: modes.includes('manual_seed') ? modes : ['manual_seed', ...modes],
			nextDirections: review.nextDirections ?? [],
		};
	}

	const gapPrefixes = summary.topUncoveredFolders
		.slice(0, 5)
		.map((g) => g.pathPrefix)
		.filter(Boolean);

	const tm = AppContext.getInstance().manager.getTemplateManager();
	if (!tm) throw new Error('TemplateManager is required for hub discover next-direction hints');
	const nextDirections = [await tm.render(IndexingTemplateId.HubDiscoverNextDirections, { gapPrefixes })];

	return {
		roundIndex: nextRoundIndex,
		remainingSlots,
		targetPathPrefixes: gapPrefixes,
		suggestedDiscoveryModes: ['folder', 'document', 'cluster'],
		nextDirections,
	};
}