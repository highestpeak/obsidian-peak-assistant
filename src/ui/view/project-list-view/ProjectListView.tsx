import React, { useEffect, useCallback } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ProjectsSection } from './ProjectsSection';
import { ConversationsSection } from './ConversationsSection';
import { useProjectStore } from '../../store/projectStore';
import { EventBus, ViewEventType, SelectionChangedEvent } from 'src/core/eventBus';
import { notifySelectionChange, hydrateProjects } from './utils';
import { Button } from '../../component/shared-ui/button';
import { RefreshCw, Minus } from 'lucide-react';

interface ProjectListViewProps {
	manager: AIServiceManager;
	app: App;
}

/**
 * Main React component for ProjectListView
 */
export const ProjectListViewComponent: React.FC<ProjectListViewProps> = ({
	manager,
	app,
}) => {
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
		const settings = manager.getSettings();

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

		// Handle activeProject based on rootMode
		if (settings.rootMode === 'project-first' && projectsMap.size > 0) {
			if (!activeProject) {
				setActiveProject(projectsList[0]);
			}
		} else {
			setActiveProject(null);
		}

		// Load conversations
		const conversationsList = await manager.listConversations();
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

	// Refresh projects and conversations
	const handleRefresh = async () => {
		clearExpandedProjects();
		await hydrateData();
		// Dispatch selection changed event
		await notifySelectionChange(app);
	};

	const eventBus = EventBus.getInstance(app);

	// Subscribe to conversation and project update events
	useEffect(() => {
		// Subscribe to selection changed events to handle expand/collapse and highlight the active conversation
		// this event may come from message send, markdown view mode, or just expanding a project or conversation
		const unsubscribeSelection = eventBus.on<SelectionChangedEvent>(
			ViewEventType.SELECTION_CHANGED,
			async (event) => {
				const { setActiveProject, setActiveConversation, toggleProjectExpanded } = useProjectStore.getState();

				// Set active selection by ID
				setActiveProject(event.projectId ?? null);
				setActiveConversation(event.conversationId ?? null);
				if (event.projectId) {
					toggleProjectExpanded(event.projectId);
				}
			}
		);

		return () => {
			unsubscribeSelection();
		};
	}, [eventBus, manager]);

	return (
		<div className="peak-project-list-view">
			{/* Toolbar */}
			<div className="peak-project-list-view__toolbar">
				<Button
					variant="ghost"
					size="icon"
					className="pktw-h-6 pktw-w-6"
					onClick={handleRefresh}
					title="Refresh projects and conversations"
				>
					<RefreshCw className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="pktw-h-6 pktw-w-6"
					onClick={() => clearExpandedProjects()}
					title="Collapse all projects"
				>
					<Minus className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
			</div>

			{/* Projects Section */}
			<ProjectsSection
				manager={manager}
				app={app}
			/>

			{/* Conversations Section */}
			<ConversationsSection
				manager={manager}
				app={app}
			/>
		</div>
	);
};

