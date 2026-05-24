/**
 * Pure predicates used by AgentLoop to decide when to bail out. Kept
 * separate so tests can drive them in isolation.
 */

import type { AgentLoopBudget, AgentLoopFinishReason } from './types';
import type { StepResult } from '../trace/events';

export interface LoopRunState {
    steps: StepResult[];
    totalTokens: number;
    totalToolCalls: number;
    aborted: boolean;
}

/** Returns a finish reason if the loop must halt now, otherwise null. */
export function evaluateStopConditions(state: LoopRunState, budget: AgentLoopBudget): AgentLoopFinishReason | null {
    if (state.aborted) return 'abort';
    if (state.steps.length >= budget.maxSteps) return 'max_steps';
    if (state.totalTokens >= budget.maxTokens) return 'max_tokens';
    if (state.totalToolCalls >= budget.maxToolCalls) return 'max_tool_calls';
    return null;
}

/** A step containing assistant text and zero tool calls is a final answer. */
export function hasFinalAnswer(step: StepResult | undefined): boolean {
    if (!step) return false;
    return step.toolCalls.length === 0 && (step.finishReason === 'stop' || step.text.trim().length > 0);
}

export function budgetExceeded(state: LoopRunState, budget: AgentLoopBudget): boolean {
    return state.totalTokens >= budget.maxTokens || state.totalToolCalls >= budget.maxToolCalls;
}

export function abortRequested(signal?: AbortSignal): boolean {
    return !!signal?.aborted;
}
