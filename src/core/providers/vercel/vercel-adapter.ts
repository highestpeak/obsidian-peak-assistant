/**
 * Vercel AI SDK Adapter
 *
 * Converts LLMRequestMessage[] → Vercel AI SDK format and translates
 * stream events back to LLMStreamEvent. Simplified from the original
 * ai-sdk-adapter.ts deleted in commit 9f293a4.
 */

import { streamText, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import type {
    LLMRequestMessage,
    LLMStreamEvent,
    LLMOutputControlSettings,
    MessagePart,
    ToolResultOutput,
} from '../types';

// ─── Message conversion ────────────────────────────────────────

function mapContentPart(part: MessagePart): Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string }
    | { type: 'file'; url: string; mediaType: string; filename?: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
> {
    switch (part.type) {
        case 'text':
            return [{ type: 'text', text: part.text }];
        case 'image': {
            let imageUrl: string;
            if (typeof part.data === 'string') {
                imageUrl = part.data;
            } else {
                const base64 = Buffer.from(part.data as any).toString('base64');
                imageUrl = `data:${part.mediaType};base64,${base64}`;
            }
            return [{ type: 'image', image: imageUrl }];
        }
        case 'file': {
            let fileUrl: string;
            if (typeof part.data === 'string') {
                fileUrl = part.data;
            } else {
                const base64 = Buffer.from(part.data as any).toString('base64');
                fileUrl = `data:${part.mediaType};base64,${base64}`;
            }
            return [{ type: 'file', url: fileUrl, mediaType: part.mediaType, filename: part.filename }];
        }
        case 'reasoning':
            return [{ type: 'reasoning', text: part.text }];
        case 'tool-call':
            return [{
                type: 'tool-call',
                toolCallId: part.toolCallId ?? `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                toolName: part.toolName,
                input: part.input,
            }];
        case 'tool-result':
            // Fallback to text for compatibility (ollama-ai-provider-v2 doesn't support tool-result)
            return [{
                type: 'text',
                text: JSON.stringify({
                    type: 'tool-result',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    output: part.output,
                }),
            }];
        default:
            return [{ type: 'text', text: '' }];
    }
}

function extractSystemMessage(messages: LLMRequestMessage[]): string | undefined {
    const parts: string[] = [];
    for (const msg of messages) {
        if (msg.role !== 'system') continue;
        for (const part of msg.content) {
            if (part.type === 'text') parts.push(part.text);
        }
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function toAiSdkMessages(messages: LLMRequestMessage[]): ModelMessage[] {
    const out: ModelMessage[] = [];
    for (const msg of messages) {
        if (msg.role === 'system') continue;
        const contentParts = msg.content.flatMap(mapContentPart);
        if (contentParts.length === 0) contentParts.push({ type: 'text', text: '' });
        out.push({ role: msg.role, content: contentParts } as ModelMessage);
    }
    return out;
}

// ─── Stream translation ────────────────────────────────────────

/**
 * Stall-protected streaming: aborts the request when no data chunk arrives
 * within `timeoutStepMs` (default 30 s) or total time exceeds `timeoutTotalMs`
 * (default 5 min). This guards against providers that keep the connection
 * alive with SSE comments (e.g. OpenRouter's `: OPENROUTER PROCESSING`)
 * but never deliver real data.
 */
export async function* streamChat(
    model: LanguageModel,
    messages: LLMRequestMessage[],
    options?: {
        outputControl?: LLMOutputControlSettings;
        tools?: ToolSet;
        maxSteps?: number;
        abortSignal?: AbortSignal;
    },
): AsyncGenerator<LLMStreamEvent> {
    const startTime = Date.now();
    const stallMs = options?.outputControl?.timeoutStepMs ?? 30_000;
    const totalMs = options?.outputControl?.timeoutTotalMs ?? 300_000;

    // Combine external abort signal + stall/total timeouts into one controller
    const timeoutController = new AbortController();
    let timeoutReason: string | null = null;
    const externalSignal = options?.abortSignal;

    if (externalSignal?.aborted) return;
    const onExternalAbort = () => timeoutController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    // Stall timer — resets on each data chunk
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStall = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } };
    const resetStallTimer = () => {
        clearStall();
        stallTimer = setTimeout(() => {
            timeoutReason = `No response data received for ${stallMs / 1000}s. The provider may be queuing or overloaded — try again or switch models.`;
            timeoutController.abort();
        }, stallMs);
    };

    // Total timeout
    const totalTimer = setTimeout(() => {
        timeoutReason = `Request timed out after ${Math.round(totalMs / 1000)}s.`;
        timeoutController.abort();
    }, totalMs);

    const cleanup = () => {
        clearStall();
        clearTimeout(totalTimer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    };

    try {
        resetStallTimer();

        const result = streamText({
            model,
            system: extractSystemMessage(messages),
            prompt: toAiSdkMessages(messages),
            tools: options?.tools,
            maxSteps: options?.maxSteps ?? (options?.tools ? 5 : 1),
            maxOutputTokens: options?.outputControl?.maxOutputTokens,
            temperature: options?.outputControl?.temperature,
            topP: options?.outputControl?.topP,
            topK: options?.outputControl?.topK,
            frequencyPenalty: options?.outputControl?.frequencyPenalty,
            presencePenalty: options?.outputControl?.presencePenalty,
            abortSignal: timeoutController.signal,
        });

        for await (const chunk of result.fullStream) {
            resetStallTimer();
            switch (chunk.type) {
                case 'text-delta':
                    yield { type: 'text-delta', text: chunk.text };
                    break;
                case 'reasoning-delta':
                    yield { type: 'reasoning-delta', text: chunk.text };
                    break;
                case 'source':
                    yield chunk as any;
                    break;
                case 'tool-call':
                    yield { type: 'tool-call', toolName: chunk.toolName, input: chunk.input };
                    break;
                case 'tool-input-start':
                    yield { type: 'tool-input-start', toolName: chunk.toolName };
                    break;
                case 'tool-input-delta':
                    yield { type: 'tool-input-delta', delta: chunk.delta };
                    break;
                case 'tool-result':
                    yield { type: 'tool-result', toolName: chunk.toolName, input: chunk.input, output: chunk.output };
                    break;
                case 'finish-step':
                    yield { type: 'on-step-finish', text: '', finishReason: chunk.finishReason, usage: chunk.usage };
                    break;
                case 'finish':
                    yield { type: 'complete', usage: chunk.totalUsage, finishReason: chunk.finishReason, durationMs: Date.now() - startTime };
                    break;
                case 'error':
                    console.error('[vercel-adapter] Stream error:', chunk.error);
                    yield { type: 'error', error: chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error)) };
                    break;
                default:
                    yield { type: 'unSupported', chunk };
                    break;
            }
        }

    } catch (error) {
        if (timeoutReason) {
            console.warn('[vercel-adapter] Stream timeout:', timeoutReason);
            yield { type: 'error', error: new Error(timeoutReason), durationMs: Date.now() - startTime };
        } else if (externalSignal?.aborted) {
            // User cancelled — silently end the generator
        } else {
            console.error('[vercel-adapter] Stream exception:', error);
            yield { type: 'error', error: error as Error, durationMs: Date.now() - startTime };
        }
    } finally {
        cleanup();
    }
}
