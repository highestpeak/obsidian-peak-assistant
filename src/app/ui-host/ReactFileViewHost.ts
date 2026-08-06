import { FileView, IconName, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import type { AppContext } from '@/app/context/AppContext';

/**
 * React-backed host for views that are genuinely bound to a Vault file.
 *
 * This deliberately extends Obsidian's FileView rather than ItemView. The
 * distinction is host-visible: workspace.getActiveFile(), File Explorer's
 * auto-reveal, and "Reveal active file" all discover the active document
 * through the FileView contract.
 */
export abstract class ReactFileViewHost extends FileView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;
	private openRafWin: Window | null = null;
	private lastRenderDoc: Document | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		protected readonly appContext: AppContext,
	) {
		super(leaf);
		this.allowNoFile = true;
	}

	protected abstract readonly viewType: string;
	protected abstract readonly displayText: string;
	protected abstract readonly icon: IconName;
	protected abstract readonly rootClasses: readonly string[];

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

	onResize(): void {
		if (!this.reactRenderer) return;
		if (this.containerEl.ownerDocument === this.lastRenderDoc) return;
		this.renderReactTree();
	}

	protected getReactRenderer(): ReactRenderer | null {
		return this.reactRenderer;
	}

	private renderReactTree(): void {
		if (!this.reactRenderer) return;
		this.lastRenderDoc = this.containerEl.ownerDocument;
		this.reactRenderer.render(this.renderElement());
	}
}
