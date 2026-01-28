import { LanguageModelUsage, FinishReason, CallWarning, LanguageModelRequestMetadata, LanguageModelResponseMetadata, ProviderMetadata, StepResult, GeneratedFile, ContentPart, ReasoningOutput, LanguageModel, JSONValue } from 'ai';

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

export interface ModelConfig {
	id: string;
	enabled?: boolean;
	/**
	 * Override display name for custom models
	 */
	displayName?: string;
	/**
	 * Override icon for custom models
	 */
	icon?: string;
	/**
	 * Override token limits (for custom models or when API doesn't provide)
	 */
	tokenLimitsOverride?: ModelTokenLimits;
	/**
	 * Override capabilities (for custom models or when API doesn't provide)
	 */
	capabilitiesOverride?: Partial<ModelCapabilities>;
}

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
	/**
	 * Token limits for this model
	 */
	tokenLimits?: ModelTokenLimits;
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

/**
 * Model capabilities flags
 */
export interface ModelCapabilities {
	/**
	 * Whether the model supports vision (image_url / multimodal image input)
	 */
	vision: boolean;
	/**
	 * Whether the model supports PDF file input
	 */
	pdfInput: boolean;
	/**
	 * Whether the model supports function calling / tools
	 */
	tools: boolean;
	/**
	 * Whether the model supports web search
	 */
	webSearch: boolean;
	/**
	 * Whether the model supports X (Twitter) search (xAI Grok)
	 */
	xSearch?: boolean;
	/**
	 * Whether the model supports news search (xAI Grok)
	 */
	newsSearch?: boolean;
	/**
	 * Whether the model supports RSS feed search (xAI Grok)
	 */
	rssSearch?: boolean;
	/**
	 * Whether the model supports code interpreter (OpenAI, xAI Grok, Claude, Gemini)
	 */
	codeInterpreter?: boolean;
	/**
	 * Whether the model supports image generation (OpenAI)
	 */
	imageGeneration?: boolean;
	/**
	 * Whether the model supports reasoning output (OpenAI reasoning models)
	 */
	reasoning?: boolean;
	/**
	 * Maximum context window size in tokens (e.g., 200000, 400000, 1000000)
	 * Used for displaying context size badge (200K, 400K, 1M)
	 */
	maxCtx?: number;
}

/**
 * Token limits for a model, providing detailed token constraints
 */
export interface ModelTokenLimits {
	/**
	 * Maximum total context window in tokens (input + output)
	 */
	maxTokens?: number;
	/**
	 * Maximum input tokens allowed
	 */
	maxInputTokens?: number;
	/**
	 * Maximum output tokens allowed
	 */
	maxOutputTokens?: number;
	/**
	 * Recommended safe context window size for summarization (typically 80-90% of maxTokens)
	 */
	recommendedSummaryThreshold?: number;
}

/**
 * Resolve model capabilities from model metadata.
 * Capabilities should be defined in each provider's getAvailableModels() method.
 * Returns default (all false) if not provided.
 */
export function resolveModelCapabilities(model?: { capabilities?: ModelCapabilities }): ModelCapabilities {
	if (model?.capabilities) {
		return {
			vision: model.capabilities.vision ?? false,
			pdfInput: model.capabilities.pdfInput ?? false,
			tools: model.capabilities.tools ?? false,
			webSearch: model.capabilities.webSearch ?? false,
			xSearch: model.capabilities.xSearch ?? false,
			newsSearch: model.capabilities.newsSearch ?? false,
			rssSearch: model.capabilities.rssSearch ?? false,
			codeInterpreter: model.capabilities.codeInterpreter ?? false,
			imageGeneration: model.capabilities.imageGeneration ?? false,
			reasoning: model.capabilities.reasoning ?? false,
			maxCtx: model.capabilities.maxCtx,
		};
	}

	// Return default capabilities if not provided
	// Providers should define capabilities in their getAvailableModels() method
	return {
		vision: false,
		pdfInput: false,
		tools: false,
		webSearch: false,
		xSearch: false,
		newsSearch: false,
		rssSearch: false,
		codeInterpreter: false,
		imageGeneration: false,
		reasoning: false,
		maxCtx: undefined,
	};
}

export interface LLMProviderService {
	blockChat(request: LLMRequest<any>): Promise<LLMResponse>;
	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent>;
	/**
	 * Get provider ID
	 */
	getProviderId(): string;
	/**
	 * Get model client for this provider
	 */
	modelClient(model: string): LanguageModel;
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
	/**
	 * Get token limits for a specific model
	 * @param model - Model identifier
	 * @returns Token limits for the model, or undefined if not available
	 */
	getModelTokenLimits(model: string): ModelTokenLimits | undefined;
}

export type LLMRequest<TOOLS extends any = any> = {
	provider: string;
	model: string;
	system?: string;
	messages: LLMRequestMessage[];
	/**
	 * LLM output control settings.
	 * If not provided, uses model defaults or model config settings.
	 */
	outputControl?: LLMOutputControlSettings;
	abortSignal?: AbortSignal;
	toolChoice?: 'auto' | 'none' | 'required' | {
		type: 'tool';
		toolName: string;
	};
	tools?: {
		[key: string]: TOOLS;
	};
};

export type ChatRole = 'user' | 'assistant' | 'system';

export interface LLMRequestMessage {
	role: ChatRole;
	content: MessagePart[];
}

/**
Data content. Can either be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
 */
type DataContent = string | Uint8Array | ArrayBuffer | Buffer;

export type ToolResultOutput = { type: 'text'; value: string; }
| { type: 'json'; value: JSONValue; }
| { type: 'content'; value: Array<{ type: 'text'; text: string; }> }

/**
 * inspire by ai-sdk's ModelMessage.
 * use for both request and response.
 */
export type MessagePart =
	| {
		type: 'text';
		text: string;
	}
	| {
		type: 'image';
		data: DataContent | URL;
		/**
		 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
		 */
		mediaType: string;
	}
	| {
		type: 'file';
		data: DataContent | URL;
		/**
		 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
		 */
		mediaType: string;
		filename?: string;
	}
	// maybe only assistant message. -- or system message.
	// we need to persist the process text. so we define the type here.
	| {
		type: 'reasoning';
		text: string;
	}
	| {
		type: 'tool-call';
		toolCallId?: string;
		toolName: string;
		input: any;
		providerExecuted?: boolean;
	}
	| {
		type: 'tool-result';
		toolCallId: string;
		toolName: string;
		output: ToolResultOutput;
	}
	;

export type LLMUsage = LanguageModelUsage;

type RawStreamEvent =
	// from AI-SDK StreamTextOnChunkCallback types
	{ type: 'text-delta'; text: string; } |
	{ type: 'reasoning-delta'; text: string; } |
	({ type: 'source'; } | LLMResponseSource) |
	{ type: 'tool-call'; id?: string; toolName: string; input?: any; } |
	{ type: 'tool-input-start'; id?: string; toolName: string; } |
	{ type: 'tool-input-delta'; id?: string; delta: string; } |
	{ type: 'tool-result'; id?: string; toolName: string; input?: any; output?: any; } |
	// from project usage
	{ type: 'on-step-finish'; text: string, finishReason: FinishReason, usage: LLMUsage } |
	{ type: 'complete'; usage: LLMUsage, finishReason: FinishReason, durationMs?: number, result?: any } |
	{ type: 'error'; error: Error, durationMs?: number } |
	{ type: 'unSupported'; chunk: any, comeFrom?: string } |
	// from prompt service
	{ type: 'prompt-stream-start'; id?: string; promptId: string; variables?: any; } |
	{ type: 'prompt-stream-delta'; id?: string; promptId: string; delta?: string; } |
	{ type: 'prompt-stream-result'; id?: string; promptId: string; output?: any; } | 
	// for debug purpose.
	{ type: 'pk-debug'; debugName: string; }
	;

export type LLMStreamEvent =
	RawStreamEvent & {
		// some times we need to pass stream trigger name to the event.
		// as we may manual control the loop process.
		triggerName?: StreamTriggerName;
		extra? : any;
	};

export enum StreamTriggerName {
	SEARCH_THOUGHT_AGENT = 'search-thought-agent',
	SEARCH_INSPECTOR_AGENT = 'search-inspector-agent',
	SEARCH_SUMMARY = 'search-summary',
}

export enum ToolEvent {
	BUILD_CONTEXT_MESSAGES = 'build-context-messages',
	LOAD_SYSTEM_PROMPT = 'load-system-prompt',
	LOAD_USER_PROFILE = 'load-user-profile',
	BUILD_CONTEXT_MEMORY = 'build-context-memory',
	PROCESS_MESSAGES = 'process-messages',
	CONVERT_IMAGE = 'convert-image',
	COMPLETE = 'complete',
	COLLECT_RECENT_MESSAGES = "COLLECT_RECENT_MESSAGES",
	GENERATE_SUMMARY = "GENERATE_SUMMARY",

	// search agent
	summary_context_messages = 'summary_context_messages',
}

/**
 * for some built in process stage. like summary image and pdf. use multiple chat access. we need returen the stage by tool-call.
 * export type ProgressStage =
	| 'image_upload'
	| 'image_summary'
	| 'pdf_upload'
	| 'pdf_parse'
	| 'resource_summary'
	| 'tools_enable'
	| 'codeinterpreter_enable';

 */

/**
 * Copy from AI SDK's GenerateTextResult & StreamTextResult
 */
export type LLMResponse = {
	/**
	 * The content that was generated in the last step.
	 */
	content: Array<ContentPart<any>>;
	/**
	 * The text that was generated in the last step.
	 */
	text: string;
	/**
	 * The full reasoning that the model has generated in the last step.
	 */
	reasoning: Array<ReasoningOutput>;
	/**
	 * The reasoning text that the model has generated in the last step. Can be undefined if the model
	 * has only generated text.
	 */
	reasoningText: string | undefined;
	/**
	 * The files that were generated in the last step.
	 * Empty array if no files were generated.
	 */
	files: Array<GeneratedFile>;
	/**
	 * Sources that have been used as references in the last step.
	 */
	sources: Array<LLMResponseSource>;
	/**
	 * The tool calls that were made in the last step.
	 */
	toolCalls: Array<any>;
	/**
	 * The results of the tool calls from the last step.
	 */
	toolResults: Array<any>;
	/**
	 * The reason why the generation finished.
	 */
	finishReason: FinishReason;
	/**
	 * The token usage of the last step.
	 */
	usage: LanguageModelUsage;
	/**
	 * The total token usage of all steps.
	 * When there are multiple steps, the usage is the sum of all step usages.
	 */
	totalUsage: LanguageModelUsage;
	/**
	 * Warnings from the model provider (e.g. unsupported settings)
	 */
	warnings: CallWarning[] | undefined;
	/**
	 * Additional request information.
	 */
	request: LanguageModelRequestMetadata;
	/**
	 * Additional response information.
	 */
	response: LanguageModelResponseMetadata & {
		/**
		 * The response messages that were generated during the call. It consists of an assistant message,
		 * potentially containing tool calls.
		 *
		 * When there are tool results, there is an additional tool message with the tool results that are available.
		 * If there are tools that do not have execute functions, they are not included in the tool results and
		 * need to be added separately.
		 */
		messages: Array<any>;
		/**
		 * Response body (available only for providers that use HTTP requests).
		 */
		body?: unknown;
	};
	/**
	 * Additional provider-specific metadata. They are passed through
	 * from the provider to the AI SDK and enable provider-specific
	 * results that can be fully encapsulated in the provider.
	 */
	providerMetadata: ProviderMetadata | undefined;
	/**
	 * Details for all steps.
	 * You can use this to get information about intermediate steps,
	 * such as the tool calls or the response headers.
	 */
	steps: Array<StepResult<any>>;
};

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
	/**
	 * Total timeout for the entire LLM call including all steps.
	 * In milliseconds. Default: undefined (no timeout)
	 */
	timeoutTotalMs?: number;
	/**
	 * Timeout for each individual step (LLM call).
	 * In milliseconds. Default: undefined (no timeout)
	 */
	timeoutStepMs?: number;
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
	timeoutTotalMs: 'timeoutTotalMs',
	timeoutStepMs: 'timeoutStepMs',
} as const;

/**
 * Get all LLMOutputControlSettings keys as an array
 */
export function getLLMOutputControlSettingKeys(): (keyof LLMOutputControlSettings)[] {
	return Object.keys(LLM_OUTPUT_CONTROL_SETTING_KEYS) as (keyof LLMOutputControlSettings)[];
}

/**
 * Copy from AI SDK's Source: LanguageModelV3Source
 */
export type LLMResponseSource = {
	type: 'source';
	/**
	 * The type of source - URL sources reference web content.
	 */
	sourceType: 'url';
	/**
	 * The ID of the source.
	 */
	id: string;
	/**
	 * The URL of the source.
	 */
	url: string;
	/**
	 * The title of the source.
	 */
	title?: string;
	/**
	 * Additional provider metadata for the source.
	 */
	providerMetadata?: Record<string, any>;
} | {
	type: 'source';
	/**
	 * The type of source - document sources reference files/documents.
	 */
	sourceType: 'document';
	/**
	 * The ID of the source.
	 */
	id: string;
	/**
	 * IANA media type of the document (e.g., 'application/pdf').
	 */
	mediaType: string;
	/**
	 * The title of the document.
	 */
	title: string;
	/**
	 * Optional filename of the document.
	 */
	filename?: string;
	/**
	 * Additional provider metadata for the source.
	 */
	providerMetadata?: Record<string, any>;
};