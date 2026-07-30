/**
 * T11I (2026-06-26): framework-agnostic V2 Harness session types,
 * initial state fragment, and serialization helpers.
 *
 * Moved out of src/ui/view/quick-search/store/v2SessionTypes.ts so the
 * service-side persistence module (analysisDocPersistence) can build the
 * auto-save snapshot without crossing into UI. The UI Zustand store
 * still owns runtime ownership of the state; the types and pure
 * serializers live here.
 */

import type { LLMUsage } from '@/core/providers/types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '@/core/search/v2ToolTypes';
import type { V2PersistedSection } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import type { SectionAnalyzeResult } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';

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
	streamingText: string;
	error?: string;
	generations: Array<{ content: string; prompt?: string; timestamp: number }>;
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
	/** Grounded, non-destructive Q&A attached to a report section id. */
	v2SectionFollowups: Record<string, SectionAnalyzeResult[]>;
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
	v2SectionFollowups: {},
	rounds: [],
	currentRoundIndex: 0,
	continueMode: false,
};

// ---------------------------------------------------------------------------
// V2 snapshot builder (for auto-save pipeline)
// ---------------------------------------------------------------------------

/** Result type of the V2 analysis snapshot builders. */
export type V2AnalysisSnapshotData = {
	v2ProcessLog: string[];
	v2PlanOutline: string | null;
	v2ReportSections: V2PersistedSection[];
	v2Sources: V2Source[];
	v2FollowUpQuestions: string[];
	v2Summary: string;
	v2SectionFollowups: Record<string, SectionAnalyzeResult[]>;
	v2GraphJson: string | null;
	usage: LLMUsage | null;
	duration: number | null;
};

export function buildV2AnalysisSnapshot(
	getState: () => { v2Active: boolean; v2Steps: V2ToolStep[]; v2PlanSections: V2Section[]; v2ProposedOutline: string | null; v2Sources: V2Source[]; v2FollowUpQuestions: string[]; v2Summary: string; v2SectionFollowups: Record<string, SectionAnalyzeResult[]>; usage: LLMUsage | null; duration: number | null; rounds: Round[]; v2Timeline: V2TimelineItem[] },
	exportGraphJsonFn: () => string | null,
	getGraphFallbackFn: () => string | null,
): V2AnalysisSnapshotData | null {
	const s = getState();
	if (!s.v2Active) return null;

	const { processLog, sections, planOutline } = serializeAllRounds(
		s.rounds, s.v2Timeline, s.v2Steps, s.v2PlanSections, s.v2ProposedOutline,
	);

	return {
		v2ProcessLog: processLog,
		v2PlanOutline: planOutline,
		v2ReportSections: sections,
		v2Sources: s.v2Sources,
		v2FollowUpQuestions: s.v2FollowUpQuestions,
		v2Summary: s.v2Summary,
		v2SectionFollowups: s.v2SectionFollowups ?? {},
		v2GraphJson: exportGraphJsonFn() ?? getGraphFallbackFn(),
		usage: s.usage,
		duration: s.duration,
	};
}

/**
 * Build V2 analysis snapshot data directly from a V2SessionSnapshot object.
 * Works without any store access — used by the service-layer persistence.
 */
export function buildV2AnalysisSnapshotFromData(
	snapshot: { v2Active: boolean; v2Steps: V2ToolStep[]; v2Timeline: V2TimelineItem[]; v2PlanSections: V2Section[]; v2ProposedOutline: string | null; v2Sources: V2Source[]; v2FollowUpQuestions: string[]; v2Summary: string; v2SectionFollowups: Record<string, SectionAnalyzeResult[]>; usage: LLMUsage | null; duration: number | null; rounds: Round[] },
): V2AnalysisSnapshotData | null {
	if (!snapshot.v2Active) return null;

	const { processLog, sections, planOutline } = serializeAllRounds(
		snapshot.rounds, snapshot.v2Timeline, snapshot.v2Steps, snapshot.v2PlanSections, snapshot.v2ProposedOutline,
	);

	return {
		v2ProcessLog: processLog,
		v2PlanOutline: planOutline,
		v2ReportSections: sections,
		v2Sources: snapshot.v2Sources,
		v2FollowUpQuestions: snapshot.v2FollowUpQuestions,
		v2Summary: snapshot.v2Summary,
		v2SectionFollowups: snapshot.v2SectionFollowups ?? {},
		v2GraphJson: null,
		usage: snapshot.usage,
		duration: snapshot.duration,
	};
}

function serializeAllRounds(
	rounds: Round[],
	currentTimeline: V2TimelineItem[],
	currentSteps: V2ToolStep[],
	currentSections: V2Section[],
	currentOutline: string | null,
): { processLog: string[]; sections: V2PersistedSection[]; planOutline: string | null } {
	const allProcessLog: string[] = [];
	const allSections: V2PersistedSection[] = [];
	let planOutline = currentOutline;

	for (const round of rounds) {
		const roundLog = serializeTimeline(round.timeline, round.steps);
		const roundPlanBlock = round.proposedOutline ? `**Analysis Plan:**\n${round.proposedOutline}` : '';
		const roundProcessBlock = roundLog.length > 0 ? `**Process Log:**\n${roundLog.map(l => `- ${l}`).join('\n')}` : '';
		const headerContent = [roundProcessBlock, roundPlanBlock].filter(Boolean).join('\n\n');

		allSections.push({
			title: `Continue Analysis: ${round.query}`,
			content: headerContent || `*Round ${round.index}*`,
		});

		for (const sec of round.sections) {
			if (!sec.title) continue;
			const secContent = sec.status === 'done' && sec.content ? sec.content : formatPlanSectionBrief(sec);
			allSections.push({
				id: sec.id,
				title: sec.title,
				content: secContent,
				visualType: sec.visualType,
				missionRole: sec.missionRole,
				evidencePaths: sec.evidencePaths,
				brief: sec.brief,
				contentType: sec.contentType,
				weight: sec.weight,
			});
		}

		if (roundLog.length > 0) {
			allProcessLog.push(`--- Round ${round.index}: ${round.query} ---`);
			allProcessLog.push(...roundLog);
		}
	}

	const currentLog = serializeTimeline(currentTimeline, currentSteps);
	if (rounds.length > 0 && currentLog.length > 0) {
		allProcessLog.push(`--- Current Round ---`);
	}
	allProcessLog.push(...currentLog);

	for (const sec of currentSections) {
		if (!sec.title) continue;
		const secContent = sec.status === 'done' && sec.content ? sec.content : formatPlanSectionBrief(sec);
		allSections.push({
			id: sec.id,
			title: sec.title,
			content: secContent,
			visualType: sec.visualType,
			missionRole: sec.missionRole,
			evidencePaths: sec.evidencePaths,
			brief: sec.brief,
			contentType: sec.contentType,
			weight: sec.weight,
		});
	}

	if (rounds.length > 0) {
		const roundOutlines = rounds
			.filter(r => r.proposedOutline)
			.map((r) => `**Round ${r.index}:** ${r.proposedOutline}`)
			.join('\n\n');
		planOutline = roundOutlines
			? (currentOutline ? `${roundOutlines}\n\n**Current Round:**\n${currentOutline}` : roundOutlines)
			: currentOutline;
	}

	return { processLog: allProcessLog, sections: allSections, planOutline };
}

function formatPlanSectionBrief(sec: V2Section): string {
	const lines: string[] = [];
	if (sec.missionRole) lines.push(`**${sec.missionRole}**`);
	if (sec.contentType) lines.push(`Format: ${sec.contentType}`);
	if (sec.brief) lines.push('', sec.brief);
	if (sec.evidencePaths.length > 0) {
		lines.push('', `Sources: ${sec.evidencePaths.map(p => `[[${p.replace(/\.md$/, '')}]]`).join(', ')}`);
	}
	return lines.join('\n') || `*${sec.status}*`;
}

function serializeTimeline(timeline: V2TimelineItem[], steps: V2ToolStep[]): string[] {
	const processLog: string[] = [];
	for (const item of timeline) {
		if (item.kind === 'tool' && item.step.status === 'done') {
			const st = item.step;
			const dur = st.endedAt && st.startedAt
				? `${((st.endedAt - st.startedAt) / 1000).toFixed(1)}s`
				: '';
			processLog.push(`${st.icon} ${st.displayName}${st.summary ? ' — ' + st.summary : ''} ${dur ? '— ' + dur : ''}`.trim());
		} else if (item.kind === 'text' && item.text) {
			const text = item.text.trim();
			if (text) processLog.push(`\u{1F4AD} ${text}`);
		}
	}
	if (processLog.length === 0) {
		for (const st of steps.filter(st => st.status === 'done')) {
			const dur = st.endedAt && st.startedAt
				? `${((st.endedAt - st.startedAt) / 1000).toFixed(1)}s`
				: '';
			processLog.push(`${st.icon} ${st.displayName}${st.summary ? ' — ' + st.summary : ''} ${dur ? '— ' + dur : ''}`.trim());
		}
	}
	return processLog;
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
