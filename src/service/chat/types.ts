import type { ResourceKind } from '@/core/document/types';

import { LLMUsage, LLMOutputControlSettings, ChatRole } from '@/core/providers/types';
import type { TFile } from 'obsidian';
import type { ConversationType } from './conversation-types';

/**
 * Lifecycle status for a chat message.
 * - sending: user message submitted, waiting for server
 * - streaming: assistant response actively streaming
 * - completed: message fully received and persisted
 * - error: an error occurred during generation
 * - cancelled: user cancelled the streaming response
 * - timeout: no response received within the timeout window
 */
export enum MessageStatus {
	SENDING = 'sending',
	STREAMING = 'streaming',
	COMPLETED = 'completed',
	ERROR = 'error',
	CANCELLED = 'cancelled',
	TIMEOUT = 'timeout',
}

/**
 * Base chat message structure (persisted to markdown).
 * Runtime helper fields (displayText, processedText, contextText) should use ChatMessageVO.
 * Assistant-specific fields (thinking, genTimeMs, tokenUsage) should use composition pattern.
 */
export interface ChatMessage {
	id: string;
	role: ChatRole;
	/**
	 * Optional short title for markdown heading.
	 *
	 * Note: This is persisted in markdown only (not in sqlite).
	 */
	title?: string;
	content: string;
	createdAtTimestamp: number;
	createdAtZone: string;
	starred: boolean;
	model: string;
	provider: string;
	/**
	 * Resource references attached to this message
	 */
	resources?: ChatResourceRef[];
	/**
	 * Token usage for this message (assistant messages only)
	 */
	tokenUsage?: LLMUsage;
	/**
	 * Whether this message represents an error
	 */
	isErrorMessage?: boolean;
	/** When true, render this user message with markdown (e.g. AI Analysis imports) */
	isMarkdownContent?: boolean;
	/**
	 * Whether this message should be visible in UI
	 */
	isVisible?: boolean;
	/**
	 * Assistant-only: structured reasoning content (parsed from markdown)
	 */
	reasoning?: {
		content: string;
	};
	/**
	 * Assistant-only: tool calls made during generation (parsed from markdown)
	 */
	toolCalls?: Array<{
		toolName: string;
		input?: any;
		output?: any;
	}>;
	/**
	 * Assistant-only: generation time in milliseconds
	 */
	genTimeMs?: number;
	/**
	 * Assistant-only: persisted follow-up question suggestions, generated
	 * once when the assistant stream completes. Shown by MessageSuggestedNext
	 * for the last message; survives conversation reloads via sqlite, so we
	 * never regenerate on re-mount.
	 */
	suggestedFollowups?: string[];
	/**
	 * Topic name this message belongs to (from ChatConversationDoc parsing).
	 * If undefined, the message is in NoTopic section.
	 */
	topic?: string;
	/**
	 * Lifecycle status of this message (runtime only, not persisted).
	 * Defaults to 'completed' for saved messages loaded from storage.
	 */
	status?: MessageStatus;
}

export interface ChatConversationMeta {
	id: string;
	title: string;
	projectId?: string;
	createdAtTimestamp: number;
	updatedAtTimestamp: number;
	activeModel: string;
	activeProvider: string;
	tokenUsageTotal?: number;
	titleManuallyEdited?: boolean; // If true, auto-title generation will be disabled
	titleAutoUpdated?: boolean; // If true, title has been auto-updated at least once
	contextLastUpdatedTimestamp?: number; // Timestamp when context was last updated
	contextLastMessageIndex?: number; // Message index when context was last updated
	fileRelPath?: string; // Relative path to the conversation markdown file
	/**
	 * Temporary override for LLM output control settings.
	 * If set, this overrides the global default settings.
	 */
	outputControlOverride?: LLMOutputControlSettings;
	/**
	 * Attachment handling mode override for this conversation.
	 * If set, overrides the global default attachmentHandlingDefault.
	 * 'direct': Send attachments directly to model (requires model capabilities)
	 * 'degrade_to_text': Convert attachments to text summaries via OCR/parsing
	 */
	attachmentHandlingOverride?: 'direct' | 'degrade_to_text';
	/**
	 * The type/mode of this conversation (chat, agent, plan, canvas, template, custom).
	 * Optional for backward compatibility — existing conversations without this field default to { kind: 'chat' }.
	 */
	conversationType?: ConversationType;
	/**
	 * Per-conversation custom system prompt. Prepended to the default system prompt
	 * when building the LLM request. Allows users to customize AI behavior per conversation.
	 */
	customSystemPrompt?: string;
	/**
	 * Folder path focus for this conversation.
	 * When set, context building prioritizes notes in this folder
	 * and search defaults to this scope.
	 */
	focusFolder?: string;
}

export interface ChatProjectMeta {
	id: string;
	name: string;
	folderPath?: string;
	createdAtTimestamp: number;
	updatedAtTimestamp: number;
}

/**
 * Reference to a resource attached to a message
 */
export interface ChatResourceRef {
	source: string; // Original path/url/text content
	id: string; // Stable hash-based ID for indexing and summary file naming
	kind: ResourceKind;
	summaryNotePath?: string; // Path to the resource summary note file
}

/**
 * Resource summary metadata stored in resource summary note files
 */
export interface ResourceSummaryMeta {
	id: string;
	source: string;
	kind: ResourceKind;
	title?: string;
	shortSummary?: string;
	fullSummary?: string;
	lastUpdatedTimestamp: number;
	mentionedInConversations?: string[]; // Conversation IDs
	mentionedInProjects?: string[]; // Project IDs
	mentionedInFiles?: string[]; // File paths (markdown, excalidraw, etc.)
}

/**
 * Parsed resource summary file
 */
export interface ParsedResourceSummaryFile {
	meta: ResourceSummaryMeta;
	content: string;
	file: TFile;
}

export interface ChatContextWindow {
	lastUpdatedTimestamp: number;
	recentMessagesWindow: Array<{
		fromMessageId: string;
		toMessageId: string;
	}>;
	/**
	 * Short summary (100-1000 characters)
	 */
	shortSummary?: string;
	/**
	 * Full summary with detailed analysis
	 */
	fullSummary?: string;
	/**
	 * Topics extracted from the conversation
	 */
	topics?: string[];
	/**
	 * Index of resources referenced in this conversation
	 * Uses ResourceSummaryMeta for full resource information
	 */
	resourceIndex?: ResourceSummaryMeta[];
}

export interface ChatProjectContext {
	lastUpdatedTimestamp: number;
	/**
	 * Short summary (100-1000 characters)
	 */
	shortSummary?: string;
	/**
	 * Full summary with detailed analysis
	 */
	fullSummary?: string;
	/**
	 * Index of resources referenced in this project
	 * Uses ResourceSummaryMeta for full resource information
	 */
	resourceIndex?: ResourceSummaryMeta[];
}

export interface ChatFilePaths {
	rootFolder: string;
}

export interface StarredMessageRecord {
	id: string;
	sourceMessageId: string;
	conversationId: string;
	projectId?: string;
	createdAt: number;
	active: boolean;
}

export interface ChatConversation {
	meta: ChatConversationMeta;
	messages: ChatMessage[];
	context?: ChatContextWindow;
	content: string;
	file: TFile;
}

export interface ChatProject {
	meta: ChatProjectMeta;
	context?: ChatProjectContext;
}

/**
 * Pending conversation creation state
 * Used when user clicks "new conversation" but hasn't sent first message yet
 */
export interface PendingConversation {
	title: string;
	project: ChatProject | null;
	conversationType?: ConversationType;
}


/**
 * Represents a file change in the workspace
 */
export interface FileChange {
	/** Unique identifier for the file change */
	id: string;
	/** Relative path to the file */
	filePath: string;
	/** Number of lines added */
	addedLines: number;
	/** Number of lines removed */
	removedLines: number;
	/** Whether this change should be kept/accepted */
	accepted: boolean;
	/** File extension for icon display */
	extension?: string;
}

/**
 * Represents the current state of file changes in a conversation
 */
export interface FileChangesState {
	/** Array of file changes */
	changes: FileChange[];
	/** Whether the changes area should be visible */
	isVisible: boolean;
}

