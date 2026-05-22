import type { AISearchGraph, AISearchSource, AISearchTopic, AnalysisMode, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
export type { AnalysisMode };
import { useSearchSessionStore } from './searchSessionStore';
import { useAIGraphStore } from './aiGraphStore';
import { useGraphAgentStore } from './graphAgentStore';

import type { LLMUsage } from '@/core/providers/types';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SnapshotChatMessage, V2PersistedSection } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

/** Per-topic completed Q&A from Analyze. */
export type SectionAnalyzeResult = { question: string; answer: string };

/** Completed UI step from ui-step events; persisted in store and not cleared until new run. */
export interface UIStepRecord {
	stepId: string;
	title: string;
	description: string;
	startedAtMs?: number;
	endedAtMs?: number;
}

/**
 * for save to markdown and replay.
 */
export type CompletedAnalysisSnapshot = {
	/** Snapshot schema version. */
	version: 1;
	/** Mode used for this run: vaultFull | aiGraph. Omit = vaultFull. */
	runAnalysisMode?: AnalysisMode;
	analysisStartedAtMs?: number | null;
	duration?: number | null;
	usage?: LLMUsage | null;

	/** Short display title (from AI at end of analysis). */
	title?: string;
	/** All generated summaries (each run or re-gen adds one). */
	summaries: string[];
	/** 1-based index into summaries: which one is selected for display. */
	summaryVersion: number;

	topics: AISearchTopic[];
	/** Per-topic vault inspect results (key = topic label). */
	topicInspectResults?: Record<string, SearchResultItem[]>;
	/** Per-topic completed Analyze Q&A. */
	topicAnalyzeResults?: Record<string, SectionAnalyzeResult[]>;
	/** Per-topic graph (for Topic expansions). */
	topicGraphResults?: Record<string, GraphPreview | null>;

	graph: AISearchGraph | null;
	/** Per-graph-node/concept chat history (key = node id or concept label). */
	graphNodeChatRecords?: Record<string, SnapshotChatMessage[]>;

	sources: AISearchSource[];
	/** Evidence by path for Sources Evidence view (claim/quote per file). */
	evidenceIndex?: EvidenceIndex;
	/** Per-source chat history (key = source path or id). */
	sourcesChatRecords?: Record<string, SnapshotChatMessage[]>;

	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;

	/** Overview diagram (raw Mermaid code) from Mermaid Overview Agent. */
	overviewMermaidActiveIndex?: number;
	// all versions of overview mermaid
	overviewMermaidVersions?: string[];
	/** Slot coverage diagram (raw Mermaid code) from slot pipeline. Latest only. */
	mindflowMermaid?: string;

	/** Continue Analysis Q&A (user question → answer). */
	fullAnalysisFollowUp?: Array<{ title: string; content: string }>;

	/** Graph section follow-up history. */
	graphFollowups?: SectionAnalyzeResult[];
	/** Blocks section follow-up history (legacy flat list). */
	blocksFollowups?: SectionAnalyzeResult[];
	/** Per-block follow-up history (key = block id). */
	blocksFollowupsByBlockId?: Record<string, SectionAnalyzeResult[]>;
	/** Sources section follow-up history. */
	sourcesFollowups?: SectionAnalyzeResult[];

	/** All completed UI steps (from ui-step events) for replay and dev copy. */
	steps?: UIStepRecord[];

	// V2 fields
	v2ProcessLog?: string[];
	v2PlanOutline?: string | null;
	v2ReportSections?: V2PersistedSection[];
	v2FollowUpQuestions?: string[];
	v2GraphJson?: string | null;
};

/** Current summary text from snapshot (selected by summaryVersion). */
export function getSnapshotSummary(snapshot: CompletedAnalysisSnapshot): string {
	const list = snapshot.summaries ?? [];
	const idx = (snapshot.summaryVersion ?? 1) - 1;
	return list[idx] ?? list[0] ?? '';
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Reset legacy analysis state (no-op now that V1 topic/interaction stores are removed). */
export function resetAIAnalysisAll(): void {
	// V1 topic/interaction stores have been retired.
	// searchSessionStore.resetAll() handles all V2 state.
}

/** Load snapshot into searchSessionStore (and graph stores for replay). */
export function loadCompletedAnalysisSnapshot(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	bridgeSnapshotToSearchSessionStore(snapshot, sourceVaultPath);
}

// ---------------------------------------------------------------------------
// Snapshot bridge
// ---------------------------------------------------------------------------

/** Reconstruct V2ToolStep[] + V2TimelineItem[] from saved process log strings. */
function reconstructProcessTimeline(
	processLog: string[],
	startedAt: number,
): { steps: import('../types/search-steps').V2ToolStep[]; timeline: import('../types/search-steps').V2TimelineItem[] } {
	const steps: import('../types/search-steps').V2ToolStep[] = [];
	const timeline: import('../types/search-steps').V2TimelineItem[] = [];

	let stepIdx = 0;
	for (let i = 0; i < processLog.length; i++) {
		const line = processLog[i];

		// Thinking text: lines prefixed with 💭
		if (line.startsWith('\u{1F4AD} ') || line.startsWith('💭 ')) {
			const text = line.slice(line.indexOf(' ') + 1);
			timeline.push({ kind: 'text', id: `restored-text-${i}`, text, complete: true });
			continue;
		}

		const parts = line.split(' — ').map(p => p.trim());
		const firstSpace = parts[0].indexOf(' ');
		const icon = firstSpace > 0 ? parts[0].slice(0, firstSpace) : '🔧';
		const displayName = firstSpace > 0 ? parts[0].slice(firstSpace + 1) : parts[0];

		let summary = '';
		let durationSec = 0;
		if (parts.length >= 3) {
			const durMatch = parts[parts.length - 1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
				summary = parts.slice(1, -1).join(' — ');
			} else {
				summary = parts.slice(1).join(' — ');
			}
		} else if (parts.length === 2) {
			const durMatch = parts[1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
			} else {
				summary = parts[1];
			}
		}

		const stepStartedAt = startedAt + stepIdx * 100;
		const step: import('../types/search-steps').V2ToolStep = {
			id: `restored-step-${stepIdx}`,
			toolName: 'restored',
			displayName,
			icon,
			input: {},
			status: 'done',
			startedAt: stepStartedAt,
			endedAt: stepStartedAt + durationSec * 1000,
			summary: summary || undefined,
		};
		steps.push(step);
		timeline.push({ kind: 'tool', step });
		stepIdx++;
	}

	return { steps, timeline };
}

function bridgeSnapshotToSearchSessionStore(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	const now = Date.now();
	const startedAt = snapshot.analysisStartedAtMs ?? now;
	const isV2 = !!(
		(snapshot.v2ReportSections && snapshot.v2ReportSections.length > 0) ||
		(snapshot.v2ProcessLog && snapshot.v2ProcessLog.length > 0) ||
		snapshot.v2PlanOutline ||
		snapshot.v2GraphJson
	);

	if (isV2) {
		// Restore V2 state — reconstruct V2Section[] from persisted report sections
		const v2PlanSections: import('./searchSessionStore').V2Section[] = (snapshot.v2ReportSections ?? []).map((sec, i) => ({
			id: `restored-sec-${i}`,
			title: sec.title,
			contentType: sec.contentType ?? '',
			visualType: sec.visualType ?? '',
			evidencePaths: sec.evidencePaths ?? [],
			brief: sec.brief ?? '',
			weight: sec.weight ?? 1,
			missionRole: sec.missionRole ?? '',
			status: 'done' as const,
			content: sec.content,
			streamingText: '',
			generations: [{ content: sec.content, timestamp: startedAt }],
		}));

		// Convert AISearchSource[] back to V2Source[] if sources were saved
		const v2Sources: import('../types/search-steps').V2Source[] = (snapshot.sources ?? []).map(s => ({
			path: s.path,
			title: s.title,
			readAt: startedAt,
			reasoning: s.reasoning ?? undefined,
		}));

		// Reconstruct process timeline from saved log
		const { steps: restoredSteps, timeline: restoredTimeline } =
			(snapshot.v2ProcessLog?.length)
				? reconstructProcessTimeline(snapshot.v2ProcessLog, startedAt)
				: { steps: [], timeline: [] };

		// Restore graph data if present
		if (snapshot.v2GraphJson) {
			try {
				const graphPayload = JSON.parse(snapshot.v2GraphJson);
				if (graphPayload.lenses) {
					const lensKeys = Object.keys(graphPayload.lenses);
					if (lensKeys.length > 0) {
						const graphData = graphPayload.lenses[lensKeys[0]];

						// Restore to graphAgentStore (used by SourcesGraph → useGraphAgent)
						const sourcePaths = (snapshot.sources ?? []).map(s => s.path).sort().join('|');
						useGraphAgentStore.getState().setCacheKey(sourcePaths);
						useGraphAgentStore.getState().setGraphData(graphData);

						// Also restore to aiGraphStore (used by standalone graph view)
						useAIGraphStore.setState({
							graphData,
							activeLens: lensKeys[0] as any,
						});
					}
				}
			} catch { /* ignore malformed graph JSON */ }
		}

		useSearchSessionStore.setState((prev) => ({
			id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
			query: snapshot.query ?? '',
			status: 'completed',
			startedAt,
			duration: snapshot.duration ?? null,
			usage: snapshot.usage ?? null,
			title: snapshot.title ?? null,
			hasAnalyzed: true,
			restoredFromHistory: true,
			restoredFromVaultPath: sourceVaultPath ?? null,
			analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
			// Seed lastSavedPath so any later re-save (e.g. on-demand graph
			// generation after restore) overwrites the original markdown
			// instead of creating a new file.
			autoSaveState: { ...prev.autoSaveState, lastSavedPath: sourceVaultPath ?? null },
			// V2 state
			v2Active: true,
			v2View: 'report',
			v2PlanSections,
			v2PlanApproved: true,
			v2ReportComplete: true,
			v2ProposedOutline: snapshot.v2PlanOutline ?? null,
			v2Sources,
			v2FollowUpQuestions: snapshot.v2FollowUpQuestions ?? [],
			v2Summary: getSnapshotSummary(snapshot),
			v2SummaryStreaming: false,
			v2Steps: restoredSteps,
			v2Timeline: restoredTimeline,
		}));
		return;
	}

	// Non-V2 snapshots: restore minimal session state for display
	useSearchSessionStore.setState((prev) => ({
		id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
		query: snapshot.query ?? '',
		status: 'completed',
		startedAt,
		duration: snapshot.duration ?? null,
		usage: snapshot.usage ?? null,
		title: snapshot.title ?? null,
		hasAnalyzed: true,
		restoredFromHistory: true,
		restoredFromVaultPath: sourceVaultPath ?? null,
		analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
		autoSaveState: { ...prev.autoSaveState, lastSavedPath: sourceVaultPath ?? null },
	}));
}

/** Get clean query without @web@ for actual search. */
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};
