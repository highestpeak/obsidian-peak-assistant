import type { LanguageModelUsage } from 'ai';

/**
 * File attachment with preview
 */
export interface FileAttachment {
	id: string;
	file: File;
	preview?: string; // Data URL for images
	type: 'image' | 'file' | 'pdf';
	hash?: string; // File hash for deduplication
}

/**
 * Prompt input message structure
 */
export interface PromptInputMessage {
	text: string;
	files: File[];
}

/**
 * Token usage information
 */
export interface TokenUsageInfo {
	totalUsed: number;
	remaining: number;
	totalAvailable: number;
}

/**
 * Prompt input status
 */
export type PromptInputStatus = 'ready' | 'submitted' | 'streaming' | 'error';

