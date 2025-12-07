import { create } from 'zustand';
import { ChatMessage } from '@/service/chat/types';

interface MessageStore {
	// Streaming state
	streamingMessageId: string | null;
	streamingContent: string;
	streamingRole: ChatMessage['role'] | null;

	// Actions
	startStreaming: (messageId: string, role: ChatMessage['role']) => void;
	appendStreamingDelta: (delta: string) => void;
	completeStreaming: (message: ChatMessage) => void;
	errorStreaming: () => void;
	clearStreaming: () => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
	// Initial state
	streamingMessageId: null,
	streamingContent: '',
	streamingRole: null,

	// Actions
	startStreaming: (messageId: string, role: ChatMessage['role']) =>
		set({
			streamingMessageId: messageId,
			streamingContent: '',
			streamingRole: role,
		}),

	appendStreamingDelta: (delta: string) =>
		set((state) => ({
			streamingContent: state.streamingContent + delta,
		})),

	completeStreaming: (message: ChatMessage) =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
		}),

	errorStreaming: () =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
		}),

	clearStreaming: () =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
		}),
}));

