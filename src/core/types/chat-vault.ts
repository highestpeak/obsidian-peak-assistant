// T11N: Vault-backed chat domain types — carry an Obsidian `TFile` handle.
//
// Pure structural chat types live in `@/core/types/chat`. This sibling file
// holds the live-handle variants so core consumers that need a vault file
// reference (e.g. `core/eventBus.ts`'s `ConversationUpdatedEvent`,
// `core/storage/vault/ChatStore.ts`'s reader/writer) can import them
// without crossing `core -> service`.
//
// The file intentionally pulls `TFile` from `obsidian` — that one platform
// edge is the price of keeping these types in `core` rather than `service`.
// `service/chat/types.ts` re-exports both of these so existing imports
// from `@/service/chat/types` keep working.

import type { TFile } from 'obsidian';
import type {
	ChatMessage,
	ChatContextWindow,
	ResourceSummaryMeta,
	ChatConversationMeta,
} from './chat';

export interface ChatConversation {
	meta: ChatConversationMeta;
	messages: ChatMessage[];
	context?: ChatContextWindow;
	content: string;
	file: TFile;
}

export interface ParsedResourceSummaryFile {
	meta: ResourceSummaryMeta;
	content: string;
	file: TFile;
}
