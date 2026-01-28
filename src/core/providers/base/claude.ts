import {
	LLMResponse,
	LLMRequest,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ModelCapabilities,
	ModelType,
} from '../types';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';

const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 4096;
const CLAUDE_DEFAULT_BASE = 'https://api.anthropic.com/v1';

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
 * Initially, we maintained a complete list (KNOWN_CLAUDE_CHAT_MODELS) that included all
 * Claude model IDs, extracted from @ai-sdk/anthropic type definitions. This list was used
 * directly for getAvailableModels().
 * 
 * CURRENT APPROACH:
 * 
 * We now use a unified mapping structure for consistency with other providers:
 * - User-facing IDs (keys): Clean names without date suffixes (e.g., 'claude-3-5-sonnet', not 'claude-3-5-sonnet-20241022')
 * - API model IDs (modelId): Actual model IDs with date suffixes (latest versions)
 * - Icons (icon): All Claude models use 'claude' icon
 * 
 * Similar to OpenAI, we map user-friendly names to the latest dated versions for API calls,
 * ensuring users see clean names while we use specific versions internally.
 * 
 * DATA SOURCES:
 * - Original model IDs: @ai-sdk/anthropic package type definitions (AnthropicMessagesModelId type)
 * - Official documentation: https://docs.anthropic.com/claude/docs/models-overview
 * - When adding new models, check both sources
 * 
 * This is now the single source of truth for available Claude models.
 */
const MODEL_ID_MAP: Record<string, ModelMapping> = {
	// Claude 4 series
	'claude-4-opus': {
		modelId: 'claude-4-opus-20250514',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	'claude-4-sonnet': {
		modelId: 'claude-4-sonnet-20250514',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	// Claude 3.7 series
	'claude-3-7-sonnet': {
		modelId: 'claude-3-7-sonnet-20250219',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	// Claude 3.5 series
	'claude-3-5-sonnet': {
		modelId: 'claude-3-5-sonnet-20241022',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	'claude-3-5-haiku': {
		modelId: 'claude-3-5-haiku-20241022',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	// Claude 3 series
	'claude-3-opus': {
		modelId: 'claude-3-opus-20240229',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	'claude-3-sonnet': {
		modelId: 'claude-3-sonnet-20240229',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
	'claude-3-haiku': {
		modelId: 'claude-3-haiku-20240307',
		icon: 'claude',
		tokenLimits: { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 },
		capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 200000 },
	},
};

/**
 * Get list of available Claude model IDs.
 * 
 * @returns Array of user-facing model IDs (keys from MODEL_ID_MAP)
 */
export function getKnownClaudeModelIds(): readonly string[] {
	return Object.keys(MODEL_ID_MAP);
}

export interface ClaudeChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class ClaudeChatService implements LLMProviderService {
	private readonly client: AnthropicProvider;

	constructor(private readonly options: ClaudeChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		this.client = createAnthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? CLAUDE_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return 'claude';
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
		// Return models from our static MODEL_ID_MAP
		return getKnownClaudeModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping.icon,
				modelType: ModelType.LLM,
				tokenLimits: mapping.tokenLimits,
				capabilities: mapping.capabilities,
			};
		});
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'claude',
			name: 'Anthropic',
			defaultBaseUrl: CLAUDE_DEFAULT_BASE,
			icon: 'anthropic',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Claude provider does not support embedding generation');
	}

	/**
	 * Get token limits for Claude models
	 * This method looks up from our static MODEL_ID_MAP
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		// Try exact match first
		const mapping = MODEL_ID_MAP[model];
		if (mapping?.tokenLimits) {
			return mapping.tokenLimits;
		}

		// Try partial match (for dated versions)
		for (const [key, value] of Object.entries(MODEL_ID_MAP)) {
			if (model.includes(key) || key.includes(model.split('-').slice(0, 3).join('-'))) {
				if (value.tokenLimits) {
					return value.tokenLimits;
				}
			}
		}

		// Default for unknown Claude models
		return { maxTokens: 200000, maxInputTokens: 200000, recommendedSummaryThreshold: 150000 };
	}
}

