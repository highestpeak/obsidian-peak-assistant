import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { ProjectListViewComponent } from './project-list-view/ProjectListView';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';

/**
 * Left sidebar view displaying projects and conversations list
 */
export class ProjectListView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext
	) {
		super(leaf);
	}

	getViewType(): string {
		return PROJECT_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Projects & Conversations';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private render(): void {
		if (!this.reactRenderer) return;

		this.reactRenderer.render(
			createReactElementWithServices(
				ProjectListViewComponent,
				{},
				this.appContext
			)
		);
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


	/**
	 * Update view when data changes externally
	 * Preserves expanded state and active selections
	 */
	async updateView(): Promise<void> {
		// Just re-render React component, data loading is handled by React component
		this.render();
	}

}


