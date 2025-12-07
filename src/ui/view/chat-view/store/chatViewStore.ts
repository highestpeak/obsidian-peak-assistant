import { create } from 'zustand';
import { ParsedProjectFile, PendingConversation, ParsedConversationFile } from '@/service/chat/types';
import { ViewMode } from '../../ChatView';
import { useProjectStore } from '@/ui/store/projectStore';

interface ChatViewStore {
	// State
	viewMode: ViewMode | null;
	projectForOverview: ParsedProjectFile | null;
	pendingConversation: PendingConversation | null;
	showSummaryModal: boolean;
	showResourcesModal: boolean;

	// Actions
	setProjectOverview: (project: ParsedProjectFile) => void;
	setAllProjects: () => void;
	setAllConversations: () => void;
	setConversation: (conversation: ParsedConversationFile) => void;
	setPendingConversation: (pending: PendingConversation | null) => void;
	setShowSummaryModal: (show: boolean) => void;
	setShowResourcesModal: (show: boolean) => void;
	reset: () => void;
}

export const useChatViewStore = create<ChatViewStore>((set) => ({
	// Initial state
	viewMode: null,
	projectForOverview: null,
	pendingConversation: null,
	showSummaryModal: false,
	showResourcesModal: false,

	// Actions
	setProjectOverview: (project: ParsedProjectFile) => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: ViewMode.PROJECT_OVERVIEW,
			projectForOverview: project,
			pendingConversation: null,
		});
	},
	setAllProjects: () => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: ViewMode.ALL_PROJECTS,
			projectForOverview: null,
			pendingConversation: null,
		});
	},
	setAllConversations: () => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: ViewMode.ALL_CONVERSATIONS,
			projectForOverview: null,
			pendingConversation: null,
		});
	},
	setConversation: (conversation: ParsedConversationFile) => {
		useProjectStore.getState().setActiveConversation(conversation);
		// Get project from projectStore based on conversation.meta.projectId
		const project = conversation.meta.projectId
			? useProjectStore.getState().projects.get(conversation.meta.projectId) ?? null
			: null;
		useProjectStore.getState().setActiveProject(project);
		set({
			viewMode: conversation.meta.projectId
				? ViewMode.CONVERSATION_IN_PROJECT
				: ViewMode.STANDALONE_CONVERSATION,
			projectForOverview: null,
			pendingConversation: null,
		});
	},
	setPendingConversation: (pending: PendingConversation | null) => {
		if (pending) {
			useProjectStore.getState().setActiveConversation(null);
			useProjectStore.getState().setActiveProject(pending.project ?? null);
		} else {
			useProjectStore.getState().setActiveConversation(null);
			useProjectStore.getState().setActiveProject(null);
		}
		set({
			pendingConversation: pending,
			viewMode: pending
				? (pending.project ? ViewMode.CONVERSATION_IN_PROJECT : ViewMode.STANDALONE_CONVERSATION)
				: null,
			projectForOverview: null,
		});
	},
	setShowSummaryModal: (show: boolean) => {
		set({ showSummaryModal: show });
	},
	setShowResourcesModal: (show: boolean) => {
		set({ showResourcesModal: show });
	},
	reset: () => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: null,
			projectForOverview: null,
			pendingConversation: null,
			showSummaryModal: false,
			showResourcesModal: false,
		});
	},
}));

