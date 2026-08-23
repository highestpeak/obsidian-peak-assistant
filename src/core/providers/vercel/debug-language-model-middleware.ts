import {
	wrapLanguageModel,
	type LanguageModel,
	type LanguageModelMiddleware,
} from 'ai';
import type {
	LanguageModelV3Content,
	LanguageModelV3,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from '@ai-sdk/provider';
import type {
	DebugModelCallHandle,
	DebugSurface,
	DebugTracePort,
} from '@/core/debug-trace';

const MAX_STRUCTURAL_STREAM_PARTS = 200;

export interface DebugLanguageModelContext {
	debugTrace: DebugTracePort | null;
	surface: DebugSurface;
	capabilityId: string;
	runId?: string;
	operation?: 'text.generate' | 'text.stream' | 'object.generate';
}

/**
 * Observe the provider boundary without changing model routing or the stream
 * delivered to the caller. The AI SDK adapter's request.body replaces the
 * logical parameters when it is available, so Full local mode shows the
 * closest representation of the actual provider request.
 */
export function withDebugLanguageModel(
	model: LanguageModel,
	context: DebugLanguageModelContext,
): LanguageModel {
	if (!context.debugTrace?.isEnabled()) return model;
	if (typeof model === 'string') return model;
	if ((model as { specificationVersion?: string }).specificationVersion !== 'v3') return model;
	return wrapLanguageModel({
		model: model as LanguageModelV3,
		middleware: createDebugLanguageModelMiddleware(context),
	});
}

export function createDebugLanguageModelMiddleware(
	context: DebugLanguageModelContext,
): LanguageModelMiddleware {
	return {
		specificationVersion: 'v3',
		wrapGenerate: async ({ doGenerate, params, model }) => {
			const call = startCall(context, model.provider, model.modelId, 'text.generate', params);
			try {
				const result = await doGenerate();
				if (result.request?.body !== undefined) {
					call.replaceRequest(jsonPayload(result.request.body));
				}
				const extracted = extractGeneratedContent(result.content);
				call.succeed({
					response: jsonPayload({ content: result.content, response: result.response }),
					...(extracted.reasoning ? { reasoning: textPayload(extracted.reasoning) } : {}),
					finishReason: result.finishReason.unified,
					metrics: usageMetrics(result.usage),
				});
				return result;
			} catch (error) {
				call.fail(error);
				throw error;
			}
		},
		wrapStream: async ({ doStream, params, model }) => {
			const call = startCall(context, model.provider, model.modelId, 'text.stream', params);
			try {
				const result = await doStream();
				if (result.request?.body !== undefined) {
					call.replaceRequest(jsonPayload(result.request.body));
				}
				return {
					...result,
					stream: observeStream(result.stream, call, params.abortSignal),
				};
			} catch (error) {
				call.fail(error);
				throw error;
			}
		},
	};
}

function startCall(
	context: DebugLanguageModelContext,
	providerId: string,
	modelId: string,
	fallbackOperation: 'text.generate' | 'text.stream',
	params: unknown,
): DebugModelCallHandle {
	return context.debugTrace!.startModelCall({
		...(context.runId ? { runId: context.runId } : {}),
		surface: context.surface,
		capabilityId: context.capabilityId,
		operation: context.operation ?? fallbackOperation,
		providerId,
		modelId,
		request: jsonPayload(params),
	});
}

function observeStream(
	stream: ReadableStream<LanguageModelV3StreamPart>,
	call: DebugModelCallHandle,
	abortSignal?: AbortSignal,
): ReadableStream<LanguageModelV3StreamPart> {
	let text = '';
	let reasoning = '';
	let terminal = false;
	let lastSnapshotAt = 0;
	const rawParts: unknown[] = [];
	let omittedParts = 0;
	const onAbort = () => {
		if (terminal) return;
		terminal = true;
		call.cancel('Provider request aborted');
	};
	abortSignal?.addEventListener('abort', onAbort, { once: true });

	return stream.pipeThrough(new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
		transform(part, controller) {
			if (part.type === 'text-delta') text += part.delta;
			if (part.type === 'reasoning-delta') reasoning += part.delta;
			if (part.type !== 'text-delta' && part.type !== 'reasoning-delta') {
				if (rawParts.length < MAX_STRUCTURAL_STREAM_PARTS) rawParts.push(part);
				else omittedParts += 1;
			}
			if (part.type === 'error' && !terminal) {
				terminal = true;
				call.fail(part.error, streamResult(text, reasoning, rawParts, omittedParts));
			}
			if (part.type === 'finish' && !terminal) {
				terminal = true;
				call.succeed({
					...streamResult(text, reasoning, rawParts, omittedParts),
					finishReason: part.finishReason.unified,
					metrics: usageMetrics(part.usage),
				});
			}
			const now = Date.now();
			if (!terminal && now - lastSnapshotAt >= 250) {
				lastSnapshotAt = now;
				call.updateStream({
					response: textPayload(text),
					...(reasoning ? { reasoning: textPayload(reasoning) } : {}),
				});
			}
			controller.enqueue(part);
		},
		flush() {
			abortSignal?.removeEventListener('abort', onAbort);
			if (terminal) return;
			terminal = true;
			call.succeed({
				...streamResult(text, reasoning, rawParts, omittedParts),
				finishReason: 'stream-ended-without-finish',
			});
		},
	}));
}

function streamResult(
	text: string,
	reasoning: string,
	rawParts: unknown[],
	omittedParts: number,
) {
	return {
		response: jsonPayload({ text, reasoning, parts: rawParts, omittedParts }),
		...(reasoning ? { reasoning: textPayload(reasoning) } : {}),
	};
}

function extractGeneratedContent(content: LanguageModelV3Content[]): { text: string; reasoning: string } {
	let text = '';
	let reasoning = '';
	for (const part of content) {
		if (part.type === 'text') text += part.text;
		if (part.type === 'reasoning') reasoning += part.text;
	}
	return { text, reasoning };
}

function usageMetrics(usage: LanguageModelV3Usage): Record<string, number> {
	return compactNumbers({
		inputTokens: usage.inputTokens.total,
		inputTokensNoCache: usage.inputTokens.noCache,
		cachedInputTokens: usage.inputTokens.cacheRead,
		cacheWriteTokens: usage.inputTokens.cacheWrite,
		outputTokens: usage.outputTokens.total,
		textOutputTokens: usage.outputTokens.text,
		reasoningTokens: usage.outputTokens.reasoning,
	});
}

function compactNumbers(values: Record<string, number | undefined>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [key, value] of Object.entries(values)) {
		if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
	}
	return result;
}

function textPayload(raw: string) {
	return { raw, contentType: 'text/plain' } as const;
}

function jsonPayload(value: unknown) {
	return { raw: safeSerialize(value), contentType: 'application/json' } as const;
}

/** JSON serialization that refuses to copy binary and data-URL payloads. */
export function safeSerialize(value: unknown): string {
	const seen = new WeakSet<object>();
	try {
		return JSON.stringify(value, (_key, current) => {
			if (typeof current === 'string' && current.startsWith('data:')) {
				return `[data-url omitted; ${current.length} chars]`;
			}
			if (current instanceof Uint8Array) return `[binary omitted; ${current.byteLength} bytes]`;
			if (current instanceof ArrayBuffer) return `[binary omitted; ${current.byteLength} bytes]`;
			if (typeof current === 'object' && current !== null) {
				if (seen.has(current)) return '[circular]';
				seen.add(current);
			}
			return current;
		}, 2) ?? String(value);
	} catch (error) {
		return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
	}
}
