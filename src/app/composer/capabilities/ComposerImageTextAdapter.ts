/**
 * Peak Composer — image text port adapter (WP7 integration, app layer).
 *
 * Bridges the image pack's {@link ComposerImageTextPort} (the caption +
 * smart-layout text flows the {@link ImageCapabilityCoordinator} drives through
 * a text boundary, NOT the WP3 model-stream candidate rail) to the shared
 * capability executor. Each kind maps to a template-registered PromptId (never
 * inline prompt text); the executor's streamed deltas are accumulated into the
 * full completion the coordinator's `runText` awaits.
 *
 * Kept separate from the media edit port (which returns image bytes) — this one
 * returns text (a caption sentence, or a layout-spec JSON string the coordinator
 * validates + renders deterministically).
 */

import { PromptId } from '@/core/types/prompt';
import type {
	ComposerCapabilityExecutorPort,
	ComposerImageTextPort,
	ComposerImageTextRequest,
} from '@/service/composer';
import { IMAGE_CAPABILITY_IDS } from '@/service/composer';
import type { ComposerCapabilityId } from '@/core/composer';

/** Map the text-flow kind to its capability id + PromptId + prompt variables. */
function resolvePrompt(request: ComposerImageTextRequest): {
	capabilityId: ComposerCapabilityId;
	promptId: PromptId;
	variables: Record<string, unknown>;
} {
	if (request.kind === 'caption') {
		return {
			capabilityId: IMAGE_CAPABILITY_IDS.caption as ComposerCapabilityId,
			promptId: PromptId.ComposerImageCaption,
			variables: {
				context: request.context,
				...(request.instruction.trim() ? { instruction: request.instruction } : {}),
			},
		};
	}
	return {
		capabilityId: IMAGE_CAPABILITY_IDS.layout as ComposerCapabilityId,
		promptId: PromptId.ComposerImageLayout,
		variables: {
			items: request.context,
			...(request.instruction.trim() ? { instruction: request.instruction } : {}),
		},
	};
}

/** Compose the image caption/layout text port over the shared capability executor. */
export function createComposerImageTextAdapter(
	executor: ComposerCapabilityExecutorPort,
): ComposerImageTextPort {
	return {
		async complete(request: ComposerImageTextRequest): Promise<string> {
			const { capabilityId, promptId, variables } = resolvePrompt(request);
			let text = '';
			for await (const ev of executor.stream({
				capabilityId,
				promptId,
				variables,
				...(request.signal ? { signal: request.signal } : {}),
			})) {
				if (ev.type === 'text-delta') text += ev.text;
			}
			return text.trim();
		},
	};
}
