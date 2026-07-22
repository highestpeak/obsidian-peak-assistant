import { create } from 'zustand';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';

/**
 * Ephemeral Assistant preview — UI mirror (Assistant Builder, 2026-07-21).
 *
 * The runtime source of truth lives on `ConversationService`
 * (`setEphemeralAssistant` / `getEphemeralAssistant`). This zustand store is
 * a pure UI mirror so the Composer's assistant chip can render the preview
 * name + "Preview" badge without hitting the service on every render.
 *
 * Contract: whoever writes to `ConversationService.ephemeralAssistants` MUST
 * also update this store so the two never drift. See
 * `AssistantBuilderModal.previewInConversation()` for the single entry point.
 */
export interface EphemeralAssistantState {
	/** conversationId → preview draft. Empty map = no active preview. */
	previews: Record<string, ChatAssistantDefinition>;
	setPreview: (conversationId: string, definition: ChatAssistantDefinition | null) => void;
	clearAll: () => void;
}

export const useEphemeralAssistantStore = create<EphemeralAssistantState>((set) => ({
	previews: {},
	setPreview: (conversationId, definition) => set((state) => {
		const next = { ...state.previews };
		if (definition) next[conversationId] = definition;
		else delete next[conversationId];
		return { previews: next };
	}),
	clearAll: () => set({ previews: {} }),
}));
