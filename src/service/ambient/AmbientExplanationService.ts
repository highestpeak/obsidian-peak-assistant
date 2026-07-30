// T11Y-5: tier-2 LLM micro-explanation service.
//
// Lifted out of `LlmAmbientExplanationAdapter` (T8): the adapter
// previously owned cooldown state, prompt rendering through
// TemplateManager, the Harness call, and result trimming +
// 500-char truncation. This service now owns the cooldown gate,
// prompt rendering, and result trimming. The adapter is reduced to
// "resolve profile, run the prompt, hand back collected text".
//
// Owner decision (T11Y-5 plan): port shape unchanged
// (`Promise<string | null>`), no streaming surface added. The 500-char
// truncation moves OUT of the data layer entirely — the trimmed text
// is returned in full and PushCard applies a `line-clamp` + tooltip
// when displaying it.

import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';

/**
 * Adapter-supplied "run this prompt and give me the collected text"
 * surface. The adapter wraps Peak Harness (or any other
 * provider) and concatenates / resolves the model stream into a
 * single string. The service holds cooldown, prompt rendering, and
 * trimming.
 *
 * Returns `null` when there is no active profile or the provider
 * cannot be reached; returns `""` when the LLM produced no usable
 * text (the service treats both as a no-op).
 */
export interface AmbientExplanationLlmPort {
	collectText(input: {
		prompt: string;
		systemPrompt: string;
	}): Promise<string | null>;
}

const PARAGRAPH_INPUT_LIMIT = 300;
const EXCERPT_INPUT_LIMIT = 200;

export class AmbientExplanationService {
	private lastCallTs = 0;

	constructor(
		private readonly llm: AmbientExplanationLlmPort,
		private readonly nowFn: () => number = Date.now,
	) {}

	async generate(input: {
		currentParagraph: string;
		pushNoteTitle: string;
		pushNoteExcerpt: string;
		cooldownMs: number;
	}): Promise<string | null> {
		const now = this.nowFn();
		if (now - this.lastCallTs < input.cooldownMs) return null;
		this.lastCallTs = now;

		const tm = TemplateManager.getInstance();
		if (!tm) return null;

		const prompt = await tm.render(PromptId.AmbientExplanationUser, {
			currentParagraph: input.currentParagraph.slice(0, PARAGRAPH_INPUT_LIMIT),
			pushNoteTitle: input.pushNoteTitle,
			pushNoteExcerpt: input.pushNoteExcerpt.slice(0, EXCERPT_INPUT_LIMIT),
		});
		const systemPrompt = await tm.render(PromptId.AmbientExplanationSystem, {});

		try {
			const text = await this.llm.collectText({ prompt, systemPrompt });
			if (text === null) return null;
			const trimmed = text.trim();
			return trimmed.length > 0 ? trimmed : null;
		} catch (err) {
			console.debug('[AmbientExplanationService] LLM explanation failed (non-critical):', err);
			return null;
		}
	}
}
