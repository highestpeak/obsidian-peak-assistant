/**
 * T11I (2026-06-26): framework-agnostic CompletedAnalysisSnapshot types.
 *
 * Moved out of src/ui/view/quick-search/store/aiAnalysisStore.ts so that
 * the service-side persistence module and the core search-doc
 * builders/parsers can refer to the snapshot shape without crossing
 * into UI. The UI Zustand store still owns the runtime bridge that
 * loads a snapshot into the live session; the type and pure helpers
 * live here.
 */

import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode, AISearchGraph, AISearchSource, AISearchTopic, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
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
 * For save to markdown and replay.
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
