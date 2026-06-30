import { ReactModalHost, type ReactModalShellOptions } from '@/app/ui-host/ReactModalHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import type { BulkCostEstimate } from '@/service/search/support/cost-estimator';
import { CostEstimationContent } from '@/ui/view/modals/CostEstimationContent';

export class CostEstimationModal extends ReactModalHost {
	protected readonly shell: ReactModalShellOptions = {
		contentClasses: ['peak-cost-estimation-modal'],
		width: '380px',
	};

	constructor(
		appContext: AppContext,
		private readonly onConfirm: (choice: 'run' | 'skip') => void,
		private readonly estimatePromise: Promise<BulkCostEstimate>,
	) {
		super(appContext);
	}

	protected renderElement(): React.ReactElement {
		const onRun = () => {
			this.close();
			this.onConfirm('run');
		};
		const onSkip = () => {
			this.close();
			this.onConfirm('skip');
		};
		const onCancel = () => this.close();
		return createReactElementWithServices(
			CostEstimationContent,
			{ onRun, onSkip, onCancel, estimatePromise: this.estimatePromise },
			this.appContext,
		);
	}
}
