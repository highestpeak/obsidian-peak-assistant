import { ButtonComponent, IconName, ItemView, Setting, TextAreaComponent, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { createIcon } from 'src/core/IconHelper';

export const CHAT_VIEW_TYPE = 'peak-chat-view';

export class ChatView extends ItemView {
	private projects: ParsedProjectFile[] = [];
	private conversations: ParsedConversationFile[] = [];
	private activeProject: ParsedProjectFile | null = null;
	private activeConversation: ParsedConversationFile | null = null;
	private showingConversationList: boolean = false;
	private conversationListProject: ParsedProjectFile | null = null;
	private activeProjectTab: 'conversations' | 'starred' | 'resources' = 'conversations';
	private showingAllProjects: boolean = false;
	private allProjects: ParsedProjectFile[] = [];
	private showingAllConversations: boolean = false;
	private allConversationsProject: ParsedProjectFile | null = null;
	private allConversations: ParsedConversationFile[] = [];
	private projectsPage: number = 0;
	private conversationsPage: number = 0;
	private readonly PROJECTS_PAGE_SIZE = 12;
	private readonly CONVERSATIONS_PAGE_SIZE = 20;

	private messageContainer?: HTMLElement;
	private bodyEl?: HTMLElement;
	private inputArea?: TextAreaComponent;
	private sendButton?: ButtonComponent;

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
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

		await this.hydrateData();
		this.render();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	private async hydrateData(): Promise<void> {
		const settings = this.manager.getSettings();
		this.projects = await this.manager.listProjects();

		if (settings.rootMode === 'project-first' && this.projects.length > 0) {
			if (!this.activeProject) {
				this.activeProject = this.projects[0];
			}
			this.conversations = await this.manager.listConversations(this.activeProject.meta);
		} else {
			this.activeProject = null;
			this.conversations = await this.manager.listConversations();
		}
		this.activeConversation = this.conversations[0] ?? null;
	}

	private render(): void {
		const { containerEl } = this;
		containerEl.empty();

		const headerEl = containerEl.createDiv({ cls: 'peak-chat-view__header' });
		this.renderHeader(headerEl);

		const bodyEl = containerEl.createDiv({ cls: 'peak-chat-view__body' });
		this.bodyEl = bodyEl;
		// Add a scrollable wrapper inside body to move scrollbar to the edge
		const scrollWrapper = bodyEl.createDiv({ cls: 'peak-chat-view__scroll-wrapper' });
		
		if (this.showingAllProjects) {
			void this.renderAllProjects(scrollWrapper);
		} else if (this.showingAllConversations && this.allConversationsProject) {
			void this.renderAllConversations(scrollWrapper);
		} else if (this.showingConversationList && this.conversationListProject) {
			void this.renderConversationList(scrollWrapper);
		} else {
			this.renderMessages(scrollWrapper);
		}

		const footerEl = containerEl.createDiv({ cls: 'peak-chat-view__footer' });
		this.renderInput(footerEl);
	}

	private renderHeader(container: HTMLElement): void {
		container.empty();
		
		const headerContent = container.createDiv({ cls: 'peak-chat-view__header-content' });
		const titleEl = headerContent.createDiv({ cls: 'peak-chat-view__title' });
		
		// Case 1: All projects view
		if (this.showingAllProjects) {
			titleEl.createEl('h2', { text: 'All Projects' });
		}
		// Case 2: All conversations view
		else if (this.showingAllConversations && this.allConversationsProject) {
			const iconContainer = titleEl.createSpan({ cls: 'peak-chat-view__title-icon' });
			createIcon(iconContainer, 'folder', {
				size: 18,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			titleEl.createEl('h2', { text: `${this.allConversationsProject.meta.name} - All Conversations` });
		}
		// Case 3: Project overview (showing conversation list)
		else if (this.showingConversationList && this.conversationListProject) {
			const iconContainer = titleEl.createSpan({ cls: 'peak-chat-view__title-icon' });
			createIcon(iconContainer, 'folder', {
				size: 18,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			titleEl.createEl('h2', { text: this.conversationListProject.meta.name });
		}
		// Case 4: Conversation within a project
		else if (this.activeConversation && this.activeProject) {
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
			this.renderConversationStats(headerContent);
		}
		// Case 5: Standalone conversation (no project)
		else if (this.activeConversation) {
			titleEl.createEl('h2', { text: this.activeConversation.meta.title });
			
			// Add statistics, scroll buttons and summary button on the right
			this.renderConversationStats(headerContent);
		}
	}
	
	private renderConversationStats(container: HTMLElement): void {
		if (!this.activeConversation) return;
		
		const statsContainer = container.createDiv({ cls: 'peak-chat-view__header-stats' });
		
		// Message count
		const messageCount = this.activeConversation.messages.length;
		const messageStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		messageStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Messages' });
		messageStat.createSpan({ cls: 'peak-chat-view__stat-value', text: messageCount.toString() });
		
		// Token usage
		const tokenUsage = this.activeConversation.meta.tokenUsageTotal || 0;
		const tokenStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		tokenStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Tokens' });
		tokenStat.createSpan({ cls: 'peak-chat-view__stat-value', text: this.formatTokenCount(tokenUsage) });
		
		// Session duration (calculate from created/updated timestamps)
		const durationStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		durationStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Duration' });
		const durationText = this.formatDuration(this.activeConversation.meta.createdAtTimestamp, this.activeConversation.meta.updatedAtTimestamp);
		durationStat.createSpan({ cls: 'peak-chat-view__stat-value', text: durationText });
		
		// Scroll buttons
		const scrollButtons = statsContainer.createDiv({ cls: 'peak-chat-view__header-scroll-buttons' });
		
		// Scroll to top button
		const scrollTopBtn = scrollButtons.createEl('button', {
			cls: 'peak-chat-view__scroll-button',
			attr: {
				title: 'Scroll to top',
				'aria-label': 'Scroll to top'
			}
		});
		createIcon(scrollTopBtn, 'arrow-up', {
			size: 16,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		scrollTopBtn.addEventListener('click', () => {
			this.scrollToTop();
		});
		
		// Scroll to bottom button
		const scrollBottomBtn = scrollButtons.createEl('button', {
			cls: 'peak-chat-view__scroll-button',
			attr: {
				title: 'Scroll to latest',
				'aria-label': 'Scroll to latest'
			}
		});
		createIcon(scrollBottomBtn, 'arrow-down', {
			size: 16,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		scrollBottomBtn.addEventListener('click', () => {
			this.scrollToBottom();
		});
		
		// Summary button (if summary exists)
		if (this.activeConversation.context?.summary) {
			const summaryButton = statsContainer.createEl('button', { 
				cls: 'peak-chat-view__summary-button',
				attr: { 
					title: 'View conversation summary',
					'aria-label': 'View conversation summary'
				}
			});
			createIcon(summaryButton, 'file-text', {
				size: 16,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			summaryButton.addEventListener('click', () => {
				this.showSummaryModal(this.activeConversation!.context!.summary);
			});
		}
	}
	
	private formatTokenCount(count: number): string {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		} else if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}
	
	private formatDuration(startTimestamp: number, endTimestamp: number): string {
		const durationMs = endTimestamp - startTimestamp;
		const seconds = Math.floor(durationMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		
		if (days > 0) {
			return `${days}d ${hours % 24}h`;
		} else if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m`;
		}
		return `${seconds}s`;
	}
	
	private showSummaryModal(summary: string): void {
		// Create a simple modal to display the summary
		const modal = document.createElement('div');
		modal.className = 'peak-summary-modal';
		
		const overlay = document.createElement('div');
		overlay.className = 'peak-summary-modal-overlay';
		
		const content = document.createElement('div');
		content.className = 'peak-summary-modal-content';
		
		const header = document.createElement('div');
		header.className = 'peak-summary-modal-header';
		const title = document.createElement('h3');
		title.textContent = 'Conversation Summary';
		const closeBtn = document.createElement('button');
		closeBtn.className = 'peak-summary-modal-close';
		closeBtn.textContent = '×';
		header.appendChild(title);
		header.appendChild(closeBtn);
		
		const body = document.createElement('div');
		body.className = 'peak-summary-modal-body';
		const summaryText = document.createElement('p');
		summaryText.textContent = summary;
		summaryText.style.whiteSpace = 'pre-wrap';
		body.appendChild(summaryText);
		
		content.appendChild(header);
		content.appendChild(body);
		modal.appendChild(overlay);
		modal.appendChild(content);
		
		const closeModal = () => {
			modal.remove();
			// Remove keyboard event listeners
			window.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keydown', handleKeyDown, true);
			modal.removeEventListener('keydown', handleKeyDown, true);
		};
		
		// Handle ESC key press - use capture phase to intercept early
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle if modal is still in DOM
			if (e.key === 'Escape' && document.body.contains(modal)) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				closeModal();
				return false;
			}
		};
		
		// Add keyboard event listener with capture phase (true) on window, document and modal
		// This ensures we intercept the event before other handlers, especially Obsidian's handlers
		window.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('keydown', handleKeyDown, true);
		modal.addEventListener('keydown', handleKeyDown, true);
		
		overlay.addEventListener('click', closeModal);
		closeBtn.addEventListener('click', closeModal);
		
		document.body.appendChild(modal);
		
		// Focus the modal content to ensure keyboard events are captured
		content.setAttribute('tabindex', '-1');
		content.focus();
	}


	private renderMessages(container: HTMLElement): void {
		this.messageContainer = container;
		container.empty();
		container.addClass('peak-chat-view__message-container');

		if (!this.activeConversation) {
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'Ready when you are.' 
			});
			return;
		}

		if (this.activeConversation.messages.length === 0) {
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'Ready when you are.' 
			});
			return;
		}

		for (const message of this.activeConversation.messages) {
			const messageWrapper = container.createDiv({ 
				cls: `peak-chat-view__message-wrapper peak-chat-view__message-wrapper--${message.role}`,
				attr: { 'data-message-id': message.id }
			});

			const messageEl = messageWrapper.createDiv({ 
				cls: 'peak-chat-view__message'
			});

			const contentEl = messageEl.createDiv({ cls: 'peak-chat-view__message-content' });
			contentEl.setText(message.content);

			// Action buttons (star, copy, regenerate)
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

		// Scroll to bottom after rendering messages (for initial load)
		if (this.activeConversation.messages.length > 0) {
			this.scrollToBottom();
		}
	}

	private renderInput(container: HTMLElement): void {
		container.empty();
		container.addClass('peak-chat-view__input-wrapper');

		const inputContainer = container.createDiv({ cls: 'peak-chat-view__input-container' });
		
		// Hidden file input
		const fileInput = inputContainer.createEl('input', {
			type: 'file',
			attr: { multiple: 'true', style: 'display: none;' }
		});
		
		// Plus icon on the left for file upload
		const plusIcon = inputContainer.createDiv({ cls: 'peak-chat-view__input-icon' });
		plusIcon.innerHTML = '+';
		plusIcon.setAttribute('title', 'Upload file');
		plusIcon.addEventListener('click', () => {
			fileInput.click();
		});

		// Text area
		const textAreaWrapper = inputContainer.createDiv({ cls: 'peak-chat-view__textarea-wrapper' });
		this.inputArea = new TextAreaComponent(textAreaWrapper);
		// Set placeholder based on whether conversation has messages
		const hasMessages = this.activeConversation && this.activeConversation.messages.length > 0;
		this.inputArea.setPlaceholder(hasMessages ? 'Ask anything' : 'Ready when you are.');
		this.inputArea.setValue('');
		
		// Make textarea auto-resize
		const textareaEl = this.inputArea.inputEl;
		textareaEl.style.resize = 'none';
		const singleLineHeight = 22.5; // font-size 15px * line-height 1.5
		textareaEl.style.minHeight = `${singleLineHeight}px`;
		textareaEl.style.height = `${singleLineHeight}px`;
		
		// Function to update height
		const updateHeight = () => {
			const value = textareaEl.value;
			if (!value || value.trim() === '') {
				// When empty, set to single line height
				textareaEl.style.height = `${singleLineHeight}px`;
			} else {
				// When has content, calculate based on scrollHeight
				textareaEl.style.height = 'auto';
				const newHeight = Math.min(textareaEl.scrollHeight, 200);
				textareaEl.style.height = `${Math.max(newHeight, singleLineHeight)}px`;
			}
		};
		
		textareaEl.addEventListener('input', updateHeight);
		
		// Update height on initial load to ensure correct height
		setTimeout(updateHeight, 0);

		// Send button on the right
		const sendButtonWrapper = inputContainer.createDiv({ cls: 'peak-chat-view__send-wrapper' });
		this.sendButton = new ButtonComponent(sendButtonWrapper);
		this.sendButton.setButtonText('Send');
		this.sendButton.buttonEl.addClass('peak-chat-view__send-button');
		this.sendButton.onClick(() => this.handleSend());

		// Handle Enter key (Enter to send, Shift+Enter for new line)
		textareaEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.handleSend();
			}
		});

		// Handle file selection
		fileInput.addEventListener('change', (evt) => {
			const files = (evt.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				this.handleFileUpload(Array.from(files));
			}
		});

		// Handle drag and drop
		inputContainer.addEventListener('dragover', (evt) => {
			evt.preventDefault();
			inputContainer.classList.add('drag-over');
		});

		inputContainer.addEventListener('dragleave', () => {
			inputContainer.classList.remove('drag-over');
		});

		inputContainer.addEventListener('drop', (evt) => {
			evt.preventDefault();
			inputContainer.classList.remove('drag-over');
			const files = evt.dataTransfer?.files;
			if (files && files.length > 0) {
				this.handleFileUpload(Array.from(files));
			}
		});
	}

	private async handleFileUpload(files: File[]): Promise<void> {
		// TODO: Implement file upload logic
		// For now, just show a notification
		console.log('Files to upload:', files.map(f => f.name));
		// You can add file handling logic here, such as:
		// - Reading file contents
		// - Attaching to conversation
		// - Displaying file info in the UI
	}

	private async handleSend(): Promise<void> {
		if (!this.activeConversation || !this.inputArea) return;
		const value = this.inputArea.getValue().trim();
		if (!value) return;

		this.sendButton?.setDisabled(true);
		try {
			const oldMessageIds = new Set(this.activeConversation.messages.map(m => m.id));
			const result = await this.manager.blockChat({
				conversation: this.activeConversation,
				project: this.activeProject,
				userContent: value,
			});
			this.replaceConversation(result.conversation);
			this.inputArea?.setValue('');
			
			// If message container exists, append only new messages
			if (this.messageContainer && this.bodyEl) {
				const newMessages = result.conversation.messages.filter(m => !oldMessageIds.has(m.id));
				if (newMessages.length > 0) {
					// Append new messages without re-rendering everything
					for (const message of newMessages) {
						const messageWrapper = this.messageContainer.createDiv({ 
							cls: `peak-chat-view__message-wrapper peak-chat-view__message-wrapper--${message.role}`,
							attr: { 'data-message-id': message.id }
						});

						const messageEl = messageWrapper.createDiv({ 
							cls: 'peak-chat-view__message'
						});

						const contentEl = messageEl.createDiv({ cls: 'peak-chat-view__message-content' });
						contentEl.setText(message.content);

						// Action buttons (star, copy, regenerate)
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
					// Update placeholder since conversation now has messages
					if (this.inputArea) {
						this.inputArea.setPlaceholder('Ask anything');
					}
					// Smooth scroll to bottom after appending new messages
					this.scrollToBottom();
				} else {
					// If no new messages but conversation updated, re-render to reflect changes
					this.render();
				}
			} else {
				// If message container doesn't exist, do full render
				this.render();
			}
		} finally {
			this.sendButton?.setDisabled(false);
		}
	}

	private async toggleStar(messageId: string, starred: boolean): Promise<void> {
		if (!this.activeConversation) return;
		const updated = await this.manager.toggleStar({
			messageId,
			conversation: this.activeConversation,
			project: this.activeProject,
			starred,
		});
		this.replaceConversation(updated);
		this.render();
	}

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
		
		// Remove the assistant message and all subsequent messages
		this.activeConversation.messages = this.activeConversation.messages.slice(0, messageIndex);
		
		// Regenerate the response
		try {
			const result = await this.manager.blockChat({
				conversation: this.activeConversation,
				project: this.activeProject,
				userContent: userMessage.content,
			});
			this.replaceConversation(result.conversation);
			this.render();
			this.scrollToBottom();
		} catch (error) {
			console.error('Failed to regenerate message:', error);
		}
	}

	private replaceConversation(next: ParsedConversationFile): void {
		this.conversations = this.conversations.map((conversation) =>
			conversation.meta.id === next.meta.id ? next : conversation
		);
		this.activeConversation = next;
		// Notify message history view to update
		this.notifyHistoryView();
	}

	private notifyHistoryView(): void {
		const historyViews = this.app.workspace.getLeavesOfType('peak-message-history-view');
		historyViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.setActiveConversation === 'function') {
				view.setActiveConversation(this.activeConversation);
			}
		});
	}

	/**
	 * Set active project and conversation from external source (e.g., ProjectListView)
	 */
		setActiveSelection(project: ParsedProjectFile | null, conversation: ParsedConversationFile | null): void {
		// Only update conversation if one is provided
		if (conversation) {
			this.activeProject = project;
			this.activeConversation = conversation;
			this.showingConversationList = false;
			this.conversationListProject = null;
			this.showingAllProjects = false;
			this.showingAllConversations = false;
			this.allConversationsProject = null;
			// Reload conversation to get latest messages
			void this.manager.listConversations(project?.meta).then((conversations) => {
				const updated = conversations.find(c => c.meta.id === conversation.meta.id);
				if (updated) {
					this.activeConversation = updated;
					this.render();
					this.notifyHistoryView();
				}
			});
		} else {
			// If no conversation is provided, don't change the current view state
			// This allows the conversation list to remain visible when just setting the project
			// Only update activeProject if it's different and we're not showing conversation list
			// If we're showing conversation list, preserve that state
			if (this.showingConversationList && this.conversationListProject) {
				// Don't change anything if we're already showing conversation list for this project
				if (this.conversationListProject.meta.id === project?.meta.id) {
					return;
				}
			}
			// Update activeProject if different
			if (this.activeProject?.meta.id !== project?.meta.id) {
				this.activeProject = project;
			}
		}
	}

	/**
	 * Scroll to a specific message by ID
	 */
	scrollToMessage(messageId: string): void {
		if (!this.messageContainer) return;
		const messageEl = this.messageContainer.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
		if (messageEl) {
			messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Highlight the message briefly
			messageEl.classList.add('peak-chat-view__message--highlighted');
			setTimeout(() => {
				messageEl.classList.remove('peak-chat-view__message--highlighted');
			}, 2000);
		}
	}

	/**
	 * Scroll to the top of the message container
	 */
	scrollToTop(instant: boolean = false): void {
		if (!this.bodyEl) return;
		// Use requestAnimationFrame to ensure DOM is fully rendered
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.bodyEl) {
					this.bodyEl.scrollTo({
						top: 0,
						behavior: instant ? 'auto' : 'smooth'
					});
				}
			});
		});
	}
	
	/**
	 * Scroll to the bottom of the message container
	 */
	scrollToBottom(instant: boolean = false): void {
		if (!this.bodyEl) return;
		// Use requestAnimationFrame to ensure DOM is fully rendered
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.bodyEl) {
					this.bodyEl.scrollTo({
						top: this.bodyEl.scrollHeight,
						behavior: instant ? 'auto' : 'smooth'
					});
				}
			});
		});
	}

	/**
	 * Show conversation list for a project (ChatGPT style)
	 */
	async showConversationList(project: ParsedProjectFile): Promise<void> {
		this.showingConversationList = true;
		this.conversationListProject = project;
		this.activeProject = project;
		this.activeConversation = null;
		this.showingAllProjects = false;
		this.showingAllConversations = false;
		this.allConversationsProject = null;
		
		// Load conversations for this project
		this.conversations = await this.manager.listConversations(project.meta);
		
		// Sort conversations by createdAtTimestamp descending (newest first)
		this.conversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		
		this.render();
	}

	/**
	 * Render conversation list in ChatGPT style with project info
	 */
	private async renderConversationList(container: HTMLElement): Promise<void> {
		container.empty();
		container.addClass('peak-chat-view__conversation-list-container');

		if (!this.conversationListProject) return;

		// Project summary section (above stats)
		if (this.conversationListProject.context?.summary) {
			const summarySection = container.createDiv({ cls: 'peak-chat-view__project-summary' });
			summarySection.createEl('h3', { text: 'Project Summary' });
			const summaryContent = summarySection.createDiv({ cls: 'peak-chat-view__summary-content' });
			summaryContent.setText(this.conversationListProject.context.summary || 'No summary available.');
		}

		// Statistics section - Dashboard style cards
		const statsSection = container.createDiv({ cls: 'peak-chat-view__project-stats' });
		const totalConversations = this.conversations.length;
		const totalMessages = this.conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
		
		const statsRow = statsSection.createDiv({ cls: 'peak-chat-view__stats-row' });
		
		// Conversations card
		const conversationsCard = statsRow.createDiv({ cls: 'peak-chat-view__stat-card' });
		conversationsCard.createDiv({ 
			cls: 'peak-chat-view__stat-card-label',
			text: 'Conversations'
		});
		conversationsCard.createDiv({ 
			cls: 'peak-chat-view__stat-card-value',
			text: totalConversations.toString()
		});
		
		// Messages card
		const messagesCard = statsRow.createDiv({ cls: 'peak-chat-view__stat-card' });
		messagesCard.createDiv({ 
			cls: 'peak-chat-view__stat-card-label',
			text: 'Messages'
		});
		messagesCard.createDiv({ 
			cls: 'peak-chat-view__stat-card-value',
			text: totalMessages.toString()
		});

		// Tab navigation
		const tabContainer = container.createDiv({ cls: 'peak-chat-view__project-tabs' });
		const tabs = [
			{ id: 'conversations', label: 'Conversations' },
			{ id: 'starred', label: 'Starred Messages' },
			{ id: 'resources', label: 'Resources' },
		];

		tabs.forEach(tab => {
			const tabEl = tabContainer.createDiv({ 
				cls: `peak-chat-view__project-tab-item ${this.activeProjectTab === tab.id ? 'is-active' : ''}`,
				text: tab.label
			});
			tabEl.addEventListener('click', () => {
				this.activeProjectTab = tab.id as 'conversations' | 'starred' | 'resources';
				this.render();
			});
		});

		// Tab content area
		const tabContent = container.createDiv({ cls: 'peak-chat-view__project-tab-content' });

		// Render content based on active tab
		switch (this.activeProjectTab) {
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

	private renderConversationsTab(container: HTMLElement): void {
		container.empty();
		
		if (!this.conversationListProject) return;

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
			item.addEventListener('click', async () => {
				this.showingConversationList = false;
				this.activeConversation = conversation;
				this.render();
				this.notifyHistoryView();
			});
		}
	}

	private async renderStarredTab(container: HTMLElement): Promise<void> {
		container.empty();
		
		if (!this.conversationListProject) return;

		const starredList = container.createDiv({ cls: 'peak-chat-view__starred-list' });
		
		// Load starred messages for this project
		const allStarred = await this.manager.loadStarred();
		const projectStarred = allStarred.filter(
			s => s.projectId === this.conversationListProject!.meta.id && s.active
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
							this.showingConversationList = false;
							this.activeConversation = conversation;
							this.render();
							this.notifyHistoryView();
							// Scroll to message after a short delay
							setTimeout(() => {
								this.scrollToMessage(message.id);
							}, 100);
						});
					}
				}
			}
		}
	}

	private renderResourcesTab(container: HTMLElement): void {
		container.empty();
		
		const resourcesList = container.createDiv({ cls: 'peak-chat-view__resources-list' });
		resourcesList.createDiv({ 
			cls: 'peak-chat-view__empty-text',
			text: 'No resources attached yet.'
		});
	}

	/**
	 * Show all projects in card view
	 */
	async showAllProjects(projects: ParsedProjectFile[]): Promise<void> {
		this.showingAllProjects = true;
		this.allProjects = projects;
		this.projectsPage = 0;
		this.showingConversationList = false;
		this.conversationListProject = null;
		this.showingAllConversations = false;
		this.allConversationsProject = null;
		this.activeProject = null;
		this.activeConversation = null;
		this.render();
	}

	/**
	 * Show all conversations for a project
	 */
	async showAllConversations(project: ParsedProjectFile): Promise<void> {
		this.showingAllConversations = true;
		this.allConversationsProject = project;
		this.conversationsPage = 0;
		this.allConversations = [];
		this.showingAllProjects = false;
		this.showingConversationList = false;
		this.conversationListProject = null;
		this.activeProject = project;
		this.activeConversation = null;
		
		// Load initial page of conversations
		await this.loadMoreConversations();
		this.render();
	}

	/**
	 * Render all projects in card view (waterfall layout)
	 */
	private async renderAllProjects(container: HTMLElement): Promise<void> {
		container.empty();
		container.addClass('peak-chat-view__all-projects-container');

		const cardsContainer = container.createDiv({ cls: 'peak-chat-view__projects-grid' });
		
		// Calculate how many projects to show based on current page
		const endIndex = (this.projectsPage + 1) * this.PROJECTS_PAGE_SIZE;
		const projectsToShow = this.allProjects.slice(0, endIndex);
		const hasMore = endIndex < this.allProjects.length;

		if (projectsToShow.length === 0) {
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'No projects yet.'
			});
			return;
		}

		// Render project cards
		for (const project of projectsToShow) {
			const card = cardsContainer.createDiv({ cls: 'peak-chat-view__project-card' });
			
			// Project name
			const nameEl = card.createDiv({ cls: 'peak-chat-view__project-card-name' });
			nameEl.setText(project.meta.name);
			
			// Project summary
			const summaryEl = card.createDiv({ cls: 'peak-chat-view__project-card-summary' });
			const summary = project.context?.summary || 'No summary available.';
			summaryEl.setText(summary.length > 150 ? summary.substring(0, 150) + '...' : summary);
			
			// Click to open project
			card.style.cursor = 'pointer';
			card.addEventListener('click', async () => {
				this.showingAllProjects = false;
				this.showingConversationList = true;
				this.conversationListProject = project;
				this.activeProject = project;
				this.activeConversation = null;
				this.conversations = await this.manager.listConversations(project.meta);
				this.render();
			});
		}

		// Setup infinite scroll
		if (hasMore) {
			const sentinel = container.createDiv({ cls: 'peak-chat-view__scroll-sentinel' });
			const observer = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						this.projectsPage++;
						observer.disconnect();
						this.render();
					}
				});
			}, { threshold: 0.1 });
			observer.observe(sentinel);
		}
	}

	/**
	 * Render all conversations for a project with infinite scroll
	 */
	private async renderAllConversations(container: HTMLElement): Promise<void> {
		container.empty();
		container.addClass('peak-chat-view__all-conversations-container');

		if (!this.allConversationsProject) return;

		const listContainer = container.createDiv({ cls: 'peak-chat-view__all-conversations-list' });

		if (this.allConversations.length === 0) {
			const emptyState = container.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', { 
				cls: 'peak-chat-view__empty-text',
				text: 'No conversations yet.'
			});
			return;
		}

		// Render conversations (already sorted by newest first)
		for (const conversation of this.allConversations) {
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
			item.addEventListener('click', async () => {
				this.showingAllConversations = false;
				this.allConversationsProject = null;
				this.activeConversation = conversation;
				this.render();
				this.notifyHistoryView();
			});
		}

		// Setup infinite scroll
		const allConversations = await this.manager.listConversations(this.allConversationsProject.meta);
		const hasMore = this.allConversations.length < allConversations.length;
		
		if (hasMore) {
			const sentinel = container.createDiv({ cls: 'peak-chat-view__scroll-sentinel' });
			const observer = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						observer.disconnect();
						void this.loadMoreConversations();
					}
				});
			}, { threshold: 0.1 });
			observer.observe(sentinel);
		}
	}

	/**
	 * Load more conversations for infinite scroll
	 */
	private async loadMoreConversations(): Promise<void> {
		if (!this.allConversationsProject) return;

		const allConversations = await this.manager.listConversations(this.allConversationsProject.meta);
		
		// Sort by createdAtTimestamp descending (newest first)
		allConversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		const startIndex = this.conversationsPage * this.CONVERSATIONS_PAGE_SIZE;
		const endIndex = startIndex + this.CONVERSATIONS_PAGE_SIZE;
		const newConversations = allConversations.slice(startIndex, endIndex);

		if (newConversations.length > 0) {
			this.allConversations = [...this.allConversations, ...newConversations];
			this.conversationsPage++;
			this.render();
		}
	}

}

