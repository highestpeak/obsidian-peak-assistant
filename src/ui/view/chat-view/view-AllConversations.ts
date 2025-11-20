import { ParsedConversationFile } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { IChatView } from '../view-interfaces';

const CONVERSATIONS_PAGE_SIZE = 20;

export class AllConversationsView {
	// dependencies
	private aiServiceManager: AIServiceManager;
	private chatView: IChatView;
	// state
	private conversations: ParsedConversationFile[] = [];
	private conversationsPage: number = 0;
	private scrollObserver?: IntersectionObserver;

	constructor(
		aiServiceManager: AIServiceManager,
		chatView: IChatView
	) {
		this.aiServiceManager = aiServiceManager;
		this.chatView = chatView;
	}

	/**
	 * Render complete view with header, body and footer
	 */
	async render(headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement): Promise<void> {
		// Render header
		headerEl.empty();
		const headerContent = headerEl.createDiv({ cls: 'peak-chat-view__header-content' });
		const titleEl = headerContent.createDiv({ cls: 'peak-chat-view__title' });
		titleEl.createEl('h2', { text: 'All Conversations' });

		// Load conversations and render body
		this.conversations = [];
		this.conversationsPage = 0;
		await this.loadFirstPage();
		await this.renderBody(bodyEl);

		// Render footer (empty for this view)
		footerEl.empty();
	}

	/**
	 * Load first page of conversations
	 */
	private async loadFirstPage(): Promise<void> {
		// Get all standalone conversations (not in any project)
		const allConversations = await this.aiServiceManager.listConversations();

		// Sort by createdAtTimestamp descending (newest first)
		allConversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		const startIndex = this.conversationsPage * CONVERSATIONS_PAGE_SIZE;
		const endIndex = startIndex + CONVERSATIONS_PAGE_SIZE;
		const newConversations = allConversations.slice(startIndex, endIndex);

		if (newConversations.length > 0) {
			this.conversations = [...this.conversations, ...newConversations];
			this.conversationsPage++;
		}
	}

	/**
	 * Render all conversations with infinite scroll
	 */
	private async renderBody(containerEl: HTMLElement): Promise<void> {
		containerEl.empty();
		containerEl.addClass('peak-chat-view__all-conversations-container');

		const listContainer = containerEl.createDiv({ cls: 'peak-chat-view__all-conversations-list' });

		if (this.conversations.length === 0) {
			const emptyState = containerEl.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', {
				cls: 'peak-chat-view__empty-text',
				text: 'No conversations yet.'
			});
			return;
		}

		// Render conversations (already sorted by newest first)
		for (const conversation of this.conversations) {
			const item = listContainer.createDiv({
				cls: 'peak-chat-view__conversation-item'
			});

			// Content wrapper (left side)
			const contentWrapper = item.createDiv({ cls: 'peak-chat-view__conversation-content' });

			// Title (first line, darker)
			const title = contentWrapper.createDiv({ cls: 'peak-chat-view__conversation-title' });
			title.setText(conversation.meta.title);

			// Preview (second line, lighter)
			if (conversation.messages.length > 0) {
				const preview = contentWrapper.createDiv({ cls: 'peak-chat-view__conversation-preview' });
				const firstMessage = conversation.messages[0];
				const previewText = firstMessage.content.substring(0, 100);
				preview.setText(previewText + (firstMessage.content.length > 100 ? '...' : ''));
			}

			// Date (right side)
			if (conversation.meta.createdAtTimestamp) {
				const date = item.createDiv({ cls: 'peak-chat-view__conversation-date' });
				const dateObj = new Date(conversation.meta.createdAtTimestamp);
				const now = new Date();
				const diffTime = now.getTime() - dateObj.getTime();
				const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

				let dateText: string;
				if (diffDays === 0) {
					dateText = 'Today';
				} else if (diffDays === 1) {
					dateText = 'Yesterday';
				} else if (diffDays < 7) {
					dateText = `${diffDays} days ago`;
				} else {
					const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					dateText = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
				}
				date.setText(dateText);
			}

			// Click to open conversation
			item.addEventListener('click', () => {
				this.chatView.showMessagesForOneConvsation(conversation);
			});
		}

		// Setup infinite scroll
		if (this.scrollObserver) {
			this.scrollObserver.disconnect();
			this.scrollObserver = undefined;
		}

		const allConversations = await this.aiServiceManager.listConversations();
		const hasMore = this.conversations.length < allConversations.length;

		if (hasMore) {
			const sentinel = containerEl.createDiv({ cls: 'peak-chat-view__scroll-sentinel' });
			this.scrollObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						this.scrollObserver?.disconnect();
						this.scrollObserver = undefined;
						void this.loadMore(containerEl);
					}
				});
			}, { threshold: 0.1 });
			this.scrollObserver.observe(sentinel);
		}
	}

	/**
	 * Load more conversations (for infinite scroll)
	 */
	async loadMore(containerEl: HTMLElement): Promise<void> {
		// Get all standalone conversations (not in any project)
		const allConversations = await this.aiServiceManager.listConversations();

		// Sort by createdAtTimestamp descending (newest first)
		allConversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		const startIndex = this.conversationsPage * CONVERSATIONS_PAGE_SIZE;
		const endIndex = startIndex + CONVERSATIONS_PAGE_SIZE;
		const newConversations = allConversations.slice(startIndex, endIndex);

		if (newConversations.length > 0) {
			this.conversations = [...this.conversations, ...newConversations];
			this.conversationsPage++;
			await this.renderBody(containerEl);
		}
	}

	/**
	 * Destroy the view and clean up observers
	 */
	destroy(): void {
		if (this.scrollObserver) {
			this.scrollObserver.disconnect();
			this.scrollObserver = undefined;
		}
	}
}

