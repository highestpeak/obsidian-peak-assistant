import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ModelCapabilities,
} from '../types';
import { modelMetadataCache } from '@/core/utils/ttl-cache';
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { getKnownOpenAIModelIds, getOpenAIAvatarType } from './openai';
import { getKnownClaudeModelIds } from './claude';
import { getKnownGeminiModelIds } from './gemini';

const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1';

// OpenRouter API types based on https://openrouter.ai/docs/api/api-reference/models/get-models

export type ModelGroup =
	| 'Router'
	| 'Media'
	| 'Other'
	| 'GPT'
	| 'Claude'
	| 'Gemini'
	| 'Grok'
	| 'Cohere'
	| 'Nova'
	| 'Qwen'
	| 'Yi'
	| 'DeepSeek'
	| 'Mistral'
	| 'Llama2'
	| 'Llama3'
	| 'Llama4'
	| 'PaLM'
	| 'RWKV'
	| 'Qwen3';

export type ModelArchitectureInstructType =
	| 'none'
	| 'airoboros'
	| 'alpaca'
	| 'alpaca-modif'
	| 'chatml'
	| 'claude'
	| 'code-llama'
	| 'gemma'
	| 'llama2'
	| 'llama3'
	| 'mistral'
	| 'nemotron'
	| 'neural'
	| 'openchat'
	| 'phi3'
	| 'rwkv'
	| 'vicuna'
	| 'zephyr'
	| 'deepseek-r1'
	| 'deepseek-v3.1'
	| 'qwq'
	| 'qwen3';

export type InputModality = 'text' | 'image' | 'file' | 'audio' | 'video';
export type OutputModality = 'text' | 'image' | 'embeddings' | 'audio';

export type Parameter =
	| 'temperature'
	| 'top_p'
	| 'top_k'
	| 'min_p'
	| 'top_a'
	| 'frequency_penalty'
	| 'presence_penalty'
	| 'repetition_penalty'
	| 'max_tokens'
	| 'logit_bias'
	| 'logprobs'
	| 'top_logprobs'
	| 'seed'
	| 'response_format'
	| 'structured_outputs'
	| 'stop'
	| 'tools'
	| 'tool_choice'
	| 'parallel_tool_calls'
	| 'include_reasoning'
	| 'reasoning'
	| 'reasoning_effort'
	| 'web_search_options'
	| 'verbosity';

export interface PublicPricing {
	prompt: string;
	completion: string;
	request: string;
	image: string;
	image_token: string;
	image_output: string;
	audio: string;
	audio_output: string;
	input_audio_cache: string;
	web_search: string;
	internal_reasoning: string;
	input_cache_read: string;
	input_cache_write: string;
	discount: number;
}

export interface ModelArchitecture {
	tokenizer: ModelGroup;
	instruct_type: ModelArchitectureInstructType | null;
	modality: string | null;
	input_modalities: InputModality[];
	output_modalities: OutputModality[];
}

export interface TopProviderInfo {
	context_length: number | null;
	max_completion_tokens: number | null;
	is_moderated: boolean;
}

export interface PerRequestLimits {
	prompt_tokens: number;
	completion_tokens: number;
}

export interface DefaultParameters {
	temperature: number | null;
	top_p: number | null;
	frequency_penalty: number | null;
}

export interface OpenRouterModel {
	id: string;
	canonical_slug: string;
	hugging_face_id: string | null;
	name: string;
	created: number;
	description: string;
	pricing: PublicPricing;
	context_length: number | null;
	architecture: ModelArchitecture;
	top_provider: TopProviderInfo;
	per_request_limits: PerRequestLimits;
	supported_parameters: Parameter[];
	default_parameters: DefaultParameters;
	expiration_date: string | null;
}

export interface ModelsListResponse {
	data: OpenRouterModel[];
}

export type ModelsGetParametersCategory =
	| 'programming'
	| 'roleplay'
	| 'marketing'
	| 'marketing/seo'
	| 'technology'
	| 'science'
	| 'translation'
	| 'legal'
	| 'finance'
	| 'health'
	| 'trivia'
	| 'academia';

export interface OpenRouterChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	referer?: string;
	title?: string;
	extra?: Record<string, any>;
}

const DEFAULT_OPENROUTER_REFERER = 'https://obsidian.md';
const DEFAULT_OPENROUTER_TITLE = 'Peak Assistant';

export class OpenRouterChatService implements LLMProviderService {
	private readonly client: OpenRouterProvider;
	private readonly referer: string;
	private readonly title: string;

	constructor(private readonly options: OpenRouterChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('OpenRouter API key is required');
		}
		this.referer = this.options.referer ?? this.options.extra?.referer ?? DEFAULT_OPENROUTER_REFERER;
		this.title = this.options.title ?? this.options.extra?.title ?? DEFAULT_OPENROUTER_TITLE;

		const headers: Record<string, string> = {};
		if (this.referer) {
			headers['HTTP-Referer'] = this.referer;
		}
		if (this.title) {
			headers['X-Title'] = this.title;
		}

		this.client = createOpenRouter({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? OPENROUTER_DEFAULT_BASE,
			headers,
		});
	}

	getProviderId(): string {
		return 'openrouter';
	}

	modelClient(model: string): LanguageModel {
		return this.client(model) as unknown as LanguageModel;
	}

	/**
	 * Check if a model is free based on pricing information
	 * @param pricing The pricing object from OpenRouter API
	 * @returns true if the model is free (no costs for prompt/completion)
	 */
	private isModelFree(pricing: PublicPricing): boolean {
		// A model is considered free if both prompt and completion costs are "0"
		return pricing.prompt === "0" && pricing.completion === "0";
	}

	/**
	 * Get cache key for this provider instance
	 */
	private getCacheKey(): string {
		return `openrouter:${this.options.baseUrl ?? OPENROUTER_DEFAULT_BASE}:${this.options.apiKey ? 'hasKey' : 'noKey'}`;
	}

	/**
	 * Fetch available models from OpenRouter API
	 * @param category Optional category filter for models
	 * @returns Promise of ModelsListResponse
	 */
	private async fetchModelsFromAPI(category?: ModelsGetParametersCategory): Promise<ModelsListResponse> {
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.options.apiKey}`,
			'Content-Type': 'application/json',
		};
		if (this.referer) {
			headers['HTTP-Referer'] = this.referer;
		}
		if (this.title) {
			headers['X-Title'] = this.title;
		}

		const baseUrl = this.options.baseUrl ?? OPENROUTER_DEFAULT_BASE;
		const url = new URL(`${baseUrl}/models`);
		if (category) {
			url.searchParams.set('category', category);
		}

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers,
			signal: AbortSignal.timeout(DEFAULT_OPENROUTER_TIMEOUT_MS),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			throw new Error(`OpenRouter models API error: ${response.status} ${response.statusText}. ${errorText}`);
		}

		const data: ModelsListResponse = await response.json();
		return data;
	}

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.modelClient(request.model), request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.modelClient(request.model), request);
	}

	/**
	 * Extract capabilities from OpenRouter model data
	 */
	private extractCapabilities(model: OpenRouterModel): ModelCapabilities {
		const capabilities: ModelCapabilities = {
			vision: false,
			pdfInput: false,
			tools: false,
			webSearch: false,
			reasoning: false,
		};

		// Check supported parameters
		if (model.supported_parameters.includes('tools')) {
			capabilities.tools = true;
		}
		if (model.supported_parameters.includes('reasoning') || model.supported_parameters.includes('include_reasoning')) {
			capabilities.reasoning = true;
		}
		if (model.supported_parameters.includes('web_search_options')) {
			capabilities.webSearch = true;
		}

		// Check input modalities
		if (model.architecture.input_modalities.includes('image')) {
			capabilities.vision = true;
		}
		if (model.architecture.input_modalities.includes('file')) {
			capabilities.pdfInput = true;
		}

		// Set maxCtx from context_length
		if (model.context_length) {
			capabilities.maxCtx = model.context_length;
		}

		return capabilities;
	}

	/**
	 * Extract token limits from OpenRouter model data
	 */
	private extractTokenLimits(model: OpenRouterModel): ModelTokenLimits | undefined {
		if (!model.context_length) {
			return undefined;
		}

		const maxTokens = model.context_length;
		const maxInputTokens = model.per_request_limits?.prompt_tokens ?? model.context_length;
		const maxOutputTokens = model.per_request_limits?.completion_tokens ?? model.top_provider?.max_completion_tokens ?? undefined;
		const recommendedSummaryThreshold = Math.floor(maxTokens * 0.8);

		return {
			maxTokens,
			maxInputTokens,
			maxOutputTokens,
			recommendedSummaryThreshold,
		};
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		const cacheKey = this.getCacheKey();

		// Check cache first
		const cached = modelMetadataCache.get(cacheKey) as ModelMetaData[] | undefined;
		if (cached) {
			console.debug('getAvailableModels: cache hit, returning cached models', JSON.stringify(cached));
			return cached;
		}

		try {
			const response = await this.fetchModelsFromAPI();

			// Create models with pricing info for sorting
			const modelsWithPricing = response.data.map((model) => {
				// Determine icon based on model provider prefix
				let icon: string = 'openrouter'; // default icon

				if (model.id.startsWith('openai/')) {
					icon = getOpenAIAvatarType(model.id.replace('openai/', ''));
				} else if (model.id.startsWith('anthropic/')) {
					icon = 'claude';
				} else if (model.id.startsWith('google/')) {
					icon = 'gemini';
				} else if (model.id.startsWith('meta-llama/') || model.id.startsWith('mistralai/')) {
					icon = 'llama';
				} else if (model.id.startsWith('xai/')) {
					icon = 'grok';
				}

				// Extract capabilities and token limits
				const capabilities = this.extractCapabilities(model);
				const tokenLimits = this.extractTokenLimits(model);

				return {
					id: model.id,
					displayName: model.name,
					icon,
					pricing: model.pricing,
					capabilities,
					tokenLimits,
				};
			});

			// Sort models: free models first, then alphabetically by display name
			modelsWithPricing.sort((a, b) => {
				const aIsFree = this.isModelFree(a.pricing);
				const bIsFree = this.isModelFree(b.pricing);

				// Free models come first
				if (aIsFree && !bIsFree) return -1;
				if (!aIsFree && bIsFree) return 1;

				// If both are free or both are paid, sort alphabetically by display name
				return a.displayName.localeCompare(b.displayName);
			});

			// Remove pricing info from final result as it's not part of ModelMetaData
			const models = modelsWithPricing.map(({ pricing, ...model }) => model);

			// Cache the result
			modelMetadataCache.set(cacheKey, models);

			return models;
		} catch (error) {
			// Fallback to hardcoded models if API call fails
			console.warn('Failed to fetch models from OpenRouter API, falling back to hardcoded models:', error);
			const models: ModelMetaData[] = [];

			// Add OpenAI models with openai/ prefix
			for (const modelId of getKnownOpenAIModelIds()) {
				models.push({
					id: `openai/${modelId}`,
					displayName: modelId,
					icon: getOpenAIAvatarType(modelId),
				});
			}

			// Add Claude models with anthropic/ prefix
			for (const modelId of getKnownClaudeModelIds()) {
				models.push({
					id: `anthropic/${modelId}`,
					displayName: modelId,
					icon: 'claude',
				});
			}

			// Add Gemini models with google/ prefix
			for (const modelId of getKnownGeminiModelIds()) {
				models.push({
					id: `google/${modelId}`,
					displayName: modelId,
					icon: 'gemini',
				});
			}

			// Sort fallback models alphabetically by display name
			models.sort((a, b) => a.displayName.localeCompare(b.displayName));

			return models;
		}
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'openrouter',
			name: 'OpenRouter',
			defaultBaseUrl: OPENROUTER_DEFAULT_BASE,
			icon: 'openrouter',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		const timeoutMs = DEFAULT_OPENROUTER_TIMEOUT_MS;

		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.options.apiKey}`,
			'Content-Type': 'application/json',
		};
		if (this.referer) {
			headers['HTTP-Referer'] = this.referer;
		}
		if (this.title) {
			headers['X-Title'] = this.title;
		}

		const baseUrl = this.options.baseUrl ?? OPENROUTER_DEFAULT_BASE;
		const url = `${baseUrl}/embeddings`;

		// OpenRouter uses OpenAI-compatible API, so we use direct fetch
		// as embedMany may not be supported by the OpenRouter provider
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				input: texts,
				model: model,
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			throw new Error(`OpenRouter embedding API error: ${response.status} ${response.statusText}. ${errorText}`);
		}

		const data = await response.json();

		if (!data.data || !Array.isArray(data.data)) {
			throw new Error('Invalid embedding API response: missing data array');
		}

		const embeddings: number[][] = data.data.map((item: { embedding?: number[] }) => {
			if (!item.embedding || !Array.isArray(item.embedding)) {
				throw new Error('Invalid embedding format in API response');
			}
			return item.embedding;
		});

		return embeddings;
	}

	/**
	 * Get token limits for a specific model
	 * OpenRouter provides context_length in their model data
	 * This method looks up from cached model metadata
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		let tokenLimits = this.getModelTokenLimitsWithoutRetry(model);
		if (tokenLimits) {
			return tokenLimits;
		}

		console.debug('getModelTokenLimits: cache miss, triggering getAvailableModels');
		// trigger once to cache the models
		this.getAvailableModels();

		tokenLimits = this.getModelTokenLimitsWithoutRetry(model);

		if (!tokenLimits) {
			console.debug('getModelTokenLimits: getAvailableModels failed, returning undefined');
		}

		return tokenLimits;
	}

	private getModelTokenLimitsWithoutRetry(model: string): ModelTokenLimits | undefined {
		const cacheKey = this.getCacheKey();
		const cached = modelMetadataCache.get(cacheKey) as ModelMetaData[] | undefined;
		if (cached) {
			const modelMeta = cached.find(m => m.id === model);
			return modelMeta?.tokenLimits;
		}

		// If not in cache, return undefined (caller should handle async fetch)
		return undefined;
	}
}

