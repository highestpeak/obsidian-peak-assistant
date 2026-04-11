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

/** Agent loop execution statistics. */
export interface PeakAgentStats {
	totalIterations: number;
	totalToolCalls: number;
	stoppedReason: 'should_stop' | 'max_iterations' | 'callback_stop' | 'aborted';
	totalInputTokens: number;
	totalOutputTokens: number;
	totalDurationMs: number;
	/** Per-tool-call timing with detailed label. */
	toolCallTimings: Array<{ toolName: string; durationMs: number }>;
	/** Per-iteration phase timings (plan, tool execution, submit). */
	perIterationPhaseMs: Array<{ planMs: number; toolExecMs: number; submitMs: number }>;
	/** Detailed Stopwatch segments for debugging (e.g., plan-0, tool-exec-0, submit-0). */
	stopwatchSegments: Array<{ label: string; durationMs: number }>;
}

/** Configuration for agent loop execution. */
export interface PeakAgentConfig<TState, TSubmit> extends AgentLoopConfig<TState, TSubmit> {
	/** Human-readable step label shown in UI progress messages (e.g. "Classify query"). */
	stepLabel: string;

	/**
	 * Optional: summarize the submit result into a human-readable discovery message.
	 * If provided, emitted as a `📊 ...` agent-step-progress event after each submit.
	 */
	summarizeSubmit?: (submit: TSubmit) => string | null;
}

/** Result from running an agent loop. */
export interface PeakAgentLoopResult<TState> {
	finalState: TState;
	messages: ModelMessage[];
	stats: PeakAgentStats;
}

/** Events yielded by agent loops (same as LLMStreamEvent which now includes agent events). */
export type PeakAgentEvent = LLMStreamEvent;

/** A user message injected mid-loop (HITL). */
export interface UserFeedback {
	type: 'approve' | 'redirect' | 'add_paths' | 'remove_paths' | 'adjust_outline' | 'continue' | 'focus_path' | 'add_constraint' | 'enough' | 'stop';
	message?: string;
	/** Paths to add or remove (for 'add_paths' / 'remove_paths'). */
	paths?: string[];
	/** New outline text (for 'adjust_outline'). */
	outline?: string;
	/** Path to focus on (for 'focus_path'). */
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
