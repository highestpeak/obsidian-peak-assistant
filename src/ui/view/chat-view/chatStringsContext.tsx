import React, { createContext, useContext, useEffect, useState } from 'react';
import {
	ChatStrings,
	DEFAULT_CHAT_STRINGS,
	loadChatStrings,
} from './chatStrings';

/**
 * ChatStringsProvider — React context that hosts the runtime-loaded
 * `templates/config/chat.json` strings, falling back to the compiled
 * `DEFAULT_CHAT_STRINGS` while the load is pending (so the very first paint
 * never shows undefined labels).
 *
 * Mount once at the chat-view root (`view-Messages.tsx`). All chat components
 * should read strings via `useChatStrings()` rather than importing
 * `CHAT_STRINGS` directly — that way edits to chat.json take effect on the
 * next view render without a plugin reload.
 *
 * The legacy `CHAT_STRINGS` export remains valid for non-React code paths
 * (e.g. service-layer error builders) — it always points at the compiled
 * defaults.
 */

const ChatStringsContext = createContext<ChatStrings>(DEFAULT_CHAT_STRINGS);

export const ChatStringsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [strings, setStrings] = useState<ChatStrings>(DEFAULT_CHAT_STRINGS);

	useEffect(() => {
		let cancelled = false;
		void loadChatStrings().then((loaded) => {
			if (!cancelled) setStrings(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<ChatStringsContext.Provider value={strings}>{children}</ChatStringsContext.Provider>
	);
};

/** Read the active ChatStrings — runtime template overlays + defaults. */
export function useChatStrings(): ChatStrings {
	return useContext(ChatStringsContext);
}
