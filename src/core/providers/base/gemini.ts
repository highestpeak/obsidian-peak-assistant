import {
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	ModelCapabilities,
	ModelTokenLimits,
	ModelType,
} from '../types';
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from '@ai-sdk/google';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { LLMRequest, LLMResponse, LLMStreamEvent } from '../types';
import { LanguageModel } from 'ai';
import { modelMetadataCache } from '@/core/utils/ttl-cache';

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
 * Initially, we maintained a complete list (KNOWN_GEMINI_CHAT_MODELS) that included all
 * Gemini model IDs, extracted from @ai-sdk/google type definitions. This list was used
 * directly for getAvailableModels().
 * 
 * CURRENT APPROACH:
 * 
 * We now use a unified mapping structure for consistency with other providers:
 * - User-facing IDs (keys): Clean names without version suffixes where applicable (e.g., 'gemini-1.5-pro' instead of 'gemini-1.5-pro-002')
 * - API model IDs (modelId): Actual model IDs with version suffixes (latest stable versions)
 * - Icons (icon): All Gemini models use 'gemini' icon
 * 
 * Similar to OpenAI and Claude, we map user-friendly names to specific versions for API calls,
 * ensuring users see clean names while we use specific versions internally.
 * 
 * DATA SOURCES:
 * - Original model IDs: @ai-sdk/google package type definitions (GoogleGenerativeAIModelId type)
 * - Official documentation: https://ai.google.dev/models/gemini
 * - When adding new models, check both sources
 * 
 * This is now the single source of truth for available Gemini models.
 */
const MODEL_ID_MAP: Record<string, ModelMapping> = {
	// Gemini 2.5 series
	'gemini-2.5-pro': {
		modelId: 'gemini-2.5-pro',
		icon: 'gemini',
		tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 1600000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 },
	},
	'gemini-2.5-flash': {
		modelId: 'gemini-2.5-flash',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 },
	},
	// Gemini 2.0 series
	'gemini-2.0-flash': {
		modelId: 'gemini-2.0-flash-001',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 },
	},
	'gemini-2.0-flash-lite': {
		modelId: 'gemini-2.0-flash-lite-001',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 },
	},
	'gemini-2.0-flash-thinking': {
		modelId: 'gemini-2.0-flash-thinking-exp-01-21',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1171712, maxInputTokens: 1048576, maxOutputTokens: 65536, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: true, maxCtx: 1048576 },
	},
	// Gemini 1.5 series
	'gemini-1.5-pro': {
		modelId: 'gemini-1.5-pro-002',
		icon: 'gemini',
		tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 1600000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 },
	},
	'gemini-1.5-flash': {
		modelId: 'gemini-1.5-flash-002',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 },
	},
	'gemini-1.5-flash-8b': {
		modelId: 'gemini-1.5-flash-8b-001',
		icon: 'gemini',
		tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 800000 },
		capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 },
	},
};

/**
 * Get list of available Gemini model IDs.
 * 
 * @returns Array of user-facing model IDs (keys from MODEL_ID_MAP)
 */
export function getKnownGeminiModelIds(): readonly string[] {
	return Object.keys(MODEL_ID_MAP);
}

export interface GeminiChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class GeminiChatService implements LLMProviderService {
	private readonly client: GoogleGenerativeAIProvider;

	constructor(private readonly options: GeminiChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Gemini API key is required');
		}
		this.client = createGoogleGenerativeAI({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? GEMINI_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return 'gemini';
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
		return getKnownGeminiModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || 'gemini',
				modelType: ModelType.LLM,
				tokenLimits: mapping?.tokenLimits ?? this.getModelTokenLimits(modelId),
				capabilities: mapping?.capabilities ?? this.getCapabilitiesForModel(modelId),
			};
		});
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'gemini',
			name: 'Google',
			defaultBaseUrl: GEMINI_DEFAULT_BASE,
			icon: 'google',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Gemini provider does not support embedding generation');
	}

	/**
	 * Get token limits for Gemini models
	 * This method looks up from cached model metadata first, then falls back to static mapping
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		const mapping = MODEL_ID_MAP[model];
		return mapping?.tokenLimits;
	}

	/**
	 * Get capabilities for Gemini model
	 * This method looks up from cached model metadata first, then falls back to static mapping
	 */
	private getCapabilitiesForModel(modelId: string): ModelCapabilities {
		const mapping = MODEL_ID_MAP[modelId];
		if (mapping?.capabilities) {
			return mapping.capabilities;
		}

		return mapping?.capabilities ?? {
			vision: true,
			pdfInput: true,
			tools: true,
			webSearch: false,
			reasoning: false,
			maxCtx: mapping?.tokenLimits?.maxInputTokens ?? mapping?.tokenLimits?.maxTokens,
		};
	}
}

