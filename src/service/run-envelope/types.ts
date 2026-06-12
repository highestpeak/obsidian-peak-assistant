// T3A RunEnvelope Core — type-only module.
//
// This file is intentionally pure types: no class, no function, no top-level
// statement, no imports. The companion test
// `test/run-envelope-core.test.ts` enforces those rules by source-string
// scan, so this is the source-of-truth shape for the run-envelope
// foundation.
//
// Vocabulary:
//   - `capabilityId` is the internal identifier from a capability contract
//     (e.g. T1's `VAULT_LINT_CAPABILITY_ID = 'vault.lint.scan'`). It is NOT
//     the same thing as `service/capabilities/SurfaceCapability.CapabilityName`
//     (`'Conversation'` / `'Research'` / ...), which is a Settings-facing
//     readiness label. The two namespaces stay separate on purpose.
//   - `runId` / `artifactId` are opaque identifiers minted by the recorder
//     via a caller-supplied `RunIdFactory` so tests can be byte-exact.
//   - `ts` is a number from a caller-supplied `RunClock.now()` so tests do
//     not depend on `Date.now()`.
//
// Out of scope for T3A (deliberate):
//   - No `ports?: TPorts` field on `RunSession`. Generic port plumbing is
//     deferred to T4, where the first real adopter (Vault Lint replacement)
//     gets to define what concrete ports the envelope needs. Adding the
//     field now would freeze a shape before we have evidence.
//   - No subscription / on / emit API. The recorder is pull-mode only
//     (`getSession()` / `getEvents()`). Event projection for UI is T7.
//   - No persistence of artifact bodies. `ArtifactRef` is a reference; the
//     body lives wherever the producing capability stores it.
//
// Retirement plan for `ProgressReporterPort.defaultReporter`:
//   - The module-level `defaultReporter` in
//     `src/service/ports/ProgressReporterPort.ts` is a T2 transitional
//     compromise. It will be retired once envelopes carry an explicit
//     `ports.progress` field in T4 and downstream capabilities resolve
//     their reporter from the envelope instead of the module global. T3A
//     deliberately does NOT introduce that field yet (see above). RunEnvelope
//     does not import `ProgressReporterPort` and never will at this layer.

export type RunStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled';

export type RunTrigger =
	| 'manual'
	| 'startup'
	| 'scheduled'
	| 'agent'
	| 'test';

/**
 * One concrete execution of a capability. `runId`, `capabilityId`,
 * `trigger`, and `startedAt` are identity fields and never change. `status`
 * and `endedAt` are updated by the recorder.
 */
export interface RunSession {
	readonly runId: string;
	readonly capabilityId: string;
	status: RunStatus;
	readonly trigger: RunTrigger;
	readonly startedAt: number;
	endedAt?: number;
}

/**
 * Reference to an artifact produced during a run. Pointer-only: the body
 * lives in the producing capability's own storage. Future tasks may add
 * provenance / signal fields, but T3A keeps this minimal so the envelope
 * itself does not become a Copilot-shaped record.
 */
export interface ArtifactRef {
	readonly artifactId: string;
	readonly runId: string;
	readonly kind: 'result' | 'report' | 'trace' | 'source' | 'diff' | 'file' | 'custom';
	readonly title?: string;
	readonly uri?: string;
	readonly contentType?: string;
	readonly createdAt: number;
}

/**
 * Discriminated union of everything the envelope can record about a run.
 * Adding a new event variant is a breaking change and should require
 * evidence from a real adopter (T4+), not speculative design.
 */
export type RunEvent =
	| {
			readonly type: 'status';
			readonly runId: string;
			readonly status: RunStatus;
			readonly message?: string;
			readonly ts: number;
	  }
	| {
			readonly type: 'progress';
			readonly runId: string;
			readonly phase: string;
			readonly label?: string;
			readonly processed?: number;
			readonly total?: number;
			readonly ts: number;
	  }
	| {
			readonly type: 'artifact';
			readonly runId: string;
			readonly artifact: ArtifactRef;
			readonly ts: number;
	  }
	| {
			readonly type: 'error';
			readonly runId: string;
			readonly message: string;
			readonly recoverable: boolean;
			readonly ts: number;
	  }
	| {
			readonly type: 'log';
			readonly runId: string;
			readonly level: 'debug' | 'info' | 'warn';
			readonly message: string;
			readonly ts: number;
	  };

/** Provider of monotonically increasing timestamps. Tests inject a fake. */
export interface RunClock {
	now(): number;
}

/**
 * Provider of opaque, run-stable identifiers (run ids, artifact ids).
 * Tests inject a fake that returns a deterministic sequence so event
 * traces compare byte-for-byte.
 */
export interface RunIdFactory {
	next(): string;
}

/** Input passed to `InMemoryRunRecorder.start`. */
export interface StartRunInput {
	readonly capabilityId: string;
	readonly trigger: RunTrigger;
}

/**
 * Final status that `finish()` accepts. `'queued'` and `'running'` are
 * deliberately excluded — finishing means the run is no longer in either
 * of those states.
 */
export type FinalRunStatus = 'completed' | 'failed' | 'cancelled';

/**
 * Input passed to `InMemoryRunRecorder.recordArtifact`. The recorder mints
 * `artifactId`, `runId`, and `createdAt` so callers cannot accidentally
 * produce non-deterministic artifact refs.
 */
export type ArtifactRefInput = Omit<ArtifactRef, 'artifactId' | 'runId' | 'createdAt'>;
