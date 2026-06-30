// T11Y-5: tier-2 LLM micro-explanation adapter.
//
// After T11Y-5 this adapter is thin: it resolves the active agent
// profile + plugin handle and runs the prompt through
// `queryWithProfile`, concatenating SDK messages into a single text
// string. Cooldown, prompt rendering, and result trimming moved to
// `AmbientExplanationService` (service layer).
//
// The 500-char truncation that historically lived here was removed;
// PushCard handles the display constraint via `line-clamp` + tooltip.

import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import {
	AmbientExplanationService,
	type AmbientExplanationLlmPort,
} from '@/service/ambient/AmbientExplanationService';
import type { AmbientExplanationPort } from '@/service/ambient/ports/AmbientPorts';

class QueryWithProfileLlmPort implements AmbientExplanationLlmPort {
	async collectText(input: {
		prompt: string;
		systemPrompt: string;
	}): Promise<string | null> {
		const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
		if (!profile) return null;

		const app = AppContext.getApp();
		const pluginId = AppContext.getPlugin().manifest.id;

		const messages = queryWithProfile(app, pluginId, profile, {
			prompt: input.prompt,
			maxTurns: 1,
			systemPrompt: input.systemPrompt,
		});

		// Mirrors the pre-refactor adapter's accumulation behavior:
		// `assistant` text blocks accumulate, and a final `result`
		// message's `.text` overrides whatever assistant chunks came
		// before it (single canonical assistant output).
		let resultText = '';
		for await (const raw of messages) {
			const msg = raw as {
				type?: string;
				message?: { content?: Array<{ type: string; text?: string }> };
				text?: string;
			};
			if (msg?.type === 'assistant' && msg.message?.content) {
				for (const block of msg.message.content) {
					if (block.type === 'text' && typeof block.text === 'string') {
						resultText += block.text;
					}
				}
			}
			if (msg?.type === 'result' && typeof msg.text === 'string') {
				resultText = msg.text;
			}
		}
		return resultText;
	}
}

export class LlmAmbientExplanationAdapter implements AmbientExplanationPort {
	private readonly service: AmbientExplanationService;

	constructor(service?: AmbientExplanationService) {
		this.service = service ?? new AmbientExplanationService(new QueryWithProfileLlmPort());
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
