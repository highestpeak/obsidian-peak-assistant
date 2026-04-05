/**
 * Core types for the manual agent loop (replacing ai-sdk Experimental_Agent).
 * All recon / exploration agents share these primitives.
 */

import type { ModelMessage } from 'ai';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import type { AgentTool } from '@/service/tools/types';

/** A single plan → tool-call → submit iteration result. */
export interface AgentLoopIterationResult<TSubmit> {
	iteration: number;
	planMessages: ModelMessage[];
	toolResultsFull: ModelMessage[];
	toolResultsSummary: ModelMessage[];
	submit: TSubmit | undefined;
	shouldStop: boolean;
}

/** Callback after each iteration completes; return false to force-stop the loop. */
export type OnIterationComplete<TSubmit> = (
	result: AgentLoopIterationResult<TSubmit>,
) => boolean | void;

/** Configuration for a generic plan → tool → submit loop. */
export interface AgentLoopConfig<TState, TSubmit> {
	/** Max iterations before forced stop. */
	maxIterations: number;

	/** Tools available in the plan step. */
	tools: Record<string, AgentTool>;

	/** Build the initial user message(s) for the first iteration. */
	buildInitialMessages: (state: TState) => Promise<ModelMessage[]>;

	/** Build system prompt for the plan step. */
	buildPlanSystemPrompt: (state: TState, iteration: number) => Promise<string>;

	/** Optional: inject extra messages before each plan step (e.g. task reminder, current state). */
	buildPlanInjection?: (state: TState, iteration: number, history: ModelMessage[]) => ModelMessage[];

	/** Whether tool call is required, auto, or none for the plan step. */
	toolChoice?: 'auto' | 'required' | 'none';

	/**
	 * Run the structured submit step after tool execution.
	 * Return undefined to skip submit for this iteration.
	 */
	runSubmit?: (state: TState, iteration: number, planMessages: ModelMessage[], toolResults: ModelMessage[]) => Promise<TSubmit | undefined>;

	/** Merge submit result into state. */
	mergeSubmit?: (state: TState, submit: TSubmit) => TState;

	/** Determine whether to stop after submit. */
	shouldStop?: (state: TState, submit: TSubmit | undefined, iteration: number) => boolean;

	/** Called after each iteration. */
	onIterationComplete?: OnIterationComplete<TSubmit>;
}

/** Accumulated stats from an agent loop run. */
export interface AgentLoopStats {
	totalIterations: number;
	totalToolCalls: number;
	stoppedReason: 'should_stop' | 'max_iterations' | 'callback_stop';
}

/** Events yielded by the agent loop for UI / debug consumption. */
export type AgentLoopEvent = LLMStreamEvent;

/** A user message injected mid-loop (HITL). */
export interface UserFeedback {
	type: 'continue' | 'redirect' | 'focus_path' | 'stop';
	message?: string;
	/** Path to focus on (for 'focus_path' type). */
	focusPath?: string;
}

/** Encapsulates the HITL pause point: the agent yields this, waits for user input. */
export interface HitlPausePoint<TSnapshot> {
	/** What the agent found so far. */
	snapshot: TSnapshot;
	/** Agent's suggested next action. */
	suggestedNextAction: string;
	/** Confidence level. */
	confidence: 'high' | 'medium' | 'low';
}
