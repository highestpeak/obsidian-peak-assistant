import { useCallback } from 'react';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';

/**
 * Hook for loading full conversation data and updating the store
 */
export function useConversationLoad() {
	const chatNavigation = useChatNavigation();

	const loadConversation = useCallback(async (
		conversationId: string,
	) => {
		try {
			await chatNavigation.openConversationByIdInChat(conversationId);
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [chatNavigation]);

	const openConvAndScroll2Msg = useCallback(async (
		conversationId: string,
		messageId: string
	) => {
		try {
			await chatNavigation.openConversationMessageInChat(conversationId, messageId);
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [chatNavigation]);

	return {
		loadConversation,
		openConvAndScroll2Msg,
	};
}
