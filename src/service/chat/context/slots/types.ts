import type { LLMRequestMessage, ModelCapabilities } from '@/core/providers/types';
import type { ChatConversation, ChatProject, ChatMessage } from '../../types';
import type { SessionContextService } from '@/service/context/SessionContextService';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { ResolvedAssistant } from '../../assistant/assistantResolver';

export interface SlotBuildContext {
  sessionContext: SessionContextService;
  conversation?: ChatConversation;
  project?: ChatProject;
  messages?: ChatMessage[];
  activeFilePath?: string;
  modelCapabilities?: ModelCapabilities;
  app: AppHandle;
  /**
   * B2 (plan §5.3): the pre-resolved Assistant snapshot for this turn. Null
   * or undefined = Default assistant. Populated once in
   * `service-conversation.streamChat` and threaded here so slots don't have
   * to reach `AssistantService` themselves. See {@link AssistantSlot} for
   * the primary consumer.
   */
  resolvedAssistant?: ResolvedAssistant | null;
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

/** Helper: format a millisecond duration as human-readable "Xmin ago" / "Xh ago" */
export function formatTimeAgo(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
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

/** Render text content as a single system message. Returns [] if text is empty. */
export function renderSystemText(text: string | null | undefined): LLMRequestMessage[] {
  if (!text) return [];
  return [{ role: 'system', content: [{ type: 'text', text }] }];
}

/** Render text content as a single user message. Returns [] if text is empty. */
export function renderUserText(text: string | null | undefined): LLMRequestMessage[] {
  if (!text) return [];
  return [{ role: 'user', content: [{ type: 'text', text }] }];
}

/** Standard empty SlotContent: no data, zero tokens, level 0. */
export const EMPTY_SLOT_CONTENT: SlotContent = { data: null, tokens: 0, compressionLevel: 0 };
