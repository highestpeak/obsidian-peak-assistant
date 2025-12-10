import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from './types';
import { AIStreamEvent } from '../messages/types-events';
import { invokeOpenAICompatibleBlock, invokeOpenAICompatibleStream } from './openai-compatible';

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

interface OpenAIModelResponse {
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
	
	// Handle GPT models
	if (displayName.startsWith('gpt-')) {
		displayName = displayName.replace('gpt-', 'GPT-');
		// Capitalize after numbers: gpt-4o -> GPT-4O
		displayName = displayName.replace(/(\d)([a-z])/g, (_, num, letter) => `${num}${letter.toUpperCase()}`);
		// Capitalize first letter after dash/space
		displayName = displayName.replace(/[- ]([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		return displayName;
	}
	
	// Handle O1 models
	if (displayName.startsWith('o1')) {
		displayName = displayName.replace(/^o1/, 'O1');
		// Replace dash with space and capitalize following letter
		displayName = displayName.replace(/-([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		return displayName;
	}
	
	// For other models, capitalize first letter if needed
	if (displayName.length > 0 && displayName[0] !== displayName[0].toUpperCase()) {
		displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
	}
	
	return displayName;
}

/**
 * Fetch models from OpenAI API
 * @param baseUrl - OpenAI base URL
 * @param apiKey - OpenAI API key
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Promise resolving to array of ModelMetaData or null if fetch failed
 */
async function fetchOpenAIModels(
	baseUrl?: string,
	apiKey?: string,
	timeoutMs?: number
): Promise<ModelMetaData[] | null> {
	if (!apiKey) {
		return null;
	}

	try {
		const url = baseUrl ?? OPENAI_DEFAULT_BASE;
		const apiUrl = `${url}/models`;

		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
		}

		const data: OpenAIModelResponse = await response.json();

		if (!data.data || !Array.isArray(data.data)) {
			throw new Error('Invalid response format: data array not found');
		}

		// Convert API response to ModelMetaData format
		return data.data.map((model) => {
			const displayName = formatModelDisplayName(model.id);

			return {
				id: model.id,
				displayName,
				// Use provider icon for all OpenAI models
				// This avoids maintaining model-specific icon mappings as OpenAI keeps adding new models
				icon: 'openai',
			};
		});
	} catch (error) {
		console.error('[OpenAIChatService] Error fetching models:', error);
		return null;
	}
}

async function invokeOpenAIBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	timeoutMs: number;
}): Promise<LLMResponse> {
	if (!params.apiKey) {
		throw new Error('OpenAI API key is required');
	}
	return invokeOpenAICompatibleBlock({
		request: params.request,
		baseUrl: params.baseUrl ?? OPENAI_DEFAULT_BASE,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		errorPrefix: 'OpenAI endpoint',
	});
}

async function* invokeOpenAIStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	timeoutMs: number;
}): AsyncGenerator<AIStreamEvent> {
	if (!params.apiKey) {
		throw new Error('OpenAI API key is required');
	}
	yield* invokeOpenAICompatibleStream({
		request: params.request,
		baseUrl: params.baseUrl ?? OPENAI_DEFAULT_BASE,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		errorPrefix: 'OpenAI streaming endpoint',
	});
}

export interface OpenAIChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	extra?: Record<string, any>;
}

export class OpenAIChatService implements LLMProviderService {
	constructor(private readonly options: OpenAIChatServiceOptions) {}

	getProviderId(): string {
		return 'openai';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		return invokeOpenAIBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return invokeOpenAIStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
		});
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Try to fetch models from API
		const models = await fetchOpenAIModels(
			this.options.baseUrl,
			this.options.apiKey,
			this.options.timeoutMs
		);

		if (models && models.length > 0) {
			return models;
		}

		// Fallback to empty array if fetch failed
		// Original hardcoded models list (kept for reference):
		// return [
		// 	{ id: 'gpt-4.1', displayName: 'GPT-4.1', icon: 'gpt-4.1' },
		// 	{ id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', icon: 'gpt-4.1-mini' },
		// 	{ id: 'gpt-4o', displayName: 'GPT-4o', icon: 'gpt-4o' },
		// 	{ id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', icon: 'gpt-4o-mini' },
		// 	{ id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', icon: 'gpt-3.5-turbo' },
		// 	{ id: 'o1', displayName: 'O1', icon: 'o1' },
		// 	{ id: 'o1-mini', displayName: 'O1 Mini', icon: 'o1-mini' },
		// 	{ id: 'o1-preview', displayName: 'O1 Preview', icon: 'o1-preview' },
		// ];
		return [];
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'openai',
			name: 'OpenAI',
			defaultBaseUrl: OPENAI_DEFAULT_BASE,
			icon: 'openai',
		};
	}
}
