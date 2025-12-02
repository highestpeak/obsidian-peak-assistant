import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	LLMProvider,
	ProviderModelInfo,
} from './types';
import { AIStreamEvent } from './types-events';
import { AIModelId } from '../types-models';
import { invokeOpenAICompatibleBlock, invokeOpenAICompatibleStream } from './openai-compatible';

const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1';

export async function invokeOpenRouterBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	referer?: string;
	title?: string;
	timeoutMs: number;
}): Promise<LLMResponse> {
	if (!params.apiKey) {
		throw new Error('OpenRouter API key is required');
	}
	const extraHeaders: Record<string, string> = {};
	if (params.referer) {
		extraHeaders['HTTP-Referer'] = params.referer;
	}
	if (params.title) {
		extraHeaders['X-Title'] = params.title;
	}
	return invokeOpenAICompatibleBlock({
		request: params.request,
		baseUrl: params.baseUrl ?? OPENROUTER_DEFAULT_BASE,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		extraHeaders,
		errorPrefix: 'OpenRouter endpoint',
	});
}

export async function* invokeOpenRouterStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	referer?: string;
	title?: string;
	timeoutMs: number;
}): AsyncGenerator<AIStreamEvent> {
	if (!params.apiKey) {
		throw new Error('OpenRouter API key is required');
	}
	const extraHeaders: Record<string, string> = {};
	if (params.referer) {
		extraHeaders['HTTP-Referer'] = params.referer;
	}
	if (params.title) {
		extraHeaders['X-Title'] = params.title;
	}
	yield* invokeOpenAICompatibleStream({
		request: params.request,
		baseUrl: params.baseUrl ?? OPENROUTER_DEFAULT_BASE,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		extraHeaders,
		errorPrefix: 'OpenRouter streaming endpoint',
	});
}

export interface OpenRouterChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	referer?: string;
	title?: string;
	timeoutMs?: number;
}

export class OpenRouterChatService implements LLMProviderService {
	constructor(private readonly options: OpenRouterChatServiceOptions) {}

	getProviderId(): LLMProvider {
		return 'openrouter';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		return invokeOpenRouterBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			referer: this.options.referer,
			title: this.options.title,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS,
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return invokeOpenRouterStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			referer: this.options.referer,
			title: this.options.title,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS,
		});
	}

	async getAvailableModels(): Promise<ProviderModelInfo[]> {
		return [
			{ id: 'openai/gpt-4.1' as AIModelId, displayName: 'GPT-4.1' },
			{ id: 'openai/gpt-4.1-mini' as AIModelId, displayName: 'GPT-4.1 Mini' },
			{ id: 'openai/gpt-4o' as AIModelId, displayName: 'GPT-4o' },
			{ id: 'openai/gpt-4o-mini' as AIModelId, displayName: 'GPT-4o Mini' },
			{ id: 'openai/gpt-3.5-turbo' as AIModelId, displayName: 'GPT-3.5 Turbo' },
			{ id: 'anthropic/claude-3.5-sonnet' as AIModelId, displayName: 'Claude 3.5 Sonnet' },
			{ id: 'anthropic/claude-3-opus' as AIModelId, displayName: 'Claude 3 Opus' },
			{ id: 'anthropic/claude-3-sonnet' as AIModelId, displayName: 'Claude 3 Sonnet' },
			{ id: 'anthropic/claude-3-haiku' as AIModelId, displayName: 'Claude 3 Haiku' },
			{ id: 'google/gemini-pro-1.5' as AIModelId, displayName: 'Gemini Pro 1.5' },
			{ id: 'google/gemini-flash-1.5' as AIModelId, displayName: 'Gemini Flash 1.5' },
			{ id: 'meta-llama/llama-3.1-405b-instruct' as AIModelId, displayName: 'Llama 3.1 405B' },
			{ id: 'meta-llama/llama-3.1-70b-instruct' as AIModelId, displayName: 'Llama 3.1 70B' },
			{ id: 'meta-llama/llama-3.1-8b-instruct' as AIModelId, displayName: 'Llama 3.1 8B' },
		];
	}
}

