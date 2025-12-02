import { LLMProviderService, LLMProvider, LLMProviderConfig, ProviderModelInfo } from './types';
import { ModelConfig } from '../types-models';
import { LLMRequest } from './types';
import { AIStreamEvent } from './types-events';
import { OpenAIChatService } from './openai';
import { OpenRouterChatService } from './openrouter';
import { OllamaChatService } from './ollama';
import { ClaudeChatService } from './claude';
import { GeminiChatService } from './gemini';

export interface MultiProviderChatServiceOptions {
	models?: ModelConfig[];
	providerConfigs?: Record<string, LLMProviderConfig>;
	requestTimeoutMs?: number;
	openRouterReferer?: string;
	openRouterTitle?: string;
	maxClaudeOutputTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_OPENROUTER_REFERER = 'https://obsidian.md';
const DEFAULT_OPENROUTER_TITLE = 'Peak Assistant';
const DEFAULT_CLAUDE_MAX_OUTPUT = 1024;

export class MultiProviderChatService implements LLMProviderService {
	private readonly providerServiceMap = new Map<LLMProvider, LLMProviderService>();
	private readonly configs: Record<string, LLMProviderConfig>;
	private readonly requestTimeout: number;
	private readonly openRouterReferer: string;
	private readonly openRouterTitle: string;
	private readonly maxClaudeOutputTokens: number;

	constructor(options: MultiProviderChatServiceOptions = {}) {
		this.configs = options.providerConfigs ?? {};
		this.requestTimeout = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.openRouterReferer = options.openRouterReferer ?? DEFAULT_OPENROUTER_REFERER;
		this.openRouterTitle = options.openRouterTitle ?? DEFAULT_OPENROUTER_TITLE;
		this.maxClaudeOutputTokens = options.maxClaudeOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT;

		// Initialize services for each configured provider
		this.initializeProviders();
	}

	/**
	 * Initialize provider services
	 */
	private initializeProviders() {
		const processedProviders = new Set<LLMProvider>();
		for (const [providerKey, config] of Object.entries(this.configs)) {
			if (!config) continue;

			let provider: LLMProvider;
			if (providerKey === 'openai') {
				provider = 'openai';
			} else if (providerKey === 'openrouter') {
				provider = 'openrouter';
			} else if (providerKey === 'claude') {
				provider = 'claude';
			} else if (providerKey === 'gemini') {
				provider = 'gemini';
			} else if (providerKey === 'ollama') {
				provider = 'ollama';
			} else {
				continue;
			}

			if (processedProviders.has(provider)) continue;
			processedProviders.add(provider);

			// Check if provider has required configuration
			if (provider === 'ollama') {
				if (!config.baseUrl) continue;
			} else {
				if (!config.apiKey) continue;
			}

			// Create and cache service
			const service = this.createProviderService(provider, config);
			if (service) {
				this.providerServiceMap.set(provider, service);
			}
		}
	}

	async blockChat(request: LLMRequest) {
		return this.getProviderService(request.provider).blockChat(request);
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const service = this.getProviderService(request.provider);
		return service.streamChat ? service.streamChat(request) : this.createFallbackStream(service, request);
	}

	/**
	 * Get provider ID - returns 'other' as MultiProviderChatService wraps multiple providers
	 */
	getProviderId(): LLMProvider {
		return 'other';
	}

	/**
	 * Get provider service by provider name
	 */
	private getProviderService(provider: LLMProvider): LLMProviderService {
		const service = this.providerServiceMap.get(provider);
		
		if (!service) {
			const config = this.getConfigForProvider(provider);
			if (!config) {
				throw new Error(`Configuration for provider ${provider} is missing`);
			}
			const newService = this.createProviderService(provider, config);
			if (!newService) {
				throw new Error(`Failed to create service for provider ${provider}`);
			}
			this.providerServiceMap.set(provider, newService);
			return newService;
		}
		
		return service;
	}

	/**
	 * Get config for provider
	 */
	private getConfigForProvider(provider: LLMProvider): LLMProviderConfig | undefined {
		return this.configs[provider] ?? this.configs.default ?? this.configs['default'] ?? this.configs.other ?? this.configs['other'];
	}

	/**
	 * Create provider service instance
	 */
	private createProviderService(provider: LLMProvider, config: LLMProviderConfig): LLMProviderService | null {
		const timeoutMs = this.requestTimeout;
		try {
			switch (provider) {
				case 'openai':
					if (!config.apiKey) {
						return null;
					}
					return new OpenAIChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						timeoutMs,
					});
				case 'openrouter':
					if (!config.apiKey) {
						return null;
					}
					return new OpenRouterChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						referer: this.openRouterReferer,
						title: this.openRouterTitle,
						timeoutMs,
					});
				case 'claude':
					if (!config.apiKey) {
						return null;
					}
					return new ClaudeChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						timeoutMs,
						maxOutputTokens: this.maxClaudeOutputTokens,
					});
				case 'gemini':
					if (!config.apiKey) {
						return null;
					}
					return new GeminiChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						timeoutMs,
					});
				case 'ollama':
					return new OllamaChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						timeoutMs,
					});
				case 'other':
				default:
					// Fallback to OpenAI-compatible service
					return new OpenAIChatService({
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						timeoutMs,
					});
			}
		} catch (error) {
			console.warn(`Failed to create service for provider ${provider}:`, error);
			return null;
		}
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

	/**
	 * Get all available models from all configured providers
	 */
	async getAllAvailableModels(): Promise<Array<ProviderModelInfo & { provider: LLMProvider }>> {
		const allModels: Array<ProviderModelInfo & { provider: LLMProvider }> = [];

		// Get models from initialized services
		for (const [provider, service] of this.providerServiceMap.entries()) {
			try {
				if (service.getAvailableModels) {
					const models = await service.getAvailableModels();
					models.forEach((model) => {
						allModels.push({
							...model,
							provider,
						});
					});
				}
			} catch (error) {
				console.warn(`Failed to get models from provider ${provider}:`, error);
			}
		}

		return allModels;
	}
}
