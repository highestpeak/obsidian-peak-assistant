// Tool envelope types (T2 / T5 shared vocabulary).
//
// Extracted from `service/agents/harness/tool/types.ts` so `core/ports/*`
// can reference the tool contract without inverting the layering. Both
// files share the same definitions — the service file re-exports from
// here to preserve the existing import paths for downstream code.
//
// Design notes:
//   - `ToolResult` is a discriminated union. Tools never throw for
//     business errors; the loop surfaces `{ ok: false, error, recoverable }`
//     so the model can decide whether to retry.
//   - `ToolSource` (T5) tags the origin — where a tool came from
//     (local / MCP / Obsidian command). Optional today for backward
//     compat; the T5 shape guard test locks the union.
//   - This module contains a small pair of runtime helpers (`ok` /
//     `fail`) because callers use them at the same time they use the
//     `ToolResult` shape. Keeping them together avoids a second import.

import type { ZodTypeAny } from 'zod';
import type { ModelTier } from './model-tier';

/**
 * Context passed to a tool's `execute` call by the harness. Loop
 * identifier + step index give the tool information about where in
 * an agent's turn it is running; `signal` is the combined external +
 * budget-based abort signal.
 */
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

/**
 * T5 — origin discriminator for a ToolDef. Producers should set it;
 * consumers may assume `'local'` when absent.
 *   - 'local'            — in-tree agent tool (chat tools, agent-specific ops).
 *   - 'mcp'              — external MCP server, namespaced `mcp_<server>_<tool>`.
 *   - 'obsidian-command' — Obsidian command exposed via T12 Command Gateway.
 */
export type ToolSource = 'local' | 'mcp' | 'obsidian-command';

export interface ToolDef<TInput = any, TOutput = unknown> {
	name: string;
	description: string;
	inputSchema: ZodTypeAny;
	/**
	 * Optional origin discriminator (see ToolSource). Consumers may
	 * assume `'local'` when absent.
	 */
	source?: ToolSource;
	/** Tier whitelist. Undefined = all tiers. */
	allowedTiers?: ModelTier[];
	/**
	 * Permission classification consumed by the harness PermissionGuard.
	 * Defaults to 'read' if unspecified — tools that mutate state should
	 * declare 'edit' or 'destructive' explicitly.
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
