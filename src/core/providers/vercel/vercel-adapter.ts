/**
 * Vercel AI SDK Adapter
 *
 * Converts LLMRequestMessage[] → Vercel AI SDK format and translates
 * stream events back to LLMStreamEvent. Simplified from the original
 * ai-sdk-adapter.ts deleted in commit 9f293a4.
 */

import { streamText, type LanguageModel, type ModelMessage } from 'ai';
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

export async function* streamChat(
    model: LanguageModel,
    messages: LLMRequestMessage[],
    options?: {
        outputControl?: LLMOutputControlSettings;
        abortSignal?: AbortSignal;
    },
): AsyncGenerator<LLMStreamEvent> {
    const startTime = Date.now();

    try {
        const result = streamText({
            model,
            system: extractSystemMessage(messages),
            prompt: toAiSdkMessages(messages),
            maxOutputTokens: options?.outputControl?.maxOutputTokens,
            temperature: options?.outputControl?.temperature,
            topP: options?.outputControl?.topP,
            topK: options?.outputControl?.topK,
            frequencyPenalty: options?.outputControl?.frequencyPenalty,
            presencePenalty: options?.outputControl?.presencePenalty,
            abortSignal: options?.abortSignal,
        });

        for await (const chunk of result.fullStream) {
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

        const finalUsage = await result.usage;
        yield { type: 'complete', usage: finalUsage, finishReason: 'stop', durationMs: Date.now() - startTime };
    } catch (error) {
        console.error('[vercel-adapter] Stream exception:', error);
        yield { type: 'error', error: error as Error, durationMs: Date.now() - startTime };
    }
}
