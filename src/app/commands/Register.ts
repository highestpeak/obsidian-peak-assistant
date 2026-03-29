
import { Notice } from 'obsidian';
import type { ChatProjectMeta } from '@/service/chat/types';
import { ViewManager } from '@/app/view/ViewManager';
import { Command, Modal } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';
import { SearchClient } from '@/service/search/SearchClient';
import type { MyPluginSettings, SearchSettings } from '@/app/settings/types';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import {
	IndexService,
	type MobiusGlobalMaintenanceBatchPhase,
	type MobiusGlobalMaintenanceProgress,
} from '@/service/search/index/indexService';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import { ConfirmModal } from '@/ui/view/ConfirmModal';
import { BuildUserProfileProgressModal } from '@/ui/view/BuildUserProfileProgressModal';
import { runBuildUserProfile } from '@/service/chat/context/BuildUserProfileRunner';
import { verifyDatabaseHealth } from '@/core/storage/sqlite/DatabaseHealthVerifier';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { HubDocService } from '@/service/search/index/helper/hub';
import { formatLlmEnrichmentProgressLine } from '@/service/search/support/llm-progress-format';

/**
 * Persistent bottom notice with updatable message (Obsidian 1.5+ `setMessage` when available).
 */
function openProgressNotice(initial: string): {
	setMessage: (text: string) => void;
	hide: () => void;
} {
	let n = new Notice(initial, 0);
	const setMessage = (text: string) => {
		const nn = n as Notice & { setMessage?: (m: string) => void };
		if (typeof nn.setMessage === 'function') {
			nn.setMessage(text);
		} else {
			n.hide();
			n = new Notice(text, 0);
		}
	};
	return {
		setMessage,
		hide: () => n.hide(),
	};
}

function truncatePathForNotice(path: string, maxLen = 48): string {
	return path.length > maxLen ? `${path.slice(0, Math.max(0, maxLen - 1))}…` : path;
}

/**
 * Quick Search palette entry.
 */
function buildQuickSearchCommands(viewManager: ViewManager): Command[] {
	return [
		{
			id: 'peak-quick-search',
			name: 'Open Quick Search',
			callback: () => {
				const modal: Modal = new QuickSearchModal(viewManager.appContext);
				modal.open();
			},
		},
	];
}

/**
 * Chat view and conversation commands.
 */
function buildChatCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
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
				useChatViewStore.getState().setPendingConversation({
					title: DEFAULT_NEW_CONVERSATION_TITLE,
					project: null,
				});
			},
		},
	];
}

type SearchIndexCommandsDeps = {
	viewManager: ViewManager;
	searchClient: SearchClient | null;
	indexInitializer: IndexInitializer;
	searchSettings?: SearchSettings;
};

/**
 * Search index pipeline: FTS, vectors, LLM pending enrichment, global maintenance, full pipeline,
 * manual Hub stub generation (writes Hub-*.md and indexes), cancel/delete.
 */
function buildSearchIndexCommands(deps: SearchIndexCommandsDeps): Command[] {
	const { viewManager, searchClient, indexInitializer, searchSettings } = deps;

	return [
		{
			id: 'peak-search-index',
			name: 'Search: fast index documents (FTS)',
			callback: async () => {
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
					await indexInitializer.performFastCoreIncrementalIndexing();
				} else {
					await indexInitializer.performFastCoreFullIndexing(true);
				}
			},
		},
		{
			id: 'peak-search-vector-enrich-pending',
			name: 'Search: build document vectors (pending)',
			callback: async () => {
				if (!searchSettings) {
					new Notice('Search settings are not available. Please restart the plugin.', 5000);
					return;
				}
				const ui = openProgressNotice('Search: preparing vector enrichment…');
				try {
					const { processed, errors, skippedWrongTenant } =
						await IndexService.runPendingVectorIndexEnrichment(searchSettings, {
							onProgress: ({ processed: done, total, path }) => {
								const short = truncatePathForNotice(path);
								ui.setMessage(`Search: vectors ${done}/${total}\n${short}`);
							},
						});
					ui.hide();
					const errText = errors.length > 0 ? ` Errors: ${errors.length} (see console).` : '';
					new Notice(
						`Vector enrichment: processed ${processed} document(s).${skippedWrongTenant ? ` Skipped ${skippedWrongTenant} path(s) (tenant mismatch).` : ''}${errText}`,
						errors.length ? 10000 : 6000,
					);
					if (errors.length) {
						console.error('[peak-search-vector-enrich-pending]', errors);
					}
				} catch (e) {
					ui.hide();
					console.error('[peak-search-vector-enrich-pending]', e);
					new Notice(`Vector enrichment failed: ${(e as Error).message}`, 8000);
				}
			},
		},
		{
			id: 'peak-search-llm-enrich-pending',
			name: 'Search: run LLM enrichment (pending)',
			callback: async () => {
				if (!searchSettings) {
					new Notice('Search settings are not available. Please restart the plugin.', 5000);
					return;
				}
				const ui = openProgressNotice('Search: preparing LLM enrichment…');
				try {
					const { processed, errors, skippedWrongTenant } =
						await IndexService.runPendingLlmIndexEnrichment(searchSettings, {
							onProgress: (ev) => {
								const short = truncatePathForNotice(ev.path);
								ui.setMessage(
									`Search: LLM ${ev.processed}/${ev.total}\n${formatLlmEnrichmentProgressLine(ev)}\n${short}`,
								);
							},
						});
					ui.hide();
					const errText = errors.length > 0 ? ` Errors: ${errors.length} (see console).` : '';
					new Notice(
						`LLM enrichment: processed ${processed} document(s).${skippedWrongTenant ? ` Skipped ${skippedWrongTenant} path(s) (tenant mismatch).` : ''}${errText}`,
						errors.length ? 10000 : 6000,
					);
					if (errors.length) {
						console.error('[peak-search-llm-enrich-pending]', errors);
					}
				} catch (e) {
					ui.hide();
					console.error('[peak-search-llm-enrich-pending]', e);
					new Notice(`LLM enrichment failed: ${(e as Error).message}`, 8000);
				}
			},
		},
		{
			id: 'peak-search-global-maintenance',
			name: 'Search: run global maintenance',
			callback: async () => {
				let activeNotice = new Notice('Search: starting global maintenance…', 0);
				const setProgressText = (text: string) => {
					const n = activeNotice as Notice & { setMessage?: (m: string) => void };
					if (typeof n.setMessage === 'function') {
						n.setMessage(text);
					} else {
						activeNotice.hide();
						activeNotice = new Notice(text, 0);
					}
				};
				const phaseLabel = (phase: MobiusGlobalMaintenanceBatchPhase): string => {
					if (phase === 'tag_doc_count') return 'tag ↔ doc counts';
					if (phase === 'document_degrees') return 'document degrees';
					if (phase === 'pagerank_edges') return 'PageRank · reference edges';
					if (phase === 'pagerank_persist') return 'PageRank · writing scores';
					if (phase === 'semantic_pagerank_edges') return 'Semantic PageRank · edges';
					if (phase === 'semantic_pagerank_persist') return 'Semantic PageRank · writing scores';
					if (phase === 'folder_hub_stats') return 'folder hub stats';
					return 'Semantic PageRank · writing scores';
				};
				try {
					await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
						onProgress: (ev: MobiusGlobalMaintenanceProgress) => {
							if (ev.phase === 'semantic_related') {
								setProgressText(
									`Search: ${ev.tenant} · semantic edges · ${ev.processed}/${ev.total} docs`,
								);
								return;
							}
							if (ev.phase === 'hub_discovery') {
								setProgressText(
									`Search: ${ev.tenant} · hub discovery · ${ev.idsInBatch} candidates`,
								);
								return;
							}
							if (ev.phase === 'hub_materialize') {
								setProgressText(
									`Search: ${ev.tenant} · hub docs · ${ev.batchIndex}/${ev.idsInBatch}`,
								);
								return;
							}
							if (ev.phase === 'hub_index') {
								setProgressText(`Search: ${ev.tenant} · hub reindex · ${ev.idsInBatch} files`);
								return;
							}
							setProgressText(
								`Search: ${ev.tenant} · ${phaseLabel(ev.phase)} · batch ${ev.batchIndex ?? 0} · ${ev.idsInBatch ?? 0} items`,
							);
						},
					});
					activeNotice.hide();
					new Notice('Search: global maintenance completed.', 3000);
				} catch (e) {
					activeNotice.hide();
					console.error('[Register] peak-search-global-maintenance failed:', e);
					new Notice('Search: global maintenance failed. See console.', 5000);
				}
			},
		},
		{
			id: 'peak-search-staged-full-pipeline',
			name: 'Search: full pipeline (FTS → vector → LLM → maintenance)',
			callback: async () => {
				if (!searchClient) {
					new Notice('Search service is not available. Please restart the plugin.', 5000);
					return;
				}
				if (!searchSettings) {
					new Notice('Search settings are not available. Please restart the plugin.', 5000);
					return;
				}
				try {
					await indexInitializer.performStagedFullIndexing(true);
				} catch (e) {
					console.error('[peak-search-staged-full-pipeline]', e);
					new Notice(`Pipeline failed: ${(e as Error).message}`, 8000);
				}
			},
		},
		{
			id: 'peak-hub-generate-stub-summaries',
			name: 'Search: generate / refresh Hub summaries (top candidates)',
			callback: async () => {
				if (!searchSettings) {
					new Notice('Search settings are not available. Please restart the plugin.', 5000);
					return;
				}
				try {
					const svc = new HubDocService(() => searchSettings);
					const { written } = await svc.generateAndIndexHubDocsForMaintenance();
					new Notice(
						`Hub: wrote or updated ${written.length} auto Hub-*.md file(s). Manual hubs under Hub-Summaries/Manual/ are only re-indexed, not overwritten.`,
						7000,
					);
				} catch (e) {
					console.error('[peak-hub-generate-stub-summaries]', e);
					new Notice(`Hub generation failed: ${(e as Error).message}`, 8000);
				}
			},
		},
		{
			id: 'peak-cancel-index',
			name: 'Search: cancel indexing',
			callback: () => {
				IndexService.cancelIndexing();
				new Notice('Index operation cancelled.', 3000);
			},
		},
		{
			id: 'peak-delete-index-data',
			name: 'Search: delete index data',
			callback: async () => {
				const indexStatus = await IndexService.getInstance().getIndexStatus();
				const hasIndex =
					indexStatus.isReady && indexStatus.indexedDocs !== null && indexStatus.indexedDocs > 0;

				if (!hasIndex) {
					new Notice('No index data found to delete.', 3000);
					return;
				}

				const modal = new ConfirmModal(
					viewManager.getApp(),
					viewManager.appContext,
					'Delete index data',
					`Are you sure you want to delete all index data? This will remove ${indexStatus.indexedDocs} indexed documents and cannot be undone.`,
					async () => {
						try {
							await IndexService.getInstance().clearAllIndexData();
							new Notice('Index data deleted successfully.', 3000);
						} catch (error) {
							console.error('[Register] Error deleting index data:', error);
							new Notice('Failed to delete index data. Please check the console for details.', 5000);
						}
					},
					undefined,
					'Love u CPU',
				);
				modal.open();
			},
		},
	];
}

type SystemCommandsDeps = {
	settings: MyPluginSettings;
	viewManager: ViewManager;
	aiManager: AIServiceManager;
};

/**
 * Database health, user profile, and vault/DB cleanup commands.
 */
function buildSystemCommands(deps: SystemCommandsDeps): Command[] {
	const { settings, viewManager, aiManager } = deps;

	return [
		{
			id: 'peak-database-verify',
			name: 'Verify Database Health',
			callback: async () => {
				await verifyDatabaseHealth(viewManager.getApp(), settings);
			},
		},
		{
			id: 'peak-build-user-profile',
			name: 'Build User Profile',
			callback: async () => {
				if (!settings.ai?.profileEnabled) {
					new Notice('User profile is disabled. Enable it in settings.', 4000);
					return;
				}
				const profileService = aiManager.getProfileService();
				if (!profileService) {
					new Notice('User profile is disabled or path not set.', 4000);
					return;
				}
				const app = viewManager.getApp();
				const controller = new AbortController();
				const modal = new BuildUserProfileProgressModal(app, () => controller.abort());
				modal.open();
				const onNotice = (msg: string) => {
					new Notice(msg, 3000);
					modal.setProgress(msg);
				};
				try {
					const processedHashRepo = sqliteStoreManager.isInitialized()
						? sqliteStoreManager.getUserProfileProcessedHashRepo()
						: undefined;
					await runBuildUserProfile({
						app,
						profileService,
						aiServiceManager: aiManager,
						abortSignal: controller.signal,
						onNotice,
						processedHashRepo,
					});
				} catch (error) {
					console.error('[Register] Build user profile error:', error);
					onNotice('Build user profile failed. See console for details.');
				} finally {
					modal.close();
				}
			},
		},
		{
			id: 'peak-clear-user-profile-build-record',
			name: 'Clear User Profile Build Record',
			callback: async () => {
				if (!sqliteStoreManager.isInitialized()) {
					new Notice('Database not ready. Index search first or restart the plugin.', 4000);
					return;
				}
				try {
					await sqliteStoreManager.getUserProfileProcessedHashRepo().clearAll();
					new Notice('User profile build record cleared. Next build will re-scan all documents.', 4000);
				} catch (error) {
					console.error('[Register] Clear user profile build record error:', error);
					new Notice('Failed to clear build record. See console for details.', 4000);
				}
			},
		},
		{
			id: 'peak-cleanup-useless-data',
			name: 'Cleanup Useless Data',
			callback: async () => {
				const app = viewManager.getApp();
				try {
					new Notice('Starting cleanup of useless data...', 2000);

					const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
					const indexedPaths = await indexedDocumentRepo.getAllIndexedPaths();
					const vaultPathSet = new Set(app.vault.getFiles().map((f) => f.path));
					const orphanPaths = Array.from(indexedPaths.keys()).filter((p) => !vaultPathSet.has(p));
					if (orphanPaths.length > 0) {
						await IndexService.getInstance().deleteDocuments(orphanPaths);
						new Notice(`Search index: removed ${orphanPaths.length} orphaned document(s).`, 4000);
					} else {
						new Notice('Search index: no orphaned documents found.', 3000);
					}

					const orphanResult = await IndexService.getInstance().cleanupOrphanedSearchIndexData();
					const orphanTotal =
						orphanResult.metaFts +
						orphanResult.fts +
						orphanResult.chunks +
						orphanResult.embeddings +
						orphanResult.stats +
						orphanResult.graphNodes;
					if (orphanTotal > 0) {
						new Notice(
							`Search index: cleaned ${orphanTotal} orphan record(s) (meta FTS, FTS, chunks, embeddings, stats, Mobius document nodes).`,
							4000,
						);
					}

					const vecResult = await sqliteStoreManager.getEmbeddingRepo().cleanupOrphanedVecEmbeddings();
					if (vecResult.found === 0) {
						new Notice('Vector embeddings: no orphaned records.', 3000);
					} else {
						new Notice(`Vector embeddings: removed ${vecResult.deleted} orphaned record(s).`, 4000);
					}

					const convRepo = sqliteStoreManager.getChatConversationRepo();
					const messageRepo = sqliteStoreManager.getChatMessageRepo();
					const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
					const starRepo = sqliteStoreManager.getChatStarRepo();
					const allConvs = await convRepo.getAllWithFilePaths();
					const orphanConvIds: string[] = [];
					for (const c of allConvs) {
						const effectivePath = c.archived_rel_path ?? c.file_rel_path;
						if (!vaultPathSet.has(effectivePath)) {
							orphanConvIds.push(c.conversation_id);
						}
					}
					if (orphanConvIds.length > 0) {
						const messageIds: string[] = [];
						for (const convId of orphanConvIds) {
							const msgs = await messageRepo.listByConversation(convId);
							messageIds.push(...msgs.map((m) => m.message_id));
						}
						if (messageIds.length > 0) {
							await resourceRepo.deleteByMessageIds(messageIds);
						}
						await starRepo.deleteByConversationIds(orphanConvIds);
						await messageRepo.deleteByConversationIds(orphanConvIds);
						await convRepo.deleteByConversationIds(orphanConvIds);
						new Notice(`Chat: removed ${orphanConvIds.length} orphaned conversation(s).`, 4000);
					} else {
						new Notice('Chat: no orphaned conversations found.', 3000);
					}

					new Notice('Cleanup finished.', 3000);
				} catch (error) {
					console.error('[Register] Error during cleanup useless data:', error);
					new Notice('Cleanup failed. See console for details.', 5000);
				}
			},
		},
		// {
		// 	id: 'peak-reset-database',
		// 	name: 'Reset Database (Fix Lock Issues)',
		// 	callback: async () => {
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

/**
 * Registers core commands exposed via Obsidian command palette.
 */
export function buildCoreCommands(
	settings: MyPluginSettings,
	viewManager: ViewManager,
	aiManager: AIServiceManager,
	searchClient: SearchClient | null,
	indexInitializer: IndexInitializer,
	searchSettings?: SearchSettings,
	storageFolder?: string,
): Command[] {
	void storageFolder;
	return [
		...buildQuickSearchCommands(viewManager),
		...buildChatCommands(viewManager, aiManager),
		...buildSearchIndexCommands({
			viewManager,
			searchClient,
			indexInitializer,
			searchSettings,
		}),
		...buildSystemCommands({ settings, viewManager, aiManager }),
	];
}
