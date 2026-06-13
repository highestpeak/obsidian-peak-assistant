// T8: tier-2 LLM micro-explanation adapter. Wraps `queryWithProfile`
// + `ProfileRegistry` so the service runtime never touches the
// provider graph. The in-adapter `lastLlmCallTs` mirrors the old
// module-level rate limiter; it is scoped to the adapter instance so
// hot-reload does not retain a stale closure.

import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import type { AmbientExplanationPort } from '@/service/ambient/ports/AmbientPorts';

export class LlmAmbientExplanationAdapter implements AmbientExplanationPort {
	private lastLlmCallTs = 0;

	async generateLlmExplanation(
		currentParagraph: string,
		pushNoteTitle: string,
		pushNoteExcerpt: string,
		cooldownMs: number,
	): Promise<string | null> {
		const now = Date.now();
		if (now - this.lastLlmCallTs < cooldownMs) return null;
		this.lastLlmCallTs = now;

		const registry = ProfileRegistry.getInstance();
		const profile = registry.getActiveAgentProfile();
		if (!profile) return null;

		const prompt = [
			`Given the user is writing about: "${currentParagraph.slice(0, 300)}"`,
			`And this note exists: "${pushNoteTitle}" with excerpt: "${pushNoteExcerpt.slice(0, 200)}"`,
			`In one sentence (max 20 words), explain how this note could contribute to the current writing.`,
			`Reply with ONLY the explanation sentence, no preamble.`,
		].join('\n');

		try {
			const app = AppContext.getApp();
			const pluginId = AppContext.getPlugin().manifest.id;

			let resultText = '';
			const messages = queryWithProfile(app, pluginId, profile, {
				prompt,
				maxTurns: 1,
				systemPrompt: 'You are a concise research assistant. Output only the requested sentence.',
			});

			for await (const msg of messages) {
				if (msg?.type === 'assistant' && msg?.message?.content) {
					for (const block of msg.message.content) {
						if (block.type === 'text') {
							resultText += block.text;
						}
					}
				}
				if (msg?.type === 'result' && msg?.text) {
					resultText = msg.text;
				}
			}

			const trimmed = resultText.trim();
			if (trimmed.length > 0 && trimmed.length <= 500) return trimmed;
			return trimmed.slice(0, 500) || null;
		} catch (err) {
			console.debug('[LlmAmbientExplanationAdapter] LLM explanation failed (non-critical):', err);
			return null;
		}
	}
}
