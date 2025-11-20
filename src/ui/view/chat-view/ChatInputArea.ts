import { App, ButtonComponent, TextAreaComponent } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile, ChatMessage } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { FileUploadHandler } from './FileUploadHandler';
import { createIcon } from 'src/core/IconHelper';

export class ChatInputArea {
	// initialization parameters
	private containerEl: HTMLElement;
	private fileUploadHandler: FileUploadHandler;
	private manager: AIServiceManager;
	private activeConversation: ParsedConversationFile | null;
	private activeProject: ParsedProjectFile | null;
	private onConversationUpdated: (conversation: ParsedConversationFile, oldMessageIds: Set<string>) => void;

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
		onConversationUpdated: (conversation: ParsedConversationFile, oldMessageIds: Set<string>) => void
	) {
		this.containerEl = containerEl;
		this.fileUploadHandler = new FileUploadHandler(app);
		this.manager = manager;
		this.activeConversation = activeConversation;
		this.activeProject = activeProject;
		this.onConversationUpdated = onConversationUpdated;
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
			const previewItem = previewList.createDiv({ cls: 'peak-chat-view__file-preview-item' });
			
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
		const settings = this.manager.getSettings();
		return settings.uploadFolder || 'ChatFolder/Attachments';
	}

	private async handleSend(): Promise<void> {
		if (!this.inputArea || !this.activeConversation) return;
		const value = this.inputArea.getValue().trim();
		const pendingFiles = this.fileUploadHandler.getPendingFiles();
		if (!value && pendingFiles.length === 0) return;

		this.sendButton?.setDisabled(true);
		try {
			// Upload files if any
			let uploadedPaths: string[] = [];
			if (pendingFiles.length > 0) {
				uploadedPaths = await this.fileUploadHandler.uploadFiles(this.getUploadFolder());
			}

			const oldMessageIds = new Set(this.activeConversation.messages.map(m => m.id));
			const result = await this.manager.blockChat({
				conversation: this.activeConversation,
				project: this.activeProject,
				userContent: value,
				attachments: uploadedPaths.length > 0 ? uploadedPaths : undefined,
			});

			this.fileUploadHandler.clearPendingFiles();
			this.inputArea?.setValue('');
			this.updatePlaceholder(true);

			// Notify parent about conversation update
			this.onConversationUpdated(result.conversation, oldMessageIds);
		} finally {
			this.sendButton?.setDisabled(false);
		}
	}

	updateState(activeConversation: ParsedConversationFile | null, activeProject: ParsedProjectFile | null): void {
		this.activeConversation = activeConversation;
		this.activeProject = activeProject;
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

