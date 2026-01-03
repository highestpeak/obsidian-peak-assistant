import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createOllama, type OllamaProvider } from 'ollama-ai-provider-v2';
import { generateText, streamText, embedMany, type LanguageModel, type EmbeddingModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';
import { trimTrailingSlash } from './helpers';

const DEFAULT_OLLAMA_TIMEOUT_MS = 60000;
export const OLLAMA_DEFAULT_BASE = 'http://localhost:11434';

/**
 * Normalize Ollama baseUrl for ollama-ai-provider-v2
 * The provider expects baseURL to include /api (e.g., http://localhost:11434/api)
 */
function normalizeOllamaBaseUrl(baseUrl: string): string {
	// Remove trailing slashes and /v1 suffix if present
	let normalized = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
	
	// Ensure /api is included in the baseURL
	// ollama-ai-provider-v2 expects baseURL to be like http://localhost:11434/api
	if (!normalized.endsWith('/api')) {
		normalized = `${normalized}/api`;
	}
	
	return normalized;
}


export interface OllamaChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	extra?: Record<string, any>;
}

interface OllamaModelResponse {
	models: Array<{
		name: string;
		modified_at: string;
		size: number;
		digest: string;
		details?: {
			format?: string;
			family?: string;
			families?: string[];
			parameter_size?: string;
			quantization_level?: string;
		};
	}>;
}

/**
 * Model name patterns to icon mapping
 * Ordered by specificity (more specific patterns first)
 */
const MODEL_ICON_MAP: Array<{ patterns: string[]; icon: string }> = [
	{ patterns: ['llama-3.1', 'llama3.1'], icon: 'llama-3.1' },
	{ patterns: ['llama-3', 'llama3'], icon: 'llama-3' },
	{ patterns: ['codellama', 'code-llama', 'codeqwen', 'codegemma', 'codestral'], icon: 'codellama' },
	{ patterns: ['mixtral'], icon: 'mixtral' },
	{ patterns: ['mistral'], icon: 'mistral' },
	{ patterns: ['phi-3', 'phi3'], icon: 'phi-3' },
	{ patterns: ['gemma', 'gemma2'], icon: 'gemma' },
	{ patterns: ['deepseek', 'deepseek-v2', 'deepseek-v3', 'deepseek-r1', 'deepseek-coder'], icon: 'deepseek' },
	{ patterns: ['qwen', 'qwen2', 'qwen2.5', 'qwen3', 'qwq'], icon: 'qwen' },
	{ patterns: ['neural-chat'], icon: 'neural-chat' },
	{ patterns: ['starling'], icon: 'starling-lm' },
	{ patterns: ['wizardlm', 'wizardlm2'], icon: 'wizardlm' },
	{ patterns: ['llava', 'minicpm-v'], icon: 'llava' },
	{ patterns: ['command-r', 'command-r-plus'], icon: 'command-r' },
	{ patterns: ['aya'], icon: 'aya' },
	{ patterns: ['gpt-oss'], icon: 'gpt-oss' },
];

/**
 * Map model family or name to icon identifier
 * Uses pattern matching to find the most specific match
 */
function getModelIcon(family?: string, name?: string): string {
	if (!family && !name) {
		return 'ollama';
	}

	const searchText = `${name || ''} ${family || ''}`.toLowerCase().trim();

	// Find the first matching pattern (ordered by specificity)
	for (const { patterns, icon } of MODEL_ICON_MAP) {
		if (patterns.some(pattern => searchText.includes(pattern))) {
			return icon;
		}
	}

	// Fallback: check family directly if no pattern matched
	if (family) {
		const lowerFamily = family.toLowerCase();
		if (lowerFamily === 'llama') return 'llama-3';
		if (lowerFamily === 'mistral') return 'mistral';
		if (lowerFamily === 'gemma') return 'gemma';
	}

	return 'ollama';
}

/**
 * Fetch models from Ollama API
 * @param baseUrl - Ollama base URL
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Promise resolving to array of ModelMetaData or null if fetch failed
 */
async function fetchOllamaModels(
	baseUrl?: string,
	timeoutMs?: number
): Promise<ModelMetaData[] | null> {
	try {
		const url = baseUrl ?? OLLAMA_DEFAULT_BASE;
		const apiUrl = `${trimTrailingSlash(url)}/api/tags`;

		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
		}

		const data: OllamaModelResponse = await response.json();

		if (!data.models || !Array.isArray(data.models)) {
			throw new Error('Invalid response format: models array not found');
		}

		// Convert API response to ModelMetaData format
		return data.models.map((model) => {
			const family = model.details?.family || '';
			const icon = getModelIcon(family, model.name);
			// console.log('model', model.name, displayName, family, icon);

			// Generate display name from model name
			let displayName = model.name;
			// If name contains colon, use the part after colon as display name
			if (model.name.includes(':')) {
				const parts = model.name.split(':');
				displayName = parts[0];
			}
			// Format display name: capitalize first letter and add space before numbers
			// e.g., "gemma3" -> "Gemma 3", "llama3.1" -> "Llama 3.1"
			displayName = displayName.replace(/([a-z])([0-9])/gi, '$1 $2');
			displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
			// console.log('displayName', displayName);

			return {
				id: model.name,
				displayName,
				icon,
			};
		});
	} catch (error) {
		console.error('[OllamaChatService] Error fetching models:', error);
		return null;
	}
}

export class OllamaChatService implements LLMProviderService {
	private readonly client: OllamaProvider;

	constructor(private readonly options: OllamaChatServiceOptions) {
		const baseUrl = this.options.baseUrl ?? OLLAMA_DEFAULT_BASE;
		const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
		this.client = createOllama({
			baseURL: normalizedBaseUrl,
		});
	}

	getProviderId(): string {
		return 'ollama';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = await generateText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			topK: request.outputControl?.topK,
			presencePenalty: request.outputControl?.presencePenalty,
			frequencyPenalty: request.outputControl?.frequencyPenalty,
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
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			topK: request.outputControl?.topK,
			presencePenalty: request.outputControl?.presencePenalty,
			frequencyPenalty: request.outputControl?.frequencyPenalty,
		});

		return streamTextToAIStreamEvents(result, request.model);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Call fetchOllamaModels directly each time using await
		const models = await fetchOllamaModels(
			this.options.baseUrl,
			this.options.timeoutMs
		);
		// console.log('models fetched', models);

		if (models) {
			return models;
		}

		// Original hardcoded models list (commented out but kept for reference)
		// return [
		// 	{ id: 'llama3.1', displayName: 'Llama 3.1', icon: 'llama-3.1' },
		// 	{ id: 'llama3', displayName: 'Llama 3', icon: 'llama-3' },
		// 	{ id: 'mistral', displayName: 'Mistral', icon: 'mistral' },
		// 	{ id: 'phi3', displayName: 'Phi-3', icon: 'phi-3' },
		// 	{ id: 'qwen', displayName: 'Qwen', icon: 'qwen' },
		// ];

		return [];
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'ollama',
			name: 'Ollama',
			defaultBaseUrl: OLLAMA_DEFAULT_BASE,
			icon: 'ollama',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		try {
			// Use ollama-ai-provider-v2's embeddingModel method to create embedding model
			// Following AI SDK example: ollama.embeddingModel('nomic-embed-text')
			// Try embeddingModel first, fallback to textEmbeddingModel if not available
			const embeddingModel = this.client.textEmbeddingModel(model);
			if (!embeddingModel) {
				throw new Error('Ollama provider does not support embedding models');
			}
			const result = await embedMany({
				model: embeddingModel,
				values: texts,
			});
			return result.embeddings;
		} catch (error) {
			console.error('[OllamaChatService] Error generating embeddings:', error);
			throw error;
		}
	}
}

