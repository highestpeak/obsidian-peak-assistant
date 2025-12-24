import React, { useEffect } from 'react';
import { ChatConversation, ChatProject } from '@/service/chat/types';
import { ViewMode } from './store/chatViewStore';
import { AllConversationsViewComponent } from './view-AllConversations';
import { AllProjectsViewComponent } from './view-AllProjects';
import { ProjectOverviewViewComponent } from './view-ProjectOverview';
import { ProjectConversationsListViewComponent } from './view-ProjectConversationsList';
import { MessagesViewComponent } from './view-Messages';
import { useChatViewStore } from './store/chatViewStore';
import { ScrollToMessageEvent, ShowToastEvent, ViewEventType } from '@/core/eventBus';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Toaster, toast as sonnerToast } from 'sonner';

interface ChatViewComponentProps {
	viewMode: ViewMode | null;
}

/**
 * Unified ChatView component that renders different views based on viewMode
 */
export const ChatViewComponent: React.FC<ChatViewComponentProps> = ({
	viewMode,
}) => {
	const { eventBus } = useServiceContext();
	const store = useChatViewStore();

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

	// Render body content based on viewMode
	if (!viewMode) {
		return null;
	}

	const renderContent = () => {
		switch (viewMode) {
			case ViewMode.ALL_PROJECTS:
				return (
					<AllProjectsViewComponent
						onProjectClick={(project: ChatProject) => {
							store.setProjectOverview(project);
						}}
					/>
				);

			case ViewMode.ALL_CONVERSATIONS:
				return (
					<AllConversationsViewComponent
						onConversationClick={(conversation: ChatConversation) => {
							store.setConversation(conversation);
						}}
					/>
				);

			case ViewMode.PROJECT_OVERVIEW:
				if (!store.projectForOverview) return null;
				const projectId = store.projectForOverview.meta.id;
				return (
					<ProjectOverviewViewComponent
						projectId={projectId}
						onConversationClick={(conversation: ChatConversation, project: ChatProject) => {
							store.setConversation(conversation);
						}}
						onMessageClick={(conversation: ChatConversation, project: ChatProject, messageId: string) => {
							store.setConversation(conversation);
							requestAnimationFrame(() => {
								eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
							});
						}}
					/>
				);

			case ViewMode.PROJECT_CONVERSATIONS_LIST:
				if (!store.projectForOverview) return null;
				const projectIdForList = store.projectForOverview.meta.id;
				return (
					<ProjectConversationsListViewComponent
						projectId={projectIdForList}
						onConversationClick={(conversation: ChatConversation) => {
							store.setConversation(conversation);
						}}
					/>
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

