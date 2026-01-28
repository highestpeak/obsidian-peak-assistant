import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ModelCapabilities,
	ModelType,
} from '../types';
import { createPerplexity, type PerplexityProvider } from '@ai-sdk/perplexity';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';

const DEFAULT_PERPLEXITY_TIMEOUT_MS = 60000;
const PERPLEXITY_DEFAULT_BASE = 'https://api.perplexity.ai';

export const PROVIDER_ID_PERPLEXITY = 'perplexity';

/**
 * Model mapping interface containing both the actual API model ID and the icon identifier.
 */
interface ModelMapping {
	/** Actual API model ID to use for API calls */
	modelId: string;
	/** Icon identifier for UI display, compatible with @lobehub/icons ModelIcon component */
	icon: string;
	/** Token limits for this model */
	tokenLimits?: ModelTokenLimits;
	/** Capabilities for this model */
	capabilities?: ModelCapabilities;
}

/**
 * Map user-facing model IDs to actual API model IDs and icons.
 *
 * DESIGN EVOLUTION:
 *
 * Initially, we maintained a complete list (KNOWN_PERPLEXITY_CHAT_MODELS) that included all
 * Perplexity model IDs, extracted from @ai-sdk/perplexity type definitions. This list was used
 * directly for getAvailableModels().
 *
 * CURRENT APPROACH:
 *
 * We now use a unified mapping structure for consistency with other providers:
 * - User-facing IDs (keys): Clean names without version suffixes where applicable
 * - API model IDs (modelId): Actual model IDs to use for API calls
 * - Icons (icon): All Perplexity models use 'perplexity' icon
 *
 * Similar to OpenAI and Claude, we map user-friendly names to specific versions for API calls,
 * ensuring users see clean names while we use specific versions internally.
 *
 * DATA SOURCES:
 * - Original model IDs: @ai-sdk/perplexity package type definitions (PerplexityLanguageModelId type)
 * - Official documentation: https://docs.perplexity.ai/getting-started/pricing
 * - When adding new models, check both sources
 *
 * This is now the single source of truth for available Perplexity models.
 */
const MODEL_ID_MAP: Record<string, ModelMapping> = {
	// Sonar series
	'sonar-deep-research': {
		modelId: 'sonar-deep-research',
		icon: 'perplexity',
		tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 },
	},
	'sonar-reasoning-pro': {
		modelId: 'sonar-reasoning-pro',
		icon: 'perplexity',
		tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 },
	},
	'sonar-reasoning': {
		modelId: 'sonar-reasoning',
		icon: 'perplexity',
		tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 },
	},
	'sonar-pro': {
		modelId: 'sonar-pro',
		icon: 'perplexity',
		tokenLimits: { maxTokens: 204800, maxInputTokens: 204800, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: false, maxCtx: 204800 },
	},
	'sonar': {
		modelId: 'sonar',
		icon: 'perplexity',
		tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 100000 },
		capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: false, maxCtx: 131072 },
	},
};

/**
 * Get list of available Perplexity model IDs.
 *
 * @returns Array of user-facing model IDs (keys from MODEL_ID_MAP)
 */
export function getKnownPerplexityModelIds(): readonly string[] {
	return Object.keys(MODEL_ID_MAP);
}

export interface PerplexityChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class PerplexityChatService implements LLMProviderService {
	private readonly client: PerplexityProvider;

	constructor(private readonly options: PerplexityChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Perplexity API key is required');
		}
		this.client = createPerplexity({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? PERPLEXITY_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return PROVIDER_ID_PERPLEXITY;
	}

	/**
	 * Get cache key for this provider instance
	 */
	private getCacheKey(): string {
		return `perplexity:${this.options.baseUrl ?? PERPLEXITY_DEFAULT_BASE}:${this.options.apiKey ? 'hasKey' : 'noKey'}`;
	}

	/**
	 * Normalize user-facing model ID to actual API model ID by looking up in MODEL_ID_MAP.
	 *
	 * @param modelId - User-facing model ID
	 * @returns Actual API model ID from MODEL_ID_MAP, or original ID if not found in mapping
	 */
	private normalizeModelId(modelId: string): string {
		return MODEL_ID_MAP[modelId]?.modelId || modelId;
	}

	modelClient(model: string): LanguageModel {
		return this.client(this.normalizeModelId(model)) as unknown as LanguageModel;
	}

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.modelClient(request.model), request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.modelClient(request.model), request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return getKnownPerplexityModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];

			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || 'perplexity',
				modelType: ModelType.LLM,
				tokenLimits: mapping?.tokenLimits,
				capabilities: mapping?.capabilities,
			};
		});
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'perplexity',
			name: 'Perplexity',
			defaultBaseUrl: PERPLEXITY_DEFAULT_BASE,
			icon: 'perplexity',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Perplexity does not support embeddings');
	}

	/**
	 * Get token limits for Perplexity models
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		return MODEL_ID_MAP[model]?.tokenLimits;
	}
}

