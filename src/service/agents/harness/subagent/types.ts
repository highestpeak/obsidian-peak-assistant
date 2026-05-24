/**
 * SubAgent — delegated mini-loop with isolated context. See spec §3.5.
 *
 * The parent agent never sees subagent internals; from its POV a subagent is
 * just a tool whose argument is a prompt and whose output is a textual
 * summary plus a few cheap stats. This keeps parent context lean and isolates
 * subagent failures.
 */

import type { ModelTier } from '../tier/types';
import type { PermissionConfig } from '../permission/types';
import type { ToolDef } from '../tool/types';
import type { AgentLoopFinishReason } from '../loop/types';
import type { HookBus } from '../hook/HookBus';
import type { TraceBus } from '../trace/events';
import type { TierController } from '../tier/TierController';

export interface SubAgentDefinition {
    /** Stable identifier exposed as the tool name in the parent loop. */
    name: string;
    /**
     * Short description: the parent model reads this to decide when to
     * delegate. Keep ≤ 200 chars.
     */
    description: string;
    systemPrompt: string;
    /** Tools the subagent may use. Whitelist; never inherits parent tools. */
    tools: ToolDef[];
    /**
     * Tier the subagent runs at. Either a fixed tier (binding looked up via
     * the parent's TierController bindings) or `inherit` to start at whatever
     * the parent is currently using.
     */
    tier?: ModelTier | 'inherit';
    /** Subagent loop budget. Defaults to maxSteps=5. */
    maxTurns?: number;
    /** Permission config for the subagent; defaults to parent's mode. */
    permission?: PermissionConfig;
}

/**
 * Trimmed summary handed back to the parent. We deliberately do not return
 * full step traces here — that's the whole point of subagent isolation.
 */
export interface SubAgentDispatchSummary {
    name: string;
    finalText: string;
    finishReason: AgentLoopFinishReason;
    steps: number;
    totalTokens: number;
    totalToolCalls: number;
    durationMs: number;
    error?: string;
}

export interface DispatchOptions {
    /** Optional explicit loopId for the child; defaults to parent + counter. */
    loopId?: string;
    /** Abort signal forwarded to the child loop. */
    abortSignal?: AbortSignal;
}

export interface DispatcherCtx {
    parentLoopId: string;
    /** TierController used to look up the binding for `tier`. */
    tierController: TierController;
    /** Optional shared TraceBus so subagent events can be observed. */
    trace?: TraceBus;
    /** Optional shared HookBus passed into the child loop. */
    hooks?: HookBus;
}
