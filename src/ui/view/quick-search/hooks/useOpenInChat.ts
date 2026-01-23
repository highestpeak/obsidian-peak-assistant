import { useCallback } from 'react';
import { EventBus, SelectionChangedEvent } from '@/core/eventBus';
import { CHAT_VIEW_TYPE } from '@/app/view/types';
import type { SearchResultItem } from '@/service/search/types';
import { useServiceContext } from '@/ui/context/ServiceContext';

export function useOpenInChat(
	searchQuery: string,
	summary: string,
	sources: SearchResultItem[],
	topics: Array<{ label: string; weight: number }>,
	setError: (error: string | null) => void,
	onClose?: () => void
) {
	const { app, manager, viewManager } = useServiceContext();

	const handleOpenInChat = useCallback(async () => {
		try {
			console.debug('[AISearchTab] handleOpenInChat called', {
				query: searchQuery,
				sourcesCount: sources.length,
				topicsCount: topics.length,
			});

			// Step 1: Create conversation from search analysis
			console.debug('[AISearchTab] Step 1: Creating conversation from search analysis...');
			const conversation = await manager.createConvFromSearchAIAnalysis({
				query: searchQuery,
				summary: summary,
				sources: sources,
				topics: topics.length > 0 ? topics : undefined,
			});
			console.debug('[AISearchTab] Conversation created', {
				conversationId: conversation.meta.id,
				projectId: conversation.meta.projectId ?? null,
			});

			// Step 2: Wait for conversation to be fully persisted
			console.debug('[AISearchTab] Step 2: Waiting for conversation persistence...');
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					setTimeout(() => resolve(), 50);
				});
			});
			console.debug('[AISearchTab] Conversation persistence wait completed');

			// Step 3: Activate chat view
			console.debug('[AISearchTab] Step 3: Activating chat view...');
			if (viewManager) {
				const handler = viewManager.getViewSwitchConsistentHandler();
				if (handler) {
					await handler.activateChatView();
					console.debug('[AISearchTab] Chat view activated');
				} else {
					console.warn('[AISearchTab] ViewSwitchConsistentHandler not available');
				}
			} else {
				console.warn('[AISearchTab] ViewManager not available');
			}

			// Step 4: Wait for chat view to be ready
			console.debug('[AISearchTab] Step 4: Waiting for chat view to be ready...');
			let retries = 0;
			let chatViewReady = false;
			while (retries < 20) { // Increased retries for more reliable loading
				const chatLeaves = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
				if (chatLeaves.length > 0 && chatLeaves[0]?.view) {
					console.debug('[AISearchTab] Chat view is ready', { retries });
					chatViewReady = true;
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
				retries++;
			}
			if (!chatViewReady) {
				console.warn('[AISearchTab] Chat view not ready after 20 retries');
			}

			// Step 5: Wait a bit more to ensure view is fully initialized
			await new Promise(resolve => setTimeout(resolve, 200));

			// Step 6: Dispatch selection change event
			console.debug('[AISearchTab] Step 6: Dispatching SelectionChangedEvent...');
			const eventBus = EventBus.getInstance(app);
			eventBus.dispatch(new SelectionChangedEvent({
				conversationId: conversation.meta.id,
				projectId: conversation.meta.projectId ?? null,
			}));
			console.debug('[AISearchTab] SelectionChangedEvent dispatched successfully');

			// Step 7: Wait a bit more to ensure event is processed
			await new Promise(resolve => setTimeout(resolve, 100));

			// Step 8: Close the search modal
			console.debug('[AISearchTab] Step 8: Closing search modal...');
			onClose?.();
		} catch (e) {
			console.error('[AISearchTab] Open in chat failed:', e);
			setError(e instanceof Error ? e.message : 'Failed to open in chat');
		}
	}, [searchQuery, summary, sources, topics, setError, onClose]);

	return handleOpenInChat;
}