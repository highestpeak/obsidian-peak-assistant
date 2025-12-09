import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from './types';
import { AIStreamEvent } from '../messages/types-events';
import { invokeOpenAICompatibleBlock, invokeOpenAICompatibleStream } from './openai-compatible';

const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;
const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1';

async function invokeOpenRouterBlock(params: {
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

async function* invokeOpenRouterStream(params: {
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
	extra?: Record<string, any>;
}

const DEFAULT_OPENROUTER_REFERER = 'https://obsidian.md';
const DEFAULT_OPENROUTER_TITLE = 'Peak Assistant';

export class OpenRouterChatService implements LLMProviderService {
	private readonly options: OpenRouterChatServiceOptions;

	constructor(options: OpenRouterChatServiceOptions) {
		this.options = {
			...options,
			referer: options.referer ?? options.extra?.referer ?? DEFAULT_OPENROUTER_REFERER,
			title: options.title ?? options.extra?.title ?? DEFAULT_OPENROUTER_TITLE,
		};
	}

	getProviderId(): string {
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

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return Promise.resolve([
			{ id: 'openai/gpt-4.1', displayName: 'GPT-4.1', icon: 'gpt-4.1' },
			{ id: 'openai/gpt-4.1-mini', displayName: 'GPT-4.1 Mini', icon: 'gpt-4.1-mini' },
			{ id: 'openai/gpt-4o', displayName: 'GPT-4o', icon: 'gpt-4o' },
			{ id: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini', icon: 'gpt-4o-mini' },
			{ id: 'openai/gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', icon: 'gpt-3.5-turbo' },
			{ id: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet', icon: 'claude-3-5-sonnet' },
			{ id: 'anthropic/claude-3-opus', displayName: 'Claude 3 Opus', icon: 'claude-3-opus' },
			{ id: 'anthropic/claude-3-sonnet', displayName: 'Claude 3 Sonnet', icon: 'claude-3-sonnet' },
			{ id: 'anthropic/claude-3-haiku', displayName: 'Claude 3 Haiku', icon: 'claude-3-haiku' },
			{ id: 'google/gemini-pro-1.5', displayName: 'Gemini Pro 1.5', icon: 'gemini-1.5-pro' },
			{ id: 'google/gemini-flash-1.5', displayName: 'Gemini Flash 1.5', icon: 'gemini-1.5-flash' },
			{ id: 'meta-llama/llama-3.1-405b-instruct', displayName: 'Llama 3.1 405B', icon: 'llama-3.1' },
			{ id: 'meta-llama/llama-3.1-70b-instruct', displayName: 'Llama 3.1 70B', icon: 'llama-3.1' },
			{ id: 'meta-llama/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B', icon: 'llama-3.1' },
		]);
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'openrouter',
			name: 'OpenRouter',
			defaultBaseUrl: OPENROUTER_DEFAULT_BASE,
			icon: 'openrouter',
		};
	}
}

