import { useCallback } from 'react';
import { ChatConversation, ChatProject } from '@/service/chat/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ScrollToMessageEvent, ViewEventType } from '@/core/eventBus';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

/**
 * Hook for loading full conversation data and updating the store
 */
export function useConversationLoad() {
	const { manager, eventBus } = useServiceContext();

	const loadConversation = useCallback(async (
		conversationId: string,		
	) => {
		try {
			const fullConversation = await manager.readConversation(conversationId, true);
			if (fullConversation) {
				// Import store dynamically to avoid circular dependencies
				const store = useChatViewStore.getState();
				store.setConversation(fullConversation);
			}
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [manager]);

	const openConvAndScroll2Msg = useCallback(async (
		conversationId: string,
		messageId: string
	) => {
		try {
			const fullConversation = await manager.readConversation(conversationId, true);
			if (fullConversation) {
				// Import store dynamically to avoid circular dependencies
				const store = useChatViewStore.getState();
				store.setConversation(fullConversation);
				// Scroll to message after conversation is loaded
				requestAnimationFrame(() => {
					eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
				});
			}
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}, [manager, eventBus]);

	return {
		loadConversation,
		openConvAndScroll2Msg,
	};
}