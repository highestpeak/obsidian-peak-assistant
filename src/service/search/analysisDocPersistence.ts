/**
 * Service-layer persistence for AI analysis sessions.
 *
 * Provides milestone-based saves that work independently of React component lifecycle.
 * Two save points: plan-ready (early) and fully-complete (final).
 *
 * This module has NO React dependencies — it reads from V2SessionSnapshot directly.
 */

import { Notice } from 'obsidian';
import { SLICE_CAPS } from '@/core/constant';
import { AppContext } from '@/app/context/AppContext';
import { generateDocIdFromPath } from '@/core/utils/id-utils';
import {
	buildMarkdown as buildAiSearchAnalysisMarkdown,
	fromCompletedAnalysisSnapshot,
	type BuildMarkdownOptions,
} from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import { saveAiAnalyzeResultToMarkdown, persistAnalysisDocToPath } from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';
import { buildV2AnalysisSnapshotFromData } from '@/ui/view/quick-search/store/v2SessionTypes';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';
import type { CompletedAnalysisSnapshot } from '@/ui/view/quick-search/store/aiAnalysisStore';
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
 */
export async function persistSessionToVault(
	snapshot: V2SessionSnapshot,
	options?: { existingPath?: string | null; graphJson?: string | null },
): Promise<PersistSessionResult | null> {
	if (!snapshot.v2Active) return null;

	const settings = AppContext.getInstance().settings.search;
	const autoSaveEnabled = settings.aiAnalysisAutoSaveEnabled ?? true;
	if (!autoSaveEnabled) return null;

	// Build the serializable analysis data from session snapshot
	const v2Data = buildV2AnalysisSnapshotFromData(snapshot);
	if (!v2Data) return null;

	// Override graph JSON if caller provides it (foreground has access to graph stores)
	if (options?.graphJson) {
		v2Data.v2GraphJson = options.graphJson;
	}

	// Build a CompletedAnalysisSnapshot with V2 data merged in
	const completedSnapshot = buildCompletedSnapshotFromV2(snapshot, v2Data);

	const query = snapshot.query;
	const webEnabled = snapshot.webEnabled;

	const buildOptions: BuildMarkdownOptions = {
		runAnalysisMode: snapshot.runAnalysisMode ?? undefined,
		includeSteps: AppContext.getInstance().settings?.enableDevTools === true,
	};

	// Overwrite existing file
	if (options?.existingPath) {
		try {
			const docModel = fromCompletedAnalysisSnapshot(completedSnapshot, query, webEnabled);
			docModel.created = docModel.created || new Date().toISOString();
			const content = buildAiSearchAnalysisMarkdown(docModel, buildOptions);
			await persistAnalysisDocToPath(options.existingPath, content);
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
		saved = await saveAiAnalyzeResultToMarkdown({
			folderPath,
			fileName,
			query,
			snapshot: completedSnapshot,
			webEnabled,
		});
	} catch (firstErr) {
		const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
		const isPathRelated = /folder|path|directory|create|write/i.test(msg);
		if (isPathRelated && folderPath !== '') {
			folderPath = '';
			try {
				saved = await saveAiAnalyzeResultToMarkdown({
					folderPath,
					fileName,
					query,
					snapshot: completedSnapshot,
					webEnabled,
				});
				new Notice('Auto-save: saved to vault root (configured folder failed).', 5000);
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
		await AppContext.getInstance().aiAnalysisHistoryService.insertOrIgnore(record as any);
	} catch (e) {
		console.warn('[analysisDocPersistence] history record insert failed:', e);
	}

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
