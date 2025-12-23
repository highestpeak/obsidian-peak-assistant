import type { RerankProvider, RerankProviderConfig } from './types';
import { CohereRerankProvider } from './cohere';
import { JinaRerankProvider } from './jina';
import { LLMRerankProvider } from './llm';
import { FlashRankProvider } from './flashrank';

type RerankProviderFactoryFn = (config: RerankProviderConfig) => RerankProvider | null;

/**
 * Manager for creating and managing rerank providers.
 */
export class RerankProviderManager {
	private static instance: RerankProviderManager | null = null;
	private readonly factories = new Map<string, RerankProviderFactoryFn>();

	private constructor() {
		this.registerDefaultProviders();
	}

	/**
	 * Register default providers.
	 */
	private registerDefaultProviders(): void {
		this.register('cohere', (config) => {
			if (!config.apiKey) {
				return null;
			}
			return new CohereRerankProvider({
				apiKey: config.apiKey,
				baseUrl: config.baseUrl,
				modelId: config.modelId,
			});
		});

		this.register('jina', (config) => {
			if (!config.apiKey) {
				return null;
			}
			return new JinaRerankProvider({
				apiKey: config.apiKey,
				baseUrl: config.baseUrl,
				modelId: config.modelId,
			});
		});

		this.register('llm', (config) => {
			if (!config.extra?.provider || !config.modelId || !config.extra?.aiServiceManager) {
				return null;
			}
			return new LLMRerankProvider({
				modelId: config.modelId,
				provider: config.extra.provider,
				aiServiceManager: config.extra.aiServiceManager,
			});
		});

		this.register('flashrank', (config) => {
			return new FlashRankProvider({
				modelId: config.modelId,
			});
		});
	}

	/**
	 * Register a provider factory.
	 */
	private register(type: string, factory: RerankProviderFactoryFn): void {
		this.factories.set(type, factory);
	}

	/**
	 * Get singleton instance.
	 */
	static getInstance(): RerankProviderManager {
		if (!RerankProviderManager.instance) {
			RerankProviderManager.instance = new RerankProviderManager();
		}
		return RerankProviderManager.instance;
	}

	/**
	 * Create a rerank provider instance.
	 */
	create(config: RerankProviderConfig): RerankProvider | null {
		if (!config) {
			return null;
		}
		const factory = this.factories.get(config.type);
		if (!factory) {
			console.warn(`[RerankProviderManager] Unknown provider type: ${config.type}`);
			return null;
		}
		return factory(config);
	}

	/**
	 * Create rerank provider from rerank model config.
	 * Automatically handles LLM providers and dedicated rerank providers.
	 * 
	 * @param rerankModel - Rerank model configuration from settings
	 * @param providerConfig - Optional provider config (for API-based providers)
	 * @param aiServiceManager - AIServiceManager instance (for LLM providers)
	 * @returns Rerank provider instance or null
	 */
	createFromRerankModel(
		rerankModel: { provider: string; modelId: string },
		providerConfig?: { apiKey?: string; baseUrl?: string; extra?: Record<string, any> },
		aiServiceManager?: any,
	): RerankProvider | null {
		// Known dedicated rerank providers
		const knownRerankProviders = ['cohere', 'jina', 'flashrank'];
		const isLLMProvider = !knownRerankProviders.includes(rerankModel.provider);

		if (isLLMProvider) {
			// LLM provider: use 'llm' type with actual provider in extra
			return this.create({
				type: 'llm',
				modelId: rerankModel.modelId,
				extra: {
					provider: rerankModel.provider,
					aiServiceManager,
				},
			});
		}

		// Dedicated rerank provider: use provider type directly
		// FlashRank doesn't need config, but cohere/jina do
		if (rerankModel.provider === 'flashrank') {
			return this.create({
				type: rerankModel.provider,
				modelId: rerankModel.modelId,
			});
		}

		// Cohere and Jina require provider config
		if (!providerConfig) {
			return null;
		}

		return this.create({
			type: rerankModel.provider,
			modelId: rerankModel.modelId,
			apiKey: providerConfig.apiKey,
			baseUrl: providerConfig.baseUrl,
			extra: providerConfig.extra,
		});
	}
}

