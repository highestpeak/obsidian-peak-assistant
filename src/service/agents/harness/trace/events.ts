/**
 * Trace events emitted by the harness. UI/observers subscribe via TraceBus.
 * Kept dependency-free so any layer can produce/consume events.
 */

import type { ModelTier } from '../tier/types';

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

export type TraceEventMap = {
    step_start: { loopId: string; stepIndex: number; tier: ModelTier; modelId: string };
    step_finish: StepResult;
    tool_call: ToolCallTrace & { loopId: string; stepIndex: number };
    tool_result: ToolResultTrace & { loopId: string; stepIndex: number };
    tier_escalate: TierUpgradeEvent;
    loop_start: { loopId: string; startedAt: number };
    loop_finish: { loopId: string; finishReason: string; durationMs: number };
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
