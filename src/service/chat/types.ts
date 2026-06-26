// T11J A1: Pure chat domain types relocated to `@/core/types/chat`. Types
// that carry an Obsidian `TFile` handle stay here (Bucket C TFile→VaultFile
// carving is deferred to T11K).

import type { TFile } from 'obsidian';
import type { ChatMessage, ChatContextWindow, ResourceSummaryMeta, ChatConversationMeta, ChatProjectMeta, ChatProjectContext, ChatProject } from '@/core/types/chat';

export * from '@/core/types/chat';

export interface ParsedResourceSummaryFile {
	meta: ResourceSummaryMeta;
	content: string;
	file: TFile;
}

export interface ChatConversation {
	meta: ChatConversationMeta;
	messages: ChatMessage[];
	context?: ChatContextWindow;
	content: string;
	file: TFile;
}

// Keep referenced type names accessible at this path so generic consumers
// of legacy imports continue to compile without changes.
export type { ChatMessage, ChatContextWindow, ResourceSummaryMeta, ChatConversationMeta, ChatProjectMeta, ChatProjectContext, ChatProject };
