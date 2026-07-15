export type UsageFeature = 'chat' | 'search_analysis' | 'copilot' | 'graph' | 'indexing' | 'internal' | 'skill' | 'query_rewrite';

export interface UsageRecordPayload {
    sessionId: string;
    feature: UsageFeature;
    action: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    costUsd: number;
    durationMs: number;
    isStreaming: boolean;
    metadata?: Record<string, unknown>;
}

export interface UsageKPIs {
    totalTokens: number;
    totalCostUsd: number;
    callCount: number;
    avgDurationMs: number;
    p95DurationMs: number;
    prevTotalTokens: number;
    prevTotalCostUsd: number;
}

export type TimeRange = 'today' | '7d' | '30d' | 'all';

// ── Outcome events (telemetry layer) ────────────────────────────────────────

/**
 * Closed enum of outcome events that follow a usage_log row. Used for the
 * Usage Dashboard's "useful message" rate (MPG) and shared with agent-trace /
 * copilot-review / search-analytics surfaces.
 *
 * - vault_save: user saved / copied an AI message to a note
 * - copilot_accept: user accepted a copilot inline suggestion
 * - search_click: user opened a search result
 * - agent_file_emit: agent execution wrote a file to vault
 * - continuation: user sent next message within 60s (engagement signal)
 */
export type UsageOutcomeEventType =
    | 'vault_save'
    | 'copilot_accept'
    | 'search_click'
    | 'agent_file_emit'
    | 'continuation';

/** Closed set as a runtime tuple for validation. */
export const USAGE_OUTCOME_EVENT_TYPES: readonly UsageOutcomeEventType[] = [
    'vault_save',
    'copilot_accept',
    'search_click',
    'agent_file_emit',
    'continuation',
] as const;

export interface RecordEventInput {
    message_id: string;
    session_id: string;
    event_type: UsageOutcomeEventType;
    /** Optional unix-ms; defaults to Date.now() at record time. */
    occurred_at?: number;
    /** vault path / search result path / file path */
    target?: string;
    /** event-specific fields (click rank, accepted line count, etc.) — serialized to metadata_json */
    metadata?: Record<string, unknown>;
}
