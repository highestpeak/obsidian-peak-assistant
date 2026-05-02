import type { LLMRequestMessage, LLMStreamEvent, ModelCapabilities } from '@/core/providers/types';
import type { ContextSlot, ContextProfile, SlotBuildContext } from './slots/types';
import { BudgetGovernor, type GovernedSlot } from './BudgetGovernor';

export class ContextPipeline {
  private readonly slotRegistry: Map<string, ContextSlot>;
  private readonly budgetGovernor = new BudgetGovernor();

  constructor(slots: ContextSlot[]) {
    this.slotRegistry = new Map(slots.map(s => [s.id, s]));
  }

  /**
   * Assemble context for a given profile.
   * Drop-in replacement for ContextBuilder.buildContextMessages().
   */
  async *assemble(
    profile: ContextProfile,
    buildCtx: SlotBuildContext,
    modelCapabilities?: ModelCapabilities,
  ): AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void> {
    const startTime = Date.now();
    yield { type: 'tool-call', toolName: 'context-pipeline:assemble', input: { profileId: profile.id } };

    // 1. Resolve budget
    const totalBudget = this.resolveBudget(profile, modelCapabilities);

    // 2. Build all slots in parallel
    yield { type: 'tool-call', toolName: 'context-pipeline:build-slots', input: { slotCount: profile.slots.length } };
    const items: GovernedSlot[] = [];
    const buildResults = await Promise.allSettled(
      profile.slots.map(async config => {
        const slot = this.slotRegistry.get(config.slotId);
        if (!slot) return null;
        const mergedCtx: SlotBuildContext = { ...buildCtx, ...(config.buildParams ?? {}) };
        const content = await slot.build(mergedCtx);
        return { slot, content, config } as GovernedSlot;
      })
    );
    for (const result of buildResults) {
      if (result.status === 'fulfilled' && result.value) {
        items.push(result.value);
      }
    }
    yield { type: 'tool-result', toolName: 'context-pipeline:build-slots',
      output: { builtCount: items.length, totalTokens: items.reduce((s, i) => s + i.content.tokens, 0) }
    };

    // 3. Budget governance
    yield { type: 'tool-call', toolName: 'context-pipeline:budget-govern', input: { totalBudget } };
    const governed = await this.budgetGovernor.fit(items, totalBudget);
    yield { type: 'tool-result', toolName: 'context-pipeline:budget-govern',
      output: { survivingSlots: governed.length, totalTokens: governed.reduce((s, g) => s + g.content.tokens, 0) }
    };

    // 4. Render in profile order (profile.slots defines order)
    const slotOrder = profile.slots.map(s => s.slotId);
    const ordered = governed.sort((a, b) =>
      slotOrder.indexOf(a.config.slotId) - slotOrder.indexOf(b.config.slotId)
    );

    const messages: LLMRequestMessage[] = [];
    for (const item of ordered) {
      messages.push(...item.slot.render(item.content));
    }

    yield { type: 'tool-result', toolName: 'context-pipeline:assemble',
      input: { profileId: profile.id },
      output: { messageCount: messages.length, durationMs: Date.now() - startTime }
    };

    return messages;
  }

  private resolveBudget(profile: ContextProfile, modelCapabilities?: ModelCapabilities): number {
    if (typeof profile.totalBudget === 'number') return profile.totalBudget;

    // ModelCapabilities.maxCtx is the context window size
    const contextWindow = modelCapabilities?.maxCtx ?? 200000;
    const outputReserve = 8192;
    const safetyMargin = 0.05 * contextWindow;

    return contextWindow - outputReserve - safetyMargin;
  }
}
