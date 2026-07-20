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
	private openRafWin: Window | null = null;
	/**
	 * The `Document` the React tree was last rendered into. Compared in
	 * `onResize()` to detect when Obsidian adopts this leaf into (or out of) a
	 * detached popout window — at which point we must re-render so the
	 * `ReactRenderer`'s doc-keyed subtree + portal container rebind to the new
	 * window. See `ReactRenderer.keyForDocument`.
	 */
	private lastRenderDoc: Document | null = null;

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
		// Schedule the mount in THIS container's window, not the global one.
		// A leaf can be created and immediately adopted into a popout, in which
		// case the global `requestAnimationFrame` belongs to the wrong window.
		const win = this.containerEl.ownerDocument.defaultView ?? window;
		this.openRafWin = win;
		this.openRafId = win.requestAnimationFrame(() => {
			this.openRafId = null;
			this.openRafWin = null;
			this.renderReactTree();
		});
	}

	async onClose(): Promise<void> {
		if (this.openRafId != null) {
			(this.openRafWin ?? window).cancelAnimationFrame(this.openRafId);
			this.openRafId = null;
			this.openRafWin = null;
		}
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.lastRenderDoc = null;
		this.containerEl.empty();
	}

	/**
	 * Obsidian calls `onResize()` after a leaf's size changes AND after it is
	 * adopted into / out of a detached popout window. We only care about the
	 * adoption case here: when the container's owning `Document` no longer
	 * matches the one we last rendered into, re-render so the `ReactRenderer`
	 * rebuilds the doc-keyed subtree (ResizeObserver, portal container, etc.)
	 * in the correct window. Pure size changes are a no-op — React's own
	 * observers handle those.
	 */
	onResize(): void {
		if (!this.reactRenderer) return;
		if (this.containerEl.ownerDocument === this.lastRenderDoc) return;
		this.renderReactTree();
	}

	private renderReactTree(): void {
		if (!this.reactRenderer) return;
		this.lastRenderDoc = this.containerEl.ownerDocument;
		this.reactRenderer.render(this.renderElement());
	}

	/** Subclasses that need post-mount logic (focus, scroll, etc.) can override. */
	protected getReactRenderer(): ReactRenderer | null {
		return this.reactRenderer;
	}
}
