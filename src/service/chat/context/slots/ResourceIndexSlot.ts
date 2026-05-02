import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';

interface ResourceEntry {
  id?: string;
  title?: string;
  shortSummary?: string;
  source?: string;
}

export class ResourceIndexSlot implements ContextSlot {
  id = 'resource-index';

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const resources: ResourceEntry[] = [
      ...((ctx.project?.context as any)?.resourceIndex ?? []),
      ...((ctx.conversation?.context as any)?.resourceIndex ?? []),
    ];

    if (resources.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const lines = resources.map(r =>
      `- ${r.title || r.id || 'unknown'}: ${r.shortSummary || r.source || ''}`
    );
    const text = `## Referenced Resources\n${lines.join('\n')}`;
    return { data: { text, resources }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { resources } = content.data as { text: string; resources: ResourceEntry[] };

    if (level >= 1) {
      const titles = resources.map(r => r.title || r.id || 'unknown').join(', ');
      const short = `Resources: ${titles}`;
      return { data: { text: short, resources }, tokens: estimateTokensFromText(short), compressionLevel: 1 };
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
