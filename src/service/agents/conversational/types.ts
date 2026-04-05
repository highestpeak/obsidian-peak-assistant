/**
 * Types for the conversational (HITL) search agent.
 * Three-phase architecture: Orient → Explore (HITL loop) → Synthesize.
 */

import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import type { AISearchSource, AISearchTopic, DashboardBlock, SearchAgentResult } from '../AISearchAgent';

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** Accumulated state across the entire conversational search session. */
export interface ConversationalSearchState {
	/** Original user query. */
	userQuery: string;
	/** Phase the session is currently in. */
	phase: 'orient' | 'explore' | 'synthesize' | 'complete';
	/** Orient phase output. */
	orient?: OrientResult;
	/** Explore phase accumulated findings. */
	explore: ExploreState;
	/** Final synthesized result. */
	result?: SearchAgentResult;
	/** Token usage across the session. */
	tokenUsage: LLMUsage;
}

// ---------------------------------------------------------------------------
// Orient phase
// ---------------------------------------------------------------------------

/** Orient phase output: quick intuition-driven positioning. */
export interface OrientResult {
	/** Agent's understanding of what the user is looking for. */
	understanding: string;
	/** Candidate folders identified from L2 folder intuition. */
	candidateFolders: Array<{
		path: string;
		oneLiner: string;
		relevanceReason: string;
	}>;
	/** Initial file leads from quick FTS/vector search. */
	initialLeads: Array<{
		path: string;
		title: string;
		score: number;
	}>;
	/** Suggested exploration plan. */
	explorationPlan: string;
	/** Clarifying questions (if any). */
	clarifyingQuestions: string[];
}

// ---------------------------------------------------------------------------
// Explore phase (HITL)
// ---------------------------------------------------------------------------

/** Accumulated explore state across HITL iterations. */
export interface ExploreState {
	/** All discovered and verified file paths. */
	verifiedPaths: Set<string>;
	/** Key findings from each exploration round. */
	findings: ExploreFinding[];
	/** How many explore rounds have been completed. */
	roundCount: number;
}

/** A single finding from one explore round. */
export interface ExploreFinding {
	roundIndex: number;
	/** Paths discovered in this round. */
	paths: string[];
	/** Summary of what was found. */
	summary: string;
	/** Tools that were used. */
	toolsUsed: string[];
}

/** What the agent yields to the user at an HITL pause point. */
export interface ExploreSnapshot {
	/** Total verified paths so far. */
	totalPaths: number;
	/** Key findings so far. */
	findings: ExploreFinding[];
	/** Agent's assessment of coverage. */
	coverageAssessment: string;
	/** Agent's suggested next action. */
	suggestedNextAction: string;
	/** Confidence in current results. */
	confidence: 'high' | 'medium' | 'low';
}

/** User feedback at an HITL pause point. */
export interface UserFeedback {
	type: 'continue' | 'redirect' | 'focus_path' | 'add_constraint' | 'enough';
	/** Free-form message from the user. */
	message?: string;
	/** Specific path to focus on (for 'focus_path'). */
	focusPath?: string;
}

// ---------------------------------------------------------------------------
// Synthesize phase
// ---------------------------------------------------------------------------

/** Options for the synthesize phase. */
export interface SynthesizeOptions {
	/** Whether to include a Mermaid overview diagram. */
	includeMermaid?: boolean;
	/** Max word count for summary. */
	maxSummaryWords?: number;
}

// ---------------------------------------------------------------------------
// Agent options / events
// ---------------------------------------------------------------------------

export interface ConversationalSearchOptions {
	/** Enable local vault search in tools. */
	enableLocalSearch?: boolean;
	/** Max wall clock time in ms for the entire session (not per phase). */
	maxWallClockMs?: number;
	/** Max explore rounds before auto-synthesize. */
	maxExploreRounds?: number;
	/** Skip Orient and go straight to Explore (e.g. when user provides explicit paths). */
	skipOrient?: boolean;
}

/**
 * Stream events specific to conversational search (extends LLMStreamEvent).
 * The 'hitl-pause' event signals the UI to collect user feedback.
 */
export type ConversationalSearchEvent = LLMStreamEvent | {
	type: 'hitl-pause';
	snapshot: ExploreSnapshot;
	triggerName: string;
};

/** Check if an event is an HITL pause point. */
export function isHitlPauseEvent(ev: ConversationalSearchEvent): ev is { type: 'hitl-pause'; snapshot: ExploreSnapshot; triggerName: string } {
	return ev.type === 'hitl-pause';
}
