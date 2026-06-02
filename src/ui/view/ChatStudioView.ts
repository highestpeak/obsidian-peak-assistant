import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { ChatStudioPanel } from './chat-studio-view/ChatStudioView';
import type { AppContext } from '@/app/context/AppContext';
import { CHAT_STUDIO_VIEW_TYPE } from '@/app/view/types';

export { CHAT_STUDIO_VIEW_TYPE };

/**
 * ChatStudioView — all-in-one three-column chat workspace.
 *
 * Hosts ChatStudioPanel which renders ConversationList | ChatViewComponent
 * | ConversationIndex side by side in a single leaf. Designed to be opened
 * in a detached window via workspace.getLeaf('window') so the user can
 * place it alongside the main Obsidian window while writing.
 */
export class ChatStudioView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CHAT_STUDIO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Chat Studio';
	}

	getIcon(): IconName {
		return 'layout-grid';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-studio-view');
		this.containerEl.addClass('peak-design-root');
		this.containerEl.addClass('pktw-root');

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
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

	private render(): void {
		if (!this.reactRenderer) return;
		this.reactRenderer.render(
			createReactElementWithServices(
				ChatStudioPanel,
				{},
				this.appContext,
			),
		);
	}
}
