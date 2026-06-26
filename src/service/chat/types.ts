// T11J A1: Pure chat domain types live in `@/core/types/chat`.
// T11N: Vault-backed chat types (carry an Obsidian `TFile` handle) live in
// `@/core/types/chat-vault`. This file remains the legacy import surface
// (`@/service/chat/types`) and re-exports both so existing UI / service
// callers keep compiling unchanged. Adding a new chat type? Decide which
// of the two core files it belongs in — do not reintroduce a definition
// here.

import type {
	ChatMessage,
	ChatContextWindow,
	ResourceSummaryMeta,
	ChatConversationMeta,
	ChatProjectMeta,
	ChatProjectContext,
	ChatProject,
} from '@/core/types/chat';

export * from '@/core/types/chat';
export type { ChatConversation, ParsedResourceSummaryFile } from '@/core/types/chat-vault';

// Keep referenced type names accessible at this path so generic consumers
// of legacy imports continue to compile without changes.
export type { ChatMessage, ChatContextWindow, ResourceSummaryMeta, ChatConversationMeta, ChatProjectMeta, ChatProjectContext, ChatProject };
