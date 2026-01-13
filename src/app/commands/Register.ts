
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
import { ConfirmModal } from '@/ui/view/ConfirmModal';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

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
				if (hasIndex) {
					// Incremental indexing
					await indexInitializer.performIncrementalIndexing();
				} else {
					// Full indexing
					await indexInitializer.performFullIndexing(true);
				}
			},
		},
		{
			id: 'peak-delete-index-data',
			name: 'Delete Index Data',
			callback: async () => {
				// Check if index exists
				const indexStatus = await IndexService.getInstance().getIndexStatus();
				const hasIndex = indexStatus.isReady && indexStatus.indexedDocs !== null && indexStatus.indexedDocs > 0;

				if (!hasIndex) {
					new Notice('No index data found to delete.', 3000);
					return;
				}

				// Show confirmation dialog
				// We need to get appContext from somewhere. Let's pass it as a parameter or get it from viewManager
				// For now, let's assume we need to modify the function signature to include appContext
				const modal = new ConfirmModal(
					viewManager.getApp(),
					viewManager.appContext,
					'Delete Index Data',
					`Are you sure you want to delete all index data? This will remove ${indexStatus.indexedDocs} indexed documents and cannot be undone.`,
					async () => {
						try {
							// Clear all index data
							await IndexService.getInstance().clearAllIndexData();
							new Notice('Index data deleted successfully.', 3000);
						} catch (error) {
							console.error('[Register] Error deleting index data:', error);
							new Notice('Failed to delete index data. Please check the console for details.', 5000);
						}
					},
					undefined, // onCancel
					'Love u CPU', // requireConfirmationText
				);
				modal.open();
			},
		},
		{
			id: 'peak-cancel-index',
			name: 'Cancel Index',
			callback: () => {
				// Cancel ongoing indexing operations
				IndexService.cancelIndexing();
				new Notice('Index operation cancelled.', 3000);
			},
		},
		// {
		// 	id: 'peak-reset-database',
		// 	name: 'Reset Database (Fix Lock Issues)',
		// 	callback: async () => {
		// 		// Confirm with user
		// 		const confirmed = await new Promise<boolean>((resolve) => {
		// 			const modal = new ConfirmModal(
		// 				viewManager.app,
		// 				'Reset Database',
		// 				'This will close and reset the database connections. Use this if you encounter database lock issues. The database will be recreated on next use.',
		// 				() => resolve(true),
		// 				() => resolve(false)
		// 			);
		// 			modal.open();
		// 		});

		// 		if (confirmed) {
		// 			try {
		// 				// Reset the database
		// 				const { sqliteStoreManager } = await import('@/core/storage/sqlite/SqliteStoreManager');
		// 				sqliteStoreManager.reset();
		// 				new Notice('Database reset successfully. Please restart Obsidian to recreate the database.', 5000);
		// 			} catch (error) {
		// 				console.error('[Register] Error resetting database:', error);
		// 				new Notice('Failed to reset database. Please check the console for details.', 5000);
		// 			}
		// 		}
		// 	},
		// },

	];
}

