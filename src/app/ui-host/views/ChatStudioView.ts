import { type IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { ChatStudioPanel } from '@/ui/view/chat-studio-view/ChatStudioView';
import { CHAT_STUDIO_VIEW_TYPE } from '@/app/ui-host/views/types';

export { CHAT_STUDIO_VIEW_TYPE };

/**
 * ChatStudioView — all-in-one three-column chat workspace. Hosts
 * ChatStudioPanel which renders ConversationList | ChatViewComponent
 * | ConversationIndex side by side in a single leaf.
 *
 * Opened as a main-area tab and then moved to its own window via
 * `workspace.moveLeafToPopout` (see `ViewManager.openChatStudio`), which
 * re-uses Obsidian's native popout migration rather than `getLeaf('window')`.
 * The leaf is DOM-adopted into the popout document without rebuilding the
 * view; `ReactItemViewHost.onResize` detects the document change and
 * re-renders so ResizeObserver / Radix portals rebind to the popout window.
 */
export class ChatStudioView extends ReactItemViewHost {
	protected readonly viewType = CHAT_STUDIO_VIEW_TYPE;
	protected readonly displayText = 'Chat Studio';
	protected readonly icon: IconName = 'layout-grid';
	protected readonly rootClasses = [
		'peak-chat-studio-view',
		'peak-design-root',
		'pktw-root',
	] as const;

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(ChatStudioPanel, {}, this.appContext);
	}
}
