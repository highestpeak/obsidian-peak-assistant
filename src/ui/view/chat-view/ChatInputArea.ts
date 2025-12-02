import { App, ButtonComponent, TextAreaComponent } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile, ChatMessage, PendingConversation } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { FileUploadHandler } from './FileUploadHandler';
import { createIcon } from 'src/core/IconHelper';
import { PROJECT_LIST_VIEW_TYPE } from '../ProjectListView';
import { IProjectListView, isProjectListView, IChatView } from '../view-interfaces';
import { generateUuidWithoutHyphens } from 'src/service/chat/utils';

export class ChatInputArea {
	// initialization parameters
	private containerEl: HTMLElement;
	private app: App;
	private fileUploadHandler: FileUploadHandler;
	private manager: AIServiceManager;
	private activeConversation: ParsedConversationFile | null;
	private activeProject: ParsedProjectFile | null;
	private pendingConversation: PendingConversation | null;
	private onConversationUpdated: (conversation: ParsedConversationFile, oldMessageIds: Set<string>) => void;
	// Streaming callbacks
	private onStreamingStart: (messageId: string, role: ChatMessage['role']) => void;
	private onStreamingDelta: (delta: string) => void;
	private onStreamingComplete: (message: ChatMessage) => void;
	private onStreamingError: () => void;

	// created UI elements
	private filePreviewContainer?: HTMLElement;
	private inputArea?: TextAreaComponent;
	private sendButton?: ButtonComponent;
	private fileInput?: HTMLInputElement;

	constructor(
		containerEl: HTMLElement,
		app: App,
		manager: AIServiceManager,
		activeConversation: ParsedConversationFile | null,
		activeProject: ParsedProjectFile | null,
		pendingConversation: PendingConversation | null,
		onConversationUpdated: (conversation: ParsedConversationFile, oldMessageIds: Set<string>) => void,
		// Streaming callbacks
		onStreamingStart: (messageId: string, role: ChatMessage['role']) => void,
		onStreamingDelta: (delta: string) => void,
		onStreamingComplete: (message: ChatMessage) => void,
		onStreamingError: () => void
	) {
		this.containerEl = containerEl;
		this.app = app;
		this.fileUploadHandler = new FileUploadHandler(app);
		this.manager = manager;
		this.activeConversation = activeConversation;
		this.activeProject = activeProject;
		this.pendingConversation = pendingConversation;
		this.onConversationUpdated = onConversationUpdated;
		this.onStreamingStart = onStreamingStart;
		this.onStreamingDelta = onStreamingDelta;
		this.onStreamingComplete = onStreamingComplete;
		this.onStreamingError = onStreamingError;
	}

	render(activeConversation: ParsedConversationFile | null): void {
		this.activeConversation = activeConversation;
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-view__input-wrapper');

		// File preview container (above input)
		this.filePreviewContainer = this.containerEl.createDiv({ cls: 'peak-chat-view__file-preview-container' });
		this.renderFilePreviews();

		const inputContainer = this.containerEl.createDiv({ cls: 'peak-chat-view__input-container' });
		
		// Hidden file input
		this.fileInput = inputContainer.createEl('input', {
			type: 'file',
			attr: { multiple: 'true', style: 'display: none;', accept: '*' }
		}) as HTMLInputElement;
		
		// Plus icon on the left for file upload
		const plusIcon = inputContainer.createDiv({ cls: 'peak-chat-view__input-icon' });
		plusIcon.innerHTML = '+';
		plusIcon.setAttribute('title', 'Upload file');
		plusIcon.addEventListener('click', () => {
			this.fileInput?.click();
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
		this.fileInput.addEventListener('change', (evt) => {
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

	private renderFilePreviews(): void {
		if (!this.filePreviewContainer) return;
		this.filePreviewContainer.empty();

		const pendingFiles = this.fileUploadHandler.getPendingFiles();
		if (pendingFiles.length === 0) {
			return;
		}

		const previewList = this.filePreviewContainer.createDiv({ cls: 'peak-chat-view__file-preview-list' });
		
		for (let i = 0; i < pendingFiles.length; i++) {
			const fileItem = pendingFiles[i];
			const previewItem = previewList.createDiv({
				cls: `peak-chat-view__file-preview-item peak-chat-view__file-preview-item--${fileItem.type}`
			});
			
			if (fileItem.type === 'image' && fileItem.preview) {
				const img = previewItem.createEl('img', {
					cls: 'peak-chat-view__file-preview-image',
					attr: { src: fileItem.preview, alt: fileItem.file.name }
				});
				img.style.maxWidth = '100px';
				img.style.maxHeight = '100px';
				img.style.objectFit = 'contain';
			} else {
				const icon = previewItem.createDiv({ cls: 'peak-chat-view__file-preview-icon' });
				let iconName: string;
				if (fileItem.type === 'pdf') {
					iconName = 'file-text';
				} else if (fileItem.type === 'image') {
					iconName = 'image';
				} else {
					iconName = 'file';
				}
				createIcon(icon, iconName as any, {
					size: 24,
					strokeWidth: 2,
					class: 'peak-icon'
				});
			}
			
			const fileName = previewItem.createDiv({ cls: 'peak-chat-view__file-preview-name' });
			fileName.textContent = fileItem.file.name;
			fileName.title = fileItem.file.name;
			
			const removeBtn = previewItem.createEl('button', {
				cls: 'peak-chat-view__file-preview-remove',
				attr: { 'aria-label': 'Remove file' }
			});
			removeBtn.innerHTML = '×';
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.fileUploadHandler.removeFile(i);
				this.renderFilePreviews();
			});
		}
	}

	private async handleFileUpload(files: File[]): Promise<void> {
		await this.fileUploadHandler.addFiles(files);
		// Re-render to update file previews
		this.render(this.activeConversation);
	}

	private getUploadFolder(): string {
		// Use base manager for settings
		const settings = this.manager.getSettings();
		return settings.uploadFolder || 'ChatFolder/Attachments';
	}

	private async handleSend(): Promise<void> {
		if (!this.inputArea) return;
		const value = this.inputArea.getValue().trim();
		const pendingFiles = this.fileUploadHandler.getPendingFiles();
		if (!value && pendingFiles.length === 0) return;

		// If there's a pending conversation, create it first
		let conversation = this.activeConversation;
		if (!conversation && this.pendingConversation) {
			// Use base manager to create conversation
			conversation = await this.manager.createConversation({
				title: this.pendingConversation.title,
				project: this.pendingConversation.project?.meta ?? null,
			});
			this.activeConversation = conversation;
			this.pendingConversation = null; // Clear pending state
			
			// Update MessagesView to show the new conversation
			// This will be handled by onConversationUpdated callback after message is sent
		}

		if (!conversation) return;

		this.sendButton?.setDisabled(true);
		try {
			// Upload files if any
			let uploadedPaths: string[] = [];
			if (pendingFiles.length > 0) {
				uploadedPaths = await this.fileUploadHandler.uploadFiles(this.getUploadFolder());
			}

			const oldMessageIds = new Set(conversation.messages.map(m => m.id));
			
			// Create temporary user message for immediate display
			const modelId = conversation.meta.activeModel || this.manager.getSettings().defaultModelId;
			const provider = conversation.meta.activeProvider || 'other';
			const tempUserMessage: ChatMessage = {
				id: generateUuidWithoutHyphens(),
				role: 'user',
				content: value,
				model: modelId,
				provider: provider,
				createdAtTimestamp: Date.now(),
				createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				starred: false,
				attachments: uploadedPaths.length > 0 ? uploadedPaths : undefined,
			};
			
			// Show user message immediately
			const tempConversation: ParsedConversationFile = {
				...conversation,
				messages: [...conversation.messages, tempUserMessage],
			};
			this.onConversationUpdated(tempConversation, oldMessageIds);
			
			// Create assistant message ID for streaming
			const assistantMessageId = generateUuidWithoutHyphens();
			this.onStreamingStart(assistantMessageId, 'assistant');
			
			// Use streamChat for real-time updates
			const stream = this.manager.streamChat({
				conversation: conversation,
				project: this.activeProject,
				userContent: value,
				autoSave: true,
			});
			
			let finalConversation: ParsedConversationFile | null = null;
			let finalMessage: ChatMessage | null = null;
			
			try {
				for await (const event of stream) {
					if (event.type === 'delta') {
						// Update streaming content
						this.onStreamingDelta(event.text);
					} else if (event.type === 'complete') {
						// Stream complete, get final message
						if (event.message) {
							finalMessage = event.message;
							this.onStreamingComplete(event.message);
						}
						if (event.conversation) {
							finalConversation = event.conversation;
						}
					} else if (event.type === 'error') {
						// Handle error
						console.error('Streaming error:', event.error);
						this.onStreamingError();
						throw event.error;
					}
				}
			} catch (error) {
				this.onStreamingError();
				throw error;
			}
			
			// Use final conversation from stream, or re-read if needed
			if (!finalConversation) {
				// Re-read conversation to get updated state
				const allConversations = await this.manager.listConversations(this.activeProject?.meta);
				finalConversation = allConversations.find(c => c.meta.id === conversation.meta.id) || conversation;
			}
			
			if (finalConversation) {
				let needsListRefresh = false;
				
				// If this is a new conversation (title is still default), generate a new name
				// Only generate after first message exchange (user + assistant)
				if ((finalConversation.meta.title === 'New Conversation' || finalConversation.meta.title === 'new-conversation') &&
				    finalConversation.messages.length >= 2) {
					try {
						const messagesForName = finalConversation.messages.map(msg => ({
							role: msg.role,
							content: msg.content,
						}));
						const generatedName = await this.manager.getApplicationService().generateConvName({
							conversation: {
								id: finalConversation.meta.id,
								messages: messagesForName,
							},
						});
						
						// Update conversation title
						finalConversation = await this.manager.updateConversationTitle({
							conversation: finalConversation,
							project: this.activeProject,
							title: generatedName,
						});
						needsListRefresh = true;
					} catch (error) {
						console.warn('Failed to generate conversation name', error);
					}
				}
				
				this.activeConversation = finalConversation;
				this.onConversationUpdated(finalConversation, oldMessageIds);
				
				// Refresh the list if title was updated
				if (needsListRefresh && finalConversation) {
					const projectListViews = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
					for (const leaf of projectListViews) {
						const view = leaf.view as unknown;
						if (isProjectListView(view)) {
							await view.refreshConversationList(finalConversation);
						}
					}
				}
			}

			this.fileUploadHandler.clearPendingFiles();
			this.renderFilePreviews();
			this.inputArea?.setValue('');
			this.updatePlaceholder(true);
		} finally {
			this.sendButton?.setDisabled(false);
		}
	}

	updateState(activeConversation: ParsedConversationFile | null, activeProject: ParsedProjectFile | null, pendingConversation: PendingConversation | null = null): void {
		this.activeConversation = activeConversation;
		this.activeProject = activeProject;
		this.pendingConversation = pendingConversation;
	}

	updateContainer(containerEl: HTMLElement): void {
		this.containerEl = containerEl;
	}

	getInputArea(): TextAreaComponent | undefined {
		return this.inputArea;
	}

	getSendButton(): ButtonComponent | undefined {
		return this.sendButton;
	}

	updatePlaceholder(hasMessages: boolean): void {
		if (this.inputArea) {
			this.inputArea.setPlaceholder(hasMessages ? 'Ask anything' : 'Ready when you are.');
		}
	}

	focus(): void {
		if (this.inputArea?.inputEl) {
			// Use setTimeout to ensure DOM is ready
			setTimeout(() => {
				this.inputArea?.inputEl.focus();
			}, 100);
		}
	}
}

