/**
 * AgentLoop public types. See spec §3.4.
 */

import type { ModelMessage } from 'ai';
import type { TierController } from '../tier/TierController';
import type { ModelTier } from '../tier/types';
import type { ToolDef } from '../tool/types';
import type { HarnessSkill } from '../skill/types';
import type { StepResult, TraceBus } from '../trace/events';

export interface AgentLoopBudget {
    /** Hard cap on outer-loop iterations (one model call per iteration). */
    maxSteps: number;
    /** Cumulative prompt+completion token cap. */
    maxTokens: number;
    /** Cumulative tool execution cap. */
    maxToolCalls: number;
}

export const DEFAULT_BUDGET: AgentLoopBudget = {
    maxSteps: 5,
    maxTokens: 20_000,
    maxToolCalls: 10,
};

export type AgentLoopFinishReason =
    | 'stop'
    | 'max_steps'
    | 'max_tokens'
    | 'max_tool_calls'
    | 'abort'
    | 'error';

export interface AgentLoopConfig {
    loopId: string;
    systemPrompt: string;
    initialMessages: ModelMessage[];
    tools: ToolDef[];
    skills?: HarnessSkill[];
    tierController: TierController;
    budget?: Partial<AgentLoopBudget>;
    abortSignal?: AbortSignal;
    /** Subscribe to per-event traces (alternative to providing your own TraceBus). */
    trace?: TraceBus;
    /** Per-step callback (post-step, post-score). */
    onStepFinish?: (step: StepResult) => void | Promise<void>;
}

export interface AgentLoopResult {
    loopId: string;
    finalText: string;
    steps: StepResult[];
    finishReason: AgentLoopFinishReason;
    tierUsage: Record<ModelTier, number>;
    totalTokens: number;
    totalToolCalls: number;
    durationMs: number;
    error?: string;
}
