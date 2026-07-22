/**
 * T11I (2026-06-26): app-layer adapter for ChatRuntimeStatePort.
 *
 * Wraps the UI `useChatViewStore` Zustand store. Instantiated once in
 * `main.ts` and threaded through `AIServiceManager` to
 * `SystemPromptSlot` and `ConversationService`.
 */

import type { ChatRuntimeMode, ChatRuntimeStatePort } from '@/core/ports/ChatRuntimeStatePort';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

export class ChatRuntimeStateAdapter implements ChatRuntimeStatePort {
	/**
	 * 2026-07-21 (source-truth): supplied by the app layer after the Vault
	 * retrieval port is wired. Returns the honest availability so
	 * SystemPromptSlot no longer hardcodes `vaultSearchAvailable: true`.
	 * Kept as an optional callback so tests can construct the adapter
	 * without a full ConversationService.
	 */
	constructor(private readonly vaultAvailability?: () => boolean) {}

	getChatMode(): ChatRuntimeMode {
		return useChatViewStore.getState().chatMode;
	}

	isWebSearchEnabled(): boolean {
		return useChatViewStore.getState().enableWebSearch;
	}

	isVaultSearchEnabled(): boolean {
		return useChatViewStore.getState().enableVaultSearch;
	}

	isVaultSearchAvailable(): boolean {
		return this.vaultAvailability ? this.vaultAvailability() : true;
	}
}
