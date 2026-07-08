// Public barrel for the debug-trace core module.

export type {
	DebugSurface,
	DebugSpanKind,
	DebugRedactionMode,
	DebugSpanRedaction,
	DebugPayload,
	DebugPayloadInput,
	DebugRedactionHit,
	DebugDecision,
	DebugDecisionKind,
	DebugSpan,
	DebugRun,
	DebugRunStatus,
	DebugSummary,
	StartDebugRunInput,
	StartSpanInput,
	DebugClock,
	DebugIdFactory,
} from './types';

export type {
	DebugTracePort,
	DebugRunHandle,
	DebugSpanHandle,
} from './DebugTracePort';

export { DebugTraceRecorder } from './DebugTraceRecorder';
export type { DebugTraceRecorderOptions } from './DebugTraceRecorder';

export { defaultDebugClock, defaultDebugIdFactory, hashContent, makeExcerpt } from './helpers';
export { createDefaultRedactor, createNoOpRedactor } from './redactor';
export type { PayloadRedactor } from './redactor';

export { formatDebugRun } from './DebugTraceFormatter';
export type { DebugFormatterOptions } from './DebugTraceFormatter';
