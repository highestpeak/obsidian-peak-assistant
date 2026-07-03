/**
 * Refetch a `CompactAnchor` — turns a compaction anchor back into concrete
 * source material so the agent can rehydrate what was compacted out.
 *
 * This is the third leg of the Track D minimum loop:
 *   1. record anchors        → `CompactSummary`
 *   2. surface anchors        → BudgetGovernor return + trace event payload
 *   3. refetch anchors        → THIS module
 *
 * Kept as a pure dispatcher with injected port functions so downstream layers
 * (chat tools, agent MCP servers) can wire the actual data sources without
 * this file reaching into SearchClient / ResourceSummaryService / ConversationRepo.
 *
 * Callers typically expose the returned text as an agent tool result
 * (`context_refetch_anchor`) so the agent can inspect the source and decide
 * what to do next.
 */

import type { CompactAnchor } from '@/core/context/compactSummary';

export interface RefetchAnchorPorts {
	/** Load the full body of a chat message by id. Returns null when missing. */
	getMessage?: (messageId: string) => Promise<string | null>;
	/** Read a vault-relative file. Returns null when missing. */
	readFile?: (path: string) => Promise<string | null>;
	/** Fetch a stored resource summary + source excerpt by resource id. */
	getResource?: (resourceId: string) => Promise<string | null>;
	/** Fetch one chunk's text by sqlite chunk row id. */
	getChunk?: (chunkId: string) => Promise<string | null>;
	/** Rebuild a slot by slotId — used for `kind: 'slot'`. */
	rebuildSlot?: (slotId: string) => Promise<string | null>;
	/** Rebuild an evictable agent MemoryBlock by id — used for `kind: 'block'`. */
	rehydrateBlock?: (blockId: string) => Promise<string | null>;
}

export interface RefetchAnchorResult {
	anchor: CompactAnchor;
	/** Non-null when refetch succeeded. */
	text: string | null;
	/** Populated when refetch failed. */
	error?: string;
}

export async function refetchCompactAnchor(
	anchor: CompactAnchor,
	ports: RefetchAnchorPorts,
): Promise<RefetchAnchorResult> {
	const fetcher = pickFetcher(anchor, ports);
	if (!fetcher) {
		return {
			anchor,
			text: null,
			error: `no port registered for anchor kind "${anchor.kind}"`,
		};
	}
	try {
		const text = await fetcher(anchor.ref);
		if (text === null) {
			return { anchor, text: null, error: `ref "${anchor.ref}" not found` };
		}
		return { anchor, text };
	} catch (e) {
		return {
			anchor,
			text: null,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

function pickFetcher(
	anchor: CompactAnchor,
	ports: RefetchAnchorPorts,
): ((ref: string) => Promise<string | null>) | undefined {
	switch (anchor.kind) {
		case 'message':
			return ports.getMessage;
		case 'file':
			return ports.readFile;
		case 'resource':
			return ports.getResource;
		case 'chunk':
			return ports.getChunk;
		case 'slot':
			return ports.rebuildSlot;
		case 'block':
			return ports.rehydrateBlock;
	}
}
