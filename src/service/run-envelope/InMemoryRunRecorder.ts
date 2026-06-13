// T3A RunEnvelope Core — per-instance in-memory recorder.
//
// One recorder records exactly one run. Every test, fixture, and (later)
// production caller new()'s its own; the recorder owns no module-level
// state and there is no `getInstance()`, no registry, no static cache.
// This is the foundation discipline T3 has to honor so the envelope does
// not turn into another global singleton like `CapabilityRegistry`.
//
// The recorder takes its clock and id factory at construction. This is
// the only way time and identifiers enter the recorder, so tests can drop
// in deterministic fakes and assert byte-exact event traces.

import type {
	ArtifactRef,
	ArtifactRefInput,
	FinalRunStatus,
	RunClock,
	RunEvent,
	RunIdFactory,
	RunSession,
	RunStatus,
	StartRunInput,
} from './types';

export interface InMemoryRunRecorderOptions {
	readonly clock: RunClock;
	readonly idFactory: RunIdFactory;
	/**
	 * Optional per-instance event sink. Invoked synchronously after each
	 * `RunEvent` is appended to the recorder's internal trace. The event
	 * passed to the sink is a fresh snapshot, so the sink can store or
	 * forward it without risking pollution of the recorder's internal
	 * state. T5 introduces this to feed live UI projection
	 * (`useVaultLintRunState`) without a global event bus or a subscribe
	 * API on the recorder — the sink is bound at construction and lives
	 * exactly as long as the recorder instance does.
	 */
	readonly onEvent?: (event: RunEvent) => void;
}

export class InMemoryRunRecorder {
	private readonly clock: RunClock;
	private readonly idFactory: RunIdFactory;
	private readonly onEvent: ((event: RunEvent) => void) | undefined;
	private session: RunSession | null = null;
	private readonly events: RunEvent[] = [];

	constructor(options: InMemoryRunRecorderOptions) {
		this.clock = options.clock;
		this.idFactory = options.idFactory;
		this.onEvent = options.onEvent;
	}

	/**
	 * Internal: append an event AND notify the per-instance sink with a
	 * snapshot copy. All `recordXxx` methods funnel through this so the
	 * sink is never bypassed.
	 */
	private appendAndEmit(event: RunEvent): void {
		this.events.push(event);
		if (this.onEvent === undefined) return;
		// Try/catch isolates the sink so a buggy listener cannot corrupt
		// the run trace or break the next record call. The internal trace
		// has already been updated by the time we get here.
		try {
			this.onEvent(this.snapshotEvent(event));
		} catch (e) {
			console.warn('[InMemoryRunRecorder] onEvent listener threw:', e);
		}
	}

	/**
	 * Begin a new run. The recorder mints `runId` from the id factory and
	 * stamps `startedAt` from the clock. Emits an initial `status` event
	 * with `status: 'queued'` so the event log is self-contained.
	 *
	 * Throws if called more than once on the same recorder: a recorder
	 * instance is single-run by design. Multi-run aggregation is T4+.
	 */
	start(input: StartRunInput): RunSession {
		if (this.session !== null) {
			throw new Error(
				'InMemoryRunRecorder.start: this recorder already owns a run. Construct a new recorder per run.',
			);
		}
		const runId = this.idFactory.next();
		const startedAt = this.clock.now();
		this.session = {
			runId,
			capabilityId: input.capabilityId,
			status: 'queued',
			trigger: input.trigger,
			startedAt,
		};
		this.appendAndEmit({
			type: 'status',
			runId,
			status: 'queued',
			ts: startedAt,
		});
		return this.snapshotSession();
	}

	/**
	 * Update the run's status (e.g. `'queued' -> 'running'`). The final
	 * statuses (`completed`/`failed`/`cancelled`) must go through
	 * `finish()` so `endedAt` is always set when the run ends.
	 */
	recordStatus(status: RunStatus, message?: string): void {
		const session = this.requireSession('recordStatus');
		if (status === 'completed' || status === 'failed' || status === 'cancelled') {
			throw new Error(
				`InMemoryRunRecorder.recordStatus: use finish('${status}') for terminal statuses; recordStatus is for intermediate transitions.`,
			);
		}
		session.status = status;
		this.appendAndEmit({
			type: 'status',
			runId: session.runId,
			status,
			...(message !== undefined ? { message } : {}),
			ts: this.clock.now(),
		});
	}

	recordProgress(progress: {
		phase: string;
		label?: string;
		processed?: number;
		total?: number;
	}): void {
		const session = this.requireSession('recordProgress');
		this.appendAndEmit({
			type: 'progress',
			runId: session.runId,
			phase: progress.phase,
			...(progress.label !== undefined ? { label: progress.label } : {}),
			...(progress.processed !== undefined ? { processed: progress.processed } : {}),
			...(progress.total !== undefined ? { total: progress.total } : {}),
			ts: this.clock.now(),
		});
	}

	/**
	 * Record an artifact reference. The recorder mints `artifactId`,
	 * stamps `runId` and `createdAt`, so callers can never produce a
	 * non-deterministic ArtifactRef. The artifact stored on the internal
	 * event and the artifact returned to the caller are separate object
	 * instances, so neither side can mutate the other's view.
	 */
	recordArtifact(input: ArtifactRefInput): ArtifactRef {
		const session = this.requireSession('recordArtifact');
		const createdAt = this.clock.now();
		const canonical: ArtifactRef = {
			artifactId: this.idFactory.next(),
			runId: session.runId,
			kind: input.kind,
			...(input.title !== undefined ? { title: input.title } : {}),
			...(input.uri !== undefined ? { uri: input.uri } : {}),
			...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
			createdAt,
		};
		this.appendAndEmit({
			type: 'artifact',
			runId: session.runId,
			artifact: this.snapshotArtifact(canonical),
			ts: createdAt,
		});
		return this.snapshotArtifact(canonical);
	}

	recordError(message: string, recoverable: boolean): void {
		const session = this.requireSession('recordError');
		this.appendAndEmit({
			type: 'error',
			runId: session.runId,
			message,
			recoverable,
			ts: this.clock.now(),
		});
	}

	recordLog(level: 'debug' | 'info' | 'warn', message: string): void {
		const session = this.requireSession('recordLog');
		this.appendAndEmit({
			type: 'log',
			runId: session.runId,
			level,
			message,
			ts: this.clock.now(),
		});
	}

	/**
	 * Terminal transition. Sets `session.status` and `session.endedAt`
	 * and emits a final `status` event. Calling `finish()` twice throws
	 * so a recorder cannot silently lose the second outcome.
	 */
	finish(final: FinalRunStatus): RunSession {
		const session = this.requireSession('finish');
		if (session.endedAt !== undefined) {
			throw new Error(
				`InMemoryRunRecorder.finish: run already finished with status '${session.status}'.`,
			);
		}
		const endedAt = this.clock.now();
		session.status = final;
		session.endedAt = endedAt;
		this.appendAndEmit({
			type: 'status',
			runId: session.runId,
			status: final,
			ts: endedAt,
		});
		return this.snapshotSession();
	}

	/** Immutable snapshot of the current session. */
	getSession(): RunSession {
		this.requireSession('getSession');
		return this.snapshotSession();
	}

	/**
	 * Read-only snapshot of all recorded events, in emission order. Each
	 * event in the returned array is a fresh clone, and for `artifact`
	 * events the nested `ArtifactRef` is cloned too, so a caller that
	 * mutates the returned structure cannot reach back into the
	 * recorder's internal trace.
	 */
	getEvents(): readonly RunEvent[] {
		return this.events.map((e) => this.snapshotEvent(e));
	}

	private requireSession(caller: string): RunSession {
		if (this.session === null) {
			throw new Error(
				`InMemoryRunRecorder.${caller}: no active run. Call start() first.`,
			);
		}
		return this.session;
	}

	private snapshotSession(): RunSession {
		const s = this.session!;
		return {
			runId: s.runId,
			capabilityId: s.capabilityId,
			status: s.status,
			trigger: s.trigger,
			startedAt: s.startedAt,
			...(s.endedAt !== undefined ? { endedAt: s.endedAt } : {}),
		};
	}

	private snapshotArtifact(a: ArtifactRef): ArtifactRef {
		return {
			artifactId: a.artifactId,
			runId: a.runId,
			kind: a.kind,
			...(a.title !== undefined ? { title: a.title } : {}),
			...(a.uri !== undefined ? { uri: a.uri } : {}),
			...(a.contentType !== undefined ? { contentType: a.contentType } : {}),
			createdAt: a.createdAt,
		};
	}

	private snapshotEvent(e: RunEvent): RunEvent {
		// The nested ArtifactRef on `artifact` events is the only
		// non-primitive field that survives a shallow clone, so it gets
		// its own snapshot pass. All other variants are plain primitive
		// records and a shallow spread suffices.
		if (e.type === 'artifact') {
			return { ...e, artifact: this.snapshotArtifact(e.artifact) };
		}
		return { ...e };
	}
}
