import { ChatMessage, ChatConversation } from '../../service/chat/types';
import { LLMUsage } from '../providers/types';
import { TextStreamPart } from 'ai';

/**
 * Progress stage types for resource processing
 */
export type ProgressStage =
	| 'image_upload'
	| 'image_summary'
	| 'pdf_upload'
	| 'pdf_parse'
	| 'resource_summary'
	| 'tools_enable'
	| 'codeinterpreter_enable';

/**
 * Progress status
 */
export type ProgressStatus = 'start' | 'complete' | 'skip' | 'error';

/**
 * Unified stream event type for both provider and application layers.
 * Now uses AI SDK's TextStreamPart for consistency.
 */
export type AIStreamEvent = TextStreamPart<any> | {
	type: 'complete';
	model: string;
	usage?: LLMUsage;
	message?: ChatMessage;
} | {
	type: 'error';
	error: Error;
} | {
	type: 'progress';
	stage: ProgressStage;
	status: ProgressStatus;
	label: string; // English short description
	resourceSource?: string; // Source path/URL
	resourceId?: string; // Resource ID
};

