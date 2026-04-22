/**
 * Canonical trace record types for agent trace observability.
 *
 * Two JSONL projections share this schema:
 *   - meta.jsonl: content fields omitted (only shape / summary)
 *   - full.jsonl: all content fields populated, tool output truncated at tool-cap
 *
 * Both files are sequences of CanonicalEvent values.
 * See docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md §3.1
 */

export type InvocationTrack = 'cli' | 'obsidian';

export type StoppedReason =
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
    | 'aborted';

export interface UsageSummary {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    totalTokens: number;
    costUSD?: number;
}

export interface SessionHeader {
    type: 'session';
    sessionId: string;
    ts: string; // ISO 8601
    agentName: string;
    scenarioName?: string;
    intent?: string;
    profileId: string;
    model: string;
    fixture?: string; // CLI track only
    track: InvocationTrack;
}

export interface ToolCallRecord {
    toolName: string;
    toolUseId: string;
    durationMs: number;
    /** Meta projection: shape descriptors only, e.g. { query: 'string(12)', path: 'string(32)' } */
    inputShape: Record<string, string>;
    /** Full projection: raw input as returned from the model */
    input?: unknown;
    /** Full projection: raw tool output, possibly truncated */
    output?: string;
    /** Full projection: true if output was truncated by truncate-tool-output */
    outputTruncated?: boolean;
    /** Full projection: original byte size of output before truncation (undefined if not truncated) */
    originalOutputBytes?: number;
}

export interface IterationEvent {
    type: 'iteration';
    index: number;
    planMs: number;
    toolCount: number;
    toolCalls: ToolCallRecord[];
    /** Full projection: assistant-facing text and reasoning from the SDK assistant message */
    plan?: {
        systemPromptHash?: string;
        systemPromptPreview?: string;
        assistantText: string;
        thinking?: string;
    };
}

export interface FinalEvent {
    type: 'final';
    stoppedReason: StoppedReason;
    totalIterations: number;
    totalToolCalls: number;
    durationMs: number;
    usage: UsageSummary;
    /** Meta projection: shape descriptor only */
    finalOutputShape: { kind: string; length?: number };
    /** Full projection: the full result string if available */
    finalOutput?: string;
    /** If stoppedReason indicates error */
    error?: { message: string };
}

export type CanonicalEvent = SessionHeader | IterationEvent | FinalEvent;

/** Type guards */
export const isSessionHeader = (e: CanonicalEvent): e is SessionHeader => e.type === 'session';
export const isIterationEvent = (e: CanonicalEvent): e is IterationEvent => e.type === 'iteration';
export const isFinalEvent = (e: CanonicalEvent): e is FinalEvent => e.type === 'final';

/**
 * A TraceBuffer is the in-memory representation an emitting sink holds until flush().
 * Both projections are derived from this buffer, not from two parallel event streams.
 */
export interface TraceBuffer {
    header: SessionHeader;
    iterations: IterationEvent[];
    final?: FinalEvent;
}
