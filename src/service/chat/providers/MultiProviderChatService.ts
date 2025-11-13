import { LLMProviderService, LLMProvider, LLMProviderConfig } from './types';
import { ModelConfig } from '../types-models';
import { AIModelId } from '../types-models';
import { LLMRequest } from './types';
import { AIStreamEvent } from './types-events';
import { OpenAIChatService } from './openai';
import { ClaudeChatService } from './claude';
import { GeminiChatService } from './gemini';

export interface MultiProviderChatServiceOptions {
	models?: ModelConfig[];
	providerConfigs?: Record<string, LLMProviderConfig>;
	defaultProvider?: LLMProvider;
	requestTimeoutMs?: number;
	openRouterReferer?: string;
	openRouterTitle?: string;
	maxClaudeOutputTokens?: number;
}

type ProviderResolution = {
	provider: LLMProvider;
	config: LLMProviderConfig;
	model: AIModelId;
};

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_OPENROUTER_REFERER = 'https://obsidian.md';
const DEFAULT_OPENROUTER_TITLE = 'Peak Assistant';
const DEFAULT_CLAUDE_MAX_OUTPUT = 1024;

export class MultiProviderChatService implements LLMProviderService {
	private readonly modelsById = new Map<AIModelId, ModelConfig>();
	private readonly configs: Record<string, LLMProviderConfig>;
	private readonly defaultProvider: LLMProvider | undefined;
	private readonly requestTimeout: number;
	private readonly openRouterReferer: string;
	private readonly openRouterTitle: string;
	private readonly maxClaudeOutputTokens: number;
	private readonly serviceCache = new Map<LLMProvider, Map<LLMProviderConfig, LLMProviderService>>();

	constructor(options: MultiProviderChatServiceOptions = {}) {
		this.configs = options.providerConfigs ?? {};
		this.defaultProvider = options.defaultProvider;
		this.requestTimeout = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.openRouterReferer = options.openRouterReferer ?? DEFAULT_OPENROUTER_REFERER;
		this.openRouterTitle = options.openRouterTitle ?? DEFAULT_OPENROUTER_TITLE;
		this.maxClaudeOutputTokens = options.maxClaudeOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT;

		for (const model of options.models ?? []) {
			this.modelsById.set(model.id, model);
		}
	}

	async blockChat(request: LLMRequest) {
		const resolved = this.resolveProvider(request.model);
		const service = this.getProviderService(resolved);
		return service.blockChat(request);
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const resolved = this.resolveProvider(request.model);
		const service = this.getProviderService(resolved);
		if (service.streamChat) {
			return service.streamChat(request);
		}
		return this.createFallbackStream(service, request);
	}

	private getProviderService(resolved: ProviderResolution): LLMProviderService {
		let providerMap = this.serviceCache.get(resolved.provider);
		if (!providerMap) {
			providerMap = new Map();
			this.serviceCache.set(resolved.provider, providerMap);
		}
		let service = providerMap.get(resolved.config);
		if (!service) {
			service = this.createProviderService(resolved);
			providerMap.set(resolved.config, service);
		}
		return service;
	}

	private createProviderService(resolved: ProviderResolution): LLMProviderService {
		const timeoutMs = this.requestTimeout;
		const config = resolved.config;
		switch (resolved.provider) {
			case 'openai':
				return new OpenAIChatService(this.buildOpenAIOptions(config, timeoutMs, 'openai'));
			case 'openrouter':
				return new OpenAIChatService(
					this.buildOpenAIOptions(config, timeoutMs, 'openrouter', {
						referer: this.openRouterReferer,
						title: this.openRouterTitle,
					})
				);
			case 'claude':
				return new ClaudeChatService({
					baseUrl: config.baseUrl,
					apiKey: config.apiKey,
					timeoutMs,
					maxOutputTokens: this.maxClaudeOutputTokens,
				});
			case 'gemini':
				return new GeminiChatService({
					baseUrl: config.baseUrl,
					apiKey: config.apiKey,
					timeoutMs,
				});
			case 'other':
			default:
				return new OpenAIChatService(this.buildOpenAIOptions(config, timeoutMs, 'openai'));
		}
	}

	private buildOpenAIOptions(
		config: LLMProviderConfig,
		timeoutMs: number,
		provider: 'openai' | 'openrouter',
	textra?: { referer?: string; title?: string }
	) {
		return {
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			timeoutMs,
			provider,
			referer: textra?.referer,
			title: textra?.title,
		};
	}

	private resolveProvider(modelId: AIModelId): ProviderResolution {
		const model = this.modelsById.get(modelId);
		const guessedProvider = model?.provider ?? this.guessProviderByModelId(modelId) ?? this.defaultProvider ?? 'openai';
		const config =
			this.configs[modelId] ??
			this.configs[guessedProvider] ??
			this.configs.default ??
			this.configs['default'] ??
			this.configs.other ??
			this.configs['other'];

		if (!config || !config.apiKey) {
			throw new Error(`API key configuration for model ${modelId} is missing`);
		}

		return {
			provider: guessedProvider,
			config,
			model: modelId,
		};
	}

	private guessProviderByModelId(modelId: string): LLMProvider {
		const lowered = modelId.toLowerCase();
		if (lowered.startsWith('gpt-') || lowered.startsWith('o1-') || lowered.startsWith('davinci') || lowered.includes('openai')) {
			return 'openai';
		}
		if (lowered.startsWith('claude-') || lowered.includes('anthropic')) {
			return 'claude';
		}
		if (lowered.startsWith('gemini-') || lowered.includes('google')) {
			return 'gemini';
		}
		if (lowered.includes('openrouter') || lowered.includes('/')) {
			return 'openrouter';
		}
		return 'other';
	}

	private async *createFallbackStream(service: LLMProviderService, request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const result = await service.blockChat(request);
		if (result.content) {
			yield {
				type: 'delta',
				text: result.content,
				model: result.model,
			};
		}
		yield {
			type: 'complete',
			model: result.model,
			usage: result.usage,
		};
	}
}
