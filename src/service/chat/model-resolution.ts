import { PromptId } from '@/service/prompt/PromptId';
import { ModelInfoForSwitch, ProviderOptionsConfig, ProviderOptions } from '@/core/providers/types';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import type { AIServiceSettings } from '@/app/settings/types';
import type { LanguageModel } from 'ai';

/**
 * Resolve which provider + model to use for a given prompt.
 *
 * Priority:
 * 1. `promptModelMap[promptId]` — per-prompt override (most specific)
 * 2. `analysisModel` — for AiAnalysis* prompts when set
 * 3. `defaultModel` — global fallback
 */
export function resolveModelForPrompt(
	settings: AIServiceSettings,
	promptId: PromptId,
): { provider: string; modelId: string } {
	const perPrompt = settings.promptModelMap?.[promptId];
	if (perPrompt) return { provider: perPrompt.provider, modelId: perPrompt.modelId };

	if (settings.analysisModel && promptId.startsWith('ai-analysis')) {
		return { provider: settings.analysisModel.provider, modelId: settings.analysisModel.modelId };
	}

	const m = settings.defaultModel;
	if (m) return { provider: m.provider, modelId: m.modelId };
	throw new Error('No AI model configured. Open Settings → Model Config to set a default model and enter your API key.');
}

/**
 * Get a concrete LanguageModel instance (+ optional providerOptions) for a prompt.
 */
export function resolveModelInstance(
	settings: AIServiceSettings,
	multiChat: MultiProviderChatService,
	promptId: PromptId,
	providerOptionsConfig?: ProviderOptionsConfig,
): { model: LanguageModel; providerOptions?: ProviderOptions } {
	const { provider, modelId } = resolveModelForPrompt(settings, promptId);
	const providerService = multiChat.getProviderService(provider);
	return {
		model: providerService.modelClient(modelId, providerOptionsConfig),
		providerOptions: providerOptionsConfig ? providerService.getProviderOptions(providerOptionsConfig) : undefined,
	};
}

/**
 * Filter models from all providers by enabled-provider and enabled-model status.
 */
export function filterAvailableModels(
	allModels: Array<ModelInfoForSwitch & { provider: string }>,
	settings: AIServiceSettings,
): ModelInfoForSwitch[] {
	const providerConfigs = settings.llmProviderConfigs ?? {};

	return allModels
		.filter(model => {
			const providerConfig = providerConfigs[model.provider];

			// Skip if provider is not enabled
			if (providerConfig?.enabled !== true) {
				return false;
			}

			// Check model enabled status
			// If modelConfigs doesn't exist or model is not in modelConfigs, default to enabled
			const modelConfigs = providerConfig.modelConfigs;
			if (!modelConfigs) {
				return true; // Default enabled if no modelConfigs
			}

			const modelConfig = modelConfigs[model.id];
			// If model is explicitly configured, check its enabled status
			// If not configured, default to enabled
			return modelConfig?.enabled === true;
		})
		.map(m => ({
			id: m.id,
			displayName: m.displayName,
			provider: m.provider,
			icon: m.icon,
			capabilities: m.capabilities, // Pass through capabilities from provider
		}));
}
