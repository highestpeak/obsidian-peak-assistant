import React, { useEffect, useCallback, useState } from 'react';
import { ProjectsSection } from './ProjectsSection';
import { ConversationsSection } from './ConversationsSection';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { ViewEventType, SelectionChangedEvent, ConversationUpdatedEvent } from '@/core/eventBus';
import { notifySelectionChange, hydrateProjects } from './utils';
import { RefreshCw, Minus, Home, Search, X } from 'lucide-react';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { IconButton as PkIconButton } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { showToast } from '@/ui/utils/toast';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';

interface ProjectListViewComponentProps {
	/** Compact layout for the narrow Obsidian sidebar leaf:
	 *  - drops the "Peak Assistant" brand row entirely
	 *  - moves the search input inline with Home / Refresh / Collapse buttons
	 *  Studio's wider left column omits this prop and keeps the legacy
	 *  brand-row + dedicated-search-row layout.
	 */
	compact?: boolean;
}

/**
 * Main React component for ProjectListView
 */
export const ProjectListViewComponent: React.FC<ProjectListViewComponentProps> = ({ compact = false }) => {
	const { manager, eventBus } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const {
		setProjects,
		setConversations,

		activeProject,
		activeConversation,

		setActiveProject,
		setActiveConversation,
		clearExpandedProjects,
	} = useChatDataStore();

	// Sidebar-local search query. Filters projects + conversations in the two
	// sub-sections. Kept local (not in chatDataStore) since it never persists
	// across mounts and no other surface reads it.
	const [query, setQuery] = useState('');

	// Hydrate data
	const hydrateData = useCallback(async () => {
		// Load projects
		await hydrateProjects(manager);
		const projectsMap = useChatDataStore.getState().projects;
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
		const conversationsList = await manager.conv.listConversations(null);
		conversationsList.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		setConversations(conversationsList);
		const conversationsMap = useChatDataStore.getState().conversations;

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
		void chatNavigation.openChatHome();
	};

	// Refresh projects and conversations
	const handleRefresh = async () => {
		try {
			clearExpandedProjects();
			await hydrateData();
			// Dispatch selection changed event
			await notifySelectionChange(eventBus);
			// Show success toast (will be displayed in ChatView)
			showToast.success('Projects and conversations refreshed', { eventBus });
		} catch (error) {
			// Show error toast
			showToast.error('Failed to refresh data', {
				eventBus,
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
				const { setActiveProject, setActiveConversation, toggleProjectExpanded, expandedProjects, projects, conversations } = useChatDataStore.getState();

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
				const { updateConversation, expandedProjects, projects } = useChatDataStore.getState();
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

	/*
	 * Background is intentionally transparent so the user's Obsidian theme
	 * (light / dark / custom) sets the sidebar bg — matches how Obsidian's
	 * own file explorer & outline panels render. Previously this used
	 * `pktw-bg-background` → `var(--pk-bg)` which in dark mode is
	 * #1e1e2e (purple-tinted) and clashed with native Obsidian chrome.
	 */
	const searchBox = (
		<div
			className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-1 pktw-min-w-0"
			style={{
				background: 'var(--pk-surface)',
				border: '1px solid var(--pk-border)',
				borderRadius: 'var(--pk-radius-md)',
				padding: '4px 8px',
			}}
		>
			<Search
				style={{
					width: 14,
					height: 14,
					flexShrink: 0,
					color: 'var(--pk-text-tertiary)',
				}}
			/>
			<input
				type="text"
				value={query}
				placeholder="Find chat or project"
				onChange={(e) => setQuery(e.target.value)}
				className="pktw-flex-1 pktw-min-w-0"
				style={{
					background: 'transparent',
					border: 0,
					outline: 'none',
					fontSize: 13,
					color: 'var(--pk-text-primary)',
					padding: 0,
				}}
			/>
			{query.length > 0 ? (
				<PkIconButton
					label="Clear search"
					title="Clear search"
					onClick={() => setQuery('')}
					style={{ width: 18, height: 18 }}
				>
					<X style={{ width: 12, height: 12 }} />
				</PkIconButton>
			) : (
				<span
					aria-hidden
					style={{
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
						fontSize: 10,
						color: 'var(--pk-text-tertiary)',
						padding: '1px 5px',
						border: '1px solid var(--pk-border)',
						borderRadius: 4,
						lineHeight: 1.2,
					}}
				>
					⌘K
				</span>
			)}
		</div>
	);

	const toolbarButtons = (
		<>
			<IconButton
				size="md"
				className="pktw-shrink-0"
				onClick={handleGoHome}
				title="Go to home"
			>
				<Home className="pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors" />
			</IconButton>
			<IconButton
				size="md"
				className="pktw-shrink-0"
				onClick={handleRefresh}
				title="Refresh projects and conversations"
			>
				<RefreshCw className="pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors" />
			</IconButton>
			<IconButton
				size="md"
				className="pktw-shrink-0"
				onClick={() => clearExpandedProjects()}
				title="Collapse all projects"
			>
				<Minus className="pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors" />
			</IconButton>
		</>
	);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-p-0 pktw-box-border pktw-overflow-y-auto" style={{ background: 'transparent' }}>
			{compact ? (
				/* Compact (sidebar leaf): search inline with toolbar buttons, no brand row. */
				<div className="peak-design-root pktw-flex pktw-flex-row pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-3 pktw-pb-1">
					{searchBox}
					{toolbarButtons}
				</div>
			) : (
				<>
					{/* Brand bar + toolbar */}
					<div className="pktw-flex pktw-flex-row pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-3 pktw-pb-1">
						<span
							className="pktw-inline-flex pktw-items-center pktw-justify-center pktw-shrink-0"
							style={{
								width: 22,
								height: 22,
								borderRadius: 6,
								background: 'linear-gradient(180deg, var(--pk-accent) 0%, var(--pk-accent-hover) 100%)',
								color: '#ffffff',
							}}
							aria-hidden
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
								<path d="M3 20 L9 8 L13 14 L17 6 L21 20 Z" />
							</svg>
						</span>
						<span className="pktw-text-[13px] pktw-font-semibold pktw-text-foreground pktw-flex-1 pktw-min-w-0 pktw-truncate">
							Peak Assistant
						</span>
						{toolbarButtons}
					</div>

					{/* Search */}
					<div className="peak-design-root pktw-px-3 pktw-pt-2 pktw-pb-1">
						{searchBox}
					</div>
				</>
			)}

			<div className="pktw-px-3 pktw-pb-6">
				{/* Projects Section */}
				<ProjectsSection query={query} />

				{/* Conversations Section */}
				<ConversationsSection query={query} />
			</div>
		</div>
	);
};
