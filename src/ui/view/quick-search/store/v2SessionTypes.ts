/**
 * V2 (Agent SDK) session types, initial state fragment, and utility functions.
 * Extracted from searchSessionStore.ts for better organization.
 */

import type { LLMUsage } from '@/core/providers/types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';

// ---------------------------------------------------------------------------
// Annotation & Round types (for Continue Append Mode)
// ---------------------------------------------------------------------------

export interface Annotation {
	id: string;
	roundIndex: number;
	sectionIndex: number;
	selectedText?: string;
	comment: string;
	type: 'question' | 'disagree' | 'expand' | 'note';
	createdAt: number;
}

export interface Round {
	index: number;
	query: string;
	sections: V2Section[];
	summary: string;
	summaryStreaming: boolean;
	sources: V2Source[];
	steps: V2ToolStep[];
	timeline: V2TimelineItem[];
	followUpQuestions: string[];
	proposedOutline: string | null;
	annotations: Annotation[];
	usage: LLMUsage | null;
	duration: number | null;
}

// ---------------------------------------------------------------------------
// V2 Section type
// ---------------------------------------------------------------------------

export interface V2Section {
	id: string;
	title: string;
	contentType: string;
	visualType: string;
	evidencePaths: string[];
	brief: string;
	weight: number;
	missionRole: string;
	status: 'pending' | 'generating' | 'done' | 'error';
	content: string;
	streamingChunks: string[];
	error?: string;
	generations: Array<{ content: string; prompt?: string; timestamp: number }>;
	vizData?: import('@/core/schemas/report-viz-schemas').VizSpec;
}

// ---------------------------------------------------------------------------
// V2 initial state fragment
// ---------------------------------------------------------------------------

export interface V2SessionState {
	v2Active: boolean;
	v2View: 'process' | 'report' | 'sources';
	v2Steps: V2ToolStep[];
	v2ReportChunks: string[];
	v2ReportComplete: boolean;
	v2ToolCallIndex: Map<string, string>;
	v2Timeline: V2TimelineItem[];
	v2FinalReportStartIndex: number;
	v2Sources: V2Source[];
	v2FollowUpQuestions: string[];
	v2ProposedOutline: string | null;
	v2PlanSections: V2Section[];
	v2PlanApproved: boolean;
	v2UserInsights: string[];
	v2Summary: string;
	v2SummaryStreaming: boolean;
	rounds: Round[];
	currentRoundIndex: number;
	continueMode: boolean;
}

export const V2_INITIAL_STATE: V2SessionState = {
	v2Active: false,
	v2View: 'process' as const,
	v2Steps: [],
	v2ReportChunks: [],
	v2ReportComplete: false,
	v2ToolCallIndex: new Map(),
	v2Timeline: [],
	v2FinalReportStartIndex: -1,
	v2Sources: [],
	v2FollowUpQuestions: [],
	v2ProposedOutline: null,
	v2PlanSections: [],
	v2PlanApproved: false,
	v2UserInsights: [],
	v2Summary: '',
	v2SummaryStreaming: false,
	rounds: [],
	currentRoundIndex: 0,
	continueMode: false,
};

// ---------------------------------------------------------------------------
// V2 snapshot builder (for auto-save pipeline)
// ---------------------------------------------------------------------------

export function buildV2AnalysisSnapshot(
	getState: () => { v2Active: boolean; v2Steps: V2ToolStep[]; v2PlanSections: V2Section[]; v2ProposedOutline: string | null; v2Sources: V2Source[]; v2FollowUpQuestions: string[]; v2Summary: string; usage: LLMUsage | null; duration: number | null },
	exportGraphJsonFn: () => string | null,
	getGraphFallbackFn: () => string | null,
): {
	v2ProcessLog: string[];
	v2PlanOutline: string | null;
	v2ReportSections: Array<{ title: string; content: string }>;
	v2Sources: V2Source[];
	v2FollowUpQuestions: string[];
	v2Summary: string;
	v2GraphJson: string | null;
	usage: LLMUsage | null;
	duration: number | null;
} | null {
	const s = getState();
	if (!s.v2Active) return null;

	const processLog = s.v2Steps
		.filter(st => st.status === 'done')
		.map(st => {
			const dur = st.endedAt && st.startedAt
				? `${((st.endedAt - st.startedAt) / 1000).toFixed(1)}s`
				: '';
			return `${st.icon} ${st.displayName}${st.summary ? ' \u2014 ' + st.summary : ''} ${dur ? '\u2014 ' + dur : ''}`.trim();
		});

	const sections = s.v2PlanSections
		.filter(sec => sec.status === 'done' && sec.content)
		.map(sec => ({ title: sec.title, content: sec.content }));

	return {
		v2ProcessLog: processLog,
		v2PlanOutline: s.v2ProposedOutline,
		v2ReportSections: sections,
		v2Sources: s.v2Sources,
		v2FollowUpQuestions: s.v2FollowUpQuestions,
		v2Summary: s.v2Summary,
		v2GraphJson: exportGraphJsonFn() ?? getGraphFallbackFn(),
		usage: s.usage,
		duration: s.duration,
	};
}

// ---------------------------------------------------------------------------
// Round utility functions (derived state helpers)
// ---------------------------------------------------------------------------

/** Get all sections flattened across all rounds + current */
export function getAllSectionsFrom(rounds: Round[], currentSections: V2Section[]): V2Section[] {
	const fromRounds = rounds.flatMap(r => r.sections);
	return [...fromRounds, ...currentSections];
}

/** Get all sources deduplicated across all rounds + current */
export function getAllSourcesFrom(rounds: Round[], currentSources: V2Source[]): V2Source[] {
	const seen = new Set<string>();
	const result: V2Source[] = [];
	for (const src of [...rounds.flatMap(r => r.sources), ...currentSources]) {
		if (!seen.has(src.path)) {
			seen.add(src.path);
			result.push(src);
		}
	}
	return result;
}
