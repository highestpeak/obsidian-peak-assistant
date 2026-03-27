/**
 * Graph node `type` values (mobius_node, graph APIs). Canonical set only — use these constants everywhere.
 */
export const GraphNodeType = {
	TopicTag: 'topic_tag',
	FunctionalTag: 'functional_tag',
	KeywordTag: 'keyword_tag',
	/** LLM time/geo/person context tags (prefix labels Time* / Geo* / Person*). */
	ContextTag: 'context_tag',
	Document: 'document',
	/** Non-note vault entities (e.g. file attachments as graph nodes). Distinct from {@link Folder}. */
	Resource: 'resource',
	/** Vault folder path node for hierarchy `contains` edges (parent folder → child or document). */
	Folder: 'folder',
	HubDoc: 'hub_doc',
} as const;

export type GraphNodeType = (typeof GraphNodeType)[keyof typeof GraphNodeType];

/**
 * Graph edge `type` values (mobius_edge). Canonical set only.
 */
export const GraphEdgeType = {
	References: 'references',
	/**
	 * Inferred / rule-based / LLM-derived doc→doc relation (not a wiki link).
	 * Distinct from {@link References}; use `attributes_json` for provenance.
	 */
	SemanticRelated: 'semantic_related',
	TaggedTopic: 'tagged_topic',
	TaggedFunctional: 'tagged_functional',
	TaggedKeyword: 'tagged_keyword',
	TaggedContext: 'tagged_context',
	Contains: 'contains',
} as const;

export type GraphEdgeType = (typeof GraphEdgeType)[keyof typeof GraphEdgeType];

/** Document-to-tag edges: one edge type per tag kind (query-friendly). */
export const GRAPH_TAGGED_EDGE_TYPES: readonly GraphEdgeType[] = [
	GraphEdgeType.TaggedTopic,
	GraphEdgeType.TaggedFunctional,
	GraphEdgeType.TaggedKeyword,
	GraphEdgeType.TaggedContext,
];

/** @deprecated Use {@link GRAPH_TAGGED_EDGE_TYPES}. */
export const GRAPH_TAG_CATEGORY_EDGE_TYPES = GRAPH_TAGGED_EDGE_TYPES;

/** Doc→doc edges that are not Obsidian wiki links (semantic / latent layer). */
export const GRAPH_SEMANTIC_DOC_EDGE_TYPES: readonly GraphEdgeType[] = [GraphEdgeType.SemanticRelated];

/** Node types that hold indexed note content (chunks, embeddings; stored on Mobius document nodes). */
export const GRAPH_INDEXED_NOTE_NODE_TYPES: readonly GraphNodeType[] = [
	GraphNodeType.Document,
	GraphNodeType.HubDoc,
];

/** Node types treated as document-like for orphan cleanup (indexed body content). */
export const GRAPH_DOCUMENT_LIKE_NODE_TYPES: readonly GraphNodeType[] = [
	GraphNodeType.Document,
	GraphNodeType.HubDoc,
];

/** Tag-like nodes that participate in tagged_* edges and `tag_doc_count`. */
export const GRAPH_TAG_NODE_TYPES: readonly GraphNodeType[] = [
	GraphNodeType.TopicTag,
	GraphNodeType.FunctionalTag,
	GraphNodeType.KeywordTag,
	GraphNodeType.ContextTag,
];

/** True for node types that use document-style reference degrees (vault + hub notes). */
export function isIndexedNoteNodeType(type: string): boolean {
	return type === GraphNodeType.Document || type === GraphNodeType.HubDoc;
}
