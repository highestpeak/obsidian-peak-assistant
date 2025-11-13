import { ButtonComponent, DropdownComponent, ItemView, Setting, TextAreaComponent, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ChatProjectMeta, ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';

export const CHAT_VIEW_TYPE = 'peak-chat-view';

export class ChatView extends ItemView {
	private projects: ParsedProjectFile[] = [];
	private conversations: ParsedConversationFile[] = [];
	private activeProject: ParsedProjectFile | null = null;
	private activeConversation: ParsedConversationFile | null = null;

	private projectDropdown?: DropdownComponent;
	private conversationDropdown?: DropdownComponent;
	private messageContainer?: HTMLElement;
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
		this.renderMessages(bodyEl);

		const footerEl = containerEl.createDiv({ cls: 'peak-chat-view__footer' });
		this.renderInput(footerEl);
	}

	private renderHeader(container: HTMLElement): void {
		container.empty();
		const projectSetting = new Setting(container)
			.setName('Current Project')
			.setDesc('Choose or create a project');

		this.projectDropdown = new DropdownComponent(projectSetting.controlEl)
			.onChange(async (value) => {
				if (value === 'none') {
					this.activeProject = null;
				} else {
					this.activeProject = this.projects.find((project) => project.meta.id === value) ?? null;
				}
				await this.reloadConversations();
			});

		this.projectDropdown.addOption('none', 'Without Project');
		for (const project of this.projects) {
			this.projectDropdown.addOption(project.meta.id, project.meta.name);
		}
		if (this.activeProject) {
			this.projectDropdown.setValue(this.activeProject.meta.id);
		} else {
			this.projectDropdown.setValue('none');
		}

		const conversationSetting = new Setting(container)
			.setName('Current Conversation')
			.setDesc('Choose a conversation to open');

		this.conversationDropdown = new DropdownComponent(conversationSetting.controlEl)
			.onChange((value) => {
				if (value === 'none') {
					this.activeConversation = null;
				} else {
					this.activeConversation = this.conversations.find((conversation) => conversation.meta.id === value) ?? null;
				}
				this.renderMessages(this.messageContainer ?? this.containerEl.createDiv());
			});

		this.refreshConversationDropdown();

		new Setting(container)
			.addButton((button) => {
				button.setButtonText('New Project')
					.onClick(() => this.openCreateProjectModal());
			})
			.addButton((button) => {
				button.setButtonText('New Conversation')
					.onClick(() => this.openCreateConversationModal());
			});
	}

	private refreshConversationDropdown(): void {
		if (!this.conversationDropdown) return;
		const select = this.conversationDropdown.selectEl;
		while (select.firstChild) {
			select.removeChild(select.firstChild);
		}
		if (this.conversations.length === 0) {
			this.conversationDropdown.addOption('none', 'No conversations');
			this.conversationDropdown.setValue('none');
			this.activeConversation = null;
			return;
		}
		for (const conversation of this.conversations) {
			this.conversationDropdown.addOption(conversation.meta.id, conversation.meta.title);
		}
		if (this.activeConversation) {
			this.conversationDropdown.setValue(this.activeConversation.meta.id);
		} else {
			this.activeConversation = this.conversations[0];
			this.conversationDropdown.setValue(this.activeConversation.meta.id);
		}
	}

	private renderMessages(container: HTMLElement): void {
		this.messageContainer = container;
		container.empty();
		container.addClass('peak-chat-view__message-container');

		if (!this.activeConversation) {
			container.createDiv({ text: 'Select a conversation or create a new one.' });
			return;
		}

		for (const message of this.activeConversation.messages) {
			const messageEl = container.createDiv({ cls: `peak-chat-view__message peak-chat-view__message--${message.role}` });
			const metaEl = messageEl.createDiv({ cls: 'peak-chat-view__message-meta' });
			metaEl.createSpan({ text: `${message.role.toUpperCase()} · ${message.model}` });

			const starButton = metaEl.createEl('button', { cls: 'peak-chat-view__star-button', text: message.starred ? '★' : '☆' });
			starButton.addEventListener('click', async () => {
				await this.toggleStar(message.id, !message.starred);
			});

			const contentEl = messageEl.createDiv({ cls: 'peak-chat-view__message-content' });
			contentEl.setText(message.content);
		}
	}

	private renderInput(container: HTMLElement): void {
		container.empty();
		const setting = new Setting(container).setName('Send Message');

		this.inputArea = new TextAreaComponent(setting.controlEl)
			.setPlaceholder('Enter your message...')
			.setValue('');

		this.sendButton = new ButtonComponent(setting.controlEl)
			.setButtonText('Send')
			.onClick(() => this.handleSend());
	}

	private async handleSend(): Promise<void> {
		if (!this.activeConversation || !this.inputArea) return;
		const value = this.inputArea.getValue().trim();
		if (!value) return;

		this.sendButton?.setDisabled(true);
		try {
			const result = await this.manager.blockChat({
				conversation: this.activeConversation,
				project: this.activeProject,
				userContent: value,
			});
			this.replaceConversation(result.conversation);
			this.inputArea?.setValue('');
			this.renderMessages(this.messageContainer ?? this.containerEl.createDiv());
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
		this.renderMessages(this.messageContainer ?? this.containerEl.createDiv());
	}

	private replaceConversation(next: ParsedConversationFile): void {
		this.conversations = this.conversations.map((conversation) =>
			conversation.meta.id === next.meta.id ? next : conversation
		);
		this.activeConversation = next;
	}

	private async reloadConversations(): Promise<void> {
		this.conversations = await this.manager.listConversations(this.activeProject?.meta);
		this.activeConversation = this.conversations[0] ?? null;
		this.refreshConversationDropdown();
		this.renderMessages(this.messageContainer ?? this.containerEl.createDiv());
	}

	private openCreateProjectModal(): void {
		const name = window.prompt('Enter project name');
		if (!name) return;
		const timestamp = Date.now();
		const meta: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'> = {
			name,
		};
		void this.manager.createProject(meta).then(async () => {
			await this.hydrateData();
			this.render();
		});
	}

	private openCreateConversationModal(): void {
		const title = window.prompt('Enter conversation title');
		if (!title) return;
		void this.manager.createConversation({
			title,
			project: this.activeProject?.meta ?? null,
		}).then((conversation) => {
			this.conversations = [conversation, ...this.conversations];
			this.activeConversation = conversation;
			this.refreshConversationDropdown();
			this.renderMessages(this.messageContainer ?? this.containerEl.createDiv());
		});
	}
}

