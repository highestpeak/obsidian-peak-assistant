import type { MessagePart, LLMRequestMessage } from '@/core/providers/types';

/**
 * Efficiently estimate object size by traversing its structure.
 * @param obj - Object to estimate size for
 * @param maxDepth - Maximum recursion depth to prevent infinite loops
 * @param currentDepth - Current recursion depth
 * @returns Estimated character count
 */
export function estimateObjectSize(obj: any, maxDepth: number = 3, currentDepth: number = 0): number {
	if (currentDepth >= maxDepth) {
		return 50; // Fixed estimate for deeply nested objects
	}

	if (obj === null || obj === undefined) {
		return 4; // "null" or "undefined" length
	}

	switch (typeof obj) {
		case 'string':
			return obj.length + 2; // Add quotes
		case 'number':
			return String(obj).length;
		case 'boolean':
			return obj ? 4 : 5; // "true" or "false"
		case 'object':
			if (Array.isArray(obj)) {
				let size = 2; // Brackets []
				for (const item of obj) {
					size += estimateObjectSize(item, maxDepth, currentDepth + 1) + 1; // +1 for comma
				}
				return size;
			} else {
				let size = 2; // Braces {}
				const keys = Object.keys(obj);
				for (const key of keys) {
					size += key.length + 3; // key + ":"
					size += estimateObjectSize(obj[key], maxDepth, currentDepth + 1) + 1; // +1 for comma
				}
				return size;
			}
		default:
			return 20; // Fixed estimate for other types (function, symbol, etc.)
	}
}

/**
 * Efficiently estimate message content size without expensive JSON serialization.
 * @param content - Message content parts
 * @returns Estimated character count
 */
export function estimateMessageContentSize(content: MessagePart[]): number {
	let totalChars = 0;

	for (const part of content) {
		if (typeof part === 'string') {
			// Direct string content
			const str: string = part;
			totalChars += str.length;
		} else {
			// Handle different MessagePart types efficiently
			switch (part.type) {
				case 'text':
					totalChars += part.text.length;
					break;
				case 'reasoning':
					totalChars += part.text.length;
					break;
				case 'image':
					// Estimate image metadata size (URL/path + mediaType)
					if (typeof part.data === 'string') {
						totalChars += part.data.length;
					} else {
						// DataContent object, estimate size
						totalChars += 200; // Rough estimate for base64 data
					}
					totalChars += part.mediaType.length;
					break;
				case 'file':
					// Estimate file metadata size
					if (typeof part.data === 'string') {
						totalChars += part.data.length;
					} else {
						// DataContent object, estimate size
						totalChars += 500; // Rough estimate for file data
					}
					totalChars += part.mediaType.length;
					if (part.filename) {
						totalChars += part.filename.length;
					}
					break;
				case 'tool-call':
					// Estimate tool call metadata size
					totalChars += part.toolName.length;
					if (part.toolCallId) {
						totalChars += part.toolCallId.length;
					}
					// Estimate input object size using efficient traversal
					totalChars += estimateObjectSize(part.input);
					break;
				case 'tool-result':
					// Estimate tool result metadata size
					totalChars += part.toolCallId.length;
					totalChars += part.toolName.length;
					// Estimate output object size using efficient traversal
					totalChars += estimateObjectSize(part.output);
					break;
				default:
					// Fallback for unknown types
					totalChars += 50;
			}
		}
	}

	return totalChars;
}

/**
 * Estimate token count for messages.
 * Uses a simple chars/4 heuristic.
 * @param messages - Array of messages to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(messages: LLMRequestMessage[]): number {
	let totalChars = 0;
	for (const message of messages) {
		// Efficiently estimate content size without JSON serialization
		totalChars += estimateMessageContentSize(message.content);
		totalChars += 10; // Message formatting overhead
	}
	return Math.ceil(totalChars / 4);
}
