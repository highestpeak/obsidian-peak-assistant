import { StreamTextResult, type LanguageModelUsage, type CoreMessage } from 'ai';
import { AIStreamEvent } from '../types-events';
import { LLMRequestMessage, ProviderContentPart } from '../types';

/**
 * Utility functions for provider implementations.
 */

export function trimTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Convert AI SDK StreamTextResult to AIStreamEvent async generator.
 * Handles delta events and final complete event with usage.
 */
export async function* streamTextToAIStreamEvents(
	result: StreamTextResult<any, any>,
	initialModel?: string
): AsyncGenerator<AIStreamEvent> {
	let currentModel = initialModel;
	let finalUsage: LanguageModelUsage | undefined = undefined;

	try {
		// Process the stream
		for await (const chunk of result.fullStream) {
			if (chunk.type === 'text-delta') {
				// Yield text delta - AI SDK uses 'text' field
				yield {
					type: 'delta',
					text: chunk.text,
					model: currentModel,
				};
			} else if (chunk.type === 'text-start') {
				// Update model from provider metadata if available
				if (chunk.providerMetadata && typeof chunk.providerMetadata === 'object') {
					const metadata = chunk.providerMetadata as Record<string, any>;
					if (metadata.modelId && typeof metadata.modelId === 'string') {
						currentModel = metadata.modelId;
					}
				}
			}
		}

		finalUsage = await result.usage;
		// Yield final complete event
		yield {
			type: 'complete',
			model: currentModel || '',
			usage: finalUsage,
		};
	} catch (error) {
		const normalized = error instanceof Error ? error : new Error(String(error));
		yield {
			type: 'error',
			error: normalized,
		};
	}
}

/**
 * Map ProviderContentPart to AI SDK message content parts.
 * AI SDK supports text strings or arrays of content parts (text/image).
 */
function mapContentPartToAiSdk(part: ProviderContentPart): Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
	switch (part.type) {
		case 'text':
			return [{ type: 'text', text: part.text }];
		case 'document': {
			// Preserve document semantics with [Document: name] prefix
			const docText = part.name ? `[Document: ${part.name}]\n${part.text}` : part.text;
			return [{ type: 'text', text: docText }];
		}
		case 'inline_image': {
			// Map base64 inline image to AI SDK image format
			const imageData = `data:${part.mediaType};base64,${part.data}`;
			const parts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
				{ type: 'image', image: imageData },
			];
			if (part.alt) {
				parts.push({ type: 'text', text: part.alt });
			}
			return parts;
		}
		case 'image_url': {
			// Map image URL to AI SDK image format
			const urlParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
				{ type: 'image', image: part.url },
			];
			if (part.alt) {
				urlParts.push({ type: 'text', text: part.alt });
			}
			return urlParts;
		}
		default:
			return [{ type: 'text', text: '' }];
	}
}

/**
 * Convert LLMRequestMessage to AI SDK CoreMessage format.
 * Handles system, user, and assistant roles.
 * System messages are extracted separately and should be passed via the 'system' parameter.
 */
export function toAiSdkMessages(messages: LLMRequestMessage[]): CoreMessage[] {
	const aiSdkMessages: CoreMessage[] = [];

	for (const message of messages) {
		// Skip system messages - they should be handled via extractSystemMessage
		if (message.role === 'system') {
			continue;
		}

		// Map content parts for user/assistant messages
		const contentParts = message.content.flatMap(mapContentPartToAiSdk);

		// Ensure at least one text part exists
		if (contentParts.length === 0) {
			contentParts.push({ type: 'text', text: '' });
		}

		// Convert to AI SDK message format
		if (message.role === 'user') {
			// User messages can have mixed content (text + images)
			// AI SDK accepts string for text-only, or array for mixed content
			if (contentParts.length === 1 && contentParts[0].type === 'text') {
				aiSdkMessages.push({
					role: 'user',
					content: contentParts[0].text,
				});
			} else {
				// Mixed content or images - use array format
				aiSdkMessages.push({
					role: 'user',
					content: contentParts,
				} as CoreMessage);
			}
		} else if (message.role === 'assistant') {
			// Assistant messages are typically text only
			const textContent = contentParts
				.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
				.map((p) => p.text)
				.join('');
			aiSdkMessages.push({
				role: 'assistant',
				content: textContent || '',
			});
		}
	}

	return aiSdkMessages;
}

/**
 * Extract system message text from LLMRequestMessage array.
 * Returns concatenated system message text or undefined if none.
 */
export function extractSystemMessage(messages: LLMRequestMessage[]): string | undefined {
	const systemParts: string[] = [];
	for (const message of messages) {
		if (message.role === 'system') {
			for (const part of message.content) {
				if (part.type === 'text') {
					systemParts.push(part.text);
				} else if (part.type === 'document') {
					const docText = part.name ? `[Document: ${part.name}]\n${part.text}` : part.text;
					systemParts.push(docText);
				}
			}
		}
	}
	return systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
}
