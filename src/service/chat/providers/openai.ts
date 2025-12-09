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

	getAvailableModels(): ModelMetaData[] {
		return [
			{ id: 'gpt-4.1', displayName: 'GPT-4.1', icon: 'gpt-4.1' },
			{ id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', icon: 'gpt-4.1-mini' },
			{ id: 'gpt-4o', displayName: 'GPT-4o', icon: 'gpt-4o' },
			{ id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', icon: 'gpt-4o-mini' },
			{ id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', icon: 'gpt-3.5-turbo' },
			{ id: 'o1', displayName: 'O1', icon: 'o1' },
			{ id: 'o1-mini', displayName: 'O1 Mini', icon: 'o1-mini' },
			{ id: 'o1-preview', displayName: 'O1 Preview', icon: 'o1-preview' },
		];
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
