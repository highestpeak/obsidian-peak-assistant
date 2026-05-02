import type { LLMRequestMessage, ModelCapabilities } from '@/core/providers/types';
import type { ChatConversation, ChatProject, ChatMessage } from '../../types';
import type { SessionContextService } from '@/service/context/SessionContextService';
import type { App } from 'obsidian';

export interface SlotBuildContext {
  sessionContext: SessionContextService;
  conversation?: ChatConversation;
  project?: ChatProject;
  messages?: ChatMessage[];
  activeFilePath?: string;
  modelCapabilities?: ModelCapabilities;
  app: App;
  [key: string]: unknown; // buildParams from profile
}

export interface SlotContent {
  data: unknown;
  tokens: number;
  compressionLevel: 0 | 1 | 2 | 3;
}

export interface ContextSlot {
  id: string;
  build(ctx: SlotBuildContext): Promise<SlotContent>;
  compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent>;
  estimateTokens(content: SlotContent): number;
  render(content: SlotContent): LLMRequestMessage[];
}

export interface SlotConfig {
  slotId: string;
  priority: number;
  maxTokens: number | 'rest';
  required: boolean;
  maxCompressionLevel: 0 | 1 | 2 | 3;
  buildParams?: Record<string, unknown>;
}

export interface ContextProfile {
  id: string;
  totalBudget: number | 'auto';
  slots: SlotConfig[];
}

/** Helper: estimate tokens from text (fast heuristic) */
export function estimateTokensFromText(text: string): number {
  // CJK characters are ~1 token each, Latin ~0.25 tokens per char
  let cjkChars = 0;
  let otherChars = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) cjkChars++;
    else otherChars++;
  }
  return Math.ceil(cjkChars + otherChars / 3.5);
}
