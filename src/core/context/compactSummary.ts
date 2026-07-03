/**
 * CompactSummary + CompactAnchor — the minimum contract for recoverable
 * context compaction (Track D of 2026-07-03-code-handoff-from-doc-annotations).
 *
 * Anchoring rule: whenever the budget governor or an agent context manager
 * compacts/drops material to fit the token budget, it must produce a
 * `CompactSummary` record that carries enough information for the agent (or
 * a UI trace panel) to:
 *
 *   1. show WHY material was compacted / what was lost
 *   2. point to where the ORIGINAL material still lives
 *      (message id, vault file path, resource id, chunk id, slot id)
 *   3. suggest the tool that would refetch the material on demand
 *
 * The types stay in `core/` because both the chat pipeline (BudgetGovernor)
 * and the agent harness (ContextManager) should emit them; keeping them
 * dependency-free means they can be Zod-validated at the tool boundary.
 */

export type CompactAnchorKind = 'message' | 'file' | 'resource' | 'chunk' | 'slot' | 'block';

export interface CompactAnchor {
	kind: CompactAnchorKind;
	/**
	 * Stable primary reference:
	 *   - `message` → messageId (from ChatConversation)
	 *   - `file`    → vault-relative file path
	 *   - `resource`→ resource id in ResourceSummaryService
	 *   - `chunk`   → sqlite chunk row id
	 *   - `slot`    → SlotConfig.slotId
	 *   - `block`   → agent MemoryBlock.id
	 */
	ref: string;
	/** Optional secondary reference (e.g. chunk ordinal, byte offset, range). */
	detail?: string;
}

export interface CompactSummary {
	/** Human-readable one-line summary of what was compacted. */
	summary: string;
	/** Anchors so an agent can refetch the source material. */
	anchors: CompactAnchor[];
	/** What was lost by compressing/dropping — used for UI transparency. */
	lostDetail: string;
	/**
	 * Names of tools/services that could refetch the material. Informational
	 * — the agent decides whether to call any of them. Example values:
	 *   - `search:hybridSearch`
	 *   - `resource:getSummary`
	 *   - `conversation:getMessage`
	 *   - `vault:readFile`
	 */
	suggestedRefetch: string[];
	/** Which slot / block / message-window produced this record. */
	origin: string;
	/** Compaction level: 1 = light, 2 = heavy, 3 = fold, 4 = drop. */
	level: 1 | 2 | 3 | 4;
}

/**
 * Convenience factory for the common "slot was dropped by budget governor" case.
 */
export function makeDroppedSlotSummary(
	slotId: string,
	priorTokens: number,
	priorContentDescriptor?: string,
): CompactSummary {
	return {
		summary: `Dropped slot "${slotId}" to fit context budget (was ~${priorTokens} tokens).`,
		anchors: [{ kind: 'slot', ref: slotId }],
		lostDetail: priorContentDescriptor
			? `Slot content omitted from the request: ${priorContentDescriptor}`
			: 'Slot content omitted from the request.',
		suggestedRefetch: ['context:rebuildSlot'],
		origin: slotId,
		level: 4,
	};
}

/**
 * Convenience factory for the common "messages window slid" case in the agent
 * harness ContextManager. Used when the middle of the conversation is folded
 * into a placeholder.
 */
export function makeMessageWindowSummary(
	droppedMessageCount: number,
	firstMessageId: string | undefined,
	lastMessageId: string | undefined,
): CompactSummary {
	const anchors: CompactAnchor[] = [];
	if (firstMessageId) anchors.push({ kind: 'message', ref: firstMessageId });
	if (lastMessageId) anchors.push({ kind: 'message', ref: lastMessageId });
	return {
		summary: `Folded ${droppedMessageCount} middle turns into a summary placeholder.`,
		anchors,
		lostDetail: `Original turns between ${firstMessageId ?? '?'} and ${lastMessageId ?? '?'} are no longer inlined.`,
		suggestedRefetch: ['conversation:getMessage'],
		origin: 'message-window',
		level: 3,
	};
}

/**
 * Convenience factory for the "evictable block dropped by ContextManager" case.
 */
export function makeDroppedBlockSummary(
	blockId: string,
	priorTokens: number,
	descriptor?: string,
): CompactSummary {
	return {
		summary: `Dropped MemoryBlock "${blockId}" (~${priorTokens} tokens) to fit agent context.`,
		anchors: [{ kind: 'block', ref: blockId }],
		lostDetail: descriptor ?? 'Block content omitted from the agent context.',
		suggestedRefetch: ['context:rehydrateBlock'],
		origin: blockId,
		level: 4,
	};
}
