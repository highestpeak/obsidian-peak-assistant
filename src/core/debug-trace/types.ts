// Debug Trace Infrastructure — type-only module.
//
// Kept pure types: no class, no function, no import from anything but
// standard TypeScript utility types. The companion test
// `test/debug-trace-recorder.test.ts` enforces this via source-string scan
// so this file remains the shape source-of-truth.
//
// Relationship to RunEnvelope (T3A):
//   - Every DebugRun references a RunEnvelope `runId`. If a surface has a
//     RunEnvelope adopter, DebugRun piggybacks on the same runId. If a
//     surface does not (e.g. Search), the recorder mints its own runId via
//     the injected id factory.
//   - DebugRun does NOT replace RunEnvelope. RunEnvelope owns lifecycle
//     (status/artifact), DebugRun owns span-level "why did this happen"
//     data.
//
// Redaction:
//   - `raw` is the only field that may contain unredacted content. It is
//     dropped entirely when the recorder runs in `redacted` mode, so a
//     downstream formatter cannot accidentally leak it.
//   - `excerpt` is always safe to render: capped, secret-scrubbed, hashed.

export type DebugSurface = 'chat' | 'search' | 'agent' | 'ambient' | 'analyze';

export type DebugSpanKind =
	| 'model.call'
	| 'tool.call'
	| 'retrieval.recall'
	| 'retrieval.merge'
	| 'ranking.score'
	| 'filter.decision'
	| 'context.assemble'
	| 'context.compact'
	| 'permission.check'
	| 'artifact.write'
	| 'trigger.fire'
	| 'custom';

export type DebugRedactionMode = 'off' | 'redacted' | 'raw';

/** Effective mode a recorded span was captured under. `off` never appears. */
export type DebugSpanRedaction = 'redacted' | 'raw';

export interface DebugPayload {
	/** Safe short preview (<= excerptCap chars, secret-scrubbed). */
	readonly excerpt: string;
	/** Stable hash of the pre-redaction content (hex, sha256-like). */
	readonly contentHash: string;
	/** Original content length in characters. */
	readonly length: number;
	/** Optional MIME-like hint: 'text/markdown' | 'application/json' | 'query' | ... */
	readonly contentType?: string;
	/** Full body. Present only when `raw` mode was in effect for this span. */
	readonly raw?: string;
	/** Notes from the redactor about secret patterns that were scrubbed. */
	readonly redactionHits?: readonly DebugRedactionHit[];
}

export interface DebugRedactionHit {
	readonly pattern: string;
	readonly count: number;
}

export type DebugDecisionKind = 'keep' | 'drop' | 'promote' | 'demote' | 'skip' | 'deny';

export interface DebugDecision {
	readonly decision: DebugDecisionKind;
	readonly reason: string;
	readonly target?: string;
	readonly score?: number;
	readonly meta?: Readonly<Record<string, unknown>>;
}

export interface DebugSpan {
	readonly spanId: string;
	readonly parentSpanId?: string;
	readonly traceId: string;
	readonly runId: string;
	readonly surface: DebugSurface;
	readonly kind: DebugSpanKind;
	readonly name: string;
	readonly startedAt: number;
	readonly endedAt: number;
	readonly durationMs: number;
	readonly input?: DebugPayload;
	readonly output?: DebugPayload;
	readonly params?: Readonly<Record<string, unknown>>;
	readonly metrics?: Readonly<Record<string, number>>;
	readonly decisions?: readonly DebugDecision[];
	readonly redaction: DebugSpanRedaction;
	readonly error?: {
		readonly message: string;
		readonly stack?: string;
	};
}

export type DebugRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface DebugSummary {
	/** Free-form key/value hints the formatter renders as a summary block. */
	readonly [key: string]: unknown;
}

export interface DebugRun {
	readonly version: 1;
	readonly traceId: string;
	readonly runId: string;
	readonly surface: DebugSurface;
	readonly capabilityId?: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly status: DebugRunStatus;
	readonly redactionMode: DebugSpanRedaction;
	readonly spans: readonly DebugSpan[];
	readonly summary?: DebugSummary;
}

export interface StartDebugRunInput {
	readonly surface: DebugSurface;
	readonly capabilityId?: string;
	/**
	 * If the caller already owns a RunEnvelope runId (chat / harness / copilot
	 * / analysis) it should be passed here so the debug run and the RunEnvelope
	 * session are joinable by runId. If omitted, the recorder mints one via
	 * its id factory.
	 */
	readonly runId?: string;
	readonly summary?: DebugSummary;
}

export interface StartSpanInput {
	readonly kind: DebugSpanKind;
	readonly name: string;
	readonly parentSpanId?: string;
}

export interface DebugPayloadInput {
	/** Full body. May contain secrets; recorder decides whether to keep it. */
	readonly raw: string;
	readonly contentType?: string;
	/** Optional pre-computed excerpt. If absent, the recorder derives one. */
	readonly excerpt?: string;
}

export type DebugModelOperation =
	| 'text.generate'
	| 'text.stream'
	| 'object.generate'
	| 'embedding.generate'
	| 'media.generate'
	| 'speech.transcribe';

export type DebugModelCallPhase =
	| 'request'
	| 'streaming'
	| 'response'
	| 'failed'
	| 'cancelled';

export interface DebugModelCallError {
	readonly message: string;
	readonly stack?: string;
}

/**
 * Provider-bound lifecycle receipt. Unlike DebugRun spans this shape includes
 * active work, so Diagnostics can show a request before the provider returns.
 */
export interface DebugModelCall {
	readonly version: 1;
	readonly callId: string;
	readonly runId?: string;
	readonly surface: DebugSurface;
	readonly capabilityId: string;
	readonly operation: DebugModelOperation;
	readonly providerId: string;
	readonly modelId: string;
	readonly phase: DebugModelCallPhase;
	readonly startedAt: number;
	readonly updatedAt: number;
	readonly completedAt?: number;
	readonly durationMs?: number;
	readonly request: DebugPayload;
	readonly response?: DebugPayload;
	readonly reasoning?: DebugPayload;
	readonly finishReason?: string;
	readonly metrics?: Readonly<Record<string, number>>;
	readonly error?: DebugModelCallError;
	readonly redaction: DebugSpanRedaction;
}

export interface StartDebugModelCallInput {
	readonly runId?: string;
	readonly surface: DebugSurface;
	readonly capabilityId: string;
	readonly operation: DebugModelOperation;
	readonly providerId: string;
	readonly modelId: string;
	readonly request: DebugPayloadInput;
}

export interface CompleteDebugModelCallInput {
	readonly response?: DebugPayloadInput;
	readonly reasoning?: DebugPayloadInput;
	readonly finishReason?: string;
	readonly metrics?: Readonly<Record<string, number>>;
}

// --------------------------------------------------------------------------
// Clock / id factory (mirrors the RunEnvelope shape so tests can share fakes)
// --------------------------------------------------------------------------

export interface DebugClock {
	now(): number;
}

export interface DebugIdFactory {
	next(): string;
}
