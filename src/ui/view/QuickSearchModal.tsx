import React from 'react';
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { QuickSearchModalContent } from './quick-search/SearchModal';
import { AIServiceManager } from '@/service/chat/service-manager';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { SearchClient } from '@/service/search/SearchClient';

/**
 * Obsidian modal wrapper for quick search React UI.
 */
export class QuickSearchModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private readonly manager: AIServiceManager, private readonly searchClient: SearchClient | null) {
		super(app);
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

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(QuickSearchModalContent, {}, this.app, this.manager, this.searchClient)
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


