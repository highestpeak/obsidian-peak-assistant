/**
 * T11I (2026-06-26): port for chat runtime UI toggles read by the
 * service layer (system prompt builder + conversation streamer).
 *
 * The previous design called `useChatViewStore.getState()` from
 * `SystemPromptSlot` and `ConversationService`, which made service
 * files import the UI Zustand store. The app-layer adapter
 * (`src/app/chat/ChatRuntimeStateAdapter.ts`) wraps that store; the
 * service files only see this interface.
 *
 * All three reads are pull-style. No actions / setters: the service
 * layer does not write UI toggle state.
 */

export type ChatRuntimeMode = 'chat' | 'agent' | 'plan';

export interface ChatRuntimeStatePort {
	getChatMode(): ChatRuntimeMode;
	isWebSearchEnabled(): boolean;
	isVaultSearchEnabled(): boolean;
	/**
	 * 2026-07-21 (source-truth): whether the Vault retrieval port is wired.
	 * Optional so legacy adapters (tests) don't have to implement it — the
	 * default is `true` to match the pre-fix behavior. The runtime adapter
	 * returns the honest value from `ConversationService.isVaultSearchAvailable()`
	 * so `SystemPromptSlot` no longer hardcodes `true`.
	 */
	isVaultSearchAvailable?(): boolean;
}
