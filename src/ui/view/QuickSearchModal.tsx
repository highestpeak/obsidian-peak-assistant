import React from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { QuickSearchModalContent } from './quick-search/SearchModal';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

/**
 * Obsidian modal wrapper for quick search React UI.
 */
export class QuickSearchModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-quick-search-modal');
		// Remove default modal padding so React content sticks to edges
		contentEl.style.padding = '0';

		// Position modal similar to Obsidian's command palette
		modalEl.style.position = 'absolute';
		modalEl.style.top = '80px';
		modalEl.style.width = '1100px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.maxHeight = 'calc(100vh - 160px)';
		modalEl.style.padding = '0';
		modalEl.style.overflow = 'hidden'; // Prevent modal itself from scrolling

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				QuickSearchModalContent, 
				{ onClose: () => this.close() }, 
				this.appContext
			)
		);
	}

	onClose(): void {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.contentEl.empty();
	}
}


