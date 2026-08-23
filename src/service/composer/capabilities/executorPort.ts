/**
 * Peak Composer — capability executor port (WP3).
 *
 * The narrow streaming boundary between the run coordinator and whatever
 * physically executes a model-backed capability. The app layer implements it
 * over the shared AI service (`IAgentPrompter.queryStream` normalized through
 * stream-helper's `LLMStreamEvent`s); tests implement a deterministic fake.
 * Service code NEVER talks to a provider adapter directly, and the UI never
 * sees this port at all.
 */

import type { ComposerCapabilityId } from '@/core/composer';

export interface ComposerExecutionRequest {
	capabilityId: ComposerCapabilityId;
	/** Template-registered PromptId (never inline prompt text). */
	promptId: string;
	/** Variables produced by the definition's buildPromptVariables(). */
	variables: Record<string, unknown>;
	/** Optional exact per-run route override from the Copilot composer. */
	profileId?: string;
	modelId?: string;
	signal?: AbortSignal;
}

export type ComposerExecutorStreamEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete' };

export interface ComposerCapabilityExecutorPort {
	stream(request: ComposerExecutionRequest): AsyncGenerator<ComposerExecutorStreamEvent, void, unknown>;
}
