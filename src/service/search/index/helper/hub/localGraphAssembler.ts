/**
 * Builds a weighted local subgraph around a hub center using references, contains, and semantic_related edges.
 */

import {
	HUB_ANTI_EXPLOSION_MAX_NEW_NODES,
	HUB_ANTI_EXPLOSION_MIN_NOVELTY_RATIO,
	LOCAL_HUB_GRAPH,
	SLICE_CAPS,
} from '@/core/constant';
import {
	decodeIndexedTagsBlob,
	graphKeywordTagsForMobius,
	type IndexedTagsBlob,
} from '@/core/document/helper/TagService';
import { basenameFromPath, folderPrefixOfPath } from '@/core/utils/file-utils';
import { GraphEdgeType, GraphNodeType } from '@/core/po/graph.po';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { computeHubRankingScore } from './hubDiscover';
import type {
	HubCandidate,
	HubChildRoute,
	HubDocAssemblyContext,
	LocalHubCoverageSummary,
	LocalHubFrontierSummary,
	LocalHubGraph,
	LocalHubGraphEdge,
	LocalHubGraphNode,
	LocalHubNodeRole,
} from './types';

/** Shorthand for hub-local graph tuning (`LOCAL_HUB_GRAPH` in `constant.ts`). */
const LH = LOCAL_HUB_GRAPH;

type EdgeRow = { from_node_id: string; to_node_id: string; type: string; weight: number | null };

type NodeMeta = {
	node_id: string;
	path: string;
	label: string;
	type: string;
	doc_incoming_cnt: number | null;
	doc_outgoing_cnt: number | null;
	other_incoming_cnt: number | null;
	other_outgoing_cnt: number | null;
	pagerank: number | null;
	semantic_pagerank: number | null;
	tags_json: string | null;
};

/** Topic / functional / keyword sets for hub-local tag alignment. */
type AnchorSets = {
	topics: Set<string>;
	functionals: Set<string>;
	keywords: Set<string>;
};

// --- Local graph weights (ranking / anti-explosion) ---

/**
 * Clamp a local graph score into the 0..1 range.
 */
function clampLocalGraphScore(x: number): number {
	return Math.max(0, Math.min(1, x));
}

/**
 * Stop local expansion when growth is too wide or no longer novel (explicit thresholds).
 */
export function shouldStopExpansionLocalCore(
	addedNodes: number,
	novelTokenCount: number,
	maxNewNodes: number,
	minNoveltyRatio: number,
): boolean {
	if (addedNodes > maxNewNodes) return true;
	if (addedNodes <= 0) return false;
	const ratio = novelTokenCount / Math.max(1, addedNodes);
	return ratio < minNoveltyRatio;
}

/**
 * Penalize edges leaving the center folder subtree.
 */
export function crossFolderPenaltySync(centerFolder: string, pathById: Map<string, string>, fromId: string, toId: string): number {
	const p1 = pathById.get(fromId) ?? '';
	const p2 = pathById.get(toId) ?? '';
	const f1 = folderPrefixOfPath(p1);
	const f2 = folderPrefixOfPath(p2);
	if (!centerFolder || !f1 || !f2) return LH.crossFolderPenalty.incompletePaths;
	const sameRoot = f1.startsWith(centerFolder) && f2.startsWith(centerFolder);
	return sameRoot ? 0 : LH.crossFolderPenalty.acrossSubtree;
}

/**
 * Folder-local nodes should look more cohesive than cross-subtree nodes.
 */
export function folderCohesion(path: string, centerFolder: string): number {
	if (!path || !centerFolder) return LH.folderCohesion.defaultWhenMissing;
	return path.startsWith(centerFolder) ? LH.folderCohesion.insideCenterFolder : LH.folderCohesion.outsideCenterFolder;
}

/**
 * Penalize broad bridge nodes so they do not dominate local hub views.
 * Folder rows use materialized subtree boundary totals (doc_* + other_*).
 */
export function bridgePenalty(meta: {
	doc_incoming_cnt: number | null;
	doc_outgoing_cnt: number | null;
	other_incoming_cnt?: number | null;
	other_outgoing_cnt?: number | null;
	type?: string;
}): number {
	let inc = meta.doc_incoming_cnt ?? 0;
	let out = meta.doc_outgoing_cnt ?? 0;
	if (meta.type === GraphNodeType.Folder) {
		inc += meta.other_incoming_cnt ?? 0;
		out += meta.other_outgoing_cnt ?? 0;
	}
	if (inc >= LH.bridgeDegree.highThreshold && out >= LH.bridgeDegree.highThreshold) return LH.bridgeDegree.penalty;
	return 0;
}

/**
 * Compute a stable node weight for hub-local graph ranking and rendering.
 * Optional {@link tagAlignment} (0..1) blends with cohesion when anchor tags exist.
 */
export function computeLocalHubNodeWeight(input: {
	depth: number;
	cohesionScore: number;
	pagerank?: number | null;
	semanticPagerank?: number | null;
	bridgePenalty: number;
	/** 0..1 alignment with hub anchor tags; default 0.5 when omitted. */
	tagAlignment?: number;
}): number {
	const nw = LH.nodeWeight;
	const distPen = 1 / (1 + input.depth * nw.depthDecayPerHop);
	const pr = typeof input.pagerank === 'number' && Number.isFinite(input.pagerank) ? input.pagerank : 0;
	const spr =
		typeof input.semanticPagerank === 'number' && Number.isFinite(input.semanticPagerank)
			? input.semanticPagerank
			: 0;
	const align =
		typeof input.tagAlignment === 'number' && Number.isFinite(input.tagAlignment) ? input.tagAlignment : nw.defaultTagAlignment;
	const effectiveCohesion = nw.cohesionBlendCohesion * input.cohesionScore + nw.cohesionBlendAlignment * align;
	return clampLocalGraphScore(
		nw.quarter * distPen +
		nw.quarter * effectiveCohesion +
		nw.quarter * clampLocalGraphScore(pr * nw.pagerankScale) +
		nw.quarter * clampLocalGraphScore(spr * nw.semanticPagerankScale) -
		input.bridgePenalty * nw.bridgePenaltyScale,
	);
}

/**
 * Compute weighted edge score for hub-local graph ranking and rendering.
 */
export function computeLocalHubEdgeWeight(input: {
	baseWeight?: number | null;
	edgeType: string;
	crossBoundaryPenalty: number;
}): { hubEdgeWeight: number; edgeTypeWeight: number; semanticSupport: number } {
	const ew = LH.edgeWeight;
	const wBase = typeof input.baseWeight === 'number' && Number.isFinite(input.baseWeight) ? input.baseWeight : ew.defaultBase;
	const edgeTypeWeight =
		input.edgeType === GraphEdgeType.References || input.edgeType === GraphEdgeType.ReferencesResource
			? ew.references
			: input.edgeType === GraphEdgeType.Contains
				? ew.contains
				: input.edgeType === GraphEdgeType.SemanticRelated
					? ew.semanticRelated
					: ew.other;
	return {
		hubEdgeWeight: clampLocalGraphScore(
			wBase * edgeTypeWeight * (1 - input.crossBoundaryPenalty * ew.crossPenaltyScale),
		),
		edgeTypeWeight,
		semanticSupport:
			input.edgeType === GraphEdgeType.SemanticRelated ? wBase : 0,
	};
}

/**
 * Hub assembler default: stop using global anti-explosion caps (`HUB_ANTI_EXPLOSION_*`).
 */

function anchorSetsFromBlob(blob: IndexedTagsBlob): AnchorSets {
	const topics = new Set(blob.topicTags);
	for (const e of blob.topicTagEntries ?? []) topics.add(e.id);
	const functionals = new Set(blob.functionalTagEntries.map((e) => e.id));
	const keywords = new Set<string>([...graphKeywordTagsForMobius(blob), ...(blob.textrankKeywordTerms ?? [])]);
	return { topics, functionals, keywords };
}

/**
 * Build anchor sets from discovery hints or center document tags.
 */
function buildAnchorSetsFromCandidateAndCenterBlob(
	candidate: HubCandidate,
	centerBlob: IndexedTagsBlob,
): AnchorSets {
	const h = candidate.assemblyHints;
	if (h && (h.anchorTopicTags.length || h.anchorFunctionalTagIds.length || h.anchorKeywords.length)) {
		return {
			topics: new Set(h.anchorTopicTags),
			functionals: new Set(h.anchorFunctionalTagIds),
			keywords: new Set(h.anchorKeywords),
		};
	}
	return anchorSetsFromBlob(centerBlob);
}

/**
 * Jaccard-style alignment score vs hub anchors (0..1). Neutral 0.5 when anchors are empty.
 */
function tagAlignmentScore(anchor: AnchorSets, blob: IndexedTagsBlob): number {
	const tab = LH.tagAlignmentBlend;
	const n =
		anchor.topics.size + anchor.functionals.size + anchor.keywords.size;
	if (n === 0) return tab.neutralEmptyAnchors;
	const nodeTopics = new Set(blob.topicTags);
	for (const e of blob.topicTagEntries ?? []) nodeTopics.add(e.id);
	const nodeFuncs = new Set(blob.functionalTagEntries.map((e) => e.id));
	const nodeKw = new Set<string>([...graphKeywordTagsForMobius(blob), ...(blob.textrankKeywordTerms ?? [])]);
	const jacc = (a: Set<string>, b: Set<string>) => {
		if (a.size === 0 && b.size === 0) return 1;
		if (a.size === 0 || b.size === 0) return 0;
		let inter = 0;
		for (const x of a) {
			if (b.has(x)) inter++;
		}
		const union = a.size + b.size - inter;
		return union > 0 ? inter / union : 0;
	};
	return clampLocalGraphScore(
		tab.topics * jacc(anchor.topics, nodeTopics) +
		tab.functionals * jacc(anchor.functionals, nodeFuncs) +
		tab.keywords * jacc(anchor.keywords, nodeKw),
	);
}

/** Tokens for novelty: topic/functional/keyword prefixes to avoid collisions. */
function noveltyTokensFromBlob(blob: IndexedTagsBlob): string[] {
	const out: string[] = [];
	for (const t of blob.topicTags) out.push(`t:${t}`);
	for (const e of blob.topicTagEntries ?? []) out.push(`t:${e.id}`);
	for (const e of blob.functionalTagEntries) out.push(`f:${e.id}`);
	for (const k of graphKeywordTagsForMobius(blob)) out.push(`k:${k}`);
	for (const k of blob.textrankKeywordTerms ?? []) out.push(`tr:${k}`);
	return out;
}

function inferRoleHint(meta: NodeMeta, depth: number, isCenter: boolean, isPeerHub: boolean): LocalHubNodeRole {
	if (isCenter) return 'core';
	if (isPeerHub) return 'child_hub';
	if (meta.type === GraphNodeType.Folder) return 'folder';
	const rh = LH.roleHint;
	const inc = meta.doc_incoming_cnt ?? 0;
	const out = meta.doc_outgoing_cnt ?? 0;
	if (depth >= rh.boundaryMinDepth) return 'boundary';
	if (inc >= rh.bridgeMinInc && out >= rh.bridgeMinOut) return 'bridge';
	if (inc + out <= rh.leafMaxTotalDegree) return 'leaf';
	if (inc + out >= rh.bridgeMinTotalDegree) return 'bridge';
	return 'leaf';
}

async function loadNodeMetaBatch(tenant: IndexTenant, nodeIds: string[]): Promise<Map<string, NodeMeta>> {
	const ids = [...new Set(nodeIds)];
	const m = new Map<string, NodeMeta>();
	if (ids.length === 0) return m;
	const rows = await sqliteStoreManager.getMobiusNodeRepo(tenant).listHubLocalGraphNodeMeta(ids);
	for (const r of rows) {
		m.set(r.node_id, {
			node_id: r.node_id,
			path: r.path ?? '',
			label: r.label,
			type: r.type,
			doc_incoming_cnt: r.doc_incoming_cnt,
			doc_outgoing_cnt: r.doc_outgoing_cnt,
			other_incoming_cnt: r.other_incoming_cnt ?? null,
			other_outgoing_cnt: r.other_outgoing_cnt ?? null,
			pagerank: r.pagerank,
			semantic_pagerank: r.semantic_pagerank,
			tags_json: r.tags_json ?? null,
		});
	}
	return m;
}

function buildClusterLocalGraph(candidate: HubCandidate): LocalHubGraph | undefined {
	const paths = candidate.clusterMemberPaths ?? [];
	if (paths.length === 0) return undefined;
	const center = candidate.nodeId;
	const cap = SLICE_CAPS.hub.clusterMemberPaths;
	const ch = LH.clusterHub;
	const nodes: LocalHubGraphNode[] = paths.slice(0, cap).map((p, i) => ({
		nodeId: `cluster:${p}:${i}`,
		path: p,
		label: basenameFromPath(p),
		type: GraphNodeType.Document,
		depth: ch.memberDepth,
		hubNodeWeight: clampLocalGraphScore(ch.memberWeightBase + ch.memberWeightSpread * (1 - i / cap)),
		distancePenalty: ch.memberDistancePenalty,
		cohesionScore: ch.memberCohesion,
		bridgePenalty: 0,
		roleHint: 'leaf' as const,
	}));
	nodes.unshift({
		nodeId: center,
		path: candidate.path,
		label: candidate.label,
		type: GraphNodeType.Document,
		depth: 0,
		hubNodeWeight: ch.centerHubWeight,
		distancePenalty: 0,
		cohesionScore: 1,
		bridgePenalty: 0,
		roleHint: 'core',
	});
	return {
		centerNodeId: center,
		nodes,
		edges: [],
		frontierSummary: {
			stoppedAtDepth: ch.stoppedAtDepth,
			reason: 'cluster_hub',
			boundaryNodeIds: [],
		},
		coverageSummary: {
			topFolderPrefixes: [],
			documentCount: paths.length,
		},
	};
}

/**
 * Builds a bounded, weighted subgraph around a hub center for UI / hub-doc context.
 *
 * Expansion: BFS by hop depth on References, Contains, and SemanticRelated only.
 * Stops early when hitting another hub (optional), when novelty drops (anti-explosion),
 * or when caps (depth / node / edge count) are reached. Nodes and edges are re-scored
 * for this hub view (folder cohesion, tag alignment, bridge penalty, cross-folder edges).
 */
async function buildLocalHubGraphForCandidate(options: {
	tenant: IndexTenant;
	candidate: HubCandidate;
	/** All known hub node ids; used to detect peer hubs and frontier boundaries. */
	hubNodeIdSet: Set<string>;
	maxDepth?: number;
}): Promise<LocalHubGraph | undefined> {
	const { tenant, candidate, hubNodeIdSet } = options;
	const maxDepth = options.maxDepth ?? LH.defaultMaxDepth;
	const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

	if (candidate.sourceKind === 'cluster') {
		return buildClusterLocalGraph(candidate);
	}

	const centerId = candidate.nodeId;
	const centerRowsRaw = await nodeRepo.getHubLocalGraphCenterMeta(centerId);
	const centerRows: NodeMeta | undefined = centerRowsRaw
		? {
			node_id: centerRowsRaw.node_id,
			path: centerRowsRaw.path ?? '',
			label: centerRowsRaw.label,
			type: centerRowsRaw.type,
			doc_incoming_cnt: centerRowsRaw.doc_incoming_cnt,
			doc_outgoing_cnt: centerRowsRaw.doc_outgoing_cnt,
			other_incoming_cnt: centerRowsRaw.other_incoming_cnt ?? null,
			other_outgoing_cnt: centerRowsRaw.other_outgoing_cnt ?? null,
			pagerank: centerRowsRaw.pagerank,
			semantic_pagerank: centerRowsRaw.semantic_pagerank,
			tags_json: centerRowsRaw.tags_json ?? null,
		}
		: undefined;

	if (!centerRows) return undefined;

	// Center directory and tag anchors for scoring neighbor nodes (cohesion + alignment).
	const centerPath = centerRows.path ?? candidate.path;
	const centerFolder = folderPrefixOfPath(centerPath);
	const centerBlob = decodeIndexedTagsBlob(centerRows.tags_json);
	const anchorSets = buildAnchorSetsFromCandidateAndCenterBlob(candidate, centerBlob);
	const assemblyHints = candidate.assemblyHints;
	const preferredChildHubSet = new Set(assemblyHints?.preferredChildHubNodeIds ?? []);
	const stopAtChildHub = assemblyHints?.stopAtChildHub !== false;
	const deprioritizedBridge = new Set(assemblyHints?.deprioritizedBridgeNodeIds ?? []);

	// BFS: visited = subgraph nodes; frontier = current hop; depthById = hops from center.
	const visited = new Set<string>([centerId]);
	const frontier = new Set<string>([centerId]);
	const depthById = new Map<string, number>([[centerId, 0]]);
	// Tracks novelty across expansion to support anti-explosion (low new tag signal => stop).
	const noveltyTokensSeen = new Set<string>();
	const novelBasenames = new Set<string>();
	const edgesAcc: LocalHubGraphEdge[] = [];
	const edgeKey = (a: string, b: string, t: string) => [a, b].sort().join('|') + '|' + t;
	const seenEdgeKeys = new Set<string>();
	// Hubs met at the frontier (peer or preferred child); may not be expanded into when stopAtChildHub.
	const boundaryIds: string[] = [];

	let depth = 0;
	let stopReason = 'max_depth_reached';

	const edgeTypes = [
		GraphEdgeType.References,
		GraphEdgeType.ReferencesResource,
		GraphEdgeType.Contains,
		GraphEdgeType.SemanticRelated,
	];

	while (frontier.size > 0 && depth < maxDepth && visited.size < LH.maxNodes) {
		const frontierIds = [...frontier];
		const rows = (await edgeRepo.listEdgesByTypesIncidentToAnyNode(frontierIds, edgeTypes, LH.edgeQueryLimit)) as EdgeRow[];

		// Incident edges for this layer; neighborByNode drives which neighbors we consider adding.
		const neighborByNode = new Map<string, Set<string>>();
		const neighborEdges: EdgeRow[] = [];
		for (const e of rows) {
			if (!frontier.has(e.from_node_id) && !frontier.has(e.to_node_id)) continue;
			neighborEdges.push(e);
			if (frontier.has(e.from_node_id)) {
				if (!neighborByNode.has(e.from_node_id)) neighborByNode.set(e.from_node_id, new Set());
				neighborByNode.get(e.from_node_id)!.add(e.to_node_id);
			}
			if (frontier.has(e.to_node_id)) {
				if (!neighborByNode.has(e.to_node_id)) neighborByNode.set(e.to_node_id, new Set());
				neighborByNode.get(e.to_node_id)!.add(e.from_node_id);
			}
		}

		const nextFrontier = new Set<string>();
		let addedNodes = 0;
		let novelTokenCount = 0;

		// Add neighbors of the current frontier; skip or boundary-stop at other hubs when configured.
		for (const src of frontier) {
			const neigh = neighborByNode.get(src);
			if (!neigh) continue;
			for (const n of neigh) {
				if (n === centerId) continue;
				const isPeerHub = hubNodeIdSet.has(n) && n !== centerId;
				const isPreferredChild = preferredChildHubSet.has(n);
				if (isPeerHub || isPreferredChild) {
					boundaryIds.push(n);
					if (stopAtChildHub) continue;
				}
				if (visited.has(n)) continue;
				if (visited.size >= LH.maxNodes) break;
				visited.add(n);
				depthById.set(n, depth + 1);
				nextFrontier.add(n);
				addedNodes++;
			}
		}

		// Novelty for this hop: new tag tokens from new nodes; fallback to distinct basenames if tags add nothing.
		if (nextFrontier.size > 0) {
			const newIds = [...nextFrontier];
			const pathMap = await loadNodeMetaBatch(tenant, newIds);
			for (const id of newIds) {
				const raw = pathMap.get(id)?.tags_json ?? null;
				const blob = decodeIndexedTagsBlob(raw);
				for (const tok of noveltyTokensFromBlob(blob)) {
					if (!noveltyTokensSeen.has(tok)) {
						noveltyTokensSeen.add(tok);
						novelTokenCount++;
					}
				}
			}
			if (novelTokenCount === 0 && newIds.length > 0) {
				for (const id of newIds) {
					const p = pathMap.get(id)?.path ?? '';
					const base = basenameFromPath(p);
					if (base && !novelBasenames.has(base)) {
						novelBasenames.add(base);
						novelTokenCount++;
					}
				}
			}
		}

		// Paths for all visited nodes so cross-folder edge penalty can be computed.
		const visitedMeta = await loadNodeMetaBatch(tenant, [...visited]);
		const pathById = new Map<string, string>();
		for (const id of visited) {
			const p = visitedMeta.get(id)?.path ?? '';
			if (p) pathById.set(id, p);
		}

		// Keep edges whose endpoints are both in visited; dedupe by undirected key + type.
		for (const e of neighborEdges) {
			if (edgesAcc.length >= LH.maxEdges) break;
			if (!visited.has(e.from_node_id) || !visited.has(e.to_node_id)) continue;
			const k = edgeKey(e.from_node_id, e.to_node_id, e.type);
			if (seenEdgeKeys.has(k)) continue;
			seenEdgeKeys.add(k);
			const cross = crossFolderPenaltySync(centerFolder, pathById, e.from_node_id, e.to_node_id);
			const weighted = computeLocalHubEdgeWeight({
				baseWeight: e.weight,
				edgeType: e.type,
				crossBoundaryPenalty: cross,
			});
			edgesAcc.push({
				fromNodeId: e.from_node_id,
				toNodeId: e.to_node_id,
				edgeType: e.type,
				hubEdgeWeight: weighted.hubEdgeWeight,
				edgeTypeWeight: weighted.edgeTypeWeight,
				semanticSupport: weighted.semanticSupport,
				crossBoundaryPenalty: cross,
			});
		}

		// Too many new nodes with too little new tag signal => stop before the subgraph explodes.
		if (shouldStopExpansionLocalCore(
			addedNodes,
			novelTokenCount,
			HUB_ANTI_EXPLOSION_MAX_NEW_NODES,
			HUB_ANTI_EXPLOSION_MIN_NOVELTY_RATIO,
		)) {
			stopReason = 'anti_explosion_novelty';
			break;
		}

		// Advance BFS to the next hop.
		frontier.clear();
		for (const n of nextFrontier) frontier.add(n);
		depth++;
		if (frontier.size === 0) {
			stopReason = 'empty_frontier';
			break;
		}
	}

	// Loop may exit with depth < maxDepth; normalize reason when depth cap was the limiter.
	if (depth >= maxDepth) stopReason = 'max_depth_reached';

	const allIds = [...visited];
	const metaMap = await loadNodeMetaBatch(tenant, allIds);
	// Top folder prefixes by document count (truncated path segments) for coverageSummary.
	const folderCounts = new Map<string, number>();
	for (const id of allIds) {
		const p = metaMap.get(id)?.path ?? '';
		if (!p || metaMap.get(id)?.type !== GraphNodeType.Document) continue;
		const fp = folderPrefixOfPath(p);
		const seg = fp.split('/').slice(0, SLICE_CAPS.hub.pathFolderSegmentParts).join('/');
		if (seg) folderCounts.set(seg, (folderCounts.get(seg) ?? 0) + 1);
	}
	const topFolders = [...folderCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, SLICE_CAPS.hub.localGraphTopFolderPrefixes)
		.map(([k]) => k);

	// Final node scores: structure + folder + anchors + PageRank; optional deprioritized bridges.
	const nodes: LocalHubGraphNode[] = [];
	for (const id of allIds) {
		const meta = metaMap.get(id);
		if (!meta) continue;
		const d = depthById.get(id) ?? 0;
		const path = meta.path ?? '';
		const isCenter = id === centerId;
		const isPreferredChild = preferredChildHubSet.has(id);
		const isPeerHubDoc = hubNodeIdSet.has(id) && id !== centerId;
		const isPeerHub = isPeerHubDoc || isPreferredChild;
		const role = inferRoleHint(meta, d, isCenter, isPeerHub);
		const cohesion = folderCohesion(path, centerFolder);
		const bridgeP = bridgePenalty(meta);
		const distPen = 1 / (1 + d * LH.nodeWeight.depthDecayPerHop);
		const nodeBlob = decodeIndexedTagsBlob(meta.tags_json);
		const align = tagAlignmentScore(anchorSets, nodeBlob);
		let hubW = computeLocalHubNodeWeight({
			depth: d,
			cohesionScore: cohesion,
			pagerank: meta.pagerank,
			semanticPagerank: meta.semantic_pagerank,
			bridgePenalty: bridgeP,
			tagAlignment: align,
		});
		if (deprioritizedBridge.has(id)) {
			hubW = clampLocalGraphScore(hubW * LH.deprioritizedBridgeMultiplier);
		}

		nodes.push({
			nodeId: id,
			path,
			label: meta.label || path || id,
			type: meta.type,
			depth: d,
			hubNodeWeight: hubW,
			distancePenalty: 1 - distPen,
			cohesionScore: cohesion,
			bridgePenalty: bridgeP,
			roleHint: role,
			expandPriority: hubW * distPen,
		});
	}

	nodes.sort((a, b) => b.hubNodeWeight - a.hubNodeWeight);

	// stoppedAtDepth is BFS layer count after the last successful advance (may equal maxDepth if loop exited on cap).
	const frontierSummary: LocalHubFrontierSummary = {
		stoppedAtDepth: depth,
		reason: stopReason,
		boundaryNodeIds: [...new Set(boundaryIds)].slice(0, SLICE_CAPS.hub.localGraphBoundaryNodes),
	};

	const coverageSummary: LocalHubCoverageSummary = {
		topFolderPrefixes: topFolders,
		documentCount: nodes.filter((n) => n.type === GraphNodeType.Document).length,
	};

	return {
		centerNodeId: centerId,
		nodes,
		edges: edgesAcc.slice(0, LH.maxEdges),
		frontierSummary,
		coverageSummary,
	};
}

/**
 * Build local graph from a vault path (for inspector). Resolves document node id from path.
 */
export async function buildLocalHubGraphForPath(options: {
	tenant: IndexTenant;
	centerPath: string;
	hubNodeIdSet: Set<string>;
	maxDepth?: number;
}): Promise<LocalHubGraph | undefined> {
	const nodeId = await sqliteStoreManager
		.getMobiusNodeRepo(options.tenant)
		.getHubOrDocumentNodeIdByVaultPath(options.centerPath);
	if (!nodeId) return undefined;
	const candidate: HubCandidate = {
		nodeId,
		path: options.centerPath,
		label: options.centerPath.split('/').pop() ?? options.centerPath,
		role: 'authority',
		graphScore: 1,
		stableKey: `path:${options.centerPath}`,
		docIncomingCnt: 0,
		docOutgoingCnt: 0,
		sourceKind: 'document',
		sourceKinds: ['document'],
		sourceEvidence: [{ kind: 'document', graphScore: 1 }],
		sourceConsensusScore: 0,
		rankingScore: computeHubRankingScore(1, 0),
	};
	return buildLocalHubGraphForCandidate({
		tenant: options.tenant,
		candidate,
		hubNodeIdSet: options.hubNodeIdSet,
		maxDepth: options.maxDepth,
	});
}

// --- HubDoc assembly: fold LocalHubGraph into HubDoc hints (external exits + internal samples) ---
// Folder hubs may merge graph-based samples with DB folder sampling in resolveHubDocAssembly.

/**
 * Derives HubDoc assembly fields from a weighted local graph around one hub center.
 *
 * Mental model: **external exits** + **internal representative samples** (not full neighborhood lists).
 * - childHubRoutes: frontier boundary nodes that are also known hubs — “where to go next” from this hub.
 * - memberPathsSample: document nodes in the local view, ranked by hubNodeWeight — “what this hub is about”.
 * - localHubGraph: full bounded subgraph for UI / LLM / debugging.
 */
function mergeAssemblyFromLocal(hubNodeIdSet: Set<string>, local: LocalHubGraph): HubDocAssemblyContext {
	const childHubRoutes: HubChildRoute[] = [];
	// External exits: only boundary ids that are hubs; expansion stopped at the frontier, not mid-graph.
	for (const bid of local.frontierSummary.boundaryNodeIds) {
		if (!hubNodeIdSet.has(bid)) continue;
		const node = local.nodes.find((n) => n.nodeId === bid);
		if (!node?.path) continue;
		childHubRoutes.push({
			nodeId: bid,
			path: node.path,
			label: node.label || node.path.split('/').pop() || node.path,
		});
	}

	const seen = new Set<string>();
	const routes = childHubRoutes.filter((r) => {
		if (seen.has(r.nodeId)) return false;
		seen.add(r.nodeId);
		return true;
	});

	// Internal samples: documents inside the local view, not every doc under the vault folder/cluster.
	const memberPathsSample = local.nodes
		.filter((n) => n.type === GraphNodeType.Document)
		.sort((a, b) => b.hubNodeWeight - a.hubNodeWeight)
		.map((n) => n.path)
		.filter(Boolean)
		.slice(0, SLICE_CAPS.hub.assemblyMemberPathsSample);
	return {
		childHubRoutes: routes.length ? routes : undefined,
		memberPathsSample: memberPathsSample.length ? memberPathsSample : undefined,
		localHubGraph: local,
	};
}

/**
 * Builds HubDoc assembly for a candidate: local weighted graph plus optional folder/cluster merges.
 * Delegates the “external exits + internal samples” fold to mergeAssemblyFromLocal when a graph exists.
 */
export async function resolveHubDocAssembly(
	c: HubCandidate,
	hubNodeIdSet: Set<string>,
): Promise<HubDocAssemblyContext | undefined> {
	const tenant: IndexTenant = 'vault';
	const local = await buildLocalHubGraphForCandidate({ tenant, candidate: c, hubNodeIdSet });

	if (c.sourceKind === 'manual' || c.sourceKind === 'document') {
		if (!local) {
			return { memberPathsSample: [c.path], localHubGraph: undefined };
		}
		return mergeAssemblyFromLocal(hubNodeIdSet, local);
	}
	if (c.sourceKind === 'folder') {
		const baseSample = await sqliteStoreManager
			.getMobiusNodeRepo(tenant)
			.listFolderHubDocMemberPathsSample(c.path);
		if (!local) {
			return { memberPathsSample: baseSample, localHubGraph: undefined };
		}
		const merged = mergeAssemblyFromLocal(hubNodeIdSet, local);
		if (!merged.memberPathsSample?.length) {
			merged.memberPathsSample = baseSample;
		} else if (baseSample.length) {
			merged.memberPathsSample = [...new Set([...merged.memberPathsSample, ...baseSample])].slice(
				0,
				SLICE_CAPS.hub.memberPathsMergedSample,
			);
		}
		return merged;
	}
	if (c.sourceKind === 'cluster') {
		if (!local) {
			return { clusterMemberPaths: c.clusterMemberPaths, localHubGraph: undefined };
		}
		return {
			...mergeAssemblyFromLocal(hubNodeIdSet, local),
			clusterMemberPaths: c.clusterMemberPaths,
		};
	}
	return undefined;
}
