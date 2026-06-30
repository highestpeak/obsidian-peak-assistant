// T11Y-2a: narrow read port for 2-hop graph traversal around a node.
//
// This port is intentionally read-only and SQL-shaped: each method maps
// to a single sqlite query (mobius_node lookup, edge neighbor map,
// embedding fetch). The serendipity algorithm — bridge tracking,
// document-like filter, embedding-distance scoring, ordering, and
// AmbientPushItem mapping — lives in `service/ambient/serendipity/
// SerendipitySearcher.ts`, NOT here.
//
// Relationship to SemanticLinkReadPort (T11Y-4b / L2-C):
// Both ports read from the mobius graph but serve different callers:
//
//   SemanticGraphTraversalReadPort (this file) — 2-hop traversal via
//     getNeighborIdsMap + filterToDocumentLikeIds + getNodesByIds (label-
//     only); used exclusively by SerendipitySearcher.
//
//   SemanticLinkReadPort — 1-hop edge neighbors with direction+weight,
//     embedding-similarity search with exclusion set, topic-tag lookup,
//     path-based doc-id resolution; used by SemanticLinkSuggestionService
//     and SmartConnectionService.
//
// The overlap is narrow (both expose a "get node metadata by id"
// primitive) but the returned shapes and callers diverge enough that a
// merge would add unused surface to both. Keep separate.

/** A row of (node_id, node_id of 1-hop neighbor). */
export interface SemanticGraphTraversalNode {
	/** Mobius node id (for document nodes this equals the file path). */
	readonly nodeId: string;
	/** Display label for the node (used as bridge label in serendipity). */
	readonly label: string;
}

/**
 * Narrow read surface over the mobius graph + embedding store, scoped
 * to what the serendipity 2-hop traversal needs. Each method is one
 * sqlite query — no filtering, scoring, or ordering happens here.
 */
export interface SemanticGraphTraversalReadPort {
	/** Look up a node by file path. Returns null when missing. */
	getNodeIdByPath(path: string): Promise<string | null>;

	/** Fetch the cached doc-level embedding for a node. */
	getEmbedding(nodeId: string): Promise<number[] | null>;

	/**
	 * Map from `nodeId` to its direct neighbor `nodeId`s. Mirrors
	 * `MobiusEdgeRepo.getNeighborIdsMap(nodeIds)` byte-for-byte.
	 */
	getNeighborIdsMap(nodeIds: readonly string[]): Promise<Map<string, string[]>>;

	/**
	 * Filter `candidateIds` down to those whose node type is one of the
	 * document-like graph types (the same set the pre-refactor adapter
	 * passed via `GRAPH_DOCUMENT_LIKE_NODE_TYPES`).
	 */
	filterToDocumentLikeIds(candidateIds: readonly string[]): Promise<string[]>;

	/**
	 * Batched node fetch. Keys are `nodeId`. Only `nodeId` and `label`
	 * are exposed — the algorithm never reads other columns from the
	 * graph row.
	 */
	getNodesByIds(ids: readonly string[]): Promise<Map<string, SemanticGraphTraversalNode>>;
}
