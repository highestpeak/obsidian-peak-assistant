import { LLMProviderService, ModelMetaData, ProviderConfig, ProviderMetaData } from './types';
import { OpenAIChatService } from './openai';
import { OpenRouterChatService } from './openrouter';
import { OLLAMA_DEFAULT_BASE, OllamaChatService } from './ollama';
import { ClaudeChatService } from './claude';
import { GeminiChatService } from './gemini';

const DEFAULT_TIMEOUT_MS = 60000;

type ProviderFactory = (config: ProviderConfig, timeoutMs: number) => LLMProviderService | null;

// Create a temporary service instance to get metadata
// Use a temporary config with placeholder values (value doesn't matter for metadata)
const tempConfig: ProviderConfig = {
	apiKey: 'temp',
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
		this.register('openai', (config, timeoutMs) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'openai', config);
				return null;
			}
			return new OpenAIChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				timeoutMs,
				extra: config.extra,
			});
		});

		this.register('openrouter', (config, timeoutMs) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'openrouter', config);
				return null;
			}
			return new OpenRouterChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				timeoutMs,
				extra: config.extra,
			});
		});

		this.register('claude', (config, timeoutMs) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'claude', config);
				return null;
			}
			return new ClaudeChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				timeoutMs,
				extra: config.extra,
			});
		});

		this.register('gemini', (config, timeoutMs) => {
			if (!config.apiKey) {
				console.log('create service null apiKey', 'gemini', config);
				return null;
			}
			return new GeminiChatService({
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				timeoutMs,
				extra: config.extra,
			});
		});

		this.register('ollama', (config, timeoutMs) => {
			return new OllamaChatService({
				baseUrl: config.baseUrl ?? OLLAMA_DEFAULT_BASE,
				apiKey: config.apiKey,
				timeoutMs,
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
	create(providerId: string, config: ProviderConfig, timeoutMs?: number): LLMProviderService | null {
		if (!config) {
			return null;
		}
		const factory = this.factories.get(providerId);
		if (!factory) {
			return null;
		}
		const service = factory(config, timeoutMs ?? this.defaultTimeout);
		return service;
	}

	/**
	 * Get all services by configs
	 * @param configs - Record where key is provider ID and value is provider config
	 */
	createAll(configs: Record<string, ProviderConfig>, timeoutMs?: number): Map<string, LLMProviderService> {
		const services = new Map<string, LLMProviderService>();

		for (const [providerId, config] of Object.entries(configs)) {
			// Factory functions handle their own validation and return null if config is invalid
			const service = this.create(providerId, config, timeoutMs);
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
					const tempService = factory(tempConfig, this.defaultTimeout);
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
	 * Get available models for a provider
	 * @param providerId - Provider identifier
	 * @param config - Optional provider config (required for providers that need API key)
	 * @returns Promise resolving to array of ModelMetaData
	 */
	async getProviderSupportModels(providerId: string, config?: ProviderConfig): Promise<ModelMetaData[]> {
		const factory = this.factories.get(providerId);
		if (factory) {
			// Use provided config if available, otherwise use temp config
			const serviceConfig = config || tempConfig;
			const tempService = factory(serviceConfig, this.defaultTimeout);
			if (tempService) {
				return await tempService.getAvailableModels();
			}
		}
		throw new Error(`Provider ${providerId} not found`);
	}
}


