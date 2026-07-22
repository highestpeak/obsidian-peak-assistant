/**
 * chat-message-variants — pure helpers for the MSG-08 variant model.
 *
 * A variant group is a set of assistant messages that are ALTERNATIVE
 * answers to the same user turn. Every message in the group carries the
 * same `variantGroupId`, a unique `variantIndex` (0-based), and exactly
 * one has `isActiveVariant === true`. Legacy messages with none of these
 * fields form an implicit single-variant group of one: always active.
 *
 * Kept separate from `service-conversation.ts` so history assembly, the
 * variant switcher UI, and the round-trip repositories can all consume
 * the same rules without pulling in a service module.
 */

import type { ChatMessage } from '@/core/types/chat';

/**
 * Returns true when `msg` should participate in the LLM-visible history.
 * The rule is intentionally lenient toward legacy data:
 *   • Any message without a `variantGroupId` is treated as active.
 *   • A message with a group is active only when `isActiveVariant === true`.
 *
 * This lets pre-variant conversations continue to load unchanged and lets
 * new retry siblings be dropped from history assembly without touching
 * every caller that iterates `conversation.messages`.
 */
export function isActiveInHistory(msg: ChatMessage): boolean {
	if (!msg.variantGroupId) return true;
	return msg.isActiveVariant === true;
}

/**
 * Filter a message array down to the active-variant path. Preserves the
 * original order and never mutates. Consumers should call this when
 * assembling an LLM request, computing a context window, or generating a
 * title — anywhere the assistant's alternative answers to a retried turn
 * would otherwise appear twice.
 */
export function filterActiveVariants(messages: readonly ChatMessage[]): ChatMessage[] {
	return messages.filter(isActiveInHistory);
}

/**
 * All messages in the same variant group as `messageId`. Returned in the
 * order they appear in `messages`. Empty when the message has no group or
 * no siblings — the UI switcher then hides itself.
 */
export function collectVariantGroup(
	messages: readonly ChatMessage[],
	messageId: string,
): ChatMessage[] {
	const anchor = messages.find((m) => m.id === messageId);
	if (!anchor || !anchor.variantGroupId) return [];
	const groupId = anchor.variantGroupId;
	return messages.filter((m) => m.variantGroupId === groupId);
}

/**
 * Toggle the active flag inside a group. Returns a NEW array with the
 * chosen message marked active and every other group member marked
 * inactive. Messages outside the group are returned unchanged.
 *
 * Callers persist the result via the storage layer's normal write path
 * (the sqlite repo re-serializes meta_json for every touched row).
 */
export function setActiveVariant(
	messages: readonly ChatMessage[],
	groupId: string,
	activeMessageId: string,
): ChatMessage[] {
	return messages.map((m) => {
		if (m.variantGroupId !== groupId) return m;
		if (m.id === activeMessageId) {
			return m.isActiveVariant === true ? m : { ...m, isActiveVariant: true };
		}
		return m.isActiveVariant === false ? m : { ...m, isActiveVariant: false };
	});
}

/**
 * Register a new retry sibling. The old assistant answer becomes an
 * inactive variant; the new one becomes active. If the old answer had
 * no group yet, we retroactively assign one so both siblings share it.
 *
 * Returns the updated message array plus the fields the caller must
 * stamp on the new assistant message before persisting it (variantGroupId,
 * variantIndex, isActiveVariant). The new message itself is provided by
 * the caller — this helper is intentionally UI/service-agnostic.
 */
export function planRetryVariant(
	messages: readonly ChatMessage[],
	previousAssistantMessageId: string,
	generateGroupId: () => string,
): {
	updatedMessages: ChatMessage[];
	newVariantFields: {
		variantGroupId: string;
		variantIndex: number;
		isActiveVariant: true;
	};
} {
	const previous = messages.find((m) => m.id === previousAssistantMessageId);
	if (!previous) {
		throw new Error(`planRetryVariant: previous assistant message not found: ${previousAssistantMessageId}`);
	}
	const groupId = previous.variantGroupId ?? generateGroupId();
	// Deactivate every existing member of the group (including the previous
	// message itself). Any legacy message picking up a fresh group also
	// gets its variantIndex normalised to 0.
	const updated = messages.map((m) => {
		if (m.id === previousAssistantMessageId) {
			return {
				...m,
				variantGroupId: groupId,
				variantIndex: typeof m.variantIndex === 'number' ? m.variantIndex : 0,
				isActiveVariant: false,
			};
		}
		if (m.variantGroupId === groupId) {
			return m.isActiveVariant === false ? m : { ...m, isActiveVariant: false };
		}
		return m;
	});
	// The new variant's index is (max existing index in group) + 1.
	const existing = updated.filter((m) => m.variantGroupId === groupId);
	const nextIndex = existing.reduce((acc, m) => Math.max(acc, m.variantIndex ?? 0), -1) + 1;
	return {
		updatedMessages: updated,
		newVariantFields: {
			variantGroupId: groupId,
			variantIndex: nextIndex,
			isActiveVariant: true,
		},
	};
}
