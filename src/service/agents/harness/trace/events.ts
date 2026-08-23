/**
 * Trace events emitted by the harness. UI/observers subscribe via TraceBus.
 * Kept dependency-free so any layer can produce/consume events.
 */

import type { ModelTier } from '../tier/types';
import type { CompactSummary } from '@/core/context/compactSummary';

export interface ToolCallTrace {
    toolName: string;
    toolCallId: string;
    args: unknown;
}

export interface ToolResultTrace {
    toolName: string;
    toolCallId: string;
    ok: boolean;
    /** Raw payload (data or error string). */
    payload: unknown;
    durationMs: number;
}

export interface StepResult {
    loopId: string;
    stepIndex: number;
    tier: ModelTier;
    modelId: string;
    providerId: string;
    promptTokens: number;
    completionTokens: number;
    /** Provider-reported reasoning tokens included within completionTokens. */
    reasoningTokens?: number;
    cachedInputTokens?: number;
    totalTokens: number;
    toolCalls: ToolCallTrace[];
    toolResults: ToolResultTrace[];
    text: string;
    finishReason: string;
    selfScore?: number;
    durationMs: number;
}

export interface TierUpgradeEvent {
    loopId: string;
    from: ModelTier;
    to: ModelTier;
    reason: string;
    auto: boolean;
}

export interface ContextCompactedEvent {
    loopId: string;
    stepIndex: number;
    /** Tokens estimated before compaction ran (input). */
    tokensBefore: number;
    /** Tokens estimated after compaction (kept blocks + windowed messages). */
    tokensAfter: number;
    /** Number of MemoryBlock entries dropped (evictable, lowest priority first). */
    droppedBlocks: number;
    /** Count of middle messages folded into the summary placeholder. */
    droppedMessages: number;
    /**
     * Recoverable-compaction anchor records (Track D). One entry per dropped
     * block; plus one entry when the message window was folded. Trace UI can
     * render "N blocks dropped / M messages folded" with refetch hints
     * without touching the ContextManager result.
     */
    compactSummaries: CompactSummary[];
}

export interface PermissionCheckEvent {
    loopId: string;
    stepIndex: number;
    toolName: string;
    /** 'permission' = user permission guard; 'quarantine' = compiled-skill quarantine. */
    source: 'permission' | 'quarantine';
    /**
     * 'allow' | 'deny' | 'ask'. Deny short-circuits tool execution. 'ask' is
     * emitted when the guard suspends the tool call awaiting an external
     * resolver — the eventual allow/deny surfaces via the paired
     * `permission_resolved` event (with the same requestId at the AgentLoop
     * layer), not a second `permission_check`. Trace consumers that switch
     * on this value must handle 'ask' explicitly to avoid mis-classifying a
     * suspension as an approval.
     */
    decision: 'allow' | 'deny' | 'ask';
    /** Human-readable reason string surfaced by the guard. */
    reason?: string;
}

/**
 * Chat-facing streaming events emitted while a step is in flight. Chat needs
 * these to drive token-by-token UI without waiting for step_finish. They fire
 * *inside* the streamText fullStream loop, ordered per-provider.
 */
export interface TextDeltaEvent {
    loopId: string;
    stepIndex: number;
    delta: string;
}

export interface ReasoningDeltaEvent {
    loopId: string;
    stepIndex: number;
    delta: string;
}

export interface ToolInputStartEvent {
    loopId: string;
    stepIndex: number;
    toolName: string;
    toolCallId: string;
}

export interface ToolInputDeltaEvent {
    loopId: string;
    stepIndex: number;
    toolCallId: string;
    delta: string;
}

/**
 * Emitted when PermissionGuard returns an `ask` decision and the AgentLoop
 * suspends the tool call waiting on an external resolver.
 */
export interface PermissionRequestEvent {
    loopId: string;
    stepIndex: number;
    requestId: string;
    toolName: string;
    /** Model-supplied args, forwarded verbatim (untrusted). */
    argsSummary: unknown;
}

export interface PermissionResolvedEvent {
    loopId: string;
    stepIndex: number;
    requestId: string;
    decision: 'allow' | 'deny';
    reason?: string;
}

/**
 * Live run-state transitions. Emitted at least on start
 * (`running`), on ask suspension (`waiting-permission`), on ask resolution
 * (back to `running`), and on the final state (mirrors AgentLoopResult.status).
 */
export interface RunStatusEvent {
    loopId: string;
    state: 'running' | 'waiting-permission' | 'completed' | 'failed' | 'cancelled' | 'timeout';
    reason?: string;
}

export type TraceEventMap = {
    step_start: { loopId: string; stepIndex: number; tier: ModelTier; modelId: string };
    step_finish: StepResult;
    tool_call: ToolCallTrace & { loopId: string; stepIndex: number };
    tool_result: ToolResultTrace & { loopId: string; stepIndex: number };
    tier_escalate: TierUpgradeEvent;
    loop_start: { loopId: string; startedAt: number };
    loop_finish: { loopId: string; finishReason: string; durationMs: number };
    context_compacted: ContextCompactedEvent;
    permission_check: PermissionCheckEvent;
    text_delta: TextDeltaEvent;
    reasoning_delta: ReasoningDeltaEvent;
    tool_input_start: ToolInputStartEvent;
    tool_input_delta: ToolInputDeltaEvent;
    permission_request: PermissionRequestEvent;
    permission_resolved: PermissionResolvedEvent;
    run_status: RunStatusEvent;
};

export type TraceEventName = keyof TraceEventMap;
export type TraceHandler<E extends TraceEventName> = (payload: TraceEventMap[E]) => void;

export class TraceBus {
    private handlers = new Map<TraceEventName, Set<TraceHandler<any>>>();

    on<E extends TraceEventName>(event: E, handler: TraceHandler<E>): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler);
        return () => set!.delete(handler);
    }

    emit<E extends TraceEventName>(event: E, payload: TraceEventMap[E]): void {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const h of set) {
            try {
                h(payload);
            } catch (err) {
                console.error(`[TraceBus] handler error for ${event}:`, err);
            }
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}
