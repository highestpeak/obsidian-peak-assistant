/**
 * Peak Composer — production capability executor adapter (WP3, app layer).
 *
 * Implements the service-side {@link ComposerCapabilityExecutorPort} over the
 * shared AI service: prompts are rendered from their registered PromptId
 * templates and streamed through `IAgentPrompter.queryStream`, which already
 * normalizes provider output into `LLMStreamEvent`s via the shared
 * stream-helper pipeline. No Composer-only provider manager exists — this is
 * a thin projection of the one AI service the whole plugin uses.
 *
 * The prompter is resolved LAZILY per stream so composition order at plugin
 * boot does not matter (the composer runtime is composed before the AI
 * manager finishes initializing).
 */

import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import type {
	ComposerCapabilityExecutorPort,
	ComposerExecutionRequest,
	ComposerExecutorStreamEvent,
} from '@/service/composer';

export class ComposerAiExecutorAdapter implements ComposerCapabilityExecutorPort {
	constructor(private readonly resolvePrompter: () => IAgentPrompter) {}

	async *stream(request: ComposerExecutionRequest): AsyncGenerator<ComposerExecutorStreamEvent, void, unknown> {
		const prompter = this.resolvePrompter();
		const opts = {
			...(request.signal !== undefined ? { signal: request.signal } : {}),
			...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
		};
		for await (const event of prompter.queryStream(request.promptId, request.variables, opts)) {
			if (event.type === 'text-delta') {
				yield { type: 'text-delta', text: event.text };
			}
		}
		yield { type: 'complete' };
	}
}
