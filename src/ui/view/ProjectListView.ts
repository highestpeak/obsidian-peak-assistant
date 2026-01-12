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

		// Create React renderer - containerEl structure: [header, content]
		// We render into the content area (children[1])
		this.reactRenderer = new ReactRenderer(this.containerEl);

		// Initial render - delay to ensure container is in DOM
		requestAnimationFrame(() => {
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


