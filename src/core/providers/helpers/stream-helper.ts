/**
 * Stream event utilities — extracted helpers for delta event handling and debug tracing.
 *
 * The heavy Vercel AI SDK stream transforms (streamTransform, withRetryStream, etc.)
 * were deleted as part of Provider v2. All LLM streaming now goes through Agent SDK.
 */
import { LLMStreamEvent, StreamTriggerName } from '../types';

// ---------------------------------------------------------------------------
// Debug / trace
// ---------------------------------------------------------------------------

/** Max chars per prompt for pk-debug (avoids huge console dumps). */
export const PK_DEBUG_PROMPT_TRUNCATE_CHARS = 2000;

/** Build a pk-debug event for prompt trace (system + user truncated). */
export function buildPromptTraceDebugEvent(
    triggerName: StreamTriggerName,
    system?: string,
    prompt?: string,
): LLMStreamEvent {
    return {
        type: 'pk-debug',
        debugName: 'prompt-trace',
        triggerName,
        extra: {
            prompt: prompt ?? 'undefined',
            systemLen: system?.length ?? 'undefined',
            promptLen: prompt?.length ?? 'undefined',
        },
    };
}

// ---------------------------------------------------------------------------
// Delta event utilities
// ---------------------------------------------------------------------------

export const DELTA_EVENT_TYPES = new Set(['text-delta', 'reasoning-delta', 'prompt-stream-delta', 'tool-input-delta', 'ui-step-delta']);

export function getDeltaEventDeltaText(event: LLMStreamEvent): string {
    switch (event.type) {
        case 'text-delta':
            return event.text;
        case 'reasoning-delta':
            return event.text;
        case 'prompt-stream-delta':
            return event.delta ?? '';
        case 'tool-input-delta':
            return event.delta;
        case 'ui-step-delta':
            return (event.titleDelta ?? '') + (event.descriptionDelta ?? '');
    }
    return '';
}

export function checkIfDeltaEvent(type: LLMStreamEvent['type']) {
    return DELTA_EVENT_TYPES.has(type);
}
