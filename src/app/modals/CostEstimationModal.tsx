import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { BulkCostEstimate } from '@/service/search/support/cost-estimator';
import { CostEstimationContent } from '@/ui/view/modals/CostEstimationContent';

export class CostEstimationModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		private readonly appContext: AppContext,
		private readonly onConfirm: (choice: 'run' | 'skip') => void,
		private readonly estimatePromise: Promise<BulkCostEstimate>,
	) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-cost-estimation-modal');
		contentEl.style.padding = '0';

		modalEl.style.width = '380px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.padding = '0';

		const onRun = () => {
			this.close();
			this.onConfirm('run');
		};
		const onSkip = () => {
			this.close();
			this.onConfirm('skip');
		};
		const onCancel = () => this.close();

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CostEstimationContent,
				{ onRun, onSkip, onCancel, estimatePromise: this.estimatePromise },
				this.appContext,
			),
		);
	}

	onClose(): void {
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
