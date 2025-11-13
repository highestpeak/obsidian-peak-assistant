import {
	LLMResponse,
	LLMRequest,
	LLMUsage,
	ProviderContentPart,
	LLMMessage,
} from './types';
import { AIStreamEvent } from './types-events';
import { safeReadError, trimTrailingSlash } from './helpers';
import { LLMProviderService } from './types';

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;

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

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';
const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1';

type OpenAIProviderVariant = 'openai' | 'openrouter';

export async function invokeOpenAIBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey: string;
	referer?: string;
	title?: string;
	timeoutMs: number;
	provider?: OpenAIProviderVariant;
}): Promise<LLMResponse> {
	const baseUrl =
		params.baseUrl ??
		(params.provider === 'openrouter' ? OPENROUTER_DEFAULT_BASE : OPENAI_DEFAULT_BASE);
	const url = `${trimTrailingSlash(baseUrl)}/chat/completions`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${params.apiKey}`,
				...(params.referer ? { 'HTTP-Referer': params.referer } : {}),
				...(params.title ? { 'X-Title': params.title } : {}),
			},
			body: JSON.stringify({
				model: params.request.model,
				messages: mapMessagesToOpenAI(params.request.messages),
			}),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`OpenAI compatible endpoint failed: ${response.status} ${response.statusText} - ${errorText}`);
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

export async function* invokeOpenAIStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey: string;
	referer?: string;
	title?: string;
	timeoutMs: number;
	provider?: OpenAIProviderVariant;
}): AsyncGenerator<AIStreamEvent> {
	const baseUrl =
		params.baseUrl ??
		(params.provider === 'openrouter' ? OPENROUTER_DEFAULT_BASE : OPENAI_DEFAULT_BASE);
	const url = `${trimTrailingSlash(baseUrl)}/chat/completions`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
	let currentModel = params.request.model;
	let finalUsage: LLMUsage | undefined;

	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${params.apiKey}`,
				...(params.referer ? { 'HTTP-Referer': params.referer } : {}),
				...(params.title ? { 'X-Title': params.title } : {}),
			},
			body: JSON.stringify({
				model: params.request.model,
				stream: true,
				messages: mapMessagesToOpenAI(params.request.messages),
			}),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`OpenAI compatible streaming endpoint failed: ${response.status} ${response.statusText} - ${errorText}`);
		}
		if (!response.body) {
			throw new Error('OpenAI compatible endpoint did not return a readable stream');
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

function mapMessagesToOpenAI(messages: LLMMessage[]) {
	return messages.map((message) => ({
		role: message.role,
		content: mapContentParts(message.content),
	}));
}

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

export interface OpenAIChatServiceOptions {
	baseUrl?: string;
	apiKey: string;
	referer?: string;
	title?: string;
	timeoutMs?: number;
	provider?: OpenAIProviderVariant;
}

export class OpenAIChatService implements LLMProviderService {
	constructor(private readonly options: OpenAIChatServiceOptions) {}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		return invokeOpenAIBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			referer: this.options.referer,
			title: this.options.title,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
			provider: this.options.provider ?? 'openai',
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return invokeOpenAIStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			referer: this.options.referer,
			title: this.options.title,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
			provider: this.options.provider ?? 'openai',
		});
	}
}

