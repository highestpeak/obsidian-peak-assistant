import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import { VAULT_XRAY_VIEW_TYPE } from '@/app/view/types';

export { VAULT_XRAY_VIEW_TYPE };

export class VaultXRayView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
		super(leaf);
	}

	getViewType(): string { return VAULT_XRAY_VIEW_TYPE; }
	getDisplayText(): string { return 'Vault X-Ray'; }
	getIcon(): IconName { return 'activity'; }

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-vault-xray-view');
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private render(): void {
		if (!this.reactRenderer) return;
		import('@/ui/view/vault-lint/VaultXRayPanel').then(({ VaultXRayPanel }) => {
			this.reactRenderer?.render(
				createReactElementWithServices(VaultXRayPanel, {}, this.appContext),
			);
		});
	}

	async onClose(): Promise<void> {
		if (this.openRafId != null) { cancelAnimationFrame(this.openRafId); this.openRafId = null; }
		this.reactRenderer?.unmount();
		this.reactRenderer = null;
		this.containerEl.empty();
	}
}
