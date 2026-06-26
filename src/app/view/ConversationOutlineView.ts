import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { ConversationOutlinePanel } from '@/ui/view/conversation-outline-view/ConversationOutlineView';
import type { AppContext } from '@/app/context/AppContext';
import { CHAT_VIEW_TYPE, CONVERSATION_OUTLINE_VIEW_TYPE } from '@/app/view/types';

export { CONVERSATION_OUTLINE_VIEW_TYPE };

/**
 * ConversationOutlineView — right-sidebar ItemView hosting the 4-tab
 * Conversation Index (formerly mounted inside the chat shell's right slot).
 *
 * Replaces the retired MessageHistoryView leaf — same mount pattern, new
 * (PR-Chat-3) UI. The view auto-hides itself when no chat view is active
 * so the right sidebar doesn't waste space on document-only layouts.
 */
export class ConversationOutlineView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CONVERSATION_OUTLINE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Conversation Outline';
	}

	getIcon(): IconName {
		// `list-tree` reads semantically as the hierarchical
		// Topics → Artifacts → Messages index this view hosts. The previous
		// `panel-right` was a generic chrome icon (just a right-panel toggle
		// silhouette) and looked indistinguishable from Obsidian's own
		// sidebar-toggle in the same header strip.
		return 'list-tree';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-conversation-outline-view');
		this.containerEl.addClass('peak-design-root');
		this.containerEl.addClass('pktw-root');

		// Hide when no chat view is active — keeps right sidebar clean while
		// the user is editing a regular document.
		this.checkChatViewAndUpdateVisibility();
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkChatViewAndUpdateVisibility();
			})
		);

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private checkChatViewAndUpdateVisibility(): void {
		const hasChatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).length > 0;
		this.containerEl.style.display = hasChatView ? '' : 'none';
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
				ConversationOutlinePanel,
				{},
				this.appContext,
			),
		);
	}
}
