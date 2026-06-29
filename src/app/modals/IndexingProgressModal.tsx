import { ReactModalHost, type ReactModalShellOptions } from '@/app/shell/ReactModalHost';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';
import {
	IndexingProgressContent,
	type ProgressSubscriber,
} from '@/ui/view/modals/IndexingProgressContent';

export class IndexingProgressModal extends ReactModalHost {
	private subscribers = new Set<ProgressSubscriber>();
	private cancelled = false;

	protected readonly shell: ReactModalShellOptions = {
		contentClasses: ['peak-indexing-progress-modal'],
		width: '400px',
	};

	constructor(
		appContext: AppContext,
		private readonly onCancel: () => void,
	) {
		super(appContext);
	}

	updateProgress(ev: PendingLlmEnrichmentProgress): void {
		for (const cb of this.subscribers) cb(ev);
	}

	isCancelled(): boolean {
		return this.cancelled;
	}

	protected renderElement(): React.ReactElement {
		const subscribe = (cb: ProgressSubscriber) => {
			this.subscribers.add(cb);
			return () => this.subscribers.delete(cb);
		};
		const handleCancel = () => {
			this.cancelled = true;
			this.close();
			this.onCancel();
		};
		return createReactElementWithServices(
			IndexingProgressContent,
			{ onCancel: handleCancel, subscribe },
			this.appContext,
		);
	}

	onClose(): void {
		this.subscribers.clear();
		super.onClose();
	}
}
