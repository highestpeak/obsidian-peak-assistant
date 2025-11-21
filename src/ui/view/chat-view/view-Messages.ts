import { App, Menu, TFile } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile, ChatMessage, PendingConversation } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ScrollController } from './ScrollController';
import { createIcon } from 'src/core/IconHelper';
import { getFileTypeFromPath, getAttachmentStats } from '../shared/file-utils';
import { StatsRenderer } from './StatsRenderer';
import { ChatInputArea } from './ChatInputArea';
import { ModalManager } from './ModalManager';
import { openSourceFile } from '../shared/view-utils';
import { IMessageHistoryView } from '../view-interfaces';

/**
 * Component for rendering and managing the messages list view
 */
export class MessagesView {
	private containerEl?: HTMLElement;
	private activeConversation: ParsedConversationFile | null = null;
	private activeProject: ParsedProjectFile | null = null;
	private pendingConversation: PendingConversation | null = null;
	private statsRenderer: StatsRenderer;
	private modalManager: ModalManager;
	private chatInputArea?: ChatInputArea;
	private pendingScrollMessageId?: string;

	constructor(
		private app: App,
		private manager: AIServiceManager,
		private scrollController: ScrollController
	) {
		this.modalManager = new ModalManager(this.app);
		this.statsRenderer = new StatsRenderer(
			() => this.scrollController.scrollToTop(),
			() => this.scrollController.scrollToBottom(),
			() => this.modalManager.showResourcesModal(this.activeConversation),
			(summary: string) => this.modalManager.showSummaryModal(summary),
			async () => {
				if (this.activeConversation?.file) {
					await openSourceFile(this.app, this.activeConversation.file);
				}
			}
		);
	}

	/**
	 * Set active conversation
	 */
	setConversation(conversation: ParsedConversationFile | null, project?: ParsedProjectFile | null): void {
		this.activeConversation = conversation;
		this.activeProject = project ?? null;
		// Clear pending conversation when setting an actual conversation
		if (conversation) {
			this.pendingConversation = null;
		}
	}

	/**
	 * Set pending conversation state
	 */
	setPendingConversation(pending: PendingConversation | null): void {
		this.pendingConversation = pending;
		if (pending) {
			this.activeProject = pending.project;
			this.activeConversation = null;
		}
	}

	/**
	 * Render complete view with header, body and footer
	 */
	render(headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement): void {
		// Render header
		this.renderHeader(headerEl);

		// Render body
		this.renderBody(bodyEl);

		// Render footer
		this.renderInput(footerEl);
		this.focusInput();
	}

	/**
	 * Render messages list body
	 */
	private renderBody(container: HTMLElement): void {
		this.containerEl = container;
		
		container.empty();
		container.addClass('peak-chat-view__message-container');

		if (!this.activeConversation && !this.pendingConversation) {
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'Ready when you are.' 
			});
			return;
		}

		if (!this.activeConversation || this.activeConversation.messages.length === 0) {
			// Show empty state for pending or new conversation
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'Ready when you are.' 
			});
			return;
		}

		for (const message of this.activeConversation.messages) {
			this.renderMessage(container, message);
		}

		// Scroll to bottom after rendering messages (for initial load)
		if (this.activeConversation.messages.length > 0) {
			this.scrollController.scrollToBottom();
		}
		this.scrollController.setMessageContainer(container);
		this.applyPendingScroll();
	}

	/**
	 * Append new messages to the existing container
	 */
	private appendMessages(messages: ChatMessage[]): void {
		if (!this.containerEl) return;
		for (const message of messages) {
			this.renderMessage(this.containerEl, message);
		}
	}

	/**
	 * Render a single message with attachments
	 */
	private renderMessage(container: HTMLElement, message: ChatMessage): void {
		const messageWrapper = container.createDiv({ 
			cls: `peak-chat-view__message-wrapper peak-chat-view__message-wrapper--${message.role}`,
			attr: { 'data-message-id': message.id }
		});

		const messageEl = messageWrapper.createDiv({
			cls: 'peak-chat-view__message'
		});

		// Render attachments preview if any
		if (message.attachments && message.attachments.length > 0) {
			this.renderAttachments(messageEl, message.attachments);
		}

		const contentEl = messageEl.createDiv({ cls: 'peak-chat-view__message-content' });
		contentEl.setText(message.content);

		// Add right-click context menu
		this.setupMessageContextMenu(messageEl, message);

		// Action buttons (star, copy, regenerate)
		this.renderActionButtons(messageEl, message);
	}

	/**
	 * Render attachment previews
	 */
	private renderAttachments(messageEl: HTMLElement, attachments: string[]): void {
		const attachmentsEl = messageEl.createDiv({ cls: 'peak-chat-view__message-attachments' });
		const stats = getAttachmentStats(attachments);
		
		const statsText: string[] = [];
		if (stats.pdf > 0) statsText.push(`${stats.pdf} PDF${stats.pdf > 1 ? 's' : ''}`);
		if (stats.image > 0) statsText.push(`${stats.image} image${stats.image > 1 ? 's' : ''}`);
		if (stats.file > 0) statsText.push(`${stats.file} file${stats.file > 1 ? 's' : ''}`);
		
		if (statsText.length > 0) {
			const statsEl = attachmentsEl.createDiv({ cls: 'peak-chat-view__attachment-stats' });
			statsEl.textContent = statsText.join(', ');
		}
		
		// Show attachment previews
		const previewList = attachmentsEl.createDiv({ cls: 'peak-chat-view__attachment-preview-list' });
		for (const attachmentPath of attachments) {
			const type = getFileTypeFromPath(attachmentPath);
			const previewItem = previewList.createDiv({
				cls: `peak-chat-view__attachment-preview-item peak-chat-view__attachment-preview-item--${type}`
			});
			
			if (type === 'image') {
				// Try to load image preview
				const normalizedPath = attachmentPath.startsWith('/') ? attachmentPath.slice(1) : attachmentPath;
				const file = this.app.vault.getAbstractFileByPath(normalizedPath);
				if (file && file instanceof TFile) {
					const img = previewItem.createEl('img', {
						cls: 'peak-chat-view__attachment-preview-image',
						attr: { alt: file.name }
					});
					img.src = this.app.vault.getResourcePath(file);
					img.style.maxWidth = '150px';
					img.style.maxHeight = '150px';
					img.style.objectFit = 'contain';
					img.style.cursor = 'pointer';
					img.addEventListener('click', async () => {
						const leaf = this.app.workspace.getLeaf(false);
						await leaf.openFile(file);
					});
				}
			} else {
				const icon = previewItem.createDiv({ cls: 'peak-chat-view__attachment-preview-icon' });
				let iconName: string;
				if (type === 'pdf') {
					iconName = 'file-text';
				} else {
					iconName = 'file';
				}
				createIcon(icon, iconName as any, {
					size: 32,
					strokeWidth: 2,
					class: 'peak-icon'
				});
				
				const fileName = previewItem.createDiv({ cls: 'peak-chat-view__attachment-preview-name' });
				const name = attachmentPath.split('/').pop() || attachmentPath;
				fileName.textContent = name;
				fileName.title = attachmentPath;
				
				previewItem.style.cursor = 'pointer';
				previewItem.addEventListener('click', async () => {
					const normalizedPath = attachmentPath.startsWith('/') ? attachmentPath.slice(1) : attachmentPath;
					await this.app.workspace.openLinkText(attachmentPath, '', true);
				});
			}
		}
	}

	/**
	 * Setup context menu for message bubble
	 */
	private setupMessageContextMenu(messageEl: HTMLElement, message: ChatMessage): void {
		messageEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// Check if there's selected text
			const selection = window.getSelection();
			const selectedText = selection?.toString().trim();

			// Copy selected text if there's a selection
			if (selectedText && selectedText.length > 0) {
				menu.addItem((item) => {
					item.setTitle('Copy selection');
					item.setIcon('copy');
					item.onClick(async () => {
						try {
							await navigator.clipboard.writeText(selectedText);
						} catch (err) {
							console.error('Failed to copy selection:', err);
						}
					});
				});
				menu.addSeparator();
			}

			// Copy message content
			menu.addItem((item) => {
				item.setTitle('Copy message');
				item.setIcon('copy');
				item.onClick(async () => {
					try {
						await navigator.clipboard.writeText(message.content);
					} catch (err) {
						console.error('Failed to copy:', err);
					}
				});
			});

			// Toggle star
			menu.addItem((item) => {
				item.setTitle(message.starred ? 'Unstar message' : 'Star message');
				item.setIcon('lucide-star');
				item.onClick(async () => {
					await this.toggleStar(message.id, !message.starred);
				});
			});

			// Regenerate (only for assistant messages)
			if (message.role === 'assistant') {
				menu.addItem((item) => {
					item.setTitle('Regenerate response');
					item.setIcon('refresh-cw');
					item.onClick(async () => {
						await this.regenerateMessage(message.id);
					});
				});
			}

			// Show menu at cursor position
			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});
	}

	/**
	 * Render action buttons (star, copy, regenerate)
	 */
	private renderActionButtons(messageEl: HTMLElement, message: ChatMessage): void {
		const actionsEl = messageEl.createDiv({ cls: 'peak-chat-view__message-actions' });
		
		// Star button
		const starButton = actionsEl.createEl('button', { 
			cls: 'peak-chat-view__action-button',
			attr: { 
				'aria-label': message.starred ? 'Unstar message' : 'Star message',
				title: message.starred ? 'Unstar' : 'Star'
			}
		});
		starButton.innerHTML = message.starred ? '★' : '☆';
		starButton.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.toggleStar(message.id, !message.starred);
		});
		
		// Copy button
		const copyButton = actionsEl.createEl('button', { 
			cls: 'peak-chat-view__action-button',
			attr: { 
				'aria-label': 'Copy message',
				title: 'Copy'
			}
		});
		createIcon(copyButton, 'copy', {
			size: 14,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		copyButton.addEventListener('click', async (e) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(message.content);
				// Replace icon with checkmark
				const currentIcon = copyButton.querySelector('.peak-icon');
				if (currentIcon) {
					currentIcon.remove();
				}
				const checkIcon = createIcon(copyButton, 'check', {
					size: 14,
					strokeWidth: 3,
					class: 'peak-icon',
					color: 'var(--interactive-accent)'
				});
				// Restore copy icon after 2 seconds
				setTimeout(() => {
					if (checkIcon && checkIcon.parentElement === copyButton) {
						checkIcon.remove();
						createIcon(copyButton, 'copy', {
							size: 14,
							strokeWidth: 2,
							class: 'peak-icon'
						});
					}
				}, 2000);
			} catch (err) {
				console.error('Failed to copy:', err);
			}
		});
		
		// Regenerate button (only for assistant messages)
		if (message.role === 'assistant') {
			const regenerateButton = actionsEl.createEl('button', { 
				cls: 'peak-chat-view__action-button',
				attr: { 
					'aria-label': 'Regenerate response',
					title: 'Regenerate'
				}
			});
			createIcon(regenerateButton, 'refresh-cw', {
				size: 14,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			regenerateButton.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.regenerateMessage(message.id);
			});
		}
	}

	/**
	 * Toggle star status of a message
	 */
	private async toggleStar(messageId: string, starred: boolean): Promise<void> {
		if (!this.activeConversation) return;
		const oldMessageIds = new Set(this.activeConversation.messages.map(m => m.id));
		const updated = await this.manager.toggleStar({
			messageId,
			conversation: this.activeConversation,
			project: this.activeProject,
			starred,
		});
		this.activeConversation = updated;
		// Update self and notify MessageHistoryView
		this.updateConversation(updated, oldMessageIds);
		this.notifyMessageHistoryView();
	}

	/**
	 * Regenerate a message
	 */
	private async regenerateMessage(messageId: string): Promise<void> {
		if (!this.activeConversation) return;
		
		// Find the message and the user message that preceded it
		const messageIndex = this.activeConversation.messages.findIndex(m => m.id === messageId);
		if (messageIndex === -1 || messageIndex === 0) return;
		
		const assistantMessage = this.activeConversation.messages[messageIndex];
		if (assistantMessage.role !== 'assistant') return;
		
		// Find the preceding user message
		let userMessageIndex = -1;
		for (let i = messageIndex - 1; i >= 0; i--) {
			if (this.activeConversation.messages[i].role === 'user') {
				userMessageIndex = i;
				break;
			}
		}
		
		if (userMessageIndex === -1) return;
		
		const userMessage = this.activeConversation.messages[userMessageIndex];
		const oldMessageIds = new Set(this.activeConversation.messages.map(m => m.id));
		
		// Remove the assistant message and all subsequent messages
		this.activeConversation.messages = this.activeConversation.messages.slice(0, messageIndex);
		
		// Regenerate the response
		try {
			const result = await this.manager.blockChat({
				conversation: this.activeConversation,
				project: this.activeProject,
				userContent: userMessage.content,
			});
			this.activeConversation = result.conversation;
			// Update self and notify MessageHistoryView
			this.updateConversation(result.conversation, oldMessageIds);
			this.notifyMessageHistoryView();
			this.scrollController.scrollToBottom();
		} catch (error) {
			console.error('Failed to regenerate message:', error);
		}
	}

	/**
	 * Render header for this view
	 */
	private renderHeader(container: HTMLElement): void {
		container.empty();
		const headerContent = container.createDiv({ cls: 'peak-chat-view__header-content' });
		const titleEl = headerContent.createDiv({ cls: 'peak-chat-view__title' });

		if (this.activeConversation && this.activeProject) {
			// Project icon and name
			const iconContainer = titleEl.createSpan({ cls: 'peak-chat-view__title-icon' });
			createIcon(iconContainer, 'folder', {
				size: 18,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			titleEl.createSpan({
				cls: 'peak-chat-view__title-text',
				text: this.activeProject.meta.name
			});
			// Separator
			titleEl.createSpan({
				cls: 'peak-chat-view__title-separator',
				text: ' / '
			});
			// Conversation name
			titleEl.createSpan({
				cls: 'peak-chat-view__title-text',
				text: this.activeConversation.meta.title
			});

			// Add statistics, scroll buttons and summary button on the right
			this.statsRenderer.render(headerContent, this.activeConversation);
		} else if (this.activeConversation) {
			titleEl.createEl('h2', { text: this.activeConversation.meta.title });
			// Add statistics, scroll buttons and summary button on the right
			this.statsRenderer.render(headerContent, this.activeConversation);
		}
	}

	/**
	 * Render input area for this view
	 */
	private renderInput(container: HTMLElement): void {
		if (!this.chatInputArea) {
			this.chatInputArea = new ChatInputArea(
				container,
				this.app,
				this.manager,
				this.activeConversation,
				this.activeProject,
				this.pendingConversation,
				(conversation, oldMessageIds) => {
					this.activeConversation = conversation;
					this.pendingConversation = null; // Clear pending state after creation
					// Update self and notify MessageHistoryView
					this.updateConversation(conversation, oldMessageIds);
					this.notifyMessageHistoryView();
					// Scroll to bottom after conversation update
					this.scrollController.scrollToBottom();
				}
			);
		} else {
			// Update container reference (container is recreated on each render)
			this.chatInputArea.updateContainer(container);
			// Update state when conversation or project changes
			this.chatInputArea.updateState(this.activeConversation, this.activeProject, this.pendingConversation);
		}
		this.chatInputArea.render(this.activeConversation);
	}

	requestScrollToMessage(messageId: string): void {
		if (!messageId) return;
		this.pendingScrollMessageId = messageId;
		this.applyPendingScroll();
	}

	/**
	 * Update conversation with incremental rendering optimization
	 */
	private updateConversation(conversation: ParsedConversationFile, oldMessageIds: Set<string>): void {
		this.activeConversation = conversation;
		this.pendingConversation = null; // Clear pending state when conversation is set

		// If container exists and has messages, try incremental update
		if (this.containerEl && this.activeConversation) {
			const newMessages = conversation.messages.filter(m => !oldMessageIds.has(m.id));
			if (newMessages.length > 0) {
				// Append only new messages for better performance
				this.appendMessages(newMessages);
				// Scroll to bottom after appending new messages
				this.scrollController.scrollToBottom();
				return;
			}
			// If no new messages but conversation exists, re-render to show conversation header
			// This handles the case when conversation is just created (no messages yet)
			if (conversation.messages.length === 0 && oldMessageIds.size === 0) {
				// Force re-render to show conversation header
				if (this.containerEl) {
					this.renderBody(this.containerEl);
				}
			}
		}

		// Otherwise, need full re-render - but this should be handled by ChatView
		// when it detects conversation changes, not by MessagesView itself
	}

	/**
	 * Focus the input textarea
	 */
	focusInput(): void {
		this.chatInputArea?.focus();
	}

	private applyPendingScroll(): void {
		if (!this.pendingScrollMessageId) return;
		requestAnimationFrame(() => {
			this.scrollController.scrollToMessage(this.pendingScrollMessageId!);
			this.pendingScrollMessageId = undefined;
		});
	}

	/**
	 * Get input area for keyboard shortcut handling
	 */
	getInputArea() {
		return this.chatInputArea?.getInputArea();
	}

	/**
	 * Notify MessageHistoryView about conversation update
	 */
	private notifyMessageHistoryView(): void {
		this.app.workspace.getLeavesOfType('peak-message-history-view').forEach(leaf => {
			const view = leaf.view as unknown as IMessageHistoryView;
			view.setActiveConversation(this.activeConversation);
		});
	}
}
