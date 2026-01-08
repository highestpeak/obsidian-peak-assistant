import { ChatRole } from '@/service/chat/types';
import { AIStreamEvent } from './types-events';
import { LanguageModelUsage } from 'ai';
import { ModelCapabilities } from './model-capabilities';

export interface ProviderConfig {
	enabled?: boolean;
	apiKey?: string;
	baseUrl?: string;
	modelConfigs?: Record<string, ModelConfig>;
	/**
	 * Extra provider-specific options as key-value pairs.
	 * Each provider can read its own options from this field.
	 * @example
	 * // For OpenRouter:
	 * { referer: 'https://example.com', title: 'My App' }
	 * // For Claude:
	 * { maxOutputTokens: 2048 }
	 */
	extra?: Record<string, any>;
}

/**
 * LLM output control settings.
 * These settings control the generation behavior of language models.
 */
export interface LLMOutputControlSettings {
	/**
	 * Temperature setting (0-2).
	 * Higher values make the output more random.
	 * Default: undefined (uses model default)
	 */
	temperature?: number;
	/**
	 * Top-p (nucleus sampling) setting (0-1).
	 * Controls diversity via nucleus sampling.
	 * Default: undefined (uses model default)
	 */
	topP?: number;
	/**
	 * Top-k setting.
	 * Limits the number of top tokens to consider.
	 * Default: undefined (uses model default)
	 */
	topK?: number;
	/**
	 * Presence penalty (-2 to 2).
	 * Penalizes new tokens based on whether they appear in the text so far.
	 * Default: undefined (uses model default)
	 */
	presencePenalty?: number;
	/**
	 * Frequency penalty (-2 to 2).
	 * Penalizes new tokens based on their frequency in the text so far.
	 * Default: undefined (uses model default)
	 */
	frequencyPenalty?: number;
	/**
	 * Max output tokens.
	 * Maximum number of tokens to generate.
	 * Default: undefined (uses model default)
	 */
	maxOutputTokens?: number;
	/**
	 * Reasoning effort setting.
	 * Controls how much reasoning/thinking the model should do.
	 * Options: 'none', 'low', 'medium', 'high'
	 * Default: undefined (uses model default)
	 */
	reasoningEffort?: string;
	/**
	 * Text verbosity setting.
	 * Controls the level of detail in output text.
	 * Options: 'low', 'medium', 'high'
	 * Default: undefined (uses model default)
	 */
	textVerbosity?: string;
}

/**
 * All keys of LLMOutputControlSettings for runtime access
 */
export const LLM_OUTPUT_CONTROL_SETTING_KEYS = {
	temperature: 'temperature',
	topP: 'topP',
	topK: 'topK',
	presencePenalty: 'presencePenalty',
	frequencyPenalty: 'frequencyPenalty',
	maxOutputTokens: 'maxOutputTokens',
	reasoningEffort: 'reasoningEffort',
	textVerbosity: 'textVerbosity',
} as const;

/**
 * Get all LLMOutputControlSettings keys as an array
 */
export function getLLMOutputControlSettingKeys(): (keyof LLMOutputControlSettings)[] {
	return Object.keys(LLM_OUTPUT_CONTROL_SETTING_KEYS) as (keyof LLMOutputControlSettings)[];
}

export interface ModelConfig {
	id: string;
	enabled?: boolean;
}

export type ProviderContentPart =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'document';
			text: string;
			name?: string;
	  }
	| {
			type: 'inline_image';
			mediaType: string;
			data: string;
			alt?: string;
	  }
	| {
			type: 'image_url';
			url: string;
			alt?: string;
	  };

export interface LLMRequest {
	provider: string;
	model: string;
	messages: LLMRequestMessage[];
	/**
	 * LLM output control settings.
	 * If not provided, uses model defaults or model config settings.
	 */
	outputControl?: LLMOutputControlSettings;
}

export interface LLMResponse {
	content: string;
	model: string;
	usage?: LLMUsage;
}

export interface LLMRequestMessage {
	role: ChatRole;
	content: ProviderContentPart[];
}

export type LLMUsage = LanguageModelUsage;

export enum ModelType {
	LLM = 'llm',
	EMBEDDING = 'embedding',
	IMAGE = 'image',
	VIDEO = 'video',
	SOUND = 'sound',
}

export interface ProviderMetaData {
	id: string;
	name: string;
	defaultBaseUrl: string;
	/**
	 * Icon identifier string for @lobehub/icons ProviderIcon component.
	 * This string will be passed directly to ProviderIcon's `provider` prop.
	 * Each provider should return the appropriate provider icon identifier (e.g., 'openai', 'anthropic', 'google', 'openrouter', 'ollama').
	 * The icon mapping logic is centralized in each provider's getProviderMetadata() method.
	 * 
	 * @example
	 * // In provider's getProviderMetadata():
	 * return { id: 'openai', name: 'OpenAI', defaultBaseUrl: '...', icon: 'openai' };
	 * 
	 * // In UI component:
	 * import { ProviderIcon } from '@lobehub/icons';
	 * {metadata.icon && <ProviderIcon provider={metadata.icon} size={20} />}
	 */
	icon?: string;
}

export interface ModelMetaData {
	id: string;
	displayName: string;
	modelType?: ModelType;
	/**
	 * Icon identifier string for @lobehub/icons ModelIcon component.
	 * This string will be passed directly to ModelIcon's `model` prop.
	 * Each provider should return the appropriate model icon identifier (e.g., 'gpt-4.1', 'claude-3-5-sonnet').
	 * The icon mapping logic is centralized in each provider's getAvailableModels() method.
	 * 
	 * @example
	 * // In provider's getAvailableModels():
	 * return [{ id: 'gpt-4.1', displayName: 'GPT-4.1', icon: 'gpt-4.1' }];
	 * 
	 * // In UI component:
	 * import { ModelIcon } from '@lobehub/icons';
	 * {modelInfo.icon && <ModelIcon model={modelInfo.icon} size={16} />}
	 */
	icon?: string;
	releaseTimestamp?: number;
	costInput?: string;
	costOutput?: string;
	/**
	 * Model capabilities (vision, pdfInput, tools, webSearch, etc.)
	 * Should be defined in each provider's getAvailableModels() method.
	 */
	capabilities?: ModelCapabilities;
}

/**
 * Model info with provider information.
 * This is a view object (VO) that combines ProviderModelInfo with provider identifier.
 * Used for displaying models in UI components where provider context is needed.
 */
export type ModelInfoForSwitch = ModelMetaData & {
	provider: string;
};

/**
 * Model metadata with enabled status for settings.
 * Used in provider settings to display models with their enabled/disabled state.
 */
export type ModelInfoForSettings = ModelMetaData & {
	enabled: boolean;
};

export interface LLMProviderService {
	blockChat(request: LLMRequest): Promise<LLMResponse>;
	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent>;
	/**
	 * Get provider ID
	 */
	getProviderId(): string;
	/**
	 * Get list of available models for this provider
	 * Returns empty array if models cannot be fetched or provider doesn't support listing
	 */
	getAvailableModels(): Promise<ModelMetaData[]>;
	/**
	 * Get provider metadata (name and default baseUrl)
	 */
	getProviderMetadata(): ProviderMetaData;
	/**
	 * Generate embeddings for texts.
	 * @param texts - Array of texts to generate embeddings for
	 * @param model - Model identifier for embedding generation
	 * @returns Promise resolving to array of embedding vectors (each is an array of numbers)
	 */
	generateEmbeddings(texts: string[], model: string): Promise<number[][]>;
}
