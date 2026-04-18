/**
 * Shared types for VaultSearchAgent / VaultSearchAgentSDK pipelines.
 * UI components import plan-presentation and event types from here.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import type { PeakAgentEvent } from '../core/types';

// ---------------------------------------------------------------------------
// Plan presentation types (used by HITL UI)
// ---------------------------------------------------------------------------

/** A topic cluster discovered during recon with coverage assessment. */
export interface DiscoveryGroup {
	topic: string;
	noteCount: number;
	coverage: 'high' | 'medium' | 'low';
	keyNotes: string[];
}

/** Snapshot shown to the user at the HITL plan-presentation pause. */
export interface PlanSnapshot {
	/** Evidence collected so far. */
	evidence: Array<{ path: string; reason: string; taskId: string }>;
	/** LLM-generated one-paragraph report plan. */
	proposedOutline: string;
	/** Suggested McKinsey-style section titles. */
	suggestedSections: string[];
	/** Coverage assessment. */
	coverageAssessment: string;
	/** Confidence in current evidence. */
	confidence: 'high' | 'medium' | 'low';
	/** Discovery groups — topic clusters with coverage indicators. */
	discoveryGroups?: DiscoveryGroup[];
	/** Areas where evidence is thin — candidates for "dig deeper". */
	coverageGaps?: string[];
}

// ---------------------------------------------------------------------------
// Phase & events
// ---------------------------------------------------------------------------

export type VaultSearchPhase =
	| 'classify'
	| 'decompose'
	| 'intuition-feedback'
	| 'recon'
	| 'present-plan'
	| 'report'
	| 'complete';

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
