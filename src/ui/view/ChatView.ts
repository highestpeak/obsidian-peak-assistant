import { IconName, ItemView, TFolder, WorkspaceLeaf } from 'obsidian';
import { useChatViewStore } from './chat-view/store/chatViewStore';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { ChatViewComponent } from './chat-view/ChatViewComponent';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';

export const CHAT_VIEW_TYPE = 'peak-chat-view';

export class ChatView extends ItemView {
	// Views
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext
	) {
		super(leaf);
		// Note: messagesViewWrapperRef will be set when React component mounts
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Peak Chat';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-view');

		// Create React renderer
		this.reactRenderer = new ReactRenderer(this.containerEl);

		// Initial render - delay to ensure container is in DOM
		requestAnimationFrame(() => {
			this.render();
		});
	}

	async onClose(): Promise<void> {
		// Clean up React renderer
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}

		this.containerEl.empty();
	}

	private render(): void {
		if (!this.reactRenderer) return;

		const state = useChatViewStore.getState();
		const { viewMode } = state;

		if (!viewMode) return;

		// Use unified React component for all views with service context
		this.reactRenderer.render(
			createReactElementWithServices(
				ChatViewComponent,
				{ viewMode },
				this.appContext
			)
		);
	}


}
