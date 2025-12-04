import { App } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile, ChatMessage } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { createIcon } from 'src/core/IconHelper';
import { IChatView } from '../view-interfaces';
import { useProjectStore } from '../../store/projectStore';

export class ProjectOverviewView {
	private manager: AIServiceManager;
	private chatView: IChatView;
	private app: App;

	private projectId: string;
	private conversations: ParsedConversationFile[] = [];
	private activeTab: 'conversations' | 'starred' | 'resources' = 'conversations';
	private summaryExpanded = false;

	constructor(
		app: App,
		manager: AIServiceManager,
		chatView: IChatView
	) {
		this.app = app;
		this.manager = manager;
		this.chatView = chatView;
	}

	/**
	 * Show project overview with conversations
	 */
	async setProject(project: ParsedProjectFile): Promise<void> {
		this.projectId = project.meta.id;
		this.summaryExpanded = Boolean(this.getProjectSummaryText(project));
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
	 * Get current project from store (always latest data)
	 */
	private getProject(): ParsedProjectFile | null {
		const projects = useProjectStore.getState().projects;
		return this.projectId ? projects.get(this.projectId) || null : null;
	}

	/**
	 * Render complete view with header, body and footer
	 */
	async render(headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement): Promise<void> {
		const project = this.getProject();
		if (!project) return;

		this.renderHeader(headerEl, project);

		// Render body
		await this.renderBody(bodyEl, project);

		// Render footer (empty for this view)
		footerEl.empty();
	}

	/**
	 * Render header for this view
	 */
	private renderHeader(container: HTMLElement, project: ParsedProjectFile): void {
		container.empty();
		const headerContent = container.createDiv({ cls: 'peak-chat-view__header-content' });
		const titleEl = headerContent.createDiv({ cls: 'peak-chat-view__title' });

		const iconContainer = titleEl.createSpan({ cls: 'peak-chat-view__title-icon' });
		createIcon(iconContainer, 'folder', {
			size: 18,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		titleEl.createEl('h2', { text: project.meta.name });
	}

	/**
	 * Render project overview body
	 */
	private async renderBody(containerEl: HTMLElement, project: ParsedProjectFile): Promise<void> {
		containerEl.empty();
		containerEl.addClass('peak-chat-view__conversation-list-container');

		this.renderStats(containerEl);

		const summaryText = this.getProjectSummaryText(project);
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
			tabEl.addEventListener('click', async () => {
				this.activeTab = tab.id as 'conversations' | 'starred' | 'resources';
				const currentProject = this.getProject();
				if (currentProject) {
					await this.renderBody(containerEl, currentProject);
				}
			});
		});

		// Tab content area
		const tabContent = containerEl.createDiv({ cls: 'peak-chat-view__project-tab-content' });

		// Render content based on active tab
		switch (this.activeTab) {
			case 'conversations':
				this.renderConversationsTab(tabContent, project);
				break;
			case 'starred':
				await this.renderStarredTab(tabContent, project);
				break;
			case 'resources':
				this.renderResourcesTab(tabContent, project);
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
		toggleButton.addEventListener('click', async () => {
			this.summaryExpanded = !this.summaryExpanded;
			const currentProject = this.getProject();
			if (currentProject) {
				await this.renderBody(container, currentProject);
			}
		});
		const summaryContent = summarySection.createDiv({ cls: 'peak-chat-view__summary-content' });
		summaryContent.setText(summaryText);
	}

	private getProjectSummaryText(project: ParsedProjectFile): string | undefined {
		const candidate = project.shortSummary ?? project.context?.summary;
		const trimmed = candidate?.trim();
		return trimmed || undefined;
	}

	/**
	 * Render conversations tab
	 */
	private renderConversationsTab(container: HTMLElement, project: ParsedProjectFile): void {
		container.empty();

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
				const currentProject = this.getProject();
				if (currentProject) {
					this.chatView.showMessagesForOneConvsation(conversation, currentProject);
				}
			});
		}
	}

	/**
	 * Render starred messages tab
	 */
	private async renderStarredTab(container: HTMLElement, project: ParsedProjectFile): Promise<void> {
		container.empty();

		const entries = this.collectStarredEntries();
		const starredList = container.createDiv({ cls: 'peak-chat-view__starred-list' });

		if (entries.length === 0) {
			starredList.createDiv({
				cls: 'peak-chat-view__empty-text',
				text: 'No starred messages yet.'
			});
			return;
		}

		for (const entry of entries) {
			const starredItem = starredList.createDiv({ cls: 'peak-chat-view__starred-item' });
			starredItem.createDiv({
				cls: 'peak-chat-view__starred-conversation',
				text: entry.conversation.meta.title
			});
			const starredContent = starredItem.createDiv({ cls: 'peak-chat-view__starred-content' });
			const truncated = this.truncatePreview(entry.message.content, 150);
			starredContent.setText(truncated);
			starredItem.addEventListener('click', () => {
				const currentProject = this.getProject();
				if (currentProject) {
					this.chatView.showMessagesForOneConvsation(entry.conversation, currentProject);
				}
				requestAnimationFrame(() => {
					this.chatView.scrollToMessage(entry.message.id);
				});
			});
		}
	}

	private collectStarredEntries(): StarredEntry[] {
		return this.conversations
			.flatMap(conversation =>
				conversation.messages
					.filter(message => message.starred)
					.map(message => ({ conversation, message }))
			)
			.sort((a, b) => (b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0));
	}

	/**
	 * Render resources tab
	 */
	private renderResourcesTab(container: HTMLElement, project: ParsedProjectFile): void {
		container.empty();

		const resources = this.collectProjectResources();

		if (resources.length === 0) {
			container.createDiv({
				cls: 'peak-chat-view__empty-text',
				text: 'No resources attached yet.'
			});
			return;
		}

		const resourcesList = container.createDiv({
			cls: 'peak-chat-view__resources-list'
		});

		for (const entry of resources) {
			const item = resourcesList.createDiv({ cls: 'peak-chat-view__resource-item' });
			item.addEventListener('click', () => {
				this.openAttachment(entry.attachment);
			});

			item.createDiv({
				cls: 'peak-chat-view__resource-item-title',
				text: `${entry.conversation.meta.title} · ${entry.attachmentLabel}`
			});
		}
	}

	private collectProjectResources(): ResourceAttachmentEntry[] {
		const seen = new Set<string>();
		const entries: ResourceAttachmentEntry[] = [];

		for (const conversation of this.conversations) {
			for (const message of conversation.messages) {
				if (!message.attachments || message.attachments.length === 0) {
					continue;
				}
				for (const attachment of message.attachments) {
					const key = `${message.id}:${attachment}`;
					if (seen.has(key)) continue;
					seen.add(key);
					const label = attachment.split('/').pop() || attachment;
					entries.push({
						conversation,
						message,
						attachment,
						attachmentLabel: label
					});
				}
			}
		}

		return entries.sort(
			(a, b) =>
				(b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0)
		);
	}

	private truncatePreview(text: string, maxLength = 120): string {
		if (!text) return '';
		return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
	}

	private openAttachment(path: string): void {
		if (!path) return;
		const cleaned = path.replace(/^\[\[|\]\]$/g, '');
		const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
		void this.app.workspace.openLinkText(normalized, '', true);
	}
}

interface ResourceAttachmentEntry {
	conversation: ParsedConversationFile;
	message: ChatMessage;
	attachment: string;
	attachmentLabel: string;
}

interface StarredEntry {
	conversation: ParsedConversationFile;
	message: ChatMessage;
}

