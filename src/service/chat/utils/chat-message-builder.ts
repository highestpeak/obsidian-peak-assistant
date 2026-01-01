import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { ChatMessage } from '@/service/chat/types';
import { getErrorMessage } from '@/core/errors';

/**
 * Create a basic chat message with timestamps.
 * 
 * @param role Message role (user, assistant, or system)
 * @param content Message content
 * @param model Model ID
 * @param provider Provider ID
 * @param timezone Timezone string
 * @returns ChatMessage object
 */
export function createChatMessage(
	role: ChatMessage['role'],
	content: string,
	model: string,
	provider: string,
	timezone: string
): ChatMessage {
	const timestamp = Date.now();
	return {
		id: generateUuidWithoutHyphens(),
		role,
		content,
		model,
		provider,
		createdAtTimestamp: timestamp,
		createdAtZone: timezone,
		starred: false,
	};
}

/**
 * Create an error message in the same format as a normal assistant message.
 * 
 * @param error Error object or error message string
 * @param model Model ID
 * @param provider Provider ID
 * @param timezone Timezone string
 * @returns ChatMessage with isErrorMessage set to true
 */
export function createChatErrorMessage(
	error: unknown,
	model: string,
	provider: string,
	timezone: string
): ChatMessage {
	const errorContent = getErrorMessage(error);
	const message = createChatMessage('assistant', errorContent, model, provider, timezone);
	message.isErrorMessage = true;
	return message;
}

