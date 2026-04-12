/**
 * Translates Claude Agent SDK SDKMessage events into the plugin's existing
 * LLMStreamEvent shape so the UI stack (Zustand stores, StepList, event bus)
 * consumes them without modification.
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

import type { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';

export interface TranslateOpts {
	triggerName: StreamTriggerName;
	taskIndex?: number;
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

/**
 * Pure function. Given one SDK message, return zero or more plugin stream events.
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
				if (block.type === 'text' && typeof block.text === 'string') {
					out.push({
						type: 'text-delta',
						text: block.text,
						triggerName,
					} as LLMStreamEvent);
				} else if (block.type === 'thinking' && typeof block.thinking === 'string') {
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
				},
				result: msg.result,
				triggerName,
			} as LLMStreamEvent);
			break;

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
