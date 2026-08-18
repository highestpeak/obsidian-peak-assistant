import React from 'react';
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { QuickSearchModalContent } from '@/ui/view/quick-search/SearchModal';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { AIQueryRewriteModal } from '@/app/ui-host/modals/AIQueryRewriteModal';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { useSharedStore } from '@/ui/view/quick-search/store';
import type { QuickSearchOpenOptions } from '@/core/ports/QuickSearchLauncherPort';
import { useAIGraphStore } from '@/ui/view/quick-search/store/aiGraphStore';
import { graphFullscreenOpen } from './graphFullscreenGuard';

/**
 * Obsidian modal wrapper for quick search React UI.
 */
export class QuickSearchModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		private readonly appContext: AppContext,
		private readonly openOptions?: QuickSearchOpenOptions,
	) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		if (
			this.openOptions?.aiMode
			|| this.openOptions?.graphId
			|| this.openOptions?.initialQuery !== undefined
		) {
			useSharedStore.getState().beginIntentOpen(
				this.openOptions.aiMode ?? 'graph',
				this.openOptions.graphId,
				this.openOptions.graphVersionId,
				this.openOptions.graphCreateOrigin,
			);
			if (this.openOptions.initialQuery !== undefined) {
				useSharedStore.getState().setSearchQuery(this.openOptions.initialQuery);
			}
			useAIGraphStore.getState().setSelectedPaths(this.openOptions.selectedVaultPaths ?? []);
			useAIGraphStore.getState().clearInitialSources();
		} else {
			useSharedStore.getState().beginOrdinaryOpen();
			useAIGraphStore.getState().setSelectedPaths([]);
			useAIGraphStore.getState().clearInitialSources();
		}
		// Kick off the AI-Suggest behavior recorder for this session. Stops in
		// onClose. Cheap — subscribes to two Zustand stores + a debounce timer.
		behaviorRecorder.start();
		this.doRender();
	}

	private doRender(): void {
		// Note: Opening the modal (esp. when Vault Search tab is active) can trigger [Violation] Forced reflow.
		// Root cause: layout reads during mount. Deferred for now.
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-quick-search-modal');
		contentEl.addClass('pktw-root');
		modalEl.addClass('peak-result-browser-modal-frame');
		// `peak-design-root` on modalEl opts the whole subtree into the
		// Obsidian-tag reset (see docs/recurring-pitfalls.md #obsidian-css-bleed).
		// Without it, shared controls inside the Quick Search view-mode
		// toggle inherit Obsidian's --input-height / hover transforms and
		// render as separate pill outlines instead of a segmented control.
		modalEl.addClass('peak-design-root');
		// Remove default modal padding so React content sticks to edges
		contentEl.style.padding = '0';

		// Position modal similar to Obsidian's command palette
		modalEl.style.position = 'absolute';
		modalEl.style.padding = '0';
		modalEl.style.overflow = 'hidden'; // Prevent modal itself from scrolling

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				QuickSearchModalContent,
				{
					onClose: () => this.closeFromContent(),
					onOpenVaultIntelligence: () => {
						this.closeFromContent();
						void this.appContext.viewManager.activateVaultIntelligenceView();
					},
					onOpenSuggest: () => {
						new AIQueryRewriteModal(this.appContext, this.appContext.settings).open();
					},
					onReplaySuggest: (entryId: string) => {
						// Import the store dynamically so tests that stub
						// localStorage don't hit an eager singleton import
						// chain at module init.
						import('@/ui/view/quick-search/rewrite/SuggestHistoryStore').then(({ suggestHistoryStore }) => {
							const entry = suggestHistoryStore.get(entryId);
							if (!entry) return;
							new AIQueryRewriteModal(this.appContext, this.appContext.settings, entry).open();
						});
					},
				},
				this.appContext
			)
		);
	}

	private closeFromContent(): void {
		super.close();
	}

	override close(): void {
		if (graphFullscreenOpen(this.contentEl.ownerDocument)) return;
		super.close();
	}

	onClose(): void {
		// Detach the behavior recorder — dumps its buffer and unhooks the
		// Zustand subscriptions so nothing lingers between sessions.
		try { behaviorRecorder.stop(); } catch { /* ignore */ }
		// T10: detach an active foreground session to the background through
		// the app-owned runtime. The foreground-session port inside the
		// runtime reads the Zustand store + sessionRefs directly, so this
		// site no longer reaches into either.
		try {
			AppContext.tryGetQuickSearchBackgroundRuntime()?.detachForeground();
		} catch (e) {
			console.warn('[QuickSearchModal] detachForeground failed:', e);
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
