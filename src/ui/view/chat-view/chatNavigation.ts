import type { EventBus } from '@/core/eventBus';
import { SelectionChangedEvent, ScrollToMessageEvent } from '@/core/eventBus';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { ChatConversation, ChatProject, PendingConversation } from '@/service/chat/types';
import type { ViewActivationPort } from '@/core/ports/ViewActivationPort';
import type { ChatNavigationPort } from '@/core/ports/ChatNavigationPort';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

export interface ChatNavigationDeps {
	manager: AIServiceManager;
	viewManager: ViewActivationPort;
	eventBus: EventBus;
}

/**
 * T11P (Track A): The single place chat navigation is wired. App callers
 * (Register.ts, PeakCommandActions.ts) call this factory directly with their
 * `AppContext` ports; UI callers use the `useChatNavigation()` hook, which
 * reads a pre-bound instance off `ServiceContext`.
 *
 * No `AppContext.getInstance()` fallback remains. Pre-T11P, every
 * `openX(_, options?)` helper would call `AppContext.getViewManager()` when
 * `options.viewManager` was omitted, which kept `src/ui/` statically coupled
 * to `src/app/context/AppContext`.
 */
export function createChatNavigation(deps: ChatNavigationDeps): ChatNavigationPort {
	const { manager, viewManager, eventBus } = deps;

	const dispatchSelectionChanged = (
		conversationId: string | null,
		projectId: string | null,
	): void => {
		eventBus.dispatch(new SelectionChangedEvent({ conversationId, projectId }));
	};

	const revealChatView = async (): Promise<void> => {
		await viewManager.getViewSwitchConsistentHandler().activateChatView();
	};

	const openConversationInChat = async (
		conversation: ChatConversation,
		opts?: { loadMessages?: boolean },
	): Promise<ChatConversation> => {
		const shouldLoadMessages = opts?.loadMessages ?? true;
		const selectedConversation = shouldLoadMessages
			? await manager.readConversation(conversation.meta.id, true) ?? conversation
			: conversation;

		useChatViewStore.getState().setConversation(selectedConversation);
		useChatDataStore.getState().updateConversation(selectedConversation);
		await revealChatView();
		dispatchSelectionChanged(
			selectedConversation.meta.id,
			selectedConversation.meta.projectId ?? null,
		);
		return selectedConversation;
	};

	const openConversationByIdInChat = async (
		conversationId: string,
	): Promise<ChatConversation | null> => {
		const conversation = await manager.readConversation(conversationId, true);
		if (!conversation) return null;
		await openConversationInChat(conversation, { loadMessages: false });
		return conversation;
	};

	const openConversationMessageInChat = async (
		conversationId: string,
		messageId: string,
	): Promise<void> => {
		const conversation = await openConversationByIdInChat(conversationId);
		if (!conversation) return;
		requestAnimationFrame(() => {
			eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
		});
	};

	const openPendingConversationInChat = async (
		pending: PendingConversation | null,
	): Promise<void> => {
		useChatViewStore.getState().setPendingConversation(pending);
		useChatDataStore.getState().setActiveProject(pending?.project ?? null);
		await revealChatView();
		dispatchSelectionChanged(null, pending?.project?.meta.id ?? null);
	};

	const openProjectOverviewInChat = async (project: ChatProject): Promise<void> => {
		useChatViewStore.getState().setProjectOverview(project);
		useChatDataStore.getState().setActiveProject(project);
		await revealChatView();
		dispatchSelectionChanged(null, project.meta.id);
	};

	const openProjectConversationsListInChat = async (project: ChatProject): Promise<void> => {
		useChatViewStore.getState().setProjectConversationsList(project);
		useChatDataStore.getState().setActiveProject(project);
		await revealChatView();
		dispatchSelectionChanged(null, project.meta.id);
	};

	const openAllProjectsInChat = async (): Promise<void> => {
		useChatViewStore.getState().setAllProjects();
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		await revealChatView();
		dispatchSelectionChanged(null, null);
	};

	const openAllConversationsInChat = async (): Promise<void> => {
		useChatViewStore.getState().setAllConversations();
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		await revealChatView();
		dispatchSelectionChanged(null, null);
	};

	return {
		revealChatView,
		openConversationInChat,
		openConversationByIdInChat,
		openConversationMessageInChat,
		openPendingConversationInChat,
		openProjectOverviewInChat,
		openProjectConversationsListInChat,
		openAllProjectsInChat,
		openAllConversationsInChat,
	};
}
