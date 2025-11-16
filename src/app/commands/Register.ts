
import type { ChatProjectMeta } from 'src/service/chat/types';
import { ViewManager } from '../view/ViewManager';
import { Command } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';

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
				const title = await viewManager.promptForInput('Enter conversation title');
				if (!title) return;
				await aiManager.createConversation({ title, project: null });
			},
		},
	];
}

