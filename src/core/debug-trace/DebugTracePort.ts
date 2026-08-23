// Debug Trace Port — the interface UI / composition layers depend on.
//
// The concrete implementation is `DebugTraceRecorder`; consumers that only
// need to record spans depend on this port so alternate implementations
// (no-op, off-thread, sqlite-backed) can drop in without churn.

import type {
	DebugDecision,
	DebugPayloadInput,
	CompleteDebugModelCallInput,
	DebugModelCall,
	DebugRedactionMode,
	DebugRun,
	DebugSpan,
	DebugSummary,
	StartDebugRunInput,
	StartDebugModelCallInput,
	StartSpanInput,
} from './types';

export interface DebugModelCallHandle {
	readonly callId: string;
	replaceRequest(payload: DebugPayloadInput): void;
	updateStream(input: { response?: DebugPayloadInput; reasoning?: DebugPayloadInput }): void;
	succeed(input?: CompleteDebugModelCallInput): DebugModelCall;
	fail(error: unknown, input?: CompleteDebugModelCallInput): DebugModelCall;
	cancel(reason?: string): DebugModelCall;
	snapshot(): DebugModelCall;
}

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
	startModelCall(input: StartDebugModelCallInput): DebugModelCallHandle;

	listRecent(limit?: number): DebugRun[];
	getRun(runId: string): DebugRun | undefined;
	listModelCalls(limit?: number): DebugModelCall[];
	getModelCall(callId: string): DebugModelCall | undefined;
	subscribe(listener: () => void): () => void;
	clearAll(): void;
}
