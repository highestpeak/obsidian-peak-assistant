// T11R: Vault-backed chat domain types. Previously held an Obsidian
// `TFile` handle — that was the last obsidian import in `core/types`. The
// file ref is now a neutral `VaultFileRef`, so the chat conversation
// domain model carries plain path/basename/extension data and no host
// runtime types. App-side adapters resolve refs to real `TFile` instances
// at the vault boundary.

import type { VaultFileRef } from '@/core/ports/VaultFileRef';
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
	file: VaultFileRef;
}

export interface ParsedResourceSummaryFile {
	meta: ResourceSummaryMeta;
	content: string;
	file: VaultFileRef;
}
