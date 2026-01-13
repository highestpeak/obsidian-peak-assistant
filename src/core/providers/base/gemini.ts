import {
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from '@ai-sdk/google';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { LLMRequest, LLMResponse, LLMStreamEvent } from '../types';
import { LanguageModel } from 'ai';

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Model mapping interface containing both the actual API model ID and the icon identifier.
 */
interface ModelMapping {
	/** Actual API model ID to use for API calls */
	modelId: string;
	/** Icon identifier for UI display, compatible with @lobehub/icons ModelIcon component */
	icon: string;
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
	'gemini-2.5-pro': { modelId: 'gemini-2.5-pro', icon: 'gemini' },
	'gemini-2.5-flash': { modelId: 'gemini-2.5-flash', icon: 'gemini' },
	// Gemini 2.0 series
	'gemini-2.0-flash': { modelId: 'gemini-2.0-flash-001', icon: 'gemini' },
	// Gemini 1.5 series
	'gemini-1.5-pro': { modelId: 'gemini-1.5-pro-002', icon: 'gemini' },
	'gemini-1.5-flash': { modelId: 'gemini-1.5-flash-002', icon: 'gemini' },
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

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.client(this.normalizeModelId(request.model)) as unknown as LanguageModel, request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.client(this.normalizeModelId(request.model)) as unknown as LanguageModel, request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Return model IDs from MODEL_ID_MAP
		return getKnownGeminiModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || 'gemini',
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
}

