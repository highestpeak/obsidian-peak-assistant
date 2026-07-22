import { Modal, normalizePath, Notice } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { AIServiceManager } from '@/service/chat/service-manager';
import { QuickSearchModal } from '@/app/ui-host/modals/QuickSearchModal';
import { HarnessOnboardingModal } from '@/app/ui-host/modals/HarnessOnboardingModal';
import { SettingsModal } from '@/app/ui-host/modals/SettingsModal';
import { CopilotPickerModal } from '@/app/copilot/modals/CopilotPickerModal';
import { CopilotReviewHistoryModal } from '@/app/copilot/modals/CopilotReviewHistoryModal';
import { BuildUserProfileProgressModal } from '@/app/ui-host/modals/BuildUserProfileProgressModal';
import { ConfirmModal } from '@/app/ui-host/modals/ConfirmModal';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import {
	IndexService,
	type MobiusGlobalMaintenanceBatchPhase,
	type MobiusGlobalMaintenanceProgress,
} from '@/service/search/index/indexService';
import { BulkOperationCostEstimator } from '@/service/search/support/cost-estimator';
import { CostEstimationModal } from '@/app/ui-host/modals/CostEstimationModal';
import { IndexingProgressModal } from '@/app/ui-host/modals/IndexingProgressModal';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { verifyDatabaseHealth } from '@/core/storage/sqlite/DatabaseHealthVerifier';
import { runBuildUserProfile } from '@/service/chat/context/BuildUserProfileRunner';
import { KnowledgeIntuitionAgent } from '@/service/agents/KnowledgeIntuitionAgent';
import { composeBackboneEnv } from '@/app/search/composeBackboneEnv';
import { computeEvalMetrics, formatEvalReport } from '@/service/search/query/pprEvaluator';
import { runStructuralAnalysis } from '@/service/search/index/helper/structural/orchestrator';
import { MaintenanceCleanupService } from '@/service/maintenance/MaintenanceCleanupService';
import { obsidianNotifier } from '@/app/platform/NoticeNotifier';

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
		ctx.progressReporter,
		AppContext.getIndexService(),
	);
}

export function openAssistant(): void {
	void getContext().viewManager.getViewSwitchConsistentHandler().activateChatView();
}

export function openQuickSearch(): void {
	const modal: Modal = new QuickSearchModal(getContext());
	modal.open();
}

export function openHarnessSetupWizard(): void {
	const ctx = getContext();
	const harness = ctx.settings?.harnessSettings;
	const hasBindings = !!(harness?.localFastConfig || harness?.localDeepConfig || harness?.onlineConfig);
	new HarnessOnboardingModal(ctx, { isReRun: hasBindings }).open();
}

export function openSettingsModal(initialTab?: import('@/ui/view/settings/types').TabId): void {
	new SettingsModal(getContext(), initialTab).open();
}

export function openCopilotPanel(): void {
	new CopilotPickerModal(getContext()).open();
}

export function openCopilotReviewHistory(): void {
	new CopilotReviewHistoryModal(getContext().app).open();
}

export function openUsageDashboard(): void {
	void getContext().viewManager.activateUsageDashboardView();
}

export function openChatStudio(): void {
	void getContext().viewManager.openChatStudio();
}

export function openRelatedNotes(): void {
	void getContext().viewManager.activateRelatedNotesView();
}

/**
 * Open File Atlas — an ordered, block-level map of the current document.
 * File Atlas lives inside the existing CopilotPicker modal as its Atlas tab
 * (it replaced the old heading-filter view there), so this command opens the
 * picker with the Atlas tab active.
 * Design: docs/superpowers/specs/2026-07-08-file-atlas-design.md
 */
export function openFileAtlas(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'atlas' }).open();
}

export async function refreshHubSummaries(): Promise<void> {
	new Notice('Hub summary refresh started...');
	const { HubRegenService } = await import('@/service/search/index/helper/hub/hubRegenService');
	const result = await HubRegenService.getInstance().processQueueNow();
	new Notice(`Hub refresh complete: ${result.processed} regenerated, ${result.failed} failed`);
}

export async function curateHubsNow(): Promise<void> {
	const ctx = getContext();
	const scheduler = ctx.runtimeRegistry.tryGetHubCurationScheduler();
	if (!scheduler) {
		new Notice('Hub Curation runtime is not ready. Try again after plugin boot completes.');
		return;
	}
	const ui = openProgressNotice('Hub Curator: running plan iterations...');
	try {
		const result = await scheduler.run('manual');
		ui.hide();
		if (!result) {
			new Notice('Hub Curator: another run is already in progress.', 5000);
			return;
		}
		new Notice(`Hub Curator complete. Plan ${result.planId.slice(0, 8)} landed.`, 6000);
	} catch (e) {
		ui.hide();
		console.error('[peak-hub-curate]', e);
		new Notice(`Hub Curator failed: ${(e as Error).message}`, 8000);
	}
}

export async function materializeHubForActiveNote(): Promise<void> {
	const ctx = getContext();
	const runtime = ctx.runtimeRegistry.tryGetHubGenerationRuntime();
	if (!runtime) {
		new Notice('Hub Generation runtime is not ready.', 5000);
		return;
	}
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice('Open a note first to materialize its hub.', 5000);
		return;
	}
	// Look up the active file's node id + community id; pick community representative as hub.
	const { sqliteStoreManager } = await import('@/core/storage/sqlite/SqliteStoreManager');
	if (!sqliteStoreManager.isInitialized()) {
		new Notice('Index not ready. Run indexing first.', 5000);
		return;
	}
	const repo = sqliteStoreManager.getMobiusNodeRepo('vault');
	const active = await repo.getByPath?.(activeFile.path).catch(() => null);
	if (!active?.node_id) {
		new Notice('Active note is not indexed yet.', 5000);
		return;
	}
	const signals = await repo.getDocumentNodeSignals(active.node_id);
	if (!signals?.community_id) {
		new Notice('Active note has no community assigned yet. Run Gap Analysis first.', 6000);
		return;
	}
	const members = await repo.listCommunityMembers(signals.community_id, 40);
	const hubMember = members[0];
	if (!hubMember) {
		new Notice('No members found in this note\'s community.', 5000);
		return;
	}
	const ui = openProgressNotice(`Materializing hub for community ${signals.community_id.slice(0, 8)}...`);
	try {
		const result = await runtime.materializer.run({
			decision: {
				nodeId: hubMember.node_id,
				hubPath: `AI Hub/${signals.community_id}.md`,
				action: 'keep',
				scope: {
					communityIds: [signals.community_id],
					memberNodeIds: members.map((m) => m.node_id),
				},
				reason: 'materialize-from-active-note command',
			},
			planId: 'active-note-' + Date.now(),
			trigger: 'manual',
		});
		ui.hide();
		if (result.status === 'written') {
			new Notice(`Hub written to ${result.hubPath} (coverage ${(result.coverage ?? 0).toFixed(2)}).`, 8000);
		} else if (result.status === 'skipped-user-owned') {
			new Notice(`Hub at ${result.hubPath} is user-owned; skipped.`, 6000);
		} else {
			new Notice(`Hub materialization failed: ${result.error ?? 'unknown'}`, 8000);
		}
	} catch (e) {
		ui.hide();
		console.error('[peak-hub-materialize-active]', e);
		new Notice(`Hub materialization failed: ${(e as Error).message}`, 8000);
	}
}

/**
 * Get the app-wired MediaGenerationService for command entry points.
 * The service is composed once at boot in `main.ts::initSqlite()` and
 * bound on `ConversationService`; commands reuse that same instance so
 * they share adapter / job / receipt state with the Chat `media_generate`
 * tool (D1 §R1).
 *
 * Task C1 §R5: everything media flows through this service — no more
 * bespoke `MediaRingService` instances inside command bodies.
 */
async function getOrBuildMediaGenerationService() {
	const ctx = getContext();
	const bound = ctx.manager.conv.getMediaGenerationService?.();
	if (bound) return bound;
	// Fallback: if the command fires before initSqlite completes (rare —
	// commands are usually invoked from a live UI), compose on demand
	// using the same helper `main.ts` calls.
	const { composeMediaGenerationService } = await import('@/app/media/composeMediaGenerationService');
	return composeMediaGenerationService({
		app: ctx.app,
		getFalApiKey: () => ctx.plugin.settings.ai?.falApiKey,
		getMediaAttachmentFolder: () => ctx.plugin.settings.ai?.mediaAttachmentFolder,
		getRootFolder: () => ctx.plugin.settings.ai?.rootFolder ?? '',
		getMediaSettingsOverride: () => ctx.plugin.settings.ai?.mediaDefaults,
		saveArtifactReceipt: (r) => ctx.manager.conv.saveArtifactReceipt(r),
	});
}

function ttsFalKeyConfigured(): boolean {
	const key = getContext().plugin.settings.ai?.falApiKey;
	return typeof key === 'string' && key.trim().length > 0;
}

export async function generateTtsForActiveNote(): Promise<void> {
	const ctx = getContext();
	const file = ctx.app.workspace.getActiveFile();
	if (!file) {
		new Notice('Open a note first.', 5000);
		return;
	}
	if (!ttsFalKeyConfigured()) {
		new Notice('fal.ai API key not configured (Settings → AI → fal API key).', 6000);
		return;
	}
	const raw = await ctx.app.vault.read(file);
	const text = raw.replace(/^---[\s\S]*?---/, '').trim();
	if (!text) {
		new Notice('Note is empty; nothing to synthesize.', 5000);
		return;
	}
	const service = await getOrBuildMediaGenerationService();
	const ui = openProgressNotice(`Generating TTS for ${file.basename}...`);
	try {
		const outcome = await service.produce({
			runId: `cmd-tts-${Date.now()}`,
			request: {
				kind: 'tts',
				prompt: text.slice(0, 8000),
				route: 'fal',
				presetId: 'default',
				sourceHint: `tts-${file.basename}`,
			},
		});
		ui.hide();
		const path = outcome.writtenPaths[0] ?? '(unknown path)';
		new Notice(`TTS written to ${path}`, 8000);
	} catch (err) {
		ui.hide();
		new Notice(`TTS failed: ${(err as Error).message}`, 10000);
	}
}

export async function generateCoverImageForActiveNote(): Promise<void> {
	const ctx = getContext();
	const file = ctx.app.workspace.getActiveFile();
	if (!file) {
		new Notice('Open a note first.', 5000);
		return;
	}
	if (!ttsFalKeyConfigured()) {
		new Notice('fal.ai API key not configured (Settings → AI → fal API key).', 6000);
		return;
	}
	const raw = await ctx.app.vault.read(file);
	const stripped = raw.replace(/^---[\s\S]*?---/, '').trim();
	const summary = stripped.slice(0, 500);
	if (!summary) {
		new Notice('Note is empty; nothing to depict.', 5000);
		return;
	}
	const prompt = `Cover image for a note titled "${file.basename}". Content excerpt: ${summary}. Clean editorial illustration.`;
	const service = await getOrBuildMediaGenerationService();
	const ui = openProgressNotice(`Generating cover image for ${file.basename}...`);
	try {
		const outcome = await service.produce({
			runId: `cmd-cover-${Date.now()}`,
			request: {
				kind: 'image',
				prompt,
				route: 'fal',
				presetId: 'cover-hd',
				aspectRatio: '16:9',
				sourceHint: `cover-${file.basename}`,
			},
		});
		ui.hide();
		const path = outcome.writtenPaths[0] ?? '(unknown path)';
		new Notice(`Cover image written to ${path}`, 8000);
	} catch (err) {
		ui.hide();
		new Notice(`Image generation failed: ${(err as Error).message}`, 10000);
	}
}

export async function openCopilotCommandCenter(): Promise<void> {
	const ctx = getContext();
	const gateway = ctx.runtimeRegistry.tryGetCommandGateway?.() ?? null;
	if (!gateway) {
		new Notice('Command gateway is not ready.', 5000);
		return;
	}
	const { CopilotCommandCenterService } = await import('@/service/copilot/CopilotCommandCenterService');
	const { CopilotCommandCenterModal, readActiveFileExcerpt } = await import(
		'@/app/ui-host/modals/CopilotCommandCenterModal'
	);
	const service = new CopilotCommandCenterService({
		aiServiceManager: ctx.manager,
		commandGateway: gateway,
		readActiveFileExcerpt: () => readActiveFileExcerpt(ctx.app),
	});
	new CopilotCommandCenterModal({ app: ctx.app, service }).open();
}

export async function showLatestHubCurationPlan(): Promise<void> {
	const ctx = getContext();
	const runtime = ctx.runtimeRegistry.tryGetHubGenerationRuntime();
	if (!runtime) {
		new Notice('Hub Generation runtime is not ready.', 5000);
		return;
	}
	const recent = await runtime.planRepo.listRecent(1);
	const plan = recent[0];
	if (!plan) {
		new Notice('No Hub Curation plan on record yet. Run "Curate Hubs Now" first.', 6000);
		return;
	}
	const { HubCurationPlanModal } = await import('@/app/ui-host/modals/HubCurationPlanModal');
	new HubCurationPlanModal(ctx.app, plan).open();
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

	const indexStatus = await AppContext.getIndexService().getIndexStatus();
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
			await AppContext.getIndexService().runPendingVectorIndexEnrichment(searchSettings, {
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
	const estimator = new BulkOperationCostEstimator(searchSettings, getAIManager(), AppContext.getApp());
	const estimatePromise = estimator.estimatePendingLlmCost();

	const costModal = new CostEstimationModal(ctx, async (choice) => {
		if (choice === 'skip') {
			try {
				const { cleared } = await AppContext.getIndexService().clearPendingLlmFlags();
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
				await AppContext.getIndexService().runPendingLlmIndexEnrichment(searchSettings, {
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
		await AppContext.getIndexService().runMobiusGlobalMaintenance(['vault', 'chat'], {
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
		const agent = new KnowledgeIntuitionAgent(getAIManager(), {
			app: ctx.app,
			vault: ctx.app.vault,
			pluginId: ctx.plugin.manifest.id,
			isMockEnv: ctx.isMockEnv,
			rootFolder: ctx.plugin.settings.ai.rootFolder,
			backboneEnv: composeBackboneEnv(ctx),
			mcpClientManager: AppContext.tryGetMcpClientManager(),
		});
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
	const indexStatus = await AppContext.getIndexService().getIndexStatus();
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
				await AppContext.getIndexService().clearAllIndexData();
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
	const report = verifyDatabaseHealth();
	if (!report.initialized) {
		new Notice('Database not initialized', 3000);
		return;
	}
	new Notice(report.ok ? 'Database healthy' : 'Database issues found — see console', 3000);
	console.log('[DatabaseHealth]\n' + report.lines.join('\n'));
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
	// T11Y-3A: command is now a UI shell. The actual cleanup workflow
	// (orphan documents -> search index -> vec embeddings -> orphan
	// conversations) lives in `MaintenanceCleanupService`, which only
	// reaches storage through narrow ports.
	const ctx = getContext();
	try {
		const service = new MaintenanceCleanupService({
			vaultPaths: {
				listVaultFilePaths: () => new Set(ctx.app.vault.getFiles().map((f) => f.path)),
			},
			indexedDocuments: sqliteStoreManager.getIndexedDocumentRepo(),
			searchIndex: {
				deleteDocuments: (paths) => AppContext.getIndexService().deleteDocuments(paths),
				cleanupOrphanedSearchIndexData: () =>
					AppContext.getIndexService().cleanupOrphanedSearchIndexData(),
			},
			embeddings: sqliteStoreManager.getEmbeddingRepo(),
			conversations: sqliteStoreManager.getChatConversationRepo(),
			messages: sqliteStoreManager.getChatMessageRepo(),
			resources: sqliteStoreManager.getChatMessageResourceRepo(),
			stars: sqliteStoreManager.getChatStarRepo(),
		});
		await service.runCleanup(obsidianNotifier);
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
		{ text: query, scopeMode: 'all', enablePPR: false },
	);
	const baselineMs = Date.now() - t0;

	const t1 = Date.now();
	const pprResult = await searchClient.search(
		{ text: query, scopeMode: 'all', enablePPR: true },
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
