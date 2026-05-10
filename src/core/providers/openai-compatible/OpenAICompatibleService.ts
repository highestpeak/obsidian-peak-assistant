/**
 * OpenAI-compatible endpoint service: model discovery + connection testing.
 *
 * Uses GET {baseUrl}/models to auto-discover available models, then enriches
 * them with capability data from known model families in ModelRegistry.
 */

import type { OpenAICompatibleEndpoint } from '@/core/profiles/types';
import type { ModelMetaData, ModelCapabilities } from '@/core/providers/types';
import { ModelType } from '@/core/providers/types';
import { modelRegistry } from '@/core/providers/model-registry';

/**
 * Discover models from an OpenAI-compatible endpoint.
 * Calls GET {baseUrl}/models and maps the response to ModelMetaData[].
 */
export async function discoverModels(
	endpoint: Pick<OpenAICompatibleEndpoint, 'baseUrl' | 'apiKey' | 'modelConfigs'>,
): Promise<ModelMetaData[]> {
	const url = `${endpoint.baseUrl.replace(/\/+$/, '')}/models`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (endpoint.apiKey) headers['Authorization'] = `Bearer ${endpoint.apiKey}`;

	const response = await fetch(url, { headers });
	if (!response.ok) {
		throw new Error(`Model discovery failed: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	const models = (data.data ?? data) as Array<{ id: string; owned_by?: string }>;

	return models.map((m) => {
		const override = endpoint.modelConfigs?.[m.id];

		// Try to match against known model families for capability detection
		const knownCaps = tryResolveKnownCapabilities(m.id);
		const knownLimits = tryResolveKnownTokenLimits(m.id);

		return {
			id: m.id,
			displayName: override?.displayName ?? m.id,
			icon: override?.icon,
			modelType: ModelType.LLM,
			capabilities: {
				vision: false,
				pdfInput: false,
				tools: false,
				webSearch: false,
				...knownCaps,
				...override?.capabilitiesOverride,
			} as ModelCapabilities,
			tokenLimits: override?.tokenLimitsOverride ?? knownLimits ?? {
				maxTokens: 4096,
				maxInputTokens: 4096,
				maxOutputTokens: 2048,
			},
		};
	});
}

/**
 * Test connection to an OpenAI-compatible endpoint.
 * Returns model count on success, throws on failure.
 */
export async function testConnection(
	endpoint: Pick<OpenAICompatibleEndpoint, 'baseUrl' | 'apiKey'>,
): Promise<{ modelCount: number }> {
	const models = await discoverModels(endpoint);
	return { modelCount: models.length };
}

/**
 * Try to resolve capabilities from known providers by model name matching.
 */
function tryResolveKnownCapabilities(modelId: string): Partial<ModelCapabilities> | undefined {
	const providers = ['openai', 'claude', 'gemini', 'ollama'];
	for (const provider of providers) {
		const caps = modelRegistry.getModelCapabilities(provider, modelId);
		if (caps) return caps;
	}
	return undefined;
}

/**
 * Try to resolve token limits from known providers by model name matching.
 */
function tryResolveKnownTokenLimits(modelId: string) {
	const providers = ['openai', 'claude', 'gemini', 'ollama'];
	for (const provider of providers) {
		const limits = modelRegistry.getModelTokenLimits(provider, modelId);
		if (limits) return limits;
	}
	return undefined;
}
