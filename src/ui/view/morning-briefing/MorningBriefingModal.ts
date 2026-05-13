import { App, Modal } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';

/**
 * Obsidian Modal that renders the Morning Briefing React panel.
 * Displayed once on startup when briefing items are available.
 */
export class MorningBriefingModal extends Modal {
	private root: Root | null = null;

	constructor(app: App) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-morning-briefing-modal');
		contentEl.addClass('pktw-root');

		// Set modal width
		this.modalEl.style.maxWidth = '520px';
		this.modalEl.style.width = '90vw';

		// Dynamic import to avoid circular dependencies
		const { MorningBriefingPanel } = await import('./MorningBriefingPanel');

		this.root = createRoot(contentEl);
		this.root.render(
			React.createElement(MorningBriefingPanel, {
				onDismiss: () => this.close(),
			}),
		);
	}

	onClose(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.contentEl.empty();
		useMorningBriefingStore.getState().dismiss();
	}
}
