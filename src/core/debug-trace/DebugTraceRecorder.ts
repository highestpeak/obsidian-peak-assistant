// Debug Trace Recorder — in-memory implementation of DebugTracePort.
//
// Ownership rules (see docs/superpowers/refactor-ops/config-defaults-governance.md):
//   - The recorder is instance-owned. No module-level `let recorder = null`.
//   - Composition (AppContext or plugin bootstrap) constructs one recorder
//     and hands the port to consumers.
//
// Mode semantics:
//   - `off`  : `isEnabled()` returns false; `startRun` returns a no-op handle
//              so hot paths pay zero allocation. History listing returns [].
//   - `redacted` : payloads keep `excerpt + contentHash + length`, never `raw`.
//   - `raw`      : payloads keep `raw` but the redactor still scrubs secrets.
//
// Retention:
//   - `retention` is a ring buffer size. Finished runs push into the buffer;
//     when the buffer overflows the oldest run drops.
//   - `retention='session'` (unbounded until `clearAll`) is represented by
//     passing `Number.POSITIVE_INFINITY`.

import type {
	DebugClock,
	CompleteDebugModelCallInput,
	DebugDecision,
	DebugIdFactory,
	DebugModelCall,
	DebugPayload,
	DebugPayloadInput,
	DebugRedactionMode,
	DebugRun,
	DebugSpan,
	DebugSpanKind,
	DebugSpanRedaction,
	DebugSummary,
	DebugSurface,
	StartDebugRunInput,
	StartDebugModelCallInput,
	StartSpanInput,
} from './types';
import type { DebugModelCallHandle, DebugRunHandle, DebugSpanHandle, DebugTracePort } from './DebugTracePort';
import { defaultDebugClock, defaultDebugIdFactory, hashContent, makeExcerpt } from './helpers';
import { createDefaultRedactor, type PayloadRedactor } from './redactor';

export interface DebugTraceRecorderOptions {
	readonly mode?: DebugRedactionMode;
	readonly clock?: DebugClock;
	readonly idFactory?: DebugIdFactory;
	readonly redactor?: PayloadRedactor;
	/**
	 * Max finished runs kept in memory. Pass `Number.POSITIVE_INFINITY` for
	 * session-only retention.
	 */
	readonly retention?: number;
	/** Excerpt char cap. Default 240. */
	readonly excerptCap?: number;
	/** Test seam; production uses structured DevTools console records. */
	readonly logger?: Pick<Console, 'info' | 'error'>;
}

const DEFAULT_RETENTION = 20;
const DEFAULT_EXCERPT_CAP = 240;

export class DebugTraceRecorder implements DebugTracePort {
	private mode: DebugRedactionMode;
	private readonly clock: DebugClock;
	private readonly idFactory: DebugIdFactory;
	private readonly redactor: PayloadRedactor;
	private readonly excerptCap: number;
	private readonly logger: Pick<Console, 'info' | 'error'>;
	private retention: number;

	private readonly runs: DebugRun[] = [];
	private readonly activeModelCalls = new Map<string, ActiveModelCallHandle>();
	private readonly ignoredModelCallIds = new Set<string>();
	private readonly modelCalls: DebugModelCall[] = [];
	private readonly listeners = new Set<() => void>();

	constructor(opts: DebugTraceRecorderOptions = {}) {
		this.mode = opts.mode ?? 'redacted';
		this.clock = opts.clock ?? defaultDebugClock();
		this.idFactory = opts.idFactory ?? defaultDebugIdFactory('dbg');
		this.redactor = opts.redactor ?? createDefaultRedactor();
		this.retention = opts.retention ?? DEFAULT_RETENTION;
		this.excerptCap = opts.excerptCap ?? DEFAULT_EXCERPT_CAP;
		this.logger = opts.logger ?? console;
	}

	isEnabled(): boolean {
		return this.mode !== 'off';
	}

	currentMode(): DebugRedactionMode {
		return this.mode;
	}

	setMode(mode: DebugRedactionMode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		// A mode boundary is also a privacy boundary. Never let raw records
		// captured under the previous mode reappear in a safer mode.
		this.clearAll();
	}

	setRetention(retention: number): void {
		this.retention = retention;
		this.enforceRetention();
	}

	startRun(input: StartDebugRunInput): DebugRunHandle {
		if (this.mode === 'off') return new NoOpRunHandle();
		return new ActiveRunHandle({
			surface: input.surface,
			capabilityId: input.capabilityId,
			runId: input.runId ?? this.idFactory.next(),
			traceId: this.idFactory.next(),
			mode: this.mode === 'raw' ? 'raw' : 'redacted',
			clock: this.clock,
			idFactory: this.idFactory,
			redactor: this.redactor,
			excerptCap: this.excerptCap,
			summary: input.summary,
			onFinish: (run) => this.commit(run),
		});
	}

	startModelCall(input: StartDebugModelCallInput): DebugModelCallHandle {
		if (this.mode === 'off') return new NoOpModelCallHandle(input);
		const captureMode: DebugSpanRedaction = this.mode === 'raw' ? 'raw' : 'redacted';
		const call = new ActiveModelCallHandle({
			...input,
			callId: this.idFactory.next(),
			mode: captureMode,
			clock: this.clock,
			buildPayload: (payload) => this.buildPayload(payload, captureMode),
			onChange: (snapshot, terminal) => this.onModelCallChange(snapshot, terminal),
		});
		this.activeModelCalls.set(call.callId, call);
		this.logModelCall('request', call.snapshot());
		this.notify();
		return call;
	}

	listRecent(limit?: number): DebugRun[] {
		const n = limit ?? this.runs.length;
		const start = Math.max(0, this.runs.length - n);
		return this.runs.slice(start).reverse();
	}

	getRun(runId: string): DebugRun | undefined {
		for (let i = this.runs.length - 1; i >= 0; i -= 1) {
			if (this.runs[i]!.runId === runId) return this.runs[i];
		}
		return undefined;
	}

	listModelCalls(limit?: number): DebugModelCall[] {
		if (this.mode === 'off') return [];
		const active = Array.from(this.activeModelCalls.values(), (call) => call.snapshot());
		const all = [...active, ...this.modelCalls].sort((a, b) => b.updatedAt - a.updatedAt);
		return all.slice(0, limit ?? all.length).map(cloneModelCall);
	}

	getModelCall(callId: string): DebugModelCall | undefined {
		const active = this.activeModelCalls.get(callId);
		if (active) return cloneModelCall(active.snapshot());
		const found = this.modelCalls.find((call) => call.callId === callId);
		return found ? cloneModelCall(found) : undefined;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	clearAll(): void {
		this.runs.length = 0;
		this.modelCalls.length = 0;
		for (const callId of this.activeModelCalls.keys()) {
			this.ignoredModelCallIds.add(callId);
		}
		this.activeModelCalls.clear();
		this.notify();
	}

	private commit(run: DebugRun): void {
		this.runs.push(run);
		this.enforceRetention();
	}

	private enforceRetention(): void {
		if (!Number.isFinite(this.retention)) return;
		while (this.runs.length > this.retention) this.runs.shift();
		while (this.modelCalls.length > this.retention) this.modelCalls.shift();
	}

	private buildPayload(payload: DebugPayloadInput, mode: DebugSpanRedaction): DebugPayload {
		const rawInput = payload.raw ?? '';
		const { safe, hits } = this.redactor.redact(rawInput);
		const excerptSource = payload.excerpt ?? safe;
		return {
			excerpt: makeExcerpt(excerptSource, this.excerptCap),
			contentHash: hashContent(rawInput),
			length: rawInput.length,
			...(payload.contentType !== undefined ? { contentType: payload.contentType } : {}),
			...(mode === 'raw' ? { raw: safe } : {}),
			...(hits.length > 0 ? { redactionHits: hits } : {}),
		};
	}

	private onModelCallChange(snapshot: DebugModelCall, terminal: boolean): void {
		if (this.ignoredModelCallIds.has(snapshot.callId)) {
			if (terminal) this.ignoredModelCallIds.delete(snapshot.callId);
			return;
		}
		if (!terminal) {
			this.notify();
			return;
		}
		this.activeModelCalls.delete(snapshot.callId);
		this.modelCalls.push(cloneModelCall(snapshot));
		this.enforceRetention();
		this.logModelCall(snapshot.phase, snapshot);
		this.notify();
	}

	private logModelCall(event: string, call: DebugModelCall): void {
		const record = { event: `ai.${event}`, ...cloneModelCall(call) };
		if (call.phase === 'failed') {
			this.logger.error('[Peak AI Call]', record);
			return;
		}
		this.logger.info('[Peak AI Call]', record);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (error) {
				this.logger.error('[Peak AI Call] subscriber failed', error);
			}
		}
	}
}

interface ActiveModelCallHandleOptions extends StartDebugModelCallInput {
	callId: string;
	mode: DebugSpanRedaction;
	clock: DebugClock;
	buildPayload: (payload: DebugPayloadInput) => DebugPayload;
	onChange: (snapshot: DebugModelCall, terminal: boolean) => void;
}

class ActiveModelCallHandle implements DebugModelCallHandle {
	readonly callId: string;
	private readonly opts: ActiveModelCallHandleOptions;
	private readonly startedAt: number;
	private updatedAt: number;
	private phase: DebugModelCall['phase'] = 'request';
	private request: DebugPayload;
	private response: DebugPayload | undefined;
	private reasoning: DebugPayload | undefined;
	private completedAt: number | undefined;
	private finishReason: string | undefined;
	private metrics: Readonly<Record<string, number>> | undefined;
	private error: DebugModelCall['error'];

	constructor(opts: ActiveModelCallHandleOptions) {
		this.opts = opts;
		this.callId = opts.callId;
		this.startedAt = opts.clock.now();
		this.updatedAt = this.startedAt;
		this.request = opts.buildPayload(opts.request);
	}

	replaceRequest(payload: DebugPayloadInput): void {
		if (this.completedAt !== undefined) return;
		this.request = this.opts.buildPayload(payload);
		this.touch(false);
	}

	updateStream(input: { response?: DebugPayloadInput; reasoning?: DebugPayloadInput }): void {
		if (this.completedAt !== undefined) return;
		this.phase = 'streaming';
		if (input.response) this.response = this.opts.buildPayload(input.response);
		if (input.reasoning) this.reasoning = this.opts.buildPayload(input.reasoning);
		this.touch(false);
	}

	succeed(input: CompleteDebugModelCallInput = {}): DebugModelCall {
		return this.finish('response', input);
	}

	fail(error: unknown, input: CompleteDebugModelCallInput = {}): DebugModelCall {
		this.error = normalizeError(error);
		return this.finish('failed', input);
	}

	cancel(reason?: string): DebugModelCall {
		if (reason) this.error = { message: reason };
		return this.finish('cancelled', {});
	}

	snapshot(): DebugModelCall {
		return {
			version: 1,
			callId: this.callId,
			...(this.opts.runId ? { runId: this.opts.runId } : {}),
			surface: this.opts.surface,
			capabilityId: this.opts.capabilityId,
			operation: this.opts.operation,
			providerId: this.opts.providerId,
			modelId: this.opts.modelId,
			phase: this.phase,
			startedAt: this.startedAt,
			updatedAt: this.updatedAt,
			...(this.completedAt !== undefined
				? { completedAt: this.completedAt, durationMs: this.completedAt - this.startedAt }
				: {}),
			request: { ...this.request },
			...(this.response ? { response: { ...this.response } } : {}),
			...(this.reasoning ? { reasoning: { ...this.reasoning } } : {}),
			...(this.finishReason ? { finishReason: this.finishReason } : {}),
			...(this.metrics ? { metrics: { ...this.metrics } } : {}),
			...(this.error ? { error: { ...this.error } } : {}),
			redaction: this.opts.mode,
		};
	}

	private finish(phase: 'response' | 'failed' | 'cancelled', input: CompleteDebugModelCallInput): DebugModelCall {
		if (this.completedAt !== undefined) return this.snapshot();
		this.phase = phase;
		if (input.response) this.response = this.opts.buildPayload(input.response);
		if (input.reasoning) this.reasoning = this.opts.buildPayload(input.reasoning);
		this.finishReason = input.finishReason;
		this.metrics = input.metrics;
		this.completedAt = this.opts.clock.now();
		this.updatedAt = this.completedAt;
		const snapshot = this.snapshot();
		this.opts.onChange(snapshot, true);
		return snapshot;
	}

	private touch(terminal: boolean): void {
		this.updatedAt = this.opts.clock.now();
		this.opts.onChange(this.snapshot(), terminal);
	}
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

interface ActiveRunHandleOptions {
	surface: DebugSurface;
	capabilityId?: string;
	runId: string;
	traceId: string;
	mode: DebugSpanRedaction;
	clock: DebugClock;
	idFactory: DebugIdFactory;
	redactor: PayloadRedactor;
	excerptCap: number;
	summary?: DebugSummary;
	onFinish: (run: DebugRun) => void;
}

class ActiveRunHandle implements DebugRunHandle {
	readonly traceId: string;
	readonly runId: string;
	private readonly surface: DebugSurface;
	private readonly capabilityId?: string;
	private readonly mode: DebugSpanRedaction;
	private readonly clock: DebugClock;
	private readonly idFactory: DebugIdFactory;
	private readonly redactor: PayloadRedactor;
	private readonly excerptCap: number;
	private readonly startedAt: number;
	private endedAt: number | undefined;
	private status: 'running' | 'completed' | 'failed' | 'cancelled' = 'running';
	private readonly spans: DebugSpan[] = [];
	private summary: DebugSummary | undefined;
	private readonly onFinish: (run: DebugRun) => void;

	constructor(opts: ActiveRunHandleOptions) {
		this.traceId = opts.traceId;
		this.runId = opts.runId;
		this.surface = opts.surface;
		this.capabilityId = opts.capabilityId;
		this.mode = opts.mode;
		this.clock = opts.clock;
		this.idFactory = opts.idFactory;
		this.redactor = opts.redactor;
		this.excerptCap = opts.excerptCap;
		this.startedAt = opts.clock.now();
		this.summary = opts.summary;
		this.onFinish = opts.onFinish;
	}

	startSpan(input: StartSpanInput): DebugSpanHandle {
		return new ActiveSpanHandle({
			spanId: this.idFactory.next(),
			parentSpanId: input.parentSpanId,
			traceId: this.traceId,
			runId: this.runId,
			surface: this.surface,
			kind: input.kind,
			name: input.name,
			startedAt: this.clock.now(),
			mode: this.mode,
			clock: this.clock,
			idFactory: this.idFactory,
			redactor: this.redactor,
			excerptCap: this.excerptCap,
			onFinish: (span) => this.spans.push(span),
		});
	}

	mergeSummary(summary: DebugSummary): void {
		this.summary = { ...(this.summary ?? {}), ...summary };
	}

	finish(status: 'completed' | 'failed' | 'cancelled', summary?: DebugSummary): DebugRun {
		if (this.endedAt !== undefined) return this.snapshot();
		this.endedAt = this.clock.now();
		this.status = status;
		if (summary) this.mergeSummary(summary);
		const run = this.snapshot();
		this.onFinish(run);
		return run;
	}

	snapshot(): DebugRun {
		return {
			version: 1,
			traceId: this.traceId,
			runId: this.runId,
			surface: this.surface,
			...(this.capabilityId !== undefined ? { capabilityId: this.capabilityId } : {}),
			startedAt: this.startedAt,
			...(this.endedAt !== undefined ? { endedAt: this.endedAt } : {}),
			status: this.status,
			redactionMode: this.mode,
			spans: this.spans.map(cloneSpan),
			...(this.summary !== undefined ? { summary: { ...this.summary } } : {}),
		};
	}
}

interface ActiveSpanHandleOptions {
	spanId: string;
	parentSpanId?: string;
	traceId: string;
	runId: string;
	surface: DebugSurface;
	kind: DebugSpanKind;
	name: string;
	startedAt: number;
	mode: DebugSpanRedaction;
	clock: DebugClock;
	idFactory: DebugIdFactory;
	redactor: PayloadRedactor;
	excerptCap: number;
	onFinish: (span: DebugSpan) => void;
}

class ActiveSpanHandle implements DebugSpanHandle {
	readonly spanId: string;
	private readonly parentSpanId: string | undefined;
	private readonly traceId: string;
	private readonly runId: string;
	private readonly surface: DebugSurface;
	private readonly kind: DebugSpanKind;
	private readonly name: string;
	private readonly startedAt: number;
	private readonly mode: DebugSpanRedaction;
	private readonly clock: DebugClock;
	private readonly idFactory: DebugIdFactory;
	private readonly redactor: PayloadRedactor;
	private readonly excerptCap: number;
	private readonly onFinish: (span: DebugSpan) => void;

	private input: DebugPayload | undefined;
	private output: DebugPayload | undefined;
	private params: Record<string, unknown> | undefined;
	private metrics: Record<string, number> | undefined;
	private decisions: DebugDecision[] | undefined;
	private error: { message: string; stack?: string } | undefined;
	private finished = false;

	constructor(opts: ActiveSpanHandleOptions) {
		this.spanId = opts.spanId;
		this.parentSpanId = opts.parentSpanId;
		this.traceId = opts.traceId;
		this.runId = opts.runId;
		this.surface = opts.surface;
		this.kind = opts.kind;
		this.name = opts.name;
		this.startedAt = opts.startedAt;
		this.mode = opts.mode;
		this.clock = opts.clock;
		this.idFactory = opts.idFactory;
		this.redactor = opts.redactor;
		this.excerptCap = opts.excerptCap;
		this.onFinish = opts.onFinish;
	}

	setInput(payload: DebugPayloadInput): void {
		this.input = this.buildPayload(payload);
	}

	setOutput(payload: DebugPayloadInput): void {
		this.output = this.buildPayload(payload);
	}

	setParams(params: Record<string, unknown>): void {
		this.params = { ...params };
	}

	mergeParams(params: Record<string, unknown>): void {
		this.params = { ...(this.params ?? {}), ...params };
	}

	addMetric(key: string, value: number): void {
		this.metrics = { ...(this.metrics ?? {}), [key]: value };
	}

	addDecision(decision: DebugDecision): void {
		if (this.decisions === undefined) this.decisions = [];
		this.decisions.push({ ...decision });
	}

	setError(err: { message: string; stack?: string }): void {
		this.error = { ...err };
	}

	child(input: StartSpanInput): DebugSpanHandle {
		return new ActiveSpanHandle({
			spanId: this.idFactory.next(),
			parentSpanId: input.parentSpanId ?? this.spanId,
			traceId: this.traceId,
			runId: this.runId,
			surface: this.surface,
			kind: input.kind,
			name: input.name,
			startedAt: this.clock.now(),
			mode: this.mode,
			clock: this.clock,
			idFactory: this.idFactory,
			redactor: this.redactor,
			excerptCap: this.excerptCap,
			onFinish: this.onFinish,
		});
	}

	finish(): DebugSpan {
		if (this.finished) return this.snapshot();
		this.finished = true;
		const endedAt = this.clock.now();
		const span: DebugSpan = {
			spanId: this.spanId,
			...(this.parentSpanId !== undefined ? { parentSpanId: this.parentSpanId } : {}),
			traceId: this.traceId,
			runId: this.runId,
			surface: this.surface,
			kind: this.kind,
			name: this.name,
			startedAt: this.startedAt,
			endedAt,
			durationMs: endedAt - this.startedAt,
			...(this.input !== undefined ? { input: this.input } : {}),
			...(this.output !== undefined ? { output: this.output } : {}),
			...(this.params !== undefined ? { params: { ...this.params } } : {}),
			...(this.metrics !== undefined ? { metrics: { ...this.metrics } } : {}),
			...(this.decisions !== undefined
				? { decisions: this.decisions.map((d) => ({ ...d })) }
				: {}),
			redaction: this.mode,
			...(this.error !== undefined ? { error: { ...this.error } } : {}),
		};
		this.onFinish(span);
		return span;
	}

	private snapshot(): DebugSpan {
		return {
			spanId: this.spanId,
			...(this.parentSpanId !== undefined ? { parentSpanId: this.parentSpanId } : {}),
			traceId: this.traceId,
			runId: this.runId,
			surface: this.surface,
			kind: this.kind,
			name: this.name,
			startedAt: this.startedAt,
			endedAt: this.startedAt,
			durationMs: 0,
			redaction: this.mode,
		};
	}

	private buildPayload(payload: DebugPayloadInput): DebugPayload {
		const rawInput = payload.raw ?? '';
		const { safe, hits } = this.redactor.redact(rawInput);
		const excerpt =
			payload.excerpt !== undefined
				? makeExcerpt(payload.excerpt, this.excerptCap)
				: makeExcerpt(safe, this.excerptCap);
		return {
			excerpt,
			contentHash: hashContent(rawInput),
			length: rawInput.length,
			...(payload.contentType !== undefined ? { contentType: payload.contentType } : {}),
			// Only keep raw when in `raw` mode; even then, use the scrubbed
			// version so leaked secrets never land on disk / clipboard.
			...(this.mode === 'raw' ? { raw: safe } : {}),
			...(hits.length > 0 ? { redactionHits: hits } : {}),
		};
	}
}

// ---------------------------------------------------------------------------
// No-op handles for `off` mode. Return objects with the same shape but
// discard everything, so callers can conditionally-record without special-casing.
// ---------------------------------------------------------------------------

class NoOpRunHandle implements DebugRunHandle {
	readonly traceId = 'noop';
	readonly runId = 'noop';
	startSpan(): DebugSpanHandle {
		return new NoOpSpanHandle();
	}
	mergeSummary(): void {}
	finish(): DebugRun {
		return {
			version: 1,
			traceId: 'noop',
			runId: 'noop',
			surface: 'chat',
			startedAt: 0,
			status: 'cancelled',
			redactionMode: 'redacted',
			spans: [],
		};
	}
	snapshot(): DebugRun {
		return this.finish();
	}
}

class NoOpModelCallHandle implements DebugModelCallHandle {
	readonly callId = 'noop';
	private readonly input: StartDebugModelCallInput;

	constructor(input: StartDebugModelCallInput) {
		this.input = input;
	}

	replaceRequest(): void {}
	updateStream(): void {}
	succeed(): DebugModelCall { return this.snapshot(); }
	fail(): DebugModelCall { return this.snapshot(); }
	cancel(): DebugModelCall { return this.snapshot(); }
	snapshot(): DebugModelCall {
		return {
			version: 1,
			callId: 'noop',
			surface: this.input.surface,
			capabilityId: this.input.capabilityId,
			operation: this.input.operation,
			providerId: this.input.providerId,
			modelId: this.input.modelId,
			phase: 'cancelled',
			startedAt: 0,
			updatedAt: 0,
			request: { excerpt: '', contentHash: 'noop', length: 0 },
			redaction: 'redacted',
		};
	}
}

class NoOpSpanHandle implements DebugSpanHandle {
	readonly spanId = 'noop';
	setInput(): void {}
	setOutput(): void {}
	setParams(): void {}
	mergeParams(): void {}
	addMetric(): void {}
	addDecision(): void {}
	setError(): void {}
	child(): DebugSpanHandle {
		return this;
	}
	finish(): DebugSpan {
		return {
			spanId: 'noop',
			traceId: 'noop',
			runId: 'noop',
			surface: 'chat',
			kind: 'custom',
			name: 'noop',
			startedAt: 0,
			endedAt: 0,
			durationMs: 0,
			redaction: 'redacted',
		};
	}
}

function cloneSpan(span: DebugSpan): DebugSpan {
	return {
		...span,
		...(span.input !== undefined ? { input: { ...span.input } } : {}),
		...(span.output !== undefined ? { output: { ...span.output } } : {}),
		...(span.params !== undefined ? { params: { ...span.params } } : {}),
		...(span.metrics !== undefined ? { metrics: { ...span.metrics } } : {}),
		...(span.decisions !== undefined
			? { decisions: span.decisions.map((d) => ({ ...d })) }
			: {}),
	};
}

function cloneModelCall(call: DebugModelCall): DebugModelCall {
	return {
		...call,
		request: { ...call.request },
		...(call.response ? { response: { ...call.response } } : {}),
		...(call.reasoning ? { reasoning: { ...call.reasoning } } : {}),
		...(call.metrics ? { metrics: { ...call.metrics } } : {}),
		...(call.error ? { error: { ...call.error } } : {}),
	};
}

function normalizeError(error: unknown): { message: string; stack?: string } {
	if (error instanceof Error) {
		return {
			message: error.message,
			...(error.stack ? { stack: error.stack } : {}),
		};
	}
	return { message: String(error) };
}
