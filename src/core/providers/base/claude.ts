import {
	LLMResponse,
	LLMRequest,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { generateText, streamText, type LanguageModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';

const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 1024;
const CLAUDE_DEFAULT_BASE = 'https://api.anthropic.com/v1';

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
	'claude-4-opus': { modelId: 'claude-4-opus-20250514', icon: 'claude' },
	'claude-4-sonnet': { modelId: 'claude-4-sonnet-20250514', icon: 'claude' },
	// Claude 3.7 series
	'claude-3-7-sonnet': { modelId: 'claude-3-7-sonnet-20250219', icon: 'claude' },
	// Claude 3.5 series
	'claude-3-5-sonnet': { modelId: 'claude-3-5-sonnet-20241022', icon: 'claude' },
	'claude-3-5-haiku': { modelId: 'claude-3-5-haiku-20241022', icon: 'claude' },
	// Claude 3 series
	'claude-3-opus': { modelId: 'claude-3-opus-20240229', icon: 'claude' },
	'claude-3-sonnet': { modelId: 'claude-3-sonnet-20240229', icon: 'claude' },
	'claude-3-haiku': { modelId: 'claude-3-haiku-20240307', icon: 'claude' },
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
	timeoutMs?: number;
	maxOutputTokens?: number;
	extra?: Record<string, any>;
}

export class ClaudeChatService implements LLMProviderService {
	private readonly client: AnthropicProvider;
	private readonly maxOutputTokens: number;

	constructor(private readonly options: ClaudeChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		this.maxOutputTokens = this.options.maxOutputTokens ?? this.options.extra?.maxOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS;
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

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);
		const normalizedModelId = this.normalizeModelId(request.model);

		const result = await generateText({
			model: this.client(normalizedModelId) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			maxOutputTokens: request.outputControl?.maxOutputTokens ?? this.maxOutputTokens,
		});

		return {
			content: result.text,
			model: result.response.modelId || normalizedModelId,
			usage: result.usage,
		};
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);
		const normalizedModelId = this.normalizeModelId(request.model);

		const result = streamText({
			model: this.client(normalizedModelId) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			maxOutputTokens: request.outputControl?.maxOutputTokens ?? this.maxOutputTokens,
		});

		return streamTextToAIStreamEvents(result, normalizedModelId);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Return model IDs from MODEL_ID_MAP
		return getKnownClaudeModelIds().map((modelId) => {
			const mapping = MODEL_ID_MAP[modelId];
			return {
				id: modelId,
				displayName: modelId,
				icon: mapping?.icon || 'claude',
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
}

