import type { Profile } from '@/core/profiles/types';
import type { LLMRequestMessage, LLMStreamEvent, LLMOutputControlSettings, LLMUsage } from '@/core/providers/types';
import { createLanguageModel } from './provider-factory';
import { streamChat as adapterStreamChat } from './vercel-adapter';

export interface VercelChatRequest {
    messages: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
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
): Promise<{ text: string; usage?: LLMUsage }> {
    let text = '';
    let usage: LLMUsage | undefined;
    for await (const event of vercelStreamChat(profile, modelId, { messages, outputControl })) {
        if (event.type === 'text-delta') text += event.text;
        else if (event.type === 'complete') usage = event.usage;
    }
    return { text, usage };
}
