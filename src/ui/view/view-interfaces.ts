import { ParsedConversationFile, ParsedProjectFile, PendingConversation } from 'src/service/chat/types';

/**
 * Interface for ChatView public methods
 * Used for type-safe cross-view communication
 */
export interface IChatView {
	showMessagesForOneConvsation(
		conversation: ParsedConversationFile,
		project?: ParsedProjectFile | null
	): void;
	showProjectOverview(project: ParsedProjectFile): Promise<void>;
	showAllProjects(): Promise<void>;
	showAllConversations(): Promise<void>;
	scrollToMessage(messageId: string): void;
	setPendingConversation(pending: PendingConversation | null): void;
}

/**
 * Interface for ProjectListView public methods
 * Used for type-safe cross-view communication
 */
export interface IProjectListView {
	setActiveSelectionAndExpand(
		project: ParsedProjectFile | null,
		conversation: ParsedConversationFile | null
	): Promise<void>;
	refreshConversationList(conversation: ParsedConversationFile): Promise<void>;
	refreshProjectName(project: ParsedProjectFile): Promise<void>;
}

/**
 * Interface for MessageHistoryView public methods
 * Used for type-safe cross-view communication
 */
export interface IMessageHistoryView {
	setActiveConversation(conversation: ParsedConversationFile | null): void;
}

/**
 * Type guard to check if a view implements IChatView
 */
export function isChatView(view: any): view is IChatView {
	return (
		view &&
		typeof view.showMessagesForOneConvsation === 'function' &&
		typeof view.showProjectOverview === 'function' &&
		typeof view.showAllProjects === 'function' &&
		typeof view.showAllConversations === 'function' &&
		typeof view.scrollToMessage === 'function' &&
		typeof view.setPendingConversation === 'function'
	);
}

/**
 * Type guard to check if a view implements IProjectListView
 */
export function isProjectListView(view: any): view is IProjectListView {
	return (
		view &&
		typeof view.setActiveSelectionAndExpand === 'function' &&
		typeof view.refreshConversationList === 'function' &&
		typeof view.refreshProjectName === 'function'
	);
}

/**
 * Type guard to check if a view implements IMessageHistoryView
 */
export function isMessageHistoryView(view: any): view is IMessageHistoryView {
	return view && typeof view.setActiveConversation === 'function';
}

