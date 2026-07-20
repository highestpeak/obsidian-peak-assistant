import { App, Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import { AppContext } from '@/app/context/AppContext';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';

/**
 * Obsidian Modal that renders the Morning Briefing React panel.
 * Displayed once on startup when briefing items are available.
 *
 * Must wrap the panel via `createReactElementWithServices` because
 * `BriefingCard` consumes `useServiceContext()` for `vaultNavigation`;
 * rendering a raw `<MorningBriefingPanel>` would crash with
 * "useServiceContext must be used within ServiceProvider".
 *
 * Rendered through `ReactRenderer` (not a bare `createRoot`) so the subtree is
 * wrapped in `PortalContainerProvider` — any Radix primitive inside the panel
 * then portals to the scoped, correct-window host instead of a bare `body`
 * (where `--pk-*` tokens fail to resolve and popout windows get the wrong
 * `document`). `ReactRenderer` also stamps `pktw-root` + `peak-design-root` on
 * the render target, preserving the previous root-class behaviour.
 */
export class MorningBriefingModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private readonly appContext: AppContext) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-morning-briefing-modal');

		// Set modal width
		this.modalEl.style.maxWidth = '520px';
		this.modalEl.style.width = '90vw';

		// Dynamic import to avoid circular dependencies
		const { MorningBriefingPanel } = await import('@/ui/view/morning-briefing/MorningBriefingPanel');

		this.reactRenderer = new ReactRenderer(contentEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				MorningBriefingPanel,
				{ onDismiss: () => this.close() },
				this.appContext,
			),
		);
	}

	onClose(): void {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.contentEl.empty();
		useMorningBriefingStore.getState().dismiss();
	}
}
