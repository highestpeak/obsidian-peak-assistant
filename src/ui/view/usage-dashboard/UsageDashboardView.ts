import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

export const USAGE_DASHBOARD_VIEW_TYPE = 'peak-usage-dashboard';

export class UsageDashboardView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
		super(leaf);
	}

	getViewType(): string {
		return USAGE_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Token Usage';
	}

	getIcon(): IconName {
		return 'bar-chart-3';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-usage-dashboard');
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private render(): void {
		if (!this.reactRenderer) return;
		const { UsageDashboard } = require('./UsageDashboard');
		const element = createReactElementWithServices(UsageDashboard, {}, this.appContext);
		this.reactRenderer.render(element);
	}

	async onClose(): Promise<void> {
		if (this.openRafId != null) {
			cancelAnimationFrame(this.openRafId);
			this.openRafId = null;
		}
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.containerEl.empty();
	}
}
