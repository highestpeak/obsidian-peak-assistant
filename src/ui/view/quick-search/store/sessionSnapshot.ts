/**
 * Serializable snapshot of a search session state.
 *
 * T11I (2026-06-26): the neutral subset (no `hitlState`) lives in
 * @/core/search/sessionSnapshot. This UI module re-exports a richer
 * V2SessionSnapshot that **extends** the neutral type with the UI-only
 * `hitlState` field, and keeps `snapshotFromState` (which knows how to
 * deep-clone HitlState) here.
 *
 * This module still does NOT import from any Zustand store — only types
 * and pure functions.
 */

import type { V2ToolStep, V2TimelineItem, V2Source } from '@/core/search/v2ToolTypes';
import type { V2Section, Round } from '@/core/search/v2SessionTypes';
import type { V2SessionSnapshot as NeutralV2SessionSnapshot } from '@/core/search/sessionSnapshot';
import type { HitlState } from './searchSessionStore';

/**
 * UI-facing V2SessionSnapshot: the neutral snapshot plus `hitlState`.
 * Service code consumes the neutral type from
 * @/core/search/sessionSnapshot; only the UI session uses this richer
 * version.
 */
export interface V2SessionSnapshot extends NeutralV2SessionSnapshot {
	hitlState: HitlState | null;
}

// ---------------------------------------------------------------------------
// State → Snapshot (deep-copy)
// ---------------------------------------------------------------------------

type SnapshotSource = {
	[K in keyof V2SessionSnapshot]: V2SessionSnapshot[K];
};

function cloneStep(step: V2ToolStep): V2ToolStep {
	return { ...step, input: { ...step.input } };
}

function cloneTimelineItem(item: V2TimelineItem): V2TimelineItem {
	if (item.kind === 'text') {
		return { kind: 'text', id: item.id, text: item.text, complete: item.complete };
	}
	return { kind: 'tool', step: cloneStep(item.step) };
}

function cloneSection(sec: V2Section): V2Section {
	return {
		...sec,
		evidencePaths: [...sec.evidencePaths],
		streamingText: sec.streamingText,
		generations: sec.generations.map((g) => ({ ...g })),
	};
}

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
		id: state.id,
		query: state.query,
		title: state.title,
		status: state.status,
		startedAt: state.startedAt,

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
