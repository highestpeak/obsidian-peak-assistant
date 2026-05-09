import type { FunctionalTagEntry, TopicTagEntry } from '@/core/document/helper/TagService';

/** All document type values (source of truth). */
export const DOCUMENT_TYPES = [
	'markdown', 'txt', 'csv', 'json', 'html', 'xml',
	'pdf', 'image', 'docx', 'xlsx', 'pptx',
	'excalidraw', 'canvas',
	'folder', 'url',
	'unknown',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Source file information, read lazily after DocumentPO creation. */
export interface DocumentFileInfo {
	path: string;
	name: string;
	extension: string;
	/** File size in bytes. */
	size: number;
	/** Last modification time (timestamp). */
	mtime: number;
	ctime?: number;
	/**
	 * Extracted text content (markdown format).
	 * For binary files (PDF, Image, etc.), contains processed/extracted content.
	 * For text files, contains raw content.
	 */
	content: string;
}

/** Document metadata extracted from content. Read lazily after DocumentPO creation. */
export interface DocumentMetadata {
	title: string;
	/** Topic tags — LLM-assigned (what the note is about). Ids only. */
	topicTags: string[];
	/** Topic tags with optional per-note labels (LLM). */
	topicTagEntries?: TopicTagEntry[];
	/** Functional tags (closed id + optional per-note label); LLM-assigned. */
	functionalTagEntries: FunctionalTagEntry[];
	/** Keyword tags from inline #hashtags and frontmatter `tags` (user-side; not LLM). */
	keywordTags: string[];
	/** User-only keywords (frontmatter + inline #tags). Drives Mobius KeywordTag edges. */
	userKeywordTags?: string[];
	/** TextRank extractive terms only; for prompts/affinity, not written as graph keyword nodes. */
	textrankKeywordTerms?: string[];
	/** LLM time context tags (prefix `Time...`). */
	timeTags?: string[];
	/** LLM geography context tags (prefix `Geo...`). */
	geoTags?: string[];
	/** LLM person/entity tags (prefix `Person...`). */
	personTags?: string[];
	/** Special document types (daily note, profile, principle, etc.). */
	specialTypes?: string[];
	frontmatter?: Record<string, unknown>;
	/** LLM-inferred document creation time (epoch ms). */
	inferCreatedAt?: number | null;
	custom?: Record<string, unknown>;
}

export interface DocumentReference {
	docId?: string;
	/** Full path relative to vault root. */
	fullPath: string;
}

/** Document references (bidirectional). Read after graph instance is created. */
export interface DocumentReferences {
	outgoing: DocumentReference[];
	incoming: DocumentReference[];
}

/** Core Document model — unified across indexing, chat, and analysis. */
export interface Document {
	id: string;
	type: DocumentType;
	sourceFileInfo: DocumentFileInfo;
	/** Cache file info (e.g. PDF/image cache). */
	cacheFileInfo: DocumentFileInfo;
	metadata: DocumentMetadata;
	references: DocumentReferences;
	/** Short summary for quick access. Null for short/unprocessed documents. */
	summary?: string | null;
	/** Long-form summary (separate from cacheFileInfo). */
	fullSummary?: string | null;
	/** MD5 hash of content (for deduplication). */
	contentHash: string;
	lastProcessedAt: number;
}

export type SpecialResourceType = 'tag' | 'folder';
export type ResourceKind = DocumentType | SpecialResourceType;

export interface ResourceSummary {
	shortSummary: string;
	fullSummary?: string;
}

export interface Summarizable {
	getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary>;
}

export interface ResourceLoader extends Summarizable {
	getResourceType(): ResourceKind;
}
