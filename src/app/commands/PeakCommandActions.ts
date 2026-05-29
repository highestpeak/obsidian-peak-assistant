import { Modal, normalizePath, Notice } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { AIServiceManager } from '@/service/chat/service-manager';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import type { ChatProjectMeta } from '@/service/chat/types';
import { openPendingConversationInChat } from '@/ui/view/chat-view/chatNavigation';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';
import { OnboardingModal } from '@/ui/view/modals/OnboardingModal';
import { HarnessOnboardingModal } from '@/ui/view/modals/HarnessOnboardingModal';
import { SettingsModal } from '@/ui/view/SettingsModal';
import { CopilotPickerModal } from '@/ui/view/copilot/CopilotPickerModal';
import { CopilotReviewHistoryModal } from '@/ui/view/copilot/CopilotReviewHistoryModal';
import { BatchTagModal } from '@/ui/view/copilot/BatchTagModal';
import { PromptTemplateModal } from '@/ui/view/prompt-template/PromptTemplateModal';
import { BuildUserProfileProgressModal } from '@/ui/view/BuildUserProfileProgressModal';
import { ConfirmModal } from '@/ui/view/ConfirmModal';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import {
	IndexService,
	type MobiusGlobalMaintenanceBatchPhase,
	type MobiusGlobalMaintenanceProgress,
} from '@/service/search/index/indexService';
import { BulkOperationCostEstimator } from '@/service/search/support/cost-estimator';
import { CostEstimationModal } from '@/ui/view/modals/CostEstimationModal';
import { IndexingProgressModal } from '@/ui/view/modals/IndexingProgressModal';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { verifyDatabaseHealth } from '@/core/storage/sqlite/DatabaseHealthVerifier';
import { runBuildUserProfile } from '@/service/chat/context/BuildUserProfileRunner';
import { AmbientPushService } from '@/service/ambient/AmbientPushService';
import { KnowledgeIntuitionAgent } from '@/service/agents/KnowledgeIntuitionAgent';
import { computeEvalMetrics, formatEvalReport } from '@/service/search/query/pprEvaluator';
import { runStructuralAnalysis } from '@/service/search/index/helper/structural/orchestrator';

/**
 * Persistent bottom notice with updatable message (Obsidian 1.5+ `setMessage` when available).
 */
export function openProgressNotice(initial: string): {
	setMessage: (text: string) => void;
	hide: () => void;
} {
	let n = new Notice(initial, 0);
	const setMessage = (text: string) => {
		const nn = n as Notice & { setMessage?: (m: string) => void };
		if (typeof nn.setMessage === 'function') {
			nn.setMessage(text);
			return;
		}
		n.hide();
		n = new Notice(text, 0);
	};
	return {
		setMessage,
		hide: () => n.hide(),
	};
}

function truncatePathForNotice(path: string, maxLen = 48): string {
	return path.length > maxLen ? `${path.slice(0, Math.max(0, maxLen - 3))}...` : path;
}

function getContext() {
	return AppContext.getInstance();
}

function getAIManager(): AIServiceManager {
	return getContext().manager;
}

function getIndexInitializer(): IndexInitializer {
	const ctx = getContext();
	if (ctx.plugin.indexInitializer) return ctx.plugin.indexInitializer;
	return new IndexInitializer(
		ctx.app,
		ctx.plugin.settings.search,
		ctx.plugin.settings.dataStorageFolder ?? '',
	);
}

export function openAssistant(): void {
	void getContext().viewManager.getViewSwitchConsistentHandler().activateChatView();
}

export function openQuickSearch(): void {
	const modal: Modal = new QuickSearchModal(getContext());
	modal.open();
}

export async function createChatProject(): Promise<void> {
	const ctx = getContext();
	const name = await ctx.viewManager.promptForInput('Enter project name');
	if (!name) return;
	const meta: Omit<ChatProjectMeta, 'id' | 'createdAtTimestamp' | 'updatedAtTimestamp'> = {
		name,
	};
	await ctx.manager.proj.createProject(meta);
}

export function createChatConversation(): void {
	void openPendingConversationInChat({
		title: DEFAULT_NEW_CONVERSATION_TITLE,
		project: null,
	});
}

export function openSetupWizard(): void {
	new OnboardingModal(getContext()).open();
}

export function openHarnessSetupWizard(): void {
	const ctx = getContext();
	const harness = ctx.settings?.harnessSettings;
	const hasBindings = !!(harness?.localFastConfig || harness?.localDeepConfig || harness?.onlineConfig);
	new HarnessOnboardingModal(ctx, { isReRun: hasBindings }).open();
}

export function openSettingsModal(): void {
	new SettingsModal(getContext()).open();
}

export function openCopilotPanel(): void {
	new CopilotPickerModal(getContext()).open();
}

export function openCopilotReviewHistory(): void {
	new CopilotReviewHistoryModal(getContext().app).open();
}

export function openDocumentCopilotPanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'document' }).open();
}

export function openVaultIntelligencePanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'vault' }).open();
}

export function openManageSystemPanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'setting' }).open();
}

export function openBatchTagSuggestions(): void {
	new BatchTagModal(getContext()).open();
}

export function openPromptTemplates(): void {
	new PromptTemplateModal(getContext()).open();
}

export function openUsageDashboard(): void {
	void getContext().viewManager.activateUsageDashboardView();
}

export function openKnowledgeCenter(): void {
	void getContext().viewManager.activateKnowledgeCenterView();
}

export async function openRelatedNotes(): Promise<void> {
	await getContext().viewManager.activateAmbientPushView();
	AmbientPushService.getInstance().triggerManual();
}

export function refreshRelatedNotes(): void {
	AmbientPushService.getInstance().triggerManual();
}

export async function openVaultXRay(): Promise<void> {
	const { VaultLintService } = await import('@/service/lint/VaultLintService');
	const lintService = VaultLintService.getInstance();
	lintService.initRegistry();
	await getContext().viewManager.activateVaultXRayView();
}

export function openGapAnalysis(): void {
	void getContext().viewManager.activateGapAnalysisView();
}

export async function refreshHubSummaries(): Promise<void> {
	new Notice('Hub summary refresh started...');
	const { HubRegenService } = await import('@/service/search/index/helper/hub/hubRegenService');
	const result = await HubRegenService.getInstance().processQueueNow();
	new Notice(`Hub refresh complete: ${result.processed} regenerated, ${result.failed} failed`);
}

export async function recomputeGapAnalysis(): Promise<void> {
	const ui = openProgressNotice('Gap Analysis: recomputing structural analysis...');
	try {
		await runStructuralAnalysis({ forceFullRecompute: true });
		ui.hide();
		new Notice('Gap Analysis: structural analysis complete.', 4000);
	} catch (e) {
		ui.hide();
		console.error('[peak-recompute-gap-analysis]', e);
		new Notice(`Gap Analysis failed: ${(e as Error).message}`, 8000);
	}
}

export function openSkillPicker(): void {
	void import('@/ui/view/skills/SkillPickerModal').then(({ SkillPickerModal }) => {
		new SkillPickerModal(getContext()).open();
	});
}

export async function runSearchFastIndex(): Promise<void> {
	const ctx = getContext();
	if (!ctx.plugin.searchClient) {
		new Notice('Search service is not available. Please restart the plugin.', 5000);
		return;
	}
	if (!ctx.plugin.settings.search) {
		new Notice('Search settings are not available. Please restart the plugin.', 5000);
		return;
	}

	const indexStatus = await IndexService.getInstance().getIndexStatus();
	const hasIndex = indexStatus.isReady && indexStatus.indexBuiltAt !== null;
	if (hasIndex) {
		await getIndexInitializer().performFastCoreIncrementalIndexing();
		return;
	}
	await getIndexInitializer().performFastCoreFullIndexing(true);
}

export async function runFullIndexPipeline(): Promise<void> {
	const ctx = getContext();
	if (!ctx.plugin.searchClient) {
		new Notice('Search service is not available. Please restart the plugin.', 5000);
		return;
	}
	if (!ctx.plugin.settings.search) {
		new Notice('Search settings are not available. Please restart the plugin.', 5000);
		return;
	}
	try {
		await getIndexInitializer().performStagedFullIndexing(true);
	} catch (e) {
		console.error('[peak-search-staged-full-pipeline]', e);
		new Notice(`Pipeline failed: ${(e as Error).message}`, 8000);
	}
}

export async function runVectorEnrichmentPending(): Promise<void> {
	const searchSettings = getContext().plugin.settings.search;
	if (!searchSettings) {
		new Notice('Search settings are not available. Please restart the plugin.', 5000);
		return;
	}
	const ui = openProgressNotice('Search: preparing vector enrichment...');
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
		if (errors.length) console.error('[peak-search-vector-enrich-pending]', errors);
	} catch (e) {
		ui.hide();
		console.error('[peak-search-vector-enrich-pending]', e);
		new Notice(`Vector enrichment failed: ${(e as Error).message}`, 8000);
	}
}

export async function runLlmEnrichmentPending(): Promise<void> {
	const ctx = getContext();
	const searchSettings = ctx.plugin.settings.search;
	if (!searchSettings) {
		new Notice('Search settings are not available. Please restart the plugin.', 5000);
		return;
	}
	const estimator = new BulkOperationCostEstimator(searchSettings, getAIManager());
	const estimatePromise = estimator.estimatePendingLlmCost();

	const costModal = new CostEstimationModal(ctx, async (choice) => {
		if (choice === 'skip') {
			try {
				const { cleared } = await IndexService.clearPendingLlmFlags();
				new Notice(`LLM enrichment skipped. Cleared ${cleared} pending flag(s).`, 5000);
			} catch (e) {
				console.error('[peak-search-llm-enrich-pending] skip failed', e);
				new Notice(`Failed to clear pending flags: ${(e as Error).message}`, 8000);
			}
			return;
		}

		let progressModal: IndexingProgressModal | null = null;
		progressModal = new IndexingProgressModal(ctx, () => {
			new Notice('LLM enrichment cancelled.', 4000);
		});
		progressModal.open();

		try {
			const { processed, errors, skippedWrongTenant } =
				await IndexService.runPendingLlmIndexEnrichment(searchSettings, {
					onProgress: (ev) => {
						progressModal?.updateProgress(ev);
					},
					shouldContinue: () => !progressModal.isCancelled(),
				});
			progressModal.close();
			if (!progressModal.isCancelled()) {
				const errText = errors.length > 0 ? ` Errors: ${errors.length} (see console).` : '';
				new Notice(
					`LLM enrichment: processed ${processed} document(s).${skippedWrongTenant ? ` Skipped ${skippedWrongTenant} path(s) (tenant mismatch).` : ''}${errText}`,
					errors.length ? 10000 : 6000,
				);
				if (errors.length) console.error('[peak-search-llm-enrich-pending]', errors);
			}
		} catch (e) {
			progressModal.close();
			console.error('[peak-search-llm-enrich-pending]', e);
			new Notice(`LLM enrichment failed: ${(e as Error).message}`, 8000);
		}
	}, estimatePromise);
	costModal.open();
}

function phaseLabel(phase: MobiusGlobalMaintenanceBatchPhase): string {
	if (phase === 'tag_doc_count') return 'tag-doc counts';
	if (phase === 'document_degrees') return 'document degrees';
	if (phase === 'pagerank_edges') return 'PageRank reference edges';
	if (phase === 'pagerank_persist') return 'PageRank writing scores';
	if (phase === 'semantic_related') return 'semantic edges';
	if (phase === 'semantic_pagerank_edges') return 'Semantic PageRank edges';
	if (phase === 'semantic_pagerank_persist') return 'Semantic PageRank writing scores';
	if (phase === 'folder_hub_stats') return 'folder hub stats';
	return 'graph maintenance';
}

export async function runGlobalMaintenance(): Promise<void> {
	let activeNotice = new Notice('Search: starting global maintenance...', 0);
	const setProgressText = (text: string) => {
		const n = activeNotice as Notice & { setMessage?: (m: string) => void };
		if (typeof n.setMessage === 'function') {
			n.setMessage(text);
			return;
		}
		activeNotice.hide();
		activeNotice = new Notice(text, 0);
	};
	try {
		await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
			onProgress: (ev: MobiusGlobalMaintenanceProgress) => {
				setProgressText(`Search: ${ev.tenant} - ${phaseLabel(ev.phase)} - ${ev.progressTextSuffix}`);
			},
		});
		activeNotice.hide();
		new Notice('Search: global maintenance completed.', 3000);
	} catch (e) {
		activeNotice.hide();
		console.error('[Register] peak-search-global-maintenance failed:', e);
		new Notice('Search: global maintenance failed. See console.', 5000);
	}
}

export async function analyzeVaultIntuition(): Promise<void> {
	if (!sqliteStoreManager.isInitialized()) {
		new Notice('Database not ready. Run index first or restart the plugin.', 5000);
		return;
	}
	const ctx = getContext();
	const ui = openProgressNotice('Search: analyzing vault knowledge intuition...');
	try {
		const agent = new KnowledgeIntuitionAgent(getAIManager());
		for await (const _ev of agent.streamRun({}, async (result) => {
			const stateRepo = sqliteStoreManager.getIndexStateRepo();
			await stateRepo.set('knowledge_intuition_json', JSON.stringify(result.json));
			try {
				const pluginId = ctx.plugin.manifest.id;
				const exportPath = normalizePath(
					`${ctx.app.vault.configDir}/plugins/${pluginId}/data/vault-intuition.json`,
				);
				const exportDir = exportPath.substring(0, exportPath.lastIndexOf('/'));
				if (!(await ctx.app.vault.adapter.exists(exportDir))) {
					await ctx.app.vault.adapter.mkdir(exportDir);
				}
				await ctx.app.vault.adapter.write(exportPath, JSON.stringify(result.json, null, 2));
			} catch (exportErr) {
				console.warn('[peak-analyze-vault-intuition] Failed to export intuition map to vault file:', exportErr);
			}
		})) {
			// consume stream
		}
		ui.hide();
		new Notice('Vault intuition map updated.', 4000);
	} catch (e) {
		ui.hide();
		console.error('[peak-analyze-vault-intuition]', e);
		new Notice(`Vault intuition failed: ${(e as Error).message}`, 8000);
	}
}

export function cancelIndexing(): void {
	IndexService.cancelIndexing();
	new Notice('Index operation cancelled.', 3000);
}

export async function deleteIndexData(): Promise<void> {
	const ctx = getContext();
	const indexStatus = await IndexService.getInstance().getIndexStatus();
	const hasIndex =
		indexStatus.isReady && indexStatus.indexedDocs !== null && indexStatus.indexedDocs > 0;

	if (!hasIndex) {
		new Notice('No index data found to delete.', 3000);
		return;
	}

	const modal = new ConfirmModal(
		ctx.app,
		ctx,
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
}

export async function verifyDatabaseHealthAction(): Promise<void> {
	const ctx = getContext();
	await verifyDatabaseHealth(ctx.app, ctx.plugin.settings);
}

export async function buildUserProfileAction(): Promise<void> {
	const ctx = getContext();
	const settings = ctx.plugin.settings;
	if (!settings.ai?.profileEnabled) {
		new Notice('User profile is disabled. Enable it in settings.', 4000);
		return;
	}
	const profileService = ctx.manager.getProfileService();
	if (!profileService) {
		new Notice('User profile is disabled or path not set.', 4000);
		return;
	}
	const controller = new AbortController();
	const modal = new BuildUserProfileProgressModal(ctx.app, () => controller.abort());
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
			app: ctx.app,
			profileService,
			aiServiceManager: ctx.manager,
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
}

export async function clearUserProfileBuildRecord(): Promise<void> {
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
}

export async function cleanupUselessData(): Promise<void> {
	const ctx = getContext();
	try {
		new Notice('Starting cleanup of useless data...', 2000);

		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const indexedPaths = await indexedDocumentRepo.getAllIndexedPaths();
		const vaultPathSet = new Set(ctx.app.vault.getFiles().map((f) => f.path));
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
			orphanResult.graphNodes;
		if (orphanTotal > 0) {
			new Notice(
				`Search index: cleaned ${orphanTotal} orphan record(s) (meta FTS, FTS, chunks, embeddings, Mobius document nodes).`,
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
}

export async function compareSearchResults(): Promise<void> {
	const ctx = getContext();
	const query = await ctx.viewManager.promptForInput('Enter search query for PPR comparison');
	if (!query) return;

	const searchClient = ctx.searchClient;
	const t0 = Date.now();
	const baseline = await searchClient.search(
		{ text: query, scopeMode: 'vault', enablePPR: false },
	);
	const baselineMs = Date.now() - t0;

	const t1 = Date.now();
	const pprResult = await searchClient.search(
		{ text: query, scopeMode: 'vault', enablePPR: true },
	);
	const pprMs = Date.now() - t1;

	const metrics = computeEvalMetrics(
		query,
		baseline.items.map(i => i.path),
		pprResult.items.map(i => i.path),
		baselineMs,
		pprMs,
	);

	const report = formatEvalReport(metrics);
	console.log(report);
	new Notice(
		`PPR eval: ${metrics.pprOnlyPaths.length} graph-discovered, displacement=${metrics.rankDisplacement}`,
		8000,
	);
}
