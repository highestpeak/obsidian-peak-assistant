import {
	LLMResponse,
	ProviderContentPart,
	LLMRequest,
	LLMUsage,
	LLMProviderService,
	LLMProvider,
	ProviderModelInfo,
} from './types';
import { AIStreamEvent } from './types-events';
import { safeReadError, trimTrailingSlash } from './helpers';
import { AIModelId } from '../types-models';

const DEFAULT_CLAUDE_TIMEOUT_MS = 60000;
const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 1024;

type AnthropicTextContent = {
	type: 'text';
	text: string;
};

type AnthropicImageContent = {
	type: 'image';
	source:
		| {
				type: 'base64';
				media_type: string;
				data: string;
		  }
		| {
				type: 'url';
				url: string;
		  };
};

type AnthropicContent = AnthropicTextContent | AnthropicImageContent;

type AnthropicMessage = {
	role: 'user' | 'assistant';
	content: AnthropicContent[];
};

type AnthropicRequestBody = {
	model: string;
	messages: AnthropicMessage[];
	max_tokens: number;
	system?: string;
	stream?: boolean;
};

type AnthropicResponse = {
	id: string;
	model?: string;
	content?: Array<
		| {
				type: 'text';
				text: string;
		  }
		| Record<string, unknown>
	>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
};

function normalizeClaudeUsage(
	usage:
		| {
				input_tokens?: number;
				output_tokens?: number;
		  }
		| undefined
): LLMUsage | undefined {
	if (!usage) {
		return undefined;
	}
	const promptTokens = usage.input_tokens ?? 0;
	const completionTokens = usage.output_tokens ?? 0;
	return {
		promptTokens,
		completionTokens,
		totalTokens: promptTokens + completionTokens,
	};
}

function buildClaudePayload(params: { request: LLMRequest; maxOutputTokens: number }) {
	const systemPrompts: string[] = [];
	const conversation: AnthropicMessage[] = [];

	for (const message of params.request.messages) {
		if (message.role === 'system') {
			systemPrompts.push(...collectTextParts(message.content));
			continue;
		}

		const role: 'user' | 'assistant' = message.role === 'assistant' ? 'assistant' : 'user';
		const content = mapPartsToClaudeContent(message.content);
		conversation.push({
			role,
			content: content.length > 0 ? content : [{ type: 'text', text: '' }],
		});
	}

	const body: AnthropicRequestBody = {
		model: params.request.model,
		messages: conversation,
		max_tokens: params.maxOutputTokens,
		...(systemPrompts.length > 0 ? { system: systemPrompts.join('\n\n') } : {}),
	};

	return { body };
}

export async function invokeClaudeBlock(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	maxOutputTokens: number;
	timeoutMs: number;
}): Promise<LLMResponse> {
	if (!params.apiKey) {
		throw new Error('Claude API key is required');
	}
	const { body } = buildClaudePayload({ request: params.request, maxOutputTokens: params.maxOutputTokens });

	const url = `${trimTrailingSlash(params.baseUrl ?? 'https://api.anthropic.com/v1')}/messages`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': params.apiKey,
				'Anthropic-Version': '2023-06-01',
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`Anthropic Claude request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const data = (await response.json()) as AnthropicResponse;
		const content = (data.content ?? [])
			.map((item) => ('text' in item ? (item as { text: string }).text : ''))
			.join('')
			.trim();

		return {
			content,
			model: data.model ?? params.request.model,
			usage: normalizeClaudeUsage(data.usage),
		};
	} finally {
		clearTimeout(timeout);
	}
}

export async function* invokeClaudeStream(params: {
	request: LLMRequest;
	baseUrl?: string;
	apiKey?: string;
	maxOutputTokens: number;
	timeoutMs: number;
}): AsyncGenerator<AIStreamEvent> {
	if (!params.apiKey) {
		throw new Error('Claude API key is required');
	}
	const { body } = buildClaudePayload({ request: params.request, maxOutputTokens: params.maxOutputTokens });
	body.stream = true;

	const url = `${trimTrailingSlash(params.baseUrl ?? 'https://api.anthropic.com/v1')}/messages`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

	let currentModel = params.request.model;
	let usage: LLMUsage | undefined;
	let shouldStop = false;

	try {
		const response = await fetch(url, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				'x-api-key': params.apiKey,
				'Anthropic-Version': '2023-06-01',
			},
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			const errorText = await safeReadError(response);
			throw new Error(`Anthropic Claude request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}
		if (!response.body) {
			throw new Error('Anthropic Claude streaming endpoint did not return a readable stream');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (!shouldStop) {
			const { value, done } = await reader.read();
			if (value) {
				buffer += decoder.decode(value, { stream: true });
			}
			if (done) {
				buffer += decoder.decode(new Uint8Array(), { stream: false });
			}

			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const rawEvent = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				const lines = rawEvent.split('\n').map((line) => line.trim()).filter(Boolean);
				let eventName = '';
				const dataParts: string[] = [];
				for (const line of lines) {
					if (line.startsWith('event:')) {
						eventName = line.slice('event:'.length).trim();
					} else if (line.startsWith('data:')) {
						dataParts.push(line.slice('data:'.length).trim());
					}
				}
				const payloadRaw = dataParts.join('\n');
				if (!eventName || !payloadRaw) {
					separatorIndex = buffer.indexOf('\n\n');
					continue;
				}
				try {
					const payload = JSON.parse(payloadRaw);
					if (eventName === 'message_start') {
						const model = payload?.message?.model;
						if (typeof model === 'string' && model.length > 0) {
							currentModel = model;
						}
					} else if (eventName === 'content_block_delta') {
						const deltaText = payload?.delta?.text;
						if (typeof deltaText === 'string' && deltaText.length > 0) {
							yield {
								type: 'delta',
								text: deltaText,
								model: currentModel,
							};
						}
					} else if (eventName === 'message_delta') {
						const nextUsage = normalizeClaudeUsage(payload?.usage);
						if (nextUsage) {
							usage = nextUsage;
						}
					} else if (eventName === 'message_stop') {
						shouldStop = true;
						break;
					}
				} catch (error) {
					console.warn('Failed to parse Claude stream event payload', error, payloadRaw);
				}
				separatorIndex = buffer.indexOf('\n\n');
			}

			if (done) {
				break;
			}
		}

		yield {
			type: 'complete',
			model: currentModel,
			usage,
		};
	} finally {
		clearTimeout(timeout);
	}
}

function mapPartsToClaudeContent(parts: ProviderContentPart[]): AnthropicContent[] {
	const content: AnthropicContent[] = [];
	for (const part of parts) {
		switch (part.type) {
			case 'text':
				content.push({
					type: 'text',
					text: part.text,
				});
				break;
			case 'document':
				content.push({
					type: 'text',
					text: `${part.name ? `[Document: ${part.name}]\n` : ''}${part.text}`,
				});
				break;
			case 'inline_image':
				content.push({
					type: 'image',
					source: {
						type: 'base64',
						media_type: part.mediaType,
						data: part.data,
					},
				});
				if (part.alt) {
					content.push({ type: 'text', text: part.alt });
				}
				break;
			case 'image_url':
				content.push({
					type: 'image',
					source: {
						type: 'url',
						url: part.url,
					},
				});
				if (part.alt) {
					content.push({ type: 'text', text: part.alt });
				}
				break;
			default:
				break;
		}
	}
	return content;
}

function collectTextParts(parts: ProviderContentPart[]): string[] {
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

export interface ClaudeChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	maxOutputTokens?: number;
}

export class ClaudeChatService implements LLMProviderService {
	constructor(private readonly options: ClaudeChatServiceOptions) {}

	getProviderId(): LLMProvider {
		return 'claude';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		return invokeClaudeBlock({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			maxOutputTokens: this.options.maxOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS,
		});
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		return invokeClaudeStream({
			request,
			baseUrl: this.options.baseUrl,
			apiKey: this.options.apiKey,
			maxOutputTokens: this.options.maxOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS,
			timeoutMs: this.options.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS,
		});
	}

	async getAvailableModels(): Promise<ProviderModelInfo[]> {
		return [
			{ id: 'claude-3-5-sonnet-20240620' as AIModelId, displayName: 'Claude 3.5 Sonnet' },
			{ id: 'claude-3-opus-20240229' as AIModelId, displayName: 'Claude 3 Opus' },
			{ id: 'claude-3-sonnet-20240229' as AIModelId, displayName: 'Claude 3 Sonnet' },
			{ id: 'claude-3-haiku-20240307' as AIModelId, displayName: 'Claude 3 Haiku' },
		];
	}
}

