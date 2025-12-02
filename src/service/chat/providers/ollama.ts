import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	LLMProvider,
	ProviderModelInfo,
} from './types';
import { AIStreamEvent } from './types-events';
import { trimTrailingSlash } from './helpers';
import { AIModelId } from '../types-models';
import { invokeOpenAICompatibleBlock, invokeOpenAICompatibleStream } from './openai-compatible';

const DEFAULT_OLLAMA_TIMEOUT_MS = 60000;

/**
 * Normalize Ollama baseUrl to ensure it has /v1 path
 */
function normalizeOllamaBaseUrl(baseUrl: string): string {
	const cleaned = baseUrl.replace(/\/v1\/?$/, ''); // Remove /v1 suffix if present
	return `${trimTrailingSlash(cleaned)}/v1`;
}

export async function invokeOllamaBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	timeoutMs: number;
}): Promise<LLMResponse> {
	if (!params.baseUrl) {
		throw new Error('Ollama baseUrl is required');
	}
	const normalizedBaseUrl = normalizeOllamaBaseUrl(params.baseUrl);
	return invokeOpenAICompatibleBlock({
		request: params.request,
		baseUrl: normalizedBaseUrl,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		errorPrefix: 'Ollama endpoint',
	});
}

export async function* invokeOllamaStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	timeoutMs: number;
}): AsyncGenerator<AIStreamEvent> {
	if (!params.baseUrl) {
		throw new Error('Ollama baseUrl is required');
	}
	const normalizedBaseUrl = normalizeOllamaBaseUrl(params.baseUrl);
	yield* invokeOpenAICompatibleStream({
		request: params.request,
		baseUrl: normalizedBaseUrl,
		apiKey: params.apiKey,
		timeoutMs: params.timeoutMs,
		errorPrefix: 'Ollama streaming endpoint',
	});
}

export interface OllamaChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
}

export class OllamaChatService implements LLMProviderService {
	constructor(private readonly options: OllamaChatServiceOptions) {}

	getProviderId(): LLMProvider {
		return 'ollama';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		return invokeOllamaBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS,
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return invokeOllamaStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS,
		});
	}

	async getAvailableModels(): Promise<ProviderModelInfo[]> {
		return [
			{ id: 'llama3.1' as AIModelId, displayName: 'Llama 3.1' },
			{ id: 'llama3.1:8b' as AIModelId, displayName: 'Llama 3.1 8B' },
			{ id: 'llama3.1:70b' as AIModelId, displayName: 'Llama 3.1 70B' },
			{ id: 'llama3.1:405b' as AIModelId, displayName: 'Llama 3.1 405B' },
			{ id: 'llama3' as AIModelId, displayName: 'Llama 3' },
			{ id: 'llama3:8b' as AIModelId, displayName: 'Llama 3 8B' },
			{ id: 'llama3:70b' as AIModelId, displayName: 'Llama 3 70B' },
			{ id: 'mistral' as AIModelId, displayName: 'Mistral' },
			{ id: 'mixtral' as AIModelId, displayName: 'Mixtral' },
			{ id: 'codellama' as AIModelId, displayName: 'CodeLlama' },
			{ id: 'phi3' as AIModelId, displayName: 'Phi-3' },
			{ id: 'gemma' as AIModelId, displayName: 'Gemma' },
			{ id: 'neural-chat' as AIModelId, displayName: 'Neural Chat' },
			{ id: 'starling-lm' as AIModelId, displayName: 'Starling LM' },
			{ id: 'qwen' as AIModelId, displayName: 'Qwen' },
		];
	}
}

