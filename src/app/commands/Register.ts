
import type { ChatProjectMeta } from '@/service/chat/types';
import { ViewManager } from '@/app/view/ViewManager';
import { Command, Modal } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';

/**
 * Registers core commands exposed via Obsidian command palette.
 */
export function buildCoreCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
	return [
		{
			id: 'peak-quick-search',
			name: 'Open Quick Search',
			callback: () => {
				const app = viewManager.getApp();
				const modal: Modal = new QuickSearchModal(app, aiManager);
				modal.open();
			},
		},
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
				useChatViewStore.getState().setPendingConversation({
					title: 'New Conversation',
					project: null,
				});
			},
		},
	];
}

