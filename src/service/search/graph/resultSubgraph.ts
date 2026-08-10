/**
 * Result Subgraph Service (T2a).
 *
 * Turns a flat search result list into a subgraph — nodes + edges + hub
 * anchors + isolated list + overflow count — for the Result Graph View to
 * render.
 *
 * Spec: docs/superpowers/specs/2026-07-07-vault-search-heading-graph-navigation.md
 *   §Result Graph View · Content Layers, §Isolated Result Nodes, §Node Cap.
 * Plan: docs/superpowers/plans/2026-07-07-vault-search-heading-and-result-graph.md
 *   §T2a.
 */
import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';
import type { CommunityDescriptor } from '@/core/search/structuralTypes';

export interface ResultGraphCommunitySummary {
	id: string;
	displayLabel: string;
	fingerprint: string;
	memberCount: number;
	visibleMemberIds: string[];
	descriptors: CommunityDescriptor[];
	internalReferenceCount: number;
	analysisVersion: number;
	analysisMode: 'exact' | 'bounded';
	analyzedNodeCount: number;
	totalNodeCount: number;
	representativeNotes: Array<{ path: string; label: string }>;
}

// ─── LOCKED type contract (integration surface with T4 / T6) ─────────────────

export interface ResultSubgraphInput {
    resultDocIds: string[];
    matchScores: Map<string, number>;
    nodeCap: number; // default 100
}

export interface ResultSubgraphOutput {
    resultNodes: Array<{
        id: string;
        path: string;
        title: string;
        score: number;
        communityId: string | null;
        folder: string;
		preview?: string;
		signals?: string[];
		incomingLinks?: number;
		outgoingLinks?: number;
    }>;
    hubAnchors: Array<{ id: string; path: string; title: string; constituentCount: number }>;
    edges: Array<{
        from: string;
        to: string;
        kind: 'reference' | 'semantic' | 'hub_constituent';
        directionality?: GraphEdgeDirectionality;
    }>;
    isolatedDocIds: string[];
    overflowCount: number; // N - nodeCap when trimmed
	communities?: ResultGraphCommunitySummary[];
}

// ─── Narrow port shape (no direct DB / no AppContext.getInstance) ────────────

/**
 * Narrow adapter surface for the subgraph builder.
 *
 * Kept as an interface (not concrete repo types) so tests can supply
 * in-memory fakes and so app-layer composition can wire real repos via
 * thin adapter closures.
 */
export interface ResultSubgraphDeps {
    /**
     * Node metadata for a batch of doc ids. `folder` is the top-level folder
     * segment (spec §Content Layers · Folder groupings first cut). Missing ids
     * simply do not appear in the returned map.
     */
    getNodeMetadata(
        docIds: string[],
    ): Promise<Map<string, {
		path: string;
		title: string;
		communityId: string | null;
		folder: string;
		preview?: string;
		signals?: string[];
		incomingLinks?: number;
		outgoingLinks?: number;
	}>>;

	/** Evidence-rich computed metadata for the requested ephemeral community ids. */
	getCommunityMetadata?(
		communityIds: string[],
	): Promise<Map<string, Omit<ResultGraphCommunitySummary, 'displayLabel' | 'visibleMemberIds'>>>;

    /** Hub node ids for which the given doc is a constituent. */
    getHubsForMemberDoc(docId: string): Promise<string[]>;

    /** Metadata + constituent count for a batch of hub node ids. */
    getHubAnchorMetadata(
        hubIds: string[],
    ): Promise<Map<string, { path: string; title: string; constituentCount: number }>>;

    /**
     * Edges among the given node id set. Only edges whose BOTH endpoints are
     * inside `nodeIds` are returned. `kind` maps mobius_edge type →
     *   references / references_resource → 'reference'
     *   semantic_related                  → 'semantic'
     */
    getStructuralEdgesWithin(
        nodeIds: string[],
    ): Promise<Array<{
        from: string;
        to: string;
        kind: 'reference' | 'semantic';
        directionality?: GraphEdgeDirectionality;
    }>>;

    /**
     * Hub-constituent edges among the given result doc set and hub anchor set.
     * Emits one edge per (hub_anchor, result_doc) constituent pair.
     */
    getHubConstituentEdges(
        hubIds: string[],
        resultDocIds: string[],
    ): Promise<Array<{ from: string; to: string }>>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Silent cap on hub anchor count (spec risk mitigation for very broad queries). */
const HUB_ANCHOR_CAP = 20;

// ─── Implementation ──────────────────────────────────────────────────────────

export async function buildResultSubgraph(
    deps: ResultSubgraphDeps,
    input: ResultSubgraphInput,
): Promise<ResultSubgraphOutput> {
    const { resultDocIds, matchScores } = input;
    const nodeCap = Math.max(0, Math.floor(input.nodeCap));

    // 1. Trim result docs to top `nodeCap` by match score.
    const sortedDocIds = [...resultDocIds].sort(
        (a, b) => scoreOf(matchScores, b) - scoreOf(matchScores, a),
    );
    const trimmedDocIds = sortedDocIds.slice(0, nodeCap);
    const overflowCount = Math.max(0, resultDocIds.length - nodeCap);

    if (!trimmedDocIds.length) {
        return { resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount };
    }

    // 2. Hub anchor discovery: union of hub ids across all trimmed result docs.
    const hubIdSet = new Set<string>();
    const hubMembershipByDoc = new Map<string, string[]>();
    for (const docId of trimmedDocIds) {
        const hubs = await deps.getHubsForMemberDoc(docId);
        hubMembershipByDoc.set(docId, hubs);
        for (const h of hubs) hubIdSet.add(h);
    }

    // Rank hub anchors by number of member-docs-in-results, keep top HUB_ANCHOR_CAP.
    // (Silent enforcement — spec risk mitigation for very broad queries.)
    const hubMemberCount = new Map<string, number>();
    for (const [, hubs] of hubMembershipByDoc) {
        for (const h of hubs) hubMemberCount.set(h, (hubMemberCount.get(h) ?? 0) + 1);
    }
    const rankedHubIds = [...hubIdSet].sort(
        (a, b) => (hubMemberCount.get(b) ?? 0) - (hubMemberCount.get(a) ?? 0),
    );
    const keptHubIds = rankedHubIds.slice(0, HUB_ANCHOR_CAP);
    const keptHubIdSet = new Set(keptHubIds);

    // 3. Node metadata (result docs + hub anchors).
    const [docMeta, hubMeta] = await Promise.all([
        deps.getNodeMetadata(trimmedDocIds),
        deps.getHubAnchorMetadata(keptHubIds),
    ]);

    const resultNodes: ResultSubgraphOutput['resultNodes'] = trimmedDocIds.map((id) => {
        const m = docMeta.get(id);
        return {
            id,
            path: m?.path ?? '',
            title: m?.title ?? '',
            score: scoreOf(matchScores, id),
            communityId: m?.communityId ?? null,
            folder: m?.folder ?? '',
			...(m?.preview ? { preview: m.preview } : {}),
			...(m?.signals?.length ? { signals: m.signals } : {}),
			...(typeof m?.incomingLinks === 'number' ? { incomingLinks: m.incomingLinks } : {}),
			...(typeof m?.outgoingLinks === 'number' ? { outgoingLinks: m.outgoingLinks } : {}),
        };
    });

    const hubAnchors: ResultSubgraphOutput['hubAnchors'] = keptHubIds.map((id) => {
        const m = hubMeta.get(id);
        return {
            id,
            path: m?.path ?? '',
            title: m?.title ?? '',
            constituentCount: m?.constituentCount ?? 0,
        };
    });

    // 4. Structural edges — both endpoints must be inside {trimmed docs} ∪ {hub anchors}.
    const scopeIds = [...trimmedDocIds, ...keptHubIds];
    const structuralEdges = await deps.getStructuralEdgesWithin(scopeIds);

    // 5. Hub-constituent edges (hub_anchor ↔ result_doc).
    const hubConstituentEdges = keptHubIds.length
        ? await deps.getHubConstituentEdges(keptHubIds, trimmedDocIds)
        : [];

    const trimmedDocSet = new Set(trimmedDocIds);
    const scopeSet = new Set(scopeIds);

    const edges: ResultSubgraphOutput['edges'] = [];
    for (const e of structuralEdges) {
        // Defensive: adapter contract says both endpoints in scope; enforce anyway.
        if (!scopeSet.has(e.from) || !scopeSet.has(e.to)) continue;
        edges.push({
            from: e.from,
            to: e.to,
            kind: e.kind,
            directionality: e.directionality,
        });
    }
    for (const e of hubConstituentEdges) {
        if (!keptHubIdSet.has(e.from) || !trimmedDocSet.has(e.to)) continue;
        edges.push({
            from: e.from,
            to: e.to,
            kind: 'hub_constituent',
            directionality: 'directed',
        });
    }

    // 6. Isolated partition — a result doc is isolated when it has NO
    //    'reference' or 'hub_constituent' edge to any other result doc or hub
    //    anchor. Semantic-only connection still counts as isolated (per spec
    //    §Isolated Result Nodes + §Content Layers · Semantic overlay).
    const connectedDocs = new Set<string>();
    for (const e of edges) {
        if (e.kind === 'semantic') continue;
        if (trimmedDocSet.has(e.from)) connectedDocs.add(e.from);
        if (trimmedDocSet.has(e.to)) connectedDocs.add(e.to);
    }

    const isolatedDocIds = trimmedDocIds.filter((id) => !connectedDocs.has(id));

	const communityIds = [...new Set(resultNodes.flatMap((node) => node.communityId ? [node.communityId] : []))];
	const communityMetadata = deps.getCommunityMetadata && communityIds.length
		? await deps.getCommunityMetadata(communityIds)
		: new Map<string, Omit<ResultGraphCommunitySummary, 'displayLabel' | 'visibleMemberIds'>>();
	const communities: ResultGraphCommunitySummary[] = [];
	for (const communityId of communityIds) {
		const meta = communityMetadata.get(communityId);
		if (!meta) continue;
		const visibleMemberIds = resultNodes
			.filter((node) => node.communityId === communityId)
			.map((node) => node.id);
		communities.push({
			...meta,
			id: communityId,
			displayLabel: `Community ${String(communities.length + 1).padStart(2, '0')}`,
			visibleMemberIds,
		});
	}

    return { resultNodes, hubAnchors, edges, isolatedDocIds, overflowCount, communities };
}

function scoreOf(scores: Map<string, number>, id: string): number {
    const v = scores.get(id);
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
