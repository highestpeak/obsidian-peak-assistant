/**
 * Peak Composer — related-material snapshot + port (WP9, handoff §12.4 / spec
 * §Related-material browser).
 *
 * The Sidecar shows a BOUNDED local preview of the current block's neighbourhood
 * (5–7 strongest material nodes, weak links hidden). `打开完整视图` opens a
 * Composer-owned wide modal that hosts the shared Result Browser over the SAME
 * immutable snapshot — it does not navigate to Quick Search and never re-queries
 * (that adapter lives in `sidecar/ComposerResultBrowserAdapter.ts`).
 *
 * The snapshot itself is produced by an app-composed port over the existing
 * search / semantic infrastructure (`resultSubgraph.ts`); this module owns the
 * neutral snapshot shape, the port interface, and the pure bounded-preview
 * selection. No service singleton, no direct DB access.
 */

import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';

/** Graph layout presets — locked to the shared Result Browser vocabulary. */
export type RelatedGraphPreset = 'constellation' | 'flow-tb' | 'flow-lr' | 'folder' | 'orbit';

/**
 * One immutable related-material snapshot (spec §"同源" contract). `items` is the
 * complete ranked set (List/Folder source); `graph` is its capped projection.
 * The Composer block locator lives in `focus.anchorId` and is NEVER disguised as
 * a Vault source/node id.
 */
export interface ComposerRelatedMaterialSnapshot {
	readonly revision: string;
	readonly focus: { readonly anchorId: string; readonly rootNodeId: string };
	readonly items: readonly SearchResultItem[];
	readonly graph: ResultSubgraphOutput;
	/** node id → source id map (graph node ids are a subset of item source ids). */
	readonly sourceIdByNodeId: Readonly<Record<string, string>>;
	/** source id → app-owned relation reason (why this material is related). */
	readonly reasonBySourceId: Readonly<Record<string, string>>;
	/** Weak nodes (hidden in the local preview; app-owned overlay, not an edge kind). */
	readonly weakNodeIds: readonly string[];
	readonly weakEdgeKeys: readonly string[];
}

/**
 * App-composed port that builds a frozen related-material snapshot for a focus
 * block. The implementation wires the existing subgraph service; the Sidecar
 * never touches the search store directly.
 */
export interface ComposerRelatedMaterialsPort {
	/**
	 * Build one immutable snapshot for the given focus block; one build per refresh.
	 * `focusText` is the verbatim text of the focused block (or a document excerpt)
	 * the app resolves from chrome focus — the query source for the related search.
	 * An unavailable / uninitialised search service returns an EMPTY snapshot
	 * (never throws): the Sidecar already degrades to an empty brief.
	 */
	buildSnapshot(focus: {
		anchorId: string;
		documentId: string;
		focusText?: string;
	}): Promise<ComposerRelatedMaterialSnapshot>;
}

/** An empty snapshot for a focus — the safe degraded value when search is unavailable. */
export function emptyRelatedSnapshot(focus: {
	anchorId: string;
	documentId: string;
}): ComposerRelatedMaterialSnapshot {
	return {
		revision: 'r0',
		focus: { anchorId: focus.anchorId, rootNodeId: focus.documentId },
		items: [],
		graph: { resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 },
		sourceIdByNodeId: {},
		reasonBySourceId: {},
		weakNodeIds: [],
		weakEdgeKeys: [],
	};
}

/** Inputs to the pure related-snapshot mapper (search results → frozen snapshot). */
export interface RelatedSnapshotMapInput {
	readonly focus: { readonly anchorId: string; readonly rootNodeId: string };
	readonly revision: string;
	/** The complete ranked result set (self already excluded by the caller). */
	readonly items: readonly SearchResultItem[];
	/** Cap on graph node projection (sidecar config `graphNodeCap`). */
	readonly graphNodeCap: number;
	/** App-owned relation reason per source id (why related). Missing ⇒ ''. */
	readonly reasonBySourceId?: Readonly<Record<string, string>>;
	/** Source ids to mark weak (hidden in the local preview; app-owned overlay). */
	readonly weakSourceIds?: readonly string[];
}

/**
 * Pure mapper: search results → a frozen {@link ComposerRelatedMaterialSnapshot}.
 * The graph is a bounded NODE-ONLY projection of the ranked items (top
 * `graphNodeCap` by score) — real edge fitting is a later pass (WP9b legacy).
 * Node ids equal source ids here, so `sourceIdByNodeId` is the identity map over
 * the projected nodes. Deterministic and side-effect free (unit-tested).
 */
export function buildRelatedSnapshot(input: RelatedSnapshotMapInput): ComposerRelatedMaterialSnapshot {
	const scoreOf = (it: SearchResultItem): number => it.finalScore ?? it.score ?? 0;
	const ranked = [...input.items].sort((a, b) => scoreOf(b) - scoreOf(a));
	const cap = Math.max(0, Math.floor(input.graphNodeCap));
	const projected = ranked.slice(0, cap);
	const resultNodes = projected.map((it) => ({
		id: it.id,
		path: it.path,
		title: it.title,
		score: scoreOf(it),
		communityId: null,
		folder: topFolderOf(it.path),
	}));
	const sourceIdByNodeId: Record<string, string> = {};
	for (const node of resultNodes) sourceIdByNodeId[node.id] = node.id;
	const reasonBySourceId: Record<string, string> = {};
	for (const it of ranked) reasonBySourceId[it.id] = input.reasonBySourceId?.[it.id] ?? '';
	return {
		revision: input.revision,
		focus: { anchorId: input.focus.anchorId, rootNodeId: input.focus.rootNodeId },
		items: ranked,
		graph: {
			resultNodes,
			hubAnchors: [],
			edges: [],
			isolatedDocIds: resultNodes.map((n) => n.id),
			overflowCount: Math.max(0, ranked.length - cap),
		},
		sourceIdByNodeId,
		reasonBySourceId,
		weakNodeIds: [...(input.weakSourceIds ?? [])],
		weakEdgeKeys: [],
	};
}

/** Top-level folder segment of a vault path (mirrors the subgraph `folder` field). */
function topFolderOf(path: string): string {
	const slash = path.indexOf('/');
	return slash > 0 ? path.slice(0, slash) : '';
}

/** One bounded-preview node the Sidecar renders (strongest neighbourhood only). */
export interface RelatedPreviewNode {
	readonly sourceId: string;
	readonly title: string;
	readonly path: string;
	readonly reason: string;
	readonly excerpt: string;
	readonly score: number;
}

/**
 * The bounded local preview (handoff §12.4): the strongest `cap` NON-weak
 * material nodes for the focused object, highest score first. Weak nodes are
 * excluded — they only appear in the wide explorer. Pure and side-effect free.
 */
export function selectLocalPreview(
	snapshot: ComposerRelatedMaterialSnapshot,
	cap: number,
	excerptMaxChars: number,
): readonly RelatedPreviewNode[] {
	const weak = new Set(snapshot.weakNodeIds);
	const weakSources = new Set<string>();
	for (const nodeId of snapshot.weakNodeIds) {
		const src = snapshot.sourceIdByNodeId[nodeId];
		if (src) weakSources.add(src);
	}
	const nodes: RelatedPreviewNode[] = [];
	for (const item of snapshot.items) {
		if (weakSources.has(item.id) || weak.has(item.id)) continue;
		if (item.id === snapshot.focus.rootNodeId) continue; // never preview the focus itself
		nodes.push({
			sourceId: item.id,
			title: item.title,
			path: item.path,
			reason: snapshot.reasonBySourceId[item.id] ?? '',
			excerpt: relatedMaterialExcerpt(item.highlight?.text ?? item.content ?? '', excerptMaxChars),
			score: item.finalScore ?? item.score ?? 0,
		});
	}
	nodes.sort((a, b) => b.score - a.score);
	return nodes.slice(0, Math.max(0, cap));
}

function relatedMaterialExcerpt(content: string, maxChars: number): string {
	let readable = content.trim();
	if (readable.startsWith('---')) {
		const closingDelimiter = readable.indexOf('\n---', 3);
		if (closingDelimiter >= 0) readable = readable.slice(closingDelimiter + 4).trim();
	}
	return readable.slice(0, Math.max(0, maxChars));
}

/**
 * The COMPLETE material count (spec §"同源"): only ever `items.length`. It must
 * NOT be inferred from graph node count or `overflowCount` (that only reflects
 * the builder node-cap). Exposed as a helper so callers can't reach for the
 * wrong number.
 */
export function relatedMaterialCount(snapshot: ComposerRelatedMaterialSnapshot): number {
	return snapshot.items.length;
}
