/**
 * chatDataStore — unified entity + message + streaming store.
 * Replaces projectStore + messageStore.
 */
import { create } from 'zustand';
import { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';

// ---------------------------------------------------------------------------
// Streaming buffers — accumulate deltas outside Zustand, flush via RAF.
// Prevents O(n²) string copies and limits re-renders to ~60fps.
// ---------------------------------------------------------------------------

const _chatStreamBuf = { text: '', raf: null as number | null };
const _reasoningBuf = { text: '', raf: null as number | null };

function _resetChatStreamBuf() {
	if (_chatStreamBuf.raf !== null) { cancelAnimationFrame(_chatStreamBuf.raf); _chatStreamBuf.raf = null; }
	_chatStreamBuf.text = '';
}
function _resetReasoningBuf() {
	if (_reasoningBuf.raf !== null) { cancelAnimationFrame(_reasoningBuf.raf); _reasoningBuf.raf = null; }
	_reasoningBuf.text = '';
}

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
	commitStreamingMessage: (message: ChatMessage) => void;
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

	startStreaming: (messageId: string, role: ChatMessage['role']) => {
		_resetChatStreamBuf();
		set({
			streamingMessageId: messageId,
			streamingContent: '',
			streamingRole: role,
			isStreaming: true,
		});
	},

	appendStreamingDelta: (delta: string) => {
		_chatStreamBuf.text += delta;
		if (_chatStreamBuf.raf === null) {
			_chatStreamBuf.raf = requestAnimationFrame(() => {
				_chatStreamBuf.raf = null;
				set({ streamingContent: _chatStreamBuf.text });
			});
		}
	},

	completeStreaming: (_message: ChatMessage) => {
		// Flush final content but keep streamingMessageId alive
		// so the streaming bubble stays visible until commitStreamingMessage replaces it
		if (_chatStreamBuf.text) {
			set({ streamingContent: _chatStreamBuf.text });
		}
		_resetChatStreamBuf();
		set({ isStreaming: false });
	},

	/** Atomically transition from streaming bubble → saved message. No flash. */
	commitStreamingMessage: (message: ChatMessage) => {
		_resetChatStreamBuf();
		set((s) => ({
			messages: [...s.messages, message],
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
			isStreaming: false,
		}));
	},

	clearStreaming: () => {
		_resetChatStreamBuf();
		set({
			streamingMessageId: null,
			streamingContent: '',
			streamingRole: null,
			isStreaming: false,
		});
	},

	// ── Reasoning actions ──

	startReasoning: () => {
		_resetReasoningBuf();
		set({ reasoningContent: '', isReasoningActive: true });
	},
	appendReasoningDelta: (delta: string) => {
		_reasoningBuf.text += delta;
		if (_reasoningBuf.raf === null) {
			_reasoningBuf.raf = requestAnimationFrame(() => {
				_reasoningBuf.raf = null;
				set({ reasoningContent: _reasoningBuf.text });
			});
		}
	},
	completeReasoning: () => {
		if (_reasoningBuf.text) {
			set({ reasoningContent: _reasoningBuf.text });
		}
		_resetReasoningBuf();
		set({ isReasoningActive: false });
	},
	clearReasoning: () => {
		_resetReasoningBuf();
		set({ reasoningContent: '', isReasoningActive: false });
	},

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
