import { App, Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { ConfirmDialog } from './modals/ConfirmDialog';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

/**
 * Obsidian modal wrapper for confirm dialog React UI.
 */
export class ConfirmModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		app: App,
		private readonly appContext: AppContext,
		private readonly title: string,
		private readonly message: string,
		private readonly onConfirm: () => void,
		private readonly onCancel?: () => void,
		private readonly requireConfirmationText?: string,
	) {
		super(app);
		this.modalEl.addClass('peak-confirm-modal');
		// Set modal to be non-scrollable and properly positioned
		this.modalEl.style.overflow = 'hidden';
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.style.padding = '0';

		// Position modal appropriately
		modalEl.style.padding = '0';

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				ConfirmDialog,
				{
					open: true,
					onOpenChange: (open: boolean) => {
						if (!open) {
							this.close();
						}
					},
					title: this.title,
					message: this.message,
					onConfirm: this.onConfirm,
					onCancel: this.onCancel,
					requireConfirmationText: this.requireConfirmationText,
					cancelText: 'Cancel',
				},
				this.appContext
			)
		);
	}

	onClose(): void {
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.contentEl.empty();
	}
}