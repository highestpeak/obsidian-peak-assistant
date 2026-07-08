// Debug Trace Port — the interface UI / composition layers depend on.
//
// The concrete implementation is `DebugTraceRecorder`; consumers that only
// need to record spans depend on this port so alternate implementations
// (no-op, off-thread, sqlite-backed) can drop in without churn.

import type {
	DebugDecision,
	DebugPayloadInput,
	DebugRedactionMode,
	DebugRun,
	DebugSpan,
	DebugSummary,
	StartDebugRunInput,
	StartSpanInput,
} from './types';

export interface DebugSpanHandle {
	readonly spanId: string;
	setInput(payload: DebugPayloadInput): void;
	setOutput(payload: DebugPayloadInput): void;
	setParams(params: Record<string, unknown>): void;
	mergeParams(params: Record<string, unknown>): void;
	addMetric(key: string, value: number): void;
	addDecision(decision: DebugDecision): void;
	setError(err: { message: string; stack?: string }): void;
	child(input: StartSpanInput): DebugSpanHandle;
	finish(): DebugSpan;
}

export interface DebugRunHandle {
	readonly traceId: string;
	readonly runId: string;
	startSpan(input: StartSpanInput): DebugSpanHandle;
	mergeSummary(summary: DebugSummary): void;
	finish(status: 'completed' | 'failed' | 'cancelled', summary?: DebugSummary): DebugRun;
	snapshot(): DebugRun;
}

export interface DebugTracePort {
	isEnabled(): boolean;
	currentMode(): DebugRedactionMode;
	setMode(mode: DebugRedactionMode): void;

	startRun(input: StartDebugRunInput): DebugRunHandle;

	listRecent(limit?: number): DebugRun[];
	getRun(runId: string): DebugRun | undefined;
	clearAll(): void;
}
