import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';
import type { LanguageModel } from 'ai';
import type { Profile } from '@/core/profiles/types';
import { modelRegistry } from '@/core/providers/model-registry';

/**
 * Create a Vercel AI SDK LanguageModel from a Profile + modelId.
 * Throws if provider is unsupported.
 */
export function createLanguageModel(profile: Profile, modelId: string): LanguageModel {
    const { kind, baseUrl, apiKey } = profile;
    const resolvedModelId = modelRegistry.resolveApiModelId(kind, modelId);

    switch (kind) {
        case 'anthropic': {
            const provider = createAnthropic({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(resolvedModelId);
        }
        case 'openai': {
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(resolvedModelId);
        }
        case 'google': {
            const provider = createGoogleGenerativeAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(resolvedModelId);
        }
        case 'perplexity': {
            const provider = createPerplexity({
                apiKey: apiKey ?? undefined,
            });
            return provider(resolvedModelId);
        }
        case 'openrouter': {
            // Fix legacy profiles that saved baseUrl without /v1
            let orBaseUrl = baseUrl || undefined;
            if (orBaseUrl && orBaseUrl.endsWith('/api')) {
                orBaseUrl = orBaseUrl + '/v1';
            }
            const provider = createOpenRouter({
                baseURL: orBaseUrl,
                apiKey: apiKey ?? undefined,
                // Referer + title improve OpenRouter routing priority
                headers: {
                    'HTTP-Referer': 'https://github.com/user/obsidian-peak-assistant',
                    'X-Title': 'Peak Assistant',
                },
            });
            return provider(resolvedModelId);
        }
        case 'ollama': {
            const provider = createOllama({ baseURL: baseUrl || undefined });
            return provider(resolvedModelId);
        }
        case 'litellm':
        case 'custom': {
            // LiteLLM and custom use OpenAI-compatible API
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(resolvedModelId);
        }
        default:
            throw new Error(`Unsupported provider kind: ${kind}`);
    }
}
