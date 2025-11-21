
import type { ChatProjectMeta } from 'src/service/chat/types';
import { ViewManager } from '../view/ViewManager';
import { Command } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { CHAT_VIEW_TYPE } from 'src/ui/view/ChatView';
import { IChatView } from 'src/ui/view/view-interfaces';

/**
 * Registers core commands exposed via Obsidian command palette.
 */
export function buildCoreCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
	return [
		{
			id: 'peak-chat-open-view',
			name: 'Open Chat Mode Panel',
			callback: () => void viewManager.getViewSwitchConsistentHandler().activateChatView(),
		},
		{
			id: 'peak-chat-switch-to-chat-view',
			name: 'Switch to Chat View',
			callback: () => void viewManager.getViewSwitchConsistentHandler().activateChatView(),
		},
		{
			id: 'peak-chat-switch-to-document-view',
			name: 'Switch to Document View',
			callback: () => void viewManager.getViewSwitchConsistentHandler().activeDocumentView(),
		},
		{
			id: 'peak-chat-new-project',
			name: 'New Chat Project',
			callback: async () => {
				const name = await viewManager.promptForInput('Enter project name');
				if (!name) return;
				const meta: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'> = {
					name,
				};
				await aiManager.createProject(meta);
			},
		},
		{
			id: 'peak-chat-new-conversation',
			name: 'New Chat Conversation',
			callback: async () => {
				// Set pending conversation state instead of creating immediately
				// Actual creation will happen when user sends first message
				const chatViews = viewManager.getApp().workspace.getLeavesOfType(CHAT_VIEW_TYPE);
				chatViews.forEach(leaf => {
					const view = leaf.view as any;
					if (view && typeof view.setPendingConversation === 'function') {
						(view as unknown as IChatView).setPendingConversation({
							title: 'New Conversation',
							project: null,
						});
					}
				});
			},
		},
	];
}

