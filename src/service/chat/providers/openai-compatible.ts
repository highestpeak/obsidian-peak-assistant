import {
	LLMResponse,
	LLMRequest,
	LLMUsage,
	ProviderContentPart,
	LLMRequestMessage,
	ModelMetaData,
} from './types';
import { AIStreamEvent } from '../messages/types-events';
import { safeReadError, trimTrailingSlash } from './helpers';

/**
 * Extract message content from OpenAI-compatible response
 */
function extractOpenAIMessageContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}
				if (item && typeof item === 'object' && 'text' in item && typeof (item as { text?: string }).text === 'string') {
					return (item as { text?: string }).text ?? '';
				}
				return '';
			})
			.join('')
			.trim();
	}
	return '';
}

/**
 * Normalize usage statistics from OpenAI-compatible response
 */
function normalizeUsage(usage?: {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
}): LLMUsage | undefined {
	if (!usage) {
		return undefined;
	}
	const promptTokens = usage.prompt_tokens ?? 0;
	const completionTokens = usage.completion_tokens ?? 0;
	const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
	return {
		promptTokens,
		completionTokens,
		totalTokens,
	};
}

/**
 * Map messages to OpenAI-compatible format
 */
function mapMessagesToOpenAI(messages: LLMRequestMessage[]) {
	return messages.map((message) => ({
		role: message.role,
		content: mapContentParts(message.content),
	}));
}

/**
 * Map content parts to OpenAI-compatible format
 */
function mapContentParts(parts: ProviderContentPart[]) {
	const mapped = parts
		.map((part) => {
			switch (part.type) {
				case 'text':
					return [{ type: 'text', text: part.text }];
				case 'document':
					return [
						{
							type: 'text',
							text: `${part.name ? `[Document: ${part.name}]\n` : ''}${part.text}`,
						},
					];
				case 'inline_image':
					return [
						{
							type: 'image_url',
							image_url: {
								url: `data:${part.mediaType};base64,${part.data}`,
							},
						},
						...(part.alt ? [{ type: 'text', text: part.alt }] : []),
					];
				case 'image_url':
					return [
						{
							type: 'image_url',
							image_url: {
								url: part.url,
							},
						},
						...(part.alt ? [{ type: 'text', text: part.alt }] : []),
					];
				default:
					return [];
			}
		})
		.flat();
	return mapped.length > 0 ? mapped : [{ type: 'text', text: '' }];
}

type OpenAIChatCompletionResponse = {
	id: string;
	model?: string;
	choices?: Array<{
		index: number;
		message?: {
			role: string;
			content?: string | Array<{ type: string; text?: string }>;
		};
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
};

type OpenAIChatCompletionStreamResponse = {
	id: string;
	model?: string;
	choices?: Array<{
		index: number;
		delta?: {
			content?: string | Array<unknown>;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
};

interface InvokeOpenAICompatibleBlockParams {
	request: LLMRequest;
	baseUrl: string;
	apiKey?: string;
	timeoutMs: number;
	extraHeaders?: Record<string, string>;
	errorPrefix?: string;
}

/**
 * Invoke OpenAI-compatible block chat endpoint
 */
export async function invokeOpenAICompatibleBlock(params: InvokeOpenAICompatibleBlockParams): Promise<LLMResponse> {
	const url = `${trimTrailingSlash(params.baseUrl)}/chat/completions`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...params.extraHeaders,
		};
		if (params.apiKey) {
			headers['Authorization'] = `Bearer ${params.apiKey}`;
		}
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers,
			body: JSON.stringify({
				model: params.request.model,
				messages: mapMessagesToOpenAI(params.request.messages),
			}),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			const errorPrefix = params.errorPrefix || 'OpenAI-compatible endpoint';
			throw new Error(`${errorPrefix} failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const data = (await response.json()) as OpenAIChatCompletionResponse;
		const choice = data.choices?.[0];
		const text = extractOpenAIMessageContent(choice?.message?.content);

		return {
			content: text,
			model: data.model ?? params.request.model,
			usage: normalizeUsage(data.usage),
		};
	} finally {
		clearTimeout(timeout);
	}
}

export interface InvokeOpenAICompatibleStreamParams {
	request: LLMRequest;
	baseUrl: string;
	apiKey?: string;
	timeoutMs: number;
	extraHeaders?: Record<string, string>;
	errorPrefix?: string;
}

/**
 * Invoke OpenAI-compatible streaming chat endpoint
 */
export async function* invokeOpenAICompatibleStream(params: InvokeOpenAICompatibleStreamParams): AsyncGenerator<AIStreamEvent> {
	const url = `${trimTrailingSlash(params.baseUrl)}/chat/completions`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
	let currentModel = params.request.model;
	let finalUsage: LLMUsage | undefined;

	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...params.extraHeaders,
		};
		if (params.apiKey) {
			headers['Authorization'] = `Bearer ${params.apiKey}`;
		}
		const requestBody = {
			model: params.request.model,
			stream: true,
			messages: mapMessagesToOpenAI(params.request.messages),
		};
		
		// Debug: Log the actual request being sent to the API
		console.log('[OpenAICompatible] Streaming request:', {
			url,
			model: params.request.model,
			messagesCount: requestBody.messages.length,
			messages: requestBody.messages,
		});
		
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers,
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			const errorPrefix = params.errorPrefix || 'OpenAI-compatible streaming endpoint';
			throw new Error(`${errorPrefix} failed: ${response.status} ${response.statusText} - ${errorText}`);
		}
		if (!response.body) {
			throw new Error('OpenAI-compatible endpoint did not return a readable stream');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let doneSignal = false;

		while (!doneSignal) {
			const { value, done } = await reader.read();
			if (value) {
				buffer += decoder.decode(value, { stream: true });
			}
			if (done) {
				buffer += decoder.decode(new Uint8Array(), { stream: false });
			}

			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex !== -1) {
				const raw = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				if (raw.startsWith('data:')) {
					const payloadText = raw.slice(5).trim();
					if (payloadText === '[DONE]') {
						doneSignal = true;
						break;
					}
					if (payloadText) {
						const parsed = JSON.parse(payloadText) as OpenAIChatCompletionStreamResponse;
						if (parsed.model) {
							currentModel = parsed.model;
						}
						const deltaRaw = parsed.choices?.[0]?.delta?.content;
						const deltaText = extractOpenAIMessageContent(deltaRaw);
						if (deltaText) {
							// Debug: Log received delta
							console.log('[OpenAICompatible] Received delta:', deltaText);
							yield {
								type: 'delta',
								text: deltaText,
								model: parsed.model ?? currentModel,
							};
						}
						const finishReason = parsed.choices?.[0]?.finish_reason;
						if (finishReason && parsed.usage) {
							finalUsage = normalizeUsage(parsed.usage);
						}
					}
				}
				newlineIndex = buffer.indexOf('\n');
			}

			if (done) {
				doneSignal = true;
			}
		}

		yield {
			type: 'complete',
			model: currentModel,
			usage: finalUsage,
		};
	} finally {
		clearTimeout(timeout);
	}
}

