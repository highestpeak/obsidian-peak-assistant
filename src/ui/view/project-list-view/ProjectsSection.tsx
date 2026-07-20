import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatConversation, ChatProject } from '@/service/chat/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { hydrateProjects as hydrateProjectsFromManager, showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, MoreHorizontal } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ViewEventType, ConversationUpdatedEvent, ConversationCreatedEvent } from '@/core/eventBus';
import { DEFAULT_NEW_CONVERSATION_TITLE, MAX_CONVERSATIONS_PER_PROJECT, MAX_PROJECTS_DISPLAY } from '@/core/constant';
import { ConversationList } from './ConversationsSection';
import { showToast } from '@/ui/utils/toast';
import { useChatStudioLeftStrings } from './chatStudioLeftStringsContext';

interface ProjectItemProps {
	project: ChatProject;
	isExpanded: boolean;
	conversations: ChatConversation[];
	typewriterEnabled: Map<string, boolean>;
	onTypewriterComplete: (conversationId: string) => void;
	onDeleteConversation?: (conversation: ChatConversation) => void;
	onMenuAction?: () => void;
}

const ProjectItem: React.FC<ProjectItemProps> = ({
	project,
	isExpanded,
	conversations,
	typewriterEnabled,
	onTypewriterComplete,
	onDeleteConversation,
	onMenuAction,
}) => {
	const strings = useChatStudioLeftStrings();
	const { manager, vaultNavigation, eventBus } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const {
		activeConversation,
		activeProject,
		setActiveProject,
		setActiveConversation,
		toggleProjectExpanded,
		updateProject,
		updateConversation,
	} = useChatDataStore();

	const conversationsToShow = conversations.slice(0, MAX_CONVERSATIONS_PER_PROJECT);
	const hasMoreConversations = conversations.length > MAX_CONVERSATIONS_PER_PROJECT;
	const isProjectSelected = activeProject?.meta.id === project.meta.id;

	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		placeholderText?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);

	const isConversationActive = useCallback((conversation: ChatConversation): boolean => {
		return activeConversation?.meta.id === conversation.meta.id;
	}, [activeConversation]);

	// LEFT-03: chevron ONLY toggles expand/collapse; project name opens the
	// project home. Both are focusable with separate aria-labels.
	const handleChevronClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		toggleProjectExpanded(project.meta.id);
	}, [project.meta.id, toggleProjectExpanded]);

	const handleNameClick = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		setActiveProject(project);
		await chatNavigation.openProjectOverviewInChat(project);
	}, [chatNavigation, project, setActiveProject]);

	const handleConversationClick = async (conversation: ChatConversation) => {
		await chatNavigation.openConversationInChat(conversation);
	};

	const handleNewConversation = async () => {
		setActiveProject(project);
		await chatNavigation.openPendingConversationInChat({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: project,
		});
	};

	const handleEditProjectName = useCallback((projectItem: ChatProject) => {
		setInputModalConfig({
			message: strings.menuRename,
			placeholderText: strings.projectNamePlaceholder,
			initialValue: projectItem.meta.name,
			onSubmit: async (newName: string | null) => {
				if (!newName || !newName.trim()) return;
				try {
					const updated = await manager.proj.renameProject(projectItem.meta.id, newName.trim());
					updateProject(updated);
					if (activeProject?.meta.id === projectItem.meta.id) {
						setActiveProject(updated);
					}
				} catch (error) {
					console.error('Failed to rename project', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateProject, activeProject, setActiveProject, strings.menuRename]);

	const handleEditConversationTitle = useCallback((conversation: ChatConversation) => {
		setInputModalConfig({
			message: strings.menuRename,
			placeholderText: strings.conversationTitlePlaceholder,
			initialValue: conversation.meta.title,
			onSubmit: async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) return;
				try {
					await manager.conv.updateConversationTitle({
						conversationId: conversation.meta.id,
						title: newTitle.trim(),
					});
					const updatedConversation = await manager.readConversation(conversation.meta.id, false);
					if (!updatedConversation) throw new Error('Failed to reload conversation');
					updateConversation(updatedConversation);
					if (isConversationActive(conversation)) setActiveConversation(updatedConversation);
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateConversation, isConversationActive, setActiveConversation, strings.menuRename]);

	// Project row menu — hide unsupported actions entirely (no disabled slots).
	// `ownerDoc` is the triggering element's document so confirm() lands on the
	// correct window (popped-out Chat Studio has its own document).
	const projectMenuItems = useCallback((projectItem: ChatProject, ownerDoc: Document) => {
		const items: Array<{ title: string; icon: string; onClick: () => void | Promise<void> }> = [
			{
				title: strings.menuNewConversation,
				icon: 'plus',
				onClick: () => void handleNewConversation(),
			},
			{
				title: strings.menuRename,
				icon: 'pencil',
				onClick: () => handleEditProjectName(projectItem),
			},
		];
		if (projectItem.meta.folderPath) {
			items.push({
				title: strings.menuOpenFolder,
				icon: 'folder-open',
				onClick: async () => {
					try {
						await vaultNavigation.openSourceFile({ path: projectItem.meta.folderPath! } as any);
					} catch (err) {
						console.warn('Open project folder failed', err);
					}
				},
			});
		}
		items.push({
			title: strings.menuDelete,
			icon: 'trash',
			onClick: async () => {
				const win = ownerDoc.defaultView ?? window;
				const ok = win.confirm(`${strings.deleteProjectConfirmTitle}\n\n${strings.deleteProjectConfirmBody}`);
				if (!ok) return;
				await manager.proj.deleteProject(projectItem.meta.id);
				const { projects: currentProjects, setProjects, activeProject: current, setActiveProject: setActive } = useChatDataStore.getState();
				const updated = Array.from(currentProjects.values()).filter((p) => p.meta.id !== projectItem.meta.id);
				setProjects(updated);
				if (current?.meta.id === projectItem.meta.id) setActive(null);
				onMenuAction?.();
			},
		});
		return items;
	}, [handleEditProjectName, manager, onMenuAction, strings, vaultNavigation]);

	// Conversation row menu — LEFT-04 full action registry.
	// `ownerDoc` threads the triggering element's document to confirm() (popout).
	const conversationMenuItems = useCallback((conversation: ChatConversation, ownerDoc: Document) => {
		const meta = conversation.meta;
		const items: Array<{ title: string; icon: string; onClick: () => void | Promise<void> }> = [
			{
				title: meta.pinned ? strings.menuUnpin : strings.menuPin,
				icon: meta.pinned ? 'pin-off' : 'pin',
				onClick: async () => {
					await manager.conv.setConversationPinned(meta.id, !meta.pinned);
					onMenuAction?.();
				},
			},
			{
				title: strings.menuRename,
				icon: 'pencil',
				onClick: () => handleEditConversationTitle(conversation),
			},
			{
				title: strings.menuRemoveFromProject,
				icon: 'folder-minus',
				onClick: async () => {
					await manager.conv.moveToProject({ conversationId: meta.id });
					onMenuAction?.();
				},
			},
			{
				title: strings.menuOpenSource,
				icon: 'file-text',
				onClick: async () => {
					await vaultNavigation.openSourceFile(conversation.file);
				},
			},
			{
				title: meta.archived ? strings.menuRestore : strings.menuArchive,
				icon: meta.archived ? 'archive-restore' : 'archive',
				onClick: async () => {
					await manager.conv.setConversationArchived(meta.id, !meta.archived);
					onMenuAction?.();
				},
			},
			{
				title: strings.menuDelete,
				icon: 'trash',
				onClick: async () => {
					const win = ownerDoc.defaultView ?? window;
					const ok = win.confirm(`${strings.deleteConfirmTitle}\n\n${strings.deleteConfirmBody}`);
					if (!ok) return;
					await manager.conv.deleteConversation(meta.id);
					const { conversations: current, setConversations, activeConversation: active, setActiveConversation } = useChatDataStore.getState();
					const updated = Array.from(current.values()).filter((c) => c.meta.id !== meta.id);
					setConversations(updated);
					if (active?.meta.id === meta.id) setActiveConversation(null);
					onDeleteConversation?.(conversation);
					onMenuAction?.();
				},
			},
		];
		return items;
	}, [handleEditConversationTitle, manager, onDeleteConversation, onMenuAction, strings, vaultNavigation]);

	const handleContextMenu = (
		e: React.MouseEvent,
		type: 'project' | 'conversation',
		item: ChatProject | ChatConversation
	) => {
		const ownerDoc = e.currentTarget?.ownerDocument ?? document;
		const menuItems = type === 'project'
			? projectMenuItems(item as ChatProject, ownerDoc)
			: conversationMenuItems(item as ChatConversation, ownerDoc);
		showContextMenu(e, menuItems);
	};

	// LEFT-03 drag-conversation-into-project — visible dragover highlight,
	// accepted flash + error notice.
	const handleDragOver = (e: React.DragEvent) => {
		if (!e.dataTransfer.types.includes('application/x-peak-conversation-id')) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		setIsDragOver(true);
	};
	const handleDragLeave = () => setIsDragOver(false);
	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		const conversationId = e.dataTransfer.getData('application/x-peak-conversation-id');
		if (!conversationId) return;
		try {
			await manager.conv.moveToProject({ conversationId, projectId: project.meta.id });
			showToast.success(`${strings.moveToProjectSuccessPrefix} ${project.meta.name}`, { eventBus });
			onMenuAction?.();
		} catch (err) {
			showToast.error(strings.moveFailedLabel, {
				eventBus,
				description: err instanceof Error ? err.message : 'Unknown error',
			});
		}
	};

	return (
		<div
			className={cn(
				'pktw-flex pktw-flex-col pktw-mb-0.5 pktw-rounded pktw-transition-colors',
				isDragOver && 'pktw-bg-[color:var(--pk-accent-tint)]'
			)}
			data-project-id={project.meta.id}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={(e) => void handleDrop(e)}
		>
			{/* Project row (mock `.nav-row.is-project`) — disclosure toggles
			    expand, the open button navigates to project home, the persistent
			    "…" button (hover-revealed) opens the project action menu (which
			    still carries "New conversation" — mock has no inline create row). */}
			<div className={cn('pkstudio-nav-row', 'is-project', isProjectSelected && 'is-selected')}>
				<button
					type="button"
					className="pkstudio-project-disclosure"
					aria-label={(isExpanded ? strings.ariaCollapseProject : strings.ariaExpandProject).replace('{name}', project.meta.name)}
					aria-expanded={isExpanded}
					onClick={handleChevronClick}
					onContextMenu={(e) => handleContextMenu(e, 'project', project)}
				>
					{isExpanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
				</button>
				<button
					type="button"
					className="pkstudio-project-open"
					aria-label={strings.ariaOpenProject.replace('{name}', project.meta.name)}
					onClick={(e) => void handleNameClick(e)}
					onContextMenu={(e) => handleContextMenu(e, 'project', project)}
				>
					<span className="pkstudio-nav-leading" aria-hidden>
						{isExpanded ? <FolderOpen /> : <Folder />}
					</span>
					<span className="pkstudio-row-label" title={project.meta.name}>
						{project.meta.name}
					</span>
				</button>
				<button
					type="button"
					className="pkstudio-row-menu"
					aria-label={strings.projectMenuLabel}
					onClick={(e) => handleContextMenu(e, 'project', project)}
				>
					<MoreHorizontal aria-hidden />
				</button>
			</div>

			{/* Conversations */}
			<div className={cn(
				'pktw-flex pktw-flex-col pktw-gap-px pktw-overflow-hidden pktw-transition-all pktw-duration-150 pktw-ease-in-out',
				'pkproj-children',
				isExpanded
					? 'pktw-max-h-[5000px] pktw-opacity-100 pktw-mt-0.5 pointer-events-auto'
					: 'pktw-max-h-0 pktw-opacity-0 pktw-mt-0 pointer-events-none'
			)}>
				<ConversationList
					conversations={conversationsToShow}
					activeConversation={activeConversation}
					typewriterEnabled={typewriterEnabled}
					onConversationClick={handleConversationClick}
					onContextMenu={(e, conv) => {
						e.stopPropagation();
						handleContextMenu(e, 'conversation', conv);
					}}
					onDragStart={(e, conv) => {
						e.dataTransfer.setData('application/x-peak-conversation-id', conv.meta.id);
						e.dataTransfer.effectAllowed = 'move';
					}}
					onTypewriterComplete={(conversationId) => onTypewriterComplete(conversationId)}
				/>

				{hasMoreConversations && (
					<div
						className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-xs pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
						onClick={(e) => {
							e.stopPropagation();
							void chatNavigation.openProjectConversationsListInChat(project);
						}}
					>
						<MoreHorizontal className="pktw-w-3.5 pktw-h-3.5" />
						<span className="pktw-flex-1">{strings.seeMoreLabel}</span>
					</div>
				)}
			</div>

			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					placeholderText={inputModalConfig.placeholderText}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};

interface ProjectsSectionProps {
	query?: string;
	onMenuAction?: () => void;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({ query = '', onMenuAction }) => {
	const strings = useChatStudioLeftStrings();
	const { manager, eventBus } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const {
		projects,
		expandedProjects,
	} = useChatDataStore();
	const [projectConversations, setProjectConversations] = useState<Map<string, ChatConversation[]>>(new Map());
	const [typewriterEnabled, setTypewriterEnabled] = useState<Map<string, boolean>>(new Map());
	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		placeholderText?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	const loadProjectConversations = useCallback(
		async (project: ChatProject) => {
			const conversations = await manager.conv.listConversations(project.meta.id);
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
			const { conversations: currentConversations, setConversations } = useChatDataStore.getState();
			const allConversations = new Map(currentConversations);
			conversations.forEach((conv) => allConversations.set(conv.meta.id, conv));
			setConversations(Array.from(allConversations.values()));
			return conversations;
		},
		[manager]
	);

	useEffect(() => {
		expandedProjects.forEach((projectId) => {
			const project = projects.get(projectId);
			if (project) void loadProjectConversations(project);
		});
	}, [expandedProjects, projects, loadProjectConversations]);

	useEffect(() => {
		const unsubscribeUpdated = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const conversation = event.conversation;
				setTypewriterEnabled((prev) => {
					const next = new Map(prev);
					next.set(conversation.meta.id, true);
					return next;
				});
				if (conversation.meta.projectId) {
					const project = projects.get(conversation.meta.projectId);
					if (project && expandedProjects.has(conversation.meta.projectId)) {
						await loadProjectConversations(project);
					}
				}
			}
		);

		const unsubscribeCreated = eventBus.on<ConversationCreatedEvent>(
			ViewEventType.CONVERSATION_CREATED,
			(event) => {
				setTypewriterEnabled((prev) => {
					const next = new Map(prev);
					next.set(event.conversationId, true);
					return next;
				});
			}
		);

		return () => {
			unsubscribeUpdated();
			unsubscribeCreated();
		};
	}, [eventBus, projects, expandedProjects, loadProjectConversations]);

	const handleTypewriterComplete = useCallback((conversationId: string) => {
		setTypewriterEnabled((prev) => {
			const next = new Map(prev);
			next.delete(conversationId);
			return next;
		});
	}, []);

	const handleDeleteConversation = useCallback((conversation: ChatConversation) => {
		if (conversation.meta.projectId) {
			setProjectConversations((prev) => {
				const next = new Map(prev);
				const projConvs = next.get(conversation.meta.projectId!) || [];
				next.set(conversation.meta.projectId!, projConvs.filter((c) => c.meta.id !== conversation.meta.id));
				return next;
			});
		}
	}, []);

	const handleCreateProject = () => {
		setInputModalConfig({
			message: strings.createProjectTitle,
			placeholderText: strings.projectNamePlaceholder,
			hintText: strings.createProjectHint,
			submitButtonText: strings.createProjectSubmit,
			onSubmit: async (name: string | null) => {
				if (!name || !name.trim()) return;
				await manager.proj.createProject({ name: name.trim() });
				await hydrateProjectsFromManager(manager);
			},
		});
		setInputModalOpen(true);
	};

	const { projectsToShow, hasMoreProjects, totalProjects } = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = Array.from(projects.values())
			.filter((p) => !q || (p.meta.name || '').toLowerCase().includes(q))
			.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
		return {
			projectsToShow: list.slice(0, MAX_PROJECTS_DISPLAY),
			hasMoreProjects: list.length > MAX_PROJECTS_DISPLAY,
			totalProjects: list.length,
		};
	}, [projects, query]);

	return (
		<div className="pkstudio-nav-section">
			{/* Section header (mock `.section-label`) — label + count, no section-
			    level chevron/collapse (mock has none; per-project chevrons only).
			    The New-project affordance is hover-revealed to the right. */}
			<div className="pkstudio-section-label pktw-group">
				<span className="pkstudio-section-label__lead">{strings.projectsHeader}</span>
				<span className="pkstudio-section-label__count">{totalProjects}</span>
				<IconButton
					size="md"
					className="pkstudio-section-label__add pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
					onClick={(e) => {
						e.stopPropagation();
						handleCreateProject();
					}}
					title={strings.newProjectLabel}
				>
					<Plus className="pktw-text-foreground" />
				</IconButton>
			</div>

			<div className="pktw-flex pktw-flex-col pktw-gap-px">
				{projectsToShow.map((project) => (
					<ProjectItem
						key={project.meta.id}
						project={project}
						isExpanded={expandedProjects.has(project.meta.id)}
						conversations={projectConversations.get(project.meta.id) || []}
						typewriterEnabled={typewriterEnabled}
						onTypewriterComplete={handleTypewriterComplete}
						onDeleteConversation={handleDeleteConversation}
						onMenuAction={onMenuAction}
					/>
				))}

				{hasMoreProjects && (
					<div
						className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-pk-md pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
						onClick={() => {
							void chatNavigation.openAllProjectsInChat();
						}}
					>
						<MoreHorizontal className="pktw-w-4 pktw-h-4" />
						<span className="pktw-flex-1">{strings.seeMoreLabel}</span>
					</div>
				)}
			</div>

			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					placeholderText={inputModalConfig.placeholderText}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};
