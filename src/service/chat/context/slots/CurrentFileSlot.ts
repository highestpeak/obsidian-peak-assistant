import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { TFile } from 'obsidian';

export class CurrentFileSlot implements ContextSlot {
  id = 'current-file';

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const app = ctx.app;
    const filePath = ctx.activeFilePath ?? app.workspace.getActiveFile()?.path;
    if (!filePath) return { data: null, tokens: 0, compressionLevel: 0 };

    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return { data: null, tokens: 0, compressionLevel: 0 };

    const tfile = file as TFile;
    const metadataOnly = ctx.metadataOnly as boolean | undefined;
    const cache = app.metadataCache.getFileCache(tfile);

    if (metadataOnly) {
      const meta = [
        `File: ${filePath}`,
        cache?.frontmatter?.tags ? `Tags: ${cache.frontmatter.tags}` : '',
        cache?.headings ? `Headings: ${cache.headings.map(h => h.heading).join(', ')}` : '',
      ].filter(Boolean).join('\n');
      return { data: meta, tokens: estimateTokensFromText(meta), compressionLevel: 0 };
    }

    const content = await app.vault.cachedRead(tfile);
    const maxChars = 40000;
    const truncated = content.length > maxChars ? content.slice(0, maxChars) + '\n...[truncated]' : content;
    const text = `## Current File: ${filePath}\n\n${truncated}`;

    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      const truncated = text.slice(0, 2000) + '\n...[truncated]';
      return { data: truncated, tokens: estimateTokensFromText(truncated), compressionLevel: 1 };
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
