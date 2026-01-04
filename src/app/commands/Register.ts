
import { Notice } from 'obsidian';
import type { ChatProjectMeta } from '@/service/chat/types';
import { ViewManager } from '@/app/view/ViewManager';
import { Command, Modal } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';
import { SearchClient } from '@/service/search/SearchClient';
import type { SearchSettings } from '@/app/settings/types';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import { IndexService } from '@/service/search/index/indexService';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';

/**
 * Registers core commands exposed via Obsidian command palette.
 */
export function buildCoreCommands(
	viewManager: ViewManager,
	aiManager: AIServiceManager,
	searchClient: SearchClient | null,
	indexInitializer: IndexInitializer,
	searchSettings?: SearchSettings,
	storageFolder?: string,
): Command[] {
	return [
		{
			id: 'peak-quick-search',
			name: 'Open Quick Search',
			callback: () => {
				// Get AppContext from ViewManager
				const modal: Modal = new QuickSearchModal(viewManager.appContext);
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
					title: DEFAULT_NEW_CONVERSATION_TITLE,
					project: null,
				});
			},
		},
		{
			id: 'peak-search-index',
			name: 'Index Search',
			callback: async () => {
				// Check if search service is available
				if (!searchClient) {
					new Notice('Search service is not available. Please restart the plugin.', 5000);
					return;
				}
				if (!searchSettings) {
					new Notice('Search settings are not available. Please restart the plugin.', 5000);
					return;
				}

				const indexStatus = await IndexService.getInstance().getIndexStatus();
				const hasIndex = indexStatus.isReady && indexStatus.indexBuiltAt !== null;
				console.debug('[Register] Index status hasIndex:', hasIndex);
				// for testing only
				await indexInitializer.performFullIndexing(true);
				// after testing, comment out the above line and uncomment the below lines
				// if (hasIndex) {
				// 	// Incremental indexing
				// 	await indexInitializer.performIncrementalIndexing();
				// } else {
				// 	// Full indexing
				// 	await indexInitializer.performFullIndexing(true);
				// }
			},
		},
	];
}

