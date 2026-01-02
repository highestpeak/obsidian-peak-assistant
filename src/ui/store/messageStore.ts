import { create } from 'zustand';
import { ChatMessage } from '@/service/chat/types';
import type { ProgressStage, ProgressStatus } from '@/core/providers/types-events';

export interface StreamingStep {
	stage: ProgressStage;
	status: ProgressStatus;
	label: string;
	resourceSource?: string;
	resourceId?: string;
}

export interface MessageStore {
	// Streaming state
	streamingMessageId: string | null;
	streamingContent: string;
	streamingRole: ChatMessage['role'] | null;
	streamingSteps: StreamingStep[];

	// Actions
	startStreaming: (messageId: string, role: ChatMessage['role']) => void;
	appendStreamingDelta: (delta: string) => void;
	completeStreaming: (message: ChatMessage) => void;
	clearStreaming: () => void;
	addStreamingStep: (step: StreamingStep) => void;
	updateStreamingStep: (index: number, updates: Partial<StreamingStep>) => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
	// Initial state
	streamingMessageId: null,
	streamingContent: '',
	streamingRole: null,
	streamingSteps: [],

	// Actions
	startStreaming: (messageId: string, role: ChatMessage['role']) =>
		set({
			streamingMessageId: messageId,
			streamingContent: '',
			streamingRole: role,
			streamingSteps: [],
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
			streamingSteps: [],
		}),

	clearStreaming: () =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
			streamingSteps: [],
		}),

	addStreamingStep: (step: StreamingStep) =>
		set((state) => ({
			streamingSteps: [...state.streamingSteps, step],
		})),

	updateStreamingStep: (index: number, updates: Partial<StreamingStep>) =>
		set((state) => {
			const newSteps = [...state.streamingSteps];
			if (index >= 0 && index < newSteps.length) {
				newSteps[index] = { ...newSteps[index], ...updates };
			}
			return { streamingSteps: newSteps };
		}),
}));

