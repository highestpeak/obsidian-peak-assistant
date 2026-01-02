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

/**
 * Format max context for display (e.g., 200000 -> "200K", 1000000 -> "1M")
 */
export function formatMaxContext(maxCtx?: number): string | undefined {
	if (!maxCtx) return undefined;
	if (maxCtx >= 1000000) {
		return `${Math.round(maxCtx / 1000000)}M`;
	}
	if (maxCtx >= 1000) {
		return `${Math.round(maxCtx / 1000)}K`;
	}
	return String(maxCtx);
}
