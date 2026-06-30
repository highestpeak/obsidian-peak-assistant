/**
 * Service-layer persistence for AI analysis sessions.
 *
 * Provides milestone-based saves that work independently of React component lifecycle.
 * Two save points: plan-ready (early) and fully-complete (final).
 *
 * T11I (2026-06-26): this module no longer imports `@/ui/*`. Snapshot
 * types come from `@/core/search/**`; the vault-write step goes through
 * an explicit `AnalysisDocVaultWriterPort` the caller must supply. The
 * remaining `AppContext.getInstance()` accesses (settings + history
 * service + EventBus) are tracked as the next cleanup pass — they are
 * pre-existing service-side conveniences, not new shortcuts.
 */

import { SLICE_CAPS } from '@/core/constant';
import type { ProgressReporterPort } from '@/core/ports/ProgressReporterPort';
import type { AnalysisDocVaultWriterPort } from '@/core/ports/AnalysisDocVaultWriterPort';
import type { SearchSettings, MyPluginSettings } from '@/core/config/settingsTypes';
import type { EventBus } from '@/core/eventBus';
import { AIAnalysisCompleteEvent } from '@/core/eventBus';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import {
	buildMarkdown as buildAiSearchAnalysisMarkdown,
	fromCompletedAnalysisSnapshot,
	type BuildMarkdownOptions,
} from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import { buildV2AnalysisSnapshotFromData } from '@/core/search/v2SessionTypes';
import type { V2SessionSnapshot } from '@/core/search/sessionSnapshot';
import type { CompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PersistSessionResult {
	path: string;
}

/**
 * Persist an analysis session to a vault markdown file.
 *
 * - If `existingPath` is provided, overwrites that file.
 * - Otherwise creates a new file in the configured auto-save folder.
 *
 * Returns the saved path, or null if auto-save is disabled / nothing to save.
 *
 * `vaultWriter` is required: callers (UI hook, background runtime, app
 * adapter) construct an `AppAnalysisDocVaultWriterAdapter` and pass it
 * in. There is intentionally no module-level default writer.
 */
export async function persistSessionToVault(
	snapshot: V2SessionSnapshot,
	options: {
		vaultWriter: AnalysisDocVaultWriterPort;
		existingPath?: string | null;
		graphJson?: string | null;
		progressReporter?: ProgressReporterPort;
		/** T11J B3: caller injects search settings (was AppContext.getInstance().settings.search). */
		searchSettings: SearchSettings;
		/** T11J B3: top-level dev-tools flag (was AppContext.getInstance().settings.enableDevTools). */
		enableDevTools: boolean;
		/** T11J B3: history service for record persistence (was AppContext.getInstance().aiAnalysisHistoryService). */
		historyService: AIAnalysisHistoryService;
		/** T11J B3: event bus for AI_ANALYSIS_COMPLETE dispatch (was AppContext.getEventBus()). */
		eventBus: EventBus;
	},
): Promise<PersistSessionResult | null> {
	if (!snapshot.v2Active) return null;

	const settings = options.searchSettings;
	const autoSaveEnabled = settings.aiAnalysisAutoSaveEnabled ?? true;
	if (!autoSaveEnabled) return null;

	// Build the serializable analysis data from session snapshot
	const v2Data = buildV2AnalysisSnapshotFromData(snapshot);
	if (!v2Data) return null;

	// Override graph JSON if caller provides it (foreground has access to graph stores)
	if (options.graphJson) {
		v2Data.v2GraphJson = options.graphJson;
	}

	// Build a CompletedAnalysisSnapshot with V2 data merged in
	const completedSnapshot = buildCompletedSnapshotFromV2(snapshot, v2Data);

	const query = snapshot.query;
	const webEnabled = snapshot.webEnabled;

	const buildOptions: BuildMarkdownOptions = {
		runAnalysisMode: snapshot.runAnalysisMode ?? undefined,
		includeSteps: options.enableDevTools === true,
	};

	const docModel = fromCompletedAnalysisSnapshot(completedSnapshot, query, webEnabled);
	docModel.created = docModel.created || new Date().toISOString();
	const content = buildAiSearchAnalysisMarkdown(docModel, buildOptions);

	// Overwrite existing file
	if (options.existingPath) {
		try {
			await options.vaultWriter.overwriteDoc(options.existingPath, content);
			return { path: options.existingPath };
		} catch (e) {
			console.warn('[analysisDocPersistence] overwrite failed:', e);
			return null;
		}
	}

	// Create new file
	const defaultFolder = 'ChatFolder/AI-Analysis';
	let folderPath = (settings.aiAnalysisAutoSaveFolder?.trim()) || defaultFolder;

	const title = snapshot.title?.trim() || query.slice(0, SLICE_CAPS.ui.analysisDisplayTitle) || 'Query';
	const displayTitle = title.replace(/[/\\:*?"<>|]/g, '').trim().slice(0, SLICE_CAPS.ui.analysisDisplayTitleTrim);
	const ts = Date.now();
	const fileName = `${ts} - ${displayTitle}`;

	let saved: { path: string };
	try {
		saved = await options.vaultWriter.createDoc({ folderPath, fileName, content });
	} catch (firstErr) {
		const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
		const isPathRelated = /folder|path|directory|create|write/i.test(msg);
		if (isPathRelated && folderPath !== '') {
			folderPath = '';
			try {
				saved = await options.vaultWriter.createDoc({ folderPath, fileName, content });
				// Notification surface is optional; missing reporter is fine.
				try {
					const reporter = options.progressReporter;
					if (reporter) reporter.show('Auto-save: saved to vault root (configured folder failed).', 5000);
				} catch (e) {
					console.warn('[analysisDocPersistence] fallback notice skipped:', e);
				}
			} catch {
				console.warn('[analysisDocPersistence] auto-save failed (including vault root fallback)');
				return null;
			}
		} else {
			console.warn('[analysisDocPersistence] auto-save failed:', firstErr);
			return null;
		}
	}

	// Insert history record
	try {
		const record: AIAnalysisHistoryRecord = {
			id: generateDocIdFromPath(saved.path),
			vault_rel_path: saved.path,
			query: query || null,
			title: snapshot.title?.trim() || null,
			created_at_ts: ts,
			web_enabled: webEnabled ? 1 : 0,
			estimated_tokens: snapshot.usage?.totalTokens ?? null,
			sources_count: snapshot.v2Sources.length,
			topics_count: 0,
			graph_nodes_count: 0,
			graph_edges_count: 0,
			duration: snapshot.duration ?? null,
			analysis_preset: snapshot.analysisMode ?? null,
		};
		await options.historyService.insertOrIgnore(record as any);
	} catch (e) {
		console.warn('[analysisDocPersistence] history record insert failed:', e);
	}

	// Emit AI_ANALYSIS_COMPLETE for SessionContextService tracking
	try {
		options.eventBus.dispatch(new AIAnalysisCompleteEvent({
			query: query || null,
			title: snapshot.title?.trim() || null,
			sourcesCount: snapshot.v2Sources.length,
		}));
	} catch { /* EventBus may not be initialized in tests */ }

	return { path: saved.path };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a CompletedAnalysisSnapshot from V2 session data.
 * This replaces the pattern of `buildCompletedAnalysisSnapshot() + mergeV2IntoSnapshot()`
 * which required React stores. Here we build directly from snapshot data.
 */
function buildCompletedSnapshotFromV2(
	session: V2SessionSnapshot,
	v2Data: ReturnType<typeof buildV2AnalysisSnapshotFromData>,
): CompletedAnalysisSnapshot {
	const snapshot: CompletedAnalysisSnapshot = {
		version: 1,
		runAnalysisMode: session.runAnalysisMode ?? undefined,
		analysisStartedAtMs: session.startedAt,
		duration: v2Data!.duration,
		usage: v2Data!.usage,
		title: session.title ?? undefined,
		summaries: v2Data!.v2Summary ? [v2Data!.v2Summary] : [],
		summaryVersion: 1,
		topics: [],
		topicInspectResults: {},
		topicAnalyzeResults: {},
		topicGraphResults: {},
		graph: null,
		sources: [],
		dashboardBlocks: [],
		// V2 fields
		v2ProcessLog: v2Data!.v2ProcessLog,
		v2PlanOutline: v2Data!.v2PlanOutline ?? undefined,
		v2ReportSections: v2Data!.v2ReportSections,
		v2FollowUpQuestions: v2Data!.v2FollowUpQuestions,
		v2GraphJson: v2Data!.v2GraphJson ?? undefined,
	};

	// Map V2 sources to AISearchSource format
	if (v2Data!.v2Sources?.length) {
		snapshot.sources = v2Data!.v2Sources.map((s, i) => ({
			id: `v2-src-${i}`,
			path: s.path,
			title: s.title,
			score: { average: 0, physical: 0, semantic: 0 },
			reasoning: s.reasoning ?? '',
			badges: [],
		}));
	}

	return snapshot;
}
