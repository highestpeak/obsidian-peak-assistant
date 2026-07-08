import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/core/types/prompt';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { ChatRuntimeStatePort } from '@/core/ports/ChatRuntimeStatePort';
import { TemplateManager } from '@/core/template/TemplateManager';
import { DEFAULT_RICH_OUTPUT_TYPES, loadRichOutputTypes, type RichOutputType } from '@/service/prompt/richOutputTypes';

/**
 * Build the dynamic capabilities object for the conversation system prompt.
 * Reads current session toggles via the injected port and provider
 * availability from ProfileRegistry.
 *
 * T11I (2026-06-26): toggles now flow through ChatRuntimeStatePort
 * instead of `useChatViewStore.getState()` so this file is free of
 * `@/ui/*` imports.
 */
function buildCapabilities(chatState: ChatRuntimeStatePort) {
  return {
    webSearchAvailable: !!ProfileRegistry.getInstance().getActiveWebSearchProfile(),
    webSearchEnabled: chatState.isWebSearchEnabled(),
    vaultSearchAvailable: true,
    vaultSearchEnabled: chatState.isVaultSearchEnabled(),
  };
}

export class SystemPromptSlot implements ContextSlot {
  id = 'system-prompt';

  constructor(
    private readonly promptService: PromptService,
    private readonly chatState: ChatRuntimeStatePort,
  ) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const promptId = (ctx.systemPromptId as PromptId) ?? PromptId.ConversationSystem;
    const capabilities = buildCapabilities(this.chatState);
    const richOutputTypes = await this.resolveRichOutputTypes();
    const vars = { ...(ctx.systemPromptVars ?? {}), capabilities, richOutputTypes };
    let text = await this.promptService.render(promptId, vars);

    // Prepend per-conversation custom system prompt if set
    const customPrompt = ctx.conversation?.meta?.customSystemPrompt;
    if (customPrompt) {
      text = customPrompt.trim() + '\n\n' + text;
    }

    // Append focus folder context if set
    const focusFolder = ctx.conversation?.meta?.focusFolder;
    if (focusFolder) {
      text += `\n\n[Focus Mode] The user is focusing on the folder "${focusFolder}". ` +
        'Prioritize notes and context from this folder. When searching, default to this folder scope. ' +
        'Reference files in this folder when relevant to the conversation.';
    }

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

  /**
   * Rich-output types are template-driven so template authors can add
   * a new output convention without touching typescript. TemplateManager
   * loads the JSON at runtime; if the singleton isn't bound (test /
   * bootstrap) fall back to the compiled defaults so the prompt is never
   * emitted without Mermaid + Bases coverage.
   */
  private async resolveRichOutputTypes(): Promise<RichOutputType[]> {
    const tm = TemplateManager.getInstance();
    if (!tm) return [...DEFAULT_RICH_OUTPUT_TYPES];
    return loadRichOutputTypes(tm);
  }
}
