/**
 * Serializable snapshot of a search session state.
 * Used to detach/restore between foreground Zustand store and background plain-object sessions.
 *
 * This module must NOT import from any Zustand store — only types and pure functions.
 */

import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode } from '@/service/agents/shared-types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '../types/search-steps';
import type { V2Section, Round } from './v2SessionTypes';
import type { SessionStatus, HitlState, AutoSaveState } from './searchSessionStore';

// ---------------------------------------------------------------------------
// Snapshot type — serializable subset of SearchSessionState
// ---------------------------------------------------------------------------

export interface V2SessionSnapshot {
	// Session identity
	id: string | null;
	query: string;
	title: string | null;
	status: SessionStatus;
	startedAt: number | null;

	// V2 state
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

	// Metadata
	duration: number | null;
	usage: LLMUsage | null;
	phaseUsages: Array<{ phase: string; modelId: string; inputTokens: number; outputTokens: number }>;
	agentDebugLog: Array<{ ts: number; type: string; taskIndex?: number; data: Record<string, unknown> }>;
	error: string | null;
	analysisMode: AnalysisMode;
	runAnalysisMode: AnalysisMode | null;
	webEnabled: boolean;
	hasStartedStreaming: boolean;
	hasAnalyzed: boolean;
	hitlState: HitlState | null;
	autoSaveState: AutoSaveState;
	dashboardUpdatedLine: string;
}

// ---------------------------------------------------------------------------
// State → Snapshot (deep-copy)
// ---------------------------------------------------------------------------

/** The state object must have at least all the fields listed in V2SessionSnapshot. */
type SnapshotSource = {
	[K in keyof V2SessionSnapshot]: V2SessionSnapshot[K];
};

/** Deep-copy a V2ToolStep */
function cloneStep(step: V2ToolStep): V2ToolStep {
	return { ...step, input: { ...step.input } };
}

/** Deep-copy a V2TimelineItem */
function cloneTimelineItem(item: V2TimelineItem): V2TimelineItem {
	if (item.kind === 'text') {
		return { kind: 'text', id: item.id, chunks: [...item.chunks], complete: item.complete };
	}
	return { kind: 'tool', step: cloneStep(item.step) };
}

/** Deep-copy a V2Section */
function cloneSection(sec: V2Section): V2Section {
	return {
		...sec,
		evidencePaths: [...sec.evidencePaths],
		streamingChunks: [...sec.streamingChunks],
		generations: sec.generations.map((g) => ({ ...g })),
		vizData: sec.vizData ? { ...sec.vizData } : undefined,
	};
}

/** Deep-copy a Round */
function cloneRound(round: Round): Round {
	return {
		...round,
		sections: round.sections.map(cloneSection),
		sources: round.sources.map((s) => ({ ...s })),
		steps: round.steps.map(cloneStep),
		timeline: round.timeline.map(cloneTimelineItem),
		followUpQuestions: [...round.followUpQuestions],
		annotations: round.annotations.map((a) => ({ ...a })),
		usage: round.usage ? { ...round.usage } : null,
	};
}

/**
 * Create a deep-copied snapshot from the given state object.
 * The returned snapshot is safe to hold without shared references to the store.
 */
export function snapshotFromState(state: SnapshotSource): V2SessionSnapshot {
	return {
		// Session identity
		id: state.id,
		query: state.query,
		title: state.title,
		status: state.status,
		startedAt: state.startedAt,

		// V2 state
		v2Active: state.v2Active,
		v2View: state.v2View,
		v2Steps: state.v2Steps.map(cloneStep),
		v2ReportChunks: [...state.v2ReportChunks],
		v2ReportComplete: state.v2ReportComplete,
		v2ToolCallIndex: new Map(state.v2ToolCallIndex),
		v2Timeline: state.v2Timeline.map(cloneTimelineItem),
		v2FinalReportStartIndex: state.v2FinalReportStartIndex,
		v2Sources: state.v2Sources.map((s) => ({ ...s })),
		v2FollowUpQuestions: [...state.v2FollowUpQuestions],
		v2ProposedOutline: state.v2ProposedOutline,
		v2PlanSections: state.v2PlanSections.map(cloneSection),
		v2PlanApproved: state.v2PlanApproved,
		v2UserInsights: [...state.v2UserInsights],
		v2Summary: state.v2Summary,
		v2SummaryStreaming: state.v2SummaryStreaming,
		rounds: state.rounds.map(cloneRound),
		currentRoundIndex: state.currentRoundIndex,
		continueMode: state.continueMode,

		// Metadata
		duration: state.duration,
		usage: state.usage ? { ...state.usage } : null,
		phaseUsages: state.phaseUsages.map((p) => ({ ...p })),
		agentDebugLog: state.agentDebugLog.map((e) => ({ ...e, data: { ...e.data } })),
		error: state.error,
		analysisMode: state.analysisMode,
		runAnalysisMode: state.runAnalysisMode,
		webEnabled: state.webEnabled,
		hasStartedStreaming: state.hasStartedStreaming,
		hasAnalyzed: state.hasAnalyzed,
		hitlState: state.hitlState
			? {
				...state.hitlState,
				snapshot: {
					...state.hitlState.snapshot,
					evidence: state.hitlState.snapshot.evidence.map((e) => ({ ...e })),
					suggestedSections: [...state.hitlState.snapshot.suggestedSections],
					discoveryGroups: state.hitlState.snapshot.discoveryGroups?.map((g) => ({ ...g, keyNotes: [...g.keyNotes] })),
					coverageGaps: state.hitlState.snapshot.coverageGaps ? [...state.hitlState.snapshot.coverageGaps] : undefined,
				},
			}
			: null,
		autoSaveState: { ...state.autoSaveState },
		dashboardUpdatedLine: state.dashboardUpdatedLine,
	};
}
