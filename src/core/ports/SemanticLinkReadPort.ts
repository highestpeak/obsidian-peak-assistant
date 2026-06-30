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
// Note: L2-A is introducing a wider `SemanticGraphTraversalReadPort` in
// the same refactor wave. The two ports overlap in subject matter
// (graph reads) but differ in scope — this one is intentionally narrower
// (1-hop only, no traversal). A follow-up wave can dedupe them once both
// land.

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
