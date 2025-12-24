import { create } from 'zustand';
import { ChatConversation, ChatProject } from '@/service/chat/types';

interface ProjectStore {
	// State
	projects: Map<string, ChatProject>;
	conversations: Map<string, ChatConversation>;
	expandedProjects: Set<string>;
	activeProject: ChatProject | null;
	activeConversation: ChatConversation | null;
	isProjectsCollapsed: boolean;
	isConversationsCollapsed: boolean;

	// Actions
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
}

export const useProjectStore = create<ProjectStore>((set: any) => ({
	// Initial state
	// key: projectId, value: project
	projects: new Map(),
	// key: conversationId, value: conversation
	conversations: new Map(),
	expandedProjects: new Set(),
	activeProject: null,
	activeConversation: null,
	isProjectsCollapsed: false,
	isConversationsCollapsed: false,

	// Actions
	setProjects: (projects: ChatProject[]) =>
		set({
			projects: new Map(projects.map(p => [p.meta.id, p]))
		}),
	setConversations: (conversations: ChatConversation[]) =>
		set({
			conversations: new Map(conversations.map(c => [c.meta.id, c]))
		}),
	toggleProjectExpanded: (projectId: string) =>
		set((state: ProjectStore) => {
			const newExpanded = new Set(state.expandedProjects);
			if (newExpanded.has(projectId)) {
				newExpanded.delete(projectId);
			} else {
				newExpanded.add(projectId);
			}
			return { expandedProjects: newExpanded };
		}),
	setActiveProject: (project: ChatProject | string | null) =>
		set((state: ProjectStore) => {
			if (project === null) {
				return { activeProject: null };
			}
			if (typeof project === 'string') {
				return { activeProject: state.projects.get(project) || null };
			}
			return { activeProject: project };
		}),
	setActiveConversation: (conversation: ChatConversation | string | null) =>
		set((state: ProjectStore) => {
			if (conversation === null) {
				return { activeConversation: null };
			}
			if (typeof conversation === 'string') {
				return { activeConversation: state.conversations.get(conversation) || null };
			}
			return { activeConversation: conversation };
		}),
	toggleProjectsCollapsed: () =>
		set((state: ProjectStore) => ({ isProjectsCollapsed: !state.isProjectsCollapsed })),
	toggleConversationsCollapsed: () =>
		set((state: ProjectStore) => ({ isConversationsCollapsed: !state.isConversationsCollapsed })),
	clearExpandedProjects: () => set({ expandedProjects: new Set() }),
	updateProject: (project: ChatProject) =>
		set((state: ProjectStore) => {
			const newProjects = new Map(state.projects);
			newProjects.set(project.meta.id, project);
			return { projects: newProjects };
		}),
	updateConversation: (conversation: ChatConversation) =>
		set((state: ProjectStore) => {
			const newConversations = new Map(state.conversations);
			newConversations.set(conversation.meta.id, conversation);
			return { conversations: newConversations };
		}),
}));

