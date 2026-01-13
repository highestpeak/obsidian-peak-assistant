import { LLMProviderService, ProviderConfig, ModelMetaData, ProviderMetaData, LLMStreamEvent, LLMOutputControlSettings } from './types';
import { LLMRequest } from './types';
import { ProviderServiceFactory } from './base/factory';
import { BusinessError, ErrorCode } from '@/core/errors';
import { getLLMOutputControlSettingKeys } from './types';

export interface MultiProviderChatServiceOptions {
	providerConfigs?: Record<string, ProviderConfig>;
	defaultOutputControl?: LLMOutputControlSettings;
}

const DEFAULT_TIMEOUT_MS = 60000;

export class MultiProviderChatService implements LLMProviderService {
	/**
	 * key: provider name, value: provider service instance
	 */
	private providerServiceMap = new Map<string, LLMProviderService>();
	/**
	 * key: provider name, value: provider configuration
	 */
	private configs: Record<string, ProviderConfig>;
	private defaultOutputControl?: LLMOutputControlSettings;

	constructor(options: MultiProviderChatServiceOptions = {}) {
		this.configs = options.providerConfigs ?? {};
		this.defaultOutputControl = options.defaultOutputControl;

		// Initialize services for each configured provider using factory
		this.providerServiceMap = ProviderServiceFactory.getInstance().createAll(this.configs);
	}

	/**
	 * Merge request outputControl with global default settings
	 */
	private mergeOutputControl(request: LLMRequest): LLMRequest {
		let mergedOutputControl = request.outputControl ? { ...request.outputControl } : {};

		// If we have default settings, merge them field by field
		if (this.defaultOutputControl) {
			const settingKeys = getLLMOutputControlSettingKeys();
			settingKeys.forEach(key => {
				if (mergedOutputControl[key] === undefined && this.defaultOutputControl![key] !== undefined) {
					(mergedOutputControl as any)[key] = this.defaultOutputControl![key];
				}
			});
		}

		return {
			...request,
			outputControl: mergedOutputControl
		};
	}

	async blockChat(request: LLMRequest) {
		console.debug('[MultiProviderChatService] Blocking chat:', request);
		const mergedRequest = this.mergeOutputControl(request);
		return this.getProviderService(request.provider).blockChat(mergedRequest);
	}

	streamChat(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
		console.debug('[MultiProviderChatService] Streaming chat:', request);
		const mergedRequest = this.mergeOutputControl(request);
		return this.getProviderService(request.provider).streamChat(mergedRequest);
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
			throw new BusinessError(
				ErrorCode.CONFIGURATION_MISSING,
				`Configuration for provider ${provider} is missing`
			);
		}
		const newService = this.createProviderService(provider, config);
		if (!newService) {
			throw new BusinessError(
				ErrorCode.MODEL_UNAVAILABLE,
				`Failed to create service for provider ${provider}`
			);
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
		return ProviderServiceFactory.getInstance().create(provider, config);
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

	/**
	 * Refresh provider services with new configurations.
	 * Clears existing services and recreates them with updated configs.
	 * 
	 * @param newConfigs - New provider configurations to use
	 */
	refresh(newConfigs: Record<string, ProviderConfig>, newOutputControl: LLMOutputControlSettings): void {
		// Clear existing services
		this.providerServiceMap.clear();
		
		// Update configs
		this.configs = newConfigs;

		this.defaultOutputControl = newOutputControl;
		
		// Recreate services with new configs
		this.providerServiceMap = ProviderServiceFactory.getInstance().createAll(this.configs);
	}
}
