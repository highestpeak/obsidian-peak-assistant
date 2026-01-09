import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
} from '../types';
import { createPerplexity, type PerplexityProvider } from '@ai-sdk/perplexity';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';

const DEFAULT_PERPLEXITY_TIMEOUT_MS = 60000;
const PERPLEXITY_DEFAULT_BASE = 'https://api.perplexity.ai';

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
	'sonar-deep-research': { modelId: 'sonar-deep-research', icon: 'perplexity' },
	'sonar-reasoning-pro': { modelId: 'sonar-reasoning-pro', icon: 'perplexity' },
	'sonar-reasoning': { modelId: 'sonar-reasoning', icon: 'perplexity' },
	'sonar-pro': { modelId: 'sonar-pro', icon: 'perplexity' },
	'sonar': { modelId: 'sonar', icon: 'perplexity' },
};

/**
 * Get list of available Perplexity model IDs.
 *
 * @returns Array of user-facing model IDs (keys from MODEL_ID_MAP)
 */
export function getKnownPerplexityModelIds(): readonly string[] {
	return Object.keys(MODEL_ID_MAP);
}

interface PerplexityModelResponse {
	object: string;
	data: Array<{
		id: string;
		object: string;
		created: number;
		owned_by: string;
	}>;
}

/**
 * Format model display name from model ID
 */
function formatModelDisplayName(modelId: string): string {
	let displayName = modelId;
	
	// Handle pplx models
	if (displayName.startsWith('pplx-')) {
		displayName = displayName.replace('pplx-', 'Perplexity ');
		// Convert to title case after the prefix
		displayName = displayName.replace(/-([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		displayName = displayName.replace(/^([a-z])/g, (_, letter) => letter.toUpperCase());
		return displayName;
	}
	
	// Handle llama-3-sonar models
	if (displayName.includes('llama-3-sonar')) {
		displayName = displayName.replace('llama-3-sonar-', 'Llama 3 Sonar ');
		displayName = displayName.replace(/-([a-z])/g, (_, letter) => ` ${letter.toUpperCase()}`);
		displayName = displayName.replace(/^([a-z])/g, (_, letter) => letter.toUpperCase());
		return displayName;
	}
	
	// For other models, capitalize first letter if needed
	if (displayName.length > 0 && displayName[0] !== displayName[0].toUpperCase()) {
		displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
	}
	
	return displayName;
}

/**
 * Fetch models from Perplexity API
 * @internal This function is reserved for future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchPerplexityModels(
	baseUrl?: string,
	apiKey?: string,
	timeoutMs?: number
): Promise<ModelMetaData[] | null> {
	if (!apiKey) {
		return null;
	}

	try {
		const url = baseUrl ?? PERPLEXITY_DEFAULT_BASE;
		const apiUrl = `${url}/models`;

		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_PERPLEXITY_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
		}

		const data: PerplexityModelResponse = await response.json();

		if (!data.data || !Array.isArray(data.data)) {
			throw new Error('Invalid response format: data array not found');
		}

		// Convert API response to ModelMetaData format
		return data.data.map((model) => {
			const displayName = formatModelDisplayName(model.id);

			return {
				id: model.id,
				displayName,
				icon: 'perplexity',
			};
		});
	} catch (error) {
		console.error('[PerplexityChatService] Error fetching models:', error);
		return null;
	}
}

export interface PerplexityChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
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
		return 'perplexity';
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
		return getKnownPerplexityModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || 'perplexity',
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
}

