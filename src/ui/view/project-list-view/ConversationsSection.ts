import { App, Menu, TFile } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { createIcon, createChevronIcon } from 'src/core/IconHelper';
import { IChatView } from '../view-interfaces';
import { InputModal } from 'src/ui/component/InputModal';
import { openSourceFile } from '../shared/view-utils';
import { CHAT_VIEW_TYPE } from '../ChatView';

/**
 * Context interface for ConversationsSection to access ProjectListView state and methods
 */
export interface IConversationsSectionContext {
	// Methods
	notifySelectionChange(): Promise<void>;
	render(): Promise<void>;
}

/**
 * Conversations section component
 */
export class ConversationsSection {
	private conversationListEl?: HTMLElement;
	
	// State
	private conversations: ParsedConversationFile[] = [];
	private activeConversation: ParsedConversationFile | null = null;
	private isCollapsed: boolean = false;

	constructor(
		private readonly manager: AIServiceManager,
		private readonly app: App,
		private readonly context: IConversationsSectionContext
	) {}

	/**
	 * Get conversations list
	 */
	getConversations(): ParsedConversationFile[] {
		return this.conversations;
	}

	/**
	 * Get active conversation
	 */
	getActiveConversation(): ParsedConversationFile | null {
		return this.activeConversation;
	}

	/**
	 * Set active conversation
	 */
	setActiveConversation(conversation: ParsedConversationFile | null): void {
		this.activeConversation = conversation;
	}

	/**
	 * Toggle collapse state
	 */
	toggleCollapse(): void {
		this.isCollapsed = !this.isCollapsed;
	}

	/**
	 * Check if section is collapsed
	 */
	isSectionCollapsed(): boolean {
		return this.isCollapsed;
	}

	/**
	 * Hydrate conversations data
	 */
	async hydrateConversations(): Promise<void> {
		// Always load root-level conversations (without project) for the Conversations section
		this.conversations = await this.manager.listConversations();

		// Sort conversations by createdAtTimestamp descending (newest first)
		this.conversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
	}

	/**
	 * Render conversations section with header and list
	 */
	render(containerEl: HTMLElement): void {
		const conversationsSection = containerEl.createDiv({ cls: 'peak-project-list-view__section' });
		if (this.isCollapsed) {
			conversationsSection.addClass('is-collapsed');
		}

		const conversationsHeader = conversationsSection.createDiv({ cls: 'peak-project-list-view__header' });

		// Collapse/expand icon
		const conversationsCollapseIcon = conversationsHeader.createSpan({
			cls: 'peak-project-list-view__collapse-icon'
		});
		createChevronIcon(conversationsCollapseIcon, !this.isCollapsed, {
			size: 12,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});

		const conversationsTitle = conversationsHeader.createEl('h3', { text: 'Conversations' });

		// Make header clickable to toggle collapse
		conversationsHeader.style.cursor = 'pointer';
		conversationsHeader.addEventListener('click', (e) => {
			// Don't toggle if clicking on buttons
			if ((e.target as HTMLElement).closest('button')) {
				return;
			}
			this.toggleCollapse();
			this.context.render();
		});

		const newConversationBtn = conversationsHeader.createEl('button', {
			cls: 'peak-project-list-view__new-btn',
			attr: { title: 'New Conversation' }
		});
		createIcon(newConversationBtn, 'plus', {
			size: 14,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		newConversationBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openCreateConversationModal();
		});

		this.conversationListEl = conversationsSection.createDiv({ cls: 'peak-project-list-view__list' });
		this.renderConversations();
	}

	/**
	 * Render conversations list
	 */
	renderConversations(): void {
		if (!this.conversationListEl) return;
		this.conversationListEl.empty();

		// Get root-level conversations (without projectId)
		const conversationsWithoutProject = this.conversations.filter(c => !c.meta.projectId);

		if (conversationsWithoutProject.length === 0) {
			this.conversationListEl.createDiv({
				cls: 'peak-project-list-view__empty',
				text: 'No conversations'
			});
			return;
		}

		for (const conversation of conversationsWithoutProject) {
			this.renderConversationItem(conversation);
		}
	}

	/**
	 * Render a single conversation item
	 */
	private renderConversationItem(conversation: ParsedConversationFile): void {
		if (!this.conversationListEl) return;
		
		const item = this.conversationListEl.createDiv({
			cls: `peak-project-list-view__item ${this.activeConversation?.meta.id === conversation.meta.id ? 'is-active' : ''}`,
			attr: { 'data-conversation-id': conversation.meta.id }
		});
		const itemText = item.createSpan({ text: conversation.meta.title });
		item.addEventListener('click', async () => {
			this.setActiveConversation(conversation);
			await this.context.render();
			await this.context.notifySelectionChange();
		});

		// Add right-click context menu for conversation
		this.setupConversationContextMenu(item, conversation);
	}

	/**
	 * Update a single conversation item's title without re-rendering the entire list
	 */
	updateConversationTitle(conversation: ParsedConversationFile): void {
		if (!this.conversationListEl) return;
		
		// Update the conversation in the array
		const index = this.conversations.findIndex(c => c.meta.id === conversation.meta.id);
		const isNewConversation = index < 0;
		if (index >= 0) {
			this.conversations[index] = conversation;
		} else {
			// New conversation, add to array and sort
			this.conversations.push(conversation);
			this.conversations.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
		}
		
		// Find the item by conversation ID
		const item = this.conversationListEl.querySelector(
			`[data-conversation-id="${conversation.meta.id}"]`
		) as HTMLElement | null;
		
		if (item) {
			// Update the title text
			const titleSpan = item.querySelector('span');
			if (titleSpan) {
				titleSpan.textContent = conversation.meta.title;
			}
			
			// Update active state if needed
			const isActive = this.activeConversation?.meta.id === conversation.meta.id;
			item.classList.toggle('is-active', isActive);
		} else {
			// If item doesn't exist, it's a new conversation, need to render it
			// Check if we should show it (root-level conversation without projectId)
			if (!conversation.meta.projectId) {
				// Clear empty state if exists
				const emptyState = this.conversationListEl.querySelector('.peak-project-list-view__empty');
				if (emptyState) {
					emptyState.remove();
				}
				// Render the new conversation item at the top
				this.renderConversationItem(conversation);
			}
		}
	}

	/**
	 * Update active state highlighting for conversations list without full re-render
	 */
	updateActiveState(): void {
		if (!this.conversationListEl) return;

		// Get root-level conversations (without projectId)
		const conversationsWithoutProject = this.conversations.filter(c => !c.meta.projectId);

		// Update active state for all conversation items
		const items = this.conversationListEl.querySelectorAll('.peak-project-list-view__item');
		items.forEach((item, index) => {
			const itemEl = item as HTMLElement;
			// Remove active class from all items
			itemEl.classList.remove('is-active');
			
			// Add active class if this conversation matches the active one
			if (this.activeConversation && 
				index < conversationsWithoutProject.length &&
				conversationsWithoutProject[index].meta.id === this.activeConversation.meta.id) {
				itemEl.classList.add('is-active');
			}
		});
	}

	/**
	 * Notify ChatView to show all standalone conversations (not in any project)
	 */
	private async notifyChatViewShowAllConversations(): Promise<void> {
		console.log('[ConversationsSection] notifyChatViewShowAllConversations called');
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
			view.showAllConversations();
		});
	}

	/**
	 * Open create conversation modal
	 * Now only sets a pending state, actual creation happens on first message
	 */
	private openCreateConversationModal(): void {
		// Set pending conversation state instead of creating immediately
		// Actual creation will happen when user sends first message
		void (async () => {
			// Notify ChatView to set pending conversation state
			const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			chatViews.forEach(leaf => {
				const view = leaf.view as unknown as IChatView;
				view.setPendingConversation({
					title: 'New Conversation',
					project: null,
				});
			});
			// Switch to conversation view to show input area
			await this.context.notifySelectionChange();
		})();
	}

	/**
	 * Setup context menu for conversation item
	 */
	private setupConversationContextMenu(itemEl: HTMLElement, conversation: ParsedConversationFile): void {
		itemEl.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// Edit title option
			menu.addItem((item) => {
				item.setTitle('Edit title');
				item.setIcon('pencil');
				item.onClick(async () => {
					await this.editConversationTitle(conversation);
				});
			});

			// Open source file option
			menu.addItem((item) => {
				item.setTitle('Open source file');
				item.setIcon('file-text');
				item.onClick(async () => {
					await this.openSourceFile(conversation.file);
				});
			});

			// Show menu at cursor position
			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});
	}

	/**
	 * Edit conversation title
	 */
	private async editConversationTitle(conversation: ParsedConversationFile): Promise<void> {
		const modal = new InputModal(
			this.app,
			'Enter conversation title',
			async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) {
					return; // User cancelled or entered empty title
				}

				try {
					// ConversationsSection only handles root-level conversations (without projectId)
					// So we always pass null for project
					const updatedConversation = await this.manager.updateConversationTitle({
						conversation,
						project: null,
						title: newTitle.trim(),
					});

					// Update active conversation if it's the one being edited
					if (this.activeConversation?.meta.id === conversation.meta.id) {
						this.setActiveConversation(updatedConversation);
					}

					// Refresh data and render
					await this.hydrateConversations();
					await this.context.render();
					await this.context.notifySelectionChange();
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
			conversation.meta.title // Pass current title as initial value
		);

		modal.open();
	}

	/**
	 * Switch to document view and open the source file
	 */
	private async openSourceFile(file: TFile): Promise<void> {
		await openSourceFile(this.app, file);
	}
}

