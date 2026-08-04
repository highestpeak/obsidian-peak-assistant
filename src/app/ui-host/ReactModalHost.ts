import { Modal as ObsidianModal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import type { AppContext } from '@/app/context/AppContext';

export interface ReactModalShellOptions {
	/** CSS classes added to `contentEl`. */
	contentClasses?: readonly string[];
	/** CSS classes added to the outer `modalEl` (Obsidian shell). */
	modalClasses?: readonly string[];
	/** Inline width applied to `modalEl.style.width` (e.g. `'380px'`). */
	width?: string;
	/** Inline max-width applied to `modalEl.style.maxWidth` (default `'90vw'`). */
	maxWidth?: string;
	/** Inline max-height applied to `modalEl.style.maxHeight`. */
	maxHeight?: string;
	/** When true (default) sets `padding: 0` on both `contentEl` and `modalEl`. */
	zeroPadding?: boolean;
}

/**
 * Base class for Peak's React-backed Obsidian Modals. Centralizes the
 * `ReactRenderer` lifecycle and the routine `modalEl` / `contentEl` shaping
 * each modal subclass used to write by hand (size, padding, peak-design-root
 * class soup, deferred unmount via setTimeout).
 *
 * Subclasses declare a `shell` config + a `renderElement()`; the host handles
 * the rest. Subclasses that need extra `modalEl` tagging / cleanup can
 * override `onOpen` / `onClose` and call `super`.
 */
export abstract class ReactModalHost extends ObsidianModal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(protected readonly appContext: AppContext) {
		super(appContext.app);
	}

	/** Modal chrome configuration (size / classes / padding). */
	protected abstract readonly shell: ReactModalShellOptions;

	/** React element to mount inside the modal content. */
	protected abstract renderElement(): React.ReactElement;

	onOpen(): void {
		const { contentEl, modalEl } = this;
		const opts = this.shell;
		contentEl.empty();
		// React modals are fully design-system owned. Keep both Obsidian layers in
		// the same token/reset scope: modalEl owns the outer chrome, while
		// contentEl remains the persistent React mount and style ancestor.
		modalEl.addClass('pktw-root', 'peak-design-root');
		contentEl.addClass('pktw-root', 'peak-design-root');
		for (const cls of opts.contentClasses ?? []) contentEl.addClass(cls);
		for (const cls of opts.modalClasses ?? []) modalEl.addClass(cls);
		if (opts.zeroPadding !== false) {
			contentEl.style.padding = '0';
			modalEl.style.padding = '0';
		}
		if (opts.width) modalEl.style.width = opts.width;
		modalEl.style.maxWidth = opts.maxWidth ?? '90vw';
		if (opts.maxHeight) modalEl.style.maxHeight = opts.maxHeight;

		// Rendering from containerEl makes ReactRenderer select modalEl (the
		// container's second child) and replace contentEl. That silently removes
		// every content class declared above and breaks scoped component geometry.
		this.reactRenderer = new ReactRenderer(contentEl);
		this.reactRenderer.render(this.renderElement());
	}

	onClose(): void {
		// Defer unmount so any concurrent React updates settle first, mirroring
		// the pattern modal subclasses used to write by hand.
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
