import { App, Modal } from 'obsidian';

/**
 * Modal showing build user profile progress and a Cancel button.
 * Call setProgress() to update the message; call onCancel when user clicks Cancel.
 */
export class BuildUserProfileProgressModal extends Modal {
	private progressEl: HTMLParagraphElement | null = null;
	private cancelClickHandler: (() => void) | null = null;

	constructor(
		app: App,
		private readonly onCancel: () => void,
	) {
		super(app);
		this.modalEl.addClass('peak-build-user-profile-progress-modal');
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Building User Profile' });
		this.progressEl = contentEl.createEl('p', { cls: 'peak-build-profile-progress' });
		this.progressEl.setText('Preparing...');
		const cancelBtn = contentEl.createEl('button', { text: 'Cancel', cls: 'mod-warning' });
		this.cancelClickHandler = () => {
			this.onCancel();
			this.close();
		};
		cancelBtn.addEventListener('click', this.cancelClickHandler);
	}

	/**
	 * Update the progress message (e.g. "Scanning... (batch 3/20)").
	 */
	setProgress(message: string): void {
		if (this.progressEl) {
			this.progressEl.setText(message);
		}
	}

	onClose(): void {
		const cancelBtn = this.contentEl.querySelector('button.mod-warning');
		if (cancelBtn && this.cancelClickHandler) {
			cancelBtn.removeEventListener('click', this.cancelClickHandler);
		}
		this.cancelClickHandler = null;
		this.onCancel();
		this.progressEl = null;
		this.contentEl.empty();
	}
}
