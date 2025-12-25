import type { ChatMessage } from './types';
import type { LLMUsage } from '@/core/providers/types';

/**
 * View Object for ChatMessage used at runtime.
 * Contains helper fields that are not persisted to markdown.
 */
export interface ChatMessageVO extends ChatMessage {
	/**
	 * Text for UI display (may differ from content after processing)
	 */
	displayText?: string;
	/**
	 * Processed text (e.g., after markdown rendering)
	 */
	processedText?: string;
	/**
	 * Text used when building context for LLM
	 */
	contextText?: string;
}

/**
 * Base message structure (abstract)
 */
export interface BaseChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAtTimestamp: number;
	createdAtZone: string;
	starred: boolean;
	model: string;
	provider: string;
	resources?: import('./resources/types').ChatResourceRef[];
}

/**
 * User message structure
 */
export interface UserMessage extends BaseChatMessage {
	role: 'user';
}

/**
 * Assistant message structure with assistant-specific fields
 */
export interface AssistantMessage extends BaseChatMessage {
	role: 'assistant';
	/**
	 * Token usage for this message
	 */
	tokenUsage?: LLMUsage;
	/**
	 * Thinking process (if available from provider)
	 */
	thinking?: string;
	/**
	 * Generation time in milliseconds
	 */
	genTimeMs?: number;
}

/**
 * System message structure
 */
export interface SystemMessage extends BaseChatMessage {
	role: 'system';
}

