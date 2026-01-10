import React, { useEffect, useCallback } from 'react';
import { ProjectsSection } from './ProjectsSection';
import { ConversationsSection } from './ConversationsSection';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { ViewEventType, SelectionChangedEvent, ConversationUpdatedEvent } from '@/core/eventBus';
import { notifySelectionChange, hydrateProjects } from './utils';
import { RefreshCw, Minus, Home } from 'lucide-react';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { showToast } from '@/ui/utils/toast';

/**
 * Main React component for ProjectListView
 */
export const ProjectListViewComponent: React.FC = () => {
	const { app, manager, eventBus } = useServiceContext();
	const chatViewStore = useChatViewStore();
	const {
		setProjects,
		setConversations,

		activeProject,
		activeConversation,

		setActiveProject,
		setActiveConversation,
		clearExpandedProjects,
	} = useProjectStore();

	// Hydrate data
	const hydrateData = useCallback(async () => {
		// Load projects
		await hydrateProjects(manager);
		const projectsMap = useProjectStore.getState().projects;
		const projectsList = Array.from(projectsMap.values());

		// Validate and update activeProject
		if (activeProject) {
			const latestProject = projectsMap.get(activeProject.meta.id);
			if (latestProject) {
				setActiveProject(latestProject);
			} else {
				setActiveProject(null);
			}
		}

		// Load conversations
		const conversationsList = await manager.listConversations(null);
		conversationsList.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		setConversations(conversationsList);
		const conversationsMap = useProjectStore.getState().conversations;

		// Validate and update activeConversation
		if (activeConversation) {
			const latestConversation = conversationsMap.get(activeConversation.meta.id);
			if (latestConversation) {
				setActiveConversation(latestConversation);
			} else {
				setActiveConversation(null);
			}
		}

		// Set default activeConversation if none is selected
		if (!activeConversation && conversationsMap.size > 0) {
			const sortedConversations = Array.from(conversationsMap.values()).sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
			setActiveConversation(sortedConversations[0]);
		}
	}, [
		manager,
		activeProject,
		activeConversation,
		setProjects,
		setConversations,
		setActiveProject,
		setActiveConversation,
	]);

	// Initial load
	useEffect(() => {
		hydrateData();
	}, []);

	// Navigate to home view
	const handleGoHome = () => {
		chatViewStore.setHome();
	};

	// Refresh projects and conversations
	const handleRefresh = async () => {
		try {
			clearExpandedProjects();
			await hydrateData();
			// Dispatch selection changed event
			await notifySelectionChange(app);
			// Show success toast (will be displayed in ChatView)
			showToast.success('Projects and conversations refreshed', { app });
		} catch (error) {
			// Show error toast
			showToast.error('Failed to refresh data', {
				app,
				description: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	};

	// Subscribe to conversation and project update events
	useEffect(() => {
		// Subscribe to selection changed events to handle expand/collapse and highlight the active conversation
		// this event may come from message send, markdown view mode, or just expanding a project or conversation
		const unsubscribeSelection = eventBus.on<SelectionChangedEvent>(
			ViewEventType.SELECTION_CHANGED,
			async (event) => {
				const { setActiveProject, setActiveConversation, toggleProjectExpanded, expandedProjects, projects, conversations } = useProjectStore.getState();

				// Set active selection by ID
				// Only update if IDs are different to avoid unnecessary updates
				if (event.projectId) {
					const project = projects.get(event.projectId);
					if (project) {
						setActiveProject(project);
					}
				} else {
					setActiveProject(null);
				}

				if (event.conversationId) {
					const conversation = conversations.get(event.conversationId);
					if (conversation) {
						setActiveConversation(conversation);
					} else {
						// Conversation not found in store, this shouldn't happen but log for debugging
						console.warn('Conversation not found in store:', event.conversationId);
					}
				} else {
					setActiveConversation(null);
				}

				// Only expand if project is not already expanded (to avoid collapsing when clicking conversation)
				if (event.projectId && !expandedProjects.has(event.projectId)) {
					toggleProjectExpanded(event.projectId);
				}
			}
		);

		// Subscribe to conversation updated events to refresh the UI when a conversation is created or updated
		const unsubscribeConversationUpdated = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const { updateConversation, expandedProjects, projects } = useProjectStore.getState();
				const conversation = event.conversation;

				// Update conversation in store
				updateConversation(conversation);

				// If conversation belongs to a project and that project is expanded,
				// trigger a reload of project conversations to show the new/updated conversation
				if (conversation.meta.projectId) {
					const project = projects.get(conversation.meta.projectId);
					if (project && expandedProjects.has(conversation.meta.projectId)) {
						// Trigger reload by dispatching a custom event that ProjectsSection can listen to
						// Or we can directly call the reload function if we have access to it
						// For now, we'll rely on ProjectsSection to handle this via a separate mechanism
						// The conversation is already in the store, so ProjectsSection should pick it up
					}
				}
			}
		);

		return () => {
			unsubscribeSelection();
			unsubscribeConversationUpdated();
		};
	}, [eventBus, manager]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-p-0 pktw-box-border pktw-overflow-y-auto pktw-bg-background">
			{/* Toolbar */}
			<div className="pktw-flex pktw-flex-row pktw-items-center pktw-gap-1 pktw-border-b pktw-border-border pktw-px-2 pktw-pt-1">
				<IconButton
					size="lg"
					className="pktw-shrink-0"
					onClick={handleGoHome}
					title="Go to home"
				>
					<Home className="pktw-text-foreground group-hover:pktw-text-gray-900 pktw-transition-colors" />
				</IconButton>
				<IconButton
					size="lg"
					className="pktw-shrink-0"
					onClick={handleRefresh}
					title="Refresh projects and conversations"
				>
					<RefreshCw className="pktw-text-foreground group-hover:pktw-text-gray-900 pktw-transition-colors" />
				</IconButton>
				<IconButton
					size="lg"
					className="pktw-shrink-0"
					onClick={() => clearExpandedProjects()}
					title="Collapse all projects"
				>
					<Minus className="pktw-text-foreground group-hover:pktw-text-gray-900 pktw-transition-colors" />
				</IconButton>
			</div>

			<div className="pktw-px-3 pktw-pb-6">
				{/* Projects Section */}
				<ProjectsSection />

				{/* Conversations Section */}
				<ConversationsSection />
			</div>
		</div>
	);
};

