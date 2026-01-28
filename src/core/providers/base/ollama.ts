import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ModelCapabilities,
	ModelType,
} from '../types';
import { modelMetadataCache } from '@/core/utils/ttl-cache';
import { createOllama, type OllamaProvider } from 'ollama-ai-provider-v2';
import { embedMany, type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { trimTrailingSlash } from '@/core/utils/format-utils';

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
 * Get token limits for Ollama model based on model name/family
 * Default context length is 4096 (Ollama default), but can be configured via extra.contextLength
 */
function getOllamaTokenLimits(modelName: string, contextLength?: number): ModelTokenLimits {
	const defaultContextLength = contextLength ?? 4096;
	
	// Common Ollama model context window sizes (from model families)
	const modelLimits: Record<string, ModelTokenLimits> = {
		'llama2': { maxTokens: 4096, maxInputTokens: 4096, recommendedSummaryThreshold: 3000 },
		'llama3': { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6000 },
		'llama3.1': { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		'llama3.2': { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		'mistral': { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6000 },
		'mixtral': { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25000 },
		'codellama': { maxTokens: 16384, maxInputTokens: 16384, recommendedSummaryThreshold: 12000 },
		'phi': { maxTokens: 2048, maxInputTokens: 2048, recommendedSummaryThreshold: 1500 },
		'phi3': { maxTokens: 4096, maxInputTokens: 4096, recommendedSummaryThreshold: 3000 },
		'gemma': { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6000 },
		'gemma2': { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6000 },
		'qwen': { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25000 },
		'qwen2': { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25000 },
	};

	// Try partial match based on model name
	const lowerName = modelName.toLowerCase();
	for (const [prefix, limits] of Object.entries(modelLimits)) {
		if (lowerName.includes(prefix)) {
			// Override with configured context length if provided
			if (contextLength) {
				return {
					maxTokens: contextLength,
					maxInputTokens: contextLength,
					recommendedSummaryThreshold: Math.floor(contextLength * 0.8),
				};
			}
			return limits;
		}
	}

	// Default fallback
	return {
		maxTokens: defaultContextLength,
		maxInputTokens: defaultContextLength,
		recommendedSummaryThreshold: Math.floor(defaultContextLength * 0.8),
	};
}

/**
 * Get capabilities for Ollama model
 */
function getOllamaCapabilities(modelName: string, tokenLimits: ModelTokenLimits): ModelCapabilities {
	const capabilities: ModelCapabilities = {
		vision: modelName.toLowerCase().includes('llava') || modelName.toLowerCase().includes('vision'),
		pdfInput: false, // Ollama doesn't directly support PDF input
		tools: true, // Ollama supports tool calling
		webSearch: false,
		reasoning: false,
	};

	if (tokenLimits.maxInputTokens) {
		capabilities.maxCtx = tokenLimits.maxInputTokens;
	}

	return capabilities;
}

/**
 * Fetch models from Ollama API
 * @param baseUrl - Ollama base URL
 * @param contextLength - Optional context length from config
 * @returns Promise resolving to array of ModelMetaData or null if fetch failed
 */
async function fetchOllamaModels(
	baseUrl?: string,
	contextLength?: number,
): Promise<ModelMetaData[] | null> {
	try {
		const url = baseUrl ?? OLLAMA_DEFAULT_BASE;
		const apiUrl = `${trimTrailingSlash(url)}/api/tags`;

		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(DEFAULT_OLLAMA_TIMEOUT_MS),
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

			// Generate display name from model name
			let displayName = model.name;
			displayName = displayName.replace(/([a-z])([0-9])/gi, '$1 $2');
			displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

			const tokenLimits = getOllamaTokenLimits(model.name, contextLength);
			const capabilities = getOllamaCapabilities(model.name, tokenLimits);

			return {
				id: model.name,
				displayName,
				icon,
				modelType: ModelType.LLM,
				tokenLimits,
				capabilities,
			};
		});
	} catch (error) {
		console.error('[OllamaChatService] Error fetching models:', error);
		return null;
	}
}

export class OllamaChatService implements LLMProviderService {
	private readonly client: OllamaProvider;

	/**
	 * Get cache key for this provider instance
	 */
	private getCacheKey(): string {
		const contextLength = this.options.extra?.contextLength ?? 4096;
		return `ollama:${this.options.baseUrl ?? OLLAMA_DEFAULT_BASE}:ctx${contextLength}`;
	}

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

	modelClient(model: string): LanguageModel {
		return this.client(model) as unknown as LanguageModel;
	}

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.modelClient(request.model), request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.modelClient(request.model), request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		const cacheKey = this.getCacheKey();

		// Check cache first
		const cached = modelMetadataCache.get(cacheKey) as ModelMetaData[] | undefined;
		if (cached) {
			return cached;
		}

		// Call fetchOllamaModels with context length for API data
		const contextLength = this.options.extra?.contextLength ?? 4096;
		const models = await fetchOllamaModels(
			this.options.baseUrl,
			contextLength,
		);

		if (models && models.length > 0) {
			// Cache the result
			modelMetadataCache.set(cacheKey, models);
			return models;
		}

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

	/**
	 * Get token limits for a specific model
	 * This method looks up from cached model metadata first, then falls back to dynamic calculation
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		// Try to get from cache first
		const cacheKey = this.getCacheKey();
		const cached = modelMetadataCache.get(cacheKey) as ModelMetaData[] | undefined;

		if (cached) {
			const modelMeta = cached.find(m => m.id === model);
			if (modelMeta?.tokenLimits) {
				return modelMeta.tokenLimits;
			}
		}

		// Fall back to dynamic calculation
		const contextLength = this.options.extra?.contextLength ?? 4096;
		return getOllamaTokenLimits(model, contextLength);
	}
}

