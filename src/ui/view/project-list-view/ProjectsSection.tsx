import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { openSourceFile } from '../shared/view-utils';
import { useProjectStore } from '../../store/projectStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { notifySelectionChange, hydrateProjects as hydrateProjectsFromManager, showContextMenu } from './utils';
import { InputModal } from './InputModal';
import { Button } from '../../component/shared-ui/button';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, MoreHorizontal } from 'lucide-react';

interface ProjectsSectionProps {
	manager: AIServiceManager;
	app: App;
}

const MAX_PROJECTS_DISPLAY = 10;
const MAX_CONVERSATIONS_DISPLAY = 10;

interface ProjectItemProps {
	project: ParsedProjectFile;
	isExpanded: boolean;
	conversations: ParsedConversationFile[];
	isConversationActive: (conversation: ParsedConversationFile) => boolean;
	onProjectHeaderClick: (project: ParsedProjectFile) => void;
	onNewConversation: (project: ParsedProjectFile) => void;
	onConversationClick: (project: ParsedProjectFile, conversation: ParsedConversationFile) => void;
	onContextMenu: (e: React.MouseEvent, type: 'project' | 'conversation', item: ParsedProjectFile | ParsedConversationFile) => void;
	onShowAllConversations: () => void;
}

const ProjectItem: React.FC<ProjectItemProps> = ({
	project,
	isExpanded,
	conversations,
	isConversationActive,
	onProjectHeaderClick,
	onNewConversation,
	onConversationClick,
	onContextMenu,
	onShowAllConversations,
}) => {
	const conversationsToShow = conversations.slice(0, MAX_CONVERSATIONS_DISPLAY);
	const hasMoreConversations = conversations.length > MAX_CONVERSATIONS_DISPLAY;

	return (
		<div
			className={`peak-project-list-view__project-item ${isExpanded ? 'is-expanded' : ''}`}
			data-project-id={project.meta.id}
		>
			{/* Project Header */}
			<div
				className="peak-project-list-view__project-header pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
				onClick={() => onProjectHeaderClick(project)}
				onContextMenu={(e) => onContextMenu(e, 'project', project)}
			>
				{isExpanded ? (
					<ChevronDown className="peak-icon pktw-w-3.5 pktw-h-3.5" />
				) : (
					<ChevronRight className="peak-icon pktw-w-3.5 pktw-h-3.5" />
				)}
				{isExpanded ? (
					<FolderOpen className="peak-icon pktw-w-4 pktw-h-4" />
				) : (
					<Folder className="peak-icon pktw-w-4 pktw-h-4" />
				)}
				<span className="peak-project-list-view__project-name pktw-flex-1">
					{project.meta.name}
				</span>
			</div>

			{/* Conversations */}
			{isExpanded && (
				<div className="peak-project-list-view__project-conversations is-expanded">
					{/* New conversation button */}
					<Button
						variant="ghost"
						className="peak-project-list-view__new-conv-btn pktw-w-full pktw-justify-start"
						onClick={(e) => {
							e.stopPropagation();
							onNewConversation(project);
						}}
					>
						+ New conversation
					</Button>

					{/* Render conversations */}
					{conversationsToShow.map((conv) => {
						const isActive = isConversationActive(conv);
						return (
							<div
								key={conv.meta.id}
								className={`peak-project-list-view__conversation-item ${isActive ? 'is-active' : ''}`}
								data-conversation-id={conv.meta.id}
								onClick={(e) => {
									e.stopPropagation();
									onConversationClick(project, conv);
								}}
								onContextMenu={(e) => onContextMenu(e, 'conversation', conv)}
							>
								{conv.meta.title}
							</div>
						);
					})}

					{hasMoreConversations && (
						<div
							className="peak-project-list-view__see-more-conv pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
							onClick={(e) => {
								e.stopPropagation();
								onShowAllConversations();
							}}
						>
							<MoreHorizontal className="peak-icon pktw-w-3.5 pktw-h-3.5" />
							<span className="peak-project-list-view__see-more-text">
								See more
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

/**
 * Projects section component
 */
export const ProjectsSection: React.FC<ProjectsSectionProps> = ({
	manager,
	app,
}) => {
	const {
		projects,
		expandedProjects,
		activeProject,
		activeConversation,
		isProjectsCollapsed,
		toggleProjectExpanded,
		setActiveProject,
		toggleProjectsCollapsed,
		setActiveConversation,
		updateProject,
		updateConversation,
	} = useProjectStore();
	const { setProjectOverview, setAllProjects, setAllConversations, setPendingConversation } = useChatViewStore();

	const isConversationActive = (conversation: ParsedConversationFile): boolean => {
		return activeConversation?.meta.id === conversation.meta.id;
	};

	const [projectConversations, setProjectConversations] = useState<
		Map<string, ParsedConversationFile[]>
	>(new Map());
	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
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

	const handleProjectHeaderClick = async (project: ParsedProjectFile) => {
		// Toggle expansion state
		toggleProjectExpanded(project.meta.id);
		setActiveProject(project);
		setProjectOverview(project);
	};

	const handleConversationClick = async (
		project: ParsedProjectFile,
		conversation: ParsedConversationFile
	) => {
		setActiveProject(project);
		await notifySelectionChange(app, conversation);
	};

	const handleNewConversation = async (project: ParsedProjectFile) => {
		setActiveProject(project);
		setPendingConversation({
			title: 'New Conversation',
			project: project,
		});
		await notifySelectionChange(app, null);
	};

	const handleCreateProject = () => {
		setInputModalConfig({
			message: 'Project name',
			onSubmit: async (name: string | null) => {
				if (!name || !name.trim()) return;
				await manager.createProject({ name: name.trim() });
				await hydrateProjectsFromManager(manager);
			},
		});
		setInputModalOpen(true);
	};

	const handleEditProjectName = (project: ParsedProjectFile) => {
		setInputModalConfig({
			message: 'Enter project name',
			initialValue: project.meta.name,
			onSubmit: async (newName: string | null) => {
				if (!newName || !newName.trim()) return;

				try {
					const updatedProject = await manager.renameProject(project, newName.trim());

					// Update project in store
					updateProject(updatedProject);
					
					// Update activeProject if this is the active one - this will trigger re-render everywhere
					if (activeProject?.meta.id === project.meta.id) {
						setActiveProject(updatedProject);
					}
				} catch (error) {
					console.error('Failed to rename project', error);
				}
			},
		});
		setInputModalOpen(true);
	};

	const handleEditConversationTitle = (
		project: ParsedProjectFile | null,
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
						project,
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
	};

	// Menu item configurations
	const projectMenuItems = useCallback((project: ParsedProjectFile) => [
		{
			title: 'Rename project',
			icon: 'pencil',
			onClick: () => handleEditProjectName(project),
		},
		{
			title: 'Open source file',
			icon: 'file-text',
			onClick: async () => {
				await openSourceFile(app, project.file);
			},
		},
	], [app]);

	const conversationMenuItems = useCallback((conversation: ParsedConversationFile) => {
		const project = conversation.meta.projectId ? projects.get(conversation.meta.projectId) || null : null;
		return [
			{
				title: 'Edit title',
				icon: 'pencil',
				onClick: () => handleEditConversationTitle(project, conversation),
			},
			{
				title: 'Open source file',
				icon: 'file-text',
				onClick: async () => {
					await openSourceFile(app, conversation.file);
				},
			},
		];
	}, [app, projects]);

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
		<div className={`peak-project-list-view__section ${isProjectsCollapsed ? 'is-collapsed' : ''}`}>
			{/* Header */}
			<div
				className="peak-project-list-view__header pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
				onClick={() => toggleProjectsCollapsed()}
			>
				{isProjectsCollapsed ? (
					<ChevronRight className="peak-icon pktw-w-3 pktw-h-3" />
				) : (
					<ChevronDown className="peak-icon pktw-w-3 pktw-h-3" />
				)}
				<h3 className="pktw-flex-1">Projects</h3>
				<Button
					variant="ghost"
					size="icon"
					className="pktw-h-6 pktw-w-6"
					onClick={(e) => {
						e.stopPropagation();
						handleCreateProject();
					}}
					title="New Project"
				>
					<Plus className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
			</div>

			{/* Projects List */}
			{!isProjectsCollapsed && (
				<div className="peak-project-list-view__list">
					{projectsToShow.map((project) => (
						<ProjectItem
							key={project.meta.id}
							project={project}
							isExpanded={expandedProjects.has(project.meta.id)}
							conversations={projectConversations.get(project.meta.id) || []}
							isConversationActive={isConversationActive}
							onProjectHeaderClick={handleProjectHeaderClick}
							onNewConversation={handleNewConversation}
							onConversationClick={handleConversationClick}
							onContextMenu={handleContextMenu}
							onShowAllConversations={setAllConversations}
						/>
					))}

					{hasMoreProjects && (
						<div
							className="peak-project-list-view__see-more pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
							onClick={() => setAllProjects()}
						>
							<MoreHorizontal className="peak-icon pktw-w-4 pktw-h-4" />
							<span className="peak-project-list-view__see-more-text">See more</span>
						</div>
					)}
				</div>
			)}

			{/* Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
				/>
			)}
		</div>
	);
};

