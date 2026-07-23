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
	buildAnalysisJsonRecord,
	saveAnalysisJson,
	serializeAnalysisJsonRecord,
} from '@/core/storage/vault/search-docs/AiAnalysisJsonStore';
import { buildV2AnalysisSnapshotFromData } from '@/core/search/v2SessionTypes';
import type { V2SessionSnapshot } from '@/core/search/sessionSnapshot';
import type { CompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { DEFAULT_AI_ROOT_FOLDER, getAIAnalysisJsonStoreFolder } from '@/core/config/folderPaths';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PersistSessionResult {
	path: string;
}

/**
 * Persist an analysis session as a JSON record under
 * `<rootFolder>/DataStore/ai-analysis/`.
 *
 * - If `existingPath` is a `.json` record, overwrites it in place.
 * - Otherwise creates a new `.json` record and indexes it in sqlite history.
 *
 * Markdown is no longer written here — machine records must not be vault
 * markdown (they ballooned Obsidian's metadata index). Markdown export is an
 * explicit user action (see `saveAiAnalyzeResultToMarkdown` / the export UI).
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
		/** AI rootFolder (settings.ai.rootFolder); derives the JSON store folder. Defaults to the plugin root. */
		rootFolder?: string;
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
	const savedAt = Date.now();
	const startedAtMs = completedSnapshot.analysisStartedAtMs ?? savedAt;

	// Machine record: serialize the snapshot as a JSON record (not Markdown).
	const jsonRecord = buildAnalysisJsonRecord(completedSnapshot, {
		query,
		webEnabled,
		title: snapshot.title?.trim() || undefined,
		savedAt,
	});

	// Overwrite an existing JSON record in place (re-save after restore /
	// follow-up). Legacy `.md` existingPath falls through to a fresh JSON
	// record — the classic Markdown note is left untouched.
	if (options.existingPath && options.existingPath.toLowerCase().endsWith('.json')) {
		try {
			await options.vaultWriter.overwriteDoc(options.existingPath, serializeAnalysisJsonRecord(jsonRecord));
			return { path: options.existingPath };
		} catch (e) {
			console.warn('[analysisDocPersistence] overwrite failed:', e);
			return null;
		}
	}

	// Create new JSON record under <rootFolder>/DataStore/ai-analysis.
	const rootFolder = options.rootFolder?.trim() || DEFAULT_AI_ROOT_FOLDER;
	let folderPath = getAIAnalysisJsonStoreFolder(rootFolder);

	const title = snapshot.title?.trim() || query.slice(0, SLICE_CAPS.ui.analysisDisplayTitle) || 'Query';

	let saved: { path: string };
	try {
		saved = await saveAnalysisJson(options.vaultWriter, { folderPath, analysisStartedAtMs: startedAtMs, titleOrQuery: title, record: jsonRecord });
	} catch (firstErr) {
		const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
		const isPathRelated = /folder|path|directory|create|write/i.test(msg);
		if (isPathRelated && folderPath !== '') {
			folderPath = '';
			try {
				saved = await saveAnalysisJson(options.vaultWriter, { folderPath, analysisStartedAtMs: startedAtMs, titleOrQuery: title, record: jsonRecord });
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
			created_at_ts: savedAt,
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
