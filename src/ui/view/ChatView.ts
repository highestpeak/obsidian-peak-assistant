import { IconName, ItemView, TFolder, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile, PendingConversation } from 'src/service/chat/types';
import { ScrollController } from './chat-view/ScrollController';
import { ModalManager } from './chat-view/ModalManager';
import { AllProjectsView } from './chat-view/view-AllProjects';
import { AllConversationsView } from './chat-view/view-AllConversations';
import { MessagesView } from './chat-view/view-Messages';
import { ProjectOverviewView } from './chat-view/view-ProjectOverview';
import { openSourceFile } from './shared/view-utils';
import { IChatView, IMessageHistoryView } from './view-interfaces';
import { MESSAGE_HISTORY_VIEW_TYPE } from './MessageHistoryView';
import { EventBus, SelectionChangedEvent, ViewEventType } from 'src/core/eventBus';
import { useChatViewStore } from '../store/chatViewStore';

export const CHAT_VIEW_TYPE = 'peak-chat-view';

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
	// message view for a conversation within project
	CONVERSATION_IN_PROJECT = 'conversation-in-project',
	// message view for a conversation not in a project
	STANDALONE_CONVERSATION = 'standalone-conversation',
}

export class ChatView extends ItemView implements IChatView {
	// Controllers
	private scrollController: ScrollController;
	private keydownHandler?: (e: KeyboardEvent) => void;
	// View mode state
	private viewMode: ViewMode = ViewMode.STANDALONE_CONVERSATION;
	// Views
	private allProjectsView: AllProjectsView;
	private allConversationsView: AllConversationsView;
	private messagesView: MessagesView;
	private projectOverviewView: ProjectOverviewView;
	private eventBus: EventBus;
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, private readonly aiServiceManager: AIServiceManager) {
		super(leaf);
		this.eventBus = EventBus.getInstance(this.app);
		this.scrollController = new ScrollController();
		this.messagesView = new MessagesView(
			this.app,
			this.aiServiceManager,
			this.scrollController
		);
		this.allProjectsView = new AllProjectsView(
			this.aiServiceManager,
			this
		);
		this.allConversationsView = new AllConversationsView(
			this.aiServiceManager,
			this
		);
		this.projectOverviewView = new ProjectOverviewView(
			this.app,
			this.aiServiceManager,
			this
		);
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Peak Chat';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-view');

		// Subscribe to selection changed events
		this.unsubscribeHandlers.push(
			this.eventBus.on<SelectionChangedEvent>(ViewEventType.SELECTION_CHANGED, async (event) => {
				if (event.conversationId) {
					// Load conversation and project from IDs
					let project: ParsedProjectFile | null = null;
					if (event.projectId) {
						const projects = await this.aiServiceManager.listProjects();
						project = projects.find(p => p.meta.id === event.projectId) ?? null;
					}
					const conversations = await this.aiServiceManager.listConversations(project?.meta);
					const conversation = conversations.find(c => c.meta.id === event.conversationId);
					if (conversation) {
						this.showMessagesForOneConvsation(conversation, project);
					}
				}
			})
		);

		// Subscribe to chat view store changes
		// Only update if viewMode changes and doesn't match current viewMode
		let lastViewMode: ViewMode | null = null;
		let lastPendingConversation: PendingConversation | null = null;
		const unsubscribeStore = useChatViewStore.subscribe((state) => {
			// Handle pending conversation changes
			if (state.pendingConversation !== lastPendingConversation) {
				lastPendingConversation = state.pendingConversation;
				this.setPendingConversation(state.pendingConversation);
			}

			// Skip if viewMode hasn't changed or is null
			if (state.viewMode === null || state.viewMode === lastViewMode) return;
			lastViewMode = state.viewMode;

			if (state.viewMode === ViewMode.PROJECT_OVERVIEW && state.projectForOverview) {
				// Use the existing method to maintain consistency
				void this.showProjectOverview(state.projectForOverview);
			} else if (state.viewMode === ViewMode.ALL_PROJECTS) {
				void this.showAllProjects();
			} else if (state.viewMode === ViewMode.ALL_CONVERSATIONS) {
				void this.showAllConversations();
			}
		});
		this.unsubscribeHandlers.push(unsubscribeStore);

		this.render();
		this.setupKeyboardShortcuts();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from events
		this.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
		this.unsubscribeHandlers = [];

		this.removeKeyboardShortcuts();
		this.containerEl.empty();
	}

	private render(): void {
		const { containerEl } = this;
		containerEl.empty();

		const headerEl = containerEl.createDiv({ cls: 'peak-chat-view__header' });
		const bodyEl = containerEl.createDiv({ cls: 'peak-chat-view__body' });
		this.scrollController.setBodyEl(bodyEl);
		// Add a scrollable wrapper inside body to move scrollbar to the edge
		const scrollWrapper = bodyEl.createDiv({ cls: 'peak-chat-view__scroll-wrapper' });
		const footerEl = containerEl.createDiv({ cls: 'peak-chat-view__footer' });

		switch (this.viewMode) {
			case ViewMode.ALL_PROJECTS:
				void this.allProjectsView.render(headerEl, scrollWrapper, footerEl);
				break;
			case ViewMode.ALL_CONVERSATIONS:
				void this.allConversationsView.render(headerEl, scrollWrapper, footerEl);
				break;
			case ViewMode.PROJECT_OVERVIEW:
				void this.projectOverviewView.render(headerEl, scrollWrapper, footerEl);
				break;
			case ViewMode.CONVERSATION_IN_PROJECT:
			case ViewMode.STANDALONE_CONVERSATION:
				this.messagesView.render(headerEl, scrollWrapper, footerEl);
				break;
		}
	}

	/**
	 * Scroll to a specific message by ID
	 */
	scrollToMessage(messageId: string): void {
		this.messagesView.requestScrollToMessage(messageId);
	}

	/**
	 * Set active conversation and switch to conversation view mode
	 */
	showMessagesForOneConvsation(conversation: ParsedConversationFile, project?: ParsedProjectFile | null): void {
		// Switch to conversation view mode
		this.viewMode = conversation.meta.projectId
			? ViewMode.CONVERSATION_IN_PROJECT
			: ViewMode.STANDALONE_CONVERSATION;

		this.messagesView.setConversation(conversation, project ?? null);
		this.updateMessageHistorySelection(conversation);
		this.render();
	}

	/**
	 * Show project overview with conversation list
	 */
	async showProjectOverview(project: ParsedProjectFile): Promise<void> {
		this.viewMode = ViewMode.PROJECT_OVERVIEW;

		await this.projectOverviewView.setProject(project);
		this.updateMessageHistorySelection(null);
		this.render();
	}

	/**
	 * Show all projects in card view
	 */
	async showAllProjects(): Promise<void> {
		this.viewMode = ViewMode.ALL_PROJECTS;
		this.render();
	}

	/**
	 * Show all standalone conversations (not in any project)
	 */
	async showAllConversations(): Promise<void> {
		this.viewMode = ViewMode.ALL_CONVERSATIONS;
		this.render();
	}

	/**
	 * Update sidebar history selection for the active conversation.
	 */
	private updateMessageHistorySelection(conversation: ParsedConversationFile | null): void {
		this.app.workspace.getLeavesOfType(MESSAGE_HISTORY_VIEW_TYPE).forEach(leaf => {
			const view = leaf.view as unknown as IMessageHistoryView;
			view.setActiveConversation(conversation);
		});
	}

	/**
	 * Setup keyboard shortcuts for this view
	 */
	private setupKeyboardShortcuts(): void {
		this.keydownHandler = (e: KeyboardEvent) => {
			// Only handle if this view is active
			const activeView = this.app.workspace.getActiveViewOfType(ChatView);
			if (activeView !== this) {
				return;
			}

			// Command+K or Ctrl+K to focus input (handle both 'k' and 'K')
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;

			if (isModKey && isKKey) {
				// Only handle if not already in input or if input is not focused
				const inputArea = this.messagesView.getInputArea();
				const activeElement = document.activeElement;
				if (inputArea && activeElement !== inputArea.inputEl) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					this.messagesView.focusInput();
					return false;
				}
			}
		};
		// Use capture phase on window to intercept early, before Obsidian's handlers
		window.addEventListener('keydown', this.keydownHandler, true);
	}

	/**
	 * Remove keyboard shortcuts
	 */
	private removeKeyboardShortcuts(): void {
		if (this.keydownHandler) {
			window.removeEventListener('keydown', this.keydownHandler, true);
			this.keydownHandler = undefined;
		}
	}

	/**
	 * Set pending conversation state
	 * This will be created when user sends first message
	 */
	setPendingConversation(pending: PendingConversation | null): void {
		// Switch to conversation view mode to show input area
		if (pending) {
			this.viewMode = pending.project 
				? ViewMode.CONVERSATION_IN_PROJECT 
				: ViewMode.STANDALONE_CONVERSATION;
			this.messagesView.setConversation(null);
			this.messagesView.setPendingConversation(pending);
			this.render();
		}
	}

}
