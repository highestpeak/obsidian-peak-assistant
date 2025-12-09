import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from './types';
import { AIStreamEvent } from '../messages/types-events';
import { trimTrailingSlash } from './helpers';
import { invokeOpenAICompatibleBlock, invokeOpenAICompatibleStream } from './openai-compatible';

const DEFAULT_OLLAMA_TIMEOUT_MS = 60000;
export const OLLAMA_DEFAULT_BASE = 'http://localhost:11434';

/**
 * Normalize Ollama baseUrl to ensure it has /v1 path
 */
function normalizeOllamaBaseUrl(baseUrl: string): string {
	const cleaned = baseUrl.replace(/\/v1\/?$/, ''); // Remove /v1 suffix if present
	return `${trimTrailingSlash(cleaned)}/v1`;
}

async function invokeOllamaBlock(params: {
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

async function* invokeOllamaStream(params: {
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
	extra?: Record<string, any>;
}

export class OllamaChatService implements LLMProviderService {
	constructor(private readonly options: OllamaChatServiceOptions) {}

	getProviderId(): string {
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

	getAvailableModels(): ModelMetaData[] {
		return [
			{ id: 'llama3.1', displayName: 'Llama 3.1', icon: 'llama-3.1' },
			{ id: 'llama3.1:8b', displayName: 'Llama 3.1 8B', icon: 'llama-3.1' },
			{ id: 'llama3.1:70b', displayName: 'Llama 3.1 70B', icon: 'llama-3.1' },
			{ id: 'llama3.1:405b', displayName: 'Llama 3.1 405B', icon: 'llama-3.1' },
			{ id: 'llama3', displayName: 'Llama 3', icon: 'llama-3' },
			{ id: 'llama3:8b', displayName: 'Llama 3 8B', icon: 'llama-3' },
			{ id: 'llama3:70b', displayName: 'Llama 3 70B', icon: 'llama-3' },
			{ id: 'mistral', displayName: 'Mistral', icon: 'mistral' },
			{ id: 'mixtral', displayName: 'Mixtral', icon: 'mixtral' },
			{ id: 'codellama', displayName: 'CodeLlama', icon: 'codellama' },
			{ id: 'phi3', displayName: 'Phi-3', icon: 'phi-3' },
			{ id: 'gemma', displayName: 'Gemma', icon: 'gemma' },
			{ id: 'neural-chat', displayName: 'Neural Chat', icon: 'neural-chat' },
			{ id: 'starling-lm', displayName: 'Starling LM', icon: 'starling-lm' },
			{ id: 'qwen', displayName: 'Qwen', icon: 'qwen' },
		];
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'ollama',
			name: 'Ollama',
			defaultBaseUrl: OLLAMA_DEFAULT_BASE,
			icon: 'ollama',
		};
	}
}

