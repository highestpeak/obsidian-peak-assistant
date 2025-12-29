import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createPerplexity, type PerplexityProvider } from '@ai-sdk/perplexity';
import { generateText, streamText, type LanguageModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';

const DEFAULT_PERPLEXITY_TIMEOUT_MS = 60000;
const PERPLEXITY_DEFAULT_BASE = 'https://api.perplexity.ai';

/**
 * Known Perplexity model IDs extracted from @ai-sdk/perplexity type definitions.
 * This serves as a fallback when API model fetching fails.
 * 
 * Note: This list should be kept in sync with PerplexityLanguageModelId type from @ai-sdk/perplexity.
 * The list includes all known model IDs up to the package version.
 * 
 * https://docs.perplexity.ai/getting-started/pricing
 */
export const KNOWN_PERPLEXITY_CHAT_MODELS: readonly string[] = [
	'sonar-deep-research',
	'sonar-reasoning-pro',
	'sonar-reasoning',
	'sonar-pro',
	'sonar',
] as const;

interface PerplexityModelResponse {
	object: string;
	data: Array<{
		id: string;
		object: string;
		created: number;
		owned_by: string;
	}>;
}

/**
 * Format model display name from model ID
 */
function formatModelDisplayName(modelId: string): string {
	let displayName = modelId;
	
	// Handle pplx models
	if (displayName.startsWith('pplx-')) {
		displayName = displayName.replace('pplx-', 'Perplexity ');
		// Convert to title case after the prefix
		displayName = displayName.replace(/-([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		displayName = displayName.replace(/^([a-z])/g, (_, letter) => letter.toUpperCase());
		return displayName;
	}
	
	// Handle llama-3-sonar models
	if (displayName.includes('llama-3-sonar')) {
		displayName = displayName.replace('llama-3-sonar-', 'Llama 3 Sonar ');
		displayName = displayName.replace(/-([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		displayName = displayName.replace(/^([a-z])/g, (_, letter) => letter.toUpperCase());
		return displayName;
	}
	
	// For other models, capitalize first letter if needed
	if (displayName.length > 0 && displayName[0] !== displayName[0].toUpperCase()) {
		displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
	}
	
	return displayName;
}

/**
 * Fetch models from Perplexity API
 */
async function fetchPerplexityModels(
	baseUrl?: string,
	apiKey?: string,
	timeoutMs?: number
): Promise<ModelMetaData[] | null> {
	if (!apiKey) {
		return null;
	}

	try {
		const url = baseUrl ?? PERPLEXITY_DEFAULT_BASE;
		const apiUrl = `${url}/models`;

		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_PERPLEXITY_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
		}

		const data: PerplexityModelResponse = await response.json();

		if (!data.data || !Array.isArray(data.data)) {
			throw new Error('Invalid response format: data array not found');
		}

		// Convert API response to ModelMetaData format
		return data.data.map((model) => {
			const displayName = formatModelDisplayName(model.id);

			return {
				id: model.id,
				displayName,
				icon: 'perplexity',
			};
		});
	} catch (error) {
		console.error('[PerplexityChatService] Error fetching models:', error);
		return null;
	}
}

export interface PerplexityChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	extra?: Record<string, any>;
}

export class PerplexityChatService implements LLMProviderService {
	private readonly client: PerplexityProvider;

	constructor(private readonly options: PerplexityChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Perplexity API key is required');
		}
		this.client = createPerplexity({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? PERPLEXITY_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return 'perplexity';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = await generateText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
		});

		return {
			content: result.text,
			model: result.response.modelId || request.model,
			usage: result.usage,
		};
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = streamText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
		});

		return streamTextToAIStreamEvents(result, request.model);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Fallback: Use known model IDs from @ai-sdk/perplexity type definitions
		// This ensures we have a comprehensive list even when API fetch fails
		return KNOWN_PERPLEXITY_CHAT_MODELS.map((modelId) => ({
			id: modelId,
			displayName: modelId,
			icon: 'perplexity',
		}));
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'perplexity',
			name: 'Perplexity',
			defaultBaseUrl: PERPLEXITY_DEFAULT_BASE,
			icon: 'perplexity',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Perplexity does not support embeddings');
	}
}

