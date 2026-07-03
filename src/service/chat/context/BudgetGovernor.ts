import type { ContextSlot, SlotConfig, SlotContent } from './slots/types';
import type { CompactSummary } from '@/core/context/compactSummary';
import { makeDroppedSlotSummary } from '@/core/context/compactSummary';

export interface GovernedSlot {
  slot: ContextSlot;
  content: SlotContent;
  config: SlotConfig;
}

export interface GovernResult {
  items: GovernedSlot[];
  /**
   * Compaction records produced by this fit() call. Phase 2 drops are always
   * recorded; heavier compressions may be recorded in future revisions. Empty
   * when the input fit within budget with no compaction.
   */
  summaries: CompactSummary[];
}

export class BudgetGovernor {
  /**
   * Fit slot contents within a token budget.
   * Strategy: compress lowest-priority non-required slots first (L1 → L2 → L3),
   * then drop if still over budget. Required slots are never dropped.
   *
   * Whenever Phase 2 drops a slot, a `CompactSummary` is emitted so callers
   * (the trace pipeline, the agent tool layer, UI) can render "N slots were
   * dropped" and refetch source material on demand instead of losing it silently.
   */
  async fit(items: GovernedSlot[], totalBudget: number): Promise<GovernResult> {
    const summaries: CompactSummary[] = [];

    // Phase 0: Enforce per-slot maxTokens — compress slots that exceed their individual cap
    for (const item of items) {
      const cap = item.config.maxTokens;
      if (cap === 'rest' || item.content.tokens <= cap) continue;
      for (const level of [1, 2, 3] as const) {
        if (item.content.tokens <= cap) break;
        if (level > item.config.maxCompressionLevel) break;
        if (item.content.compressionLevel >= level) continue;
        item.content = await item.slot.compress(item.content, level);
      }
    }

    let totalTokens = items.reduce((s, item) => s + item.content.tokens, 0);

    if (totalTokens <= totalBudget) return { items, summaries };

    const compressible = items
      .filter(item => !item.config.required)
      .sort((a, b) => a.config.priority - b.config.priority);

    // Phase 1: Per-slot cascade — compress lowest-priority slot through all
    // its levels before touching the next slot
    for (const item of compressible) {
      if (totalTokens <= totalBudget) break;

      for (const level of [1, 2, 3] as const) {
        if (totalTokens <= totalBudget) break;
        if (level > item.config.maxCompressionLevel) continue;
        if (item.content.compressionLevel >= level) continue;

        const before = item.content.tokens;
        const compressed = await item.slot.compress(item.content, level);
        const saved = before - compressed.tokens;
        if (saved > 0) {
          totalTokens -= saved;
          item.content = compressed;
        }
      }
    }

    // Phase 2: Drop — record a CompactSummary anchor for each drop so the
    // agent (or UI trace) can rehydrate the slot instead of silently losing it.
    if (totalTokens > totalBudget) {
      for (const item of compressible) {
        if (totalTokens <= totalBudget) break;
        const priorTokens = item.content.tokens;
        if (priorTokens === 0) continue;
        totalTokens -= priorTokens;
        summaries.push(makeDroppedSlotSummary(item.config.slotId, priorTokens));
        item.content = { data: null, tokens: 0, compressionLevel: 0 };
      }
    }

    return {
      items: items.filter(item => item.content.tokens > 0 || item.config.required),
      summaries,
    };
  }
}
