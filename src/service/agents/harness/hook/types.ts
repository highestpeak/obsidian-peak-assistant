/**
 * Hook system — guarantees behavior at deterministic points in the loop.
 * See spec §3.6: "Hooks guarantee behavior; prompts suggest it."
 *
 * M2 supports inline TS function hooks. Shell command hooks (Claude Code
 * style) are deferred to M5 when settings UI exposes them — running shell
 * from inside the Obsidian process introduces sandboxing concerns we don't
 * want to tackle yet.
 */

import type { ModelTier } from '../tier/types';
import type { ToolResult } from '../tool/types';

export type HookEvent = 'session_start' | 'stop' | 'pre_tool_use' | 'post_tool_use';

export interface HookSessionPayload {
    loopId: string;
    timestamp: number;
}

export interface HookToolCallPayload {
    loopId: string;
    stepIndex: number;
    tier: ModelTier;
    toolName: string;
    toolCallId: string;
    args: unknown;
}

export interface HookToolResultPayload extends HookToolCallPayload {
    /** The tool's returned ToolResult — handlers may inspect ok/error/data. */
    result: ToolResult;
}

export interface HookContextMap {
    session_start: HookSessionPayload;
    stop: HookSessionPayload;
    pre_tool_use: HookToolCallPayload;
    post_tool_use: HookToolResultPayload;
}

export type HookContext<E extends HookEvent = HookEvent> = HookContextMap[E];

/**
 * The outcome of running a single hook.
 *  - continue : do nothing, proceed
 *  - block    : abort the operation; the supplied reason is surfaced back to
 *               the model as a tool error (for pre/post_tool_use) or causes
 *               the loop to exit (for session_start/stop)
 *  - modify   : (post_tool_use only) replace the tool result with `result`
 */
export type HookResult =
    | { kind: 'continue' }
    | { kind: 'block'; reason: string }
    | { kind: 'modify'; result: ToolResult };

export type HookHandler<E extends HookEvent> = (
    ctx: HookContext<E>,
) => HookResult | void | Promise<HookResult | void>;

/**
 * Registration descriptor. `matcher` filters by tool name for tool-scoped
 * hooks (pre_tool_use / post_tool_use); ignored for session events.
 */
export interface HookConfig<E extends HookEvent = HookEvent> {
    event: E;
    matcher?: string | RegExp;
    handler?: HookHandler<E>;
}
