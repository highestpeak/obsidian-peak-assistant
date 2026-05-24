/**
 * In-memory registry of named MemoryBlocks. See spec §3.8.
 *
 * The store itself is intentionally synchronous and dependency-free — it is
 * only the working-memory bag. Persistence (episodic / procedural) is handled
 * elsewhere (chat.sqlite repos, ReflectionStore).
 */

import type { MemoryBlock, MemoryStoreSnapshot } from './types';

export class MemoryStore {
    private readonly blocks = new Map<string, MemoryBlock>();

    /**
     * Register or replace a block by id. Later writes overwrite earlier ones
     * — callers that want diff semantics should read + merge themselves.
     */
    set(block: MemoryBlock): void {
        if (!block.id) throw new Error('MemoryStore.set: block.id is required');
        this.blocks.set(block.id, { ...block });
    }

    /** Remove a block by id. No-op if absent. */
    remove(id: string): void {
        this.blocks.delete(id);
    }

    /** Drop every block. */
    clear(): void {
        this.blocks.clear();
    }

    get(id: string): MemoryBlock | undefined {
        const found = this.blocks.get(id);
        return found ? { ...found } : undefined;
    }

    has(id: string): boolean {
        return this.blocks.has(id);
    }

    /**
     * Snapshot of all currently registered blocks, sorted by priority desc
     * (highest first). Returned array is a fresh copy; mutating it does not
     * affect the store.
     */
    activeBlocks(): MemoryBlock[] {
        return Array.from(this.blocks.values())
            .map((b) => ({ ...b }))
            .sort((a, b) => b.priority - a.priority);
    }

    snapshot(): MemoryStoreSnapshot {
        return { blocks: this.activeBlocks() };
    }

    size(): number {
        return this.blocks.size;
    }
}
