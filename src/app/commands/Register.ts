
import type { ChatProjectMeta } from 'src/service/chat/types';
import { ViewManager } from '../view/ViewManager';
import { Command } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { CHAT_VIEW_TYPE } from 'src/ui/view/ChatView';

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
				// Create conversation directly without prompt, using default title
				// Title will be auto-generated after first message exchange
				await aiManager.createConversation({ title: 'New Conversation', project: null });
				// Focus input after creating new conversation
				const chatViews = viewManager.getApp().workspace.getLeavesOfType(CHAT_VIEW_TYPE);
				chatViews.forEach(leaf => {
					const view = leaf.view as any;
					if (view && typeof view.focusInput === 'function') {
						view.focusInput();
					}
				});
			},
		},
	];
}

