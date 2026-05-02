import type { ContextSlot, SlotConfig, SlotContent } from './slots/types';

export interface GovernedSlot {
  slot: ContextSlot;
  content: SlotContent;
  config: SlotConfig;
}

export class BudgetGovernor {
  /**
   * Fit slot contents within a token budget.
   * Strategy: compress lowest-priority non-required slots first (L1 → L2 → L3),
   * then drop if still over budget. Required slots are never dropped.
   */
  async fit(items: GovernedSlot[], totalBudget: number): Promise<GovernedSlot[]> {
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

    if (totalTokens <= totalBudget) return items;

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

    // Phase 2: Drop
    if (totalTokens > totalBudget) {
      for (const item of compressible) {
        if (totalTokens <= totalBudget) break;
        totalTokens -= item.content.tokens;
        item.content = { data: null, tokens: 0, compressionLevel: 0 };
      }
    }

    return items.filter(item => item.content.tokens > 0 || item.config.required);
  }
}
