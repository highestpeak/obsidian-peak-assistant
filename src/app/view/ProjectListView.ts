import { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/shell/ReactItemViewHost';
import { ProjectListViewComponent } from '@/ui/view/project-list-view/ProjectListView';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { PROJECT_LIST_VIEW_TYPE } from '@/app/view/types';

export { PROJECT_LIST_VIEW_TYPE };

/** Left sidebar view displaying projects and conversations list. */
export class ProjectListView extends ReactItemViewHost {
	protected readonly viewType = PROJECT_LIST_VIEW_TYPE;
	protected readonly displayText = 'Projects & Conversations';
	protected readonly icon: IconName = 'message-circle';
	protected readonly rootClasses = ['pktw-root'] as const;

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(
			ProjectListViewComponent,
			{ compact: true },
			this.appContext
		);
	}

	/**
	 * Update view when data changes externally. Preserves expanded state and
	 * active selections (data loading is handled inside the React component).
	 */
	async updateView(): Promise<void> {
		const renderer = this.getReactRenderer();
		if (!renderer) return;
		renderer.render(this.renderElement());
	}
}
