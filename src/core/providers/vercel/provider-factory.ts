import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ollama } from 'ollama-ai-provider-v2';
import type { LanguageModel } from 'ai';
import type { Profile } from '@/core/profiles/types';

/**
 * Create a Vercel AI SDK LanguageModel from a Profile + modelId.
 * Throws if provider is unsupported.
 */
export function createLanguageModel(profile: Profile, modelId: string): LanguageModel {
    const { kind, baseUrl, apiKey } = profile;

    switch (kind) {
        case 'anthropic': {
            const provider = createAnthropic({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'openai': {
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'google': {
            const provider = createGoogleGenerativeAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'perplexity': {
            const provider = createPerplexity({
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'openrouter': {
            const provider = createOpenRouter({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'ollama': {
            return ollama(modelId);
        }
        case 'litellm':
        case 'custom': {
            // LiteLLM and custom use OpenAI-compatible API
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        default:
            throw new Error(`Unsupported provider kind: ${kind}`);
    }
}
