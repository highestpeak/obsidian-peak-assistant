import React from 'react';
import { ConversationIndex } from '@/ui/view/chat-view/components/ConversationIndex';
import { ChatStringsProvider } from '@/ui/view/chat-view/chatStringsContext';

/**
 * ConversationOutlineView (React entry).
 *
 * Hosted inside the Obsidian right-sidebar ItemView (peak-conversation-outline-view).
 * Reuses the existing <ConversationIndex /> 4-tab UI verbatim — the component
 * is already a pure consumer of the global `useChatDataStore`, so no props are
 * required to make it work outside the chat shell.
 *
 * We still wrap with ChatStringsProvider so labels stay overridable via the
 * runtime `templates/config/chat.json` (same as the chat surface).
 */
export const ConversationOutlinePanel: React.FC = () => (
	<ChatStringsProvider>
		<ConversationIndex compact />
	</ChatStringsProvider>
);
