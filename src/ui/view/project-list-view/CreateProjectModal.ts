import { App, Modal, TextComponent } from 'obsidian';

/**
 * Modal for creating a new project
 */
export class CreateProjectModal extends Modal {
	private inputValue: string = '';

	constructor(
		app: App,
		private onSubmit: (name: string) => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-create-project-modal');

		const titleEl = contentEl.createDiv({ cls: 'peak-modal-title' });
		titleEl.createEl('h2', { text: 'Project name' });

		const inputContainer = contentEl.createDiv({ cls: 'peak-modal-input-container' });
		const inputWrapper = inputContainer.createDiv({ cls: 'peak-modal-input-wrapper' });
		const input = new TextComponent(inputWrapper);
		input.setPlaceholder('Enter project name');
		input.setValue('');
		input.onChange((value) => {
			this.inputValue = value;
		});

		const inputEl = input.inputEl;
		inputEl.addClass('peak-modal-input');
		inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.handleSubmit();
			}
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.close();
			}
		});

		const buttonContainer = contentEl.createDiv({ cls: 'peak-modal-button-container' });
		const createButton = buttonContainer.createEl('button', { 
			cls: 'peak-modal-create-button',
			text: 'Create project'
		});
		createButton.addEventListener('click', () => this.handleSubmit());

		setTimeout(() => inputEl.focus(), 100);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async handleSubmit(): Promise<void> {
		const name = this.inputValue.trim();
		if (!name) return;

		this.close();
		await this.onSubmit(name);
	}
}

