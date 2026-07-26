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
	/** Build one immutable snapshot for the given focus block; one build per refresh. */
	buildSnapshot(focus: { anchorId: string; documentId: string }): Promise<ComposerRelatedMaterialSnapshot>;
}

/** One bounded-preview node the Sidecar renders (strongest neighbourhood only). */
export interface RelatedPreviewNode {
	readonly sourceId: string;
	readonly title: string;
	readonly path: string;
	readonly reason: string;
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
			score: item.finalScore ?? item.score ?? 0,
		});
	}
	nodes.sort((a, b) => b.score - a.score);
	return nodes.slice(0, Math.max(0, cap));
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
