import { Modal, Setting, normalizePath, Notice } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';

/**
 * Minimal modal for quick note capture.
 * Creates a new note in the configured inbox folder with optional title + content.
 */
export class QuickNoteModal extends Modal {
	private titleValue = '';
	private contentValue = '';

	constructor() {
		super(AppContext.getInstance().app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-quick-note-modal');

		contentEl.createEl('div', {
			cls: 'pktw-text-sm pktw-font-semibold pktw-mb-3',
			text: 'Quick Note',
		});

		// Title input
		new Setting(contentEl)
			.setName('Title')
			.setDesc('Leave blank for timestamp-based title')
			.addText((text) => {
				text.setPlaceholder('Note title...');
				text.onChange((value) => { this.titleValue = value; });
				// Auto-focus
				setTimeout(() => text.inputEl.focus(), 50);
			});

		// Content textarea
		const contentContainer = contentEl.createDiv({ cls: 'peak-quick-note-modal__content' });
		contentContainer.createEl('label', {
			text: 'Content',
			cls: 'setting-item-name',
		});
		const textareaEl = contentContainer.createEl('textarea', {
			cls: 'peak-quick-note-modal__textarea',
			attr: {
				placeholder: 'Write your note...',
				rows: '6',
			},
		});
		textareaEl.style.width = '100%';
		textareaEl.style.resize = 'vertical';
		textareaEl.style.minHeight = '100px';
		textareaEl.style.marginTop = '6px';
		textareaEl.addEventListener('input', (e) => {
			this.contentValue = (e.target as HTMLTextAreaElement).value;
		});

		// Keyboard shortcut: Ctrl/Cmd+Enter to save
		textareaEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				this.handleSave();
			}
		});

		// Save button
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Save');
				btn.setCta();
				btn.onClick(() => this.handleSave());
			})
			.addButton((btn) => {
				btn.setButtonText('Cancel');
				btn.onClick(() => this.close());
			});
	}

	private async handleSave(): Promise<void> {
		const content = this.contentValue.trim();
		if (!content) {
			new Notice('Note content cannot be empty.');
			return;
		}

		const appContext = AppContext.getInstance();
		const app = appContext.app;
		const settings = appContext.settings;

		// Resolve title
		let title = this.titleValue.trim();
		if (!title) {
			// Auto-generate from first line or timestamp
			const firstLine = content.split('\n')[0].trim();
			if (firstLine.length > 3 && firstLine.length <= 80) {
				title = firstLine.replace(/^#+\s*/, '').trim();
			}
			if (!title) {
				const now = new Date();
				title = `Note ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
			}
		}

		// Sanitize filename
		const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-');
		const inboxFolder = (settings as any).inboxFolder ?? '_inbox';
		const folderPath = normalizePath(inboxFolder);
		const filePath = normalizePath(`${folderPath}/${safeTitle}.md`);

		try {
			// Ensure folder exists
			if (!(await app.vault.adapter.exists(folderPath))) {
				await app.vault.createFolder(folderPath);
			}

			// Check file doesn't already exist
			if (await app.vault.adapter.exists(filePath)) {
				new Notice(`A note named "${safeTitle}" already exists in ${folderPath}.`);
				return;
			}

			await app.vault.create(filePath, content);
			new Notice(`Note saved to ${filePath}`);
			this.close();
		} catch (e) {
			console.error('[QuickNoteModal] Failed to save:', e);
			new Notice(`Failed to save note: ${(e as Error).message}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
