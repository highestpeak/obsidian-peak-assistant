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
import type { ContextManager } from '../context/ContextManager';
import type { MemoryStore } from '../memory/MemoryStore';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { DebugModelOperation, DebugSurface, DebugTracePort } from '@/core/debug-trace';

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
    | 'hook_block'
    | 'timeout';

/**
 * Coarse-grained lifecycle status for a completed run.
 *
 * Derived from `finishReason` after the loop settles:
 *   completed — natural stop / budget exhausted (stop | max_steps | max_tokens | max_tool_calls)
 *   failed    — provider or hook error (error | hook_block)
 *   cancelled — external abort signal (abort)
 *   timeout   — future budget-timer path (timeout)
 *
 * External consumers (Chat A3) can key on `status` for user-facing receipt UX
 * without matching every internal finishReason enum value. `finishReason` stays
 * stable for existing callers.
 */
export type AgentLoopStatus = 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Live run-state emitted through `run_status` events on the TraceBus / onStreamEvent
 * channel. Distinct from `AgentLoopStatus` (final result). This one is observable
 * during the run: `running` → `waiting-permission` → `running` → `completed|failed|…`.
 */
export type AgentLoopRunState =
    | 'running'
    | 'waiting-permission'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout';

/**
 * Unified stream event delivered via `onStreamEvent`. This is the single
 * subscription point Chat (A3) needs to reconstruct token / tool / step order.
 * All events in this union are also mirrored to the TraceBus so debug-trace
 * adapters continue to work. A consumer that only wants ordering should
 * subscribe to `onStreamEvent`; a consumer that wants selective event types
 * can still `.on(...)` the TraceBus.
 */
export type AgentLoopStreamEvent =
    | { type: 'loop_start'; loopId: string; startedAt: number }
    | { type: 'step_start'; loopId: string; stepIndex: number; tier: string; modelId: string }
    | { type: 'text_delta'; loopId: string; stepIndex: number; delta: string }
    | { type: 'reasoning_delta'; loopId: string; stepIndex: number; delta: string }
    | {
          type: 'tool_input_start';
          loopId: string;
          stepIndex: number;
          toolName: string;
          toolCallId: string;
      }
    | {
          type: 'tool_input_delta';
          loopId: string;
          stepIndex: number;
          toolCallId: string;
          delta: string;
      }
    | {
          type: 'tool_call';
          loopId: string;
          stepIndex: number;
          toolName: string;
          toolCallId: string;
          args: unknown;
      }
    | {
          type: 'tool_result';
          loopId: string;
          stepIndex: number;
          toolName: string;
          toolCallId: string;
          ok: boolean;
          payload: unknown;
          durationMs: number;
      }
    | {
          type: 'permission_request';
          loopId: string;
          stepIndex: number;
          requestId: string;
          toolName: string;
          argsSummary: unknown;
      }
    | {
          type: 'permission_resolved';
          loopId: string;
          stepIndex: number;
          requestId: string;
          decision: 'allow' | 'deny';
          reason?: string;
      }
    | {
          type: 'step_finish';
          loopId: string;
          stepIndex: number;
          finishReason: string;
          text: string;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
      }
    | {
          type: 'run_status';
          loopId: string;
          state: AgentLoopRunState;
          reason?: string;
      }
    | {
          type: 'error';
          loopId: string;
          stepIndex?: number;
          error: string;
      }
    | {
          type: 'loop_finish';
          loopId: string;
          finishReason: AgentLoopFinishReason;
          status: AgentLoopStatus;
          durationMs: number;
      };

/**
 * Payload delivered when the guard raises an `ask` decision. Resolver returns
 * a synchronous decision object; the AgentLoop treats undefined / thrown /
 * anything not `allow` as `deny` for safety.
 */
export interface PermissionAskRequest {
    loopId: string;
    stepIndex: number;
    requestId: string;
    toolName: string;
    toolKind?: string;
    /**
     * A shallow copy of the model-provided args. Consumers should treat this
     * as untrusted (model-authored) content; a UI layer should render it as
     * data, not markup.
     */
    args: unknown;
    /** Abort signal that fires if the loop is cancelled while awaiting. */
    signal: AbortSignal;
}

/**
 * Permission ask resolution (chat-studio §7.7 / spec §7.6).
 *
 * Three surface-level decisions map to two AgentLoop-level policies:
 *   • `allow`          — allow this ONE call only. The next same-tool ask
 *                        will still pause the run.
 *   • `allow-for-run`  — allow this call AND every subsequent ask for the
 *                        same tool inside the current run. The UI layer
 *                        caches the tool name and short-circuits the
 *                        resolver for the rest of the run.
 *   • `deny`           — reject this call; the loop skips it.
 *
 * `allow-for-run` behaves as `allow` inside the AgentLoop — the difference
 * is enforced by the resolver (see `useStreamChat` — a per-run Set of
 * allowed tool names). Downstream code that only knows about the loop's
 * two-state world stays unchanged.
 */
export type PermissionAskResolution = {
    decision: 'allow' | 'allow-for-run' | 'deny';
    reason?: string;
};

/**
 * Model-parameter knobs forwarded verbatim to Vercel AI SDK `streamText`.
 *
 * Introduced for task A3 (chat runtime migration) so callers that previously
 * passed `LLMOutputControlSettings` straight to `vercelStreamChat` can keep
 * temperature / topP / topK / max-tokens / penalty knobs actually reaching
 * the provider request. All fields are optional; anything absent uses the
 * model's default.
 *
 * Timeouts (`timeoutStepMs`, `timeoutTotalMs` in the legacy shape) are
 * intentionally NOT part of this channel — they belong to the caller/adapter
 * layer (see `harnessChatRunner`) so the AgentLoop stays purely about the
 * step/tool loop and does not need to own wall-clock policy.
 */
export interface AgentLoopModelSettings {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}

export interface AgentLoopConfig {
    loopId: string;
    systemPrompt: string;
    initialMessages: ModelMessage[];
    tools: ToolDef[];
    skills?: HarnessSkill[];
    tierController: TierController;
	/** App-owned provider-call observer. It never participates in routing. */
	debugTrace?: DebugTracePort | null;
	debugSurface?: DebugSurface;
	debugCapabilityId?: string;
	debugOperation?: Extract<DebugModelOperation, 'text.generate' | 'text.stream' | 'object.generate'>;
    budget?: Partial<AgentLoopBudget>;
    abortSignal?: AbortSignal;
    /**
     * Optional provider-level generation knobs forwarded to `streamText` on
     * every step. See `AgentLoopModelSettings`.
     */
    modelSettings?: AgentLoopModelSettings;
    /** Subscribe to per-event traces (alternative to providing your own TraceBus). */
    trace?: TraceBus;
    /** Per-step callback (post-step, post-score). */
    onStepFinish?: (step: StepResult) => void | Promise<void>;
    /**
     * Optional product-specific stop hook, evaluated after each completed
     * step and after `onStepFinish`. Return true to end the loop with
     * finishReason='stop'. This is intentionally narrower than hooks:
     * callers can express domain completion (for example submit_plan tool
     * succeeded) without teaching the model about a final-answer string.
     */
    stopWhen?: (step: StepResult) => boolean | Promise<boolean>;
    /**
     * How a step with assistant text and zero tool calls is interpreted.
     *
     * `true` (default) — chat-style: a bare-text step IS the final answer and
     * ends the loop (see `hasFinalAnswer`).
     *
     * `false` — the loop's completion is defined SOLELY by `stopWhen` (e.g. a
     * mandatory terminal tool such as `vault_submit_plan`). A bare-text step is
     * then treated as an intermediate turn — typically the model narrating its
     * plan before its first tool call, which the prompt may explicitly require
     * ("write before first tool call"). The loop keeps going instead of
     * mistaking that planning turn for a finished answer. Use with a caller
     * that always supplies `stopWhen`; otherwise the loop can only end on a
     * budget cap. `bareTextContinuationNudge` prods the model toward its next
     * tool call so it converges quickly.
     */
    treatBareTextAsFinal?: boolean;
    /**
     * Appended as a `user` message when a bare-text step is NOT treated as
     * final (see `treatBareTextAsFinal: false`). Nudges the model to proceed
     * to its next tool call instead of re-emitting prose, so the loop
     * converges. Ignored when `treatBareTextAsFinal` is true/absent.
     */
    bareTextContinuationNudge?: string;
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
    /**
     * Optional working-memory bag. When supplied, blocks (priority-sorted)
     * are injected into the system prompt at every step and feed
     * `ContextManager.compactIfNeeded` so the budget is enforced across
     * blocks + history together.
     */
    memory?: MemoryStore;
    /**
     * Optional context manager. When present, the loop runs `compactIfNeeded`
     * before each `generateText` call and emits `context_compacted` traces.
     * Absent → no compaction (M1+M2 behavior).
     */
    context?: ContextManager;
    /**
     * Compiled skill for the current run (from `SkillRegistry.compile()`).
     * When present, the loop consults `compiled.quarantine` before every
     * tool execution:
     *   - `permissive` → pass through (M1 behaviour).
     *   - `strict`     → reject tools not in `compiled.allowedTools` with a
     *                    synthetic `fail('skill-quarantine: ...', false)`
     *                    ToolResult, so the model can observe the denial
     *                    without the agent actually invoking the tool.
     */
    compiledSkill?: CompiledSkill;
    /**
     * Unified fan-out of every harness stream event in a single ordered stream.
     * When Chat consumes AgentLoop, it subscribes here and reconstructs the UI
     * timeline (text-delta, tool i/o, permission asks, step boundaries) without
     * having to combine TraceBus events with a separate token stream.
     *
     * The callback is invoked synchronously as events happen; expensive work
     * should be dispatched by the consumer.
     */
    onStreamEvent?: (event: AgentLoopStreamEvent) => void;
    /**
     * Called when the PermissionGuard raises an `ask` decision. Return
     * 'allow' or 'deny' (with optional reason). Absence = tool execution is
     * denied by default (safe fallback preserves current behavior — the M2
     * comment noted ask was equivalent to allow with acceptEdits; here for
     * mode='ask' we deny to avoid silent surprise). Rejecting/throwing is
     * treated as deny.
     *
     * The resolver receives an AbortSignal that fires when the AgentLoop is
     * aborted, so long-lived UI prompts can dismiss themselves.
     */
    resolvePermissionAsk?: (
        request: PermissionAskRequest,
    ) => Promise<PermissionAskResolution> | PermissionAskResolution;
}

export interface AgentLoopResult {
    loopId: string;
    finalText: string;
    steps: StepResult[];
    finishReason: AgentLoopFinishReason;
    /** Coarse lifecycle bucket — see AgentLoopStatus. */
    status: AgentLoopStatus;
    tierUsage: Record<ModelTier, number>;
    totalTokens: number;
    totalToolCalls: number;
    durationMs: number;
    error?: string;
}

/** Map a finishReason to the coarse-grained lifecycle bucket. */
export function deriveAgentLoopStatus(reason: AgentLoopFinishReason): AgentLoopStatus {
    switch (reason) {
        case 'abort':
            return 'cancelled';
        case 'timeout':
            return 'timeout';
        case 'error':
        case 'hook_block':
            return 'failed';
        case 'stop':
        case 'max_steps':
        case 'max_tokens':
        case 'max_tool_calls':
            return 'completed';
        default: {
            const _exhaustive: never = reason;
            return 'failed';
        }
    }
}
