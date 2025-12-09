import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ParsedConversationFile, ParsedProjectFile } from '@/service/chat/types';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../chat-view/store/chatViewStore';
import { notifySelectionChange, hydrateProjects as hydrateProjectsFromManager, showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { Button } from '@/ui/component/shared-ui/button';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, MoreHorizontal } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ViewEventType, ConversationUpdatedEvent } from '@/core/eventBus';

interface ProjectsSectionProps {
}

const MAX_PROJECTS_DISPLAY = 10;
const MAX_CONVERSATIONS_DISPLAY = 10;

interface ProjectItemProps {
	project: ParsedProjectFile;
	isExpanded: boolean;
	conversations: ParsedConversationFile[];
}

const ProjectItem: React.FC<ProjectItemProps> = ({
	project,
	isExpanded,
	conversations,
}) => {
	const { app, manager } = useServiceContext();
	// Directly access store in component
	const {
		projects,
		activeConversation,
		activeProject,
		setActiveProject,
		setActiveConversation,
		toggleProjectExpanded,
		updateProject,
		updateConversation,
	} = useProjectStore();
	const { setProjectOverview, setProjectConversationsList, setPendingConversation } = useChatViewStore();

	const conversationsToShow = conversations.slice(0, MAX_CONVERSATIONS_DISPLAY);
	const hasMoreConversations = conversations.length > MAX_CONVERSATIONS_DISPLAY;

	// State for input modal
	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	// Check if conversation is active
	const isConversationActive = useCallback((conversation: ParsedConversationFile): boolean => {
		return activeConversation?.meta.id === conversation.meta.id;
	}, [activeConversation]);

	// Handlers
	const handleProjectHeaderClick = async () => {
		toggleProjectExpanded(project.meta.id);
		setActiveProject(project);
		setProjectOverview(project);
	};

	const handleConversationClick = async (conversation: ParsedConversationFile) => {
		// Don't set state here, let notifySelectionChange handle it
		// This ensures the state is set correctly and consistently
		await notifySelectionChange(app, conversation);
	};

	const handleNewConversation = async () => {
		setActiveProject(project);
		setPendingConversation({
			title: 'New Conversation',
			project: project,
		});
		await notifySelectionChange(app, null);
	};

	const handleEditProjectName = useCallback((projectItem: ParsedProjectFile) => {
		setInputModalConfig({
			message: 'Enter project name',
			initialValue: projectItem.meta.name,
			onSubmit: async (newName: string | null) => {
				if (!newName || !newName.trim()) return;

				try {
					const updatedProject = await manager.renameProject(projectItem, newName.trim());

					// Update project in store
					updateProject(updatedProject);

					// Update activeProject if this is the active one - this will trigger re-render everywhere
					if (activeProject?.meta.id === projectItem.meta.id) {
						setActiveProject(updatedProject);
					}
				} catch (error) {
					console.error('Failed to rename project', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateProject, activeProject, setActiveProject]);

	const handleEditConversationTitle = useCallback((
		projectItem: ParsedProjectFile | null,
		conversation: ParsedConversationFile
	) => {
		setInputModalConfig({
			message: 'Enter conversation title',
			initialValue: conversation.meta.title,
			onSubmit: async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) return;

				try {
					const updatedConversation = await manager.updateConversationTitle({
						conversation,
						project: projectItem,
						title: newTitle.trim(),
					});

					// Update conversation in store
					updateConversation(updatedConversation);

					// Update active conversation if it's the active one - React components will auto-update
					if (isConversationActive(conversation)) {
						setActiveConversation(updatedConversation);
					}
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateConversation, isConversationActive, setActiveConversation]);

	// Menu item configurations
	const projectMenuItems = useCallback((projectItem: ParsedProjectFile) => [
		{
			title: 'Rename project',
			icon: 'pencil',
			onClick: () => handleEditProjectName(projectItem),
		},
		{
			title: 'Open source file',
			icon: 'file-text',
			onClick: async () => {
				await openSourceFile(app, projectItem.file);
			},
		},
	], [app, handleEditProjectName]);

	const conversationMenuItems = useCallback((conversation: ParsedConversationFile) => {
		const projectItem = conversation.meta.projectId ? projects.get(conversation.meta.projectId) || null : null;
		return [
			{
				title: 'Edit title',
				icon: 'pencil',
				onClick: () => handleEditConversationTitle(projectItem, conversation),
			},
			{
				title: 'Open source file',
				icon: 'file-text',
				onClick: async () => {
					await openSourceFile(app, conversation.file);
				},
			},
		];
	}, [app, projects, handleEditConversationTitle]);

	const handleContextMenu = (
		e: React.MouseEvent,
		type: 'project' | 'conversation',
		item: ParsedProjectFile | ParsedConversationFile
	) => {
		const menuItems = type === 'project'
			? projectMenuItems(item as ParsedProjectFile)
			: conversationMenuItems(item as ParsedConversationFile);
		showContextMenu(e, menuItems);
	};

	return (
		<div
			className="pktw-flex pktw-flex-col pktw-mb-0.5"
			data-project-id={project.meta.id}
		>
			{/* Project Header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1.5 pktw-rounded pktw-cursor-pointer pktw-bg-transparent pktw-transition-colors pktw-min-h-8 pktw-select-none hover:pktw-bg-muted"
				onClick={handleProjectHeaderClick}
				onContextMenu={(e) => handleContextMenu(e, 'project', project)}
			>
				{isExpanded ? (
					<>
						<ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
						<FolderOpen className="pktw-w-4 pktw-h-4 pktw-shrink-0" />
					</>
				) : (
					<>
						<ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
						<Folder className="pktw-w-4 pktw-h-4 pktw-shrink-0" />
					</>
				)}
				<span className="pktw-flex-1 pktw-text-sm pktw-text-foreground pktw-break-words pktw-leading-snug">
					{project.meta.name}
				</span>
			</div>

			{/* Conversations */}
			<div className={cn(
				'pktw-flex pktw-flex-col pktw-gap-px pktw-ml-7 pktw-overflow-hidden pktw-transition-all pktw-duration-150 pktw-ease-in-out',
				isExpanded
					? 'pktw-max-h-[5000px] pktw-opacity-100 pktw-mt-0.5 pointer-events-auto'
					: 'pktw-max-h-0 pktw-opacity-0 pktw-mt-0 pointer-events-none'
			)}>
				{/* New conversation button */}
				<div
					className="pktw-w-full pktw-px-2 pktw-py-1.5 pktw-rounded pktw-text-[13px] pktw-min-h-7 pktw-mb-0.5 pktw-bg-transparent pktw-text-muted-foreground hover:pktw-bg-muted hover:pktw-text-foreground pktw-transition-colors pktw-cursor-pointer pktw-flex pktw-items-center pktw-justify-center"
					onClick={(e) => {
						e.stopPropagation();
						handleNewConversation();
					}}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							e.stopPropagation();
							handleNewConversation();
						}
					}}
				>
					+ New conversation
				</div>

				{/* Render conversations */}
				{conversationsToShow.map((conv) => {
					const isActive = activeConversation?.meta.id === conv.meta.id;
					// console.log('isActive', isActive, conv.meta.id, activeConversation?.meta.id);
					return (
						<div
							key={conv.meta.id}
							className={cn(
								'pktw-relative pktw-px-2 pktw-py-1.5 pktw-pl-6 pktw-rounded pktw-cursor-pointer pktw-transition-colors pktw-text-[13px] pktw-min-h-7 pktw-flex pktw-items-center pktw-break-words',
								'before:pktw-content-[""] before:pktw-absolute before:pktw-left-2 before:pktw-top-1/2 before:pktw--translate-y-1/2 before:pktw-w-1 before:pktw-h-1 before:pktw-rounded-full before:pktw-transition-opacity',
								// Default state
								!isActive && 'pktw-bg-transparent pktw-text-muted-foreground hover:pktw-bg-muted hover:pktw-text-foreground before:pktw-bg-muted-foreground before:pktw-opacity-40 hover:before:pktw-opacity-80',
								// Active state - use same pattern as ConversationsSection
								isActive && '!pktw-bg-primary !pktw-text-primary-foreground hover:!pktw-bg-primary hover:!pktw-text-primary-foreground before:!pktw-opacity-100 before:!pktw-bg-primary-foreground'
							)}
							data-conversation-id={conv.meta.id}
							onClick={(e) => {
								e.stopPropagation();
								handleConversationClick(conv);
							}}
							onContextMenu={(e) => handleContextMenu(e, 'conversation', conv)}
						>
							{conv.meta.title}
						</div>
					);
				})}

				{hasMoreConversations && (
					<div
						className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-mx-6 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-xs pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
						onClick={(e) => {
							e.stopPropagation();
							// Show all conversations for this project in list view
							setProjectConversationsList(project);
						}}
					>
						<MoreHorizontal className="pktw-w-3.5 pktw-h-3.5" />
						<span className="pktw-flex-1">See more</span>
					</div>
				)}
			</div>

			{/* Input Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};

/**
 * Projects section component
 */
export const ProjectsSection: React.FC<ProjectsSectionProps> = () => {
	const { manager, eventBus } = useServiceContext();
	const {
		projects,
		expandedProjects,
		isProjectsCollapsed,
		toggleProjectsCollapsed,
	} = useProjectStore();
	const { setAllProjects } = useChatViewStore();

	const [projectConversations, setProjectConversations] = useState<
		Map<string, ParsedConversationFile[]>
	>(new Map());
	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	// Load conversations for a project
	const loadProjectConversations = useCallback(
		async (project: ParsedProjectFile) => {
			const conversations = await manager.listConversations(project.meta);
			conversations.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
			setProjectConversations((prev) => {
				const next = new Map(prev);
				next.set(project.meta.id, conversations);
				return next;
			});
			// Sync conversations to store so they can be found by ID
			// Use getState() to get latest conversations without causing dependency loop
			const { conversations: currentConversations, setConversations: updateConversations } = useProjectStore.getState();
			const allConversations = new Map(currentConversations);
			conversations.forEach(conv => {
				allConversations.set(conv.meta.id, conv);
			});
			updateConversations(Array.from(allConversations.values()));
			return conversations;
		},
		[manager]
	);

	// Load conversations when project is expanded
	useEffect(() => {
		expandedProjects.forEach((projectId) => {
			const project = projects.get(projectId);
			if (project) {
				// Always reload to get latest data (handles external updates)
				loadProjectConversations(project);
			}
		});
	}, [expandedProjects, projects, loadProjectConversations]);

	// Listen for conversation updates and reload project conversations if needed
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const conversation = event.conversation;
				// If conversation belongs to a project and that project is expanded, reload its conversations
				if (conversation.meta.projectId) {
					const project = projects.get(conversation.meta.projectId);
					if (project && expandedProjects.has(conversation.meta.projectId)) {
						await loadProjectConversations(project);
					}
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, projects, expandedProjects, loadProjectConversations]);

	const handleCreateProject = () => {
		setInputModalConfig({
			message: 'Project name',
			hintText: 'Projects keep chats, files, and custom instructions in one place. Use them for ongoing work, or just to keep things tidy.',
			submitButtonText: 'Create project',
			onSubmit: async (name: string | null) => {
				if (!name || !name.trim()) return;
				await manager.createProject({ name: name.trim() });
				await hydrateProjectsFromManager(manager);
			},
		});
		setInputModalOpen(true);
	};

	const { projectsToShow, hasMoreProjects } = useMemo(() => {
		const list = Array.from(projects.values()).sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		return {
			projectsToShow: list.slice(0, MAX_PROJECTS_DISPLAY),
			hasMoreProjects: projects.size > MAX_PROJECTS_DISPLAY,
		};
	}, [projects]);

	return (
		<div className="pktw-flex pktw-flex-col">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2 pktw-cursor-pointer pktw-rounded pktw-transition-all hover:pktw-bg-muted hover:pktw-shadow-sm"
				onClick={() => toggleProjectsCollapsed()}
			>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					{isProjectsCollapsed ? (
						<ChevronRight className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
					) : (
						<ChevronDown className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
					)}
					<h3 className="pktw-flex-1 pktw-m-0 pktw-text-[13px] pktw-font-semibold pktw-text-foreground pktw-uppercase pktw-tracking-wide">Projects</h3>
				</div>
				<IconButton
					size="lg"
					className="pktw-shrink-0"
					onClick={(e) => {
						e.stopPropagation();
						handleCreateProject();
					}}
					title="New Project"
				>
					<Plus />
				</IconButton>
			</div>

			{/* Projects List */}
			<div className={cn(
				'pktw-flex pktw-flex-col pktw-gap-px pktw-overflow-hidden pktw-transition-all pktw-duration-150 pktw-ease-in-out',
				isProjectsCollapsed
					? 'pktw-max-h-0 pktw-opacity-0'
					: 'pktw-max-h-[5000px] pktw-opacity-100'
			)}>
				{projectsToShow.map((project) => (
					<ProjectItem
						key={project.meta.id}
						project={project}
						isExpanded={expandedProjects.has(project.meta.id)}
						conversations={projectConversations.get(project.meta.id) || []}
					/>
				))}

				{hasMoreProjects && (
					<div
						className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-[13px] pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
						onClick={() => setAllProjects()}
					>
						<MoreHorizontal className="pktw-w-4 pktw-h-4" />
						<span className="pktw-flex-1">See more</span>
					</div>
				)}
			</div>

			{/* Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};

