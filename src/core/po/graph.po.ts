/**
 * Graph node type enumeration.
 */
export type GraphNodeType =
	| 'document' // Document nodes
	| 'tag' // Tag nodes
	| 'category' // Category nodes
	| 'resource' // Resource nodes (images, files, etc.)
	| 'link' // Link nodes (wiki links, unresolved references)
	| 'concept' // Concept nodes (extracted concepts)
	| 'person' // Person nodes (from metadata)
	| 'project' // Project nodes
	| 'custom'; // Custom node types

/**
 * Graph edge type enumeration.
 */
export type GraphEdgeType =
	| 'references' // Document references document
	| 'tagged' // Document is tagged with tag
	| 'categorized' // Document belongs to category
	| 'contains' // Document/resource contains resource
	| 'related' // General related relationship
	| 'part_of' // Part-of relationship
	| 'depends_on' // Dependency relationship
	| 'similar' // Similarity relationship
	| 'custom'; // Custom relationship types

/**
 * Graph node PO (Persistent Object).
 * Represents a node in the knowledge graph.
 */
export interface GraphNodePO {
	/**
	 * Unique node identifier.
	 * Format depends on node type:
	 * - document: document ID (from Document.id)
	 * - tag: "tag:${tagName}"
	 * - category: "category:${categoryName}"
	 * - resource: resource identifier
	 * - link: "link:${target}"
	 */
	id: string;
	/**
	 * Node type.
	 */
	type: GraphNodeType;
	/**
	 * Node label/name for display.
	 */
	label: string;
	/**
	 * Node attributes (stored as JSON string).
	 * Contains type-specific data.
	 */
	attributes: string;
	/**
	 * Creation timestamp.
	 */
	created_at: number;
	/**
	 * Last update timestamp.
	 */
	updated_at: number;
}

/**
 * Graph edge PO (Persistent Object).
 * Represents an edge (relationship) in the knowledge graph.
 */
export interface GraphEdgePO {
	/**
	 * Unique edge identifier.
	 * Format: "${fromNodeId}->${toNodeId}:${type}"
	 */
	id: string;
	/**
	 * Source node ID.
	 */
	from_node_id: string;
	/**
	 * Target node ID.
	 */
	to_node_id: string;
	/**
	 * Edge type.
	 */
	type: GraphEdgeType;
	/**
	 * Edge weight (for ranking/scoring).
	 */
	weight: number;
	/**
	 * Edge attributes (stored as JSON string).
	 * Contains type-specific data.
	 */
	attributes: string;
	/**
	 * Creation timestamp.
	 */
	created_at: number;
	/**
	 * Last update timestamp.
	 */
	updated_at: number;
}

/**
 * Document node attributes.
 */
export interface DocumentNodeAttributes {
	path: string;
	docType?: string;
}

/**
 * Tag node attributes.
 */
export interface TagNodeAttributes {
	tagName: string;
}

/**
 * Category node attributes.
 */
export interface CategoryNodeAttributes {
	categoryName: string;
}

/**
 * Resource node attributes.
 */
export interface ResourceNodeAttributes {
	resourceType: string;
	resourcePath?: string;
	resourceUrl?: string;
}

/**
 * Link node attributes.
 */
export interface LinkNodeAttributes {
	target: string;
	resolved?: boolean;
}

/**
 * Reference edge attributes.
 */
export interface ReferenceEdgeAttributes {
	context?: string; // Context where the reference appears
}

/**
 * Tagged edge attributes.
 */
export interface TaggedEdgeAttributes {
	count?: number; // Number of times tagged
}

/**
 * Contains edge attributes.
 */
export interface ContainsEdgeAttributes {
	position?: number; // Position/index in container
}

