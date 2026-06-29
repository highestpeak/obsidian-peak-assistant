import { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/shell/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { USAGE_DASHBOARD_VIEW_TYPE } from '@/app/view/types';

export { USAGE_DASHBOARD_VIEW_TYPE };

export class UsageDashboardView extends ReactItemViewHost {
	protected readonly viewType = USAGE_DASHBOARD_VIEW_TYPE;
	protected readonly displayText = 'Token Usage';
	protected readonly icon: IconName = 'bar-chart-3';
	// `peak-design-root` scopes shared PR-0 primitives; `usage-dashboard`
	// scopes dashboard-local chart primitives (dashboard-charts.css).
	protected readonly rootClasses = [
		'peak-design-root',
		'usage-dashboard',
		'peak-usage-dashboard',
	] as const;

	protected renderElement(): React.ReactElement {
		const { UsageDashboard } = require('@/ui/view/usage-dashboard/UsageDashboard');
		return createReactElementWithServices(UsageDashboard, {}, this.appContext);
	}
}
