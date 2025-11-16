import { App, Modal, Setting, TextComponent } from 'obsidian';

/**
 * Lightweight modal for collecting single-line user text input.
 */
export class InputModal extends Modal {
	private inputValue = '';

	constructor(
		app: App,
		private readonly message: string,
		private readonly onSubmit: (value: string | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.message });

		let input: TextComponent;
		new Setting(contentEl).addText((text) => {
			input = text;
			text.setPlaceholder(this.message);
			text.onChange((value) => {
				this.inputValue = value;
			});
			text.inputEl.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter' && !evt.shiftKey) {
					evt.preventDefault();
					this.handleSubmit();
				}
				if (evt.key === 'Escape') {
					evt.preventDefault();
					this.handleCancel();
				}
			});
		});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('OK');
				button.setCta();
				button.onClick(() => this.handleSubmit());
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.handleCancel());
			});

		setTimeout(() => input.inputEl.focus(), 100);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
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

