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

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

export async function invokeOpenAIBlock(params: {
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

export async function* invokeOpenAIStream(params: {
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
}

export class OpenAIChatService implements LLMProviderService {
	constructor(private readonly options: OpenAIChatServiceOptions) {}

	getProviderId(): LLMProvider {
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

	async getAvailableModels(): Promise<ProviderModelInfo[]> {
		return [
			{ id: 'gpt-4.1' as AIModelId, displayName: 'GPT-4.1' },
			{ id: 'gpt-4.1-mini' as AIModelId, displayName: 'GPT-4.1 Mini' },
			{ id: 'gpt-4o' as AIModelId, displayName: 'GPT-4o' },
			{ id: 'gpt-4o-mini' as AIModelId, displayName: 'GPT-4o Mini' },
			{ id: 'gpt-3.5-turbo' as AIModelId, displayName: 'GPT-3.5 Turbo' },
			{ id: 'o1' as AIModelId, displayName: 'O1' },
			{ id: 'o1-mini' as AIModelId, displayName: 'O1 Mini' },
			{ id: 'o1-preview' as AIModelId, displayName: 'O1 Preview' },
		];
	}
}
