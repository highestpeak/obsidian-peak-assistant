/**
 * MemoryBlock helpers. See spec §3.8 "Memory Block 概念".
 *
 * The `MemoryBlock` interface lives in ./types so it can be imported by
 * consumers without pulling helpers. This module bundles the conventional
 * factory + serialization utilities.
 */

import type { MemoryBlock } from './types';

export const DEFAULT_BLOCK_PRIORITY = 5;

/**
 * Create a MemoryBlock with sensible defaults. Required fields are `id` +
 * `name` + `content`; everything else defaults to "non-pinned, medium
 * priority, unbounded budget".
 */
export function createMemoryBlock(input: {
    id: string;
    name: string;
    content: string;
    priority?: number;
    tokenBudget?: number;
    evictable?: boolean;
}): MemoryBlock {
    if (!input.id) throw new Error('createMemoryBlock: id is required');
    if (!input.name) throw new Error('createMemoryBlock: name is required');
    return {
        id: input.id,
        name: input.name,
        content: input.content ?? '',
        priority: input.priority ?? DEFAULT_BLOCK_PRIORITY,
        tokenBudget: input.tokenBudget,
        evictable: input.evictable ?? true,
    };
}

/**
 * Render a block as a labeled text section, suitable for injection into the
 * system prompt. Keeps the format simple + greppable so subagents can also
 * parse it if they need to.
 */
export function renderMemoryBlock(block: MemoryBlock): string {
    return `# memory:${block.name}\n${block.content}`;
}

/**
 * Render every block in priority order (highest first) as one concatenated
 * string ready to append to a system prompt.
 */
export function renderMemoryBlocks(blocks: ReadonlyArray<MemoryBlock>): string {
    if (blocks.length === 0) return '';
    return blocks
        .slice()
        .sort((a, b) => b.priority - a.priority)
        .map(renderMemoryBlock)
        .join('\n\n');
}
