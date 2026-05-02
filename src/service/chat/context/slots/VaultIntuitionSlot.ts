import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export class VaultIntuitionSlot implements ContextSlot {
  id = 'vault-intuition';

  async build(): Promise<SlotContent> {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo('vault');
    const intuitionJson = await indexStateRepo.get('knowledge_intuition_json');

    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
    const folders = await nodeRepo.listTopFoldersForSearchOrient(30);

    const parts: string[] = [];
    if (intuitionJson) parts.push(`## Vault Knowledge Map\n${intuitionJson}`);
    if (folders.length > 0) {
      parts.push('## Top Folders\n' + folders.map(f =>
        `- ${f.folderPath} (${f.docCount} docs)`
      ).join('\n'));
    }

    const text = parts.join('\n\n');
    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      const truncated = text.slice(0, 1000);
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
