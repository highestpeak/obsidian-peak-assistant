import { CHAT_VIEW_TYPE } from 'src/ui/view/ChatView';
import { PROJECT_LIST_VIEW_TYPE } from 'src/ui/view/ProjectListView';
import { MESSAGE_HISTORY_VIEW_TYPE } from 'src/ui/view/MessageHistoryView';

export {
	CHAT_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	MESSAGE_HISTORY_VIEW_TYPE,
};

export const TRACKED_VIEW_TYPES = new Set<string>([
	CHAT_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	MESSAGE_HISTORY_VIEW_TYPE,
]);

