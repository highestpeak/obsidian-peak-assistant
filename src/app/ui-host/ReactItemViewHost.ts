import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import type { AppContext } from '@/app/context/AppContext';

/**
 * Base class for Peak's React-backed `ItemView` panes. Centralizes the
 * `ReactRenderer` + RAF-guarded mount/unmount lifecycle so subclasses only
 * declare what's truly view-specific (id / title / icon / root classes /
 * the React element to render).
 *
 * Subclass contract (only these need to change per view):
 *   - viewType / displayText / icon
 *   - rootClasses (CSS classes added to containerEl)
 *   - renderElement() — return the React element to mount
 */
export abstract class ReactItemViewHost extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		protected readonly appContext: AppContext
	) {
		super(leaf);
	}

	/** Stable view id (e.g. `CHAT_VIEW_TYPE`). */
	protected abstract readonly viewType: string;
	/** Tab title shown in the Obsidian workspace. */
	protected abstract readonly displayText: string;
	/** Lucide icon id used in the tab strip. */
	protected abstract readonly icon: IconName;
	/** CSS classes added to `containerEl` before mounting React. */
	protected abstract readonly rootClasses: readonly string[];

	/**
	 * Build the React element to render. Called inside `requestAnimationFrame`
	 * after the container is in the DOM. Subclasses typically delegate to
	 * `createReactElementWithServices(...)`.
	 */
	protected abstract renderElement(): React.ReactElement;

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.displayText;
	}

	getIcon(): IconName {
		return this.icon;
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		for (const cls of this.rootClasses) this.containerEl.addClass(cls);
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			if (!this.reactRenderer) return;
			this.reactRenderer.render(this.renderElement());
		});
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

	/** Subclasses that need post-mount logic (focus, scroll, etc.) can override. */
	protected getReactRenderer(): ReactRenderer | null {
		return this.reactRenderer;
	}
}
