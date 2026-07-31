import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { ProjectsSection } from './ProjectsSection';
import { ConversationsSection } from './ConversationsSection';
import { PinnedSection } from './PinnedSection';
import { ViewAllPicker } from './ViewAllPicker';
import {
	ChatStudioLeftStringsProvider,
	useChatStudioLeftStrings,
} from './chatStudioLeftStringsContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import type { ChatConversationMeta } from '@/core/types/chat';
import { ViewEventType, SelectionChangedEvent, ConversationUpdatedEvent, ConversationCreatedEvent } from '@/core/eventBus';
import { notifySelectionChange, hydrateProjects } from './utils';
import { Search, SquarePen } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { showToast } from '@/ui/utils/toast';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import { splitPinnedAndRecent } from '@/ui/view/chat-studio-view/chatStudioLeftLogic';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_A11Y_STRINGS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

interface ProjectListViewComponentProps {
	/**
	 * Legacy compact flag — the new left column (chat-studio §6) has a single
	 * information architecture (New chat / Search / Pinned / Projects / Recent)
	 * used in both the Studio's wider column and the narrow Obsidian sidebar
	 * leaf. The prop is accepted for backward compatibility with existing
	 * mount points but no longer branches layout.
	 */
	compact?: boolean;
}

export const ProjectListViewComponent: React.FC<ProjectListViewComponentProps> = () => {
	return (
		<ChatStudioLeftStringsProvider>
			<ProjectListInner />
		</ChatStudioLeftStringsProvider>
	);
};
const ProjectListInner: React.FC = () => {
	const strings = useChatStudioLeftStrings();
	const { manager, eventBus, quickSearchLauncher } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const {
		setProjects,
		setConversations,
		activeProject,
		activeConversation,
		setActiveProject,
		setActiveConversation,
	} = useChatDataStore();

	const [recentMetas, setRecentMetas] = useState<ChatConversationMeta[]>([]);
	const [typewriterEnabled, setTypewriterEnabled] = useState<Map<string, boolean>>(new Map());
	const [pickerOpen, setPickerOpen] = useState(false);
	const navigationRef = useRef<HTMLDivElement>(null);
	useRovingComposite(navigationRef, {
		itemSelector: [
			'.pkstudio-sidebar-command',
			'.pkstudio-nav-row[role="treeitem"]',
			'.pkstudio-section-label__add',
			'.pkstudio-section-link',
		].join(','),
		orientation: 'vertical',
		rememberBy: 'data-conversation-id',
	});

	const refreshRecentMetas = useCallback(async () => {
		try {
			const metas = await manager.conv.listRecentConversationMetas(200);
			setRecentMetas(metas);
		} catch (err) {
			console.warn('[peak-left] failed to load recent conversation metas', err);
		}
	}, [manager]);

	const hydrateData = useCallback(async () => {
		await hydrateProjects(manager);
		const projectsMap = useChatDataStore.getState().projects;
		if (activeProject) {
			const latestProject = projectsMap.get(activeProject.meta.id);
			setActiveProject(latestProject ?? null);
		}

		const conversationsList = await manager.conv.listConversations(null);
		conversationsList.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		setConversations(conversationsList);
		const conversationsMap = useChatDataStore.getState().conversations;
		if (activeConversation) {
			const latest = conversationsMap.get(activeConversation.meta.id);
			setActiveConversation(latest ?? null);
		}
		await refreshRecentMetas();
	}, [manager, activeProject, activeConversation, setProjects, setConversations, setActiveProject, setActiveConversation, refreshRecentMetas]);

	useEffect(() => {
		void hydrateData();
	}, []);

	// Subscribe to conversation and project update events.
	useEffect(() => {
		const unsubscribeSelection = eventBus.on<SelectionChangedEvent>(
			ViewEventType.SELECTION_CHANGED,
			async (event) => {
				const { setActiveProject: setAP, setActiveConversation: setAC, toggleProjectExpanded, expandedProjects, projects, conversations } = useChatDataStore.getState();
				if (event.projectId) {
					const project = projects.get(event.projectId);
					if (project) setAP(project);
				} else {
					setAP(null);
				}
				if (event.conversationId) {
					const conversation = conversations.get(event.conversationId);
					if (conversation) setAC(conversation);
				} else {
					setAC(null);
				}
				if (event.projectId && !expandedProjects.has(event.projectId)) {
					toggleProjectExpanded(event.projectId);
				}
			}
		);

		const unsubscribeUpdated = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const { updateConversation } = useChatDataStore.getState();
				updateConversation(event.conversation);
				setTypewriterEnabled((prev) => {
					const next = new Map(prev);
					next.set(event.conversation.meta.id, true);
					return next;
				});
				await refreshRecentMetas();
			}
		);
		const unsubscribeCreated = eventBus.on<ConversationCreatedEvent>(
			ViewEventType.CONVERSATION_CREATED,
			async (event) => {
				setTypewriterEnabled((prev) => {
					const next = new Map(prev);
					next.set(event.conversationId, true);
					return next;
				});
				await refreshRecentMetas();
			}
		);
		return () => {
			unsubscribeSelection();
			unsubscribeUpdated();
			unsubscribeCreated();
		};
	}, [eventBus, refreshRecentMetas]);

	// L-NEW-01 — creates a pending conversation via the existing navigation
	// action (no file write on click).
	const handleNewChat = useCallback(async () => {
		await chatNavigation.openPendingConversationInChat({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: null,
		});
	}, [chatNavigation]);

	// L-SEARCH-01 — app-owned handoff to the production Quick Search modal via
	// the narrow launcher port (never re-implements search UI internals).
	const handleSearchVault = useCallback(() => {
		try {
			quickSearchLauncher?.open();
		} catch (err) {
			showToast.error('Could not open Quick Search', {
				eventBus,
				description: err instanceof Error ? err.message : 'Unknown error',
			});
		}
	}, [eventBus, quickSearchLauncher]);

	// L-SEARCH-02 — only display a hotkey hint when a real binding exists.
	const searchHotkeyHint = useMemo(() => quickSearchLauncher?.hotkeyHint() ?? null, [quickSearchLauncher]);

	// L-PIN-01 — pinned vs recent are mutually exclusive by id; Pinned wins.
	const { pinnedRows, recentRows } = useMemo(() => {
		const rows = recentMetas.map((m) => ({
			id: m.id,
			pinned: m.pinned,
			pinnedAt: m.pinnedAt,
			meta: m,
		}));
		const split = splitPinnedAndRecent(rows);
		return {
			pinnedRows: split.pinned.map((r) => r.meta),
			recentRows: split.recent.map((r) => r.meta),
		};
	}, [recentMetas]);

	const handleTypewriterComplete = useCallback((id: string) => {
		setTypewriterEnabled((prev) => {
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const openPickerConversation = useCallback(async (id: string) => {
		const conversations = useChatDataStore.getState().conversations;
		const conv = conversations.get(id) ?? await manager.readConversation(id, false);
		if (conv) await chatNavigation.openConversationInChat(conv);
		await notifySelectionChange(eventBus, conv ?? null);
	}, [chatNavigation, eventBus, manager]);

	return (
		<div
			ref={navigationRef}
			className="pktw-flex pktw-flex-col pktw-h-full pktw-p-0 pktw-box-border pktw-overflow-y-auto pktw-bg-transparent"
			role="tree"
			aria-label={PEAK_KEYBOARD_A11Y_STRINGS.conversations}
		>
			{/* SHELL-01 / LEFT-01 — top actions: New chat, Search knowledge base.
			    Nav rows, not filled CTAs (mock `.sidebar-command`). No Peak
			    brand masthead here. */}
			<div className="pkstudio-left-tools">
				<button
					type="button"
					className="pkstudio-sidebar-command pkstudio-sidebar-command--primary"
					onClick={() => void handleNewChat()}
				>
					<SquarePen aria-hidden />
					<span className="pkstudio-sidebar-command__label">{strings.newChatLabel}</span>
				</button>
				<button
					type="button"
					className="pkstudio-sidebar-command"
					onClick={handleSearchVault}
				>
					<Search aria-hidden />
					<span className="pkstudio-sidebar-command__label">{strings.searchVaultLabel}</span>
					{searchHotkeyHint && (
						<kbd className="pkstudio-sidebar-command__kbd" aria-hidden>
							{searchHotkeyHint}
						</kbd>
					)}
				</button>
			</div>

			<div className="pkstudio-left-content">
				<PinnedSection pinnedMetas={pinnedRows} onMenuAction={() => void refreshRecentMetas()} />
				<ProjectsSection onMenuAction={() => void refreshRecentMetas()} />
				<ConversationsSection
					recentMetas={recentRows}
					typewriterEnabled={typewriterEnabled}
					onTypewriterComplete={handleTypewriterComplete}
					onViewAll={() => setPickerOpen(true)}
					onMenuAction={() => void refreshRecentMetas()}
				/>
			</div>

			<ViewAllPicker
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				metas={recentMetas}
				onPick={(id) => void openPickerConversation(id)}
			/>
		</div>
	);
};
