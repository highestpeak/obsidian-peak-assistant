import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';
import {
	IndexingProgressContent,
	type ProgressSubscriber,
} from '@/ui/view/modals/IndexingProgressContent';

export class IndexingProgressModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private subscribers = new Set<ProgressSubscriber>();
	private cancelled = false;

	constructor(
		private readonly appContext: AppContext,
		private readonly onCancel: () => void,
	) {
		super(appContext.app);
	}

	updateProgress(ev: PendingLlmEnrichmentProgress): void {
		for (const cb of this.subscribers) {
			cb(ev);
		}
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-indexing-progress-modal');
		contentEl.style.padding = '0';

		modalEl.style.width = '400px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.padding = '0';

		const subscribe = (cb: ProgressSubscriber) => {
			this.subscribers.add(cb);
			return () => this.subscribers.delete(cb);
		};

		const handleCancel = () => {
			this.cancelled = true;
			this.close();
			this.onCancel();
		};

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				IndexingProgressContent,
				{ onCancel: handleCancel, subscribe },
				this.appContext,
			),
		);
	}

	onClose(): void {
		this.subscribers.clear();
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => {
				r.unmount();
				this.contentEl.empty();
			}, 0);
		} else {
			this.contentEl.empty();
		}
	}
}
