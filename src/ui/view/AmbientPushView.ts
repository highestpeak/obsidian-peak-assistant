import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';

export const AMBIENT_PUSH_VIEW_TYPE = 'peak-ambient-push-view';

/**
 * Right sidebar view displaying ambient push related-note suggestions.
 */
export class AmbientPushView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return AMBIENT_PUSH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Related Notes';
	}

	getIcon(): IconName {
		return 'zap';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-ambient-push-view');

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private render(): void {
		if (!this.reactRenderer) return;

		import('./ambient-push/AmbientPushPanel').then(({ AmbientPushPanel }) => {
			this.reactRenderer?.render(
				createReactElementWithServices(AmbientPushPanel, {}, this.appContext),
			);
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
}
