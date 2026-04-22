/**
 * chatDataStore — unified entity + message + streaming store.
 * Replaces projectStore + messageStore.
 */
import { create } from 'zustand';
import { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallInfo {
	toolName: string;
	input?: any;
	output?: any;
	isActive: boolean;
}

interface ChatDataState {
	// ── Entities (from projectStore) ──
	projects: Map<string, ChatProject>;
	conversations: Map<string, ChatConversation>;
	expandedProjects: Set<string>;
	activeProject: ChatProject | null;
	activeConversation: ChatConversation | null;
	isProjectsCollapsed: boolean;
	isConversationsCollapsed: boolean;

	// ── Messages (from messageStore) ──
	messages: ChatMessage[];

	// ── Streaming (from messageStore) ──
	streamingMessageId: string | null;
	streamingContent: string;
	streamingRole: ChatMessage['role'] | null;
	reasoningContent: string;
	isReasoningActive: boolean;
	currentToolCalls: ToolCallInfo[];
	isToolSequenceActive: boolean;
	currentToolName: string | null;
	isStreaming: boolean;
}

interface ChatDataActions {
	// ── Entity actions ──
	setProjects: (projects: ChatProject[]) => void;
	setConversations: (conversations: ChatConversation[]) => void;
	toggleProjectExpanded: (projectId: string) => void;
	setActiveProject: (project: ChatProject | string | null) => void;
	setActiveConversation: (conversation: ChatConversation | string | null) => void;
	toggleProjectsCollapsed: () => void;
	toggleConversationsCollapsed: () => void;
	clearExpandedProjects: () => void;
	updateProject: (project: ChatProject) => void;
	updateConversation: (conversation: ChatConversation) => void;
	deleteConversation: (id: string) => void;

	// ── Message actions ──
	setMessages: (messages: ChatMessage[]) => void;
	addMessage: (message: ChatMessage) => void;
	updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
	clearMessages: () => void;

	// ── Streaming actions ──
	startStreaming: (messageId: string, role: ChatMessage['role']) => void;
	appendStreamingDelta: (delta: string) => void;
	completeStreaming: (message: ChatMessage) => void;
	clearStreaming: () => void;

	// ── Reasoning actions ──
	startReasoning: () => void;
	appendReasoningDelta: (delta: string) => void;
	completeReasoning: () => void;
	clearReasoning: () => void;

	// ── Tool actions ──
	startToolCall: (toolName: string, input?: any) => void;
	updateToolCall: (toolName: string, input?: any) => void;
	completeToolCall: (toolName: string, output?: any) => void;
	endToolSequence: () => void;
	clearToolCalls: () => void;

	// ── Lifecycle ──
	reset: () => void;
}

export type ChatDataStore = ChatDataState & ChatDataActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: ChatDataState = {
	projects: new Map(),
	conversations: new Map(),
	expandedProjects: new Set(),
	activeProject: null,
	activeConversation: null,
	isProjectsCollapsed: false,
	isConversationsCollapsed: false,
	messages: [],
	streamingMessageId: null,
	streamingContent: '',
	streamingRole: null,
	reasoningContent: '',
	isReasoningActive: false,
	currentToolCalls: [],
	isToolSequenceActive: false,
	currentToolName: null,
	isStreaming: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatDataStore = create<ChatDataStore>((set, get) => ({
	...INITIAL_STATE,

	// ── Entity actions ──

	setProjects: (projects: ChatProject[]) =>
		set({ projects: new Map(projects.map(p => [p.meta.id, p])) }),

	setConversations: (conversations: ChatConversation[]) =>
		set({ conversations: new Map(conversations.map(c => [c.meta.id, c])) }),

	toggleProjectExpanded: (projectId: string) =>
		set((state) => {
			const next = new Set(state.expandedProjects);
			if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
			return { expandedProjects: next };
		}),

	setActiveProject: (project: ChatProject | string | null) =>
		set((state) => {
			if (project === null) return { activeProject: null };
			if (typeof project === 'string') return { activeProject: state.projects.get(project) ?? null };
			return { activeProject: project };
		}),

	setActiveConversation: (conversation: ChatConversation | string | null) =>
		set((state) => {
			if (conversation === null) return { activeConversation: null };
			if (typeof conversation === 'string') return { activeConversation: state.conversations.get(conversation) ?? null };
			return { activeConversation: conversation };
		}),

	toggleProjectsCollapsed: () =>
		set((s) => ({ isProjectsCollapsed: !s.isProjectsCollapsed })),

	toggleConversationsCollapsed: () =>
		set((s) => ({ isConversationsCollapsed: !s.isConversationsCollapsed })),

	clearExpandedProjects: () => set({ expandedProjects: new Set() }),

	updateProject: (project: ChatProject) =>
		set((state) => {
			const next = new Map(state.projects);
			next.set(project.meta.id, project);
			return { projects: next };
		}),

	updateConversation: (conversation: ChatConversation) =>
		set((state) => {
			const next = new Map(state.conversations);
			next.set(conversation.meta.id, conversation);
			return { conversations: next };
		}),

	deleteConversation: (id: string) =>
		set((state) => {
			const next = new Map(state.conversations);
			next.delete(id);
			const activeCleared = state.activeConversation?.meta.id === id;
			return {
				conversations: next,
				...(activeCleared ? { activeConversation: null, messages: [] } : {}),
			};
		}),

	// ── Message actions ──

	setMessages: (messages: ChatMessage[]) => set({ messages }),

	addMessage: (message: ChatMessage) =>
		set((s) => ({ messages: [...s.messages, message] })),

	updateMessage: (id: string, updates: Partial<ChatMessage>) =>
		set((s) => ({
			messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m),
		})),

	clearMessages: () => set({ messages: [] }),

	// ── Streaming actions ──

	startStreaming: (messageId: string, role: ChatMessage['role']) =>
		set({
			streamingMessageId: messageId,
			streamingContent: '',
			streamingRole: role,
			isStreaming: true,
		}),

	appendStreamingDelta: (delta: string) =>
		set((s) => ({ streamingContent: s.streamingContent + delta })),

	completeStreaming: (_message: ChatMessage) =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
			isStreaming: false,
		}),

	clearStreaming: () =>
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
			isStreaming: false,
		}),

	// ── Reasoning actions ──

	startReasoning: () => set({ reasoningContent: '', isReasoningActive: true }),
	appendReasoningDelta: (delta: string) =>
		set((s) => ({ reasoningContent: s.reasoningContent + delta })),
	completeReasoning: () => set({ isReasoningActive: false }),
	clearReasoning: () => set({ reasoningContent: '', isReasoningActive: false }),

	// ── Tool actions ──

	startToolCall: (toolName: string, input?: any) =>
		set((s) => ({
			currentToolCalls: [...s.currentToolCalls, { toolName, input, isActive: true }],
			isToolSequenceActive: true,
			currentToolName: toolName,
		})),

	updateToolCall: (toolName: string, input?: any) =>
		set((s) => ({
			currentToolCalls: s.currentToolCalls.map(c =>
				c.toolName === toolName
					? { ...c, input: input !== undefined ? { ...c.input, ...input } : c.input }
					: c,
			),
		})),

	completeToolCall: (toolName: string, output?: any) =>
		set((s) => ({
			currentToolCalls: s.currentToolCalls.map(c =>
				c.toolName === toolName ? { ...c, isActive: false, output } : c,
			),
		})),

	endToolSequence: () => set({ isToolSequenceActive: false }),

	clearToolCalls: () =>
		set({ currentToolCalls: [], isToolSequenceActive: false, currentToolName: null }),

	// ── Lifecycle ──

	reset: () => set(INITIAL_STATE),
}));
