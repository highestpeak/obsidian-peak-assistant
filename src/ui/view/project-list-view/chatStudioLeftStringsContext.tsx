import React, { createContext, useContext, useEffect, useState } from 'react';
import {
	ChatStudioStrings,
	DEFAULT_CHAT_STUDIO_STRINGS,
	loadChatStudioStrings,
} from '@/ui/view/chat-view/chatStudioStrings';

/**
 * ChatStudioLeftStringsProvider — publishes runtime-loaded chat-studio config
 * strings so the left column can render labels/menu items/group headers/etc.
 * without hard-coding English or Chinese in logic files. Falls back to the
 * compiled defaults (`templates/config/chat-studio.json`) on the first paint
 * and while the async load is pending.
 *
 * Mount once at the root of the left column (ProjectListViewComponent) — the
 * whole subtree reads `useChatStudioLeftStrings()`.
 */

const ChatStudioStringsContext = createContext<ChatStudioStrings>(DEFAULT_CHAT_STUDIO_STRINGS);

export const ChatStudioLeftStringsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [strings, setStrings] = useState<ChatStudioStrings>(DEFAULT_CHAT_STUDIO_STRINGS);

	useEffect(() => {
		let cancelled = false;
		void loadChatStudioStrings().then((loaded) => {
			if (!cancelled) setStrings(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<ChatStudioStringsContext.Provider value={strings}>{children}</ChatStudioStringsContext.Provider>
	);
};

/** Read the active ChatStudioStrings (runtime template overlays + defaults). */
export function useChatStudioLeftStrings(): ChatStudioStrings['leftColumn'] {
	return useContext(ChatStudioStringsContext).leftColumn;
}

/** Full-object accessor for consumers that need more than the left section. */
export function useChatStudioStrings(): ChatStudioStrings {
	return useContext(ChatStudioStringsContext);
}
