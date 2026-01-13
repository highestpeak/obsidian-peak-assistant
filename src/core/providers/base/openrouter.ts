import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
} from '../types';
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { getKnownOpenAIModelIds, getOpenAIAvatarType } from './openai';
import { getKnownClaudeModelIds } from './claude';
import { getKnownGeminiModelIds } from './gemini';

const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1';

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

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.client(request.model) as unknown as LanguageModel, request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.client(request.model) as unknown as LanguageModel, request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
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

		return models;
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
}

