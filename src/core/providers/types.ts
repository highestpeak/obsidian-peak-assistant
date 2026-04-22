// ── Standalone type definitions (formerly re-exported from 'ai') ──────────────

/** JSON-safe value type. */
export type JSONValue = null | string | number | boolean | JSONValue[] | { [key: string]: JSONValue };

/** Reason the generation finished. */
export type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

/**
 * Token usage counters.
 * Field semantics match the Vercel AI SDK LanguageModelUsage so downstream
 * code that already handles these fields continues to work unchanged.
 */
export interface LanguageModelUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
}

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
	 * Icon identifier for UI (provider icon).
	 * This string will be passed directly to ProviderIcon's `provider` prop.
	 * Each provider should return the appropriate provider icon identifier (e.g., 'openai', 'anthropic', 'google', 'openrouter', 'ollama').
	 * The icon mapping logic is centralized in each provider's getProviderMetadata() method.
	 * 
	 * @example
	 * // In provider's getProviderMetadata():
	 * return { id: 'openai', name: 'OpenAI', defaultBaseUrl: '...', icon: 'openai' };
	 * 
	 * // In UI component:
	 * Rendered by SafeProviderIcon (lucide Server icon).
	 * {metadata.icon && <ProviderIcon provider={metadata.icon} size={20} />}
	 */
	icon?: string;
}

export interface ModelMetaData {
	id: string;
	displayName: string;
	modelType?: ModelType;
	/**
	 * Icon identifier for UI (model icon).
	 * This string will be passed directly to ModelIcon's `model` prop.
	 * Each provider should return the appropriate model icon identifier (e.g., 'gpt-4.1', 'claude-3-5-sonnet').
	 * The icon mapping logic is centralized in each provider's getAvailableModels() method.
	 * 
	 * @example
	 * // In provider's getAvailableModels():
	 * return [{ id: 'gpt-4.1', displayName: 'GPT-4.1', icon: 'gpt-4.1' }];
	 * 
	 * // In UI component:
	 * Rendered by SafeModelIcon (lucide Bot icon).
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

export interface ProviderOptionsConfig {
	noReasoning?: boolean;
	reasoningEffort?: 'low' | 'medium' | 'high';
}

export type ProviderOptions = Record<string, Record<string, JSONValue>>;

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

export function emptyUsage(): LLMUsage {
	return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

const EMPTY_USAGE: LLMUsage = emptyUsage();

/** Merges two usage objects; treats undefined/null as zero usage. */
export function mergeTokenUsage(usage1?: LLMUsage | null, usage2?: LLMUsage | null): LLMUsage {
	const u1 = usage1 ?? EMPTY_USAGE;
	const u2 = usage2 ?? EMPTY_USAGE;
	return {
		inputTokens: (u1.inputTokens ?? 0) + (u2.inputTokens ?? 0) || undefined,
		outputTokens: (u1.outputTokens ?? 0) + (u2.outputTokens ?? 0) || undefined,
		totalTokens: (u1.totalTokens ?? 0) + (u2.totalTokens ?? 0) || undefined,
		reasoningTokens: (u1.reasoningTokens ?? 0) + (u2.reasoningTokens ?? 0) || undefined,
		cachedInputTokens: (u1.cachedInputTokens ?? 0) + (u2.cachedInputTokens ?? 0) || undefined,
	};
}

type RawStreamEvent =
	// from AI-SDK StreamTextOnChunkCallback types
	{ type: 'text-start'; } |
	{ type: 'text-delta'; text: string; } |
	{ type: 'text-end'; } |
	{ type: 'reasoning-start'; } |
	{ type: 'reasoning-delta'; text: string; } |
	{ type: 'reasoning-end'; } |
	({ type: 'source'; } | LLMResponseSource) |
	{ type: 'tool-call'; id?: string; toolName: string; input?: any; } |
	{ type: 'tool-input-start'; id?: string; toolName: string; } |
	{ type: 'tool-input-delta'; id?: string; delta: string; } |
	{ type: 'tool-result'; id?: string; toolName: string; input?: any; output?: any; } |
	// from project usage
	{ type: 'on-step-start'; text?: string; } |
	{ type: 'on-step-finish'; text: string, finishReason: FinishReason, usage: LLMUsage, durationMs?: number, result?: any } |
	{ type: 'complete'; usage: LLMUsage, finishReason: FinishReason, durationMs?: number, result?: any } |
	{ type: 'error'; error: Error, durationMs?: number } |
	{ type: 'unSupported'; chunk: any, comeFrom?: string } |
	// from prompt service
	{ type: 'prompt-stream-start'; id?: string; promptId: string; variables?: any; } |
	{ type: 'prompt-stream-delta'; id?: string; promptId: string; delta?: string; } |
	{ type: 'prompt-stream-result'; id?: string; promptId: string; output?: any; usage?: LLMUsage } |
	// from vault agent
	{ type: 'hitl-pause'; } |
	{ type: 'phase-transition'; } |
	// for debug purpose.
	{ type: 'pk-debug'; debugName: string; extra?: any; triggerName?: StreamTriggerName; triggerTimestamp?: number; };

/**
 * UI stream events: two complementary tracks (do not conflict; both are needed).
 *
 * 1) ui-step / ui-step-delta — Timeline events (log / progress narration).
 *    - Drive the Steps list UI: persistent rows with progress, timestamps, nesting.
 *    - Semantics: "what I am doing" (user-facing, durable as conversation history).
 *
 * 2) ui-signal — Component control signals (action / command).
 *    - Drive specific UI components: Graph canvas, Dashboard, Toast, etc.
 *    - Semantics: "do this now" (ephemeral: animate, apply patch, change state).
 *    - Subscribers filter by channel (e.g. channel === 'graph'); kind + payload are component-specific.
 */
export type RawUIStreamEvent =
	{ type: 'ui-step'; uiType: UIStepType, stepId: string; title: string; description?: string; } |
	{ type: 'ui-step-delta'; uiType: UIStepType, stepId: string; titleDelta?: string; descriptionDelta?: string; } |
	{
		type: 'ui-signal';
		channel: UISignalChannel;
		kind: UISignalKind;
		entityId: string;
		id?: string;
		payload?: any;
		/**
		 * legacy field for better code maintainability.
		 */
		stepId?: string;
	} |
	/** Progress of parallel merged streams: how many of the N streams have completed. */
	{ type: 'parallel-stream-progress'; completed: number; total: number; completedIndices?: number[] };

/** Agent loop stream events (plan progress, stats, debug). */
export type AgentStreamEvent =
	{ type: 'agent-step-progress'; stepLabel: string; detail: string; taskIndex?: number; } |
	{ type: 'agent-stats'; stats: any; };

export type LLMStreamEvent =
	(RawStreamEvent | RawUIStreamEvent | AgentStreamEvent) & {
		// some times we need to pass stream trigger name to the event.
		// as we may manual control the loop process.
		triggerName?: StreamTriggerName;
		/**
		 * The timestamp of the trigger event.
		 */
		triggerTimestamp?: number;
		extra?: any;
	};

export enum StreamTriggerName {
	SEARCH_AI_AGENT = 'search-ai-agent',
	SEARCH_RAW_AGENT = 'search-raw-agent',
	SEARCH_RAW_AGENT_RECON = 'search-raw-agent-recon',
	SEARCH_RAW_AGENT_RECON_PLAN_STEP = 'search-raw-agent-recon-plan-step',
	SEARCH_RAW_AGENT_RECON_PATH_SUBMIT_STEP = 'search-raw-agent-recon-path-submit-step',
	/** Hub discovery: structured folder intuition round (generateObject). */
	HUB_DISCOVERY_FOLDER_ROUND_STRUCTURE = 'hub-discovery-folder-round-structure',
	/** Hub discovery: structured folder deepen after explore_folder. */
	HUB_DISCOVERY_FOLDER_DEEPEN_STRUCTURE = 'hub-discovery-folder-deepen-structure',
	/** Hub discovery: folder recon manual loop — plan step (streamText + tools). */
	HUB_DISCOVERY_FOLDER_RECON_PLAN = 'hub-discovery-folder-recon-plan',
	/** Hub discovery: folder recon — structured submit after plan + tools. */
	HUB_DISCOVERY_FOLDER_RECON_SUBMIT = 'hub-discovery-folder-recon-submit',
	/** Hub discovery: document recon manual loop — plan step. */
	HUB_DISCOVERY_DOCUMENT_RECON_PLAN = 'hub-discovery-document-recon-plan',
	/** Hub discovery: document recon — structured submit. */
	HUB_DISCOVERY_DOCUMENT_RECON_SUBMIT = 'hub-discovery-document-recon-submit',
	/** Knowledge intuition: plan step (streamText + tools). */
	KNOWLEDGE_INTUITION_PLAN = 'knowledge-intuition-plan',
	/** Knowledge intuition: structured submit. */
	KNOWLEDGE_INTUITION_SUBMIT = 'knowledge-intuition-submit',
	SEARCH_RAW_AGENT_TASK_CONSOLIDATOR = 'search-raw-agent-task-consolidator',
	SEARCH_RAW_AGENT_EVIDENCE = 'search-raw-agent-evidence',
	SEARCH_SLOT_RECALL_AGENT = 'search-slot-recall-agent',
	SEARCH_SOURCES_FROM_VERIFIED_PATHS = 'search-sources-from-verified-paths',
	SEARCH_DASHBOARD_UPDATE_AGENT = 'search-dashboard-update-agent',
	SEARCH_TOPICS_AGENT = 'search-topics-agent',
	SEARCH_FINAL_REFINE_AGENT = 'search-final-refine-agent',
	SEARCH_SUMMARY = 'search-summary',
	SEARCH_TITLE = 'search-title',
	SEARCH_OVERVIEW_MERMAID = 'search-overview-mermaid',
	SEARCH_REPORT_PLAN_AGENT = 'search-report-plan-agent',
	SEARCH_VISUAL_BLUEPRINT_AGENT = 'search-visual-blueprint-agent',
	SEARCH_MERMAID_FIX = 'search-mermaid-fix',
	DOC_SIMPLE_AGENT = 'doc-simple-agent',
	FOLLOW_UP_QUESTION_AGENT = 'follow-up-question-agent',
	MOBILE_VAULT_SEARCH_AGENT = 'mobile-vault-search-agent',
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

export enum UIStepType {
	STEPS_DISPLAY = 'steps-display',
}

export enum UISignalChannel {
	GRAPH = 'graph',
	MINDFLOW_PROGRESS = 'mindflow-progress',
	MINDFLOW_MERMAID = 'mindflow-mermaid',
	OVERVIEW_MERMAID = 'overview-mermaid',
	/** Search pipeline stage control: start / progress / complete / error. */
	SEARCH_STAGE = 'search-stage',
}

export enum UISignalKind {
	PATCH = 'patch',
	STAGE = 'stage',
	PROGRESS = 'progress',
	COMPLETE = 'complete',
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

// ── Utilities moved from helpers/stream-helper.ts ──────────────────────────

/** Max chars per prompt for pk-debug (avoids huge console dumps). */
export const PK_DEBUG_PROMPT_TRUNCATE_CHARS = 2000;

/** Build a pk-debug event for prompt trace (system + user truncated). */
export function buildPromptTraceDebugEvent(
	triggerName: StreamTriggerName,
	system?: string,
	prompt?: string,
): LLMStreamEvent {
	return {
		type: 'pk-debug',
		debugName: 'prompt-trace',
		triggerName,
		extra: {
			prompt: prompt ?? 'undefined',
			systemLen: system?.length ?? 'undefined',
			promptLen: prompt?.length ?? 'undefined',
		},
	};
}

/** Event types that carry incremental text deltas (not meaningful to log individually). */
export const DELTA_EVENT_TYPES = new Set(['text-delta', 'reasoning-delta', 'prompt-stream-delta', 'tool-input-delta', 'ui-step-delta']);

/** Extract the delta text from any delta-type event. */
export function getDeltaEventDeltaText(event: LLMStreamEvent): string {
	switch (event.type) {
		case 'text-delta':
			return event.text;
		case 'reasoning-delta':
			return event.text;
		case 'prompt-stream-delta':
			return event.delta ?? '';
		case 'tool-input-delta':
			return event.delta;
		case 'ui-step-delta':
			return (event.titleDelta ?? '') + (event.descriptionDelta ?? '');
	}
	return '';
}