// T11P (Track A): Named operations the chat surface exposes for opening
// conversations / projects from anywhere in the app. UI calls
// `useChatNavigation()` which returns a `ChatNavigationPort`; app callers
// (events, commands) call `createChatNavigation(deps)` directly.
//
// The implementation lives in `src/ui/view/chat-view/chatNavigation.ts`
// because it must update the chat-view Zustand stores, which live in `ui/`.
// The port type is published here so the implementation and the
// `ServiceContext` field type both depend on a neutral contract.

import type {
	ChatConversation,
	ChatProject,
	PendingConversation,
} from '@/service/chat/types';

export interface ChatNavigationPort {
	revealChatView(): Promise<void>;
	openConversationInChat(
		conversation: ChatConversation,
		opts?: { loadMessages?: boolean },
	): Promise<ChatConversation>;
	openConversationByIdInChat(conversationId: string): Promise<ChatConversation | null>;
	openConversationMessageInChat(conversationId: string, messageId: string): Promise<void>;
	openPendingConversationInChat(pending: PendingConversation | null): Promise<void>;
	openProjectOverviewInChat(project: ChatProject): Promise<void>;
	openProjectConversationsListInChat(project: ChatProject): Promise<void>;
	openAllProjectsInChat(): Promise<void>;
	openAllConversationsInChat(): Promise<void>;
}
