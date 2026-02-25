import { App, Modal, Setting, TextComponent } from 'obsidian';

/**
 * Lightweight modal for collecting single-line user text input.
 */
export class InputModal extends Modal {
	private inputValue = '';
	private inputHandler: ((e: Event) => void) | null = null;
	private keydownHandler: ((evt: KeyboardEvent) => void) | null = null;

	constructor(
		app: App,
		private readonly message: string,
		private readonly onSubmit: (value: string | null) => void,
		private readonly initialValue?: string,
		private readonly placeholderText?: string
	) {
		super(app);
		if (initialValue) {
			this.inputValue = initialValue;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-input-modal');
		
		const titleEl = contentEl.createDiv({ cls: 'peak-input-modal__title' });
		titleEl.createEl('h2', { text: this.message });

		const inputContainer = contentEl.createDiv({ cls: 'peak-input-modal__input-container' });
		
		// Create input directly without Setting component to avoid left spacing
		const inputEl = inputContainer.createEl('input', {
			type: 'text',
			cls: 'peak-input-modal__input',
			attr: {
				placeholder: this.placeholderText || '',
			}
		});
		
		if (this.initialValue) {
			inputEl.value = this.initialValue;
		}

		this.inputHandler = (e) => {
			this.inputValue = (e.target as HTMLInputElement).value;
		};
		this.keydownHandler = (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.handleSubmit();
			}
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.handleCancel();
			}
		};
		inputEl.addEventListener('input', this.inputHandler);
		inputEl.addEventListener('keydown', this.keydownHandler);

		const buttonContainer = contentEl.createDiv({ cls: 'peak-input-modal__button-container' });
		new Setting(buttonContainer)
			.addButton((button) => {
				button.setButtonText('OK');
				button.setCta();
				button.onClick(() => this.handleSubmit());
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.handleCancel());
			});

		setTimeout(() => {
			inputEl.focus();
			if (this.initialValue) {
				inputEl.select(); // Select all text for easy editing
			}
		}, 100);
	}

	onClose(): void {
		const inputEl = this.contentEl.querySelector('input');
		if (inputEl && this.inputHandler && this.keydownHandler) {
			inputEl.removeEventListener('input', this.inputHandler);
			inputEl.removeEventListener('keydown', this.keydownHandler);
		}
		this.inputHandler = null;
		this.keydownHandler = null;
		this.contentEl.empty();
	}

	private handleSubmit(): void {
		const value = this.inputValue.trim() || null;
		this.close();
		this.onSubmit(value);
	}

	private handleCancel(): void {
		this.close();
		this.onSubmit(null);
	}
}

