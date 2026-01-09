import { create } from 'zustand';
import { ChatMessage } from '@/service/chat/types';

export interface ToolCallInfo {
	toolName: string;
	input?: any;
	output?: any;
	isActive: boolean;
}

export interface MessageStore {
	// Streaming state
	streamingMessageId: string | null;
	streamingContent: string;
	streamingRole: ChatMessage['role'] | null;

	// Reasoning streaming state
	reasoningContent: string;
	isReasoningActive: boolean;

	// Tool calls state
	currentToolCalls: ToolCallInfo[];
	isToolSequenceActive: boolean;
	currentToolName: string | null; // Track current tool for input-delta events

	// Actions
	startStreaming: (messageId: string, role: ChatMessage['role']) => void;
	appendStreamingDelta: (delta: string) => void;
	completeStreaming: (message: ChatMessage) => void;
	clearStreaming: () => void;

	// Reasoning actions
	startReasoning: () => void;
	appendReasoningDelta: (delta: string) => void;
	completeReasoning: () => void;
	clearReasoning: () => void;

	// Tool actions
	startToolCall: (toolName: string, input?: any) => void;
	updateToolCall: (toolName: string, input?: any) => void;
	completeToolCall: (toolName: string, output?: any) => void;
	endToolSequence: () => void;
	clearToolCalls: () => void;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
	// Initial state
	streamingMessageId: null,
	streamingContent: '',
	streamingRole: null,
	reasoningContent: '',
	isReasoningActive: false,
	currentToolCalls: [],
	isToolSequenceActive: false,
	currentToolName: null,

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

	clearStreaming: () =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
		}),

	// Reasoning actions
	startReasoning: () =>
		set({
			reasoningContent: '',
			isReasoningActive: true,
		}),

	appendReasoningDelta: (delta: string) =>
		set((state) => ({
			reasoningContent: state.reasoningContent + delta,
		})),

	completeReasoning: () =>
		set({
			isReasoningActive: false,
		}),

	clearReasoning: () =>
		set({
			reasoningContent: '',
			isReasoningActive: false,
		}),

	// Tool actions
	startToolCall: (toolName: string, input?: any) =>
		set((state) => ({
			currentToolCalls: [...state.currentToolCalls, { toolName, input, isActive: true }],
			isToolSequenceActive: true,
			currentToolName: toolName,
		})),

	updateToolCall: (toolName: string, input?: any) =>
		set((state) => ({
			currentToolCalls: state.currentToolCalls.map(call =>
				call.toolName === toolName
					? { ...call, input: input !== undefined ? { ...call.input, ...input } : call.input }
					: call
			),
		})),

	completeToolCall: (toolName: string, output?: any) =>
		set((state) => ({
			currentToolCalls: state.currentToolCalls.map(call =>
				call.toolName === toolName
					? { ...call, isActive: false, output }
					: call
			),
		})),

	endToolSequence: () =>
		set({
			isToolSequenceActive: false,
		}),

	clearToolCalls: () =>
		set({
			currentToolCalls: [],
			isToolSequenceActive: false,
			currentToolName: null,
		}),

}));

