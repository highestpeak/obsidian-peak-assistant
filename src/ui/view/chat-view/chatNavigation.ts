import type { EventBus } from '@/core/eventBus';
import { SelectionChangedEvent, ScrollToMessageEvent } from '@/core/eventBus';
import { AppContext } from '@/app/context/AppContext';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { ChatConversation, ChatProject, PendingConversation } from '@/service/chat/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

interface ChatNavigationOptions {
	manager?: AIServiceManager;
	viewManager?: ViewManager;
	eventBus?: EventBus;
}

function getViewManager(options?: ChatNavigationOptions): ViewManager {
	return options?.viewManager ?? AppContext.getViewManager();
}

function getManager(options?: ChatNavigationOptions): AIServiceManager {
	return options?.manager ?? AppContext.getManager();
}

function getEventBus(options?: ChatNavigationOptions): EventBus {
	return options?.eventBus ?? AppContext.getEventBus();
}

export async function revealChatView(options?: ChatNavigationOptions): Promise<void> {
	await getViewManager(options).getViewSwitchConsistentHandler().activateChatView();
}

function dispatchSelectionChanged(
	conversationId: string | null,
	projectId: string | null,
	options?: ChatNavigationOptions,
): void {
	getEventBus(options).dispatch(new SelectionChangedEvent({ conversationId, projectId }));
}

export async function openConversationInChat(
	conversation: ChatConversation,
	options?: ChatNavigationOptions & { loadMessages?: boolean },
): Promise<ChatConversation> {
	const shouldLoadMessages = options?.loadMessages ?? true;
	const selectedConversation = shouldLoadMessages
		? await getManager(options).readConversation(conversation.meta.id, true) ?? conversation
		: conversation;

	useChatViewStore.getState().setConversation(selectedConversation);
	useChatDataStore.getState().updateConversation(selectedConversation);
	await revealChatView(options);
	dispatchSelectionChanged(
		selectedConversation.meta.id,
		selectedConversation.meta.projectId ?? null,
		options,
	);
	return selectedConversation;
}

export async function openConversationByIdInChat(
	conversationId: string,
	options?: ChatNavigationOptions,
): Promise<ChatConversation | null> {
	const conversation = await getManager(options).readConversation(conversationId, true);
	if (!conversation) return null;
	await openConversationInChat(conversation, { ...options, loadMessages: false });
	return conversation;
}

export async function openConversationMessageInChat(
	conversationId: string,
	messageId: string,
	options?: ChatNavigationOptions,
): Promise<void> {
	const conversation = await openConversationByIdInChat(conversationId, options);
	if (!conversation) return;
	requestAnimationFrame(() => {
		getEventBus(options).dispatch(new ScrollToMessageEvent({ messageId }));
	});
}

export async function openPendingConversationInChat(
	pending: PendingConversation | null,
	options?: ChatNavigationOptions,
): Promise<void> {
	useChatViewStore.getState().setPendingConversation(pending);
	useChatDataStore.getState().setActiveProject(pending?.project ?? null);
	await revealChatView(options);
	dispatchSelectionChanged(null, pending?.project?.meta.id ?? null, options);
}

export async function openProjectOverviewInChat(
	project: ChatProject,
	options?: ChatNavigationOptions,
): Promise<void> {
	useChatViewStore.getState().setProjectOverview(project);
	useChatDataStore.getState().setActiveProject(project);
	await revealChatView(options);
	dispatchSelectionChanged(null, project.meta.id, options);
}

export async function openProjectConversationsListInChat(
	project: ChatProject,
	options?: ChatNavigationOptions,
): Promise<void> {
	useChatViewStore.getState().setProjectConversationsList(project);
	useChatDataStore.getState().setActiveProject(project);
	await revealChatView(options);
	dispatchSelectionChanged(null, project.meta.id, options);
}

export async function openAllProjectsInChat(options?: ChatNavigationOptions): Promise<void> {
	useChatViewStore.getState().setAllProjects();
	useChatDataStore.getState().setActiveProject(null);
	useChatDataStore.getState().setActiveConversation(null);
	await revealChatView(options);
	dispatchSelectionChanged(null, null, options);
}

export async function openAllConversationsInChat(options?: ChatNavigationOptions): Promise<void> {
	useChatViewStore.getState().setAllConversations();
	useChatDataStore.getState().setActiveProject(null);
	useChatDataStore.getState().setActiveConversation(null);
	await revealChatView(options);
	dispatchSelectionChanged(null, null, options);
}

export async function openChatHome(options?: ChatNavigationOptions): Promise<void> {
	useChatViewStore.getState().setHome();
	useChatDataStore.getState().setActiveProject(null);
	useChatDataStore.getState().setActiveConversation(null);
	await revealChatView(options);
	dispatchSelectionChanged(null, null, options);
}
