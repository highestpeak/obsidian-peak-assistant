import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class ConvSummarySlot implements ContextSlot {
  id = 'conv-summary';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const conv = ctx.conversation;
    const project = ctx.project;
    if (!conv) return { data: null, tokens: 0, compressionLevel: 0 };

    const projectSummary = project?.context?.fullSummary || project?.context?.shortSummary;
    const convSummary = conv.context?.fullSummary || conv.context?.shortSummary;

    const templateVars = {
      hasProject: !!project && !!projectSummary,
      projectName: project?.meta.name || '',
      projectSummary: projectSummary || '',
      projectResources: (project?.context?.resourceIndex || []).map(r => ({
        displayName: r.title || r.id,
        displaySummary: r.shortSummary || r.source,
      })),
      hasConversation: !!convSummary,
      conversationSummary: convSummary || '',
      conversationTopics: conv.context?.topics || [],
      conversationResources: (conv.context?.resourceIndex || []).map(r => ({
        displayName: r.title || r.id,
        displaySummary: r.shortSummary || r.source,
      })),
    };

    const text = (await this.promptService.render(PromptId.ContextMemory, templateVars)).trim();
    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };

    return { data: { text, templateVars }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { templateVars } = content.data as { text: string; templateVars: any };

    if (level >= 1) {
      const conv = templateVars;
      const shortText = [
        conv.hasProject ? `Project: ${conv.projectName}` : '',
        conv.hasConversation ? `Summary: ${conv.conversationSummary.slice(0, 200)}` : '',
      ].filter(Boolean).join('\n');
      return { data: { text: shortText, templateVars }, tokens: estimateTokensFromText(shortText), compressionLevel: 1 };
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
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
