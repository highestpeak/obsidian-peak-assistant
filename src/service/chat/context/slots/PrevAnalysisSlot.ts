import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { AnalysisHistoryPort, AnalysisHistoryRecord } from '@/core/ports/AnalysisHistoryPort';

export class PrevAnalysisSlot implements ContextSlot {
  id = 'prev-analysis';

  constructor(private readonly history: AnalysisHistoryPort) {}

  async build(_ctx: SlotBuildContext): Promise<SlotContent> {
    const records = await this.history.list({ limit: 3, offset: 0 });

    if (records.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const lines = records.map(r =>
      `- "${r.query ?? ''}" → ${r.title ?? r.id} (${r.sources_count ?? 0} sources, ${new Date(r.created_at_ts).toLocaleString()})`
    );

    const text = `## Recent AI Analyses\n${lines.join('\n')}\n\nUse get_recent_analysis_result(query) for full details.`;
    return { data: { text, records }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { records } = content.data as { text: string; records: AnalysisHistoryRecord[] };

    if (level >= 1) {
      const r = records[0];
      const short = `Recent analysis: "${r.query ?? ''}" → ${r.title ?? r.id}`;
      return { data: { text: short, records: [r] }, tokens: estimateTokensFromText(short), compressionLevel: 1 };
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
