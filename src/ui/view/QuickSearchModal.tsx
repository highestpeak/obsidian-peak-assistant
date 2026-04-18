import React from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { QuickSearchModalContent } from './quick-search/SearchModal';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { sessionRefs } from './quick-search/hooks/useSearchSession';
import { useSearchSessionStore } from './quick-search/store/searchSessionStore';

/**
 * Obsidian modal wrapper for quick search React UI.
 */
export class QuickSearchModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {
		super(appContext.app);
	}

	onOpen(): void {
		// Note: Opening the modal (esp. when Vault Search tab is active) can trigger [Violation] Forced reflow.
		// Root cause: layout reads during mount. Deferred for now.
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
		// Detach active session to background before unmounting React
		const store = useSearchSessionStore.getState();
		const isActive = store.status === 'streaming' || store.status === 'starting';
		const hasPlan = store.v2PlanSections.length > 0 && !store.v2PlanApproved;
		if (isActive || hasPlan) {
			BackgroundSessionManager.getInstance().detachForeground({
				agentRef: sessionRefs.agentRef,
				abortController: sessionRefs.abortController,
			});
		}

		// Existing close logic unchanged
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			// Defer to next macrotask so root.unmount() never runs during commit (AnimatePresence etc.)
			setTimeout(() => {
				r.unmount();
				this.contentEl.empty();
			}, 0);
		} else {
			this.contentEl.empty();
		}
	}
}


