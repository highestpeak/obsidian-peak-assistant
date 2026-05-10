import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

/**
 * Build the dynamic capabilities object for the conversation system prompt.
 * Reads current session toggles from chatViewStore and provider availability
 * from ProfileRegistry.
 */
function buildCapabilities() {
  const { enableWebSearch, enableVaultSearch } = useChatViewStore.getState();
  return {
    webSearchAvailable: !!ProfileRegistry.getInstance().getActiveWebSearchProfile(),
    webSearchEnabled: enableWebSearch,
    vaultSearchAvailable: true,
    vaultSearchEnabled: enableVaultSearch,
  };
}

export class SystemPromptSlot implements ContextSlot {
  id = 'system-prompt';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const promptId = (ctx.systemPromptId as PromptId) ?? PromptId.ConversationSystem;
    const capabilities = buildCapabilities();
    const vars = { ...(ctx.systemPromptVars ?? {}), capabilities };
    const text = await this.promptService.render(promptId, vars);
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
