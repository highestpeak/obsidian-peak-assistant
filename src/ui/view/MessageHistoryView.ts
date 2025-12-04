import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile } from 'src/service/chat/types';
import { IMessageHistoryView, IChatView } from './view-interfaces';
import { EventBus, ViewEventType, SelectionChangedEvent } from 'src/core/eventBus';

export const MESSAGE_HISTORY_VIEW_TYPE = 'peak-message-history-view';

/**
 * Right sidebar view displaying conversation message history for quick navigation
 */
export class MessageHistoryView extends ItemView implements IMessageHistoryView {
	private activeConversation: ParsedConversationFile | null = null;
	private messageListEl?: HTMLElement;
	private eventBus: EventBus;
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
		this.eventBus = EventBus.getInstance(this.app);
	}

	getViewType(): string {
		return MESSAGE_HISTORY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Message History';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-message-history-view');
		this.render();
		// Check if chat view exists, if not, hide this view
		this.checkChatViewAndUpdateVisibility();
		// Listen for workspace changes to update visibility
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkChatViewAndUpdateVisibility();
			})
		);

		// Subscribe to selection changed events
		this.unsubscribeHandlers.push(
			this.eventBus.on<SelectionChangedEvent>(ViewEventType.SELECTION_CHANGED, async (event) => {
				if (event.conversationId) {
					// Load conversation from ID
					let project = null;
					if (event.projectId) {
						const projects = await this.manager.listProjects();
						project = projects.find(p => p.meta.id === event.projectId) ?? null;
					}
					const conversations = await this.manager.listConversations(project?.meta);
					const conversation = conversations.find(c => c.meta.id === event.conversationId);
					this.setActiveConversation(conversation ?? null);
				} else {
					this.setActiveConversation(null);
				}
			})
		);
	}

	private checkChatViewAndUpdateVisibility(): void {
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		const hasChatView = chatViews.length > 0;
		
		// Hide the view if no chat view exists
		if (!hasChatView) {
			this.containerEl.style.display = 'none';
		} else {
			this.containerEl.style.display = '';
		}
	}

	async onClose(): Promise<void> {
		// Unsubscribe from events
		this.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
		this.unsubscribeHandlers = [];

		this.containerEl.empty();
	}

	/**
	 * Set active conversation and refresh the view
	 */
	setActiveConversation(conversation: ParsedConversationFile | null): void {
		this.activeConversation = conversation;
		this.render();
	}

	private render(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (!this.activeConversation) {
			containerEl.createDiv({ 
				cls: 'peak-message-history-view__empty',
				text: 'No conversation selected'
			});
			return;
		}

		const header = containerEl.createDiv({ cls: 'peak-message-history-view__header' });
		header.createEl('h3', { text: this.activeConversation.meta.title });

		this.messageListEl = containerEl.createDiv({ cls: 'peak-message-history-view__list' });
		this.renderMessages();
	}

	private renderMessages(): void {
		if (!this.messageListEl || !this.activeConversation) return;
		this.messageListEl.empty();

		if (this.activeConversation.messages.length === 0) {
			this.messageListEl.createDiv({ 
				cls: 'peak-message-history-view__empty',
				text: 'No messages yet'
			});
			return;
		}

		for (const message of this.activeConversation.messages) {
			const item = this.messageListEl.createDiv({ 
				cls: 'peak-message-history-view__item'
			});

			// Message header with role and star indicator
			const header = item.createDiv({ cls: 'peak-message-history-view__item-header' });
			header.createSpan({ 
				cls: 'peak-message-history-view__item-role',
				text: message.role.toUpperCase()
			});
			if (message.starred) {
				header.createSpan({ 
					cls: 'peak-message-history-view__item-star',
					text: '★'
				});
			}

			// Message preview (truncated)
			const preview = item.createDiv({ cls: 'peak-message-history-view__item-preview' });
			const truncated = message.content.length > 100 
				? message.content.substring(0, 100) + '...'
				: message.content;
			preview.setText(truncated);

			// Click to scroll to message in chat view
			item.addEventListener('click', () => {
				this.scrollToMessage(message.id);
			});
		}
	}

	private scrollToMessage(messageId: string): void {
		// Notify chat view to scroll to specific message
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
				view.scrollToMessage(messageId);
		});
	}
}

