import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText, formatTimeAgo } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class WorkingContextSlot implements ContextSlot {
  id = 'working-context';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const wc = ctx.sessionContext.getWorkingContext();
    const theme = wc.workingTheme.llmInferred?.summary ?? wc.workingTheme.ruleBased.summary;

    const now = Date.now();
    const recentActivities = wc.recentActivities.slice(0, 8).map(a => ({
      summary: a.summary,
      timeAgo: formatTimeAgo(now - a.timestamp),
    }));

    const text = (await this.promptService.render(PromptId.WorkingContextRender, {
      theme,
      recentActivities,
      activeFile: wc.activeFile ? { path: wc.activeFile.path, title: wc.activeFile.title } : null,
    })).trim();

    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      const lines = text.split('\n').filter(l => l.trim());
      const reduced = lines.slice(0, 3).join('\n');
      return { data: reduced, tokens: estimateTokensFromText(reduced), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    return [{ role: 'system', content: [{ type: 'text', text: content.data as string }] }];
  }
}
