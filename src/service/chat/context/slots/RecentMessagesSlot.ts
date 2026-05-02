import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage, MessagePart } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import type { ResourceSummaryService } from '../ResourceSummaryService';
import { PromptId } from '@/service/prompt/PromptId';
import { getImageMimeType, getFileMimeType } from '@/core/document/helper/FileTypeUtils';
import { readFileAsBase64 } from '@/core/utils/obsidian-utils';

const DEFAULT_MAX_RECENT = 10;

export class RecentMessagesSlot implements ContextSlot {
  id = 'recent-messages';

  constructor(
    private readonly promptService: PromptService,
    private readonly resourceSummaryService: ResourceSummaryService,
  ) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const messages = ctx.messages ?? [];
    const maxRecent = (ctx.maxRecentMessages as number) ?? DEFAULT_MAX_RECENT;
    const recent = messages.slice(-maxRecent);

    let totalTokens = 0;
    for (const msg of recent) {
      if (msg.content) totalTokens += estimateTokensFromText(msg.content);
    }

    return {
      data: { messages: recent, ctx },
      tokens: totalTokens,
      compressionLevel: 0,
    };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    const { messages, ctx } = content.data as { messages: any[]; ctx: SlotBuildContext };

    if (level === 1) {
      const reduced = messages.slice(-Math.ceil(messages.length / 2));
      let tokens = 0;
      for (const msg of reduced) {
        if (msg.content) tokens += estimateTokensFromText(msg.content);
      }
      return { data: { messages: reduced, ctx }, tokens, compressionLevel: 1 };
    }

    if (level === 2) {
      const verbatim = messages.slice(-3);
      const older = messages.slice(0, -3);
      const olderSummaries = older.map((m: any) => ({
        ...m,
        content: `[${m.role}]: ${(m.content ?? '').slice(0, 100)}...`,
        _compressed: true,
      }));
      const all = [...olderSummaries, ...verbatim];
      let tokens = 0;
      for (const msg of all) {
        if (msg.content) tokens += estimateTokensFromText(msg.content);
      }
      return { data: { messages: all, ctx }, tokens, compressionLevel: 2 };
    }

    // L3: LLM summarize would be handled by BudgetGovernor externally
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    const { messages, ctx } = content.data as { messages: any[]; ctx: SlotBuildContext };
    const result: LLMRequestMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const parts: MessagePart[] = [];

      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }

      if (msg.resources && msg.resources.length > 0) {
        const isLatest = i === messages.length - 1;
        if (isLatest && ctx.attachmentHandlingMode === 'direct') {
          // Direct resource content would be built here
          // (delegated to the existing buildDirectResourceContent logic)
        } else {
          parts.push({
            type: 'text',
            text: `[Attached: ${msg.resources.map((r: any) => r.id ?? r.source).join(', ')}]`,
          });
        }
      }

      if (parts.length > 0) {
        result.push({ role: msg.role, content: parts });
      }
    }

    return result;
  }
}
