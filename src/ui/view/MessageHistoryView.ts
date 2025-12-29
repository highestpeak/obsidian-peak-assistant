import { IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { MessageHistoryViewComponent } from './message-history-view/MessageHistoryView';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';

export const MESSAGE_HISTORY_VIEW_TYPE = 'peak-message-history-view';

/**
 * Right sidebar view displaying conversation message history for quick navigation
 */
export class MessageHistoryView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
	}

	getViewType(): string {
		return MESSAGE_HISTORY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Message History';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-message-history-view');
		
		// Check if chat view exists, if not, hide this view
		this.checkChatViewAndUpdateVisibility();
		// Listen for workspace changes to update visibility
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkChatViewAndUpdateVisibility();
			})
		);

		// Create React renderer - containerEl structure: [header, content]
		// We render into the content area (children[1])
		this.reactRenderer = new ReactRenderer(this.containerEl);
		// Initial render - delay to ensure container is in DOM
		requestAnimationFrame(() => {
			this.render();
		});
	}

	private checkChatViewAndUpdateVisibility(): void {
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		const hasChatView = chatViews.length > 0;
		
		// Hide the view if no chat view exists
		if (!hasChatView) {
			this.containerEl.style.display = 'none';
		} else {
			this.containerEl.style.display = '';
		}
	}

	async onClose(): Promise<void> {
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
				MessageHistoryViewComponent,
				{},
				this.app,
				this.manager
			)
		);
	}
}

