/**
 * chatViewStore — unified navigation + input + session settings store.
 * Replaces old chatViewStore + chatSessionStore.
 */
import { create } from 'zustand';
import { ChatProject, PendingConversation, ChatConversation } from '@/service/chat/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';

// ---------------------------------------------------------------------------
// Types (re-exported for consumers)
// ---------------------------------------------------------------------------

export enum ViewMode {
	HOME = 'home',
	ALL_PROJECTS = 'all-projects',
	ALL_CONVERSATIONS = 'all-conversations',
	PROJECT_OVERVIEW = 'project-overview',
	PROJECT_CONVERSATIONS_LIST = 'project-conversations-list',
	CONVERSATION_IN_PROJECT = 'conversation-in-project',
	STANDALONE_CONVERSATION = 'standalone-conversation',
}

export interface ChatTag {
	type: 'context' | 'prompt';
	text: string;
	start: number;
	end: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ChatViewState {
	// ── Navigation ──
	viewMode: ViewMode | null;
	projectForOverview: ChatProject | null;
	pendingConversation: PendingConversation | null;
	initialSelectedModel: { provider: string; modelId: string } | null;

	// ── Input history (#81) ──
	inputHistory: string[];
	historyIndex: number; // -1 = not navigating
	draftInput: string;

	// ── Session settings (absorbed from chatSessionStore) ──
	chatMode: 'chat' | 'agent' | 'plan';
	selectedModel: { provider: string; modelId: string } | undefined;
	isSearchActive: boolean;
	searchProvider: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch: boolean;
	enableVaultSearch: boolean;
	attachmentHandlingMode: 'direct' | 'degrade_to_text';
	llmOutputControlSettings: Record<string, any>;
	isCodeInterpreterEnabled: boolean;
	currentInputTags: ChatTag[];

	// ── Submit action (for StyleButtons / Quick Actions) ──
	submitAction: ((text: string) => void) | null;
	// ── Insert-to-input action (for Quote selection) ──
	insertToInput: ((text: string) => void) | null;

	// ── Continuation telemetry (PR-Chat-4 §11.4) ──
	// Set when an assistant stream completes; consulted on the next user
	// submit so we can record a `continuation` outcome event if the user
	// followed up within 60s. Pair with `lastAssistantMessageId` for the
	// outcome-event message_id field.
	lastAssistantCompletedAt: number | null;
	lastAssistantMessageId: string | null;
}

interface ChatViewActions {
	// ── Navigation actions ──
	setHome: () => void;
	setProjectOverview: (project: ChatProject) => void;
	setProjectConversationsList: (project: ChatProject) => void;
	setAllProjects: () => void;
	setAllConversations: () => void;
	setConversation: (conversation: ChatConversation) => void;
	setPendingConversation: (pending: PendingConversation | null) => void;
	setInitialSelectedModel: (model: { provider: string; modelId: string } | null) => void;

	// ── Input history actions ──
	pushInputHistory: (text: string) => void;
	navigateHistory: (direction: 'up' | 'down') => string | null;

	// ── Session settings actions ──
	setChatMode: (mode: 'chat' | 'agent' | 'plan') => void;
	setSelectedModel: (provider: string, modelId: string) => void;
	setSearchActive: (active: boolean) => void;
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	setEnableWebSearch: (enabled: boolean) => void;
	setEnableVaultSearch: (enabled: boolean) => void;
	setAttachmentHandlingMode: (mode: 'direct' | 'degrade_to_text') => void;
	setLlmOutputControlSettings: (settings: Record<string, any>) => void;
	setIsCodeInterpreterEnabled: (enabled: boolean) => void;
	setCurrentInputTags: (tags: ChatTag[]) => void;

	// ── Submit / Insert actions ──
	setSubmitAction: (fn: ((text: string) => void) | null) => void;
	setInsertToInput: (fn: ((text: string) => void) | null) => void;
	markAssistantCompleted: (messageId: string, ts?: number) => void;
	clearAssistantCompletion: () => void;

	// ── Lifecycle ──
	reset: () => void;
	resetSession: () => void;
}

type ChatViewStore = ChatViewState & ChatViewActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_SESSION: Pick<ChatViewState,
	'chatMode' | 'selectedModel' | 'isSearchActive' | 'searchProvider' | 'enableWebSearch' |
	'enableVaultSearch' | 'attachmentHandlingMode' | 'llmOutputControlSettings' |
	'isCodeInterpreterEnabled' | 'currentInputTags'
> = {
	chatMode: 'chat',
	selectedModel: undefined,
	isSearchActive: false,
	searchProvider: 'local',
	enableWebSearch: false,
	enableVaultSearch: false,
	attachmentHandlingMode: 'degrade_to_text',
	llmOutputControlSettings: {},
	isCodeInterpreterEnabled: false,
	currentInputTags: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatViewStore = create<ChatViewStore>((set, get) => ({
	// ── Navigation state ──
	viewMode: ViewMode.HOME,
	projectForOverview: null,
	pendingConversation: null,
	initialSelectedModel: null,

	// ── Input history ──
	inputHistory: [],
	historyIndex: -1,
	draftInput: '',

	// ── Session settings ──
	...INITIAL_SESSION,

	// ── Submit / Insert actions ──
	submitAction: null,
	insertToInput: null,

	// ── Continuation telemetry ──
	lastAssistantCompletedAt: null,
	lastAssistantMessageId: null,

	// ═══════════════════════════════════════════════════════════════════════
	// Navigation actions
	// ═══════════════════════════════════════════════════════════════════════

	setHome: () => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({ viewMode: ViewMode.HOME, projectForOverview: null, pendingConversation: null });
	},

	setProjectOverview: (project: ChatProject) => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({ viewMode: ViewMode.PROJECT_OVERVIEW, projectForOverview: project, pendingConversation: null });
	},

	setProjectConversationsList: (project: ChatProject) => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({ viewMode: ViewMode.PROJECT_CONVERSATIONS_LIST, projectForOverview: project, pendingConversation: null });
	},

	setAllProjects: () => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({ viewMode: ViewMode.ALL_PROJECTS, projectForOverview: null, pendingConversation: null });
	},

	setAllConversations: () => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({ viewMode: ViewMode.ALL_CONVERSATIONS, projectForOverview: null, pendingConversation: null });
	},

	setConversation: (conversation: ChatConversation) => {
		useChatDataStore.getState().setActiveConversation(conversation);
		const project = conversation.meta.projectId
			? useChatDataStore.getState().projects.get(conversation.meta.projectId) ?? null
			: null;
		useChatDataStore.getState().setActiveProject(project);
		set({
			viewMode: conversation.meta.projectId ? ViewMode.CONVERSATION_IN_PROJECT : ViewMode.STANDALONE_CONVERSATION,
			projectForOverview: null,
			pendingConversation: null,
			initialSelectedModel: null,
		});
	},

	setPendingConversation: (pending: PendingConversation | null) => {
		if (pending) {
			useChatDataStore.getState().setActiveConversation(null);
			useChatDataStore.getState().setActiveProject(pending.project ?? null);
		} else {
			useChatDataStore.getState().setActiveConversation(null);
			useChatDataStore.getState().setActiveProject(null);
		}
		set({
			pendingConversation: pending,
			viewMode: pending
				? (pending.project ? ViewMode.CONVERSATION_IN_PROJECT : ViewMode.STANDALONE_CONVERSATION)
				: null,
			projectForOverview: null,
			initialSelectedModel: null,
		});
	},

	setInitialSelectedModel: (model) => set({ initialSelectedModel: model }),

	// ═══════════════════════════════════════════════════════════════════════
	// Input history (#81)
	// ═══════════════════════════════════════════════════════════════════════

	pushInputHistory: (text: string) => {
		if (!text.trim()) return;
		set((s) => ({
			inputHistory: [...s.inputHistory, text].slice(-50),
			historyIndex: -1,
			draftInput: '',
		}));
	},

	navigateHistory: (direction: 'up' | 'down') => {
		const { inputHistory, historyIndex, draftInput } = get();
		if (inputHistory.length === 0) return null;

		if (direction === 'up') {
			if (historyIndex === -1) {
				const newIdx = inputHistory.length - 1;
				set({ historyIndex: newIdx });
				return inputHistory[newIdx];
			}
			const newIdx = Math.max(0, historyIndex - 1);
			set({ historyIndex: newIdx });
			return inputHistory[newIdx];
		}

		// direction === 'down'
		if (historyIndex === -1) return null;
		const newIdx = historyIndex + 1;
		if (newIdx >= inputHistory.length) {
			set({ historyIndex: -1 });
			return draftInput;
		}
		set({ historyIndex: newIdx });
		return inputHistory[newIdx];
	},

	// ═══════════════════════════════════════════════════════════════════════
	// Session settings (absorbed from chatSessionStore)
	// ═══════════════════════════════════════════════════════════════════════

	setChatMode: (mode) => set({ chatMode: mode }),
	setSelectedModel: (provider, modelId) => set({ selectedModel: { provider, modelId } }),
	setSearchActive: (active) => set({ isSearchActive: active }),
	setSearchProvider: (provider) => set({ searchProvider: provider }),
	setEnableWebSearch: (enabled) => set({ enableWebSearch: enabled }),
	setEnableVaultSearch: (enabled) => set({ enableVaultSearch: enabled }),
	setAttachmentHandlingMode: (mode) => set({ attachmentHandlingMode: mode }),
	setLlmOutputControlSettings: (settings) => set({ llmOutputControlSettings: settings }),
	setIsCodeInterpreterEnabled: (enabled) => set({ isCodeInterpreterEnabled: enabled }),
	setCurrentInputTags: (tags) => set({ currentInputTags: tags }),

	// ═══════════════════════════════════════════════════════════════════════
	// Submit action
	// ═══════════════════════════════════════════════════════════════════════

	setSubmitAction: (fn) => set({ submitAction: fn }),
	setInsertToInput: (fn) => set({ insertToInput: fn }),
	markAssistantCompleted: (messageId, ts) => set({
		lastAssistantCompletedAt: ts ?? Date.now(),
		lastAssistantMessageId: messageId,
	}),
	clearAssistantCompletion: () => set({
		lastAssistantCompletedAt: null,
		lastAssistantMessageId: null,
	}),

	// ═══════════════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════════════

	reset: () => {
		useChatDataStore.getState().setActiveProject(null);
		useChatDataStore.getState().setActiveConversation(null);
		set({
			viewMode: null,
			projectForOverview: null,
			pendingConversation: null,
			initialSelectedModel: null,
			inputHistory: [],
			historyIndex: -1,
			draftInput: '',
			...INITIAL_SESSION,
		});
	},

	resetSession: () => set(INITIAL_SESSION),
}));
