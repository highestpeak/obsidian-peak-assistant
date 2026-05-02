import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class ActivityIndexSlot implements ContextSlot {
  id = 'activity-index';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const wc = ctx.sessionContext.getWorkingContext();
    if (wc.recentActivities.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const now = Date.now();
    const activities = wc.recentActivities.slice(0, 10).map((a, i) => ({
      id: `A${i + 1}`,
      timeAgo: formatTimeAgo(now - a.timestamp),
      summary: a.summary,
    }));

    const counts: Record<string, number> = { total: wc.recentActivities.length };
    for (const a of wc.recentActivities) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }

    const text = (await this.promptService.render(PromptId.ActivityIndexRender, {
      activities,
      counts,
    })).trim();

    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: { text, activities }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { activities } = content.data as { text: string; activities: Array<{ id: string; timeAgo: string; summary: string }> };

    if (level >= 1) {
      const countText = `Recent activity: ${activities.length} actions`;
      return { data: { text: countText, activities: [] }, tokens: estimateTokensFromText(countText), compressionLevel: 1 };
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

function formatTimeAgo(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}
