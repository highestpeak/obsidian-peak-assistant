import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { openConversationByIdInChat, openConversationMessageInChat } from '@/ui/view/chat-view/chatNavigation';

/**
 * Hook for loading full conversation data and updating the store
 */
export function useConversationLoad() {
	const { manager, eventBus, viewManager } = useServiceContext();

	const loadConversation = useCallback(async (
		conversationId: string,		
	) => {
		try {
			await openConversationByIdInChat(conversationId, { manager, eventBus, viewManager });
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [manager, eventBus, viewManager]);

	const openConvAndScroll2Msg = useCallback(async (
		conversationId: string,
		messageId: string
	) => {
		try {
			await openConversationMessageInChat(conversationId, messageId, { manager, eventBus, viewManager });
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [manager, eventBus, viewManager]);

	return {
		loadConversation,
		openConvAndScroll2Msg,
	};
}
