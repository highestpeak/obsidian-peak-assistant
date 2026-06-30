import { type IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { ConversationOutlinePanel } from '@/ui/view/conversation-outline-view/ConversationOutlineView';
import { CHAT_VIEW_TYPE, CONVERSATION_OUTLINE_VIEW_TYPE } from '@/app/ui-host/views/types';

export { CONVERSATION_OUTLINE_VIEW_TYPE };

/**
 * ConversationOutlineView — right-sidebar ItemView hosting the 4-tab
 * Conversation Index (formerly mounted inside the chat shell's right slot).
 * Auto-hides when no chat view is active so the right sidebar doesn't waste
 * space on document-only layouts.
 */
export class ConversationOutlineView extends ReactItemViewHost {
	protected readonly viewType = CONVERSATION_OUTLINE_VIEW_TYPE;
	protected readonly displayText = 'Conversation Outline';
	// `list-tree` reads semantically as the hierarchical Topics → Artifacts →
	// Messages index this view hosts (the previous `panel-right` looked
	// indistinguishable from Obsidian's own sidebar-toggle in the same strip).
	protected readonly icon: IconName = 'list-tree';
	protected readonly rootClasses = [
		'peak-conversation-outline-view',
		'peak-design-root',
		'pktw-root',
	] as const;

	async onOpen(): Promise<void> {
		// Hide when no chat view is active — keeps right sidebar clean while
		// the user is editing a regular document.
		this.checkChatViewAndUpdateVisibility();
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkChatViewAndUpdateVisibility();
			})
		);
		await super.onOpen();
	}

	private checkChatViewAndUpdateVisibility(): void {
		const hasChatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).length > 0;
		this.containerEl.style.display = hasChatView ? '' : 'none';
	}

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(ConversationOutlinePanel, {}, this.appContext);
	}
}
