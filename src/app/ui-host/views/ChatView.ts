import { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { CHAT_VIEW_TYPE } from '@/app/ui-host/views/types';

export { CHAT_VIEW_TYPE };

export class ChatView extends ReactItemViewHost {
	protected readonly viewType = CHAT_VIEW_TYPE;
	protected readonly displayText = 'Peak Chat';
	protected readonly icon: IconName = 'message-circle';
	protected readonly rootClasses = [
		'peak-chat-view',
		'peak-design-root',
		'pktw-root',
	] as const;

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(ChatViewComponent, {}, this.appContext);
	}
}
