import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import type { UserProfileService } from '@/service/chat/context/UserProfileService';
import { PromptId } from '@/service/prompt/PromptId';

export class UserProfileSlot implements ContextSlot {
  id = 'user-profile';

  constructor(
    private readonly promptService: PromptService,
    private readonly userProfileService: UserProfileService | undefined,
  ) {}

  async build(): Promise<SlotContent> {
    if (!this.userProfileService) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }
    const contextMap = await this.userProfileService.loadContext();
    if (contextMap.size === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const entries = Array.from(contextMap.entries()).map(([category, texts]) => ({
      category,
      texts: texts.join(', '),
    }));

    const text = (await this.promptService.render(PromptId.UserProfileContext, {
      contextEntries: entries,
    })).trim();

    return { data: { text, entries }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (level >= 1 && content.data) {
      const { entries } = content.data as { text: string; entries: Array<{ category: string; texts: string }> };
      const truncated = entries.slice(0, 3);
      const text = truncated.map(e => `${e.category}: ${e.texts}`).join('\n');
      return { data: { text, entries: truncated }, tokens: estimateTokensFromText(text), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'user', content: [{ type: 'text', text }] }];
  }
}
