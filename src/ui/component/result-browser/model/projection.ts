/**
 * Projection invariants for the shared Result Browser (plan §"Shared
 * contracts" #3). The three views project the *same* snapshot; these pure
 * helpers derive each view's id set so hosts and tests can assert the
 * cross-view guarantees without rendering React:
 *
 *  - List leaf ids equal Tree file ids (same items, different shape).
 *  - Graph result ids are a subset of the List ids, and must include the
 *    root (top-ranked item) plus the current selection when both are within
 *    the graph's node cap.
 */
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import type { ResultItemId } from './types';
import { stableItemId } from './stableKey';
import { buildResultTree, flattenVisibleFiles, type TreeNode } from './buildTree';

/** Ordered stable ids for the List projection. */
export function listItemIds(items: readonly SearchResultItem[]): ResultItemId[] {
	return items.map((it) => stableItemId(it)).filter((id) => id.length > 0);
}

/** Stable ids for every file leaf in the Tree projection (order-independent). */
export function treeFileIds(items: readonly SearchResultItem[]): ResultItemId[] {
	const tree = buildResultTree(items);
	const files = flattenVisibleFiles(tree, new Set());
	return files.map((f) => stableItemId(f.result)).filter((id) => id.length > 0);
}

/**
 * Stable ids for the Graph projection (result nodes only, not hub anchors).
 * A graph node's `id` is already the stable id — the subgraph builder assigns
 * `docId ?? path ?? id` when it synthesizes nodes — so it is used verbatim.
 */
export function graphResultIds(subgraph: ResultSubgraphOutput | null): ResultItemId[] {
	if (!subgraph) return [];
	return subgraph.resultNodes.map((n) => n.id).filter((id) => typeof id === 'string' && id.length > 0);
}

/** The root (top-ranked) item's stable id, or `null` for an empty set. */
export function rootItemId(items: readonly SearchResultItem[]): ResultItemId | null {
	for (const it of items) {
		const id = stableItemId(it);
		if (id.length > 0) return id;
	}
	return null;
}

/**
 * List/Tree parity: the two views must project the exact same set of item
 * ids (Tree only regroups the flat list into folders). Order may differ
 * (List is score-sorted, Tree is folder-sorted) so this compares as sets.
 */
export function listTreeIdsMatch(items: readonly SearchResultItem[]): boolean {
	return sameSet(listItemIds(items), treeFileIds(items));
}

/** Every graph result id is present in the list id set (subset invariant). */
export function graphIsSubsetOfList(
	items: readonly SearchResultItem[],
	subgraph: ResultSubgraphOutput | null,
): boolean {
	const listSet = new Set(listItemIds(items));
	return graphResultIds(subgraph).every((id) => listSet.has(id));
}

/**
 * The graph must include the root and (when set) the current selection,
 * provided each is a real result that fits within the cap. When the result
 * count exceeds `nodeCap` the graph is a trimmed subset, but the root and the
 * actively selected node are pinned in so navigation never loses focus.
 *
 * `selectedId === null` means "no selection"; it is vacuously satisfied.
 */
export function graphIncludesRootAndSelected(
	items: readonly SearchResultItem[],
	subgraph: ResultSubgraphOutput | null,
	selectedId: ResultItemId | null,
): boolean {
	// A not-yet-computed graph (host still enriching) is vacuously valid — the
	// canvas shows an empty frame, no invariant to violate.
	if (!subgraph) return true;
	const graphSet = new Set(graphResultIds(subgraph));
	const root = rootItemId(items);
	if (root !== null && !graphSet.has(root)) return false;
	if (selectedId && listItemIds(items).includes(selectedId) && !graphSet.has(selectedId)) {
		return false;
	}
	return true;
}

/** Number of files reachable in the tree (for count assertions). */
export function countTreeFiles(nodes: TreeNode[]): number {
	let n = 0;
	for (const node of nodes) {
		if (node.kind === 'file') n += 1;
		else n += countTreeFiles(node.children);
	}
	return n;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) {
		// length can legitimately differ if the same path appears twice; compare
		// as sets below, but a fast unequal-set exit needs the set sizes.
	}
	const sa = new Set(a);
	const sb = new Set(b);
	if (sa.size !== sb.size) return false;
	for (const id of sa) if (!sb.has(id)) return false;
	return true;
}
