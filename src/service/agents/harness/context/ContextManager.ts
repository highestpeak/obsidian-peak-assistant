/**
 * Working-memory context manager for the harness. See spec §3.9.
 *
 * Responsibilities (M3):
 * (1) `estimateTokens(messages, blocks?)` — char/4 heuristic, sharing
 *     `estimateObjectSize` with `service/chat/token-estimation.ts` so the
 *     numbers stay consistent across the codebase.
 * (2) `compactIfNeeded(messages, blocks)` — three-stage progressive
 *     compaction:
 *       (a) Drop lowest-priority evictable blocks until the bag fits its
 *           share of the budget OR no evictable block remains.
 *       (b) Slide window: keep `system` + last N non-system messages, fold
 *           the middle into a one-line placeholder string.
 *       (c) LLM summarisation — TODO in M3 (see spec §3.9 step 3). For now
 *           we leave a hand-rolled placeholder; an llm-fast summariser hook
 *           lands in M5 alongside reflection batching.
 *
 * The method is sync because we don't (yet) call the model from here. The
 * signature returns `Promise<CompactionResult>` to keep the door open for
 * stage (c) without breaking callers later.
 */

import type { ModelMessage } from 'ai';
import { estimateObjectSize } from '@/service/chat/token-estimation';
import type { MemoryBlock } from '../memory/types';
import { renderMemoryBlock } from '../memory/MemoryBlock';
import {
    DEFAULT_CONTEXT_CONFIG,
    type CompactionResult,
    type ContextManagerConfig,
} from './types';
import type { CompactSummary } from '@/core/context/compactSummary';
import {
    makeDroppedBlockSummary,
    makeMessageWindowSummary,
} from '@/core/context/compactSummary';

/** Same heuristic as token-estimation.ts: chars/4, rounded up. */
const CHARS_PER_TOKEN = 4;

function clampThreshold(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) return DEFAULT_CONTEXT_CONFIG.compactionThreshold;
    if (value <= 0) return 0.01;
    if (value > 1) return 1;
    return value;
}

export class ContextManager {
    readonly maxTokens: number;
    readonly compactionThreshold: number;
    readonly keepRecentMessages: number;
    readonly summaryPlaceholder: string;

    constructor(config: ContextManagerConfig) {
        if (!config.maxTokens || config.maxTokens <= 0) {
            throw new Error('ContextManager: maxTokens must be a positive number');
        }
        this.maxTokens = config.maxTokens;
        this.compactionThreshold = clampThreshold(config.compactionThreshold);
        this.keepRecentMessages = Math.max(
            0,
            config.keepRecentMessages ?? DEFAULT_CONTEXT_CONFIG.keepRecentMessages,
        );
        this.summaryPlaceholder =
            config.summaryPlaceholder ?? DEFAULT_CONTEXT_CONFIG.summaryPlaceholder;
    }

    /**
     * Estimate the token count of a message stream plus optional memory
     * blocks. Uses the same chars/4 heuristic + `estimateObjectSize` walker
     * as `service/chat/token-estimation.ts` so numbers compare across layers.
     */
    estimateTokens(messages: ReadonlyArray<ModelMessage>, blocks?: ReadonlyArray<MemoryBlock>): number {
        let chars = 0;
        for (const message of messages) {
            chars += estimateMessageChars(message);
            chars += 10; // role/formatting overhead, mirrors token-estimation.ts
        }
        if (blocks) {
            for (const b of blocks) {
                chars += b.name.length + b.content.length + 16; // block framing overhead
            }
        }
        return Math.ceil(chars / CHARS_PER_TOKEN);
    }

    /** True when the projected token usage is at/above the compaction threshold. */
    shouldCompact(messages: ReadonlyArray<ModelMessage>, blocks?: ReadonlyArray<MemoryBlock>): boolean {
        const projected = this.estimateTokens(messages, blocks);
        return projected >= this.maxTokens * this.compactionThreshold;
    }

    /**
     * Three-stage progressive compaction. Returns the final messages list,
     * surviving blocks, and bookkeeping for trace emission.
     *
     * When already under budget the input is returned untouched (compacted=false).
     */
    async compactIfNeeded(
        messages: ReadonlyArray<ModelMessage>,
        blocks: ReadonlyArray<MemoryBlock> = [],
    ): Promise<CompactionResult> {
        const input = messages.slice();
        const startingBlocks = blocks.slice();

        const initialTokens = this.estimateTokens(input, startingBlocks);
        const ceiling = this.maxTokens * this.compactionThreshold;
        if (initialTokens < ceiling) {
            return {
                messages: input,
                keptBlocks: startingBlocks.slice().sort((a, b) => b.priority - a.priority),
                droppedBlocks: [],
                droppedMessageCount: 0,
                estimatedTokens: initialTokens,
                compacted: false,
                compactSummaries: [],
            };
        }

        // Stage (a): drop evictable blocks lowest priority first.
        const sortedAsc = startingBlocks.slice().sort((a, b) => a.priority - b.priority);
        const droppedBlocks: MemoryBlock[] = [];
        const keptBlocks: MemoryBlock[] = sortedAsc.slice();
        while (this.estimateTokens(input, keptBlocks) >= ceiling) {
            const idx = keptBlocks.findIndex((b) => b.evictable);
            if (idx === -1) break;
            droppedBlocks.push(keptBlocks[idx]);
            keptBlocks.splice(idx, 1);
        }

        // Stage (b): slide window over messages if still over budget.
        let workingMessages = input;
        let droppedMessageCount = 0;
        if (this.estimateTokens(workingMessages, keptBlocks) >= ceiling) {
            const systemMsgs = workingMessages.filter((m) => m.role === 'system');
            const nonSystem = workingMessages.filter((m) => m.role !== 'system');
            const keep = Math.min(this.keepRecentMessages, nonSystem.length);
            const tail = nonSystem.slice(nonSystem.length - keep);
            const dropped = nonSystem.length - tail.length;
            if (dropped > 0) {
                const placeholder = this.summaryPlaceholder.replace('${count}', String(dropped));
                workingMessages = [
                    ...systemMsgs,
                    { role: 'assistant', content: placeholder } as ModelMessage,
                    ...tail,
                ];
                droppedMessageCount = dropped;
            }
        }

        // Stage (c): LLM summarisation — TODO (spec §3.9). For now we accept
        // the result of stages (a)+(b); if still over budget the loop will
        // surface a max_tokens stop or a provider-side context overflow.

        // Re-sort kept blocks priority desc for caller convenience.
        keptBlocks.sort((a, b) => b.priority - a.priority);

        const estimatedTokens = this.estimateTokens(workingMessages, keptBlocks);
        const compacted = droppedBlocks.length > 0 || droppedMessageCount > 0;
        const compactSummaries = buildCompactSummaries({
            droppedBlocks,
            droppedMessageCount,
            originalMessages: input,
            keepTail: this.keepRecentMessages,
        });
        return {
            messages: workingMessages,
            keptBlocks,
            droppedBlocks,
            droppedMessageCount,
            estimatedTokens,
            compacted,
            compactSummaries,
        };
    }

    /**
     * Render kept blocks as a string suitable for appending to a system
     * prompt. Empty blocks list → empty string (caller can `.trim()` cleanly).
     */
    renderBlocks(blocks: ReadonlyArray<MemoryBlock>): string {
        if (blocks.length === 0) return '';
        return blocks
            .slice()
            .sort((a, b) => b.priority - a.priority)
            .map(renderMemoryBlock)
            .join('\n\n');
    }
}

/**
 * Build the recoverable-compaction anchor records for one compact pass. See
 * Track D + `src/core/context/compactSummary.ts`. Handles both dropped
 * evictable blocks and the folded message window.
 */
function buildCompactSummaries(input: {
    droppedBlocks: ReadonlyArray<MemoryBlock>;
    droppedMessageCount: number;
    originalMessages: ReadonlyArray<ModelMessage>;
    keepTail: number;
}): CompactSummary[] {
    const summaries: CompactSummary[] = [];
    for (const block of input.droppedBlocks) {
        const priorTokens = Math.ceil((block.name.length + block.content.length) / CHARS_PER_TOKEN);
        summaries.push(
            makeDroppedBlockSummary(block.name, priorTokens, block.content.slice(0, 120)),
        );
    }
    if (input.droppedMessageCount > 0) {
        const messageIds = extractMessageIds(input.originalMessages, input.droppedMessageCount, input.keepTail);
        summaries.push(
            makeMessageWindowSummary(input.droppedMessageCount, messageIds.first, messageIds.last),
        );
    }
    return summaries;
}

/**
 * Try to recover message ids for the first and last dropped middle turns so
 * the CompactAnchor can point back at them. ModelMessage does not carry an
 * `id` field in the ai-sdk shape; we fall back to a synthetic index-based ref.
 */
function extractMessageIds(
    messages: ReadonlyArray<ModelMessage>,
    droppedCount: number,
    keepTail: number,
): { first: string | undefined; last: string | undefined } {
    const nonSystemIdx: number[] = [];
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role !== 'system') nonSystemIdx.push(i);
    }
    if (droppedCount <= 0 || nonSystemIdx.length === 0) return { first: undefined, last: undefined };
    const firstIdx = nonSystemIdx[0];
    const lastIdx = nonSystemIdx[nonSystemIdx.length - keepTail - 1] ?? nonSystemIdx[droppedCount - 1];
    const idOf = (idx: number): string | undefined => {
        const m = messages[idx] as ModelMessage & { id?: string };
        return m?.id ?? (typeof idx === 'number' ? `message-index-${idx}` : undefined);
    };
    return { first: idOf(firstIdx), last: idOf(lastIdx) };
}

/**
 * Estimate characters in a single ModelMessage. Mirrors
 * `estimateMessageContentSize` from `service/chat/token-estimation.ts` but
 * adapted for ai-sdk's `ModelMessage` shape, where `content` can be either a
 * plain string or a structured part array.
 */
function estimateMessageChars(message: ModelMessage): number {
    const content = message.content as unknown;
    if (typeof content === 'string') {
        return content.length;
    }
    if (!Array.isArray(content)) {
        // Unknown shape — fall back to bounded structural walk.
        return estimateObjectSize(content);
    }
    let chars = 0;
    for (const part of content) {
        if (typeof part === 'string') {
            chars += part.length;
            continue;
        }
        if (!part || typeof part !== 'object') {
            chars += 20;
            continue;
        }
        const p = part as { type?: string; [k: string]: unknown };
        switch (p.type) {
            case 'text':
            case 'reasoning':
                chars += typeof p.text === 'string' ? p.text.length : 0;
                break;
            case 'tool-call':
                chars += typeof p.toolName === 'string' ? p.toolName.length : 0;
                chars += typeof p.toolCallId === 'string' ? p.toolCallId.length : 0;
                chars += estimateObjectSize((p as any).input);
                break;
            case 'tool-result':
                chars += typeof p.toolName === 'string' ? p.toolName.length : 0;
                chars += typeof p.toolCallId === 'string' ? p.toolCallId.length : 0;
                chars += estimateObjectSize((p as any).output ?? (p as any).result);
                break;
            case 'image':
            case 'file':
                chars += typeof p.mediaType === 'string' ? p.mediaType.length : 0;
                chars += typeof (p as any).data === 'string' ? (p as any).data.length : 200;
                break;
            default:
                chars += estimateObjectSize(p);
        }
    }
    return chars;
}
