import { create } from 'zustand';
import { ParsedProjectFile, PendingConversation } from 'src/service/chat/types';
import { ViewMode } from '../view/ChatView';

interface ChatViewStore {
	// State
	viewMode: ViewMode | null;
	projectForOverview: ParsedProjectFile | null;
	pendingConversation: PendingConversation | null;

	// Actions
	setProjectOverview: (project: ParsedProjectFile) => void;
	setAllProjects: () => void;
	setAllConversations: () => void;
	setPendingConversation: (pending: PendingConversation | null) => void;
	reset: () => void;
}

export const useChatViewStore = create<ChatViewStore>((set) => ({
	// Initial state
	viewMode: null,
	projectForOverview: null,
	pendingConversation: null,

	// Actions
	setProjectOverview: (project: ParsedProjectFile) =>
		set({
			viewMode: ViewMode.PROJECT_OVERVIEW,
			projectForOverview: project,
			pendingConversation: null,
		}),
	setAllProjects: () =>
		set({
			viewMode: ViewMode.ALL_PROJECTS,
			projectForOverview: null,
			pendingConversation: null,
		}),
	setAllConversations: () =>
		set({
			viewMode: ViewMode.ALL_CONVERSATIONS,
			projectForOverview: null,
			pendingConversation: null,
		}),
	setPendingConversation: (pending: PendingConversation | null) =>
		set({
			pendingConversation: pending,
		}),
	reset: () =>
		set({
			viewMode: null,
			projectForOverview: null,
			pendingConversation: null,
		}),
}));

