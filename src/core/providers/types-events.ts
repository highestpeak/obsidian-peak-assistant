import { ChatMessage, ChatConversation } from '../../service/chat/types';
import { LLMUsage } from '../providers/types';

/**
 * Unified stream event type for both provider and application layers.
 * Providers emit 'delta' and 'complete' events (complete without conversation/message).
 * Application layer emits 'complete' events with full context after persistence.
 */
export type AIStreamEvent =
	| {
			type: 'delta';
			text: string;
			model?: string;
	  }
	| {
			type: 'complete';
			model: string;
			usage?: LLMUsage;
			conversation?: ChatConversation;
			message?: ChatMessage;
	  }
	| {
			type: 'error';
			error: Error;
	  };

