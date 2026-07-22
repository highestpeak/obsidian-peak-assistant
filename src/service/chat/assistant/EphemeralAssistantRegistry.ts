/**
 * Ephemeral Assistant registry — an in-memory per-conversation override for
 * the Assistant Builder Preview flow (Chat Studio zero-gap, 2026-07-21).
 *
 * The Assistant Builder's "Preview in current conversation" button binds an
 * unsaved `ChatAssistantDefinition` draft here. On the next turn, the
 * ConversationService's resolver checks this registry BEFORE hitting the
 * durable `AssistantService`, so the draft's instructions / toolPolicy /
 * knowledgeRefs / preferredModel take effect without persisting to disk.
 *
 * Ownership: composed at the app layer and owned by `ConversationService`
 * (constructor-injected). The registry itself is a thin wrapper around a
 * `Map` so we can unit-test the semantics without spinning up the full
 * ConversationService constructor graph. Plugin reload wipes state — the
 * registry is intentionally not persisted.
 */

import type { ChatAssistantDefinition } from '@/core/types/chat-studio';

export class EphemeralAssistantRegistry {
	private readonly entries = new Map<string, ChatAssistantDefinition>();

	set(conversationId: string, definition: ChatAssistantDefinition | null): void {
		if (!conversationId) return;
		if (definition) this.entries.set(conversationId, definition);
		else this.entries.delete(conversationId);
	}

	get(conversationId: string): ChatAssistantDefinition | null {
		return this.entries.get(conversationId) ?? null;
	}

	clear(): void {
		this.entries.clear();
	}

	/** Test-only introspection — do not use from production code. */
	size(): number {
		return this.entries.size;
	}
}
