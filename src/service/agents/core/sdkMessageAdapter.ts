/**
 * Shared SDK Message Adapter — translates Claude Agent SDK messages into the
 * plugin's LLMStreamEvent shape and provides helpers for single-turn collect
 * patterns (Pattern B / C).
 *
 * Re-exports the core per-message translator from vault-sdk so all agents can
 * import from a single location without taking a transitive dependency on
 * vault-sdk internals.
 *
 * Exports:
 *   - translateSdkMessage  — per-message translation (from vault-sdk)
 *   - translateSdkMessages — async generator over an SDK message stream
 *   - collectText          — drain stream, return concatenated text
 *   - collectJson<T>       — drain stream, parse JSON from text
 *
 * Provider v2 Task 3.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import type { SDKMessage } from './sdkAgentPool';
import {
    translateSdkMessage,
    type TranslateOpts,
} from '../vault-sdk/sdkMessageAdapter';

// Re-export for callers who only need the single-message translator.
export { translateSdkMessage };
export type { TranslateOpts };

// ─── translateSdkMessages ────────────────────────────────────────────────────

/**
 * Translate an async iterable of raw SDK messages into LLMStreamEvents.
 *
 * Usage:
 * ```ts
 * for await (const ev of translateSdkMessages(messages, { triggerName })) {
 *     yield ev;
 * }
 * ```
 */
export async function* translateSdkMessages(
    messages: AsyncIterable<SDKMessage>,
    options?: Partial<TranslateOpts>,
): AsyncGenerator<LLMStreamEvent> {
    const opts: TranslateOpts = {
        triggerName: options?.triggerName as TranslateOpts['triggerName'],
        taskIndex: options?.taskIndex,
        hasPartialMessages: options?.hasPartialMessages,
    };

    for await (const raw of messages) {
        const events = translateSdkMessage(raw, opts);
        for (const ev of events) {
            yield ev;
        }
    }
}

// ─── collectText ─────────────────────────────────────────────────────────────

/**
 * Drain an SDK message stream and return all text content concatenated.
 *
 * Handles both:
 *   - Partial streaming: `stream_event` → `content_block_delta` → `text_delta`
 *   - Full messages: `assistant` message blocks with `type: 'text'`
 *
 * Pattern B: single-turn calls where you only need the final text string.
 */
export async function collectText(
    messages: AsyncIterable<SDKMessage>,
): Promise<string> {
    let text = '';

    for await (const raw of messages) {
        const msg = raw as { type?: string; message?: { content?: Array<{ type: string; text?: string }> }; event?: any };

        if (msg.type === 'stream_event') {
            const event = msg.event;
            if (
                event?.type === 'content_block_delta' &&
                event?.delta?.type === 'text_delta' &&
                typeof event?.delta?.text === 'string'
            ) {
                text += event.delta.text;
            }
        } else if (msg.type === 'assistant') {
            // Only collect text blocks if no streaming events were seen
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    // stream_event accumulation takes precedence; skip duplicates
                    // by only using this path if we haven't accumulated any text yet
                    if (text.length === 0) {
                        text += block.text;
                    }
                }
            }
        }
    }

    return text;
}

// ─── collectJson ─────────────────────────────────────────────────────────────

/**
 * Drain an SDK message stream and parse the collected text as JSON.
 *
 * Pattern C: single-turn structured output calls where the LLM returns a JSON
 * object. Strips markdown code fences (```json ... ```) if present.
 */
export async function collectJson<T>(
    messages: AsyncIterable<SDKMessage>,
): Promise<T> {
    const raw = await collectText(messages);

    // Strip optional markdown code fences
    const stripped = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

    return JSON.parse(stripped) as T;
}
