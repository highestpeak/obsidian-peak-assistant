import React, { createContext, useContext, useEffect, useState } from 'react';
import {
	ChatStudioStrings,
	DEFAULT_CHAT_STUDIO_STRINGS,
	loadChatStudioStrings,
} from './chatStudioStrings';

/**
 * ChatStudioStringsProvider — hosts runtime-loaded
 * `templates/config/chat-studio.json` strings (chat-studio §12.4), falling
 * back to compiled defaults while loading. Mirrors chatStringsContext.tsx.
 */

const ChatStudioStringsContext = createContext<ChatStudioStrings>(DEFAULT_CHAT_STUDIO_STRINGS);

export const ChatStudioStringsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

/** Read the active Chat Studio strings — template overlays + defaults. */
export function useChatStudioStrings(): ChatStudioStrings {
	return useContext(ChatStudioStringsContext);
}
