import { LLMProviderService, ModelMetaData, ProviderConfig, ProviderMetaData, ModelConfig, ModelCapabilities } from '../types';
import { OpenAIChatService } from './openai';
import { OpenRouterChatService } from './openrouter';
import { OllamaChatService } from './ollama';
import { ClaudeChatService } from './claude';
import { GeminiChatService } from './gemini';
import { PerplexityChatService } from './perplexity';
import { BusinessError, ErrorCode } from '@/core/errors';

const DEFAULT_TIMEOUT_MS = 60000;

type ProviderFactory = (config: ProviderConfig) => LLMProviderService | null;

// Create a temporary service instance to get metadata or models
// Use fake API key and default baseUrl - these are only used for getting metadata/models, not for actual API calls
const tempConfig: ProviderConfig = {
	apiKey: 'fake-api-key-for-metadata-only',
	baseUrl: 'http://localhost:11434',
};

/**
 * Provider factory registry (singleton)
 * Maps provider ID to factory function
 * All provider services are registered and created through this factory
 */
export class ProviderServiceFactory {
	private static instance: ProviderServiceFactory | null = null;
	private readonly factories = new Map<string, ProviderFactory>();
	private readonly defaultTimeout: number;

	private constructor(defaultTimeout: number = DEFAULT_TIMEOUT_MS) {
		this.defaultTimeout = defaultTimeout;
		this.registerDefaultProviders();
	}

	/**
	 * Register default providers
	 */
	private registerDefaultProviders(): void {
		this.register('openai', (config) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'openai', config);
				return null;
			}
			return new OpenAIChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		this.register('openrouter', (config) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'openrouter', config);
				return null;
			}
			return new OpenRouterChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		this.register('claude', (config) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'claude', config);
				return null;
			}
			return new ClaudeChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		this.register('gemini', (config) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'gemini', config);
				return null;
			}
			return new GeminiChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		this.register('ollama', (config) => {
			return new OllamaChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		this.register('perplexity', (config) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'perplexity', config);
				return null;
			}
			return new PerplexityChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				extra: config.extra,
			});
		});

		// Register 'other' as OpenAI-compatible fallback
		// this.register('other', (config, timeoutMs) => {
		// 	return new OpenAIChatService({
		// 		baseUrl: config.baseUrl,
		// 		apiKey: config.apiKey,
		// 		timeoutMs,
		// 		extra: config.extra,
		// 	});
		// });
	}

	/**
	 * Register a provider factory
	 */
	private register(providerId: string, factory: ProviderFactory): void {
		this.factories.set(providerId, factory);
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): ProviderServiceFactory {
		if (!ProviderServiceFactory.instance) {
			ProviderServiceFactory.instance = new ProviderServiceFactory();
		}
		return ProviderServiceFactory.instance;
	}

	/**
	 * Create a service instance for a provider
	 */
	create(providerId: string, config: ProviderConfig): LLMProviderService | null {
		if (!config) {
			return null;
		}
		const factory = this.factories.get(providerId);
		if (!factory) {
			return null;
		}
		const service = factory(config);
		return service;
	}

	/**
	 * Get all services by configs
	 * @param configs - Record where key is provider ID and value is provider config
	 */
	createAll(configs: Record<string, ProviderConfig>): Map<string, LLMProviderService> {
		const services = new Map<string, LLMProviderService>();

		for (const [providerId, config] of Object.entries(configs)) {
			// Factory functions handle their own validation and return null if config is invalid
			const service = this.create(providerId, config);
			if (service) {
				services.set(providerId, service);
			}
		}

		return services;
	}

	/**
	 * Get metadata for all registered providers
	 */
	getAllProviderMetadata(): ProviderMetaData[] {
		const metadata: ProviderMetaData[] = [];

		for (const providerId of this.factories.keys()) {
			try {
				const factory = this.factories.get(providerId);
				if (factory) {
					const tempService = factory(tempConfig);
					if (tempService) {
						metadata.push(tempService.getProviderMetadata());
					}
				}
			} catch (error) {
				// Ignore errors when creating temp service for metadata
				console.error(`[ProviderServiceFactory] Error getting metadata for provider ${providerId}:`, error);
			}
		}

		return metadata;
	}

	/**
	 * Merge modelConfigs into model metadata
	 */
	private mergeModelConfigs(
		models: ModelMetaData[],
		modelConfigs?: Record<string, ModelConfig>
	): ModelMetaData[] {
		if (!modelConfigs) {
			return models;
		}

		const modelMap = new Map<string, ModelMetaData>();
		// Add API models first
		models.forEach(model => {
			modelMap.set(model.id, { ...model });
		});

		// Apply overrides and add custom models
		for (const [modelId, config] of Object.entries(modelConfigs)) {
			const existingModel = modelMap.get(modelId);
			
			if (existingModel) {
				// Apply overrides to existing model
				if (config.displayName) {
					existingModel.displayName = config.displayName;
				}
				if (config.icon) {
					existingModel.icon = config.icon;
				}
				if (config.tokenLimitsOverride) {
					existingModel.tokenLimits = {
						...existingModel.tokenLimits,
						...config.tokenLimitsOverride,
					};
				}
				if (config.capabilitiesOverride) {
					// Ensure all required boolean fields are present
					const baseCapabilities: ModelCapabilities = {
						vision: existingModel.capabilities?.vision ?? false,
						pdfInput: existingModel.capabilities?.pdfInput ?? false,
						tools: existingModel.capabilities?.tools ?? false,
						webSearch: existingModel.capabilities?.webSearch ?? false,
						xSearch: existingModel.capabilities?.xSearch ?? false,
						newsSearch: existingModel.capabilities?.newsSearch ?? false,
						rssSearch: existingModel.capabilities?.rssSearch ?? false,
						codeInterpreter: existingModel.capabilities?.codeInterpreter ?? false,
						imageGeneration: existingModel.capabilities?.imageGeneration ?? false,
						reasoning: existingModel.capabilities?.reasoning ?? false,
						maxCtx: existingModel.capabilities?.maxCtx,
					};

					// Apply overrides
					existingModel.capabilities = {
						...baseCapabilities,
						...config.capabilitiesOverride,
						// Ensure maxCtx is preserved if provided
						maxCtx: config.capabilitiesOverride.maxCtx ?? baseCapabilities.maxCtx,
					};
				}
			} else {
				// Add custom model that's not in API list
				modelMap.set(modelId, {
					id: modelId,
					displayName: config.displayName || modelId,
					icon: config.icon,
					tokenLimits: config.tokenLimitsOverride,
					capabilities: config.capabilitiesOverride as any,
				});
			}
		}

		return Array.from(modelMap.values());
	}

	/**
	 * Get available models for a provider
	 * @param providerId - Provider identifier
	 * @param config - Optional provider config (if provided, will use real API key; otherwise uses fake key)
	 * @returns Promise resolving to array of ModelMetaData
	 */
	async getProviderSupportModels(providerId: string, config?: ProviderConfig): Promise<ModelMetaData[]> {
		const factory = this.factories.get(providerId);
		if (!factory) {
			throw new BusinessError(ErrorCode.PROVIDER_NOT_FOUND, `Provider ${providerId} not found`);
		}

		// Use provided config if available, otherwise use fake config
		// Fake config allows creating instance to get models without real API key
		const serviceConfig = (config && config.apiKey) ? config : {
			...tempConfig,
			// For Ollama, use default baseUrl if not provided
			baseUrl: config?.baseUrl,
		};

		try {
			const service = factory(serviceConfig);
			if (service) {
				const models = await service.getAvailableModels();
				
				// Merge with modelConfigs if provided
				return this.mergeModelConfigs(models, config?.modelConfigs);
			}
		} catch (error) {
			console.warn(`[ProviderServiceFactory] Failed to get models for ${providerId}:`, error);
			throw error;
		}

		throw new BusinessError(ErrorCode.MODEL_UNAVAILABLE, `Failed to create service for provider ${providerId}`);
	}
}


