import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { createIcon } from 'src/core/IconHelper';
import { IChatView } from '../view-interfaces';

export class ProjectOverviewView {
	private manager: AIServiceManager;
	private chatView: IChatView;

	private project: ParsedProjectFile;
	private conversations: ParsedConversationFile[] = [];
	private activeTab: 'conversations' | 'starred' | 'resources' = 'conversations';
	private summaryExpanded = false;

	constructor(
		manager: AIServiceManager,
		chatView: IChatView
	) {
		this.manager = manager;
		this.chatView = chatView;
	}

	/**
	 * Show project overview with conversations
	 */
	async setProject(project: ParsedProjectFile): Promise<void> {
		this.project = project;
		this.summaryExpanded = Boolean(this.getProjectSummaryText());
		// Load conversations for this project
		this.conversations = await this.manager.listConversations(project.meta);
		// Sort conversations by createdAtTimestamp descending (newest first)
		this.conversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
	}

	/**
	 * Render complete view with header, body and footer
	 */
	async render(headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement): Promise<void> {
		if (!this.project) return;

		this.renderHeader(headerEl);

		// Render body
		await this.renderBody(bodyEl);

		// Render footer (empty for this view)
		footerEl.empty();
	}

	/**
	 * Render header for this view
	 */
	private renderHeader(container: HTMLElement): void {
		container.empty();
		const headerContent = container.createDiv({ cls: 'peak-chat-view__header-content' });
		const titleEl = headerContent.createDiv({ cls: 'peak-chat-view__title' });

		const iconContainer = titleEl.createSpan({ cls: 'peak-chat-view__title-icon' });
		createIcon(iconContainer, 'folder', {
			size: 18,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		titleEl.createEl('h2', { text: this.project.meta.name });
	}

	/**
	 * Render project overview body
	 */
	private async renderBody(containerEl: HTMLElement): Promise<void> {
		containerEl.empty();
		containerEl.addClass('peak-chat-view__conversation-list-container');

		if (!this.project) return;

		this.renderStats(containerEl);

		const summaryText = this.getProjectSummaryText();
		if (summaryText) {
			this.renderProjectSummary(containerEl, summaryText);
		}

		// Tab navigation
		const tabContainer = containerEl.createDiv({ cls: 'peak-chat-view__project-tabs' });
		const tabs = [
			{ id: 'conversations', label: 'Conversations' },
			{ id: 'starred', label: 'Starred Messages' },
			{ id: 'resources', label: 'Resources' },
		];

		tabs.forEach(tab => {
			const tabEl = tabContainer.createDiv({
				cls: `peak-chat-view__project-tab-item ${this.activeTab === tab.id ? 'is-active' : ''}`,
				text: tab.label
			});
			tabEl.addEventListener('click', () => {
				this.activeTab = tab.id as 'conversations' | 'starred' | 'resources';
				void this.renderBody(containerEl);
			});
		});

		// Tab content area
		const tabContent = containerEl.createDiv({ cls: 'peak-chat-view__project-tab-content' });

		// Render content based on active tab
		switch (this.activeTab) {
			case 'conversations':
				this.renderConversationsTab(tabContent);
				break;
			case 'starred':
				await this.renderStarredTab(tabContent);
				break;
			case 'resources':
				this.renderResourcesTab(tabContent);
				break;
		}
	}

	private renderStats(container: HTMLElement): void {
		const statsSection = container.createDiv({ cls: 'peak-chat-view__project-stats' });
		const statsRow = statsSection.createDiv({ cls: 'peak-chat-view__stats-row' });
		const totalConversations = this.conversations.length;
		const totalMessages = this.conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

		const stats = [
			{ label: 'Conversations', value: totalConversations },
			{ label: 'Messages', value: totalMessages },
		];

		for (const stat of stats) {
			const statCard = statsRow.createDiv({ cls: 'peak-chat-view__stat-card' });
			statCard.createDiv({
				cls: 'peak-chat-view__stat-card-label',
				text: stat.label,
			});
			statCard.createDiv({
				cls: 'peak-chat-view__stat-card-value',
				text: stat.value.toString(),
			});
		}
	}

	private renderProjectSummary(container: HTMLElement, summaryText: string): void {
		const summarySection = container.createDiv({
			cls: `peak-chat-view__project-summary ${this.summaryExpanded ? 'is-expanded' : 'is-collapsed'}`,
		});
		const header = summarySection.createDiv({ cls: 'peak-chat-view__project-summary-header' });
		header.createEl('h3', { text: 'Project Summary' });
		const toggleButton = header.createEl('button', {
			cls: 'peak-chat-view__project-summary-toggle',
			text: this.summaryExpanded ? 'Hide summary' : 'Show summary',
			type: 'button',
		});
		toggleButton.addEventListener('click', () => {
			this.summaryExpanded = !this.summaryExpanded;
			void this.renderBody(container);
		});
		const summaryContent = summarySection.createDiv({ cls: 'peak-chat-view__summary-content' });
		summaryContent.setText(summaryText);
	}

	private getProjectSummaryText(): string | undefined {
		if (!this.project) return undefined;
		const candidate = this.project.shortSummary ?? this.project.context?.summary;
		const trimmed = candidate?.trim();
		return trimmed || undefined;
	}

	/**
	 * Render conversations tab
	 */
	private renderConversationsTab(container: HTMLElement): void {
		container.empty();

		if (!this.project) return;

		const listContainer = container.createDiv({ cls: 'peak-chat-view__conversation-list' });

		if (this.conversations.length === 0) {
			const emptyState = listContainer.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', {
				cls: 'peak-chat-view__empty-text',
				text: 'No conversations yet.'
			});
			return;
		}

		// Sort conversations by createdAtTimestamp (newest first)
		const sortedConversations = [...this.conversations].sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		for (const conversation of sortedConversations) {
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
	}

	/**
	 * Render starred messages tab
	 */
	private async renderStarredTab(container: HTMLElement): Promise<void> {
		container.empty();

		if (!this.project) return;

		const starredList = container.createDiv({ cls: 'peak-chat-view__starred-list' });

		// Load starred messages for this project
		const allStarred = await this.manager.loadStarred();
		const projectStarred = allStarred.filter(
			s => s.projectId === this.project!.meta.id && s.active
		);

		if (projectStarred.length === 0) {
			starredList.createDiv({
				cls: 'peak-chat-view__empty-text',
				text: 'No starred messages yet.'
			});
		} else {
			// Find starred messages in conversations
			for (const starred of projectStarred) {
				const conversation = this.conversations.find(c => c.meta.id === starred.conversationId);
				if (conversation) {
					const message = conversation.messages.find(m => m.id === starred.sourceMessageId);
					if (message) {
						const starredItem = starredList.createDiv({ cls: 'peak-chat-view__starred-item' });
						starredItem.createDiv({
							cls: 'peak-chat-view__starred-conversation',
							text: conversation.meta.title
						});
						const starredContent = starredItem.createDiv({ cls: 'peak-chat-view__starred-content' });
						const truncated = message.content.length > 150
							? message.content.substring(0, 150) + '...'
							: message.content;
						starredContent.setText(truncated);
						starredItem.addEventListener('click', () => {
							this.chatView.showMessagesForOneConvsation(conversation);
							this.chatView.scrollToMessage(message.id);
						});
					}
				}
			}
		}
	}

	/**
	 * Render resources tab
	 */
	private renderResourcesTab(container: HTMLElement): void {
		container.empty();

		const resourcesList = container.createDiv({ cls: 'peak-chat-view__resources-list' });
		resourcesList.createDiv({
			cls: 'peak-chat-view__empty-text',
			text: 'No resources attached yet.'
		});
	}
}

