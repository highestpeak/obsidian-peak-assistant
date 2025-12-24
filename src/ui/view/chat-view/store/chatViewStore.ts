import { create } from 'zustand';
import { ChatProject, PendingConversation, ChatConversation } from '@/service/chat/types';
import { useProjectStore } from '@/ui/store/projectStore';

/**
 * View modes for ChatView
 */
export enum ViewMode {
	// projects items list has max items to display. the overview of all projects need to show in a large card view in center area
	ALL_PROJECTS = 'all-projects',
	// conversations items list has max items to display. the overview of all conversations need to show in a large card view in center area
	ALL_CONVERSATIONS = 'all-conversations',

	// project overview with conversation list
	PROJECT_OVERVIEW = 'project-overview',
	// list view showing all conversations for a specific project
	PROJECT_CONVERSATIONS_LIST = 'project-conversations-list',
	// message view for a conversation within project
	CONVERSATION_IN_PROJECT = 'conversation-in-project',
	// message view for a conversation not in a project
	STANDALONE_CONVERSATION = 'standalone-conversation',
}

interface ChatViewStore {
	// State
	viewMode: ViewMode | null;
	projectForOverview: ChatProject | null;
	pendingConversation: PendingConversation | null;
	showSummaryModal: boolean;
	showResourcesModal: boolean;

	// Actions
	setProjectOverview: (project: ChatProject) => void;
	setProjectConversationsList: (project: ChatProject) => void;
	setAllProjects: () => void;
	setAllConversations: () => void;
	setConversation: (conversation: ChatConversation) => void;
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
	setProjectOverview: (project: ChatProject) => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: ViewMode.PROJECT_OVERVIEW,
			projectForOverview: project,
			pendingConversation: null,
		});
	},
	setProjectConversationsList: (project: ChatProject) => {
		useProjectStore.getState().setActiveProject(null);
		useProjectStore.getState().setActiveConversation(null);
		set({
			viewMode: ViewMode.PROJECT_CONVERSATIONS_LIST,
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
	setConversation: (conversation: ChatConversation) => {
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

