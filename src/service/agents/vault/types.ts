/**
 * Types for the VaultSearchAgent pipeline.
 * HITL-first: classify → decompose → intuitionFeedback → recon → presentPlan → report
 */

import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import type { SearchAgentResult } from '../shared-types';
import type { UserFeedback, PeakAgentEvent } from '../core/types';
import type { QueryClassifierOutput } from '@/core/schemas/agents/search-agent-schemas';

// ---------------------------------------------------------------------------
// Pipeline phase outputs
// ---------------------------------------------------------------------------

/** Output from the Classify phase. */
export interface ClassifyResult extends QueryClassifierOutput {
	/** Initial file leads from quick FTS/vector search. */
	initialLeads: Array<{
		path: string;
		title: string;
		score: number;
	}>;
}

/** A single physical search task produced by the Decompose phase. */
export interface PhysicalTask {
	id: string;
	description: string;
	/** Target areas (folder paths or concepts) to search. */
	targetAreas: string[];
	/** Hints for which tools to use. */
	toolHints: string[];
}

/** Output from the Decompose phase. */
export interface DecomposeResult {
	tasks: PhysicalTask[];
}

/** Output from the IntuitionFeedback phase. */
export interface IntuitionFeedbackResult {
	/** Areas where the intuition map lacks coverage for this query. */
	gaps: string[];
	/** Human-readable log entry for debugging. */
	logEntry: string;
}

/** A single piece of evidence: a file path + the reason it was discovered. */
export interface ReconEvidence {
	path: string;
	reason: string;
	/** Which physical task discovered this. */
	taskId: string;
}

/** Output from the Recon phase. */
export interface ReconResult {
	evidence: ReconEvidence[];
}

/** Snapshot shown to the user at the HITL plan-presentation pause. */
export interface PlanSnapshot {
	/** Evidence collected so far. */
	evidence: ReconEvidence[];
	/** LLM-generated one-paragraph report plan. */
	proposedOutline: string;
	/** Suggested McKinsey-style section titles. */
	suggestedSections: string[];
	/** Coverage assessment. */
	coverageAssessment: string;
	/** Confidence in current evidence. */
	confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export type VaultSearchPhase =
	| 'classify'
	| 'decompose'
	| 'intuition-feedback'
	| 'recon'
	| 'present-plan'
	| 'report'
	| 'complete';

/** Full session state for VaultSearchAgent. */
export interface VaultSearchState {
	userQuery: string;
	phase: VaultSearchPhase;
	classify?: ClassifyResult;
	decompose?: DecomposeResult;
	intuitionFeedback?: IntuitionFeedbackResult;
	recon?: ReconResult;
	planSnapshot?: PlanSnapshot;
	result?: SearchAgentResult;
	tokenUsage: LLMUsage;
	/** History of user feedback messages (for re-entry after HITL redirects). */
	conversationHistory: UserFeedback[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** HITL pause event yielded by the agent to request user input. */
export interface VaultHitlPauseEvent {
	type: 'hitl-pause';
	pauseId: string;
	phase: VaultSearchPhase;
	snapshot: PlanSnapshot;
	triggerName: string;
}

/** Phase transition event for UI to update progress display. */
export interface VaultPhaseTransitionEvent {
	type: 'phase-transition';
	from: VaultSearchPhase;
	to: VaultSearchPhase;
	triggerName: string;
}

export type VaultSearchEvent = LLMStreamEvent | PeakAgentEvent | VaultHitlPauseEvent | VaultPhaseTransitionEvent;

export function isHitlPauseEvent(ev: VaultSearchEvent): ev is VaultHitlPauseEvent {
	return ev.type === 'hitl-pause';
}

export function isPhaseTransitionEvent(ev: VaultSearchEvent): ev is VaultPhaseTransitionEvent {
	return ev.type === 'phase-transition';
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface VaultSearchOptions {
	/** Max explore rounds before auto-report. */
	maxReconRounds?: number;
	/** Max wall-clock time in ms. */
	maxWallClockMs?: number;
}
