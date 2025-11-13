import {
	LLMResponse,
	ProviderContentPart,
	LLMMessage,
	LLMRequest,
	LLMUsage,
} from './types';
import { AIStreamEvent } from './types-events';
import { trimTrailingSlash, safeReadError } from './helpers';
import { LLMProviderService } from './types';

const DEFAULT_GEMINI_TIMEOUT_MS = 60000;

type GeminiPart =
	| {
			text: string;
	  }
	| {
			inlineData: {
				mimeType: string;
				data: string;
			};
	  };

type GeminiContent = {
	role: 'user' | 'model';
	parts: GeminiPart[];
};

type GeminiResponse = {
	candidates?: Array<{
		content?: {
			role?: string;
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	};
};

function normalizeGeminiUsage(
	usage:
		| {
				promptTokenCount?: number;
				candidatesTokenCount?: number;
				totalTokenCount?: number;
		  }
		| undefined
): LLMUsage | undefined {
	if (!usage) {
		return undefined;
	}
	const promptTokens = usage.promptTokenCount ?? 0;
	const completionTokens = usage.candidatesTokenCount ?? 0;
	const totalTokens = usage.totalTokenCount ?? promptTokens + completionTokens;
	return {
		promptTokens,
		completionTokens,
		totalTokens,
	};
}

export async function invokeGeminiBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey: string;
	timeoutMs: number;
}): Promise<LLMResponse> {
	const { payload, url } = buildGeminiPayload(params, false);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`Google Gemini request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const data = (await response.json()) as GeminiResponse;
		const candidate = data.candidates?.[0];
		const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
		return {
			content: text,
			model: params.request.model,
			usage: normalizeGeminiUsage(data.usageMetadata),
		};
	} finally {
		clearTimeout(timeout);
	}
}

export async function* invokeGeminiStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey: string;
	timeoutMs: number;
}): AsyncGenerator<AIStreamEvent> {
	const { payload, url } = buildGeminiPayload(params, true);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

	let accumulated = '';
	let usage: LLMUsage | undefined;

	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`Google Gemini request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}
		if (!response.body) {
			throw new Error('Google Gemini streaming endpoint did not return a readable stream');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
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
				if (raw.length === 0) {
					newlineIndex = buffer.indexOf('\n');
					continue;
				}
				try {
					const chunk = JSON.parse(raw) as GeminiResponse;
					const candidate = chunk.candidates?.[0];
					const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
					if (text && !text.startsWith(accumulated)) {
						const delta = text.startsWith(accumulated) ? text.slice(accumulated.length) : text;
						accumulated = text;
						yield {
							type: 'delta',
							text: delta,
							model: params.request.model,
						};
					} else if (text && text.length > accumulated.length) {
						const delta = text.slice(accumulated.length);
						accumulated = text;
						yield {
							type: 'delta',
							text: delta,
							model: params.request.model,
						};
					}
					const nextUsage = normalizeGeminiUsage(chunk.usageMetadata);
					if (nextUsage) {
						usage = nextUsage;
					}
				} catch (error) {
					console.warn('Failed to parse Gemini stream chunk', error, raw);
				}
				newlineIndex = buffer.indexOf('\n');
			}

			if (done) {
				break;
			}
		}

		yield {
			type: 'complete',
			model: params.request.model,
			usage,
		};
	} finally {
		clearTimeout(timeout);
	}
}

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildGeminiPayload(
	params: {
		request: LLMRequest;
		baseUrl?: string;
		apiKey: string;
	},
	stream: boolean
) {
	const systemPrompts: string[] = [];
	const contents: GeminiContent[] = [];

	for (const message of params.request.messages) {
		if (message.role === 'system') {
			systemPrompts.push(...collectTextFromParts(message.content));
			continue;
		}
		const role: 'user' | 'model' = message.role === 'assistant' ? 'model' : 'user';
		const parts = mapPartsToGeminiParts(message.content);
		contents.push({
			role,
			parts: parts.length > 0 ? parts : [{ text: '' }],
		});
	}

	const payload: Record<string, unknown> = {
		contents,
	};
	if (systemPrompts.length > 0) {
		payload.systemInstruction = {
			parts: [{ text: systemPrompts.join('\n\n') }],
		};
	}

	const baseUrl = trimTrailingSlash(params.baseUrl ?? GEMINI_DEFAULT_BASE);
	const url = stream
		? buildGeminiStreamUrl(baseUrl, params.request.model, params.apiKey)
		: buildGeminiUrl(baseUrl, params.request.model, params.apiKey);

	return { payload, url };
}

function mapPartsToGeminiParts(parts: ProviderContentPart[]): GeminiPart[] {
	const result: GeminiPart[] = [];
	for (const part of parts) {
		switch (part.type) {
			case 'text':
				result.push({ text: part.text });
				break;
			case 'document':
				result.push({
					text: `${part.name ? `[Document: ${part.name}]\n` : ''}${part.text}`,
				});
				break;
			case 'inline_image':
				result.push({
					inlineData: {
						mimeType: part.mediaType,
						data: part.data,
					},
				});
				if (part.alt) {
					result.push({ text: part.alt });
				}
				break;
			case 'image_url':
				result.push({
					text: `[Image URL] ${part.url}${part.alt ? `\n${part.alt}` : ''}`,
				});
				break;
			default:
				break;
		}
	}
	return result;
}

function collectTextFromParts(parts: ProviderContentPart[]): string[] {
	const texts: string[] = [];
	for (const part of parts) {
		if (part.type === 'text') {
			texts.push(part.text);
		} else if (part.type === 'document') {
			texts.push(`${part.name ? `[Document: ${part.name}]\n` : ''}${part.text}`);
		}
	}
	return texts;
}

function buildGeminiUrl(baseUrl: string, modelId: string, apiKey: string): string {
	const normalized = trimTrailingSlash(baseUrl);
	let withModels = normalized;
	if (!normalized.includes('/models')) {
		withModels = `${normalized}/models`;
	}
	return `${withModels}/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function buildGeminiStreamUrl(baseUrl: string, modelId: string, apiKey: string): string {
	const normalized = trimTrailingSlash(baseUrl);
	let withModels = normalized;
	if (!normalized.includes('/models')) {
		withModels = `${normalized}/models`;
	}
	return `${withModels}/${encodeURIComponent(modelId)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;
}

export interface GeminiChatServiceOptions {
	baseUrl?: string;
	apiKey: string;
	timeoutMs?: number;
}

export class GeminiChatService implements LLMProviderService {
	constructor(private readonly options: GeminiChatServiceOptions) {}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		return invokeGeminiBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS,
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		return invokeGeminiStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS,
		});
	}
}

