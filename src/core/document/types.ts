/**
 * Unified Document model for the entire plugin.
 * 
 * This is the core document abstraction that supports:
 * - Multiple document types (markdown, pdf, image, text files, office, etc.)
 * - Rich metadata (hash, summary, references, tags)
 * - Caching strategies for expensive operations
 * - Content extraction and processing
 * 
 * All document operations (indexing, search, chat) should use this model.
 * 
 * Design principles:
 * - Single source of truth: one Document model for all use cases
 * - Separation of concerns: Document (core) vs Chunk (search-specific)
 * - Extensibility: easy to add new document types and metadata
 * - Performance: caching for expensive operations (PDF, Image, Canvas)
 */

/**
 * Document type for indexing and document loaders.
 * 
 * Supports various file types:
 * - Text files: markdown, csv, json, html, xml, txt
 * - Binary files: pdf, image (jpg, png, etc.), office (docx, xlsx, pptx)
 * - Plugin data: conv, project, prompt
 * - Obsidian data: excalidraw, canvas, dataloom
 * - Special: folder, url
 */
export type DocumentType =
	// Text files
	| 'markdown'
	| 'csv'
	| 'json'
	| 'html'
	| 'xml'
	| 'txt'
	// Binary files
	| 'pdf'
	| 'image'
	| 'docx'
	| 'xlsx'
	| 'pptx'
	// Plugin data files
	// | 'conv'
	// | 'project'
	// | 'prompt'
	// Obsidian data files
	| 'excalidraw'
	| 'canvas'
	| 'dataloom'
	// Special types
	| 'folder'
	| 'url'
	// Unknown/unsupported (only index filename and metadata)
	| 'unknown';

/**
 * Document source information.
 * 
 * will be readed after documentpo is created. and these data will be readed from Document sourceFile or cacheFile when needed.
 */
export interface DocumentFileInfo {
	/**
	 * Original file path in vault.
	 */
	path: string;
	/**
	 * File name.
	 */
	name: string;
	/**
	 * File extension.
	 */
	extension: string;
	/**
	 * File size in bytes.
	 */
	size: number;
	/**
	 * Last modification time (timestamp).
	 */
	mtime: number;
	/**
	 * Creation time (timestamp).
	 */
	ctime?: number;
	/**
	 * File content (extracted text, typically in markdown format).
	 * 
	 * Content storage varies by document type:
	 * - Text files (markdown, txt, etc.): raw content directly from file
	 * - Binary files (PDF, Image, etc.): extracted content converted to markdown
	 *   For binary files, extracted content is stored here after processing.
	 *   The content is typically converted to markdown format and processed
	 *   by the markdown extractor for unified handling.
	 * - Canvas/Dataloom: structured representation converted to markdown
	 * 
	 * For binary files, the original file has no text content, so this field
	 * contains the processed/extracted content. For files with cacheFileInfo,
	 * the extracted content is stored in cacheFileInfo.content.
	 */
	content: string;
}

/**
 * Document metadata extracted from content.
 * 
 * will be readed after documentpo is created. and these data will be readed from Document sourceFile or cacheFile when needed.
 */
export interface DocumentMetadata {
	/**
	 * Document title (extracted from frontmatter, heading, or filename).
	 */
	title: string;
	/**
	 * Document tags (from frontmatter, #tags, or extracted).
	 */
	tags: string[];
	/**
	 * Document categories or classifications.
	 */
	categories?: string[];
	/**
	 * Special document types (daily note, profile, principle, etc.).
	 */
	specialTypes?: string[];
	/**
	 * Frontmatter data (YAML/JSON).
	 */
	frontmatter?: Record<string, unknown>;
	/**
	 * Custom metadata fields.
	 */
	custom?: Record<string, unknown>;
}

/**
 * Reference to another document.
 */
export interface DocumentReference {
	/**
	 * Document ID (if available).
	 * May be empty/undefined when the referenced document hasn't been indexed yet.
	 */
	docId?: string;
	/**
	 * Full path relative to vault root.
	 * Required and cannot be empty.
	 */
	fullPath: string;
}

/**
 * Document references (bidirectional).
 * 
 * will be readed after graph instance is created.
 */
export interface DocumentReferences {
	/**
	 * Outgoing references (links from this document).
	 */
	outgoing: DocumentReference[];
	/**
	 * Incoming references (links to this document).
	 */
	incoming: DocumentReference[];
}

/**
 * Core Document model for the entire plugin.
 * 
 * This unified model supports all document types and operations:
 * - Indexing (search index)
 * - Chat (RAG, context)
 * - Analysis (tags, references, summary)
 * 
 * All document loaders should produce this model.
 * 
 * fields in Document model, like tags, title will be readed from Document sourceFile or cacheFile when needed after documentpo is created.
 */
export interface Document {
	/**
	 * Unique document identifier.
	 * A string identifier, typically UUID or similar unique format.
	 * Not necessarily the file path.
	 */
	id: string;
	/**
	 * Document type.
	 */
	type: DocumentType;
	/**
	 * Source file information.
	 */
	sourceFileInfo: DocumentFileInfo;
	/**
	 * Cache file information. eg pdf's image's cache file info
	 */
	cacheFileInfo: DocumentFileInfo;
	/**
	 * Document metadata.
	 */
	metadata: DocumentMetadata;
	/**
	 * Document references (bidirectional links).
	 */
	references: DocumentReferences;

	/**
	 * Document summary (redundant field for quick access).
	 * 
	 * This is a cached summary extracted from content:
	 * - For text files (no cacheFile): summary extracted from sourceFileInfo.content
	 * - For binary files (PDF, Image, etc.): summary extracted from cacheFileInfo.content
	 * 
	 * The summary is generated after processing sourceFileInfo.content and/or
	 * cacheFileInfo.content, and stored here for quick access without re-processing.
	 * 
	 * Only generated if content is substantial.
	 * Null for short documents (not worth summarizing) or if not yet processed.
	 */
	summary?: string | null;

	/**
	 * MD5 hash of content (for deduplication).
	 * Prevents duplicate embedding and processing.
	 */
	contentHash: string;

	/**
	 * Processing timestamp (when document was last processed).
	 */
	lastProcessedAt: number;
}

/**
 * Special resource types that are not regular documents
 */
export type SpecialResourceType = 'tag' | 'folder' | 'category';

/**
 * All possible resource kinds (document types + special resource types)
 */
export type ResourceKind = DocumentType | SpecialResourceType;

/**
 * Resource summary result
 */
export interface ResourceSummary {
	shortSummary: string;
	fullSummary?: string;
}

/**
 * Interface for resources that can generate summaries
 */
export interface Summarizable {
	/**
	 * Get summary for a resource or document
	 */
	getSummary(
		source: Document | string,
		promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
		provider: string,
		modelId: string
	): Promise<ResourceSummary>;
}

/**
 * Resource loader interface for special resource types
 */
export interface ResourceLoader extends Summarizable {
	/**
	 * Get the resource type this loader handles
	 */
	getResourceType(): ResourceKind;
}

