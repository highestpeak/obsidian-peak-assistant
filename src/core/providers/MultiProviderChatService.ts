import { LLMProviderService, ProviderConfig, ModelMetaData, ProviderMetaData, ModelInfoForSettings } from './types';
import { LLMRequest } from './types';
import { AIStreamEvent } from './types-events';
import { ProviderServiceFactory } from './base/factory';

export interface MultiProviderChatServiceOptions {
	providerConfigs?: Record<string, ProviderConfig>;
	requestTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;

export class MultiProviderChatService implements LLMProviderService {
	/**
	 * key: provider name, value: provider service instance
	 */
	private readonly providerServiceMap = new Map<string, LLMProviderService>();
	/**
	 * key: provider name, value: provider configuration
	 */
	private readonly configs: Record<string, ProviderConfig>;
	private readonly requestTimeout: number;

	constructor(options: MultiProviderChatServiceOptions = {}) {
		this.configs = options.providerConfigs ?? {};
		this.requestTimeout = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

		// Initialize services for each configured provider using factory
		this.providerServiceMap = ProviderServiceFactory.getInstance().createAll(this.configs, this.requestTimeout);
	}

	async blockChat(request: LLMRequest) {
		return this.getProviderService(request.provider).blockChat(request);
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return this.getProviderService(request.provider).streamChat(request);
	}

	/**
	 * Get provider ID - returns 'MultiProvider' as MultiProviderChatService wraps multiple providers
	 */
	getProviderId(): string {
		return 'MultiProvider';
	}

	/**
	 * Get available models - returns empty array as MultiProviderChatService doesn't have its own models
	 * Use getAllAvailableModels() instead to get models from all configured providers
	 */
	async getAvailableModels(): Promise<ModelMetaData[]> {
		const allModels = await this.getAllAvailableModels();
		return allModels;
	}

	/**
	 * Get provider metadata - returns default metadata for MultiProvider
	 */
	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'MultiProvider',
			name: 'Multi Provider',
			defaultBaseUrl: '',
		};
	}

	async generateEmbeddings(texts: string[], model: string, provider?: string): Promise<number[][]> {
		// If provider is specified, use that provider; otherwise use default or first available
		const targetProvider = provider;
		if (!targetProvider) {
			throw new Error('No provider available for embedding generation');
		}

		const service = this.getProviderService(targetProvider);
		return service.generateEmbeddings(texts, model);
	}

	/**
	 * Get provider service by provider name
	 */
	private getProviderService(provider: string): LLMProviderService {
		const service = this.providerServiceMap.get(provider);
		if (service) {
			return service;
		}

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

	/**
	 * Get config for provider
	 */
	private getConfigForProvider(provider: string): ProviderConfig | undefined {
		return this.configs[provider] || undefined;
	}

	/**
	 * Create provider service instance using factory
	 */
	private createProviderService(provider: string, config: ProviderConfig): LLMProviderService | null {
		return ProviderServiceFactory.getInstance().create(provider, config, this.requestTimeout);
	}

	/**
	 * Get all available models from all configured providers
	 */
	async getAllAvailableModels(): Promise<Array<ModelMetaData & { provider: string }>> {
		const allModels: Array<ModelMetaData & { provider: string }> = [];

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
