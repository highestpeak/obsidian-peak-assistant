import { type IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/shell/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { ChatStudioPanel } from '@/ui/view/chat-studio-view/ChatStudioView';
import { CHAT_STUDIO_VIEW_TYPE } from '@/app/view/types';

export { CHAT_STUDIO_VIEW_TYPE };

/**
 * ChatStudioView — all-in-one three-column chat workspace. Hosts
 * ChatStudioPanel which renders ConversationList | ChatViewComponent
 * | ConversationIndex side by side in a single leaf. Opened in a detached
 * window via `workspace.getLeaf('window')` so the user can place it
 * alongside the main Obsidian window while writing.
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
