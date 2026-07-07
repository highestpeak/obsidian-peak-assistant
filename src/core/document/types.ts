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

/**
 * Document types whose highlight source can be read live from the Vault file.
 * For these types, the file on disk is authoritative — search highlight and
 * chunk reads should prefer `vault.cachedRead(path)` over the copy in
 * `doc_chunk.content_raw`. Binary types (pdf/docx/pptx/xlsx/image) require the
 * indexed extracted text because the Vault file cannot be re-parsed cheaply
 * per query.
 */
const VAULT_READABLE_DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set([
	'markdown',
	'txt',
	'csv',
	'json',
	'html',
	'xml',
	'canvas',
	'excalidraw',
]);

export function isVaultReadableSource(type: DocumentType | string | undefined | null): boolean {
	return typeof type === 'string' && VAULT_READABLE_DOCUMENT_TYPES.has(type as DocumentType);
}

/**
 * File extensions whose contents can be read as UTF-8 text via
 * `vault.adapter.read`. Used as a defense-in-depth fallback for search
 * results whose `type` field was lost or is 'unknown' — the resolver still
 * routes through Vault-first when the path extension is recognizable text.
 */
const VAULT_READABLE_EXTENSIONS: ReadonlySet<string> = new Set([
	'md', 'markdown', 'txt', 'csv', 'json', 'html', 'htm', 'xml',
	'canvas', 'excalidraw',
]);

export function isVaultReadableByPath(path: string | undefined | null): boolean {
	if (typeof path !== 'string' || !path) return false;
	// Handle .excalidraw.md specifically (matched by 'md' below anyway).
	const lower = path.toLowerCase();
	const dot = lower.lastIndexOf('.');
	if (dot < 0) return false;
	return VAULT_READABLE_EXTENSIONS.has(lower.slice(dot + 1));
}

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
