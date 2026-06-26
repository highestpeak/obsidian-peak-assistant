import { Modal, type App } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { VaultReviewMode } from '@/service/copilot/vault/VaultReviewSession';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';
import { VaultAutoRunContent } from '@/ui/view/copilot/vault/VaultAutoRunContent';

export interface VaultAutoRunModalProps {
	mode?: VaultReviewMode;
	initialSnapshot?: VaultReviewSessionSnapshot;
}

export class VaultAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private appContext = AppContext.getInstance();

	constructor(app: App, private readonly options: VaultAutoRunModalProps = {}) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass('peak-vault-auto-run-modal');
		this.modalEl.addClass('peak-design-root');
		this.modalEl.style.width = 'min(1280px, 96vw)';
		this.modalEl.style.height = 'min(820px, 92vh)';
		this.modalEl.style.maxHeight = '92vh';
		this.contentEl.style.padding = '0';
		this.contentEl.style.height = '100%';
		this.contentEl.style.overflow = 'hidden';
		this.contentEl.addClass('pktw-root');

		const closeBtn = this.modalEl.querySelector<HTMLElement>('.modal-close-button');
		if (closeBtn) closeBtn.style.display = 'none';

		this.reactRenderer = new ReactRenderer(this.contentEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				VaultAutoRunContent,
				{
					mode: this.options.mode ?? 'complete',
					initialSnapshot: this.options.initialSnapshot,
					onClose: () => this.close(),
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
