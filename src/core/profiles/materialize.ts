/** Provider-neutral profile materialization helpers. */

import type { Profile } from './types';

export type EmbeddingTransport = 'openai-compatible' | 'ollama' | 'gemini';

/**
 * A frozen embedding route for one run. It deliberately carries no mutable
 * ProfileRegistry state: Scan must use the model the owner selected, even if
 * the global default changes while the run is in progress.
 */
export interface EmbeddingCallConfig {
	endpoint: string;
	apiKey: string;
	model: string;
	provider: string;
	transport: EmbeddingTransport;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function openAiCompatibleEndpoint(value: string, provider: Profile['kind']): string {
	const endpoint = trimTrailingSlash(value);
	if (provider === 'perplexity' && !/\/v\d+(?:beta)?$/i.test(endpoint)) return `${endpoint}/v1`;
	return endpoint;
}

/**
 * Extract embedding config from a Profile. Returns null if the profile
 * has no embedding endpoint or model configured.
 */
export function toEmbeddingConfig(
	profile: Profile,
	modelOverride?: string,
): EmbeddingCallConfig | null {
	const model = modelOverride ?? profile.embeddingModel;
	if (!model) return null;
	const apiKey = profile.embeddingApiKey ?? profile.apiKey ?? '';
	const endpoint = profile.embeddingEndpoint ?? profile.baseUrl;
	if (!endpoint) return null;

	if (profile.kind === 'ollama') {
		return { endpoint: trimTrailingSlash(endpoint), apiKey, model, provider: profile.kind, transport: 'ollama' };
	}
	if (profile.kind === 'google') {
		if (!apiKey) return null;
		return { endpoint: trimTrailingSlash(endpoint), apiKey, model, provider: profile.kind, transport: 'gemini' };
	}
	if (['openai', 'openrouter', 'perplexity', 'lmstudio', 'litellm', 'custom'].includes(profile.kind)) {
		if (!apiKey && !['lmstudio', 'litellm', 'custom'].includes(profile.kind)) return null;
		return {
			endpoint: openAiCompatibleEndpoint(endpoint, profile.kind),
			apiKey,
			model,
			provider: profile.kind,
			transport: 'openai-compatible',
		};
	}
	return null;
}
