import React, { useEffect } from 'react';
import { ViewMode } from './store/chatViewStore';
import { AllProjectsViewComponent } from './view-AllProjects';
import { ProjectOverviewViewComponent } from './view-ProjectOverview';
import { ProjectConversationsListViewComponent } from './view-ProjectConversationsList';
import { MessagesViewComponent } from './view-Messages';
import { HomeViewComponent } from './view-Home';
import { SelectionChangedEvent, ShowToastEvent, ViewEventType } from '@/core/eventBus';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Toaster, toast as sonnerToast } from 'sonner';
import { ConversationList } from './components/conversation-list';
import { useChatViewStore } from './store/chatViewStore';

interface ChatViewComponentProps {
}

/**
 * Unified ChatView component that renders different views based on viewMode
 */
export const ChatViewComponent: React.FC<ChatViewComponentProps> = () => {
	const { eventBus, manager } = useServiceContext();
	const { viewMode } = useChatViewStore();

	// Listen for toast events from other React instances
	useEffect(() => {
		const unsubscribe = eventBus.on<ShowToastEvent>(
			ViewEventType.SHOW_TOAST,
			(event) => {
				const toastOptions = {
					description: event.description,
					duration: event.duration,
					action: event.action,
				};

				switch (event.toastType) {
					case 'success':
						sonnerToast.success(event.message, toastOptions);
						break;
					case 'error':
						sonnerToast.error(event.message, toastOptions);
						break;
					case 'warning':
						sonnerToast.warning(event.message, toastOptions);
						break;
					case 'info':
						sonnerToast.info(event.message, toastOptions);
						break;
					default:
						sonnerToast(event.message, toastOptions);
						break;
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus]);

	useEffect(() => {
		const unsubscribe = eventBus.on<SelectionChangedEvent>(
			ViewEventType.SELECTION_CHANGED,
			async (event) => {
				if (!event.conversationId) {
					return;
				}
				console.log('[ChatView] Selection changed to conversation:', event.conversationId);
				// Just load the conversation by id using aiServiceManager
				const conversation = await manager.readConversation(event.conversationId);
				if (conversation) {
					useChatViewStore.getState().setConversation(conversation);
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus]);

	// Render body content based on viewMode
	if (!viewMode) {
		console.error('No view mode selected');
		return null;
	}

	const renderContent = () => {
		switch (viewMode) {
			case ViewMode.HOME:
				return (
					<HomeViewComponent />
				);
			case ViewMode.ALL_PROJECTS:
				return (
					<AllProjectsViewComponent />
				);
			case ViewMode.ALL_CONVERSATIONS:
				return (
					<ConversationList
						containerClass="pktw-w-4/6 pktw-mx-auto"
						maxPreviewLength={100}
						emptyText="No conversations yet."
					/>
				);
			case ViewMode.PROJECT_OVERVIEW:
				return (
					<ProjectOverviewViewComponent />
				);
			case ViewMode.PROJECT_CONVERSATIONS_LIST:
				return (
					<ProjectConversationsListViewComponent />
				);
			case ViewMode.CONVERSATION_IN_PROJECT:
			case ViewMode.STANDALONE_CONVERSATION:
				return (
					<MessagesViewComponent />
				);
			default:
				return null;
		}
	};

	return (
		<>
			{renderContent()}
			<Toaster position="top-center" richColors />
		</>
	);
};

