/**
 * AiSearchAnalysisDoc - AI Search Analysis Markdown Document Model
 * ================================================================
 *
 * Handles serialization and deserialization of AI search analysis results
 * to/from Markdown. Uses frontmatter for metadata and fixed section order for body.
 *
 * FILE STRUCTURE:
 * - Frontmatter: type, version, created, query, webEnabled, duration, estimatedTokens, analysisStartedAt
 * - Body sections (fixed order): Summary, Query, Key Topics, Sources, Topic Inspect Results,
 *   Topic Expansions, Dashboard Blocks, ...
 *
 * Implementation split:
 * - analysis-markdown-parser.ts  — parse() and all parsing helpers
 * - analysis-markdown-builder.ts — buildMarkdown() and all builder helpers
 * - This file — types, interfaces, snapshot converters, re-exports
 *
 * Tests: npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts
 */

import { getMermaidInner } from '@/core/utils/mermaid-utils';
import type { AISearchGraph, AISearchSource, AISearchTopic, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SearchResultItem } from '@/service/search/types';
import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode, UIStepRecord, CompletedAnalysisSnapshot, SectionAnalyzeResult } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { getSnapshotSummary } from '@/ui/view/quick-search/store/aiAnalysisStore';
// Re-export parse and buildMarkdown so existing imports continue to work.
export { parse } from './analysis-markdown-parser';
export { buildMarkdown } from './analysis-markdown-builder';

/** Options for buildMarkdown: control which sections are written by mode and debug. */
export interface BuildMarkdownOptions {
	/** When set, full-only sections (Overview, Topics, Graph, Dashboard, etc.) are written only for vaultFull. */
	runAnalysisMode?: AnalysisMode;
	/** When true, Steps section is written; when false or omitted, Steps are omitted (e.g. when dev tools off). */
	includeSteps?: boolean;
}

/** Single chat message for snapshot (graph/source/block context chats). */
export type SnapshotChatMessage = { role: string; content: string };

/** Document model for AI search analysis. Matches CompletedAnalysisSnapshot plus query/webEnabled. */
export interface AiSearchAnalysisDocModel {
	version: 1;
	/** Summary content version; every snapshot has one (e.g. 1). */
	summaryVersion?: number;
	created?: string;
	analysisStartedAtMs: number | null;
	duration: number | null;
	usage: LLMUsage | null;
	/** Short display title (from AI at end of analysis). */
	title?: string;
	/** Selected summary for md body (summaries[summaryVersion - 1]). */
	summary: string;
	/** All generated summaries. */
	summaries?: string[];
	query: string;
	webEnabled: boolean;
	runAnalysisMode?: AnalysisMode;
	topics: AISearchTopic[];
	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). Same pattern as dashboardBlocks + records by id. */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;
	sources: AISearchSource[];
	graph: AISearchGraph | null;
	topicInspectResults: Record<string, SearchResultItem[]>;
	topicAnalyzeResults: Record<string, SectionAnalyzeResult[]>;
	topicGraphResults: Record<string, GraphPreview | null>;
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
	/** All completed UI steps for replay. */
	steps?: UIStepRecord[];
	/** Evidence by path for Sources Evidence view (claim/quote per file). Replay-only when loading from doc. */
	evidenceIndex?: EvidenceIndex;
	/** Overview diagram (raw Mermaid code). */
	overviewMermaidActiveIndex?: number;
	// all versions of overview mermaid
	overviewMermaidVersions?: string[];
	/** Slot coverage diagram (raw Mermaid code). Latest only. */
	mindflowMermaid?: string;

	// V2 fields (SDK pipeline)
	v2ProcessLog?: string[];
	v2PlanOutline?: string;
	v2ReportSections?: Array<{ title: string; content: string }>;
	v2GraphJson?: string;
	v2FollowUpQuestions?: string[];
}

/**
 * Convert DocModel to CompletedAnalysisSnapshot for store.
 */
export function toCompletedAnalysisSnapshot(
	docModel: AiSearchAnalysisDocModel,
	createdAtTs?: number
): CompletedAnalysisSnapshot {
	return {
		version: 1,
		title: docModel.title,
		summaries: (docModel.summaries?.length ? docModel.summaries : [docModel.summary]) as string[],
		summaryVersion: docModel.summaryVersion ?? 1,
		runAnalysisMode: docModel.runAnalysisMode,
		analysisStartedAtMs: docModel.analysisStartedAtMs ?? (Number.isFinite(createdAtTs ?? 0) ? (createdAtTs as number) : null),
		duration: docModel.duration,
		usage: docModel.usage,
		topics: docModel.topics,
		dashboardBlocks: docModel.dashboardBlocks,
		blockChatRecords: docModel.blockChatRecords,
		sources: docModel.sources,
		graph: docModel.graph,
		topicInspectResults: docModel.topicInspectResults,
		topicAnalyzeResults: docModel.topicAnalyzeResults,
		topicGraphResults: docModel.topicGraphResults,
		fullAnalysisFollowUp: docModel.fullAnalysisFollowUp,
		graphFollowups: docModel.graphFollowups,
		blocksFollowups: docModel.blocksFollowups,
		blocksFollowupsByBlockId: docModel.blocksFollowupsByBlockId,
		sourcesFollowups: docModel.sourcesFollowups,
		evidenceIndex: docModel.evidenceIndex && Object.keys(docModel.evidenceIndex).length > 0 ? docModel.evidenceIndex : undefined,
		steps: docModel.steps,
		overviewMermaidVersions: docModel.overviewMermaidVersions?.length ? docModel.overviewMermaidVersions : undefined,
		overviewMermaidActiveIndex: docModel.overviewMermaidVersions?.length ? (docModel.overviewMermaidActiveIndex ?? 0) : undefined,
		mindflowMermaid: docModel.mindflowMermaid?.trim() ? docModel.mindflowMermaid : undefined,
		// V2 fields
		v2ProcessLog: docModel.v2ProcessLog?.length ? docModel.v2ProcessLog : undefined,
		v2PlanOutline: docModel.v2PlanOutline ?? undefined,
		v2ReportSections: docModel.v2ReportSections?.length ? docModel.v2ReportSections : undefined,
		v2GraphJson: docModel.v2GraphJson ?? undefined,
		v2FollowUpQuestions: docModel.v2FollowUpQuestions?.length ? docModel.v2FollowUpQuestions : undefined,
	};
}

/**
 * Convert CompletedAnalysisSnapshot to DocModel for saving.
 */
export function fromCompletedAnalysisSnapshot(
	snapshot: CompletedAnalysisSnapshot,
	query: string,
	webEnabled: boolean
): AiSearchAnalysisDocModel {
	return {
		version: 1,
		title: snapshot.title,
		summaryVersion: snapshot.summaryVersion ?? 1,
		summary: getSnapshotSummary(snapshot),
		summaries: snapshot.summaries?.length ? snapshot.summaries : undefined,
		analysisStartedAtMs: snapshot.analysisStartedAtMs ?? null,
		duration: snapshot.duration ?? null,
		usage: snapshot.usage ?? null,
		query,
		webEnabled,
		runAnalysisMode: snapshot.runAnalysisMode,
		topics: snapshot.topics ?? [],
		dashboardBlocks: snapshot.dashboardBlocks ?? [],
		blockChatRecords: snapshot.blockChatRecords,
		sources: snapshot.sources ?? [],
		graph: snapshot.graph ?? null,
		overviewMermaidVersions: (() => {
			const versions = snapshot.overviewMermaidVersions ?? [];
			const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
			if (versions.length > 0) return versions;
			if (typeof raw === 'string' && String(raw).trim()) {
				const inner = getMermaidInner(raw).trim();
				return inner ? [inner] : [];
			}
			return [];
		})(),
		overviewMermaidActiveIndex: (() => {
			const versions = snapshot.overviewMermaidVersions ?? [];
			const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
			if (versions.length > 0) return typeof raw === 'number' ? raw : 0;
			if (typeof raw === 'string' && String(raw).trim()) return 0;
			return 0;
		})(),
		topicInspectResults: snapshot.topicInspectResults ?? {},
		topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
		topicGraphResults: snapshot.topicGraphResults ?? {},
		fullAnalysisFollowUp: snapshot.fullAnalysisFollowUp,
		graphFollowups: snapshot.graphFollowups,
		blocksFollowups: snapshot.blocksFollowups,
		blocksFollowupsByBlockId: snapshot.blocksFollowupsByBlockId,
		sourcesFollowups: snapshot.sourcesFollowups,
		evidenceIndex: snapshot.evidenceIndex && Object.keys(snapshot.evidenceIndex).length > 0 ? snapshot.evidenceIndex : undefined,
		steps: snapshot.steps,
		mindflowMermaid: snapshot.mindflowMermaid?.trim() ? snapshot.mindflowMermaid : undefined,
		// V2 fields
		v2ProcessLog: snapshot.v2ProcessLog?.length ? snapshot.v2ProcessLog : undefined,
		v2PlanOutline: snapshot.v2PlanOutline ?? undefined,
		v2ReportSections: snapshot.v2ReportSections?.length ? snapshot.v2ReportSections : undefined,
		v2GraphJson: snapshot.v2GraphJson ?? undefined,
		v2FollowUpQuestions: snapshot.v2FollowUpQuestions?.length ? snapshot.v2FollowUpQuestions : undefined,
	};
}
