import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';
import type { LanguageModel } from 'ai';
import type { Profile } from '@/core/profiles/types';
import { modelRegistry } from '@/core/providers/model-registry';
import { createSimulatorLanguageModel } from '@/core/providers/simulator';

/**
 * Optional CORS-bypass fetch injected at boot by the app layer. Used for
 * providers whose public API refuses browser-origin (`app://obsidian.md`)
 * preflight requests — chiefly Anthropic. When set, we route Anthropic
 * calls through Obsidian's `requestUrl` (Node-side) instead of the browser
 * fetch that gets CORS-blocked.
 *
 * See `docs/recurring-pitfalls.md` §8 for the CORS provider matrix.
 * `core/` must not import `obsidian`, so the app layer registers this
 * via `setProviderCorsBypassFetch(...)` during plugin boot.
 */
type CorsBypassFetch = typeof fetch;
let corsBypassFetch: CorsBypassFetch | null = null;

export function setProviderCorsBypassFetch(fetchImpl: CorsBypassFetch | null): void {
    corsBypassFetch = fetchImpl;
}

/**
 * Create a Vercel AI SDK LanguageModel from a Profile + modelId.
 * Throws if provider is unsupported.
 */
export function createLanguageModel(profile: Profile, modelId: string): LanguageModel {
    const { kind, baseUrl, apiKey } = profile;
    const resolvedModelId = modelRegistry.resolveApiModelId(kind, modelId);

    switch (kind) {
        case 'anthropic': {
            // Anthropic's public API rejects `app://obsidian.md` origins at
            // the CORS preflight — the browser-access opt-in header alone
            // doesn't help because preflight fails before that header ever
            // gets sent. Route through Obsidian's `requestUrl` (Node-side
            // transport) via the injected bypass fetch to sidestep CORS
            // entirely. See docs/recurring-pitfalls.md §8.
            //
            // Legacy profiles (created before 2026-07-08) saved
            // `https://api.anthropic.com` without `/v1`. The AI SDK appends
            // `/messages` verbatim → `/messages` (404). Normalise here so
            // those existing profiles keep working after the fix.
            let anthropicBase = baseUrl || undefined;
            if (anthropicBase && /^https?:\/\/api\.anthropic\.com\/?$/i.test(anthropicBase)) {
                anthropicBase = 'https://api.anthropic.com/v1';
            }
            const provider = createAnthropic({
                baseURL: anthropicBase,
                apiKey: apiKey ?? undefined,
                headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
                fetch: corsBypassFetch ?? undefined,
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
        case 'simulator':
            return createSimulatorLanguageModel(profile, resolvedModelId);
        default:
            throw new Error(`Unsupported provider kind: ${kind}`);
    }
}
