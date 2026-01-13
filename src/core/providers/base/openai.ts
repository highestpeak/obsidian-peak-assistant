import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
} from '../types';
import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { embedMany, type EmbeddingModel, type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

/**
 * Model mapping interface containing both the actual API model ID and the icon identifier.
 */
interface ModelMapping {
	/** Actual API model ID to use for API calls (may include date suffix for AI SDK 5 v2 compatibility) */
	modelId: string;
	/** Icon identifier for UI display, compatible with @lobehub/icons ModelIcon component */
	icon: string;
}

/**
 * Map user-facing model IDs (without date suffixes) to actual API model IDs and icons.
 * 
 * DESIGN EVOLUTION:
 * 
 * Initially, we maintained a complete list (KNOWN_OPENAI_CHAT_MODELS) that included both
 * dated and undated versions of models, extracted from @ai-sdk/openai type definitions.
 * This list was used directly for getAvailableModels(), showing users all variants including
 * date suffixes like 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06', etc.
 * 
 * However, this approach had drawbacks:
 * 1. Users don't need to see date suffixes - they just want to select "gpt-4o"
 * 2. AI SDK 5 requires v2 specification models (typically dated versions), so we need mapping
 * 3. Maintaining two separate lists (known models + mapping) was redundant and error-prone
 * 
 * CURRENT APPROACH:
 * 
 * We now use a simplified, unified mapping structure:
 * - User-facing IDs (keys): Clean names without date suffixes (e.g., 'gpt-4o', 'gpt-5-mini')
 * - API model IDs (modelId): Actual model IDs to use for API calls, with date suffixes when needed
 * - Icons (icon): Icon identifiers for UI display (e.g., 'gpt-4', 'gpt-5', 'o1')
 * 
 * RULES:
 * - For models requiring v2 specification (AI SDK 5): Map to dated versions (e.g., 'gpt-5-mini' -> 'gpt-5-mini-2025-08-07')
 * - For models that work without dates: Map to themselves (e.g., 'gpt-4-turbo-preview' -> 'gpt-4-turbo-preview')
 * - Always use the latest dated version available when mapping is needed
 * - Icons follow series grouping: o1/o3/o4 -> 'o1', gpt-4 variants -> 'gpt-4', gpt-5 -> 'gpt-5', etc.
 * 
 * DATA SOURCES:
 * - Original model IDs: @ai-sdk/openai package type definitions (OpenAIChatModelId type)
 * - Official documentation: https://platform.openai.com/docs/models
 * - When adding new models, check both sources and use the latest dated version for v2 compatibility
 * 
 * This is now the single source of truth for available OpenAI models, replacing the previous
 * KNOWN_OPENAI_CHAT_MODELS constant. The mapping handles both API compatibility and user experience.
 */
const MODEL_ID_MAP: Record<string, ModelMapping> = {
	// O1 series
	'o1': { modelId: 'o1-2024-12-17', icon: 'o1' },
	'o1-mini': { modelId: 'o1-mini-2024-09-12', icon: 'o1' },
	// O3 series
	'o3-mini': { modelId: 'o3-mini-2025-01-31', icon: 'o1' },
	'o3': { modelId: 'o3-2025-04-16', icon: 'o1' },
	// O4 series
	'o4-mini': { modelId: 'o4-mini-2025-04-16', icon: 'o1' },
	// GPT-5 series
	'gpt-5': { modelId: 'gpt-5-2025-08-07', icon: 'gpt-5' },
	'gpt-5-mini': { modelId: 'gpt-5-mini-2025-08-07', icon: 'gpt-5' },
	'gpt-5-nano': { modelId: 'gpt-5-nano-2025-08-07', icon: 'gpt-5' },
	// GPT-4.1 series
	'gpt-4.1': { modelId: 'gpt-4.1-2025-04-14', icon: 'gpt-4' },
	'gpt-4.1-mini': { modelId: 'gpt-4.1-mini-2025-04-14', icon: 'gpt-4' },
	'gpt-4.1-nano': { modelId: 'gpt-4.1-nano-2025-04-14', icon: 'gpt-4' },
	// GPT-4o series
	'gpt-4o': { modelId: 'gpt-4o-2024-11-20', icon: 'gpt-4' },
	'gpt-4o-mini': { modelId: 'gpt-4o-mini-2024-07-18', icon: 'gpt-4' },
	// GPT-4 series
	'gpt-4-turbo': { modelId: 'gpt-4-turbo-2024-04-09', icon: 'gpt-4' },
	'gpt-4': { modelId: 'gpt-4', icon: 'gpt-4' },
	// GPT-4.5 series
	'gpt-4.5': { modelId: 'gpt-4.5-preview-2025-02-27', icon: 'gpt-4' },
	// GPT-3.5 series
	'gpt-3.5-turbo': { modelId: 'gpt-3.5-turbo', icon: 'gpt-3.5' },
};

/**
 * Get list of available OpenAI model IDs (user-facing IDs without date suffixes).
 * These are the clean model names that users see in the UI (e.g., 'gpt-4o', not 'gpt-4o-2024-11-20').
 * 
 * @returns Array of user-facing model IDs (keys from MODEL_ID_MAP)
 */
export function getKnownOpenAIModelIds(): readonly string[] {
	return Object.keys(MODEL_ID_MAP);
}


/**
 * Get icon identifier for a model ID by looking up in MODEL_ID_MAP.
 * Used by UI components (e.g., @lobehub/icons ModelIcon) to display the correct icon.
 * 
 * @param modelId - User-facing model ID
 * @returns Icon identifier from MODEL_ID_MAP, or modelId as fallback
 */
export function getOpenAIAvatarType(modelId: string): string {
	return MODEL_ID_MAP[modelId]?.icon || modelId;
}

export interface OpenAIChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class OpenAIChatService implements LLMProviderService {
	private readonly client: OpenAIProvider;

	constructor(private readonly options: OpenAIChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('OpenAI API key is required');
		}
		this.client = createOpenAI({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? OPENAI_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return 'openai';
	}

	/**
	 * Normalize user-facing model ID to actual API model ID by looking up in MODEL_ID_MAP.
	 * This handles the mapping from clean names (e.g., 'gpt-5-mini') to dated versions
	 * required by AI SDK 5 v2 specification (e.g., 'gpt-5-mini-2025-08-07').
	 *
	 * @param modelId - User-facing model ID (may be from user selection or API response)
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
		// Return model IDs from MODEL_ID_MAP (user-facing IDs without date suffixes)
		return getKnownOpenAIModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || modelId,
			};
		});
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'openai',
			name: 'OpenAI',
			defaultBaseUrl: OPENAI_DEFAULT_BASE,
			icon: 'openai',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		const result = await embedMany({
			model: this.client.textEmbeddingModel(model) as unknown as EmbeddingModel,
			values: texts,
		});

		return result.embeddings;
	}
}
