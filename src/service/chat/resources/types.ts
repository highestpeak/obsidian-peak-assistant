import type { TFile } from 'obsidian';

/**
 * Resource kinds supported by the chat system
 */
export type ResourceKind = 'image' | 'pdf' | 'url' | 'note' | 'tag' | 'folder' | 'text' | 'other';

/**
 * Reference to a resource attached to a message
 */
export interface ChatResourceRef {
	source: string; // Original path/url/text content
	id: string; // Stable hash-based ID for indexing and summary file naming
	kind: ResourceKind;
	summaryNotePath?: string; // Path to the resource summary note file
}

/**
 * Resource summary metadata stored in resource summary note files
 */
export interface ResourceSummaryMeta {
	id: string;
	source: string;
	kind: ResourceKind;
	title?: string;
	shortSummary?: string;
	fullSummary?: string;
	lastUpdatedTimestamp: number;
	mentionedInConversations?: string[]; // Conversation IDs
	mentionedInProjects?: string[]; // Project IDs
	mentionedInFiles?: string[]; // File paths (markdown, excalidraw, etc.)
}

/**
 * Parsed resource summary file
 */
export interface ParsedResourceSummaryFile {
	meta: ResourceSummaryMeta;
	content: string;
	file: TFile;
}

