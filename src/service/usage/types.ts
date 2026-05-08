export type UsageFeature = 'chat' | 'search_analysis' | 'copilot' | 'graph' | 'indexing' | 'internal';

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
