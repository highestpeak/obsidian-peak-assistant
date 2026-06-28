import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import { AppContext } from '@/app/context/AppContext';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';

/**
 * Obsidian Modal that renders the Morning Briefing React panel.
 * Displayed once on startup when briefing items are available.
 *
 * Must wrap the panel via `createReactElementWithServices` because
 * `BriefingCard` consumes `useServiceContext()` for `vaultNavigation`;
 * rendering a raw `<MorningBriefingPanel>` would crash with
 * "useServiceContext must be used within ServiceProvider".
 */
export class MorningBriefingModal extends Modal {
	private root: Root | null = null;

	constructor(app: App, private readonly appContext: AppContext) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-morning-briefing-modal');
		contentEl.addClass('pktw-root');

		// Set modal width
		this.modalEl.style.maxWidth = '520px';
		this.modalEl.style.width = '90vw';

		// Dynamic import to avoid circular dependencies
		const { MorningBriefingPanel } = await import('@/ui/view/morning-briefing/MorningBriefingPanel');

		this.root = createRoot(contentEl);
		this.root.render(
			createReactElementWithServices(
				MorningBriefingPanel,
				{ onDismiss: () => this.close() },
				this.appContext,
			),
		);
	}

	onClose(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.contentEl.empty();
		useMorningBriefingStore.getState().dismiss();
	}
}
