/**
 * AgentLoop public types. See spec §3.4.
 */

import type { ModelMessage } from 'ai';
import type { TierController } from '../tier/TierController';
import type { ModelTier } from '../tier/types';
import type { ToolDef } from '../tool/types';
import type { HarnessSkill } from '../skill/types';
import type { StepResult, TraceBus } from '../trace/events';
import type { HookBus } from '../hook/HookBus';
import type { PermissionGuard } from '../permission/PermissionGuard';
import type { SubAgentDefinition } from '../subagent/types';

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
    | 'error'
    | 'hook_block';

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
    /**
     * Hook bus invoked at session_start / stop / pre_tool_use / post_tool_use.
     * Hooks run in harness layer, not via the model — see spec §3.6.
     */
    hooks?: HookBus;
    /**
     * Permission guard. If absent, every tool call is allowed (legacy M1
     * behavior). When present, the deny-first invariant is enforced.
     */
    permission?: PermissionGuard;
    /**
     * Subagents auto-wrapped as tools on the parent toolset. Each definition
     * surfaces as `subagent.<name>` in the parent model's tool list.
     */
    subagents?: SubAgentDefinition[];
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
