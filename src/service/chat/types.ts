import { AIModelId } from './types-models';
import { LLMProvider } from './providers/types';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
	id: string;
	role: ChatRole;
	content: string;
	createdAtTimestamp: number;
	createdAtZone: string;
	starred: boolean;
	model: AIModelId;
	provider: LLMProvider;
	attachments?: string[];
}

export interface ChatConversationMeta {
	id: string;
	title: string;
	projectId?: string;
	createdAtTimestamp: number;
	updatedAtTimestamp: number;
	activeModel: AIModelId;
	activeProvider: LLMProvider;
	tokenUsageTotal?: number;
	titleManuallyEdited?: boolean; // If true, auto-title generation will be disabled
}

export interface ChatProjectMeta {
	id: string;
	name: string;
	folderPath?: string;
	createdAtTimestamp: number;
	updatedAtTimestamp: number;
}

export type RootMode = 'project-first' | 'conversation-first';

export interface ChatContextWindow {
	lastUpdatedTimestamp: number;
	recentMessagesWindow: Array<{
		fromMessageId: string;
		toMessageId: string;
	}>;
	summary: string;
}

export interface ChatProjectContext {
	lastUpdatedTimestamp: number;
	summary: string;
}

// todo 可以放到 storage 里面
export interface ChatFilePaths {
	rootFolder: string;
	starredCsvPath: string;
}

export interface StarredMessageRecord {
	id: string;
	sourceMessageId: string;
	conversationId: string;
	projectId?: string;
	createdAt: number;
	active: boolean;
}

import type { TFile } from 'obsidian';

export interface ParsedConversationFile {
	meta: ChatConversationMeta;
	messages: ChatMessage[];
	context?: ChatContextWindow;
	content: string;
	file: TFile;
}

export interface ParsedProjectFile {
	meta: ChatProjectMeta;
	context?: ChatProjectContext;
	shortSummary?: string;
	content: string;
	file: TFile;
}

/**
 * Pending conversation creation state
 * Used when user clicks "new conversation" but hasn't sent first message yet
 */
export interface PendingConversation {
	title: string;
	project: ParsedProjectFile | null;
}

