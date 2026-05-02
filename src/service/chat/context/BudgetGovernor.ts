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
    let totalTokens = items.reduce((s, item) => s + item.content.tokens, 0);

    if (totalTokens <= totalBudget) return items;

    const compressible = items
      .filter(item => !item.config.required)
      .sort((a, b) => a.config.priority - b.config.priority);

    // Phase 1: Try compression levels L1 → L2 → L3
    for (const level of [1, 2, 3] as const) {
      if (totalTokens <= totalBudget) break;

      for (const item of compressible) {
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
