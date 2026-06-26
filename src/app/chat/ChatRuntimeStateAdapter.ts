/**
 * T11I (2026-06-26): app-layer adapter for ChatRuntimeStatePort.
 *
 * Wraps the UI `useChatViewStore` Zustand store. Instantiated once in
 * `main.ts` and threaded through `AIServiceManager` to
 * `SystemPromptSlot` and `ConversationService`.
 */

import type { ChatRuntimeMode, ChatRuntimeStatePort } from '@/service/chat/ChatRuntimeStatePort';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

export class ChatRuntimeStateAdapter implements ChatRuntimeStatePort {
	getChatMode(): ChatRuntimeMode {
		return useChatViewStore.getState().chatMode;
	}

	isWebSearchEnabled(): boolean {
		return useChatViewStore.getState().enableWebSearch;
	}

	isVaultSearchEnabled(): boolean {
		return useChatViewStore.getState().enableVaultSearch;
	}
}
