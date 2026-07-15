import type { Profile } from '@/core/profiles/types';
import type { LLMRequestMessage, LLMStreamEvent, LLMOutputControlSettings, LLMUsage } from '@/core/providers/types';
import type { ToolSet } from 'ai';
import { createLanguageModel } from './provider-factory';
import { streamChat as adapterStreamChat } from './vercel-adapter';

export interface VercelChatRequest {
    messages: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
    tools?: ToolSet;
    maxSteps?: number;
    abortSignal?: AbortSignal;
}

/**
 * Stream a chat completion via Vercel AI SDK.
 * Works with any provider supported by the profile's kind.
 */
export async function* vercelStreamChat(
    profile: Profile,
    modelId: string,
    request: VercelChatRequest,
): AsyncGenerator<LLMStreamEvent> {
    const model = createLanguageModel(profile, modelId);
    yield* adapterStreamChat(model, request.messages, {
        outputControl: request.outputControl,
        tools: request.tools,
        maxSteps: request.maxSteps,
        abortSignal: request.abortSignal,
    });
}

/**
 * Blocking text completion via Vercel AI SDK.
 */
export async function vercelGenerateText(
    profile: Profile,
    modelId: string,
    messages: LLMRequestMessage[],
    outputControl?: LLMOutputControlSettings,
    abortSignal?: AbortSignal,
): Promise<{ text: string; usage?: LLMUsage }> {
    let text = '';
    let usage: LLMUsage | undefined;
    let streamError: Error | null = null;
    for await (const event of vercelStreamChat(profile, modelId, { messages, outputControl, abortSignal })) {
        if (event.type === 'text-delta') text += event.text;
        else if (event.type === 'complete') usage = event.usage;
        else if (event.type === 'error') {
            // Provider errors (Anthropic 404, OpenAI 401, etc.) arrive as
            // `error` events, not thrown — swallowing them makes every
            // caller see `{ text: '', usage: undefined }` and report a
            // useless "empty response" downstream. Rethrow after the loop
            // so the caller's `try/catch` gets the real error, complete
            // with statusCode / responseBody / cause metadata.
            streamError = event.error;
        }
    }
    if (streamError) throw streamError;
    return { text, usage };
}
