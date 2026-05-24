/**
 * Harness Tool model. See spec §3.2.
 *
 * Tools declare a zod inputSchema (compiled into JSON Schema by the AI SDK)
 * and return a typed ToolResult — never throw for business errors. The loop
 * surfaces `{ ok: false, error, recoverable }` back to the model so it can
 * decide whether to retry or change strategy.
 */

import type { ZodTypeAny } from 'zod';
import type { ModelTier } from '../tier/types';

export interface ToolExecCtx {
    loopId: string;
    stepIndex: number;
    tier: ModelTier;
    /** Combined abort signal (external + loop budget). */
    signal: AbortSignal;
}

export type ToolResult<T = unknown> =
    | { ok: true; data: T; tokensEstimate?: number }
    | { ok: false; error: string; recoverable: boolean };

export interface ToolDef<TInput = any, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: ZodTypeAny;
    /** Tier whitelist. Undefined = all tiers. */
    allowedTiers?: ModelTier[];
    /**
     * Optional classification used by PermissionGuard. Defaults to 'read' if
     * unspecified — tools that mutate state should declare 'edit' or
     * 'destructive' explicitly.
     */
    kind?: 'read' | 'edit' | 'destructive' | 'meta';
    execute(args: TInput, ctx: ToolExecCtx): Promise<ToolResult<TOutput>>;
}

export function ok<T>(data: T, tokensEstimate?: number): ToolResult<T> {
    return tokensEstimate === undefined
        ? { ok: true, data }
        : { ok: true, data, tokensEstimate };
}

export function fail(error: string, recoverable = true): ToolResult<never> {
    return { ok: false, error, recoverable };
}
