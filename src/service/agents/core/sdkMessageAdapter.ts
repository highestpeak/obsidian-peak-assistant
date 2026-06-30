/**
 * Shared SDK Message Adapter — translates Claude Agent SDK messages into the
 * plugin's LLMStreamEvent shape and provides helpers for single-turn collect
 * patterns (Pattern B / C).
 *
 * Consolidates the per-message translator with higher-level stream helpers.
 *
 * Exports:
 *   - translateSdkMessage  — per-message translation
 *   - translateSdkMessages — async generator over an SDK message stream
 *   - collectText          — drain stream, return concatenated text
 *   - collectJson<T>       — drain stream, parse JSON from text
 */

import type { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import type { SDKMessage } from './sdkAgentPool';
import { throwTypedError, LLMResponseError } from '@/core/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TranslateOpts {
	triggerName: StreamTriggerName;
	taskIndex?: number;
	/** When true, text/thinking from 'assistant' messages are skipped (already streamed via stream_event) */
	hasPartialMessages?: boolean;
}

interface AnyContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: unknown;
}

interface AnySdkMessage {
	type: string;
	subtype?: string;
	session_id?: string;
	model?: string;
	message?: { content?: AnyContentBlock[] };
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
	result?: unknown;
	is_error?: boolean;
}

// ─── translateSdkMessage ────────────────────────────────────────────────────

/**
 * Pure function. Given one SDK message, return zero or more plugin stream events.
 *
 * SDK message shapes (verified from Task 2 spike run):
 *   { type: 'system', subtype: 'init', session_id, cwd, tools, model }
 *   { type: 'assistant', message: { content: ContentBlock[] }, session_id, uuid }
 *   { type: 'user', message: { content: ContentBlock[] }, session_id, uuid }
 *   { type: 'result', subtype, session_id, usage, result, is_error, duration_ms }
 *
 * ContentBlock shapes:
 *   { type: 'text', text: string }
 *   { type: 'thinking', thinking: string }
 *   { type: 'tool_use', id, name, input }
 *   { type: 'tool_result', tool_use_id, content }
 */
export function translateSdkMessage(
	raw: unknown,
	opts: TranslateOpts
): LLMStreamEvent[] {
	const msg = raw as AnySdkMessage;
	const out: LLMStreamEvent[] = [];
	const { triggerName, taskIndex } = opts;

	switch (msg.type) {
		case 'system':
			if (msg.subtype === 'init') {
				out.push({
					type: 'pk-debug',
					debugName: 'sdk-round-input',
					triggerName,
					extra: {
						sessionId: msg.session_id,
						model: msg.model,
						taskIndex,
					},
				} as LLMStreamEvent);
			} else {
				out.push({
					type: 'pk-debug',
					debugName: `sdk-system-${msg.subtype ?? 'unknown'}`,
					triggerName,
					extra: { raw: msg, taskIndex },
				} as LLMStreamEvent);
			}
			break;

		case 'assistant': {
			const blocks = msg.message?.content ?? [];
			for (const block of blocks) {
				if (!opts.hasPartialMessages && block.type === 'text' && typeof block.text === 'string') {
					out.push({
						type: 'text-delta',
						text: block.text,
						triggerName,
					} as LLMStreamEvent);
				} else if (!opts.hasPartialMessages && block.type === 'thinking' && typeof block.thinking === 'string') {
					out.push({
						type: 'reasoning-delta',
						text: block.thinking,
						triggerName,
					} as LLMStreamEvent);
				} else if (block.type === 'tool_use') {
					out.push({
						type: 'tool-call',
						id: block.id ?? '',
						toolName: block.name ?? 'unknown',
						input: block.input ?? {},
						triggerName,
					} as LLMStreamEvent);
				}
			}
			break;
		}

		case 'user': {
			const blocks = msg.message?.content ?? [];
			for (const block of blocks) {
				if (block.type === 'tool_result') {
					out.push({
						type: 'tool-result',
						id: block.tool_use_id ?? '',
						toolName: 'unknown', // SDK doesn't carry tool name on result side
						input: {},
						output: block.content ?? null,
						triggerName,
					} as LLMStreamEvent);
				}
			}
			break;
		}

		case 'result':
			out.push({
				type: 'complete',
				finishReason: msg.is_error ? 'error' : 'stop',
				usage: {
					inputTokens: msg.usage?.input_tokens ?? 0,
					outputTokens: msg.usage?.output_tokens ?? 0,
					totalTokens:
						(msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
					cachedInputTokens: msg.usage?.cache_read_input_tokens ?? 0,
				},
				result: msg.result,
				triggerName,
			} as LLMStreamEvent);
			break;

		// Per-token streaming events (enabled by includePartialMessages: true)
		case 'stream_event': {
			const event = (msg as any).event;
			if (!event) break;
			if (event.type === 'content_block_delta') {
				const delta = event.delta;
				if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
					out.push({
						type: 'text-delta',
						text: delta.text,
						triggerName,
					} as LLMStreamEvent);
				} else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
					out.push({
						type: 'reasoning-delta',
						text: delta.thinking,
						triggerName,
					} as LLMStreamEvent);
				}
				// input_json_delta for tool_use — ignored, we get full tool_use from 'assistant' message
			}
			// message_start, content_block_start/stop, message_delta, message_stop — ignored
			break;
		}

		default:
			out.push({
				type: 'pk-debug',
				debugName: 'sdk-unknown',
				triggerName,
				extra: { raw: msg, taskIndex },
			} as LLMStreamEvent);
			break;
	}

	return out;
}

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
    let errorResult: string | null = null;

    for await (const raw of messages) {
        const msg = raw as { type?: string; is_error?: boolean; result?: string; message?: { content?: Array<{ type: string; text?: string }> }; event?: any };

        if (msg.type === 'result' && msg.is_error) {
            errorResult = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
            continue;
        }

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
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    if (text.length === 0) {
                        text += block.text;
                    }
                }
            }
        }
    }

    if (errorResult) {
        throwTypedError(errorResult, text || undefined);
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

    const stripped = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

    if (!stripped) {
        throw new LLMResponseError('Model returned empty response where JSON was expected.');
    }

    try {
        return JSON.parse(stripped) as T;
    } catch (parseError) {
        const firstChar = stripped[0];
        if (firstChar !== '{' && firstChar !== '[' && /^[A-Za-z"']/.test(stripped)) {
            throw new LLMResponseError(
                `Model returned text instead of JSON: "${stripped.slice(0, 120)}..."`,
                stripped,
            );
        }
        throw new LLMResponseError(
            `Failed to parse model response as JSON: ${(parseError as Error).message}`,
            stripped,
        );
    }
}
