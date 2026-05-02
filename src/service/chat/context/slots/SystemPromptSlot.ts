import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class SystemPromptSlot implements ContextSlot {
  id = 'system-prompt';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const promptId = (ctx.systemPromptId as PromptId) ?? PromptId.ConversationSystem;
    const text = await this.promptService.render(promptId, ctx.systemPromptVars ?? {});
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent): Promise<SlotContent> {
    return content; // System prompt is not compressible
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    const text = content.data as string;
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
