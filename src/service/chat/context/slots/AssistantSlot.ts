/**
 * AssistantSlot — task B2 (plan §5.3.2).
 *
 * Injects a bound Assistant's `instructions` as a system message into the
 * chat context. This is the ONLY path from `ChatAssistantDefinition` into
 * the LLM prompt; React / Composer never render or splice instructions into
 * the user prompt (see plan §5.3.2 hard rule).
 *
 * The slot reads `SlotBuildContext.resolvedAssistant` — a snapshot produced
 * upstream in `service-conversation.streamChat` by
 * `resolveAssistantForConversation`. Absent snapshot = Default assistant =
 * this slot renders nothing (returns empty content).
 *
 * Priority sits between `system-prompt` (1000) and `user-profile` (600) at
 * 900, so persona lands directly after the base system prompt — before
 * project/conversation summaries and long-term user profile context. This
 * ordering keeps the persona the "first thing after the base rules"
 * without displacing base rules or memory.
 */

import { estimateTokensFromText, renderSystemText } from './types';
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';

export class AssistantSlot implements ContextSlot {
	id = 'assistant';

	async build(ctx: SlotBuildContext): Promise<SlotContent> {
		const resolved = ctx.resolvedAssistant as
			| { definition: { instructions?: string; name?: string } }
			| null
			| undefined;
		if (!resolved) return { data: null, tokens: 0, compressionLevel: 0 };

		const instructions = (resolved.definition.instructions ?? '').trim();
		if (!instructions) return { data: null, tokens: 0, compressionLevel: 0 };

		// Keep the framing minimal — the instructions themselves are the
		// content. A short header helps the model attribute the block to a
		// role/persona vs the base system prompt above it.
		const name = (resolved.definition.name ?? '').trim() || 'Assistant';
		const text = `You are acting as the "${name}" assistant. Follow these instructions:\n\n${instructions}`;
		return { data: { text }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
	}

	async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
		if (!content.data) return content;
		const { text } = content.data as { text: string };
		if (level >= 1) {
			// Compression drops the framing header but keeps the instructions
			// themselves — they are the user's authored directive and losing
			// them would silently disable the persona.
			const stripped = text.split('\n\n').slice(1).join('\n\n') || text;
			return {
				data: { text: stripped },
				tokens: estimateTokensFromText(stripped),
				compressionLevel: 1,
			};
		}
		return content;
	}

	estimateTokens(content: SlotContent): number {
		return content.tokens;
	}

	render(content: SlotContent): LLMRequestMessage[] {
		if (!content.data) return [];
		const { text } = content.data as { text: string };
		return renderSystemText(text);
	}
}
