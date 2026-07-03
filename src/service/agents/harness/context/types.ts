/**
 * ContextManager public types. See spec §3.9.
 */

import type { ModelMessage } from 'ai';
import type { MemoryBlock } from '../memory/types';
import type { CompactSummary } from '@/core/context/compactSummary';

export interface ContextManagerConfig {
    /**
     * Hard ceiling for the assembled request (system + messages + blocks).
     * When `estimateTokens(...)` exceeds `maxTokens * compactionThreshold`,
     * `compactIfNeeded` kicks in.
     */
    maxTokens: number;
    /**
     * Fraction of `maxTokens` that triggers compaction. Spec §3.9 uses 0.8.
     * Range (0, 1]; values outside this range are clamped on construction.
     */
    compactionThreshold?: number;
    /**
     * Number of most-recent non-system messages to always preserve when
     * sliding-window compaction runs. Defaults to 4 (= 2 turns of
     * user/assistant). System messages are always retained verbatim.
     */
    keepRecentMessages?: number;
    /**
     * Placeholder text inserted in place of dropped middle messages. Kept
     * configurable for i18n / debug-tagging. `${count}` is substituted with
     * the number of dropped messages.
     *
     * When `summarizer` is present and succeeds, its result overrides this
     * placeholder — the placeholder is the safety net for stage (c) failure.
     */
    summaryPlaceholder?: string;
    /**
     * Stage (c) summariser (spec §3.9). Called after stages (a) and (b) drop
     * blocks / fold the message window. Given the exact dropped tail (in
     * order) + dropped blocks, returns a coherent prose summary that
     * replaces the placeholder message and enriches `CompactSummary.summary`.
     *
     * Optional — omit for tests and offline runs. When missing, or when the
     * function throws, the loop keeps the plain placeholder from stage (b)
     * so nothing hangs on an LLM outage.
     */
    summarizer?: CompactSummarizer;
}

export type CompactSummarizer = (input: CompactSummarizerInput) => Promise<string>;

export interface CompactSummarizerInput {
    /** Middle messages that were folded out by stage (b), in original order. */
    droppedMessages: ReadonlyArray<ModelMessage>;
    /** Blocks that were evicted by stage (a). */
    droppedBlocks: ReadonlyArray<MemoryBlock>;
    /** Abort signal from the outer AgentLoop, if any. */
    signal?: AbortSignal;
}

export interface CompactionResult {
    /** Resulting message list (system + summary + recent tail). */
    messages: ModelMessage[];
    /** Subset of input blocks that survived compaction, priority desc. */
    keptBlocks: MemoryBlock[];
    /** Blocks evicted by priority + evictable. Order = eviction order. */
    droppedBlocks: MemoryBlock[];
    /** How many middle messages were folded into the summary placeholder. */
    droppedMessageCount: number;
    /** Estimated token count of the final (messages + kept blocks) payload. */
    estimatedTokens: number;
    /** True if any compaction work happened — useful for trace emission. */
    compacted: boolean;
    /**
     * Anchor records for every block dropped and every message-window folded
     * this pass. Trace consumers render "N blocks dropped / M messages folded"
     * without silent loss; the agent tool layer can rehydrate the material via
     * `refetchCompactAnchor` (`src/service/context/refetchAnchor.ts`).
     * Empty when `compacted === false`.
     */
    compactSummaries: CompactSummary[];
}

export const DEFAULT_CONTEXT_CONFIG: Required<Omit<ContextManagerConfig, 'maxTokens'>> = {
    compactionThreshold: 0.8,
    keepRecentMessages: 4,
    summaryPlaceholder: '[summarized ${count} earlier turns]',
};
