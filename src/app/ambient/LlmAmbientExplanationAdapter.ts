// T11Y-5: tier-2 LLM micro-explanation adapter.
//
// This adapter resolves the Fast binding and runs the prompt through the
// Peak Harness. Cooldown, prompt rendering, and result trimming live in
// `AmbientExplanationService` (service layer).
//
// The 500-char truncation that historically lived here was removed;
// PushCard handles the display constraint via `line-clamp` + tooltip.

import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';
import {
	AmbientExplanationService,
	type AmbientExplanationLlmPort,
} from '@/service/ambient/AmbientExplanationService';
import type { AmbientExplanationPort } from '@/core/ports/AmbientPorts';

class HarnessAmbientLlmPort implements AmbientExplanationLlmPort {
	async collectText(input: {
		prompt: string;
		systemPrompt: string;
	}): Promise<string | null> {
		const binding = ProfileRegistry.getInstance().resolveSlot('fast');
		if (!binding) return null;
		const { text } = await runHarnessText({
			loopId: `ambient-explanation-${crypto.randomUUID()}`,
			profile: binding.profile,
			modelId: binding.modelId,
			prompt: input.prompt,
			systemPrompt: input.systemPrompt,
			maxSteps: 1,
		});
		return text;
	}
}

export class LlmAmbientExplanationAdapter implements AmbientExplanationPort {
	private readonly service: AmbientExplanationService;

	constructor(service?: AmbientExplanationService) {
		this.service = service ?? new AmbientExplanationService(new HarnessAmbientLlmPort());
	}

	generateLlmExplanation(
		currentParagraph: string,
		pushNoteTitle: string,
		pushNoteExcerpt: string,
		cooldownMs: number,
	): Promise<string | null> {
		return this.service.generate({
			currentParagraph,
			pushNoteTitle,
			pushNoteExcerpt,
			cooldownMs,
		});
	}
}
