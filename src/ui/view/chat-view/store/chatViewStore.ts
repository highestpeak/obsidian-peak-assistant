/**
 * chatViewStore — unified navigation + input + session settings store.
 * Replaces old chatViewStore + chatSessionStore.
 */
import { create } from 'zustand';
import { ChatProject, PendingConversation, ChatConversation, FileChange } from '@/service/chat/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import type { SuggestionTag } from '@/ui/component/prompt-input/SuggestionTags';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

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
	chatMode: 'chat' | 'plan' | 'agent';
	selectedModel: { provider: string; modelId: string } | undefined;
	isSearchActive: boolean;
	searchProvider: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch: boolean;
	enableVaultSearch: boolean;
	attachmentHandlingMode: 'direct' | 'degrade_to_text';
	llmOutputControlSettings: Record<string, any>;
	isCodeInterpreterEnabled: boolean;
	suggestionTags: SuggestionTag[];
	currentInputTags: ChatTag[];

	// ── File changes (copilot feature — kept from chatSessionStore) ──
	fileChanges: FileChange[];
	promptsSuggest: NavigableMenuItem[];
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
	setChatMode: (mode: 'chat' | 'plan' | 'agent') => void;
	setSelectedModel: (provider: string, modelId: string) => void;
	setSearchActive: (active: boolean) => void;
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	setEnableWebSearch: (enabled: boolean) => void;
	setEnableVaultSearch: (enabled: boolean) => void;
	setAttachmentHandlingMode: (mode: 'direct' | 'degrade_to_text') => void;
	setLlmOutputControlSettings: (settings: Record<string, any>) => void;
	setIsCodeInterpreterEnabled: (enabled: boolean) => void;
	setSuggestionTags: (tags: SuggestionTag[]) => void;
	setCurrentInputTags: (tags: ChatTag[]) => void;

	// ── File changes actions ──
	setFileChanges: (changes: FileChange[]) => void;
	updateFileChange: (id: string, updates: Partial<FileChange>) => void;
	acceptAllFileChanges: () => void;
	discardAllFileChanges: () => void;
	acceptFileChange: (id: string) => void;
	discardFileChange: (id: string) => void;
	setExternalPrompts: (prompts: NavigableMenuItem[]) => void;

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
	'isCodeInterpreterEnabled' | 'suggestionTags' | 'currentInputTags' | 'fileChanges' | 'promptsSuggest'
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
	suggestionTags: [],
	currentInputTags: [],
	fileChanges: [],
	promptsSuggest: [],
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
	setSuggestionTags: (tags) => set({ suggestionTags: tags }),
	setCurrentInputTags: (tags) => set({ currentInputTags: tags }),

	// ═══════════════════════════════════════════════════════════════════════
	// File changes (copilot feature)
	// ═══════════════════════════════════════════════════════════════════════

	setFileChanges: (changes) => set({ fileChanges: changes }),
	updateFileChange: (id, updates) =>
		set((s) => ({ fileChanges: s.fileChanges.map(c => c.id === id ? { ...c, ...updates } : c) })),
	acceptAllFileChanges: () =>
		set((s) => ({ fileChanges: s.fileChanges.map(c => ({ ...c, accepted: true })) })),
	discardAllFileChanges: () =>
		set((s) => ({ fileChanges: s.fileChanges.map(c => ({ ...c, accepted: false })) })),
	acceptFileChange: (id) =>
		set((s) => ({ fileChanges: s.fileChanges.map(c => c.id === id ? { ...c, accepted: true } : c) })),
	discardFileChange: (id) =>
		set((s) => ({ fileChanges: s.fileChanges.map(c => c.id === id ? { ...c, accepted: false } : c) })),
	setExternalPrompts: (prompts) => set({ promptsSuggest: prompts }),

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
