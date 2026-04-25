import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { SettingsRoot } from './SettingsView';
import { AppContext } from '@/app/context/AppContext';

export class SettingsModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private readonly appContext: AppContext) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-settings-modal');
		contentEl.addClass('pktw-root');
		contentEl.style.padding = '0';

		modalEl.style.width = '860px';
		modalEl.style.maxWidth = '90vw';
		modalEl.style.maxHeight = 'calc(100vh - 120px)';
		modalEl.style.padding = '0';

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				SettingsRoot,
				{},
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => r.unmount(), 0);
		}
		this.contentEl.empty();
	}
}
