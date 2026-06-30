// T11Y-4b: narrow, SQL-only read port for the two Copilot semantic-link
// suggestion algorithms (`suggest-semantic-links` + `smart-connections`).
//
// Scope deliberately small:
//   - 1-hop edge neighbors of a document node (in + out) with weights;
//   - node metadata (path + label) lookup;
//   - embedding-similarity neighbor lookup with an exclusion set;
//   - doc-id lookup by path + topic-tag lookup for shared-theme scoring.
//
// What the port does NOT do (the *services* own these):
//   - merging in/out edges, fallback weights, filtering existing links;
//   - sorting, top-N truncation, title/snippet rendering;
//   - shared-theme intersection or similarity parsing;
//   - any error wrapping into "indexed: false" — callers translate sqlite
//     failures themselves so the adapter stays a pure read surface.
//
// Relationship to SemanticGraphTraversalReadPort (T11Y-2a / L2-A):
// The two ports share the "graph read" subject but serve different callers
// and differ in enough specifics that a merge would bloat both interfaces:
//
//   SemanticGraphTraversalReadPort — 2-hop traversal, getNeighborIdsMap,
//     filterToDocumentLikeIds, getNodesByIds; used by SerendipitySearcher.
//
//   SemanticLinkReadPort (this file) — 1-hop edge neighbors with direction
//     + weight, embedding-similarity search with exclusion set, topic-tag
//     lookup, indexed-doc-id resolution by path; used by
//     SemanticLinkSuggestionService + SmartConnectionService.
//
// The overlapping primitive is "look up node metadata by id" (both expose
// something like getNodesByIds / getGraphNodeMetaByIds), but the returned
// shapes differ (label-only vs. path+label+nodeId) and their callers
// never cross-call. Keeping two narrow ports is intentional; do not merge
// unless both callers converge on the same traversal algorithm.

/** Raw graph neighbor of a document node returned by the read port. */
export interface SemanticGraphNeighbor {
	/** Mobius node id of the neighbor. */
	nodeId: string;
	/** Edge weight as stored. */
	weight: number;
	/** Edge direction relative to the source document node. */
	direction: 'outgoing' | 'incoming';
}

/** Plain metadata snapshot for a single graph node. */
export interface SemanticGraphNodeMeta {
	nodeId: string;
	path: string | null;
	label: string;
}

/** Embedding-similarity neighbor returned by the read port. */
export interface SemanticEmbeddingNeighbor {
	/** Indexed-document id (NOT the graph node id). */
	docId: string;
	/** Vault path of the indexed document. Null if attributes are missing. */
	path: string | null;
	/** Human label (typically the title). */
	label: string;
	/** Similarity in [0,1]. The adapter parses sqlite's `"NN.N%"` shape. */
	similarity: number;
}

/**
 * Narrow read port owned by the SQLite layer. Implementations MUST NOT
 * filter, rank, or rewrite — callers do that themselves so multiple
 * services can reuse the same primitives.
 */
export interface SemanticLinkReadPort {
	/**
	 * 1-hop semantic edges of the document at `filePath` (both outgoing
	 * and incoming `SemanticRelated` edges).
	 *
	 * Returns `null` when the document has no graph node — callers
	 * interpret this as "not indexed yet".
	 */
	getOneHopSemanticNeighbors(filePath: string): Promise<{
		neighbors: SemanticGraphNeighbor[];
	} | null>;

	/** Look up `{path, label}` for a batch of graph node ids. */
	getGraphNodeMetaByIds(nodeIds: ReadonlyArray<string>): Promise<Map<string, SemanticGraphNodeMeta>>;

	/**
	 * Embedding-similarity neighbors for the indexed document at `filePath`.
	 * The exclusion set lists indexed-document ids that should be filtered
	 * out at the SQL level (existing-link membership). Returns `null` when
	 * the document is not indexed.
	 */
	getEmbeddingNeighbors(
		filePath: string,
		options: { limit: number; excludeDocIds: ReadonlySet<string> },
	): Promise<{ neighbors: SemanticEmbeddingNeighbor[] } | null>;

	/** Resolve indexed-document ids for a batch of vault paths. */
	getIndexedDocumentIdsByPaths(paths: ReadonlyArray<string>): Promise<Map<string, string>>;

	/** Look up topic-tag sets for a batch of indexed-document ids. */
	getTopicTagsByDocIds(docIds: ReadonlyArray<string>): Promise<Map<string, ReadonlySet<string>>>;
}
