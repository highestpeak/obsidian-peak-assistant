import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

export const VAULT_XRAY_VIEW_TYPE = 'peak-vault-xray-view';

export class VaultXRayView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly appContext: AppContext) {
		super(leaf);
	}

	getViewType(): string {
		return VAULT_XRAY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Vault X-Ray';
	}

	getIcon(): IconName {
		return 'activity';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-vault-xray');
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private render(): void {
		if (!this.reactRenderer) return;
		const { VaultXRayApp } = require('./VaultXRayApp');
		const element = createReactElementWithServices(VaultXRayApp, {}, this.appContext);
		this.reactRenderer.render(element);
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
